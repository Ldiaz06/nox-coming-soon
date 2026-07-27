const state = {
  user: null,
  csrf: null,
  section: "dashboard",
  products: [],
  productCache: new Map(),
  inventory: [],
  inventoryRows: [],
  articleRows: [],
  inventoryProducts: [],
  purchasePresentations: [],
  users: [],
  cashSessions: [],
  terminals: [],
  insights: null,
  cart: new Map(),
  posMode: null,
  activeTab: null,
  openTabs: [],
  tabMutation: Promise.resolve(),
  clockTimer: null,
  catalogReady: false,
  pagination: {
    pos: { page: 1, perPage: 18, total: 0, pages: 1, from: 0, to: 0 },
    inventory: { page: 1, perPage: 20, total: 0, pages: 1, from: 0, to: 0 },
    articles: { page: 1, perPage: 20, total: 0, pages: 1, from: 0, to: 0 },
    products: { page: 1, perPage: 20, total: 0, pages: 1, from: 0, to: 0 }
  },
  requestSequence: { pos: 0, inventory: 0, articles: 0, products: 0 }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateTime = new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Panama" });
const dateOnly = new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeZone: "America/Panama" });
const roleNames = { admin: "Administrador", supervisor: "Supervisor", cashier: "Cajero" };
const sectionNames = { dashboard: "Resumen", pos: "Punto de venta", inventory: "Inventario", articles: "Artículos", products: "Productos", insights: "Costos y reposición", cash: "Cajas", reports: "Reportes", workforce: "Personal", payroll: "Planilla", users: "Usuarios" };
const unitNames = { unit: "unidad", bottle: "botella", can: "lata", ml: "ml", liter: "litro", fluid_ounce: "oz líquida", gram: "g", kg: "kg", portion: "porción", pack: "paquete", case: "caja", keg: "barril" };
const quantityNumber = new Intl.NumberFormat("es-PA", { maximumFractionDigits: 4 });
const panamaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const NEW_CATEGORY = "__new_category__";
const CUSTOM_PACKAGE = "__custom_package__";
const DEFAULT_PRODUCT_IMAGE = "/assets/product-default-v3.webp";
const articleCategories = [
  "Cervezas nacionales", "Cervezas importadas", "Cervezas artesanales", "Cervezas sin alcohol",
  "Ron", "Aguardiente y seco", "Whisky / Whiskey", "Vodka", "Ginebra", "Tequila", "Mezcal", "Brandy y coñac",
  "Vino tinto", "Vino blanco", "Vino rosado", "Vino espumoso", "Champagne",
  "Licores y cremas", "Aperitivos y vermut", "Amargos y bitters", "Sake y destilados asiáticos",
  "Aguas", "Gaseosas y sodas", "Tónicas", "Bebidas energéticas", "Jugos y néctares",
  "Siropes y cordiales", "Purés", "Café y té", "Frutas y cítricos", "Hierbas y especias",
  "Decoraciones / garnishes", "Hielo", "Lácteos y cremas", "Carnes", "Pescados y mariscos",
  "Embutidos y quesos", "Panadería", "Snacks", "Chocolates y postres", "Salsas y condimentos",
  "Insumos de cocina", "Insumos de barra", "Desechables", "Limpieza e higiene",
  "Cristalería", "Merchandising", "Otros artículos"
];
const productCategories = [
  "Cervezas nacionales", "Cervezas importadas", "Cervezas artesanales", "Cervezas sin alcohol",
  "Cócteles signature", "Cócteles clásicos", "Cócteles tropicales", "Cócteles sin alcohol",
  "Highballs", "Spritz", "Martinis", "Margaritas", "Mojitos", "Shots",
  "Tragos sencillos", "Tragos dobles", "Servicio de ron", "Servicio de whisky",
  "Servicio de vodka", "Servicio de ginebra", "Servicio de tequila", "Servicio de mezcal",
  "Brandy y coñac", "Vinos tintos", "Vinos blancos", "Vinos rosados",
  "Espumosos y champagne", "Licores y digestivos", "Aguas", "Gaseosas y mezcladores",
  "Jugos", "Energéticas", "Café y té", "Entradas", "Night bites", "Platos fuertes",
  "Tablas para compartir", "Postres", "Paquetes VIP", "Mesas y reservaciones",
  "Cover y entradas", "Promociones", "Combos", "Merchandising", "Otros productos"
];

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
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
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

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function debounce(callback, delay = 260) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

function catalogUrl(path, key, search = "", extra = {}) {
  const pagination = state.pagination[key];
  const url = new URL(path, window.location.origin);
  url.searchParams.set("page", pagination.page);
  url.searchParams.set("perPage", pagination.perPage);
  if (search.trim()) url.searchParams.set("search", search.trim());
  Object.entries(extra).forEach(([name, value]) => {
    if (value) url.searchParams.set(name, value);
  });
  return `${url.pathname}${url.search}`;
}

function renderPagination(containerId, key) {
  const container = document.getElementById(containerId);
  const pagination = state.pagination[key];
  if (!container) return;
  if (!pagination.total || pagination.pages <= 1) {
    container.replaceChildren();
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const start = Math.max(1, pagination.page - 2);
  const end = Math.min(pagination.pages, pagination.page + 2);
  const pages = [];
  for (let page = start; page <= end; page += 1) pages.push(page);
  container.innerHTML = `
    <button type="button" data-page="${pagination.page - 1}" ${pagination.page === 1 ? "disabled" : ""} aria-label="Página anterior">←</button>
    ${start > 1 ? `<button type="button" data-page="1">1</button>${start > 2 ? "<span>…</span>" : ""}` : ""}
    ${pages.map((page) => `<button type="button" data-page="${page}" ${page === pagination.page ? 'aria-current="page"' : ""}>${page}</button>`).join("")}
    ${end < pagination.pages ? `${end < pagination.pages - 1 ? "<span>…</span>" : ""}<button type="button" data-page="${pagination.pages}">${pagination.pages}</button>` : ""}
    <button type="button" data-page="${pagination.page + 1}" ${pagination.page === pagination.pages ? "disabled" : ""} aria-label="Página siguiente">→</button>
    <small>${pagination.from}–${pagination.to} de ${pagination.total}</small>`;
}

function bindPagination(containerId, key, loader) {
  document.getElementById(containerId).addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;
    state.pagination[key].page = Number(button.dataset.page);
    loader().catch((error) => toast(error.message, true));
  });
}

