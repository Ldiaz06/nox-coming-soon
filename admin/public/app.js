const state = {
  user: null,
  csrf: null,
  section: "dashboard",
  products: [],
  inventory: [],
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
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers
  });
  if (response.status === 401) {
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
  clearInterval(state.clockTimer);
}

function showApp(user, csrf = state.csrf) {
  state.user = user;
  state.csrf = csrf;
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#user-name").textContent = user.fullName;
  $("#user-role").textContent = roleNames[user.role];
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

async function loadDashboard() {
  const [salesData, cashData, clockData] = await Promise.all([
    api("/api/pos/sales?limit=6"),
    api("/api/cash/sessions"),
    api("/api/workforce/clock")
  ]);
  state.cashSessions = cashData.sessions;
  const openSession = cashData.sessions.find((session) => session.status === "open");
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
  const open = sessions.find((session) => session.status === "open");
  $("#pos-session-label").textContent = open ? `${open.terminalName} · Abierta` : "Caja cerrada";
  $("#pos-session-label").className = `status-pill ${open ? "badge--success" : "badge--danger"}`;
  const categories = [...new Set(products.map((product) => product.category))];
  $("#product-category").innerHTML = '<option value="">Todas las categorías</option>' + categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("");
  renderProducts();
  renderCart();
}

function renderProducts() {
  const query = $("#product-search").value.trim().toLowerCase();
  const category = $("#product-category").value;
  const products = state.products.filter((product) => (!category || product.category === category) && (!query || `${product.name} ${product.sku} ${product.barcode || ""}`.toLowerCase().includes(query)));
  $("#product-grid").innerHTML = products.length ? products.map((product) => `
    <button class="product-card" data-product-id="${product.id}" ${product.available < 1 ? "disabled" : ""}>
      <small>${escapeHtml(product.category)} · ${Math.floor(product.available)} disp.</small><strong>${escapeHtml(product.name)}</strong><span>${money.format(product.salePrice)}</span>
    </button>`).join("") : '<p class="empty-state">No se encontraron productos.</p>';
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
  const open = state.cashSessions.find((session) => session.status === "open");
  $("#complete-sale").disabled = !lines.length || !open;
}

async function completeSale() {
  const open = state.cashSessions.find((session) => session.status === "open");
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
  const { items } = await api("/api/inventory/items");
  state.inventory = items;
  renderInventory();
}

function renderInventory() {
  const query = $("#inventory-search").value.trim().toLowerCase();
  const items = state.inventory.filter((item) => `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(query));
  $("#inventory-summary").textContent = `${items.length} artículos · ${state.inventory.filter((item) => item.lowStock).length} en mínimo`;
  $("#inventory-table").innerHTML = items.map((item) => `<tr><td>${escapeHtml(item.sku)}</td><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.category)}</td><td>${Number(item.currentStock).toFixed(3)} ${escapeHtml(item.unit)}</td><td>${Number(item.minimumStock).toFixed(3)}</td><td>${money.format(item.averageCost)}</td><td><span class="badge ${item.lowStock ? "badge--danger" : "badge--success"}">${item.lowStock ? "Bajo" : "Normal"}</span></td><td><button class="table-action" data-adjust-id="${item.id}">Ajustar</button></td></tr>`).join("");
}

function inventoryOptions() {
  return state.inventory.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.sku)}</option>`).join("");
}

function addRecipeRow(kind) {
  const container = kind === "recipe" ? $("#recipe-rows") : $("#purchase-rows");
  const row = document.createElement("div");
  row.className = "recipe-row";
  row.innerHTML = kind === "recipe"
    ? `<label>Artículo<select name="itemId" required>${inventoryOptions()}</select></label><label>Cantidad descontada<input name="quantity" type="number" min="0.0001" step="0.0001" required></label><button type="button" class="text-button" data-remove-row>Eliminar</button>`
    : `<label>Artículo<select name="itemId" required>${inventoryOptions()}</select></label><label>Cantidad<input name="quantity" type="number" min="0.0001" step="0.0001" required></label><label>Costo unitario<input name="unitCost" type="number" min="0" step="0.0001" required></label><button type="button" class="text-button" data-remove-row>Eliminar</button>`;
  container.append(row);
}

function collectRows(containerSelector) {
  return $$(".recipe-row", $(containerSelector)).map((row) => ({
    itemId: Number($("[name=itemId]", row).value),
    quantity: Number($("[name=quantity]", row).value),
    ...($("[name=unitCost]", row) ? { unitCost: Number($("[name=unitCost]", row).value) } : {})
  }));
}

