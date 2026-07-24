const state = {
  user: null,
  csrf: null,
  section: "dashboard",
  products: [],
  inventory: [],
  inventoryProducts: [],
  users: [],
  cashSessions: [],
  terminals: [],
  cart: new Map(),
  clockTimer: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateTime = new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Panama" });
const dateOnly = new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeZone: "America/Panama" });
const roleNames = { admin: "Administrador", supervisor: "Supervisor", cashier: "Cajero" };
const sectionNames = { dashboard: "Resumen", pos: "Punto de venta", inventory: "Inventario", cash: "Cajas", reports: "Reportes", workforce: "Personal", payroll: "Planilla", users: "Usuarios" };
const unitNames = { unit: "unidad", bottle: "botella", ml: "ml", liter: "litro", gram: "g", kg: "kg", portion: "porción" };
const quantityNumber = new Intl.NumberFormat("es-PA", { maximumFractionDigits: 4 });
const panamaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("is-error", error);
  element.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("is-visible"), 3200);
}

async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && state.csrf) headers["X-CSRF-Token"] = state.csrf;
  const requested = new URL(path, window.location.origin);
  const endpoint = new URL("index.php", document.baseURI);
  endpoint.searchParams.set("api_path", requested.pathname.replace(/^\/api\/?/, ""));
  requested.searchParams.forEach((value, key) => endpoint.searchParams.append(key, value));
  const response = await fetch(endpoint, {
    credentials: "same-origin",
    ...options,
    headers
  });
  if (response.status === 401 && !requested.pathname.endsWith('/auth/login')) {
    showLogin();
    throw new Error("La sesión expiró.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "No fue posible completar la operación.");
  }
  return response.status === 204 ? null : response.json();
}

function showLogin() {
  state.user = null;
  state.csrf = null;
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
  $("#app-view").classList.remove("is-pos-mode");
  clearInterval(state.clockTimer);
}

function showApp(user, csrf = state.csrf) {
  state.user = user;
  state.csrf = csrf;
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#user-name").textContent = user.fullName;
  $("#user-role").textContent = roleNames[user.role];
  $("#pos-user-name").textContent = user.fullName;
  $$('[data-roles]').forEach((element) => {
    element.hidden = !element.dataset.roles.split(",").includes(user.role);
  });
  navigate("dashboard");
}

async function initialize() {
  const today = panamaDate();
  $("#report-filter [name=anchor]").value = today;
  $("#hours-filter [name=end]").value = today;
  $("#hours-filter [name=start]").value = `${today.slice(0, 8)}01`;
  try {
    const { user, csrf } = await api("/api/auth/me");
    showApp(user, csrf);
  } catch {
    showLogin();
  }
}

async function navigate(section) {
  const button = $(`#main-nav [data-section="${section}"]`);
  if (!button || button.hidden) return;
  state.section = section;
  $("#app-view").classList.toggle("is-pos-mode", section === "pos");
  $$(".page-section").forEach((page) => { page.hidden = page.id !== `section-${section}`; });
  $$("#main-nav button").forEach((navButton) => navButton.removeAttribute("aria-current"));
  button.setAttribute("aria-current", "page");
  $("#section-title").textContent = sectionNames[section];
  $("#workspace").focus({ preventScroll: true });
  $(".sidebar").classList.remove("is-open");
  $("#menu-button").setAttribute("aria-expanded", "false");
  try {
    const loaders = { dashboard: loadDashboard, pos: loadPos, inventory: loadInventory, cash: loadCash, reports: loadReports, workforce: loadWorkforce, payroll: loadPayroll, users: loadUsers };
    await loaders[section]?.();
  } catch (error) {
    toast(error.message, true);
  }
}

function kpi(label, value, detail = "") {
  return `<article class="kpi"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(detail)}</span></article>`;
}

function ownOpenSession() {
  return state.cashSessions.find((session) => session.status === "open" && Number(session.openedById) === Number(state.user.id));
}