function populateCategorySelect(select, defaults, existing = []) {
  const current = select.value;
  const categories = sortedUnique([...defaults, ...existing]);
  select.innerHTML = [
    '<option value="">Seleccione una categoría</option>',
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`),
    `<option value="${NEW_CATEGORY}">+ Agregar nueva categoría</option>`
  ].join("");
  if (categories.includes(current) || current === NEW_CATEGORY) select.value = current;
}

function refreshCategoryCatalogs() {
  populateCategorySelect($("#item-category-input"), articleCategories, state.inventory.map((item) => item.category));
  populateCategorySelect($("#product-category-input"), productCategories, state.inventoryProducts.map((product) => product.category));
}

function toggleNewCategory(select, field) {
  const isNew = select.value === NEW_CATEGORY;
  field.hidden = !isNew;
  const input = $("input", field);
  input.required = isNew;
  if (!isNew) input.value = "";
}

function categoryFromForm(form) {
  const selected = String(form.elements.category.value || "").trim();
  const category = selected === NEW_CATEGORY
    ? String(form.elements.categoryNew.value || "").trim()
    : selected;
  if (category.length < 2) throw new Error("Seleccione o escriba una categoría válida.");
  return category;
}

function setImagePreview(input, container) {
  const image = $("img", container);
  if (container.dataset.objectUrl) URL.revokeObjectURL(container.dataset.objectUrl);
  container.dataset.objectUrl = "";
  const file = input.files?.[0];
  if (!file) {
    container.hidden = true;
    image.removeAttribute("src");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  container.dataset.objectUrl = objectUrl;
  image.src = objectUrl;
  container.hidden = false;
}

async function uploadProductImage(productId, file) {
  const body = new FormData();
  body.append("image", file);
  return api(`/api/inventory/products/${productId}/image`, { method: "POST", body });
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
  refreshCategoryCatalogs();
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
    const loaders = { dashboard: loadDashboard, pos: loadPos, inventory: loadInventory, articles: loadInventory, products: loadInventory, insights: loadInsights, cash: loadCash, reports: loadReports, workforce: loadWorkforce, payroll: loadPayroll, users: loadUsers };
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
  let reorderAlerts = [];
  if (state.user.role !== "cashier") {
    const [reportData, lowData, intelligence] = await Promise.all([
      api(`/api/reports/summary?period=daily&anchor=${panamaDate()}`),
      api("/api/reports/low-stock"),
      api("/api/reports/inventory-intelligence?days=30")
    ]);
    lowStock = lowData.items;
    reorderAlerts = intelligence.reorder.filter((item) => ["critical", "soon"].includes(item.status));
    $("#dashboard-kpis").innerHTML = [
      kpi("Venta de hoy", money.format(reportData.summary.grossSales || 0), `${reportData.summary.transactions || 0} transacciones`),
      kpi("Ganancia estimada", money.format(reportData.summary.profit || 0), "Venta menos costo"),
      kpi("Caja", openSession ? "Abierta" : "Cerrada", openSession ? openSession.terminalName : "Sin sesión activa"),
      kpi("Por reponer", String(reorderAlerts.length), reorderAlerts.length ? `${intelligence.summary.criticalCount} críticos` : "Compras al día")
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
  if (state.user.role !== "cashier") statusRows.push({ label: "Reposición", value: reorderAlerts.length ? `${reorderAlerts.length} compras sugeridas` : "Sin compras urgentes", ok: !reorderAlerts.length });
  $("#operational-status").innerHTML = statusRows.map((row) => `<div class="list-row"><strong>${escapeHtml(row.label)}</strong><span class="badge ${row.ok ? "badge--success" : "badge--danger"}">${escapeHtml(row.value)}</span></div>`).join("");
}

async function loadPos() {
  const [{ sessions }] = await Promise.all([api("/api/cash/sessions"), loadPosTabs()]);
  state.cashSessions = sessions;
  const open = ownOpenSession();
  $("#pos-session-label").textContent = open ? `${open.terminalName} · Abierta` : "Caja cerrada";
  $("#pos-session-label").className = `status-pill ${open ? "badge--success" : "badge--danger"}`;
  await loadPosCatalog();
  if (state.activeTab && !state.openTabs.some((tab) => Number(tab.id) === Number(state.activeTab.id))) {
    state.posMode = null;
    state.activeTab = null;
    state.cart.clear();
  }
  renderAccountMode();
  renderCart();
}

async function loadPosTabs() {
  const { tabs } = await api("/api/pos/tabs");
  state.openTabs = tabs;
  renderOpenTabs();
}

function renderOpenTabs() {
  $("#open-tabs").innerHTML = state.openTabs.length ? state.openTabs.map((tab) => `
    <button type="button" class="open-tab" data-tab-id="${tab.id}">
      <span><strong>${escapeHtml(tab.customerName)}</strong><small>${Number(tab.itemCount) ? `${quantityNumber.format(tab.itemCount)} productos` : "Cuenta vacía"} · ${escapeHtml(tab.openedBy)}</small></span>
      <b>${money.format(tab.total)}</b>
    </button>`).join("") : '<p class="empty-state">No hay cuentas abiertas.</p>';
}

function renderAccountMode() {
  const selected = Boolean(state.posMode);
  $("#pos-account-selector").hidden = selected;
  $("#active-account-bar").hidden = !selected;
  const accountName = state.posMode === "quick" ? "⚡ Venta rápida" : state.activeTab?.customerName || "";
  $("#active-account-name").textContent = accountName;
  $("#current-order-account").textContent = selected ? accountName : "Seleccione una cuenta";
  $("#product-search").disabled = !selected;
  $("#product-category").disabled = !selected;
  $("#clear-cart").disabled = !selected;
  $("#complete-sale").textContent = state.posMode === "tab" ? "Cobrar cuenta" : state.posMode === "quick" ? "Cobrar venta rápida" : "Seleccione una cuenta";
  renderProducts();
  if (selected) renderPagination("pos-pagination", "pos");
  renderCart();
}

function selectQuickSale() {
  state.posMode = "quick";
  state.activeTab = null;
  state.cart.clear();
  $("#pos-message").textContent = "";
  renderAccountMode();
}

async function selectTab(tabId) {
  const { tab } = await api(`/api/pos/tabs/${tabId}`);
  state.posMode = "tab";
  state.activeTab = { id: Number(tab.id), customerName: tab.customerName };
  state.cart.clear();
  tab.items.forEach((item) => {
    const productId = Number(item.id);
    state.productCache.set(productId, item);
    state.cart.set(productId, Number(item.quantity));
  });
  $("#pos-message").textContent = "";
  renderAccountMode();
}

async function changeAccount() {
  await state.tabMutation.catch(() => null);
  state.posMode = null;
  state.activeTab = null;
  state.cart.clear();
  await Promise.all([loadPosTabs(), loadPosCatalog()]);
  renderAccountMode();
}

async function loadPosCatalog() {
  const requestId = ++state.requestSequence.pos;
  const categorySelect = $("#product-category");
  const selectedCategory = categorySelect.value;
  const url = catalogUrl("/api/pos/products", "pos", $("#product-search").value, { category: selectedCategory });
  $("#product-grid").setAttribute("aria-busy", "true");
  const { products, categories, pagination } = await api(url);
  if (requestId !== state.requestSequence.pos) return;
  state.products = products;
  state.pagination.pos = pagination;
  products.forEach((product) => state.productCache.set(Number(product.id), product));
  categorySelect.innerHTML = '<option value="">Todas las categorías</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
  categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : "";
  renderProducts();
  renderPagination("pos-pagination", "pos");
  if (!state.posMode) $("#pos-pagination").hidden = true;
  $("#product-grid").setAttribute("aria-busy", "false");
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
  if (!state.posMode) {
    $("#product-grid").innerHTML = '<div class="pos-selection-prompt"><span aria-hidden="true">👤</span><strong>Primero seleccione una cuenta</strong><small>El catálogo se habilitará para el cliente elegido o para una venta rápida.</small></div>';
    $("#pos-pagination").hidden = true;
    return;
  }
  $("#product-grid").innerHTML = state.products.length ? state.products.map((product) => `
    <button class="product-card" data-product-id="${product.id}" aria-label="Agregar ${escapeHtml(product.name)}, ${money.format(product.salePrice)}">
      <img class="product-photo" src="${escapeHtml(product.imageUrl || DEFAULT_PRODUCT_IMAGE)}" alt="" loading="lazy" decoding="async">
      <small>${escapeHtml(product.category)} · <span class="product-stock">${Math.floor(product.available)} disponibles</span></small>
      <strong>${escapeHtml(product.name)}</strong><span class="product-price">${money.format(product.salePrice)}</span>
    </button>`).join("") : '<p class="empty-state">No hay productos disponibles con este filtro.</p>';
}

function addToCart(productId) {
  if (!state.posMode) return toast("Primero seleccione una cuenta o Venta rápida.", true);
  const product = state.productCache.get(productId);
  if (!product) return;
  const current = state.cart.get(productId) || 0;
  if (current + 1 > product.available) return toast("No hay más existencias disponibles.", true);
  setCartQuantity(productId, current + 1);
}

function setCartQuantity(productId, quantity) {
  const previous = state.cart.get(productId) || 0;
  if (quantity <= 0) state.cart.delete(productId);
  else state.cart.set(productId, quantity);
  renderCart();
  if (state.posMode !== "tab" || !state.activeTab) return;
  const tabId = state.activeTab.id;
  state.tabMutation = state.tabMutation.then(async () => {
    await api(`/api/pos/tabs/${tabId}/items`, {
      method: "POST",
      body: JSON.stringify({ productId, quantity })
    });
  }).catch(async (error) => {
    if (previous <= 0) state.cart.delete(productId);
    else state.cart.set(productId, previous);
    renderCart();
    toast(error.message, true);
    await selectTab(tabId).catch(() => changeAccount());
  });
}

function cartTotals() {
  let subtotal = 0;
  let tax = 0;
  for (const [productId, quantity] of state.cart) {
    const product = state.productCache.get(productId);
    if (!product) continue;
    subtotal += Number(product.salePrice) * quantity;
    tax += Number(product.salePrice) * quantity * Number(product.taxRate);
  }
  return { subtotal, tax, total: subtotal + tax };
}

function renderCart() {
  const lines = [...state.cart.entries()];
  $("#cart-lines").innerHTML = lines.length ? lines.map(([productId, quantity]) => {
    const product = state.productCache.get(productId);
    if (!product) return "";
    return `<div class="cart-line"><div><strong>${escapeHtml(product.name)}</strong><small>${money.format(product.salePrice)}</small></div><div class="quantity-control"><button data-cart-change="-1" data-product-id="${productId}" aria-label="Restar">−</button><span>${quantity}</span><button data-cart-change="1" data-product-id="${productId}" aria-label="Sumar">+</button></div><strong>${money.format(product.salePrice * quantity)}</strong></div>`;
  }).join("") : `<p class="empty-state">${state.posMode ? "Seleccione productos para iniciar la orden." : "Primero seleccione una cuenta o Venta rápida."}</p>`;
  const totals = cartTotals();
  $("#cart-subtotal").textContent = money.format(totals.subtotal);
  $("#cart-tax").textContent = money.format(totals.tax);
  $("#cart-total").textContent = money.format(totals.total);
  const open = ownOpenSession();
  $("#complete-sale").disabled = !state.posMode || !lines.length || !open;
}

async function completeSale() {
  if (!state.posMode) return toast("Primero seleccione una cuenta o Venta rápida.", true);
  await state.tabMutation.catch(() => null);
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
        tabId: state.posMode === "tab" ? state.activeTab?.id : null,
        discount: 0,
        items: [...state.cart].map(([productId, quantity]) => ({ productId, quantity })),
        payments: [{ method, amount: Number(totals.total.toFixed(2)), reference: $("#payment-reference").value || null }]
      })
    });
    state.cart.clear();
    state.posMode = null;
    state.activeTab = null;
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
  await ensureInventoryContext();
  if (state.section === "articles") await loadArticlesPage();
  else if (state.section === "products") await loadProductsPage();
  else await loadInventoryPage();
  $$(".recipe-row", $("#recipe-rows")).forEach((row) => updateInventoryRow(row, "recipe"));
  $$(".recipe-row", $("#purchase-rows")).forEach((row) => updateInventoryRow(row, "purchase"));
  updateProductPricingPreview();
}

async function ensureInventoryContext(force = false) {
  if (state.catalogReady && !force) return;
  const { items, presentations = [] } = await api("/api/inventory/item-options");
  state.inventory = items;
  state.purchasePresentations = presentations;
  state.catalogReady = true;
  refreshCategoryCatalogs();
}

async function loadInventoryPage() {
  const requestId = ++state.requestSequence.inventory;
  const { items, pagination } = await api(catalogUrl("/api/inventory/items", "inventory", $("#inventory-search").value));
  if (requestId !== state.requestSequence.inventory) return;
  state.inventoryRows = items;
  state.pagination.inventory = pagination;
  renderInventory();
  renderPagination("inventory-pagination", "inventory");
}

async function loadArticlesPage() {
  const requestId = ++state.requestSequence.articles;
  const { items, pagination } = await api(catalogUrl("/api/inventory/items", "articles", $("#articles-search").value));
  if (requestId !== state.requestSequence.articles) return;
  state.articleRows = items;
  state.pagination.articles = pagination;
  renderArticles();
  renderPagination("articles-pagination", "articles");
}

async function loadProductsPage() {
  const requestId = ++state.requestSequence.products;
  const { products, pagination } = await api(catalogUrl("/api/inventory/products", "products", $("#products-search").value));
  if (requestId !== state.requestSequence.products) return;
  state.inventoryProducts = products;
  state.pagination.products = pagination;
  refreshCategoryCatalogs();
  renderInventoryProducts();
  renderPagination("products-pagination", "products");
}

function renderInventory() {
  const items = state.inventoryRows;
  const pagination = state.pagination.inventory;
  $("#inventory-summary").textContent = `${pagination.total} artículos · mostrando ${pagination.from}–${pagination.to}`;
  $("#inventory-table").innerHTML = items.map((item) => {
    const lowStock = Number(item.lowStock) === 1;
    const reference = item.referencePackageName
      ? `<strong>${escapeHtml(item.referencePackageName)} · ${money.format(item.referencePackageCost)}</strong><small>${quantityNumber.format(item.referenceUnitsPerPackage)} ${escapeHtml(unitNames[item.unit] || item.unit)} por presentación</small>`
      : '<span class="badge">Sin compras</span><small>La primera presentación y precio se definen al comprar.</small>';
    return `<tr>
      <td>${escapeHtml(item.sku)}</td>
      <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}</small></td>
      <td>${reference}</td>
      <td><strong>${quantityNumber.format(item.currentStock)} ${escapeHtml(unitNames[item.unit] || item.unit)}</strong></td>
      <td>${quantityNumber.format(item.minimumStock)} ${escapeHtml(unitNames[item.unit] || item.unit)}<small>${item.leadTimeDays} d entrega + ${item.safetyStockDays} d seguridad</small></td>
      <td><strong>${money.format(item.averageCost)} / ${escapeHtml(unitNames[item.unit] || item.unit)}</strong><small>Promedio ponderado de compras recibidas.</small></td>
      <td><span class="badge ${lowStock ? "badge--danger" : "badge--success"}">${lowStock ? "Bajo" : "Normal"}</span></td>
      <td><button class="table-action" data-adjust-id="${item.id}">Ajustar</button></td>
    </tr>`;
  }).join("") || '<tr><td colspan="8" class="empty-state">No hay artículos físicos con esta búsqueda.</td></tr>';
}

function renderInventoryProducts() {
  const pagination = state.pagination.products;
  $("#products-summary").textContent = `${pagination.total} productos · mostrando ${pagination.from}–${pagination.to}`;
  $("#inventory-products-table").innerHTML = state.inventoryProducts.map((product) => {
    const recipe = product.recipe.length
      ? `<ul class="recipe-summary">${product.recipe.map((component) => `<li><strong>${quantityNumber.format(component.quantity)} ${escapeHtml(unitNames[component.unit] || component.unit)}</strong> de ${escapeHtml(component.name)}</li>`).join("")}</ul>`
      : '<span class="badge badge--danger">Sin composición</span>';
    const active = Number(product.active) === 1;
    const margin = Number(product.grossMargin || 0);
    const target = Number(product.targetMargin || 0);
    const hasCustomPhoto = product.imageUrl && product.imageUrl !== DEFAULT_PRODUCT_IMAGE;
    return `<tr><td>${escapeHtml(product.sku)}</td><td><div class="product-name-cell"><img class="product-thumb" src="${escapeHtml(product.imageUrl || DEFAULT_PRODUCT_IMAGE)}" alt="" loading="lazy" decoding="async"><div><strong>${escapeHtml(product.name)}</strong>${product.barcode ? `<small>${escapeHtml(product.barcode)}</small>` : ""}<button type="button" class="table-action product-photo-action" data-product-image-id="${product.id}">${hasCustomPhoto ? "Cambiar foto" : "Agregar foto"}</button></div></div></td><td>${escapeHtml(product.category)}</td><td>${money.format(product.salePrice)}</td><td>${money.format(product.recipeCost)}</td><td><strong>${money.format(product.suggestedPrice)}</strong></td><td><span class="badge ${margin >= target ? "badge--success" : "badge--warning"}">${(margin * 100).toFixed(1)}%</span><small>Meta ${(target * 100).toFixed(1)}%</small></td><td>${recipe}</td><td><span class="badge ${active ? "badge--success" : "badge--danger"}">${active ? "Activo" : "Inactivo"}</span></td></tr>`;
  }).join("") || '<tr><td colspan="9" class="empty-state">No hay productos de venta registrados.</td></tr>';
}

function renderArticles() {
  const items = state.articleRows;
  const pagination = state.pagination.articles;
  $("#articles-summary").textContent = `${pagination.total} artículos · mostrando ${pagination.from}–${pagination.to}`;
  $("#articles-table").innerHTML = items.map((item) => `<tr>
    <td>${escapeHtml(item.sku)}</td>
    <td><strong>${escapeHtml(item.name)}</strong></td>
    <td>${escapeHtml(item.category)}</td>
    <td>${escapeHtml(unitNames[item.unit] || item.unit)}</td>
    <td>${item.referencePackageName ? `<strong>${escapeHtml(item.referencePackageName)} · ${money.format(item.referencePackageCost)}</strong><small>${quantityNumber.format(item.referenceUnitsPerPackage)} ${escapeHtml(unitNames[item.unit] || item.unit)} por presentación</small>` : '<span class="badge">Sin compras</span>'}</td>
    <td><strong>${money.format(item.averageCost)} / ${escapeHtml(unitNames[item.unit] || item.unit)}</strong></td>
  </tr>`).join("") || '<tr><td colspan="6" class="empty-state">No hay artículos con este filtro.</td></tr>';
}

function inventoryOptions() {
  if (!state.inventory.length) return '<option value="">Primero cree un artículo físico</option>';
  const grouped = new Map();
  [...state.inventory]
    .sort((a, b) => `${a.category} ${a.name}`.localeCompare(`${b.category} ${b.name}`, "es", { sensitivity: "base" }))
    .forEach((item) => {
      if (!grouped.has(item.category)) grouped.set(item.category, []);
      grouped.get(item.category).push(item);
    });
  return [...grouped.entries()].map(([category, items]) => `
    <optgroup label="${escapeHtml(category)}">
      ${items.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(unitNames[item.unit] || item.unit)}</option>`).join("")}
    </optgroup>`).join("");
}

