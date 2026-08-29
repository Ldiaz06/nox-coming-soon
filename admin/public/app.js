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
  selectedArticleIds: new Set(),
  selectedProductIds: new Set(),
  purchasePresentations: [],
  users: [],
  cashSessions: [],
  terminals: [],
  insights: null,
  events: [],
  selectedEvent: null,
  guestLists: [],
  eventGuests: [],
  eventAccesses: [],
  selectedGuestListId: "all",
  selectedGuestIds: new Set(),
  guestImport: {
    fileName: "",
    rows: [],
    errors: []
  },
  inventoryImport: {
    fileName: "",
    payload: null,
    preview: null
  },
  qrDownloadName: "noox-acceso.png",
  qrShareUrl: "",
  scanner: {
    stream: null,
    frame: null,
    locked: false,
    lastToken: null,
    absentFrames: 0,
    lastFrameAt: 0
  },
  cart: new Map(),
  posMode: null,
  activeTab: null,
  openTabs: [],
  tabMutation: Promise.resolve(),
  tabContextVersion: 0,
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
const inventoryCost = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const dateTime = new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Panama" });
const dateOnly = new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeZone: "America/Panama" });
const roleNames = { admin: "Administrador", supervisor: "Supervisor", cashier: "Cajero" };
const paymentMethodNames = { cash: "Efectivo", card: "Tarjeta", yappy: "Yappy" };
const sectionNames = { dashboard: "Resumen", pos: "Punto de venta", events: "Eventos y accesos", inventory: "Inventario", articles: "Artículos", products: "Productos", insights: "Costos y reposición", cash: "Cajas", reports: "Reportes", workforce: "Personal", payroll: "Planilla", users: "Usuarios" };
const unitNames = { unit: "unidad", bottle: "botella", can: "lata", ml: "ml", liter: "litro", fluid_ounce: "oz líquida", gram: "g", kg: "kg", portion: "porción", pack: "paquete", case: "caja", keg: "barril" };
const quantityNumber = new Intl.NumberFormat("es-PA", { maximumFractionDigits: 4 });
const panamaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const NEW_CATEGORY = "__new_category__";
const CUSTOM_PACKAGE = "__custom_package__";
const DEFAULT_PRODUCT_IMAGE = "/assets/product-default-v3.webp";
const PRODUCT_IMAGE_SIZE = 768;
const PRODUCT_IMAGE_QUALITY = 0.82;
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
  const { timeout = 30000, ...requestOptions } = options;
  const method = String(requestOptions.method || "GET").toUpperCase();
  const headers = { ...(requestOptions.headers || {}) };
  if (requestOptions.body && !(requestOptions.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && state.csrf) headers["X-CSRF-Token"] = state.csrf;
  const requested = new URL(path, window.location.origin);
  const endpoint = new URL("index.php", document.baseURI);
  endpoint.searchParams.set("api_path", requested.pathname.replace(/^\/api\/?/, ""));
  requested.searchParams.forEach((value, key) => endpoint.searchParams.append(key, value));
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(endpoint, {
      credentials: "same-origin",
      ...requestOptions,
      headers,
      signal: controller.signal
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
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("El servidor no respondió a tiempo. Intente nuevamente o contacte al administrador.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
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
  const optimizedFile = await normalizeProductImage(file);
  const body = new FormData();
  body.append("image", optimizedFile);
  return api(`/api/inventory/products/${productId}/image`, { method: "POST", body });
}

async function normalizeProductImage(file) {
  if (!(file instanceof File)) throw new Error("Seleccione una fotografía válida.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Use una fotografía JPG, PNG o WebP.");
  }
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
    throw new Error("La fotografía debe pesar como máximo 5 MB.");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error("No fue posible leer la fotografía seleccionada.");
    }
  }
  try {
    if (bitmap.width < 32 || bitmap.height < 32 || bitmap.width > 8000 || bitmap.height > 8000
        || bitmap.width * bitmap.height > 25000000) {
      throw new Error("La fotografía debe medir entre 32 y 8000 píxeles por lado y no superar 25 megapíxeles.");
    }
    const sourceSize = Math.min(bitmap.width, bitmap.height);
    const sourceX = Math.floor((bitmap.width - sourceSize) / 2);
    const sourceY = Math.floor((bitmap.height - sourceSize) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = PRODUCT_IMAGE_SIZE;
    canvas.height = PRODUCT_IMAGE_SIZE;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("El navegador no pudo preparar la fotografía.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      sourceX, sourceY, sourceSize, sourceSize,
      0, 0, PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE
    );
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", PRODUCT_IMAGE_QUALITY));
    if (!blob) throw new Error("El navegador no pudo convertir la fotografía a WebP.");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "producto";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function showLogin() {
  stopEventScanner();
  resetInventoryImport(true);
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
  $$('[data-event-manage]').forEach((element) => {
    element.classList.toggle("is-role-hidden", !["admin", "supervisor"].includes(user.role));
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
    if (user) showApp(user, csrf);
    else showLogin();
  } catch {
    showLogin();
  }
}

async function navigate(section) {
  const button = $(`#main-nav [data-section="${section}"]`);
  if (!button || button.hidden) return;
  if (state.section === "events" && section !== "events") stopEventScanner();
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
    const loaders = { dashboard: loadDashboard, pos: loadPos, events: loadEvents, inventory: loadInventory, articles: loadInventory, products: loadInventory, insights: loadInsights, cash: loadCash, reports: loadReports, workforce: loadWorkforce, payroll: loadPayroll, users: loadUsers };
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

const eventModeNames = { shared: "QR general", personal: "QR por persona" };
const eventStatusNames = { active: "Activo", closed: "Cerrado", cancelled: "Cancelado" };
const accessDecisionNames = { granted: "Autorizado", duplicate: "Duplicado", denied: "Denegado" };

function parseServerDate(value) {
  if (!value) return null;
  const normalized = String(value).includes("T") ? String(value) : String(value).replace(" ", "T");
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}-05:00`);
}

function eventDateRange(event) {
  const start = parseServerDate(event.startsAt);
  const end = parseServerDate(event.endsAt);
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Horario no disponible";
  return `${dateTime.format(start)} → ${dateTime.format(end)}`;
}

function eventStatusBadge(status) {
  const className = status === "active" ? "badge--success" : "badge--danger";
  return `<span class="badge ${className}">${escapeHtml(eventStatusNames[status] || status)}</span>`;
}

async function loadEvents() {
  const selectedId = Number(state.selectedEvent?.id || 0);
  const { events } = await api("/api/events");
  state.events = events;
  const totalAdmitted = events.reduce((sum, event) => sum + Number(event.admittedCount || 0), 0);
  const activeEvents = events.filter((event) => event.status === "active");
  const personalEvents = events.filter((event) => event.accessMode === "personal").length;
  $("#events-kpis").innerHTML = [
    kpi("Eventos activos", String(activeEvents.length), `${events.length} en el historial`),
    kpi("Entradas registradas", String(totalAdmitted), "Acumulado de eventos"),
    kpi("Control personal", String(personalEvents), "Eventos con QR individual"),
    kpi("Escáner", window.isSecureContext ? "Disponible" : "Requiere HTTPS", window.isSecureContext ? "iOS y Android" : "Abra el panel seguro")
  ].join("");
  renderEventList();
  const preferred = events.find((event) => Number(event.id) === selectedId)
    || activeEvents.find((event) => parseServerDate(event.endsAt) >= new Date())
    || events[0];
  if (preferred) {
    await openEvent(preferred.id);
  } else {
    state.selectedEvent = null;
    $("#event-detail").hidden = true;
  }
}

function renderEventList() {
  const container = $("#events-list");
  if (!state.events.length) {
    container.innerHTML = '<p class="empty-state">Todavía no hay eventos. Cree el primero para generar sus accesos QR.</p>';
    return;
  }
  container.innerHTML = state.events.map((event) => `
    <button type="button" class="event-card" data-event-id="${event.id}" ${Number(state.selectedEvent?.id) === Number(event.id) ? 'aria-current="true"' : ""}>
      <span>
        <strong>${escapeHtml(event.name)}</strong>
        <small>${escapeHtml(eventModeNames[event.accessMode])} · ${escapeHtml(eventDateRange(event))}</small>
      </span>
      <span>
        <b>${Number(event.admittedCount || 0)}${event.capacity ? `/${Number(event.capacity)}` : ""}</b>
        <small>${eventStatusBadge(event.status)}</small>
      </span>
    </button>`).join("");
}

async function openEvent(eventId) {
  const changedEvent = Number(state.selectedEvent?.id || 0) !== Number(eventId);
  const detail = await api(`/api/events/${eventId}`);
  state.selectedEvent = detail.event;
  state.guestLists = detail.guestLists || [];
  state.eventGuests = detail.guests;
  state.eventAccesses = detail.accesses;
  if (changedEvent) {
    state.selectedGuestListId = "all";
    state.selectedGuestIds.clear();
    resetGuestImport();
  } else if (state.selectedGuestListId !== "all"
    && !state.guestLists.some((list) => Number(list.id) === Number(state.selectedGuestListId))) {
    state.selectedGuestListId = "all";
    state.selectedGuestIds.clear();
  }
  renderEventList();
  renderEventDetail();
}

function activeGuestList() {
  if (state.selectedGuestListId === "all") return null;
  return state.guestLists.find((list) => Number(list.id) === Number(state.selectedGuestListId)) || null;
}

function filteredEventGuests() {
  if (state.selectedGuestListId === "all") return state.eventGuests;
  return state.eventGuests.filter((guest) => Number(guest.listId) === Number(state.selectedGuestListId));
}

function guestListOptions(selectedValue = "") {
  return state.guestLists.map((list) => `
    <option value="${list.id}" ${Number(selectedValue) === Number(list.id) ? "selected" : ""}>
      ${escapeHtml(list.name)} (${Number(list.guestCount || 0)})
    </option>`).join("");
}

function renderGuestLists() {
  const active = activeGuestList();
  const filter = $("#guest-list-filter");
  filter.innerHTML = `<option value="all">Todas las listas (${state.eventGuests.length})</option>${guestListOptions(state.selectedGuestListId)}`;
  filter.value = state.selectedGuestListId === "all" ? "all" : String(state.selectedGuestListId);
  $("#guest-list-summary").textContent = `${state.guestLists.length} ${state.guestLists.length === 1 ? "lista" : "listas"}`;
  $("#rename-guest-list").disabled = !active;
  $("#delete-guest-list").disabled = !active;
  const promoterEnabled = active && Number(active.promoterCodeEnabled) === 1;
  $("#promoter-code-status").textContent = !active
    ? "Seleccione una lista para administrar su código."
    : promoterEnabled
      ? `Código activo · termina en ${active.promoterCodeHint || "••••••"}`
      : "Esta lista todavía no tiene un código público activo.";
  $("#generate-promoter-code").disabled = !active;
  $("#generate-promoter-code").textContent = promoterEnabled ? "Regenerar código" : "Generar código";
  $("#revoke-promoter-code").hidden = !promoterEnabled;

  const preferredListId = active?.id || state.guestLists[0]?.id || "";
  $("#guest-import-list").innerHTML = guestListOptions(preferredListId);
  $("#new-guest-list").innerHTML = guestListOptions(preferredListId);
  $("#edit-guest-form [name=listId]").innerHTML = guestListOptions();
  const hasLists = state.guestLists.length > 0;
  $("#guest-import-list").disabled = !hasLists;
  $("#new-guest-list").disabled = !hasLists;
  $("#new-guest-form button[type=submit]").disabled = !hasLists;
}

function renderEventDetail() {
  const event = state.selectedEvent;
  if (!event) {
    $("#event-detail").hidden = true;
    return;
  }
  $("#event-detail").hidden = false;
  $("#event-detail-mode").textContent = `${eventModeNames[event.accessMode]} · ${eventStatusNames[event.status]}`;
  $("#event-detail-name").textContent = event.name;
  $("#event-detail-notes").textContent = event.notes || "Sin notas internas.";
  $("#event-detail-stats").innerHTML = [
    `<div class="event-stat"><small>Entradas</small><strong>${Number(event.admittedCount || 0)}</strong></div>`,
    `<div class="event-stat"><small>Capacidad</small><strong>${event.capacity ? Number(event.capacity) : "Sin límite"}</strong></div>`,
    `<div class="event-stat"><small>Modalidad</small><strong>${escapeHtml(eventModeNames[event.accessMode])}</strong></div>`,
    `<div class="event-stat"><small>Horario</small><strong>${escapeHtml(eventDateRange(event))}</strong></div>`
  ].join("");
  const shared = event.accessMode === "shared";
  $("#show-event-qr").hidden = !shared || !event.sharedQrToken;
  $("#personal-event-area").hidden = shared;
  $("#toggle-event-status").textContent = event.status === "active" ? "Cerrar evento" : "Reactivar evento";
  $("#toggle-event-status").dataset.nextStatus = event.status === "active" ? "closed" : "active";
  $("#toggle-event-status").hidden = !["admin", "supervisor"].includes(state.user.role) || event.status === "cancelled";
  renderGuestLists();
  renderEventGuests();
  renderEventAccesses();
}

function renderEventGuests() {
  const guests = filteredEventGuests();
  const activeList = activeGuestList();
  const canManage = ["admin", "supervisor"].includes(state.user.role);
  const visibleIds = new Set(guests.map((guest) => Number(guest.id)));
  [...state.selectedGuestIds].forEach((id) => {
    if (!visibleIds.has(id)) state.selectedGuestIds.delete(id);
  });
  $("#guest-table-title").textContent = activeList?.name || "Todas las listas";
  $("#guest-count").textContent = state.selectedGuestListId === "all"
    ? `${guests.length} invitaciones`
    : `${guests.length} de ${state.eventGuests.length}`;
  $("#event-guests-table").innerHTML = guests.length ? guests.map((guest) => {
    const active = guest.status === "invited";
    const statusClass = guest.status === "admitted" ? "badge--success" : guest.status === "cancelled" ? "badge--danger" : "badge--gold";
    const statusName = guest.status === "admitted" ? "Admitido" : guest.status === "cancelled" ? "Cancelado" : "Invitado";
    const managerActions = canManage && guest.status !== "admitted"
      ? `<button class="table-action" data-guest-reissue="${guest.id}">Reemitir</button>
         <button class="table-action" data-guest-status="${guest.id}" data-status="${active ? "cancelled" : "invited"}">${active ? "Cancelar" : "Restaurar"}</button>`
      : "";
    return `<tr>
      <td class="select-column">${canManage ? `<input class="row-select" type="checkbox" data-select-guest="${guest.id}" aria-label="Seleccionar ${escapeHtml(guest.fullName)}" ${state.selectedGuestIds.has(Number(guest.id)) ? "checked" : ""}>` : ""}</td>
      <td class="guest-name-cell"><strong>${escapeHtml(guest.fullName)}</strong><small>${escapeHtml(guest.notes || "Sin nota")}</small></td>
      <td>${escapeHtml(guest.listName || "Sin lista")}</td>
      <td>${escapeHtml(guest.contact || "—")}</td>
      <td><span class="badge ${statusClass}">${statusName}</span></td>
      <td>${guest.admittedAt ? dateTime.format(parseServerDate(guest.admittedAt)) : "Pendiente"}</td>
      <td>${canManage ? `<button class="table-action" data-guest-edit="${guest.id}">Editar</button>
        <button class="table-action" data-guest-qr="${guest.id}">Ver QR</button>
        <button class="table-action" data-guest-share="${guest.id}">Compartir enlace</button>` : ""}${managerActions}</td>
    </tr>`;
  }).join("") : '<tr><td colspan="7"><p class="empty-state">Esta lista todavía no tiene invitados.</p></td></tr>';

  const selectedCount = state.selectedGuestIds.size;
  $("#guest-selection-toolbar").hidden = !canManage;
  $("#guest-selection-count").textContent = `${selectedCount} ${selectedCount === 1 ? "seleccionado" : "seleccionados"}`;
  $("#edit-selected-guest").disabled = selectedCount !== 1;
  $("#delete-selected-guests").disabled = selectedCount < 1;
  $("#clear-guest-list").disabled = guests.length < 1;
  $("#clear-guest-list").textContent = state.selectedGuestListId === "all"
    ? "Eliminar todos los invitados"
    : "Vaciar lista completa";
  $("#download-guest-list").disabled = guests.length < 1;
  const selectAll = $("#select-all-event-guests");
  selectAll.hidden = !canManage;
  selectAll.checked = guests.length > 0 && guests.every((guest) => state.selectedGuestIds.has(Number(guest.id)));
  selectAll.indeterminate = selectedCount > 0 && !selectAll.checked;
}

function openGuestEditor(guestId) {
  const guest = state.eventGuests.find((item) => Number(item.id) === Number(guestId));
  if (!guest) return;
  const form = $("#edit-guest-form");
  form.reset();
  form.elements.id.value = guest.id;
  form.elements.fullName.value = guest.fullName;
  form.elements.contact.value = guest.contact || "";
  form.elements.notes.value = guest.notes || "";
  form.elements.listId.innerHTML = guestListOptions(guest.listId);
  form.elements.listId.value = String(guest.listId || state.guestLists[0]?.id || "");
  $("#edit-guest-dialog").showModal();
}

function guestStatusLabel(status) {
  return status === "admitted" ? "Admitido" : status === "cancelled" ? "Cancelado" : "Invitado";
}

async function downloadGuestList() {
  const guests = filteredEventGuests();
  if (!guests.length || !state.selectedEvent) return;
  const XLSX = await loadSpreadsheetLibrary();
  const rows = guests.map((guest) => ({
    "Lista": guest.listName || "Sin lista",
    "Nombre completo": guest.fullName,
    "Contacto": guest.contact || "",
    "Notas": guest.notes || "",
    "Estado": guestStatusLabel(guest.status),
    "Entrada registrada": guest.admittedAt ? dateTime.format(parseServerDate(guest.admittedAt)) : "",
    "Token único": guest.qrToken,
    "Contenido QR": `NOX1:${guest.qrToken}`,
    "Enlace público": invitationPublicUrl(guest.qrToken),
    "Fecha de creación": guest.createdAt ? dateTime.format(parseServerDate(guest.createdAt)) : ""
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 24 }, { wch: 30 }, { wch: 28 }, { wch: 34 }, { wch: 16 },
    { wch: 22 }, { wch: 36 }, { wch: 42 }, { wch: 72 }, { wch: 22 }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Invitados");
  const listName = activeGuestList()?.name || "todas-las-listas";
  XLSX.writeFile(
    workbook,
    `${safeFileName(state.selectedEvent.name)}-${safeFileName(listName)}-invitados.xlsx`,
    { compression: true }
  );
}

const GUEST_IMPORT_MAX_ROWS = 500;
const GUEST_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;
let spreadsheetLibraryPromise = null;

function guestImportEmptyState(fileName = "") {
  return { fileName, rows: [], errors: [] };
}

function resetGuestImport() {
  state.guestImport = guestImportEmptyState();
  const input = $("#guest-import-file");
  if (!input) return;
  input.value = "";
  $("#guest-paste-text").value = "";
  $("#guest-import-file-name").textContent = "Formatos admitidos: .xlsx, .xls y .csv · máximo 500 invitados";
  $("#guest-import-preview").hidden = true;
  $("#guest-import-table").replaceChildren();
  $("#guest-import-errors").textContent = "";
  const button = $("#import-guests-button");
  button.disabled = true;
  button.textContent = "Importar invitados";
}

function loadSpreadsheetLibrary() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (spreadsheetLibraryPromise) return spreadsheetLibraryPromise;
  spreadsheetLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/sheetjs/xlsx.full.min.js?v=0.20.3";
    script.onload = () => window.XLSX
      ? resolve(window.XLSX)
      : reject(new Error("No fue posible iniciar el lector de Excel."));
    script.onerror = () => reject(new Error("No fue posible cargar el lector de Excel."));
    document.head.append(script);
  }).catch((error) => {
    spreadsheetLibraryPromise = null;
    throw error;
  });
  return spreadsheetLibraryPromise;
}

const INVENTORY_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;

function resetInventoryImport(close = false) {
  state.inventoryImport = { fileName: "", payload: null, preview: null };
  const input = $("#inventory-import-file");
  if (!input) return;
  input.value = "";
  $("#inventory-import-file-name").textContent = "Formatos admitidos: .xlsx y .xls · máximo 500 filas";
  $("#inventory-import-preview").hidden = true;
  $("#inventory-import-summary").replaceChildren();
  $("#inventory-import-table").replaceChildren();
  $("#inventory-import-errors").textContent = "";
  $("#commit-inventory-import").disabled = true;
  if (close) $("#inventory-import-panel").hidden = true;
}

function inventoryImportCellValue(value, header) {
  if (header === "purchasedAt" && typeof value === "number") {
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return value ?? "";
}

function parseInventoryWorkbook(fileData) {
  let workbook;
  try {
    workbook = window.XLSX.read(fileData, { type: "array", cellDates: false });
  } catch {
    throw new Error("No fue posible leer el archivo. Verifique que sea un Excel válido y que no tenga contraseña.");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no contiene ninguna hoja.");
  const grid = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
    raw: true
  });
  const headerIndex = grid.findIndex((row) => row.some((value) => String(value ?? "").trim() !== ""));
  if (headerIndex < 0) throw new Error("La hoja está vacía.");
  const headers = grid[headerIndex].map((value) => String(value ?? "").trim());
  const rows = grid.slice(headerIndex + 1).flatMap((source) => {
    if (!source.some((value) => String(value ?? "").trim() !== "")) return [];
    const record = {};
    headers.forEach((header, index) => {
      if (header) record[header] = inventoryImportCellValue(source[index], header);
    });
    return [record];
  });
  return { sheetCount: workbook.SheetNames.length, sheetName, headers, rows };
}

function renderInventoryImportPreview() {
  const preview = state.inventoryImport.preview;
  if (!preview) return;
  const summary = preview.summary;
  $("#inventory-import-summary").innerHTML = [
    ["Filas", summary.rows],
    ["Facturas", summary.invoices],
    ["Artículos nuevos", summary.newItems],
    ["Artículos existentes", summary.existingItems],
    ["Advertencias", summary.warnings],
    ["Total de compras", money.format(summary.total)]
  ].map(([label, value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join("");

  $("#inventory-import-table").innerHTML = preview.rows.map((row) => {
    const hasErrors = row.errors.length > 0;
    const hasWarnings = row.warnings.length > 0;
    const rowClass = hasErrors ? "inventory-import-row--error" : (hasWarnings ? "inventory-import-row--warning" : "");
    const statusClass = hasErrors ? "is-error" : (row.action === "create" ? "is-new" : "");
    const status = hasErrors ? "Revisar" : (row.action === "create" ? "Crear artículo" : "Actualizar stock");
    const issues = [
      ...row.errors.map((issue) => `<span>${escapeHtml(issue)}</span>`),
      ...row.warnings.map((issue) => `<small>${escapeHtml(issue)}</small>`)
    ].join("") || `<small>${escapeHtml(row.schemaVersion)} · ${escapeHtml(row.operation)}</small>`;
    return `<tr class="${rowClass}">
      <td>${row.rowNumber}</td>
      <td><span class="inventory-import-status ${statusClass}">${status}</span></td>
      <td><strong>${escapeHtml(row.invoiceNumber)}</strong><small>${escapeHtml(row.purchasedAt || "Fecha inválida")}</small></td>
      <td><strong>${escapeHtml(row.sku)}</strong><small>${escapeHtml(row.name)} · ${escapeHtml(row.category)}</small></td>
      <td><strong>${escapeHtml(row.packageName)}</strong><small>${quantityNumber.format(Number(row.unitsPerPackage || 0))} ${escapeHtml(unitNames[row.unit] || row.unit || "")}</small></td>
      <td><small>Mín. ${quantityNumber.format(Number(row.minimumStock || 0))} · entrega ${row.leadTimeDays ?? "—"} d<br>Seguridad ${row.safetyStockDays ?? "—"} d · objetivo ${row.targetStockDays ?? "—"} d</small></td>
      <td>${quantityNumber.format(Number(row.packageQuantity || 0))}</td>
      <td>${row.packageCost === null ? "—" : inventoryCost.format(row.packageCost)}</td>
      <td><strong>${row.lineTotal === null ? "—" : money.format(row.lineTotal)}</strong></td>
      <td><small>${escapeHtml(row.notes || "—")}</small></td>
      <td><div class="inventory-import-issues">${issues}</div></td>
    </tr>`;
  }).join("") || '<tr><td colspan="11" class="empty-state">No hay filas para mostrar.</td></tr>';

  const errorsElement = $("#inventory-import-errors");
  const globalErrors = preview.globalErrors || [];
  errorsElement.classList.toggle("is-valid", preview.valid);
  if (globalErrors.length) {
    errorsElement.textContent = globalErrors.join(" ");
  } else if (!preview.valid) {
    errorsElement.textContent = `${summary.errors} error${summary.errors === 1 ? "" : "es"} por corregir. No se guardará ningún dato.`;
  } else if (summary.warnings) {
    errorsElement.textContent = `Archivo válido con ${summary.warnings} advertencia${summary.warnings === 1 ? "" : "s"}. Revise las filas resaltadas antes de confirmar.`;
  } else {
    errorsElement.textContent = "Todos los datos fueron verificados. Puede confirmar la importación.";
  }
  $("#commit-inventory-import").disabled = !preview.valid;
  $("#inventory-import-preview").hidden = false;
}

async function previewInventoryImport(file) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Seleccione un archivo .xlsx o .xls.");
  if (file.size > INVENTORY_IMPORT_MAX_FILE_SIZE) throw new Error("El archivo supera el máximo de 5 MB.");
  $("#inventory-import-file-name").textContent = `Leyendo y verificando ${file.name}…`;
  await loadSpreadsheetLibrary();
  const payload = parseInventoryWorkbook(await file.arrayBuffer());
  const preview = await api("/api/inventory/import/preview", {
    method: "POST",
    body: JSON.stringify(payload),
    timeout: 60000
  });
  state.inventoryImport = { fileName: file.name, payload, preview };
  $("#inventory-import-file-name").textContent = file.name;
  renderInventoryImportPreview();
}

function normalizeSpreadsheetHeader(value) {
  return repairGuestTextEncoding(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const windows1252ByteByCharacter = new Map([
  ["€", 0x80], ["‚", 0x82], ["ƒ", 0x83], ["„", 0x84], ["…", 0x85],
  ["†", 0x86], ["‡", 0x87], ["ˆ", 0x88], ["‰", 0x89], ["Š", 0x8a],
  ["‹", 0x8b], ["Œ", 0x8c], ["Ž", 0x8e], ["‘", 0x91], ["’", 0x92],
  ["“", 0x93], ["”", 0x94], ["•", 0x95], ["–", 0x96], ["—", 0x97],
  ["˜", 0x98], ["™", 0x99], ["š", 0x9a], ["›", 0x9b], ["œ", 0x9c],
  ["ž", 0x9e], ["Ÿ", 0x9f]
]);

function decodeMojibakeSequence(sequence) {
  const bytes = [];
  for (const character of sequence) {
    const code = character.codePointAt(0);
    const byte = code <= 0xff ? code : windows1252ByteByCharacter.get(character);
    if (byte === undefined) return sequence;
    bytes.push(byte);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return sequence;
  }
}

function repairGuestTextEncoding(value) {
  const source = String(value ?? "");
  const repaired = source.replace(/(?:Ã.|Â.|â..)+/gu, (sequence) => decodeMojibakeSequence(sequence));
  return repaired.normalize("NFC");
}

function cleanGuestText(value) {
  return repairGuestTextEncoding(value)
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/gu, " ")
    .replace(/[\u200b\u2060\ufeff]/gu, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function spreadsheetCellText(value) {
  return cleanGuestText(value);
}

function guestImportColumn(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(normalizeSpreadsheetHeader(header)));
}

function validateGuestImportRows(rows) {
  const seen = new Map();
  rows.forEach((row) => {
    row.fullName = cleanGuestText(row.fullName);
    row.contact = cleanGuestText(row.contact);
    row.notes = cleanGuestText(row.notes);
    row.issues = [];
    if (row.fullName.length < 2 || row.fullName.length > 160) row.issues.push("El nombre debe tener entre 2 y 160 caracteres.");
    if (row.contact.length > 160) row.issues.push("El contacto supera 160 caracteres.");
    if (row.notes.length > 300) row.issues.push("Las notas superan 300 caracteres.");
    const fingerprint = [row.fullName, row.contact, row.notes]
      .map((value) => value.toLocaleLowerCase("es"))
      .join("\u0000");
    if (fingerprint !== "\u0000\u0000" && seen.has(fingerprint)) {
      row.issues.push(`Repite exactamente la fila ${seen.get(fingerprint)}.`);
    } else {
      seen.set(fingerprint, row.rowNumber);
    }
  });
  const errors = rows.flatMap((row) => row.issues.map((issue) => `Fila ${row.rowNumber}: ${issue}`));
  if (rows.length > GUEST_IMPORT_MAX_ROWS) {
    errors.unshift(`La lista contiene ${rows.length} invitados; el máximo por importación es ${GUEST_IMPORT_MAX_ROWS}.`);
  }
  return { rows, errors };
}

function parseGuestWorkbook(fileData) {
  let workbook;
  try {
    workbook = window.XLSX.read(fileData, { type: "array" });
  } catch {
    throw new Error("No fue posible leer el archivo. Verifique que sea un Excel o CSV válido y que no tenga contraseña.");
  }
  const sheetName = workbook.SheetNames.find((name) => normalizeSpreadsheetHeader(name) === "invitados")
    || workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no contiene ninguna hoja.");
  const grid = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });
  const nameAliases = ["nombre completo", "nombre", "invitado", "full name"];
  let headerIndex = -1;
  for (let index = 0; index < Math.min(grid.length, 10); index += 1) {
    if (guestImportColumn(grid[index], nameAliases) >= 0) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new Error('No se encontró la columna obligatoria "Nombre completo". Descargue la plantilla y conserve sus encabezados.');
  }

  const headers = grid[headerIndex];
  const nameIndex = guestImportColumn(headers, nameAliases);
  const contactIndex = guestImportColumn(headers, ["contacto", "telefono o correo", "telefono", "correo", "email", "e mail"]);
  const notesIndex = guestImportColumn(headers, ["notas", "nota", "mesa promotor o cortesia"]);
  const rows = [];

  grid.slice(headerIndex + 1).forEach((source, offset) => {
    const fullName = spreadsheetCellText(source[nameIndex]);
    const contact = contactIndex >= 0 ? spreadsheetCellText(source[contactIndex]) : "";
    const notes = notesIndex >= 0 ? spreadsheetCellText(source[notesIndex]) : "";
    if (!fullName && !contact && !notes) return;
    const rowNumber = headerIndex + offset + 2;
    rows.push({ rowNumber, fullName, contact, notes, issues: [] });
  });

  if (!rows.length) throw new Error("El archivo no contiene invitados debajo de los encabezados.");
  return validateGuestImportRows(rows);
}

function pastedGuestContact(line) {
  const matches = [];
  const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
  if (email) matches.push({ index: email.index, value: email[0] });
  for (const match of line.matchAll(/\+?\d[\d\s()./-]{5,}\d/gu)) {
    const digitCount = (match[0].match(/\d/g) || []).length;
    if (digitCount >= 7 && digitCount <= 15) {
      matches.push({ index: match.index, value: match[0] });
    }
  }
  return matches.sort((left, right) => left.index - right.index)[0] || null;
}

function parsePastedGuestLine(source, rowNumber) {
  let line = repairGuestTextEncoding(source)
    .replace(/\t+/g, " | ")
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/gu, " ")
    .replace(/[\u200b\u2060\ufeff]/gu, "")
    .trim();
  line = line
    .replace(/^(?:\d{1,4}\s*[\.):]\s*|[A-Za-z]\s*[\.)]\s*|[•●▪◦*#\-–—]\s*)/u, "")
    .replace(/^\d{1,4}\s+(?=\p{L})/u, "")
    .trim();
  if (!line) return null;

  let fullName = "";
  let contact = "";
  let notes = "";
  const contactMatch = pastedGuestContact(line);
  if (contactMatch) {
    fullName = cleanGuestText(line.slice(0, contactMatch.index))
      .replace(/[|,;:\-–—]+$/u, "")
      .trim();
    contact = cleanGuestText(contactMatch.value);
    const remainder = cleanGuestText(line.slice(contactMatch.index + contactMatch.value.length))
      .replace(/^[|,;:\-–—]+/u, "")
      .trim();
    if (fullName) {
      notes = remainder;
    } else {
      fullName = remainder;
    }
  } else {
    const parts = line.split(/\s*[|;,]\s*/u).map(cleanGuestText).filter(Boolean);
    if (parts.length > 1) {
      fullName = parts.shift();
      notes = parts.join(" ");
    } else {
      const noteMatch = line.match(/\s+(?:nota|notas)\s*:?\s+/iu);
      if (noteMatch) {
        fullName = cleanGuestText(line.slice(0, noteMatch.index));
        notes = cleanGuestText(line.slice(noteMatch.index + noteMatch[0].length));
      } else {
        fullName = cleanGuestText(line);
      }
    }
  }
  return { rowNumber, fullName, contact, notes, issues: [] };
}

function parsePastedGuests(value) {
  const rows = String(value ?? "")
    .split(/\r?\n/)
    .map((line, index) => parsePastedGuestLine(line, index + 1))
    .filter(Boolean);
  if (!rows.length) throw new Error("Pegue al menos un invitado, usando una línea por persona.");
  return validateGuestImportRows(rows);
}

function renderGuestImportPreview() {
  const { fileName, rows, errors } = state.guestImport;
  const preview = $("#guest-import-preview");
  preview.hidden = false;
  $("#guest-import-summary").textContent = rows.length
    ? `${fileName} · ${rows.length} ${rows.length === 1 ? "invitado" : "invitados"}`
    : fileName;
  const visibleRows = rows.slice(0, 25);
  $("#guest-import-table").innerHTML = visibleRows.map((row) => {
    const invalid = row.issues.length > 0;
    return `<tr class="${invalid ? "guest-import-row--error" : ""}">
      <td>${row.rowNumber}</td>
      <td>${escapeHtml(row.fullName || "—")}</td>
      <td>${escapeHtml(row.contact || "—")}</td>
      <td>${escapeHtml(row.notes || "—")}</td>
      <td><span class="guest-import-status ${invalid ? "is-error" : ""}">${invalid ? escapeHtml(row.issues[0]) : "Correcto"}</span></td>
    </tr>`;
  }).join("") + (rows.length > visibleRows.length
    ? `<tr><td colspan="5"><p class="empty-state">Y ${rows.length - visibleRows.length} filas más.</p></td></tr>`
    : "");
  const status = $("#guest-import-errors");
  status.classList.toggle("is-valid", errors.length === 0 && rows.length > 0);
  status.textContent = errors.length
    ? `${errors.length} ${errors.length === 1 ? "problema encontrado" : "problemas encontrados"}. ${errors.slice(0, 4).join(" ")}${errors.length > 4 ? " Revise también las filas marcadas." : ""}`
    : "Archivo validado. Todos los invitados están listos para crear su QR personal.";
  const button = $("#import-guests-button");
  button.disabled = errors.length > 0 || rows.length < 1 || rows.length > GUEST_IMPORT_MAX_ROWS;
  button.textContent = rows.length ? `Importar ${rows.length} invitados` : "Importar invitados";
}

async function prepareGuestImport(file) {
  if (!file) return;
  state.guestImport = guestImportEmptyState(file.name);
  $("#guest-import-file-name").textContent = `Leyendo ${file.name}…`;
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    state.guestImport.errors = ["Use un archivo con extensión .xlsx, .xls o .csv."];
    renderGuestImportPreview();
    return;
  }
  if (file.size > GUEST_IMPORT_MAX_FILE_SIZE) {
    state.guestImport.errors = ["El archivo supera el tamaño máximo de 5 MB."];
    renderGuestImportPreview();
    return;
  }
  try {
    await loadSpreadsheetLibrary();
    const parsed = parseGuestWorkbook(await file.arrayBuffer());
    state.guestImport = { fileName: file.name, ...parsed };
    $("#guest-import-file-name").textContent = file.name;
    renderGuestImportPreview();
  } catch (error) {
    state.guestImport.errors = [error.message];
    $("#guest-import-file-name").textContent = file.name;
    renderGuestImportPreview();
  }
}

function renderEventAccesses() {
  $("#event-access-table").innerHTML = state.eventAccesses.length ? state.eventAccesses.map((access) => {
    const className = access.decision === "granted" ? "badge--success" : access.decision === "duplicate" ? "badge--gold" : "badge--danger";
    return `<tr>
      <td>${dateTime.format(parseServerDate(access.scannedAt))}</td>
      <td><span class="badge ${className}">${escapeHtml(accessDecisionNames[access.decision] || access.decision)}</span></td>
      <td>${escapeHtml(access.guestName || (access.tokenType === "shared" ? "QR general" : "—"))}</td>
      <td>${escapeHtml(access.scannedBy)}</td>
    </tr>`;
  }).join("") : '<tr><td colspan="4"><p class="empty-state">Aún no hay lecturas para este evento.</p></td></tr>';
}

function safeFileName(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "acceso";
}

function invitationPublicUrl(token) {
  return `${window.location.origin}/invite/#${token}`;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

async function shareInvitationLink(guest, eventName) {
  const url = invitationPublicUrl(guest.qrToken);
  if (navigator.share) {
    await navigator.share({
      title: `Invitación · ${eventName}`,
      text: `${guest.fullName}, esta es tu invitación personal a NOOX.`,
      url
    });
    return;
  }
  await copyText(url);
  toast("Enlace público copiado.");
}

function showAccessQr(token, title, subtitle, publicUrl = "") {
  const container = $("#qr-code");
  container.replaceChildren();
  $("#qr-dialog-title").textContent = title;
  $("#qr-dialog-subtitle").textContent = subtitle;
  state.qrDownloadName = `${safeFileName(title)}-noox.png`;
  state.qrShareUrl = publicUrl;
  $("#qr-public-link").hidden = !publicUrl;
  $("#qr-public-url").value = publicUrl;
  new QRCode(container, {
    text: `NOX1:${token}`,
    width: 320,
    height: 320,
    colorDark: "#050505",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
  $("#event-qr-dialog").showModal();
}

function qrCanvas() {
  return $("#qr-code canvas");
}

function qrBlob() {
  return new Promise((resolve, reject) => {
    const canvas = qrCanvas();
    if (!canvas) return reject(new Error("No fue posible preparar el QR."));
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No fue posible preparar el QR.")), "image/png");
  });
}

function setScanResult(result) {
  const element = $("#scan-result");
  const granted = Boolean(result.granted);
  const eventDetail = result.event?.name
    ? `${result.event.name}${result.admittedCount ? ` · ${result.admittedCount} entradas` : ""}`
    : "";
  element.classList.remove("is-granted", "is-denied", "is-duplicate");
  const className = granted ? "is-granted" : result.decision === "duplicate" ? "is-duplicate" : "is-denied";
  const title = granted
    ? (result.guest?.name ? `¡Bienvenido, ${result.guest.name}!` : "Entrada autorizada")
    : "ACCESO DENEGADO";
  const detail = granted
    ? (eventDetail || "Ingreso registrado correctamente.")
    : `${result.message || "Entrada no autorizada."}${eventDetail ? ` · ${eventDetail}` : ""}`;
  element.innerHTML = `<span aria-hidden="true">${granted ? "✓" : "×"}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>`;
  void element.offsetWidth;
  element.classList.add(className);
}

async function submitAccessToken(token) {
  if (state.scanner.locked) return;
  state.scanner.locked = true;
  try {
    const result = await api("/api/access/scan", { method: "POST", body: JSON.stringify({ token }) });
    setScanResult(result);
    if (result.granted && navigator.vibrate) navigator.vibrate(90);
    if (!result.granted && navigator.vibrate) navigator.vibrate([70, 45, 70]);
    if (state.selectedEvent && result.event && Number(state.selectedEvent.id) === Number(result.event.id)) {
      await openEvent(result.event.id);
    } else {
      const event = state.events.find((item) => Number(item.id) === Number(result.event?.id));
      if (event && result.granted) event.admittedCount = Number(event.admittedCount || 0) + 1;
      renderEventList();
    }
  } catch (error) {
    setScanResult({ granted: false, decision: "denied", message: error.message });
  } finally {
    window.setTimeout(() => { state.scanner.locked = false; }, 1300);
  }
}

function scanImageSource(source, width, height) {
  const canvas = $("#qr-canvas");
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / width);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
}

function scannerFrame(timestamp = 0) {
  const video = $("#qr-video");
  if (!state.scanner.stream || video.readyState < 2) {
    state.scanner.frame = requestAnimationFrame(scannerFrame);
    return;
  }
  if (timestamp - state.scanner.lastFrameAt < 90) {
    state.scanner.frame = requestAnimationFrame(scannerFrame);
    return;
  }
  state.scanner.lastFrameAt = timestamp;
  let code = null;
  try {
    code = scanImageSource(video, video.videoWidth, video.videoHeight);
  } catch {
    code = null;
  }
  if (code?.data) {
    state.scanner.absentFrames = 0;
    if (code.data !== state.scanner.lastToken && !state.scanner.locked) {
      state.scanner.lastToken = code.data;
      submitAccessToken(code.data);
    }
  } else {
    state.scanner.absentFrames += 1;
    if (state.scanner.absentFrames > 8) state.scanner.lastToken = null;
  }
  state.scanner.frame = requestAnimationFrame(scannerFrame);
}

async function startEventScanner() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setScanResult({ granted: false, decision: "denied", message: "La cámara requiere abrir el panel mediante HTTPS." });
    return;
  }
  stopEventScanner();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    state.scanner.stream = stream;
    state.scanner.lastToken = null;
    state.scanner.absentFrames = 0;
    state.scanner.lastFrameAt = 0;
    const video = $("#qr-video");
    video.srcObject = stream;
    await video.play();
    $("#scanner-placeholder").hidden = true;
    $("#start-scanner").hidden = true;
    $("#stop-scanner").hidden = false;
    $("#scanner-status").textContent = "Escaneando";
    state.scanner.frame = requestAnimationFrame(scannerFrame);
  } catch (error) {
    setScanResult({ granted: false, decision: "denied", message: error.name === "NotAllowedError" ? "Permita el acceso a la cámara o use “Tomar foto del QR”." : "No fue posible abrir la cámara." });
  }
}

function stopEventScanner() {
  if (state.scanner.frame) cancelAnimationFrame(state.scanner.frame);
  state.scanner.frame = null;
  if (state.scanner.stream) state.scanner.stream.getTracks().forEach((track) => track.stop());
  state.scanner.stream = null;
  const video = $("#qr-video");
  if (video) video.srcObject = null;
  if ($("#scanner-placeholder")) $("#scanner-placeholder").hidden = false;
  if ($("#start-scanner")) $("#start-scanner").hidden = false;
  if ($("#stop-scanner")) $("#stop-scanner").hidden = true;
  if ($("#scanner-status")) $("#scanner-status").textContent = "Cámara apagada";
}

async function scanQrPhoto(file) {
  if (!file) return;
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = objectUrl;
    });
    const code = scanImageSource(image, image.naturalWidth, image.naturalHeight);
    if (!code?.data) {
      setScanResult({ granted: false, decision: "denied", message: "No se encontró un QR legible en la foto." });
      return;
    }
    state.scanner.lastToken = null;
    await submitAccessToken(code.data);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadPos() {
  const [{ sessions }] = await Promise.all([api("/api/cash/sessions"), loadPosTabs()]);
  state.cashSessions = sessions;
  const open = ownOpenSession();
  $("#pos-session-label").textContent = open ? `${open.terminalName} · Abierta` : "Caja cerrada";
  $("#pos-session-label").className = `status-pill ${open ? "badge--success" : "badge--danger"}`;
  await loadPosCatalog();
  if (state.activeTab && !state.openTabs.some((tab) => Number(tab.id) === Number(state.activeTab.id))) {
    state.tabContextVersion += 1;
    state.posMode = null;
    state.activeTab = null;
    state.cart.clear();
    resetPosPayment();
  } else if (state.posMode === "tab" && state.activeTab) {
    await selectTab(state.activeTab.id);
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
  $("#void-account").hidden = state.posMode !== "tab";
  $("#complete-sale").textContent = state.posMode === "tab" ? "Cobrar cuenta" : state.posMode === "quick" ? "Cobrar venta rápida" : "Seleccione una cuenta";
  renderProducts();
  if (selected) renderPagination("pos-pagination", "pos");
  renderCart();
}

function selectQuickSale() {
  state.tabContextVersion += 1;
  state.posMode = "quick";
  state.activeTab = null;
  state.cart.clear();
  $("#pos-message").textContent = "";
  resetPosPayment();
  renderAccountMode();
}

async function selectTab(tabId) {
  const { tab } = await api(`/api/pos/tabs/${tabId}`);
  state.tabContextVersion += 1;
  state.posMode = "tab";
  state.activeTab = { id: Number(tab.id), customerName: tab.customerName };
  state.cart.clear();
  const tabProducts = new Map();
  tab.items.forEach((item) => {
    const productId = Number(item.id);
    tabProducts.set(productId, item);
    state.productCache.set(productId, item);
    state.cart.set(productId, Number(item.quantity));
  });
  state.products = state.products.map((product) => {
    const tabProduct = tabProducts.get(Number(product.id));
    return tabProduct ? { ...product, available: tabProduct.available } : product;
  });
  $("#pos-message").textContent = "";
  resetPosPayment();
  renderAccountMode();
}

async function changeAccount() {
  await state.tabMutation.catch(() => null);
  state.tabContextVersion += 1;
  state.posMode = null;
  state.activeTab = null;
  state.cart.clear();
  resetPosPayment();
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
  const contextVersion = state.tabContextVersion;
  state.tabMutation = state.tabMutation.then(async () => {
    if (contextVersion !== state.tabContextVersion || state.posMode !== "tab" || state.activeTab?.id !== tabId) return;
    await api(`/api/pos/tabs/${tabId}/items`, {
      method: "POST",
      body: JSON.stringify({ productId, quantity })
    });
  }).catch(async (error) => {
    if (contextVersion !== state.tabContextVersion) return;
    if (previous <= 0) state.cart.delete(productId);
    else state.cart.set(productId, previous);
    renderCart();
    toast(error.message, true);
    await selectTab(tabId).catch(() => changeAccount());
  });
}

function roundPosMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function cartTotals() {
  let subtotal = 0;
  let tax = 0;
  for (const [productId, quantity] of state.cart) {
    const product = state.productCache.get(productId);
    if (!product) continue;
    const lineSubtotal = roundPosMoney(Number(product.salePrice) * quantity);
    const lineTax = roundPosMoney(lineSubtotal * Number(product.taxRate));
    subtotal = roundPosMoney(subtotal + lineSubtotal);
    tax = roundPosMoney(tax + lineTax);
  }
  const maximumDiscount = roundPosMoney(subtotal + tax);
  const requestedDiscount = Math.max(0, Number($("#pos-discount")?.value || 0));
  const discount = Math.min(roundPosMoney(requestedDiscount), maximumDiscount);
  return { subtotal, tax, discount, total: roundPosMoney(maximumDiscount - discount) };
}

function splitPaymentRows() {
  return $$(".split-payment-row", $("#split-payment-rows"));
}

function addSplitPaymentRow() {
  const used = new Set([$("#payment-method").value, ...splitPaymentRows().map((row) => row.querySelector("select").value)]);
  const method = ["cash", "card", "yappy"].find((candidate) => !used.has(candidate));
  if (!method) return toast("Ya están incluidos todos los métodos de pago.", true);
  const row = document.createElement("div");
  row.className = "split-payment-row";
  row.innerHTML = `<select aria-label="Método de pago adicional">${Object.entries(paymentMethodNames).map(([value, label]) => `<option value="${value}"${value === method ? " selected" : ""}>${label}</option>`).join("")}</select><input type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Monto" aria-label="Monto del pago adicional"><input class="split-payment-reference" maxlength="120" placeholder="Referencia" aria-label="Referencia del pago adicional"><button type="button" class="text-button" data-remove-split-payment aria-label="Quitar pago">×</button>`;
  $("#split-payment-rows").append(row);
  updatePosPaymentSummary();
}

function posPaymentAllocations(totals, validate = false) {
  const extras = splitPaymentRows().map((row) => ({
    method: row.querySelector("select").value,
    amount: roundPosMoney(Number(row.querySelector('input[type="number"]').value || 0)),
    reference: row.querySelector(".split-payment-reference").value.trim() || null
  }));
  const used = [$("#payment-method").value, ...extras.map((payment) => payment.method)];
  if (validate && new Set(used).size !== used.length) throw new Error("No repita un método de pago.");
  if (validate && extras.some((payment) => payment.amount <= 0)) throw new Error("Complete los montos de los pagos divididos.");
  const extraTotal = roundPosMoney(extras.reduce((sum, payment) => sum + payment.amount, 0));
  const primaryAmount = roundPosMoney(totals.total - extraTotal);
  if (validate && primaryAmount <= 0) throw new Error("Los pagos adicionales superan o igualan el total.");
  const primary = {
    method: $("#payment-method").value,
    amount: Math.max(0, primaryAmount),
    reference: $("#payment-reference").value.trim() || null
  };
  return [primary, ...extras];
}

function updatePosPaymentSummary() {
  const totals = cartTotals();
  const payments = posPaymentAllocations(totals);
  const primary = payments[0];
  $("#primary-payment-summary").textContent = `${paymentMethodNames[primary.method]}: ${money.format(primary.amount)}`;
  const cashPrimary = primary.method === "cash";
  $("#cash-received-wrap").hidden = !cashPrimary;
  const received = Number($("#cash-received").value || primary.amount);
  const change = cashPrimary ? Math.max(0, roundPosMoney(received - primary.amount)) : 0;
  $("#cash-change").textContent = money.format(change);
  splitPaymentRows().forEach((row) => {
    row.querySelector(".split-payment-reference").hidden = row.querySelector("select").value === "cash";
  });
  $("#add-split-payment").disabled = splitPaymentRows().length >= 2;
}

function resetPosPayment() {
  const discount = $("#pos-discount");
  if (!discount) return;
  discount.value = "0";
  $("#payment-method").value = "cash";
  $("#payment-reference").value = "";
  $("#payment-reference-wrap").hidden = true;
  $("#cash-received").value = "";
  $("#split-payment-rows").replaceChildren();
  $$("[data-payment-method]", $("#payment-methods")).forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.paymentMethod === "cash")));
  updatePosPaymentSummary();
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
  $("#cart-discount").textContent = `−${money.format(totals.discount)}`;
  $("#cart-discount-row").hidden = totals.discount <= 0;
  $("#cart-total").textContent = money.format(totals.total);
  updatePosPaymentSummary();
  const open = ownOpenSession();
  $("#complete-sale").disabled = !state.posMode || !lines.length || !open || totals.total <= 0;
}