async function loadDashboard() {
  const [salesData, cashData, clockData] = await Promise.all([
    api("/api/pos/sales?limit=6"),
    api("/api/cash/sessions"),
    api("/api/workforce/clock")
  ]);
  state.cashSessions = cashData.sessions;
  const openSession = ownOpenSession();
  let lowStock = [];
  if (state.user.role !== "cashier") {
    const [reportData, lowData] = await Promise.all([api(`/api/reports/summary?period=daily&anchor=${panamaDate()}`), api("/api/reports/low-stock")]);
    lowStock = lowData.items;
    $("#dashboard-kpis").innerHTML = [
      kpi("Venta de hoy", money.format(reportData.summary.grossSales || 0), `${reportData.summary.transactions || 0} transacciones`),
      kpi("Ganancia estimada", money.format(reportData.summary.profit || 0), "Venta menos costo"),
      kpi("Caja", openSession ? "Abierta" : "Cerrada", openSession ? openSession.terminalName : "Sin sesión activa"),
      kpi("Stock bajo", String(lowStock.length), lowStock.length ? "Requiere atención" : "Inventario estable")
    ].join("");
  } else {
    const total = salesData.sales.filter((sale) => sale.status === "completed").reduce((sum, sale) => sum + Number(sale.total), 0);
    $("#dashboard-kpis").innerHTML = [
      kpi("Mis ventas recientes", money.format(total), `${salesData.sales.length} registros`),
      kpi("Caja", openSession ? "Abierta" : "Cerrada", openSession ? openSession.terminalName : "Debe abrir una caja"),
      kpi("Jornada", clockData.openEntry ? "En curso" : "Sin marcar", clockData.openEntry ? dateTime.format(new Date(clockData.openEntry.clockIn)) : "Registre su entrada")
    ].join("");
  }
  $("#recent-sales").innerHTML = salesData.sales.length ? salesData.sales.map((sale) => `
    <div class="list-row"><div><strong>${escapeHtml(sale.receipt)}</strong><small>${escapeHtml(sale.cashier)} · ${dateTime.format(new Date(sale.createdAt))}</small></div><div><strong>${money.format(sale.total)}</strong><small>${escapeHtml(sale.status)}</small></div></div>`).join("") : '<p class="empty-state">Todavía no hay ventas registradas.</p>';
  const statusRows = [
    { label: "Caja", value: openSession ? `${openSession.terminalName} abierta` : "Sin caja abierta", ok: Boolean(openSession) },
    { label: "Jornada", value: clockData.openEntry ? "Marcación activa" : "Sin marcación activa", ok: Boolean(clockData.openEntry) }
  ];
  if (state.user.role !== "cashier") statusRows.push({ label: "Inventario", value: lowStock.length ? `${lowStock.length} artículos en mínimo` : "Niveles estables", ok: !lowStock.length });
  $("#operational-status").innerHTML = statusRows.map((row) => `<div class="list-row"><strong>${escapeHtml(row.label)}</strong><span class="badge ${row.ok ? "badge--success" : "badge--danger"}">${escapeHtml(row.value)}</span></div>`).join("");
}

async function loadPos() {
  const [{ products }, { sessions }] = await Promise.all([api("/api/pos/products"), api("/api/cash/sessions")]);
  state.products = products;
  state.cashSessions = sessions;
  const open = ownOpenSession();
  $("#pos-session-label").textContent = open ? `${open.terminalName} · Abierta` : "Caja cerrada";
  $("#pos-session-label").className = `status-pill ${open ? "badge--success" : "badge--danger"}`;
  const categories = [...new Set(products.map((product) => product.category))];
  $("#product-category").innerHTML = '<option value="">Todas las categorías</option>' + categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("");
  renderProducts();
  renderCart();
}

function productIcon(product) {
  const value = `${product.category} ${product.name}`.toLowerCase();
  if (/cerveza|beer|balboa|atlas|panam/.test(value)) return "🍺";
  if (/champagne|espumante|prosecco/.test(value)) return "🍾";
  if (/vino|wine/.test(value)) return "🍷";
  if (/whisky|whiskey|ron|rum|brandy|cognac/.test(value)) return "🥃";
  if (/vodka|gin|ginebra|tequila|mezcal|licor/.test(value)) return "🍸";
  if (/cocktail|cóctel|signature|martini|negroni/.test(value)) return "🍹";
  if (/agua|soda|refresco|jugo|energy|red bull/.test(value)) return "🥤";
  if (/comida|bite|tarta|jamón|queso|chocolate/.test(value)) return "🍽️";
  return "✦";
}

function renderProducts() {
  const query = $("#product-search").value.trim().toLowerCase();
  const category = $("#product-category").value;
  const products = state.products.filter((product) => Number(product.available) > 0 && (!category || product.category === category) && (!query || `${product.name} ${product.sku} ${product.barcode || ""}`.toLowerCase().includes(query)));
  $("#product-grid").innerHTML = products.length ? products.map((product) => `
    <button class="product-card" data-product-id="${product.id}" aria-label="Agregar ${escapeHtml(product.name)}, ${money.format(product.salePrice)}">
      <span class="product-icon" aria-hidden="true">${productIcon(product)}</span>
      <small>${escapeHtml(product.category)} · <span class="product-stock">${Math.floor(product.available)} disponibles</span></small>
      <strong>${escapeHtml(product.name)}</strong><span class="product-price">${money.format(product.salePrice)}</span>
    </button>`).join("") : '<p class="empty-state">No hay productos disponibles con este filtro.</p>';
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const current = state.cart.get(productId) || 0;
  if (current + 1 > product.available) return toast("No hay más existencias disponibles.", true);
  state.cart.set(productId, current + 1);
  renderCart();
}

function cartTotals() {
  let subtotal = 0;
  let tax = 0;
  for (const [productId, quantity] of state.cart) {
    const product = state.products.find((item) => item.id === productId);
    subtotal += Number(product.salePrice) * quantity;
    tax += Number(product.salePrice) * quantity * Number(product.taxRate);
  }
  return { subtotal, tax, total: subtotal + tax };
}

function renderCart() {
  const lines = [...state.cart.entries()];
  $("#cart-lines").innerHTML = lines.length ? lines.map(([productId, quantity]) => {
    const product = state.products.find((item) => item.id === productId);
    return `<div class="cart-line"><div><strong>${escapeHtml(product.name)}</strong><small>${money.format(product.salePrice)}</small></div><div class="quantity-control"><button data-cart-change="-1" data-product-id="${productId}" aria-label="Restar">−</button><span>${quantity}</span><button data-cart-change="1" data-product-id="${productId}" aria-label="Sumar">+</button></div><strong>${money.format(product.salePrice * quantity)}</strong></div>`;
  }).join("") : '<p class="empty-state">Seleccione productos para iniciar la orden.</p>';
  const totals = cartTotals();
  $("#cart-subtotal").textContent = money.format(totals.subtotal);
  $("#cart-tax").textContent = money.format(totals.tax);
  $("#cart-total").textContent = money.format(totals.total);
  const open = ownOpenSession();
  $("#complete-sale").disabled = !lines.length || !open;
}