function selectedInventoryItem(row) {
  return state.inventory.find((item) => Number(item.id) === Number($("[name=itemId]", row)?.value));
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
    const quantity = Number($("[name=quantity]", row)?.value || 0);
    const componentCost = quantity * Number(item.averageCost || 0);
    hint.textContent = `Se descontará en ${unit} · costo actual ${money.format(componentCost)}.`;
    updateProductPricingPreview();
    return;
  }
  if (resetPresentation) {
    const referenceName = item.referencePackageName || "Unidad";
    const packageSelect = $("[name=packageName]", row);
    const customInput = $("[name=packageNameCustom]", row);
    if ([...packageSelect.options].some((option) => option.value === referenceName)) {
      packageSelect.value = referenceName;
      customInput.value = "";
    } else {
      packageSelect.value = CUSTOM_PACKAGE;
      customInput.value = referenceName;
    }
    syncCustomPackageField(row);
    $("[name=unitsPerPackage]", row).value = item.referenceUnitsPerPackage || 1;
    $("[name=packageCost]", row).value = item.referencePackageCost || 0;
  }
  const packageName = selectedPackageName(row) || "presentación";
  const unitsPerPackage = Number($("[name=unitsPerPackage]", row).value || 0);
  const reference = item.referencePackageName
    ? ` Última compra: ${item.referencePackageName} a ${money.format(item.referencePackageCost)}.`
    : " No hay compras anteriores; complete los datos de esta factura.";
  hint.textContent = `1 ${packageName} agrega ${quantityNumber.format(unitsPerPackage)} ${unit} al inventario.${reference}`;
}