async function completeSale() {
  if (!state.posMode) return toast("Primero seleccione una cuenta o Venta rápida.", true);
  await state.tabMutation.catch(() => null);
  const open = ownOpenSession();
  if (!open) return toast("Debe abrir una caja antes de vender.", true);
  const totals = cartTotals();
  if (totals.total <= 0) return toast("El total debe ser mayor que cero.", true);
  let payments;
  try {
    payments = posPaymentAllocations(totals, true);
  } catch (error) {
    return toast(error.message, true);
  }
  const primary = payments[0];
  const received = primary.method === "cash" ? Number($("#cash-received").value || primary.amount) : primary.amount;
  if (primary.method === "cash" && received + 0.0001 < primary.amount) return toast("El efectivo recibido no cubre el monto pendiente.", true);
  const change = primary.method === "cash" ? roundPosMoney(received - primary.amount) : 0;
  const receiptLines = [...state.cart].map(([productId, quantity]) => ({ product: state.productCache.get(productId), quantity }));
  $("#complete-sale").disabled = true;
  try {
    const sale = await api("/api/pos/sales", {
      method: "POST",
      body: JSON.stringify({
        cashSessionId: open.id,
        tabId: state.posMode === "tab" ? state.activeTab?.id : null,
        discount: totals.discount,
        items: [...state.cart].map(([productId, quantity]) => ({ productId, quantity })),
        payments
      })
    });
    state.cart.clear();
    state.posMode = null;
    state.activeTab = null;
    state.tabContextVersion += 1;
    $("#pos-message").textContent = `${sale.receipt} · ${money.format(sale.total)}`;
    showPosReceipt(sale, receiptLines, payments, change, received);
    resetPosPayment();
    toast("Venta completada e inventario actualizado.");
    await loadPos();
  } catch (error) {
    $("#pos-message").textContent = error.message;
    toast(error.message, true);
    renderCart();
  }
}