async function completeSale() {
  const open = ownOpenSession();
  if (!open) return toast("Debe abrir una caja antes de vender.", true);
  const totals = cartTotals();
  const method = $("#payment-method").value;
  $("#complete-sale").disabled = true;
  try {
    const sale = await api("/api/pos/sales", {
      method: "POST",
      body: JSON.stringify({
        cashSessionId: open.id,
        discount: 0,
        items: [...state.cart].map(([productId, quantity]) => ({ productId, quantity })),
        payments: [{ method, amount: Number(totals.total.toFixed(2)), reference: $("#payment-reference").value || null }]
      })
    });
    state.cart.clear();
    $("#payment-reference").value = "";
    $("#pos-message").textContent = `${sale.receipt} · ${money.format(sale.total)}`;
    toast("Venta completada e inventario actualizado.");
    await loadPos();
  } catch (error) {
    $("#pos-message").textContent = error.message;
    toast(error.message, true);
    renderCart();
  }
}

async function loadInventory() {
  const [{ items }, { products }] = await Promise.all([
    api("/api/inventory/items"),
    api("/api/inventory/products")
  ]);
  state.inventory = items;
  state.inventoryProducts = products;
  renderInventory();
  $$(".recipe-row", $("#recipe-rows")).forEach((row) => updateInventoryRow(row, "recipe"));
  $$(".recipe-row", $("#purchase-rows")).forEach((row) => updateInventoryRow(row, "purchase"));
}

function renderInventory() {
  const query = $("#inventory-search").value.trim().toLowerCase();
  const items = state.inventory.filter((item) => `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(query));
  $("#inventory-summary").textContent = `${items.length} artículos · ${state.inventory.filter((item) => Number(item.lowStock) === 1).length} en mínimo`;
  $("#inventory-table").innerHTML = items.map((item) => {
    const lowStock = Number(item.lowStock) === 1;
    return `<tr>
      <td>${escapeHtml(item.sku)}</td>
      <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}</small></td>
      <td><strong>${escapeHtml(item.packageName)}</strong><small>1 ${escapeHtml(item.packageName)} = ${quantityNumber.format(item.unitsPerPackage)} ${escapeHtml(unitNames[item.unit] || item.unit)}</small></td>
      <td><strong>${quantityNumber.format(item.currentStock)} ${escapeHtml(unitNames[item.unit] || item.unit)}</strong><small>${quantityNumber.format(item.packageStock)} presentaciones equivalentes</small></td>
      <td>${quantityNumber.format(item.minimumStock)} ${escapeHtml(unitNames[item.unit] || item.unit)}</td>
      <td><strong>${money.format(item.packageCost)} / presentación</strong><small>${money.format(item.averageCost)} / ${escapeHtml(unitNames[item.unit] || item.unit)}</small></td>
      <td><span class="badge ${lowStock ? "badge--danger" : "badge--success"}">${lowStock ? "Bajo" : "Normal"}</span></td>
      <td><button class="table-action" data-adjust-id="${item.id}">Ajustar</button></td>
    </tr>`;
  }).join("") || '<tr><td colspan="8" class="empty-state">No hay artículos físicos registrados.</td></tr>';

  $("#products-summary").textContent = `${state.inventoryProducts.length} productos`;
  $("#inventory-products-table").innerHTML = state.inventoryProducts.map((product) => {
    const recipe = product.recipe.length
      ? `<ul class="recipe-summary">${product.recipe.map((component) => `<li><strong>${quantityNumber.format(component.quantity)} ${escapeHtml(unitNames[component.unit] || component.unit)}</strong> de ${escapeHtml(component.name)}</li>`).join("")}</ul>`
      : '<span class="badge badge--danger">Sin composición</span>';
    const active = Number(product.active) === 1;
    return `<tr><td>${escapeHtml(product.sku)}</td><td><strong>${escapeHtml(product.name)}</strong>${product.barcode ? `<small>${escapeHtml(product.barcode)}</small>` : ""}</td><td>${escapeHtml(product.category)}</td><td>${money.format(product.salePrice)}</td><td>${recipe}</td><td><span class="badge ${active ? "badge--success" : "badge--danger"}">${active ? "Activo" : "Inactivo"}</span></td></tr>`;
  }).join("") || '<tr><td colspan="6" class="empty-state">No hay productos de venta registrados.</td></tr>';
}

function inventoryOptions() {
  return state.inventory.length
    ? state.inventory.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.packageName)} de ${quantityNumber.format(item.unitsPerPackage)} ${escapeHtml(unitNames[item.unit] || item.unit)}</option>`).join("")
    : '<option value="">Primero cree un artículo físico</option>';
}

function selectedInventoryItem(row) {
  return state.inventory.find((item) => item.id === Number($("[name=itemId]", row)?.value));
}