function addRecipeRow(kind) {
  const container = kind === "recipe" ? $("#recipe-rows") : $("#purchase-rows");
  const row = document.createElement("div");
  row.className = `recipe-row recipe-row--${kind}`;
  row.innerHTML = kind === "recipe"
    ? `<label>Artículo físico<select name="itemId" required>${inventoryOptions()}</select></label><label>Cantidad por cada venta<input name="quantity" type="number" min="0.0001" step="0.0001" required><small class="field-hint" data-conversion-hint></small></label><button type="button" class="text-button" data-remove-row>Eliminar</button>`
    : `<label>Artículo físico<select name="itemId" required>${inventoryOptions()}</select><small class="field-hint" data-conversion-hint></small></label><label>Presentación recibida<select name="packageName" required>${purchasePackageOptions()}</select><input name="packageNameCustom" class="inline-custom-input" maxlength="80" placeholder="Nombre de la nueva presentación" hidden></label><label>Contenido por presentación<input name="unitsPerPackage" type="number" min="0.0001" step="0.0001" required></label><label>Cantidad de presentaciones<input name="packageQuantity" type="number" min="1" step="1" inputmode="numeric" required></label><label>Precio pagado por presentación<input name="packageCost" type="number" min="0" step="0.0001" required></label><button type="button" class="text-button" data-remove-row>Eliminar</button>`;
  container.append(row);
  updateInventoryRow(row, kind, true);
  if (kind === "recipe") updateProductPricingPreview();
}