function showPosReceipt(sale, lines, payments, change, received) {
  const paymentRows = payments.map((payment, index) => {
    const detail = payment.method === "cash" && index === 0 && received > payment.amount
      ? ` · Recibido ${money.format(received)}`
      : payment.reference ? ` · Ref. ${escapeHtml(payment.reference)}` : "";
    return `<div><span>${escapeHtml(paymentMethodNames[payment.method] || payment.method)}${detail}</span><strong>${money.format(payment.amount)}</strong></div>`;
  }).join("");
  $("#pos-receipt").innerHTML = `
    <header><p>NOOX PANAMÁ</p><h2>Recibo ${escapeHtml(sale.receipt)}</h2><small>${dateTime.format(new Date())}</small></header>
    <section>${lines.map(({ product, quantity }) => `<div><span>${quantityNumber.format(quantity)} × ${escapeHtml(product?.name || "Producto")}</span><strong>${money.format(roundPosMoney(Number(product?.salePrice || 0) * quantity))}</strong></div>`).join("")}</section>
    <section class="pos-receipt-totals"><div><span>Subtotal</span><strong>${money.format(sale.subtotal)}</strong></div><div><span>Impuesto</span><strong>${money.format(sale.tax)}</strong></div>${Number(sale.discount) > 0 ? `<div><span>Descuento</span><strong>−${money.format(sale.discount)}</strong></div>` : ""}<div class="pos-receipt-total"><span>Total</span><strong>${money.format(sale.total)}</strong></div></section>
    <section>${paymentRows}${change > 0 ? `<div><span>Cambio</span><strong>${money.format(change)}</strong></div>` : ""}</section>
    <footer>The Night Must Go On</footer>`;
  $("#pos-receipt-dialog").showModal();
}