function updateInventoryRow(row, kind, resetPresentation = false) {
  const item = selectedInventoryItem(row);
  const hint = $("[data-conversion-hint]", row);
  if (!hint) return;
  if (!item) {
    hint.textContent = "Seleccione un artículo físico.";
    return;
  }
  const unit = unitNames[item.unit] || item.unit;
  if (kind === "recipe") {
    hint.textContent = `Se descontará en ${unit}. Ejemplo: 1 ${unit} o 50 ml por cada venta.`;
    return;
  }
  if (resetPresentation) {
    $("[name=packageName]", row).value = item.packageName;
    $("[name=unitsPerPackage]", row).value = item.unitsPerPackage;
  }
  const packageName = $("[name=packageName]", row).value || item.packageName;
  const unitsPerPackage = Number($("[name=unitsPerPackage]", row).value || item.unitsPerPackage);
  hint.textContent = `1 ${packageName} agrega ${quantityNumber.format(unitsPerPackage)} ${unit} al inventario.`;
}

function addRecipeRow(kind) {
  const container = kind === "recipe" ? $("#recipe-rows") : $("#purchase-rows");
  const row = document.createElement("div");
  row.className = `recipe-row recipe-row--${kind}`;
  row.innerHTML = kind === "recipe"
    ? `<label>Artículo físico<select name="itemId" required>${inventoryOptions()}</select></label><label>Cantidad por cada venta<input name="quantity" type="number" min="0.0001" step="0.0001" required><small class="field-hint" data-conversion-hint></small></label><button type="button" class="text-button" data-remove-row>Eliminar</button>`
    : `<label>Artículo físico<select name="itemId" required>${inventoryOptions()}</select><small class="field-hint" data-conversion-hint></small></label><label>Presentación recibida<input name="packageName" list="purchase-package-names" maxlength="80" required></label><label>Contenido por presentación<input name="unitsPerPackage" type="number" min="0.0001" step="0.0001" required></label><label>Cantidad de presentaciones<input name="packageQuantity" type="number" min="0.0001" step="0.001" required></label><label>Costo por presentación<input name="packageCost" type="number" min="0" step="0.0001" required></label><button type="button" class="text-button" data-remove-row>Eliminar</button>`;
  container.append(row);
  updateInventoryRow(row, kind, true);
}

function collectRows(containerSelector) {
  return $$(".recipe-row", $(containerSelector)).map((row) => ({
    itemId: Number($("[name=itemId]", row).value),
    ...($("[name=quantity]", row) ? { quantity: Number($("[name=quantity]", row).value) } : {}),
    ...($("[name=packageName]", row) ? { packageName: $("[name=packageName]", row).value } : {}),
    ...($("[name=unitsPerPackage]", row) ? { unitsPerPackage: Number($("[name=unitsPerPackage]", row).value) } : {}),
    ...($("[name=packageQuantity]", row) ? { packageQuantity: Number($("[name=packageQuantity]", row).value) } : {}),
    ...($("[name=packageCost]", row) ? { packageCost: Number($("[name=packageCost]", row).value) } : {})
  }));
}

const itemPackagePresets = {
  unit: { packageName: "Unidad", unit: "unit", unitsPerPackage: 1 },
  six: { packageName: "Six-pack de 6", unit: "unit", unitsPerPackage: 6 },
  "half-case": { packageName: "Media caja de 12", unit: "unit", unitsPerPackage: 12 },
  "case-24": { packageName: "Caja de 24", unit: "unit", unitsPerPackage: 24 },
  "bottle-750": { packageName: "Botella de 750 ml", unit: "ml", unitsPerPackage: 750 },
  "bottle-1000": { packageName: "Botella de 1 L", unit: "ml", unitsPerPackage: 1000 }
};
const purchasePackageSizes = {
  "Unidad": 1,
  "Six-pack de 6": 6,
  "Media caja de 12": 12,
  "Caja de 24": 24,
  "Botella de 750 ml": 750,
  "Botella de 1 L": 1000
};

function updateItemStockPreview() {
  const form = $("#new-item-form");
  const packages = Number(form.elements.initialPackages.value || 0);
  const unitsPerPackage = Number(form.elements.unitsPerPackage.value || 0);
  const packageCost = Number(form.elements.packageCost.value || 0);
  const unit = unitNames[form.elements.unit.value] || form.elements.unit.value;
  const stock = packages * unitsPerPackage;
  const unitCost = unitsPerPackage > 0 ? packageCost / unitsPerPackage : 0;
  $("#item-stock-preview").textContent = `${quantityNumber.format(packages)} presentaciones × ${quantityNumber.format(unitsPerPackage)} ${unit} = ${quantityNumber.format(stock)} ${unit} en inventario · costo ${money.format(unitCost)} por ${unit}.`;
}

function applyItemPackagePreset() {
  const form = $("#new-item-form");
  const preset = itemPackagePresets[form.elements.packagePreset.value];
  if (preset) {
    form.elements.packageName.value = preset.packageName;
    form.elements.unit.value = preset.unit;
    form.elements.unitsPerPackage.value = preset.unitsPerPackage;
  }
  updateItemStockPreview();
}

function openInventoryForm(id) {
  ["new-item-form", "new-product-form", "purchase-form"].forEach((formId) => {
    document.getElementById(formId).hidden = formId !== id;
  });
}