function collectRows(containerSelector) {
  return $$(".recipe-row", $(containerSelector)).map((row) => ({
    itemId: Number($("[name=itemId]", row).value),
    ...($("[name=quantity]", row) ? { quantity: Number($("[name=quantity]", row).value) } : {}),
    ...($("[name=packageName]", row) ? { packageName: selectedPackageName(row) } : {}),
    ...($("[name=unitsPerPackage]", row) ? { unitsPerPackage: Number($("[name=unitsPerPackage]", row).value) } : {}),
    ...($("[name=packageQuantity]", row) ? { packageQuantity: Number($("[name=packageQuantity]", row).value) } : {}),
    ...($("[name=packageCost]", row) ? { packageCost: Number($("[name=packageCost]", row).value) } : {})
  }));
}

function productRecipeCost() {
  return $$(".recipe-row", $("#recipe-rows")).reduce((total, row) => {
    const item = selectedInventoryItem(row);
    const quantity = Number($("[name=quantity]", row)?.value || 0);
    return total + (item ? quantity * Number(item.averageCost || 0) : 0);
  }, 0);
}

function updateProductPricingPreview() {
  const preview = $("#product-pricing-preview");
  const form = $("#new-product-form");
  if (!preview || !form) return;
  const cost = productRecipeCost();
  const targetMargin = Math.max(.1, Math.min(.95, Number(form.elements.targetMargin?.value || 70) / 100));
  const salePrice = Number(form.elements.salePrice?.value || 0);
  const suggested = cost > 0 ? Math.ceil((cost / (1 - targetMargin)) * 4) / 4 : 0;
  const profit = salePrice - cost;
  const actualMargin = salePrice > 0 ? profit / salePrice : 0;
  preview.innerHTML = [
    `<span class="pricing-metric"><small>Costo de receta</small><strong>${money.format(cost)}</strong></span>`,
    `<span class="pricing-metric pricing-metric--featured"><small>Precio sugerido</small><strong>${money.format(suggested)}</strong></span>`,
    `<span class="pricing-metric"><small>Ganancia al precio ingresado</small><strong>${money.format(profit)}</strong></span>`,
    `<span class="pricing-metric"><small>Margen actual</small><strong class="${actualMargin >= targetMargin ? "is-positive" : "is-warning"}">${(actualMargin * 100).toFixed(1)}%</strong></span>`
  ].join("");
}

const itemPackagePresets = {
  unit: { packageName: "Unidad", unit: "unit", unitsPerPackage: 1 },
  "pack-4": { packageName: "Paquete de 4", unit: "unit", unitsPerPackage: 4 },
  six: { packageName: "Six-pack de 6", unit: "unit", unitsPerPackage: 6 },
  "pack-8": { packageName: "Paquete de 8", unit: "unit", unitsPerPackage: 8 },
  "half-case": { packageName: "Media caja de 12", unit: "unit", unitsPerPackage: 12 },
  "case-15": { packageName: "Caja de 15", unit: "unit", unitsPerPackage: 15 },
  "case-18": { packageName: "Caja de 18", unit: "unit", unitsPerPackage: 18 },
  "case-24": { packageName: "Caja de 24", unit: "unit", unitsPerPackage: 24 },
  "case-30": { packageName: "Caja de 30", unit: "unit", unitsPerPackage: 30 },
  "case-36": { packageName: "Caja de 36", unit: "unit", unitsPerPackage: 36 },
  "bottle-187": { packageName: "Botella de 187 ml", unit: "ml", unitsPerPackage: 187 },
  "bottle-200": { packageName: "Botella de 200 ml", unit: "ml", unitsPerPackage: 200 },
  "bottle-250": { packageName: "Botella de 250 ml", unit: "ml", unitsPerPackage: 250 },
  "bottle-330": { packageName: "Botella de 330 ml", unit: "ml", unitsPerPackage: 330 },
  "bottle-355": { packageName: "Botella de 355 ml", unit: "ml", unitsPerPackage: 355 },
  "bottle-375": { packageName: "Botella de 375 ml", unit: "ml", unitsPerPackage: 375 },
  "bottle-500": { packageName: "Botella de 500 ml", unit: "ml", unitsPerPackage: 500 },
  "bottle-700": { packageName: "Botella de 700 ml", unit: "ml", unitsPerPackage: 700 },
  "bottle-750": { packageName: "Botella de 750 ml", unit: "ml", unitsPerPackage: 750 },
  "bottle-1000": { packageName: "Botella de 1 L", unit: "ml", unitsPerPackage: 1000 },
  "bottle-1750": { packageName: "Botella de 1.75 L", unit: "ml", unitsPerPackage: 1750 },
  "bottle-3000": { packageName: "Botella de 3 L", unit: "ml", unitsPerPackage: 3000 },
  "keg-20000": { packageName: "Barril de 20 L", unit: "ml", unitsPerPackage: 20000 },
  "keg-30000": { packageName: "Barril de 30 L", unit: "ml", unitsPerPackage: 30000 },
  "keg-50000": { packageName: "Barril de 50 L", unit: "ml", unitsPerPackage: 50000 },
  "bag-250": { packageName: "Bolsa de 250 g", unit: "gram", unitsPerPackage: 250 },
  "bag-500": { packageName: "Bolsa de 500 g", unit: "gram", unitsPerPackage: 500 },
  "bag-1000": { packageName: "Bolsa de 1 kg", unit: "gram", unitsPerPackage: 1000 },
  "bag-5000": { packageName: "Bolsa de 5 kg", unit: "gram", unitsPerPackage: 5000 }
};