function paymentSummaryHtml(value) {
  if (!value) return "Sin detalle";
  return String(value).split("|").map((entry) => {
    const separator = entry.indexOf(":");
    const method = separator >= 0 ? entry.slice(0, separator) : entry;
    const amount = separator >= 0 ? Number(entry.slice(separator + 1)) : 0;
    return `${escapeHtml(paymentMethodNames[method] || method)} ${money.format(amount)}`;
  }).join(" + ");
}

async function loadPosSales() {
  const { sales } = await api("/api/pos/sales?limit=50");
  const canVoid = ["admin", "supervisor"].includes(state.user.role);
  $("#pos-sales-table").innerHTML = sales.map((sale) => {
    const action = canVoid && sale.status === "completed" && sale.cashSessionStatus === "open"
      ? `<button type="button" class="table-action table-action--danger" data-void-sale="${sale.id}">Anular</button>`
      : "";
    return `<tr><td><strong>${escapeHtml(sale.receipt)}</strong>${sale.voidReason ? `<small>${escapeHtml(sale.voidReason)}</small>` : ""}</td><td>${dateTime.format(new Date(sale.createdAt))}</td><td>${escapeHtml(sale.cashier)}</td><td>${paymentSummaryHtml(sale.paymentSummary)}</td><td><strong>${money.format(sale.total)}</strong></td><td><span class="badge ${sale.status === "completed" ? "badge--success" : "badge--danger"}">${sale.status === "completed" ? "Completada" : "Anulada"}</span></td><td>${action}</td></tr>`;
  }).join("") || '<tr><td colspan="7">No hay ventas registradas.</td></tr>';
}