async function loadCash() {
  const [{ terminals }, { sessions }] = await Promise.all([api("/api/cash/terminals"), api("/api/cash/sessions")]);
  state.terminals = terminals;
  state.cashSessions = sessions;
  $("#terminal-select").innerHTML = terminals.map((terminal) => `<option value="${terminal.id}">${escapeHtml(terminal.name)}</option>`).join("");
  const open = ownOpenSession();
  const openButton = $("#open-cash-form button[type=submit]");
  openButton.disabled = terminals.length < 1;
  if (!terminals.length) $("#terminal-select").innerHTML = '<option value="">No tiene una caja asignada</option>';
  $("#open-cash-form").hidden = Boolean(open);
  $("#current-cash-session").innerHTML = open ? `<div class="list-row"><div><strong>${escapeHtml(open.terminalName)}</strong><small>Abierta ${dateTime.format(new Date(open.openedAt))}</small></div><button class="button button--ghost" data-close-session="${open.id}">Cerrar caja</button></div>` : '<p class="empty-state">No hay una caja abierta.</p>';
  $("#cash-table").innerHTML = sessions.map((session) => `<tr><td><strong>${escapeHtml(session.terminalName)}</strong></td><td>${escapeHtml(session.openedBy)}</td><td>${dateTime.format(new Date(session.openedAt))}</td><td>${session.expectedCash == null ? "—" : money.format(session.expectedCash)}</td><td>${session.countedCash == null ? "—" : money.format(session.countedCash)}</td><td>${session.cashDifference == null ? "—" : money.format(session.cashDifference)}</td><td><span class="badge ${session.status === "open" ? "badge--success" : "badge--gold"}">${session.status === "open" ? "Abierta" : "Cerrada"}</span></td></tr>`).join("");
  renderCart();
}

async function loadReports(event) {
  event?.preventDefault();
  const form = new FormData($("#report-filter"));
  const data = await api(`/api/reports/summary?period=${encodeURIComponent(form.get("period"))}&anchor=${encodeURIComponent(form.get("anchor"))}`);
  $("#report-kpis").innerHTML = [kpi("Venta", money.format(data.summary.grossSales || 0), `${data.summary.transactions || 0} transacciones`), kpi("Costo", money.format(data.summary.cost || 0), "Costo estimado de recetas"), kpi("Ganancia", money.format(data.summary.profit || 0), "Antes de gastos"), kpi("Inventario", money.format(data.inventory.inventoryValue || 0), `${data.inventory.lowStockCount || 0} artículos bajos`)].join("");
  $("#top-products-table").innerHTML = data.topProducts.map((product) => `<tr><td><strong>${escapeHtml(product.name)}</strong></td><td>${Number(product.quantity).toFixed(2)}</td><td>${money.format(product.total)}</td></tr>`).join("") || '<tr><td colspan="3">Sin ventas en el período.</td></tr>';
  $("#payment-summary").innerHTML = data.payments.map((payment) => `<div class="metric-row"><span>${escapeHtml(payment.method)}</span><strong>${money.format(payment.amount)}</strong></div>`).join("") || '<p class="empty-state">Sin pagos en el período.</p>';
}

async function loadWorkforce(event) {
  event?.preventDefault();
  const [clock, hours] = await Promise.all([api("/api/workforce/clock"), loadHours()]);
  renderClock(clock);
  return hours;
}

function renderClock(clock) {
  clearInterval(state.clockTimer);
  if (!clock.employee) {
    $("#clock-status").innerHTML = '<p class="empty-state">Su usuario todavía no está vinculado a un empleado.</p>';
    return;
  }
  if (clock.openEntry) {
    const update = () => {
      const elapsed = Date.now() - new Date(clock.openEntry.clockIn).getTime();
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      $("#clock-status").innerHTML = `<span class="badge badge--success">Jornada activa</span><strong class="clock-time">${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}</strong><small>Entrada: ${dateTime.format(new Date(clock.openEntry.clockIn))}</small><button class="button button--primary" data-clock="out">Marcar salida</button>`;
    };
    update();
    state.clockTimer = setInterval(update, 30000);
  } else {
    $("#clock-status").innerHTML = '<span class="badge">Sin jornada activa</span><button class="button button--primary" data-clock="in">Marcar entrada</button>';
  }
}