async function loadCash() {
  const [{ terminals }, { sessions }] = await Promise.all([api("/api/cash/terminals"), api("/api/cash/sessions")]);
  state.terminals = terminals;
  state.cashSessions = sessions;
  $("#terminal-select").innerHTML = terminals.map((terminal) => `<option value="${terminal.id}">${escapeHtml(terminal.name)}</option>`).join("");
  const open = sessions.find((session) => session.status === "open");
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
  $("#users-table").innerHTML = users.map((user) => `<tr><td><strong>${escapeHtml(user.fullName)}</strong></td><td>${escapeHtml(user.email)}</td><td><span class="badge badge--gold">${escapeHtml(roleNames[user.role])}</span></td><td>${escapeHtml(user.employeeCode || "Sin vincular")}</td><td>${user.lastLoginAt ? dateTime.format(new Date(user.lastLoginAt)) : "Nunca"}</td><td><span class="badge ${user.status === "active" ? "badge--success" : "badge--danger"}">${escapeHtml(user.status)}</span></td></tr>`).join("");
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = formValues(event.currentTarget);
  $("#login-error").textContent = "";
  try {
    const { user, csrf } = await api("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
    event.currentTarget.reset();
    showApp(user, csrf);
  } catch (error) { $("#login-error").textContent = error.message; }
});

$("#logout-button").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => null); showLogin(); });
$("#main-nav").addEventListener("click", (event) => { const button = event.target.closest("[data-section]"); if (button) navigate(button.dataset.section); });
$("#menu-button").addEventListener("click", () => { const sidebar = $(".sidebar"); sidebar.classList.toggle("is-open"); $("#menu-button").setAttribute("aria-expanded", String(sidebar.classList.contains("is-open"))); });
$$('[data-refresh]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.refresh)));

$("#product-search").addEventListener("input", renderProducts);
$("#product-category").addEventListener("change", renderProducts);
$("#product-grid").addEventListener("click", (event) => { const button = event.target.closest("[data-product-id]"); if (button) addToCart(Number(button.dataset.productId)); });
$("#cart-lines").addEventListener("click", (event) => { const button = event.target.closest("[data-cart-change]"); if (!button) return; const id = Number(button.dataset.productId); const product = state.products.find((item) => item.id === id); const next = (state.cart.get(id) || 0) + Number(button.dataset.cartChange); if (next <= 0) state.cart.delete(id); else if (next <= product.available) state.cart.set(id, next); renderCart(); });
$("#clear-cart").addEventListener("click", () => { state.cart.clear(); renderCart(); });
$("#complete-sale").addEventListener("click", completeSale);
$("#payment-method").addEventListener("change", (event) => { $("#payment-reference-wrap").hidden = event.target.value === "cash"; });

$("#show-new-item").addEventListener("click", () => { $("#new-item-form").hidden = false; });
$("#show-new-product").addEventListener("click", () => { $("#new-product-form").hidden = false; $("#recipe-rows").replaceChildren(); addRecipeRow("recipe"); });
$("#show-purchase").addEventListener("click", () => { const form = $("#purchase-form"); form.hidden = false; $("#purchase-rows").replaceChildren(); addRecipeRow("purchase"); const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); form.elements.purchasedAt.value = now; });
$("#add-recipe-row").addEventListener("click", () => addRecipeRow("recipe"));
$("#add-purchase-row").addEventListener("click", () => addRecipeRow("purchase"));
$("#recipe-rows").addEventListener("click", (event) => { if (event.target.closest("[data-remove-row]") && $$(".recipe-row", $("#recipe-rows")).length > 1) event.target.closest(".recipe-row").remove(); });
$("#purchase-rows").addEventListener("click", (event) => { if (event.target.closest("[data-remove-row]") && $$(".recipe-row", $("#purchase-rows")).length > 1) event.target.closest(".recipe-row").remove(); });
$$('[data-cancel-form]').forEach((button) => button.addEventListener("click", () => { const form = document.getElementById(button.dataset.cancelForm); form.hidden = true; form.reset(); }));
$("#new-item-form").addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); try { await api("/api/inventory/items", { method: "POST", body: JSON.stringify({ ...values, currentStock: Number(values.currentStock), minimumStock: Number(values.minimumStock), averageCost: Number(values.averageCost) }) }); event.currentTarget.reset(); event.currentTarget.hidden = true; toast("Artículo creado."); await loadInventory(); } catch (error) { toast(error.message, true); } });
$("#new-product-form").addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); try { await api("/api/inventory/products", { method: "POST", body: JSON.stringify({ sku: values.sku, name: values.name, category: values.category, salePrice: Number(values.salePrice), taxRate: Number(values.taxRate || 0) / 100, recipe: collectRows("#recipe-rows") }) }); event.currentTarget.reset(); event.currentTarget.hidden = true; toast("Producto agregado al POS."); await loadInventory(); } catch (error) { toast(error.message, true); } });
$("#purchase-form").addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); try { await api("/api/inventory/purchases", { method: "POST", body: JSON.stringify({ invoiceNumber: values.invoiceNumber || null, purchasedAt: new Date(values.purchasedAt).toISOString(), notes: values.notes, items: collectRows("#purchase-rows") }) }); event.currentTarget.reset(); event.currentTarget.hidden = true; toast("Compra recibida e inventario actualizado."); await loadInventory(); } catch (error) { toast(error.message, true); } });
$("#inventory-search").addEventListener("input", renderInventory);
$("#inventory-table").addEventListener("click", (event) => { const button = event.target.closest("[data-adjust-id]"); if (!button) return; const item = state.inventory.find((row) => row.id === Number(button.dataset.adjustId)); $("#adjust-form [name=itemId]").value = item.id; $("#adjust-item-name").textContent = `${item.name} · Existencia ${Number(item.currentStock).toFixed(3)} ${item.unit}`; $("#adjust-dialog").showModal(); });
$("#adjust-form").addEventListener("submit", async (event) => { event.preventDefault(); if (event.submitter?.value === "cancel") return $("#adjust-dialog").close(); const values = formValues(event.currentTarget); try { await api("/api/inventory/movements", { method: "POST", body: JSON.stringify({ itemId: Number(values.itemId), type: values.type, quantity: Number(values.quantity), notes: values.notes }) }); $("#adjust-dialog").close(); event.currentTarget.reset(); toast("Inventario actualizado."); await loadInventory(); } catch (error) { toast(error.message, true); } });