async function voidPosSale(saleId) {
  const reason = window.prompt("Motivo de la anulación (mínimo 4 caracteres):", "");
  if (reason === null) return;
  if (reason.trim().length < 4) return toast("Escriba un motivo de al menos 4 caracteres.", true);
  await api(`/api/pos/sales/${saleId}/void`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
  toast("Venta anulada e inventario restaurado.");
  await Promise.all([loadPosSales(), loadPos()]);
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
    const reference = item.referencePurchasedAt
      ? `<strong>${escapeHtml(item.referencePackageName)} · ${money.format(item.referencePackageCost)}</strong><small>${quantityNumber.format(item.referenceUnitsPerPackage)} ${escapeHtml(unitNames[item.unit] || item.unit)} por presentación · última compra</small>`
      : `<strong>${escapeHtml(item.packageName)}</strong><small>${quantityNumber.format(item.unitsPerPackage)} ${escapeHtml(unitNames[item.unit] || item.unit)} por presentación · sin compras</small>`;
    return `<tr>
      <td>${escapeHtml(item.sku)}</td>
      <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)}</small></td>
      <td>${reference}</td>
      <td><strong>${quantityNumber.format(item.availableStock)} ${escapeHtml(unitNames[item.unit] || item.unit)} disponibles</strong><small>${quantityNumber.format(item.currentStock)} físicas · ${quantityNumber.format(item.reservedStock)} reservadas</small></td>
      <td>${quantityNumber.format(item.minimumStock)} ${escapeHtml(unitNames[item.unit] || item.unit)}<small>${item.leadTimeDays} d entrega + ${item.safetyStockDays} d seguridad</small></td>
      <td><strong>${money.format(item.averageCost)} / ${escapeHtml(unitNames[item.unit] || item.unit)}</strong><small>Promedio ponderado de compras recibidas.</small></td>
      <td><span class="badge ${lowStock ? "badge--danger" : "badge--success"}">${lowStock ? "Bajo" : "Normal"}</span></td>
      <td><button class="table-action" data-adjust-id="${item.id}">Ajustar</button> <button class="table-action" data-edit-inventory-id="${item.id}">Editar</button> <button class="table-action table-action--danger" data-delete-inventory-item="${item.id}">Eliminar</button></td>
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
    return `<tr><td class="select-column"><input class="row-select" type="checkbox" data-select-product="${product.id}" aria-label="Seleccionar ${escapeHtml(product.name)}" ${state.selectedProductIds.has(Number(product.id)) ? "checked" : ""}></td><td>${escapeHtml(product.sku)}</td><td><div class="product-name-cell"><img class="product-thumb" src="${escapeHtml(product.imageUrl || DEFAULT_PRODUCT_IMAGE)}" alt="" loading="lazy" decoding="async"><div><strong>${escapeHtml(product.name)}</strong>${product.barcode ? `<small>${escapeHtml(product.barcode)}</small>` : ""}<button type="button" class="table-action product-photo-action" data-product-image-id="${product.id}">${hasCustomPhoto ? "Cambiar foto" : "Agregar foto"}</button></div></div></td><td>${escapeHtml(product.category)}</td><td>${money.format(product.salePrice)}</td><td>${money.format(product.recipeCost)}</td><td><strong>${money.format(product.suggestedPrice)}</strong></td><td><span class="badge ${margin >= target ? "badge--success" : "badge--warning"}">${(margin * 100).toFixed(1)}%</span><small>Meta ${(target * 100).toFixed(1)}%</small></td><td>${recipe}</td><td><span class="badge ${active ? "badge--success" : "badge--danger"}">${active ? "Activo" : "Inactivo"}</span></td><td><button type="button" class="table-action" data-edit-product="${product.id}">Editar</button> <button type="button" class="table-action table-action--danger" data-delete-product="${product.id}">Eliminar</button></td></tr>`;
  }).join("") || '<tr><td colspan="11" class="empty-state">No hay productos de venta registrados.</td></tr>';
  updateBulkSelectionControls("products");
}

function renderArticles() {
  const items = state.articleRows;
  const pagination = state.pagination.articles;
  $("#articles-summary").textContent = `${pagination.total} artículos · mostrando ${pagination.from}–${pagination.to}`;
  $("#articles-table").innerHTML = items.map((item) => `<tr>
    <td class="select-column"><input class="row-select" type="checkbox" data-select-article="${item.id}" aria-label="Seleccionar ${escapeHtml(item.name)}" ${state.selectedArticleIds.has(Number(item.id)) ? "checked" : ""}></td>
    <td>${escapeHtml(item.sku)}</td>
    <td><strong>${escapeHtml(item.name)}</strong></td>
    <td>${escapeHtml(item.category)}</td>
    <td>${escapeHtml(unitNames[item.unit] || item.unit)}</td>
    <td><strong>${escapeHtml(item.packageName)}</strong><small>${quantityNumber.format(item.unitsPerPackage)} ${escapeHtml(unitNames[item.unit] || item.unit)} por presentación${item.referencePurchasedAt ? ` · última compra ${money.format(item.referencePackageCost)}` : " · sin compras"}</small></td>
    <td><strong>${money.format(item.averageCost)} / ${escapeHtml(unitNames[item.unit] || item.unit)}</strong></td>
    <td><button type="button" class="table-action" data-edit-item="${item.id}">Editar</button> <button type="button" class="table-action table-action--danger" data-delete-item="${item.id}">Eliminar</button></td>
  </tr>`).join("") || '<tr><td colspan="8" class="empty-state">No hay artículos con este filtro.</td></tr>';
  updateBulkSelectionControls("articles");
}

function updateBulkSelectionControls(type) {
  const isArticles = type === "articles";
  const selected = isArticles ? state.selectedArticleIds : state.selectedProductIds;
  const rows = isArticles ? state.articleRows : state.inventoryProducts;
  const selectAll = $(isArticles ? "#select-all-articles" : "#select-all-products");
  const button = $(isArticles ? "#delete-selected-articles" : "#delete-selected-products");
  const selectedOnPage = rows.filter((row) => selected.has(Number(row.id))).length;
  selectAll.checked = rows.length > 0 && selectedOnPage === rows.length;
  selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < rows.length;
  selectAll.disabled = rows.length === 0;
  button.disabled = selected.size === 0;
  button.textContent = `Eliminar seleccionados (${selected.size})`;
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
    hint.textContent = `Cada venta descuenta ${quantityNumber.format(quantity)} ${unit}. 1 ${item.packageName || item.referencePackageName || "presentación"} contiene ${quantityNumber.format(item.unitsPerPackage || item.referenceUnitsPerPackage || 1)} ${unit} · costo actual ${money.format(componentCost)}.`;
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
  const reference = item.referencePurchasedAt
    ? ` Última compra: ${item.referencePackageName} a ${money.format(item.referencePackageCost)}.`
    : ` Presentación habitual: ${item.packageName}, ${quantityNumber.format(item.unitsPerPackage)} ${unit}.`;
  hint.textContent = `1 ${packageName} agrega ${quantityNumber.format(unitsPerPackage)} ${unit} al inventario.${reference}`;
}

function addRecipeRow(kind, values = null) {
  const container = kind === "recipe" ? $("#recipe-rows") : $("#purchase-rows");
  const row = document.createElement("div");
  row.className = `recipe-row recipe-row--${kind}`;
  row.innerHTML = kind === "recipe"
    ? `<label>Artículo físico<select name="itemId" required>${inventoryOptions()}</select></label><label>Cantidad por cada venta<input name="quantity" type="number" min="0.0001" step="0.0001" required><small class="field-hint" data-conversion-hint></small></label><button type="button" class="text-button" data-remove-row>Eliminar</button>`
    : `<label>Artículo físico<select name="itemId" required>${inventoryOptions()}</select><small class="field-hint" data-conversion-hint></small></label><label>Presentación recibida<select name="packageName" required>${purchasePackageOptions()}</select><input name="packageNameCustom" class="inline-custom-input" maxlength="80" placeholder="Nombre de la nueva presentación" hidden></label><label>Contenido por presentación<input name="unitsPerPackage" type="number" min="0.0001" step="0.0001" required></label><label>Cantidad de presentaciones<input name="packageQuantity" type="number" min="1" step="1" inputmode="numeric" required></label><label>Precio pagado por presentación<input name="packageCost" type="number" min="0" step="0.0001" required></label><button type="button" class="text-button" data-remove-row>Eliminar</button>`;
  container.append(row);
  updateInventoryRow(row, kind, true);
  if (values) {
    const itemSelect = $("[name=itemId]", row);
    itemSelect.value = String(values.itemId);
    if ($("[name=quantity]", row)) $("[name=quantity]", row).value = Number(values.quantity);
    updateInventoryRow(row, kind);
  }
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

function updateItemPackageHint() {
  const form = $("#new-item-form");
  const packageName = String(form.elements.packageName.value || "Presentación").trim() || "Presentación";
  const units = Number(form.elements.unitsPerPackage.value || 0);
  const unit = unitNames[form.elements.unit.value] || form.elements.unit.value;
  $("#item-package-hint").textContent = units > 0
    ? `1 ${packageName} agrega ${quantityNumber.format(units)} ${unit} al inventario.`
    : "Indique cuántas unidades base contiene una presentación.";
}

function prepareItemForm(item = null) {
  const form = $("#new-item-form");
  form.reset();
  refreshCategoryCatalogs();
  form.elements.recordId.value = item?.id || "";
  $("#item-form-eyebrow").textContent = item ? "EDITAR ARTÍCULO" : "NUEVO ARTÍCULO";
  $("#item-form-title").textContent = item ? `Actualizar ${item.name}` : "Definir el artículo, la presentación y su unidad de control";
  $("#item-form-submit").textContent = item ? "Guardar cambios" : "Guardar artículo físico";
  form.elements.packageName.value = item?.packageName || "Unidad";
  form.elements.unitsPerPackage.value = Number(item?.unitsPerPackage || 1);
  if (item) {
    form.elements.sku.value = item.sku;
    form.elements.name.value = item.name;
    form.elements.category.value = item.category;
    form.elements.unit.value = item.unit;
    form.elements.minimumStock.value = Number(item.minimumStock || 0);
    form.elements.leadTimeDays.value = Number(item.leadTimeDays || 0);
    form.elements.safetyStockDays.value = Number(item.safetyStockDays || 0);
    form.elements.targetStockDays.value = Number(item.targetStockDays || 14);
  }
  toggleNewCategory($("#item-category-input"), $("#item-new-category-field"));
  updateItemPackageHint();
  openInventoryForm("new-item-form");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function prepareProductForm(product = null) {
  const form = $("#new-product-form");
  form.reset();
  refreshCategoryCatalogs();
  form.elements.recordId.value = product?.id || "";
  form.elements.active.value = product ? String(Number(product.active) === 1 ? 1 : 0) : "1";
  $("#product-form-eyebrow").textContent = product ? "EDITAR PRODUCTO" : "NUEVO PRODUCTO";
  $("#product-form-title").textContent = product ? `Actualizar ${product.name}` : "Definir composición para el POS";
  $("#product-form-submit").textContent = product ? "Guardar cambios" : "Guardar producto de venta";
  setImagePreview(form.elements.image, $("#product-image-preview"));
  $("#recipe-rows").replaceChildren();
  if (product) {
    form.elements.sku.value = product.sku;
    form.elements.name.value = product.name;
    form.elements.category.value = product.category;
    form.elements.barcode.value = product.barcode || "";
    form.elements.salePrice.value = Number(product.salePrice);
    form.elements.targetMargin.value = Number(product.targetMargin || .7) * 100;
    form.elements.taxRate.value = Number(product.taxRate || 0) * 100;
    product.recipe.forEach((component) => addRecipeRow("recipe", component));
  } else {
    addRecipeRow("recipe");
  }
  toggleNewCategory($("#product-category-input"), $("#product-new-category-field"));
  openInventoryForm("new-product-form");
  updateProductPricingPreview();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
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
      <td>${quantityNumber.format(item.availableStock)} ${escapeHtml(unit)}<small>${quantityNumber.format(item.currentStock)} físicas · ${quantityNumber.format(item.reservedStock)} reservadas</small></td>
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
  const button = $("button[type=submit]", form);
  const values = formValues(form);
  $("#login-error").textContent = "";
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Ingresando…";
  try {
    const { user, csrf } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(values),
      timeout: 15000
    });
    form.reset();
    showApp(user, csrf);
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "Ingresar";
  }
});

$("#logout-button").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => null); showLogin(); });
$("#main-nav").addEventListener("click", (event) => { const button = event.target.closest("[data-section]"); if (button) navigate(button.dataset.section); });
$("#menu-button").addEventListener("click", () => { const sidebar = $(".sidebar"); sidebar.classList.toggle("is-open"); $("#menu-button").setAttribute("aria-expanded", String(sidebar.classList.contains("is-open"))); });
$("#exit-pos").addEventListener("click", () => navigate("dashboard"));
$("#pos-cash-button").addEventListener("click", () => navigate("cash"));
$("#pos-sales-button").addEventListener("click", async () => {
  try { await loadPosSales(); $("#pos-sales-dialog").showModal(); }
  catch (error) { toast(error.message, true); }
});
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
$("#void-account").addEventListener("click", async () => {
  if (state.posMode !== "tab" || !state.activeTab) return;
  const reason = window.prompt(`Motivo para cancelar la cuenta de ${state.activeTab.customerName}:`, "");
  if (reason === null) return;
  if (reason.trim().length < 4) return toast("Escriba un motivo de al menos 4 caracteres.", true);
  try {
    await state.tabMutation.catch(() => null);
    await api(`/api/pos/tabs/${state.activeTab.id}/void`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
    toast("Cuenta cancelada y reservas liberadas.");
    await changeAccount();
  } catch (error) { toast(error.message, true); }
});

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
$("#pos-discount").addEventListener("input", renderCart);
$("#cash-received").addEventListener("input", updatePosPaymentSummary);
$("#add-split-payment").addEventListener("click", addSplitPaymentRow);
$("#split-payment-rows").addEventListener("input", updatePosPaymentSummary);
$("#split-payment-rows").addEventListener("change", updatePosPaymentSummary);
$("#split-payment-rows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-split-payment]");
  if (!button) return;
  button.closest(".split-payment-row").remove();
  updatePosPaymentSummary();
});
$("#payment-methods").addEventListener("click", (event) => {
  const button = event.target.closest("[data-payment-method]");
  if (!button) return;
  const method = button.dataset.paymentMethod;
  $("#payment-method").value = method;
  $$("[data-payment-method]", $("#payment-methods")).forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
  $("#payment-reference-wrap").hidden = method === "cash";
  if (method === "cash") $("#payment-reference").value = "";
  updatePosPaymentSummary();
});
$("#pos-sales-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-void-sale]");
  if (button) voidPosSale(Number(button.dataset.voidSale)).catch((error) => toast(error.message, true));
});
$("#print-pos-receipt").addEventListener("click", () => window.print());

$("#show-new-item").addEventListener("click", () => prepareItemForm());
$("#show-new-product").addEventListener("click", () => { if (!state.inventory.length) return toast("Primero cree al menos un artículo físico.", true); prepareProductForm(); });
$("#show-inventory-import").addEventListener("click", () => {
  resetInventoryImport();
  $("#inventory-import-panel").hidden = false;
  $("#inventory-import-file").focus();
});
$("#close-inventory-import").addEventListener("click", () => resetInventoryImport(true));
$("#clear-inventory-import").addEventListener("click", () => {
  resetInventoryImport();
  $("#inventory-import-file").focus();
});
$("#inventory-import-file").addEventListener("change", async (event) => {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  state.inventoryImport = { fileName: file.name, payload: null, preview: null };
  $("#inventory-import-preview").hidden = true;
  try {
    await previewInventoryImport(file);
  } catch (error) {
    $("#inventory-import-file-name").textContent = file.name;
    toast(error.message, true);
  }
});
$("#commit-inventory-import").addEventListener("click", async (event) => {
  const { payload, preview, fileName } = state.inventoryImport;
  if (!payload || !preview?.valid) return toast("Primero verifique un archivo válido.", true);
  if (!window.confirm(`Se crearán ${preview.summary.newItems} artículos y se recibirán ${preview.summary.invoices} facturas por ${money.format(preview.summary.total)}. ¿Desea continuar?`)) return;
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Guardando toda la importación…";
  try {
    const result = await api("/api/inventory/import/commit", {
      method: "POST",
      body: JSON.stringify(payload),
      timeout: 120000
    });
    resetInventoryImport(true);
    state.catalogReady = false;
    state.pagination.inventory.page = 1;
    state.pagination.articles.page = 1;
    await loadInventory();
    toast(`${fileName}: ${result.summary.rows} filas importadas, ${result.summary.newItems} artículos creados y ${result.summary.invoices} facturas recibidas.`);
  } catch (error) {
    button.textContent = "Crear artículos y actualizar inventario";
    try {
      state.inventoryImport.preview = await api("/api/inventory/import/preview", {
        method: "POST",
        body: JSON.stringify(payload),
        timeout: 60000
      });
      renderInventoryImportPreview();
    } catch {
      button.disabled = false;
    }
    toast(error.message, true);
  }
});
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
$("#new-item-form [name=unit]").addEventListener("change", updateItemPackageHint);
$("#new-item-form [name=packageName]").addEventListener("input", updateItemPackageHint);
$("#new-item-form [name=packageName]").addEventListener("change", (event) => {
  const units = packageSizeForName(event.currentTarget.value);
  if (units) $("#new-item-form [name=unitsPerPackage]").value = units;
  updateItemPackageHint();
});
$("#new-item-form [name=unitsPerPackage]").addEventListener("input", updateItemPackageHint);
$("#product-category-input").addEventListener("change", () => toggleNewCategory($("#product-category-input"), $("#product-new-category-field")));
$("#new-product-form [name=image]").addEventListener("change", (event) => setImagePreview(event.currentTarget, $("#product-image-preview")));
$("#new-product-form").addEventListener("input", updateProductPricingPreview);
$$('[data-cancel-form]').forEach((button) => button.addEventListener("click", () => { const form = document.getElementById(button.dataset.cancelForm); form.hidden = true; form.reset(); if (form.id === "new-product-form") setImagePreview(form.elements.image, $("#product-image-preview")); }));
$("#new-item-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  const itemId = Number(values.recordId || 0);
  try {
    await api(itemId ? `/api/inventory/items/${itemId}` : "/api/inventory/items", {
      method: itemId ? "PATCH" : "POST",
      body: JSON.stringify({
        sku: values.sku,
        name: values.name,
        category: categoryFromForm(form),
        unit: values.unit,
        packageName: values.packageName,
        unitsPerPackage: Number(values.unitsPerPackage),
        minimumStock: Number(values.minimumStock || 0),
        leadTimeDays: Number(values.leadTimeDays || 0),
        safetyStockDays: Number(values.safetyStockDays || 0),
        targetStockDays: Number(values.targetStockDays || 14)
      })
    });
    form.reset();
    form.hidden = true;
    state.catalogReady = false;
    if (!itemId) state.pagination.articles.page = 1;
    toast(itemId ? "Artículo actualizado." : "Artículo físico creado. Registre su existencia mediante una compra.");
    await loadInventory();
  } catch (error) { toast(error.message, true); }
});
$("#new-product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  const productId = Number(values.recordId || 0);
  const image = form.elements.image.files?.[0];
  try {
    const result = await api(productId ? `/api/inventory/products/${productId}` : "/api/inventory/products", {
      method: productId ? "PATCH" : "POST",
      body: JSON.stringify({
        sku: values.sku,
        name: values.name,
        category: categoryFromForm(form),
        barcode: values.barcode || null,
        salePrice: Number(values.salePrice),
        targetMargin: Number(values.targetMargin || 70) / 100,
        taxRate: Number(values.taxRate || 0) / 100,
        active: values.active === "1",
        recipe: collectRows("#recipe-rows")
      })
    });
    if (image) {
      try {
        await uploadProductImage(result.id, image);
      } catch (uploadError) {
        toast(`Los datos se guardaron, pero la fotografía no se actualizó: ${uploadError.message}`, true);
        await loadInventory();
        return;
      }
    }
    form.reset();
    form.hidden = true;
    setImagePreview(form.elements.image, $("#product-image-preview"));
    toast(`${productId ? "Producto actualizado" : "Producto creado"} · precio sugerido ${money.format(result.suggestedPrice)}.`);
    await loadInventory();
  } catch (error) { toast(error.message, true); }
});
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
$("#inventory-table").addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-inventory-item]");
  if (deleteButton) {
    const item = state.inventoryRows.find((row) => Number(row.id) === Number(deleteButton.dataset.deleteInventoryItem));
    if (item) await deleteInventoryItem(item);
    return;
  }
  const editButton = event.target.closest("[data-edit-inventory-id]");
  if (editButton) {
    const item = state.inventoryRows.find((row) => Number(row.id) === Number(editButton.dataset.editInventoryId));
    if (!item) return;
    await navigate("articles");
    prepareItemForm(item);
    return;
  }
  const adjustButton = event.target.closest("[data-adjust-id]");
  if (!adjustButton) return;
  const item = state.inventoryRows.find((row) => Number(row.id) === Number(adjustButton.dataset.adjustId));
  if (!item) return;
  $("#adjust-form [name=itemId]").value = item.id;
  $("#adjust-item-name").textContent = `${item.name} · Existencia ${Number(item.currentStock).toFixed(3)} ${unitNames[item.unit] || item.unit}`;
  $("#adjust-dialog").showModal();
});
$("#articles-table").addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-item]");
  if (deleteButton) {
    const item = state.articleRows.find((row) => Number(row.id) === Number(deleteButton.dataset.deleteItem));
    if (item) await deleteInventoryItem(item);
    return;
  }
  const button = event.target.closest("[data-edit-item]");
  if (!button) return;
  const item = state.articleRows.find((row) => Number(row.id) === Number(button.dataset.editItem));
  if (item) prepareItemForm(item);
});
$("#articles-table").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-article]");
  if (!checkbox) return;
  const id = Number(checkbox.dataset.selectArticle);
  if (checkbox.checked) state.selectedArticleIds.add(id);
  else state.selectedArticleIds.delete(id);
  updateBulkSelectionControls("articles");
});
$("#select-all-articles").addEventListener("change", (event) => {
  state.articleRows.forEach((item) => {
    if (event.currentTarget.checked) state.selectedArticleIds.add(Number(item.id));
    else state.selectedArticleIds.delete(Number(item.id));
  });
  renderArticles();
});
$("#inventory-products-table").addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-product]");
  if (deleteButton) {
    const product = state.inventoryProducts.find((row) => Number(row.id) === Number(deleteButton.dataset.deleteProduct));
    if (product) await deleteInventoryProduct(product);
    return;
  }
  const editButton = event.target.closest("[data-edit-product]");
  if (editButton) {
    const product = state.inventoryProducts.find((row) => Number(row.id) === Number(editButton.dataset.editProduct));
    if (product) prepareProductForm(product);
    return;
  }
  const imageButton = event.target.closest("[data-product-image-id]");
  if (!imageButton) return;
  const product = state.inventoryProducts.find((row) => Number(row.id) === Number(imageButton.dataset.productImageId));
  if (!product) return;
  const form = $("#product-image-form");
  form.reset();
  form.elements.productId.value = product.id;
  $("#product-image-name").textContent = product.name;
  setImagePreview(form.elements.image, $("#product-image-dialog-preview"));
  $("#product-image-dialog").showModal();
});
$("#inventory-products-table").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-product]");
  if (!checkbox) return;
  const id = Number(checkbox.dataset.selectProduct);
  if (checkbox.checked) state.selectedProductIds.add(id);
  else state.selectedProductIds.delete(id);
  updateBulkSelectionControls("products");
});
$("#select-all-products").addEventListener("change", (event) => {
  state.inventoryProducts.forEach((product) => {
    if (event.currentTarget.checked) state.selectedProductIds.add(Number(product.id));
    else state.selectedProductIds.delete(Number(product.id));
  });
  renderInventoryProducts();
});

async function deleteInventoryItem(item) {
  if (!window.confirm(`¿Eliminar el artículo "${item.name}"? Se retirará del catálogo y su existencia quedará en cero.`)) return;
  try {
    await api(`/api/inventory/items/${item.id}`, { method: "DELETE" });
    state.selectedArticleIds.delete(Number(item.id));
    state.catalogReady = false;
    await loadInventory();
    toast(`Artículo "${item.name}" eliminado.`);
  } catch (error) {
    toast(error.message, true);
  }
}

async function deleteInventoryProduct(product) {
  if (!window.confirm(`¿Eliminar el producto "${product.name}" del catálogo y del POS?`)) return;
  try {
    await api(`/api/inventory/products/${product.id}`, { method: "DELETE" });
    state.selectedProductIds.delete(Number(product.id));
    state.catalogReady = false;
    await loadInventory();
    toast(`Producto "${product.name}" eliminado.`);
  } catch (error) {
    toast(error.message, true);
  }
}

$("#delete-selected-articles").addEventListener("click", async () => {
  const ids = [...state.selectedArticleIds];
  if (!ids.length || !window.confirm(`¿Eliminar los ${ids.length} artículos seleccionados? Sus existencias quedarán en cero.`)) return;
  const button = $("#delete-selected-articles");
  button.disabled = true;
  button.textContent = "Eliminando…";
  try {
    const result = await api("/api/inventory/items", {
      method: "DELETE",
      body: JSON.stringify({ ids })
    });
    state.selectedArticleIds.clear();
    state.catalogReady = false;
    await loadInventory();
    toast(`${result.deleted} artículos eliminados.`);
  } catch (error) {
    toast(error.message, true);
    updateBulkSelectionControls("articles");
  }
});

$("#delete-selected-products").addEventListener("click", async () => {
  const ids = [...state.selectedProductIds];
  if (!ids.length || !window.confirm(`¿Eliminar los ${ids.length} productos seleccionados del catálogo y del POS?`)) return;
  const button = $("#delete-selected-products");
  button.disabled = true;
  button.textContent = "Eliminando…";
  try {
    const result = await api("/api/inventory/products", {
      method: "DELETE",
      body: JSON.stringify({ ids })
    });
    state.selectedProductIds.clear();
    state.catalogReady = false;
    await loadInventory();
    toast(`${result.deleted} productos eliminados.`);
  } catch (error) {
    toast(error.message, true);
    updateBulkSelectionControls("products");
  }
});

function openInventoryResetDialog() {
  if (state.user?.role !== "admin") return;
  const form = $("#reset-inventory-form");
  form.reset();
  $("#reset-inventory-error").textContent = "";
  $("#confirm-reset-inventory").disabled = true;
  $("#confirm-reset-inventory").textContent = "Eliminar todo";
  $("#reset-inventory-dialog").showModal();
  form.elements.confirmation.focus();
}

$("#reset-inventory").addEventListener("click", openInventoryResetDialog);
$$("[data-reset-inventory]").forEach((button) => button.addEventListener("click", openInventoryResetDialog));
$("#reset-inventory-form [name=confirmation]").addEventListener("input", (event) => {
  $("#confirm-reset-inventory").disabled = event.currentTarget.value !== "REINICIAR";
  $("#reset-inventory-error").textContent = "";
});
$("#reset-inventory-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#reset-inventory-dialog").close();
  const form = event.currentTarget;
  if (form.elements.confirmation.value !== "REINICIAR") {
    $("#reset-inventory-error").textContent = "Escriba REINICIAR para confirmar.";
    return;
  }
  const button = $("#confirm-reset-inventory");
  button.disabled = true;
  button.textContent = "Eliminando…";
  try {
    const result = await api("/api/inventory/reset", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: form.elements.confirmation.value })
    });
    $("#reset-inventory-dialog").close();
    state.catalogReady = false;
    state.selectedArticleIds.clear();
    state.selectedProductIds.clear();
    state.pagination.inventory.page = 1;
    state.pagination.articles.page = 1;
    state.pagination.products.page = 1;
    await loadInventory();
    toast(`Inventario reiniciado: ${result.items} artículos y ${result.products} productos eliminados.`);
  } catch (error) {
    $("#reset-inventory-error").textContent = error.message;
    button.disabled = form.elements.confirmation.value !== "REINICIAR";
    button.textContent = "Eliminar todo";
  }
});
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

function datetimeLocalValue(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function eventDateInputValue(value) {
  return String(value || "").replace(" ", "T").slice(0, 16);
}

$("#show-new-event").addEventListener("click", () => {
  const form = $("#new-event-form");
  form.reset();
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
  const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
  form.elements.startsAt.value = datetimeLocalValue(start);
  form.elements.endsAt.value = datetimeLocalValue(end);
  form.hidden = false;
  form.elements.name.focus();
});

$("#new-event-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  try {
    const created = await api("/api/events", {
      method: "POST",
      body: JSON.stringify({
        name: values.name,
        accessMode: values.accessMode,
        startsAt: values.startsAt,
        endsAt: values.endsAt,
        capacity: values.capacity ? Number(values.capacity) : null,
        notes: values.notes || null
      })
    });
    form.reset();
    form.hidden = true;
    state.selectedEvent = { id: created.id };
    toast("Evento creado. Ya puede generar y escanear sus accesos.");
    await loadEvents();
  } catch (error) { toast(error.message, true); }
});

$("#events-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-event-id]");
  if (button) openEvent(Number(button.dataset.eventId)).catch((error) => toast(error.message, true));
});

$("#show-event-qr").addEventListener("click", () => {
  const event = state.selectedEvent;
  if (!event?.sharedQrToken) return toast("Este evento no tiene un QR general.", true);
  showAccessQr(event.sharedQrToken, event.name, `${eventModeNames[event.accessMode]} · ${eventDateRange(event)}`);
});

$("#toggle-event-status").addEventListener("click", async (event) => {
  const selected = state.selectedEvent;
  if (!selected) return;
  const status = event.currentTarget.dataset.nextStatus;
  try {
    await api(`/api/events/${selected.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    toast(status === "active" ? "Evento reactivado." : "Evento cerrado.");
    await loadEvents();
  } catch (error) { toast(error.message, true); }
});