async function loadHours() {
  const form = new FormData($("#hours-filter"));
  const data = await api(`/api/workforce/hours?start=${encodeURIComponent(form.get("start"))}&end=${encodeURIComponent(form.get("end"))}`);
  $("#hours-table").innerHTML = data.entries.map((entry) => `<tr><td><strong>${escapeHtml(entry.employeeName)}</strong></td><td>${dateTime.format(new Date(entry.clockIn))}</td><td>${entry.clockOut ? dateTime.format(new Date(entry.clockOut)) : "—"}</td><td>${entry.breakMinutes} min</td><td>${entry.hours == null ? "—" : Number(entry.hours).toFixed(2)}</td><td><span class="badge ${entry.status === "approved" ? "badge--success" : "badge--gold"}">${escapeHtml(entry.status)}</span></td><td>${state.user.role !== "cashier" && entry.status === "submitted" ? `<button class="table-action" data-approve-hours="${entry.id}">Aprobar</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="7">No hay marcaciones en el período.</td></tr>';
  return data;
}

async function loadPayroll() {
  const { periods } = await api("/api/payroll/periods");
  $("#payroll-table").innerHTML = periods.map((period) => `<tr><td><strong>${dateOnly.format(new Date(period.startsOn))}</strong> — ${dateOnly.format(new Date(period.endsOn))}</td><td>${period.type === "biweekly" ? "Quincenal" : "Mensual"}</td><td>${money.format(period.grossTotal)}</td><td>${money.format(period.netTotal)}</td><td><span class="badge badge--gold">${escapeHtml(period.status)}</span></td><td><button class="table-action" data-payroll-view="${period.id}">Ver</button>${["draft", "calculated"].includes(period.status) ? ` <button class="table-action" data-payroll-calculate="${period.id}">Calcular</button>` : ""}${period.status === "calculated" ? ` <button class="table-action" data-payroll-approve="${period.id}">Aprobar</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="6">No hay períodos creados.</td></tr>';
}

async function viewPayroll(periodId) {
  const { entries } = await api(`/api/payroll/periods/${periodId}/entries`);
  $("#payroll-detail").hidden = false;
  $("#payroll-detail-table").innerHTML = entries.map((entry) => `<tr><td><strong>${escapeHtml(entry.employeeName)}</strong></td><td>${Number(entry.regularHours).toFixed(2)}</td><td>${Number(entry.overtimeHours).toFixed(2)}</td><td>${money.format(entry.basePay)}</td><td>${money.format(entry.overtimePay)}</td><td>${money.format(entry.bonuses)}</td><td>${money.format(entry.deductions)}</td><td><strong>${money.format(entry.netPay)}</strong></td></tr>`).join("") || '<tr><td colspan="8">Calcule la planilla para generar los registros.</td></tr>';
}

async function loadUsers() {
  const { users } = await api("/api/users");
  state.users = users;
  $("#users-table").innerHTML = users.map((user) => `<tr><td><strong>${escapeHtml(user.fullName)}</strong><small>${escapeHtml(user.employeeCode || "Sin código")}</small></td><td>${escapeHtml(user.username)}</td><td><span class="badge badge--gold">${escapeHtml(roleNames[user.role])}</span></td><td>${user.payType ? `${user.payType === "biweekly" ? "Quincenal" : "Por hora"} · ${money.format(user.hourlyRate || 0)}/h` : "Sin planilla"}</td><td>${escapeHtml(user.terminalName || "Sin caja")}</td><td>${user.lastLoginAt ? dateTime.format(new Date(user.lastLoginAt)) : "Nunca"}</td><td><span class="badge ${user.status === "active" ? "badge--success" : "badge--danger"}">${escapeHtml(user.status)}</span></td><td><button class="table-action" data-edit-user="${user.id}">Editar</button></td></tr>`).join("");
}

function openUserEditor(userId) {
  const user = state.users.find((item) => Number(item.id) === Number(userId));
  if (!user) return;
  const form = $("#edit-user-form");
  form.reset();
  form.elements.id.value = user.id;
  form.elements.fullName.value = user.fullName;
  form.elements.username.value = user.username;
  form.elements.role.value = user.role;
  form.elements.status.value = user.status;
  form.elements.employeeCode.value = user.employeeCode || "";
  form.elements.position.value = user.positionName || "";
  form.elements.payType.value = user.payType || "hourly";
  form.elements.hourlyRate.value = Number(user.hourlyRate || 0);
  form.elements.terminalEnabled.checked = user.terminalStatus === "active";
  form.elements.terminalName.value = user.terminalName || "";
  $("#edit-user-dialog").showModal();
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  $("#login-error").textContent = "";
  try {
    const { user, csrf } = await api("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
    form.reset();
    showApp(user, csrf);
  } catch (error) { $("#login-error").textContent = error.message; }
});

$("#logout-button").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => null); showLogin(); });
$("#main-nav").addEventListener("click", (event) => { const button = event.target.closest("[data-section]"); if (button) navigate(button.dataset.section); });
$("#menu-button").addEventListener("click", () => { const sidebar = $(".sidebar"); sidebar.classList.toggle("is-open"); $("#menu-button").setAttribute("aria-expanded", String(sidebar.classList.contains("is-open"))); });
$("#exit-pos").addEventListener("click", () => navigate("dashboard"));
$("#pos-cash-button").addEventListener("click", () => navigate("cash"));
$$('[data-refresh]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.refresh)));

$("#product-search").addEventListener("input", renderProducts);
$("#product-category").addEventListener("change", renderProducts);
$("#product-grid").addEventListener("click", (event) => { const button = event.target.closest("[data-product-id]"); if (button) addToCart(Number(button.dataset.productId)); });
$("#cart-lines").addEventListener("click", (event) => { const button = event.target.closest("[data-cart-change]"); if (!button) return; const id = Number(button.dataset.productId); const product = state.products.find((item) => item.id === id); const next = (state.cart.get(id) || 0) + Number(button.dataset.cartChange); if (next <= 0) state.cart.delete(id); else if (next <= product.available) state.cart.set(id, next); renderCart(); });
$("#clear-cart").addEventListener("click", () => { state.cart.clear(); renderCart(); });
$("#complete-sale").addEventListener("click", completeSale);
$("#payment-methods").addEventListener("click", (event) => {
  const button = event.target.closest("[data-payment-method]");
  if (!button) return;
  const method = button.dataset.paymentMethod;
  $("#payment-method").value = method;
  $$("[data-payment-method]", $("#payment-methods")).forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
  $("#payment-reference-wrap").hidden = method === "cash";
  if (method === "cash") $("#payment-reference").value = "";
});

$("#show-new-item").addEventListener("click", () => { const form = $("#new-item-form"); form.reset(); openInventoryForm("new-item-form"); applyItemPackagePreset(); });
$("#show-new-product").addEventListener("click", () => { if (!state.inventory.length) return toast("Primero cree al menos un artículo físico.", true); openInventoryForm("new-product-form"); $("#recipe-rows").replaceChildren(); addRecipeRow("recipe"); });
$("#show-purchase").addEventListener("click", () => { if (!state.inventory.length) return toast("Primero cree al menos un artículo físico.", true); const form = $("#purchase-form"); openInventoryForm("purchase-form"); $("#purchase-rows").replaceChildren(); addRecipeRow("purchase"); const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); form.elements.purchasedAt.value = now; });
$("#add-recipe-row").addEventListener("click", () => addRecipeRow("recipe"));
$("#add-purchase-row").addEventListener("click", () => addRecipeRow("purchase"));
$("#recipe-rows").addEventListener("click", (event) => { if (event.target.closest("[data-remove-row]") && $$(".recipe-row", $("#recipe-rows")).length > 1) event.target.closest(".recipe-row").remove(); });
$("#purchase-rows").addEventListener("click", (event) => { if (event.target.closest("[data-remove-row]") && $$(".recipe-row", $("#purchase-rows")).length > 1) event.target.closest(".recipe-row").remove(); });
$("#recipe-rows").addEventListener("change", (event) => { const row = event.target.closest(".recipe-row"); if (row) updateInventoryRow(row, "recipe"); });
$("#purchase-rows").addEventListener("change", (event) => { const row = event.target.closest(".recipe-row"); if (row) updateInventoryRow(row, "purchase", event.target.name === "itemId"); });
$("#purchase-rows").addEventListener("input", (event) => {
  const row = event.target.closest(".recipe-row");
  if (!row) return;
  if (event.target.name === "packageName" && purchasePackageSizes[event.target.value]) {
    $("[name=unitsPerPackage]", row).value = purchasePackageSizes[event.target.value];
  }
  updateInventoryRow(row, "purchase");
});
$("#item-package-preset").addEventListener("change", applyItemPackagePreset);
$("#new-item-form").addEventListener("input", updateItemStockPreview);
$$('[data-cancel-form]').forEach((button) => button.addEventListener("click", () => { const form = document.getElementById(button.dataset.cancelForm); form.hidden = true; form.reset(); }));
$("#new-item-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formValues(form); try { await api("/api/inventory/items", { method: "POST", body: JSON.stringify({ sku: values.sku, name: values.name, category: values.category, unit: values.unit, packageName: values.packageName, unitsPerPackage: Number(values.unitsPerPackage), initialPackages: Number(values.initialPackages || 0), packageCost: Number(values.packageCost || 0), minimumStock: Number(values.minimumStock || 0) }) }); form.reset(); form.hidden = true; applyItemPackagePreset(); toast("Artículo físico creado."); await loadInventory(); } catch (error) { toast(error.message, true); } });
$("#new-product-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formValues(form); try { await api("/api/inventory/products", { method: "POST", body: JSON.stringify({ sku: values.sku, name: values.name, category: values.category, barcode: values.barcode || null, salePrice: Number(values.salePrice), taxRate: Number(values.taxRate || 0) / 100, recipe: collectRows("#recipe-rows") }) }); form.reset(); form.hidden = true; toast("Producto de venta agregado al POS."); await loadInventory(); } catch (error) { toast(error.message, true); } });
$("#purchase-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formValues(form); try { await api("/api/inventory/purchases", { method: "POST", body: JSON.stringify({ invoiceNumber: values.invoiceNumber || null, purchasedAt: new Date(values.purchasedAt).toISOString(), notes: values.notes, items: collectRows("#purchase-rows") }) }); form.reset(); form.hidden = true; toast("Compra recibida e inventario actualizado."); await loadInventory(); } catch (error) { toast(error.message, true); } });
$("#inventory-search").addEventListener("input", renderInventory);
$("#inventory-table").addEventListener("click", (event) => { const button = event.target.closest("[data-adjust-id]"); if (!button) return; const item = state.inventory.find((row) => row.id === Number(button.dataset.adjustId)); $("#adjust-form [name=itemId]").value = item.id; $("#adjust-item-name").textContent = `${item.name} · Existencia ${Number(item.currentStock).toFixed(3)} ${item.unit}`; $("#adjust-dialog").showModal(); });
$("#adjust-form").addEventListener("submit", async (event) => { event.preventDefault(); if (event.submitter?.value === "cancel") return $("#adjust-dialog").close(); const form = event.currentTarget; const values = formValues(form); try { await api("/api/inventory/movements", { method: "POST", body: JSON.stringify({ itemId: Number(values.itemId), type: values.type, quantity: Number(values.quantity), notes: values.notes }) }); $("#adjust-dialog").close(); form.reset(); toast("Inventario actualizado."); await loadInventory(); } catch (error) { toast(error.message, true); } });

$("#open-cash-form").addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); const message = $(".form-message", event.currentTarget); try { await api("/api/cash/sessions/open", { method: "POST", body: JSON.stringify({ terminalId: Number(values.terminalId), openingAmount: Number(values.openingAmount) }) }); message.textContent = ""; toast("Caja abierta."); await loadCash(); } catch (error) { message.textContent = error.message; } });
$("#current-cash-session").addEventListener("click", (event) => { const button = event.target.closest("[data-close-session]"); if (!button) return; $("#close-form [name=sessionId]").value = button.dataset.closeSession; $("#close-dialog").showModal(); });
$("#close-form").addEventListener("submit", async (event) => { event.preventDefault(); if (event.submitter?.value === "cancel") return $("#close-dialog").close(); const form = event.currentTarget; const values = formValues(form); try { const result = await api(`/api/cash/sessions/${values.sessionId}/close`, { method: "POST", body: JSON.stringify({ countedCash: Number(values.countedCash), notes: values.notes }) }); $("#close-dialog").close(); form.reset(); toast(`Caja cerrada. Diferencia: ${money.format(result.difference)}`, Math.abs(result.difference) > .01); await loadCash(); } catch (error) { toast(error.message, true); } });