$("#open-cash-form").addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); const message = $(".form-message", event.currentTarget); try { await api("/api/cash/sessions/open", { method: "POST", body: JSON.stringify({ terminalId: Number(values.terminalId), openingAmount: Number(values.openingAmount) }) }); message.textContent = ""; toast("Caja abierta."); await loadCash(); } catch (error) { message.textContent = error.message; } });
$("#current-cash-session").addEventListener("click", (event) => { const button = event.target.closest("[data-close-session]"); if (!button) return; $("#close-form [name=sessionId]").value = button.dataset.closeSession; $("#close-dialog").showModal(); });
$("#close-form").addEventListener("submit", async (event) => { event.preventDefault(); if (event.submitter?.value === "cancel") return $("#close-dialog").close(); const values = formValues(event.currentTarget); try { const result = await api(`/api/cash/sessions/${values.sessionId}/close`, { method: "POST", body: JSON.stringify({ countedCash: Number(values.countedCash), notes: values.notes }) }); $("#close-dialog").close(); event.currentTarget.reset(); toast(`Caja cerrada. Diferencia: ${money.format(result.difference)}`, Math.abs(result.difference) > .01); await loadCash(); } catch (error) { toast(error.message, true); } });

$("#report-filter").addEventListener("submit", loadReports);
$("#hours-filter").addEventListener("submit", async (event) => { event.preventDefault(); await loadHours().catch((error) => toast(error.message, true)); });
$("#clock-status").addEventListener("click", async (event) => { const button = event.target.closest("[data-clock]"); if (!button) return; try { if (button.dataset.clock === "in") await api("/api/workforce/clock/in", { method: "POST" }); else await api("/api/workforce/clock/out", { method: "POST", body: JSON.stringify({ breakMinutes: 0 }) }); toast(button.dataset.clock === "in" ? "Entrada registrada." : "Salida registrada."); await loadWorkforce(); } catch (error) { toast(error.message, true); } });
$("#hours-table").addEventListener("click", async (event) => { const button = event.target.closest("[data-approve-hours]"); if (!button) return; try { await api(`/api/workforce/hours/${button.dataset.approveHours}/approve`, { method: "POST" }); toast("Marcación aprobada."); await loadHours(); } catch (error) { toast(error.message, true); } });

$("#show-new-period").addEventListener("click", () => { $("#new-period-form").hidden = false; });
$("#new-period-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await api("/api/payroll/periods", { method: "POST", body: JSON.stringify(formValues(event.currentTarget)) }); event.currentTarget.reset(); event.currentTarget.hidden = true; toast("Período creado."); await loadPayroll(); } catch (error) { toast(error.message, true); } });
$("#payroll-table").addEventListener("click", async (event) => { const view = event.target.closest("[data-payroll-view]"); const calculate = event.target.closest("[data-payroll-calculate]"); const approve = event.target.closest("[data-payroll-approve]"); try { if (view) await viewPayroll(view.dataset.payrollView); if (calculate) { await api(`/api/payroll/periods/${calculate.dataset.payrollCalculate}/calculate`, { method: "POST" }); toast("Planilla calculada."); await loadPayroll(); await viewPayroll(calculate.dataset.payrollCalculate); } if (approve) { await api(`/api/payroll/periods/${approve.dataset.payrollApprove}/approve`, { method: "POST" }); toast("Planilla aprobada."); await loadPayroll(); } } catch (error) { toast(error.message, true); } });

$("#show-new-user").addEventListener("click", () => { $("#new-user-form").hidden = false; });
$("#new-user-form").addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); try { const employee = values.employeeCode ? { code: values.employeeCode, position: values.position || roleNames[values.role], payType: values.payType || "hourly", hourlyRate: Number(values.hourlyRate || 0), monthlySalary: Number(values.monthlySalary || 0), overtimeMultiplier: 1.5 } : undefined; await api("/api/users", { method: "POST", body: JSON.stringify({ email: values.email, password: values.password, fullName: values.fullName, role: values.role, employee }) }); event.currentTarget.reset(); event.currentTarget.hidden = true; toast("Usuario creado."); await loadUsers(); } catch (error) { toast(error.message, true); } });

initialize();