$("#edit-event").addEventListener("click", () => {
  const selected = state.selectedEvent;
  if (!selected) return;
  const form = $("#edit-event-form");
  form.reset();
  form.elements.id.value = selected.id;
  form.elements.name.value = selected.name;
  form.elements.accessMode.value = selected.accessMode;
  form.elements.startsAt.value = eventDateInputValue(selected.startsAt);
  form.elements.endsAt.value = eventDateInputValue(selected.endsAt);
  form.elements.capacity.value = selected.capacity || "";
  form.elements.notes.value = selected.notes || "";
  $("#edit-event-dialog").showModal();
});

$("#edit-event-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#edit-event-dialog").close();
  const form = event.currentTarget;
  const values = formValues(form);
  try {
    await api(`/api/events/${values.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: values.name,
        accessMode: values.accessMode,
        startsAt: values.startsAt,
        endsAt: values.endsAt,
        capacity: values.capacity ? Number(values.capacity) : null,
        notes: values.notes || null
      })
    });
    $("#edit-event-dialog").close();
    toast("Evento actualizado.");
    await loadEvents();
  } catch (error) { toast(error.message, true); }
});

$("#delete-event").addEventListener("click", () => {
  const selected = state.selectedEvent;
  if (!selected || state.user?.role !== "admin") return;
  const form = $("#delete-event-form");
  form.reset();
  form.elements.eventId.value = selected.id;
  $("#delete-event-name").textContent = selected.name;
  $("#delete-event-summary").innerHTML = `
    <div><small>Invitados y QR</small><strong>${state.eventGuests.length}</strong></div>
    <div><small>Entradas aceptadas</small><strong>${Number(selected.admittedCount || 0)}</strong></div>`;
  $("#delete-event-error").textContent = "";
  $("#confirm-delete-event").disabled = true;
  $("#confirm-delete-event").textContent = "Eliminar definitivamente";
  $("#delete-event-dialog").showModal();
  form.elements.confirmation.focus();
});

$("#delete-event-form [name=confirmation]").addEventListener("input", (event) => {
  const selected = state.selectedEvent;
  $("#confirm-delete-event").disabled = !selected || event.currentTarget.value !== selected.name;
  $("#delete-event-error").textContent = "";
});

$("#delete-event-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#delete-event-dialog").close();
  const form = event.currentTarget;
  const selected = state.selectedEvent;
  const values = formValues(form);
  if (!selected || Number(values.eventId) !== Number(selected.id) || values.confirmation !== selected.name) {
    $("#delete-event-error").textContent = "Escriba exactamente el nombre del evento para confirmar.";
    return;
  }
  const button = $("#confirm-delete-event");
  button.disabled = true;
  button.textContent = "Eliminando…";
  try {
    const result = await api(`/api/events/${selected.id}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmation: values.confirmation })
    });
    $("#delete-event-dialog").close();
    state.selectedEvent = null;
    state.guestLists = [];
    state.eventGuests = [];
    state.eventAccesses = [];
    state.selectedGuestListId = "all";
    state.selectedGuestIds.clear();
    resetGuestImport();
    await loadEvents();
    toast(`Evento eliminado junto con ${result.guestCount} invitados y ${result.accessCount} lecturas.`);
  } catch (error) {
    $("#delete-event-error").textContent = error.message;
    button.disabled = form.elements.confirmation.value !== selected.name;
    button.textContent = "Eliminar definitivamente";
  }
});