function purchasePackageGroup(name, saved = false) {
  if (saved) return "Presentaciones guardadas";
  if (name.startsWith("Botella")) return "Botellas";
  if (name.startsWith("Barril")) return "Barriles";
  if (name.startsWith("Bolsa")) return "Presentaciones por peso";
  return "Unidades, paquetes y cajas";
}

function purchasePackageCatalog() {
  const catalog = [];
  const known = new Set();
  Object.values(itemPackagePresets).forEach((preset) => {
    catalog.push({ name: preset.packageName, unitsPerPackage: Number(preset.unitsPerPackage), saved: false });
    known.add(preset.packageName.toLocaleLowerCase("es"));
  });
  state.purchasePresentations.forEach((presentation) => {
    const name = String(presentation.name || "").trim();
    if (!name || known.has(name.toLocaleLowerCase("es"))) return;
    catalog.push({ name, unitsPerPackage: Number(presentation.unitsPerPackage), saved: true });
    known.add(name.toLocaleLowerCase("es"));
  });
  return catalog;
}

function purchasePackageOptions() {
  const groups = new Map();
  purchasePackageCatalog().forEach((presentation) => {
    const group = purchasePackageGroup(presentation.name, presentation.saved);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(presentation);
  });
  return [
    ...[...groups.entries()].map(([group, presentations]) => `
      <optgroup label="${escapeHtml(group)}">
        ${presentations.map((presentation) => `<option value="${escapeHtml(presentation.name)}">${escapeHtml(presentation.name)}</option>`).join("")}
      </optgroup>`),
    `<option value="${CUSTOM_PACKAGE}">+ Agregar nueva presentación</option>`
  ].join("");
}

function packageSizeForName(name) {
  return purchasePackageCatalog().find((presentation) => presentation.name === name)?.unitsPerPackage || null;
}

function selectedPackageName(row) {
  const selected = $("[name=packageName]", row)?.value || "";
  return selected === CUSTOM_PACKAGE
    ? ($("[name=packageNameCustom]", row)?.value || "").trim()
    : selected;
}

function syncCustomPackageField(row, updateUnits = false) {
  const select = $("[name=packageName]", row);
  const custom = $("[name=packageNameCustom]", row);
  if (!select || !custom) return;
  const isCustom = select.value === CUSTOM_PACKAGE;
  custom.hidden = !isCustom;
  custom.required = isCustom;
  if (!isCustom) {
    custom.value = "";
    if (updateUnits) {
      const units = packageSizeForName(select.value);
      if (units) $("[name=unitsPerPackage]", row).value = units;
    }
  }
}

function openInventoryForm(id) {
  ["new-item-form", "new-product-form", "purchase-form"].forEach((formId) => {
    document.getElementById(formId).hidden = formId !== id;
  });
}