$("#report-filter").addEventListener("submit", loadReports);
$("#hours-filter").addEventListener("submit", async (event) => { event.preventDefault(); await loadHours().catch((error) => toast(error.message, true)); });
$("#clock-status").addEventListener("click", async (event) => { const button = event.target.closest("[data-clock]"); if (!button) return; try { if (button.dataset.clock === "in") await api("/api/workforce/clock/in", { method: "POST" }); else await api("/api/workforce/clock/out", { method: "POST", body: JSON.stringify({ breakMinutes: 0 }) }); toast(button.dataset.clock === "in" ? "Entrada registrada." : "Salida registrada."); await loadWorkforce(); } catch (error) { toast(error.message, true); } });
$("#hours-table").addEventListener("click", async (event) => { const button = event.target.closest("[data-approve-hours]"); if (!button) return; try { await api(`/api/workforce/hours/${button.dataset.approveHours}/approve`, { method: "POST" }); toast("Marcación aprobada."); await loadHours(); } catch (error) { toast(error.message, true); } });

$("#show-new-period").addEventListener("click", () => { $("#new-period-form").hidden = false; });
$("#new-period-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; try { await api("/api/payroll/periods", { method: "POST", body: JSON.stringify(formValues(form)) }); form.reset(); form.hidden = true; toast("Período creado."); await loadPayroll(); } catch (error) { toast(error.message, true); } });
$("#payroll-table").addEventListener("click", async (event) => { const view = event.target.closest("[data-payroll-view]"); const calculate = event.target.closest("[data-payroll-calculate]"); const approve = event.target.closest("[data-payroll-approve]"); try { if (view) await viewPayroll(view.dataset.payrollView); if (calculate) { await api(`/api/payroll/periods/${calculate.dataset.payrollCalculate}/calculate`, { method: "POST" }); toast("Planilla calculada."); await loadPayroll(); await viewPayroll(calculate.dataset.payrollCalculate); } if (approve) { await api(`/api/payroll/periods/${approve.dataset.payrollApprove}/approve`, { method: "POST" }); toast("Planilla aprobada."); await loadPayroll(); } } catch (error) { toast(error.message, true); } });

$("#show-new-user").addEventListener("click", () => { $("#new-user-form").hidden = false; });
$("#new-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  const employee = values.employeeCode ? {
    code: values.employeeCode,
    position: values.position || roleNames[values.role],
    payType: values.payType || "hourly",
    hourlyRate: Number(values.hourlyRate || 0),
    overtimeMultiplier: 1.5
  } : undefined;
  const terminal = { enabled: form.elements.terminalEnabled.checked, name: values.terminalName || null };
  try {
    await api("/api/users", { method: "POST", body: JSON.stringify({ username: values.username, password: values.password, fullName: values.fullName, role: values.role, employee, terminal }) });
    form.reset();
    form.hidden = true;
    toast("Usuario creado.");
    await loadUsers();
  } catch (error) { toast(error.message, true); }
});
$("#users-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-user]");
  if (button) openUserEditor(button.dataset.editUser);
});
$("#edit-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#edit-user-dialog").close();
  const form = event.currentTarget;
  const values = formValues(form);
  const employee = values.employeeCode ? {
    code: values.employeeCode,
    position: values.position || roleNames[values.role],
    payType: values.payType || "hourly",
    hourlyRate: Number(values.hourlyRate || 0),
    overtimeMultiplier: 1.5
  } : undefined;
  const payload = {
    username: values.username,
    fullName: values.fullName,
    role: values.role,
    status: values.status,
    employee,
    terminal: { enabled: form.elements.terminalEnabled.checked, name: values.terminalName || null }
  };
  if (values.password) payload.password = values.password;
  try {
    await api(`/api/users/${values.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    $("#edit-user-dialog").close();
    toast("Usuario actualizado.");
    await loadUsers();
  } catch (error) { toast(error.message, true); }
});

initialize();