$("#new-guest-list-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const selected = state.selectedEvent;
  if (!selected) return;
  const values = formValues(form);
  try {
    const created = await api(`/api/events/${selected.id}/guest-lists`, {
      method: "POST",
      body: JSON.stringify({ name: values.name })
    });
    form.reset();
    state.selectedGuestListId = Number(created.id);
    state.selectedGuestIds.clear();
    await openEvent(selected.id);
    toast(`Lista “${created.name}” creada.`);
  } catch (error) {
    toast(error.message, true);
  }
});

$("#guest-list-filter").addEventListener("change", (event) => {
  state.selectedGuestListId = event.currentTarget.value === "all"
    ? "all"
    : Number(event.currentTarget.value);
  state.selectedGuestIds.clear();
  renderGuestLists();
  renderEventGuests();
});

$("#rename-guest-list").addEventListener("click", async () => {
  const list = activeGuestList();
  if (!list || !state.selectedEvent) return;
  const name = window.prompt("Nuevo nombre de la lista:", list.name);
  if (name === null || name.trim() === "" || name.trim() === list.name) return;
  try {
    await api(`/api/event-guest-lists/${list.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() })
    });
    await openEvent(state.selectedEvent.id);
    toast("Lista renombrada.");
  } catch (error) {
    toast(error.message, true);
  }
});

$("#delete-guest-list").addEventListener("click", async () => {
  const list = activeGuestList();
  if (!list || !state.selectedEvent) return;
  const confirmation = window.prompt(
    `Se eliminará la lista “${list.name}” junto con sus ${Number(list.guestCount || 0)} invitados y lecturas. Escriba exactamente el nombre de la lista para confirmar:`
  );
  if (confirmation === null) return;
  try {
    const result = await api(`/api/event-guest-lists/${list.id}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmation })
    });
    state.selectedGuestListId = result.replacementListId
      ? Number(result.replacementListId)
      : "all";
    state.selectedGuestIds.clear();
    await openEvent(state.selectedEvent.id);
    toast(`Lista eliminada junto con ${result.guestCount} invitados.`);
  } catch (error) {
    toast(error.message, true);
  }
});