async function loadInsights(event) {
  event?.preventDefault();
  const days = Number(new FormData($("#insights-filter")).get("days") || 30);
  const data = await api(`/api/reports/inventory-intelligence?days=${encodeURIComponent(days)}`);
  state.insights = data;
  const summary = data.summary;
  $("#insights-kpis").innerHTML = [
    kpi("Venta analizada", money.format(summary.revenue || 0), `${data.days} días`),
    kpi("Ganancia bruta", money.format(summary.grossProfit || 0), summary.grossMargin == null ? "Sin ventas" : `${(Number(summary.grossMargin) * 100).toFixed(1)}% de margen`),
    kpi("Merma", money.format(summary.wasteCost || 0), "Costo del período"),
    kpi("Reposiciones", String(summary.reorderCount || 0), `${summary.criticalCount || 0} críticas`)
  ].join("");

  const statusLabels = { critical: "Comprar ahora", soon: "Próximo", stable: "Estable", no_movement: "Sin rotación" };
  const statusClasses = { critical: "badge--danger", soon: "badge--warning", stable: "badge--success", no_movement: "" };
  $("#reorder-table").innerHTML = data.reorder.map((item) => {
    const unit = unitNames[item.unit] || item.unit;
    const coverage = item.daysRemaining == null ? "Sin datos" : `${quantityNumber.format(item.daysRemaining)} días`;
    const buyWhen = item.status === "critical"
      ? "Ahora"
      : item.buyOn
        ? dateOnly.format(new Date(`${item.buyOn}T12:00:00`))
        : "Al definir rotación";
    const suggested = Number(item.recommendedPackages) > 0
      ? `<strong>${quantityNumber.format(item.recommendedPackages)} × ${escapeHtml(item.packageName)}</strong><small>${quantityNumber.format(item.recommendedUnits)} ${escapeHtml(unit)} · ${money.format(item.estimatedPurchaseCost)} estimados</small>`
      : "Sin compra";
    return `<tr>
      <td><span class="badge ${statusClasses[item.status]}">${statusLabels[item.status]}</span></td>
      <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.sku)} · punto de pedido ${quantityNumber.format(item.reorderPoint)} ${escapeHtml(unit)}</small></td>
      <td>${quantityNumber.format(item.averageDailyConsumption)} ${escapeHtml(unit)}<small>${quantityNumber.format(item.consumed)} consumidos en ${data.days} días</small></td>
      <td>${quantityNumber.format(item.currentStock)} ${escapeHtml(unit)}</td>
      <td>${coverage}<small>${item.leadTimeDays} d entrega + ${item.safetyStockDays} d seguridad</small></td>
      <td>${suggested}</td>
      <td><strong>${escapeHtml(buyWhen)}</strong>${item.daysUntilOrder != null ? `<small>En ${item.daysUntilOrder} día(s)</small>` : ""}</td>
    </tr>`;
  }).join("") || '<tr><td colspan="7" class="empty-state">No hay artículos para analizar.</td></tr>';

  $("#profitability-table").innerHTML = data.profitability.map((product) => {
    const currentMargin = Number(product.currentMargin || 0);
    const targetMargin = Number(product.targetMargin || 0);
    const realized = product.realizedMargin == null ? "Sin ventas" : `${(Number(product.realizedMargin) * 100).toFixed(1)}%`;
    return `<tr>
      <td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${escapeHtml(product.category)}</small></td>
      <td>${money.format(product.salePrice)}</td>
      <td>${money.format(product.currentRecipeCost)}</td>
      <td><strong>${money.format(product.suggestedPrice)}</strong><small>Meta ${(targetMargin * 100).toFixed(1)}%</small></td>
      <td class="${Number(product.unitGrossProfit) >= 0 ? "text-positive" : "text-danger"}">${money.format(product.unitGrossProfit)}</td>
      <td><span class="badge ${currentMargin >= targetMargin ? "badge--success" : "badge--warning"}">${(currentMargin * 100).toFixed(1)}%</span></td>
      <td>${quantityNumber.format(product.unitsSold)}<small>${money.format(product.revenue)} vendidos</small></td>
      <td><strong>${money.format(product.grossProfit)}</strong><small>${realized} de margen real</small></td>
    </tr>`;
  }).join("") || '<tr><td colspan="8" class="empty-state">No hay productos para analizar.</td></tr>';

  $("#waste-table").innerHTML = data.waste.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.sku)}</small></td><td>${quantityNumber.format(item.quantity)} ${escapeHtml(unitNames[item.unit] || item.unit)}</td><td class="text-danger"><strong>${money.format(item.cost)}</strong></td></tr>`).join("") || '<tr><td colspan="3" class="empty-state">No se registraron mermas en este período.</td></tr>';
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

$("#quick-sale-mode").addEventListener("click", selectQuickSale);
$("#new-tab-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const customerName = form.elements.customerName.value.trim();
  try {
    const tab = await api("/api/pos/tabs", { method: "POST", body: JSON.stringify({ customerName }) });
    form.reset();
    await loadPosTabs();
    await selectTab(tab.id);
    toast(tab.reused ? "La cuenta ya existía y fue seleccionada." : "Cuenta abierta.");
  } catch (error) { toast(error.message, true); }
});
$("#open-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab-id]");
  if (button) selectTab(Number(button.dataset.tabId)).catch((error) => toast(error.message, true));
});
$("#change-account").addEventListener("click", () => changeAccount().catch((error) => toast(error.message, true)));

$("#product-search").addEventListener("input", debounce(() => {
  state.pagination.pos.page = 1;
  loadPosCatalog().catch((error) => toast(error.message, true));
}));
$("#product-category").addEventListener("change", () => {
  state.pagination.pos.page = 1;
  loadPosCatalog().catch((error) => toast(error.message, true));
});
$("#product-grid").addEventListener("click", (event) => { const button = event.target.closest("[data-product-id]"); if (button) addToCart(Number(button.dataset.productId)); });
$("#cart-lines").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cart-change]");
  if (!button) return;
  const id = Number(button.dataset.productId);
  const product = state.productCache.get(id);
  if (!product) return;
  const next = (state.cart.get(id) || 0) + Number(button.dataset.cartChange);
  if (next > product.available) return toast("No hay más existencias disponibles.", true);
  setCartQuantity(id, next);
});
$("#clear-cart").addEventListener("click", async () => {
  if (!state.posMode) return;
  if (state.posMode === "tab" && state.activeTab) {
    try {
      await state.tabMutation.catch(() => null);
      await api(`/api/pos/tabs/${state.activeTab.id}/clear`, { method: "POST", body: JSON.stringify({}) });
    } catch (error) { return toast(error.message, true); }
  }
  state.cart.clear();
  renderCart();
});
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

$("#show-new-item").addEventListener("click", () => { const form = $("#new-item-form"); form.reset(); refreshCategoryCatalogs(); toggleNewCategory($("#item-category-input"), $("#item-new-category-field")); openInventoryForm("new-item-form"); });
$("#show-new-product").addEventListener("click", () => { if (!state.inventory.length) return toast("Primero cree al menos un artículo físico.", true); const form = $("#new-product-form"); form.reset(); refreshCategoryCatalogs(); toggleNewCategory($("#product-category-input"), $("#product-new-category-field")); setImagePreview(form.elements.image, $("#product-image-preview")); openInventoryForm("new-product-form"); $("#recipe-rows").replaceChildren(); addRecipeRow("recipe"); updateProductPricingPreview(); });
$("#show-purchase").addEventListener("click", () => {
  if (!state.inventory.length) return toast("Primero cree al menos un artículo físico.", true);
  const form = $("#purchase-form");
  form.reset();
  openInventoryForm("purchase-form");
  $("#purchase-rows").replaceChildren();
  addRecipeRow("purchase");
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  form.elements.purchasedAt.value = now;
});
$("#add-recipe-row").addEventListener("click", () => addRecipeRow("recipe"));
$("#add-purchase-row").addEventListener("click", () => addRecipeRow("purchase"));
$("#recipe-rows").addEventListener("click", (event) => { if (event.target.closest("[data-remove-row]") && $$(".recipe-row", $("#recipe-rows")).length > 1) { event.target.closest(".recipe-row").remove(); updateProductPricingPreview(); } });
$("#purchase-rows").addEventListener("click", (event) => { if (event.target.closest("[data-remove-row]") && $$(".recipe-row", $("#purchase-rows")).length > 1) event.target.closest(".recipe-row").remove(); });
$("#recipe-rows").addEventListener("change", (event) => { const row = event.target.closest(".recipe-row"); if (row) updateInventoryRow(row, "recipe"); });
$("#recipe-rows").addEventListener("input", (event) => { const row = event.target.closest(".recipe-row"); if (row) updateInventoryRow(row, "recipe"); });
$("#purchase-rows").addEventListener("change", (event) => {
  const row = event.target.closest(".recipe-row");
  if (!row) return;
  if (event.target.name === "packageName") syncCustomPackageField(row, true);
  updateInventoryRow(row, "purchase", event.target.name === "itemId");
});
$("#purchase-rows").addEventListener("input", (event) => {
  const row = event.target.closest(".recipe-row");
  if (!row) return;
  if (event.target.name === "packageName") {
    syncCustomPackageField(row, true);
  }
  updateInventoryRow(row, "purchase");
});
$("#item-category-input").addEventListener("change", () => toggleNewCategory($("#item-category-input"), $("#item-new-category-field")));
$("#product-category-input").addEventListener("change", () => toggleNewCategory($("#product-category-input"), $("#product-new-category-field")));
$("#new-product-form [name=image]").addEventListener("change", (event) => setImagePreview(event.currentTarget, $("#product-image-preview")));
$("#new-product-form").addEventListener("input", updateProductPricingPreview);
$$('[data-cancel-form]').forEach((button) => button.addEventListener("click", () => { const form = document.getElementById(button.dataset.cancelForm); form.hidden = true; form.reset(); if (form.id === "new-product-form") setImagePreview(form.elements.image, $("#product-image-preview")); }));
$("#new-item-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formValues(form); try { await api("/api/inventory/items", { method: "POST", body: JSON.stringify({ sku: values.sku, name: values.name, category: categoryFromForm(form), unit: values.unit, minimumStock: Number(values.minimumStock || 0), leadTimeDays: Number(values.leadTimeDays || 0), safetyStockDays: Number(values.safetyStockDays || 0), targetStockDays: Number(values.targetStockDays || 14) }) }); form.reset(); form.hidden = true; state.catalogReady = false; state.pagination.articles.page = 1; toast("Artículo físico creado. Registre su existencia mediante una compra."); await loadInventory(); } catch (error) { toast(error.message, true); } });
$("#new-product-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formValues(form); const image = form.elements.image.files?.[0]; try { const result = await api("/api/inventory/products", { method: "POST", body: JSON.stringify({ sku: values.sku, name: values.name, category: categoryFromForm(form), barcode: values.barcode || null, salePrice: Number(values.salePrice), targetMargin: Number(values.targetMargin || 70) / 100, taxRate: Number(values.taxRate || 0) / 100, recipe: collectRows("#recipe-rows") }) }); if (image) { try { await uploadProductImage(result.id, image); } catch (uploadError) { toast(`Producto creado con la imagen predeterminada; la foto seleccionada no se guardó: ${uploadError.message}`, true); await loadInventory(); return; } } form.reset(); form.hidden = true; setImagePreview(form.elements.image, $("#product-image-preview")); toast(`Producto creado · precio sugerido ${money.format(result.suggestedPrice)}.`); await loadInventory(); } catch (error) { toast(error.message, true); } });
$("#purchase-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  try {
    await api("/api/inventory/purchases", {
      method: "POST",
      body: JSON.stringify({
        invoiceNumber: values.invoiceNumber || null,
        purchasedAt: new Date(values.purchasedAt).toISOString(),
        notes: values.notes,
        items: collectRows("#purchase-rows")
      })
    });
    form.reset();
    form.hidden = true;
    state.catalogReady = false;
    toast("Compra recibida e inventario actualizado.");
    await loadInventory();
  } catch (error) { toast(error.message, true); }
});
$("#inventory-search").addEventListener("input", debounce(() => {
  state.pagination.inventory.page = 1;
  loadInventoryPage().catch((error) => toast(error.message, true));
}));
$("#articles-search").addEventListener("input", debounce(() => {
  state.pagination.articles.page = 1;
  loadArticlesPage().catch((error) => toast(error.message, true));
}));
$("#products-search").addEventListener("input", debounce(() => {
  state.pagination.products.page = 1;
  loadProductsPage().catch((error) => toast(error.message, true));
}));
bindPagination("pos-pagination", "pos", loadPosCatalog);
bindPagination("inventory-pagination", "inventory", loadInventoryPage);
bindPagination("articles-pagination", "articles", loadArticlesPage);
bindPagination("products-pagination", "products", loadProductsPage);
$$("[data-go-inventory]").forEach((button) => button.addEventListener("click", () => navigate("inventory")));
$("#inventory-table").addEventListener("click", (event) => { const button = event.target.closest("[data-adjust-id]"); if (!button) return; const item = state.inventoryRows.find((row) => Number(row.id) === Number(button.dataset.adjustId)); if (!item) return; $("#adjust-form [name=itemId]").value = item.id; $("#adjust-item-name").textContent = `${item.name} · Existencia ${Number(item.currentStock).toFixed(3)} ${unitNames[item.unit] || item.unit}`; $("#adjust-dialog").showModal(); });
$("#inventory-products-table").addEventListener("click", (event) => { const button = event.target.closest("[data-product-image-id]"); if (!button) return; const product = state.inventoryProducts.find((row) => Number(row.id) === Number(button.dataset.productImageId)); if (!product) return; const form = $("#product-image-form"); form.reset(); form.elements.productId.value = product.id; $("#product-image-name").textContent = product.name; setImagePreview(form.elements.image, $("#product-image-dialog-preview")); $("#product-image-dialog").showModal(); });
$("#product-image-form [name=image]").addEventListener("change", (event) => setImagePreview(event.currentTarget, $("#product-image-dialog-preview")));
$("#product-image-form").addEventListener("submit", async (event) => { event.preventDefault(); if (event.submitter?.value === "cancel") return $("#product-image-dialog").close(); const form = event.currentTarget; const image = form.elements.image.files?.[0]; if (!image) return toast("Seleccione una fotografía.", true); try { await uploadProductImage(Number(form.elements.productId.value), image); $("#product-image-dialog").close(); form.reset(); setImagePreview(form.elements.image, $("#product-image-dialog-preview")); toast("Fotografía del producto actualizada."); await loadInventory(); } catch (error) { toast(error.message, true); } });
$("#adjust-form").addEventListener("submit", async (event) => { event.preventDefault(); if (event.submitter?.value === "cancel") return $("#adjust-dialog").close(); const form = event.currentTarget; const values = formValues(form); try { await api("/api/inventory/movements", { method: "POST", body: JSON.stringify({ itemId: Number(values.itemId), type: values.type, quantity: Number(values.quantity), notes: values.notes }) }); $("#adjust-dialog").close(); form.reset(); state.catalogReady = false; toast("Inventario actualizado."); await loadInventory(); } catch (error) { toast(error.message, true); } });

$("#open-cash-form").addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); const message = $(".form-message", event.currentTarget); try { await api("/api/cash/sessions/open", { method: "POST", body: JSON.stringify({ terminalId: Number(values.terminalId), openingAmount: Number(values.openingAmount) }) }); message.textContent = ""; toast("Caja abierta."); await loadCash(); } catch (error) { message.textContent = error.message; } });
$("#current-cash-session").addEventListener("click", (event) => { const button = event.target.closest("[data-close-session]"); if (!button) return; $("#close-form [name=sessionId]").value = button.dataset.closeSession; $("#close-dialog").showModal(); });
$("#close-form").addEventListener("submit", async (event) => { event.preventDefault(); if (event.submitter?.value === "cancel") return $("#close-dialog").close(); const form = event.currentTarget; const values = formValues(form); try { const result = await api(`/api/cash/sessions/${values.sessionId}/close`, { method: "POST", body: JSON.stringify({ countedCash: Number(values.countedCash), notes: values.notes }) }); $("#close-dialog").close(); form.reset(); toast(`Caja cerrada. Diferencia: ${money.format(result.difference)}`, Math.abs(result.difference) > .01); await loadCash(); } catch (error) { toast(error.message, true); } });

$("#report-filter").addEventListener("submit", loadReports);
$("#insights-filter").addEventListener("submit", loadInsights);
$("#insights-days").addEventListener("change", () => loadInsights().catch((error) => toast(error.message, true)));
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