$("#generate-promoter-code").addEventListener("click", async () => {
  const list = activeGuestList();
  if (!list || !state.selectedEvent) return;
  if (Number(list.promoterCodeEnabled) === 1
    && !window.confirm("El código actual dejará de funcionar. ¿Desea generar uno nuevo?")) return;
  try {
    const result = await api(`/api/event-guest-lists/${list.id}/promoter-code`, {
      method: "POST",
      body: JSON.stringify({})
    });
    $("#promoter-code-value").value = result.code;
    $("#promoter-code-url").value = result.directUrl;
    await openEvent(state.selectedEvent.id);
    $("#promoter-code-dialog").showModal();
  } catch (error) {
    toast(error.message, true);
  }
});

$("#revoke-promoter-code").addEventListener("click", async () => {
  const list = activeGuestList();
  if (!list || !state.selectedEvent) return;
  if (!window.confirm(`El promotor ya no podrá agregar personas a “${list.name}”. ¿Desea revocar el código?`)) return;
  try {
    await api(`/api/event-guest-lists/${list.id}/promoter-code`, {
      method: "DELETE",
      body: JSON.stringify({})
    });
    await openEvent(state.selectedEvent.id);
    toast("Código de promotor revocado.");
  } catch (error) {
    toast(error.message, true);
  }
});

$("#copy-promoter-code").addEventListener("click", async () => {
  await copyText($("#promoter-code-value").value);
  toast("Código de promotor copiado.");
});

$("#copy-promoter-url").addEventListener("click", async () => {
  await copyText($("#promoter-code-url").value);
  toast("Enlace directo copiado.");
});

$("#guest-import-file").addEventListener("change", async (event) => {
  $("#guest-paste-text").value = "";
  await prepareGuestImport(event.currentTarget.files?.[0]);
});

$("#parse-pasted-guests").addEventListener("click", () => {
  const pasted = $("#guest-paste-text").value;
  try {
    const parsed = parsePastedGuests(pasted);
    $("#guest-import-file").value = "";
    $("#guest-import-file-name").textContent = "Lista pegada directamente";
    state.guestImport = { fileName: "Lista pegada", ...parsed };
    renderGuestImportPreview();
  } catch (error) {
    state.guestImport = guestImportEmptyState("Lista pegada");
    state.guestImport.errors = [error.message];
    renderGuestImportPreview();
  }
});

$("#clear-guest-import").addEventListener("click", resetGuestImport);

$("#import-guests-button").addEventListener("click", async (event) => {
  const selected = state.selectedEvent;
  const { rows, errors } = state.guestImport;
  if (!selected || selected.accessMode !== "personal") return toast("Seleccione un evento con QR personal.", true);
  if (!rows.length || errors.length || rows.length > GUEST_IMPORT_MAX_ROWS) return;
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Importando…";
  try {
    const result = await api(`/api/events/${selected.id}/guests/import`, {
      method: "POST",
      body: JSON.stringify({
        listId: Number($("#guest-import-list").value),
        guests: rows.map((row) => ({
          fullName: row.fullName,
          contact: row.contact || null,
          notes: row.notes || null
        }))
      })
    });
    resetGuestImport();
    await openEvent(selected.id);
    toast(`${result.createdCount} ${result.createdCount === 1 ? "invitación creada" : "invitaciones creadas"} correctamente.`);
  } catch (error) {
    renderGuestImportPreview();
    toast(error.message, true);
  }
});

$("#new-guest-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const selected = state.selectedEvent;
  if (!selected) return;
  const values = formValues(form);
  const guestName = cleanGuestText(values.fullName);
  try {
    const guest = await api(`/api/events/${selected.id}/guests`, {
      method: "POST",
      body: JSON.stringify({
        listId: Number(values.listId),
        fullName: guestName,
        contact: cleanGuestText(values.contact) || null,
        notes: cleanGuestText(values.notes) || null
      })
    });
    form.reset();
    toast("Invitación personal creada.");
    await openEvent(selected.id);
    showAccessQr(guest.qrToken, guestName, `${selected.name} · Invitación personal`, invitationPublicUrl(guest.qrToken));
  } catch (error) { toast(error.message, true); }
});

$("#event-guests-table").addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-guest-edit]");
  const qrButton = event.target.closest("[data-guest-qr]");
  const shareButton = event.target.closest("[data-guest-share]");
  const reissueButton = event.target.closest("[data-guest-reissue]");
  const statusButton = event.target.closest("[data-guest-status]");
  const guestId = Number(editButton?.dataset.guestEdit || qrButton?.dataset.guestQr || shareButton?.dataset.guestShare || reissueButton?.dataset.guestReissue || statusButton?.dataset.guestStatus || 0);
  const guest = state.eventGuests.find((item) => Number(item.id) === guestId);
  if (!guest || !state.selectedEvent) return;
  if (editButton) {
    openGuestEditor(guest.id);
    return;
  }
  if (qrButton) {
    showAccessQr(guest.qrToken, guest.fullName, `${state.selectedEvent.name} · Invitación personal`, invitationPublicUrl(guest.qrToken));
    return;
  }
  if (shareButton) {
    try {
      await shareInvitationLink(guest, state.selectedEvent.name);
    } catch (error) {
      if (error.name !== "AbortError") toast("No fue posible compartir el enlace.", true);
    }
    return;
  }
  if (reissueButton) {
    if (!window.confirm(`El QR anterior de ${guest.fullName} dejará de funcionar. ¿Desea continuar?`)) return;
    try {
      const result = await api(`/api/event-guests/${guest.id}/reissue`, { method: "POST", body: JSON.stringify({}) });
      await openEvent(state.selectedEvent.id);
      toast("QR reemplazado. El código anterior quedó invalidado.");
      showAccessQr(result.qrToken, guest.fullName, `${state.selectedEvent.name} · Invitación personal`, invitationPublicUrl(result.qrToken));
    } catch (error) { toast(error.message, true); }
    return;
  }
  if (statusButton) {
    try {
      await api(`/api/event-guests/${guest.id}/status`, { method: "PATCH", body: JSON.stringify({ status: statusButton.dataset.status }) });
      toast(statusButton.dataset.status === "cancelled" ? "Invitación cancelada." : "Invitación restaurada.");
      await openEvent(state.selectedEvent.id);
    } catch (error) { toast(error.message, true); }
  }
});

$("#event-guests-table").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-select-guest]");
  if (!checkbox) return;
  const guestId = Number(checkbox.dataset.selectGuest);
  if (checkbox.checked) state.selectedGuestIds.add(guestId);
  else state.selectedGuestIds.delete(guestId);
  renderEventGuests();
});

$("#select-all-event-guests").addEventListener("change", (event) => {
  filteredEventGuests().forEach((guest) => {
    if (event.currentTarget.checked) state.selectedGuestIds.add(Number(guest.id));
    else state.selectedGuestIds.delete(Number(guest.id));
  });
  renderEventGuests();
});

$("#edit-selected-guest").addEventListener("click", () => {
  if (state.selectedGuestIds.size !== 1) return;
  openGuestEditor([...state.selectedGuestIds][0]);
});

$("#edit-guest-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") return $("#edit-guest-dialog").close();
  const form = event.currentTarget;
  const values = formValues(form);
  try {
    await api(`/api/event-guests/${values.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        listId: Number(values.listId),
        fullName: cleanGuestText(values.fullName),
        contact: cleanGuestText(values.contact) || null,
        notes: cleanGuestText(values.notes) || null
      })
    });
    $("#edit-guest-dialog").close();
    state.selectedGuestIds.clear();
    await openEvent(state.selectedEvent.id);
    toast("Invitado actualizado sin cambiar su QR.");
  } catch (error) {
    toast(error.message, true);
  }
});

$("#delete-selected-guests").addEventListener("click", async () => {
  if (!state.selectedEvent || !state.selectedGuestIds.size) return;
  const ids = [...state.selectedGuestIds];
  if (!window.confirm(`Se eliminarán permanentemente ${ids.length} invitados, sus QR y lecturas. ¿Desea continuar?`)) return;
  try {
    const result = await api(`/api/events/${state.selectedEvent.id}/guests`, {
      method: "DELETE",
      body: JSON.stringify({ ids })
    });
    state.selectedGuestIds.clear();
    await openEvent(state.selectedEvent.id);
    toast(`${result.deleted} invitados y ${result.accessCount} lecturas eliminados.`);
  } catch (error) {
    toast(error.message, true);
  }
});

$("#clear-guest-list").addEventListener("click", async () => {
  const selected = state.selectedEvent;
  const list = activeGuestList();
  const guests = filteredEventGuests();
  if (!selected || !guests.length) return;
  const scope = list ? `la lista “${list.name}”` : `todas las listas de “${selected.name}”`;
  if (!window.confirm(`Se eliminarán permanentemente los ${guests.length} invitados de ${scope}, sus QR y lecturas. ¿Desea continuar?`)) return;
  try {
    const result = await api(`/api/events/${selected.id}/guests`, {
      method: "DELETE",
      body: JSON.stringify({ all: true, listId: list?.id || null })
    });
    state.selectedGuestIds.clear();
    await openEvent(selected.id);
    toast(`${result.deleted} invitados y ${result.accessCount} lecturas eliminados.`);
  } catch (error) {
    toast(error.message, true);
  }
});

$("#download-guest-list").addEventListener("click", async () => {
  try {
    await downloadGuestList();
    toast("Lista de invitados descargada con tokens y enlaces.");
  } catch (error) {
    toast(error.message, true);
  }
});

$("#download-qr").addEventListener("click", () => {
  const canvas = qrCanvas();
  if (!canvas) return toast("No fue posible preparar el QR.", true);
  const link = document.createElement("a");
  link.download = state.qrDownloadName;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

$("#share-qr").addEventListener("click", async () => {
  try {
    const blob = await qrBlob();
    const file = new File([blob], state.qrDownloadName, { type: "image/png" });
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      $("#download-qr").click();
      return toast("El navegador descargó el QR para que pueda compartirlo.");
    }
    await navigator.share({ title: $("#qr-dialog-title").textContent, files: [file] });
  } catch (error) {
    if (error.name !== "AbortError") toast(error.message, true);
  }
});

$("#copy-invitation-link").addEventListener("click", async () => {
  if (!state.qrShareUrl) return;
  try {
    await copyText(state.qrShareUrl);
    toast("Enlace público copiado.");
  } catch {
    toast("No fue posible copiar el enlace.", true);
  }
});

$("#share-invitation-link").addEventListener("click", async () => {
  if (!state.qrShareUrl) return;
  try {
    if (navigator.share) {
      await navigator.share({
        title: `Invitación · ${$("#qr-dialog-title").textContent}`,
        text: "Esta es tu invitación personal a NOOX.",
        url: state.qrShareUrl
      });
      return;
    }
    await copyText(state.qrShareUrl);
    toast("Enlace público copiado.");
  } catch (error) {
    if (error.name !== "AbortError") toast("No fue posible compartir el enlace.", true);
  }
});

$("#start-scanner").addEventListener("click", startEventScanner);
$("#stop-scanner").addEventListener("click", stopEventScanner);
$("#qr-photo-input").addEventListener("change", async (event) => {
  const input = event.currentTarget;
  try {
    await scanQrPhoto(input.files?.[0]);
  } catch {
    setScanResult({ granted: false, decision: "denied", message: "No fue posible leer la foto seleccionada." });
  } finally {
    input.value = "";
  }
});
window.addEventListener("pagehide", stopEventScanner);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopEventScanner();
});

initialize();
