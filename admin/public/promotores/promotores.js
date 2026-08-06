const promoterState = { code: "", portal: null, created: [] };
const promoter = (selector, root = document) => root.querySelector(selector);
const codePattern = /(?:^|[^A-F0-9])(PR-[A-F0-9]{24})(?![A-F0-9])/i;
const promoterDate = new Intl.DateTimeFormat("es-PA", { dateStyle: "full", timeStyle: "short", timeZone: "America/Panama" });

function extractCode(value) {
  const decoded = (() => { try { return decodeURIComponent(String(value || "")); } catch { return String(value || ""); } })();
  return decoded.toUpperCase().match(codePattern)?.[1] || "";
}

async function promoterApi(path, body) {
  const response = await fetch(`/index.php?api_path=${encodeURIComponent(path)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "No fue posible completar la operación.");
  return payload;
}

function showPromoterPanel(name) {
  promoter("#code-panel").hidden = name !== "code";
  promoter("#loading-panel").hidden = name !== "loading";
  promoter("#workspace-panel").hidden = name !== "workspace";
}

function repairText(value) {
  return String(value || "").replace(/(?:Ã.|Â.|â..)+/gu, (sequence) => {
    try {
      const bytes = Uint8Array.from([...sequence].map((character) => character.codePointAt(0)));
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return sequence;
    }
  }).replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/gu, " ").replace(/[\u200b\u2060\ufeff]/gu, "").normalize("NFC").trim();
}

function parseGuestLine(source, rowNumber) {
  let line = repairText(source).replace(/\t+/g, " | ")
    .replace(/^(?:\d{1,4}\s*[\.):]\s*|[A-Za-z]\s*[\.)]\s*|[•●▪◦*#\-–—]\s*)/u, "")
    .trim();
  if (!line) return null;
  const contact = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s()./-]{5,}\d/iu);
  let fullName = "", contactValue = "", notes = "";
  if (contact) {
    fullName = repairText(line.slice(0, contact.index)).replace(/[|,;:\-–—]+$/u, "").trim();
    contactValue = repairText(contact[0]);
    notes = repairText(line.slice(contact.index + contact[0].length)).replace(/^[|,;:\-–—]+/u, "").trim();
  } else {
    const parts = line.split(/\s*[|;,]\s*/u).map(repairText).filter(Boolean);
    fullName = parts.shift() || "";
    notes = parts.join(" ");
  }
  if (fullName.length < 2 || fullName.length > 160) throw new Error(`Línea ${rowNumber}: revise el nombre.`);
  if (contactValue.length > 160 || notes.length > 300) throw new Error(`Línea ${rowNumber}: el contacto o la nota es demasiado largo.`);
  return { fullName, contact: contactValue || null, notes: notes || null };
}

function parseGuestList(value) {
  const rows = String(value || "").split(/\r?\n/).map((line, index) => parseGuestLine(line, index + 1)).filter(Boolean);
  if (!rows.length) throw new Error("Pegue al menos un nombre.");
  if (rows.length > 100) throw new Error("Puede agregar hasta 100 personas por envío.");
  return rows;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value; input.style.position = "fixed"; input.style.opacity = "0";
  document.body.append(input); input.select(); document.execCommand("copy"); input.remove();
}

function renderCreated(created) {
  promoterState.created = created;
  const container = promoter("#created-invitations");
  container.innerHTML = created.map((guest, index) => `<article class="created-row">
    <div><strong>${escapeHtml(guest.fullName)}</strong><small>${escapeHtml(guest.invitationUrl)}</small></div>
    <button class="copy-link" type="button" data-copy="${index}">Copiar enlace</button>
    <button class="share-link" type="button" data-share="${index}">Compartir</button>
  </article>`).join("");
  promoter("#result-panel").hidden = false;
  promoter("#guest-count").textContent = String(Number(promoterState.portal.guestCount || 0) + created.length);
  promoterState.portal.guestCount = Number(promoterState.portal.guestCount || 0) + created.length;
  promoter("#result-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

async function loadPortal(code) {
  promoterState.code = code;
  promoter("#code-error").textContent = "";
  showPromoterPanel("loading");
  try {
    const { portal: details } = await promoterApi("public/promoters/lookup", { code });
    promoterState.portal = details;
    promoter("#event-name").textContent = details.eventName;
    promoter("#event-date").textContent = promoterDate.format(new Date(details.startsAt));
    promoter("#list-name").textContent = details.listName;
    promoter("#guest-count").textContent = details.guestCount;
    showPromoterPanel("workspace");
  } catch (error) {
    promoterState.code = "";
    history.replaceState(null, "", location.pathname);
    promoter("#code-error").textContent = error.message;
    showPromoterPanel("code");
  }
}

async function submitGuests(form, guests) {
  const button = promoter("button[type=submit]", form);
  const message = promoter("[data-form-message]", form);
  button.disabled = true; message.classList.remove("is-error"); message.textContent = "Creando invitaciones…";
  try {
    const result = await promoterApi("public/promoters/guests", { code: promoterState.code, guests });
    form.reset();
    message.textContent = `${result.createdCount} ${result.createdCount === 1 ? "invitación creada" : "invitaciones creadas"}.`;
    renderCreated(result.created);
  } catch (error) {
    message.classList.add("is-error"); message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

promoter("#code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = extractCode(promoter("#promoter-code").value);
  if (!code) return promoter("#code-error").textContent = "Revise el código recibido.";
  history.replaceState(null, "", `#${code}`);
  loadPortal(code);
});

promoter("#single-guest-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  submitGuests(event.currentTarget, [{
    fullName: repairText(data.get("fullName")),
    contact: repairText(data.get("contact")) || null,
    notes: repairText(data.get("notes")) || null
  }]);
});

promoter("#bulk-guest-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = promoter("[data-form-message]", event.currentTarget);
  try {
    message.classList.remove("is-error");
    submitGuests(event.currentTarget, parseGuestList(new FormData(event.currentTarget).get("guests")));
  } catch (error) {
    message.classList.add("is-error"); message.textContent = error.message;
  }
});

promoter("#created-invitations").addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-copy]");
  const share = event.target.closest("[data-share]");
  const index = Number(copy?.dataset.copy ?? share?.dataset.share ?? -1);
  const guest = promoterState.created[index];
  if (!guest) return;
  if (share && navigator.share) {
    try { await navigator.share({ title: "Invitación NOX", text: `${guest.fullName}, esta es tu invitación personal.`, url: guest.invitationUrl }); } catch {}
  } else {
    await copyText(guest.invitationUrl);
    event.target.textContent = "Copiado";
  }
});

promoter("#copy-all-links").addEventListener("click", async () => {
  await copyText(promoterState.created.map((guest) => `${guest.fullName}: ${guest.invitationUrl}`).join("\n"));
  promoter("#copy-all-links").textContent = "Copiados";
});

promoter("#change-code").addEventListener("click", () => {
  promoterState.code = ""; promoterState.portal = null; promoterState.created = [];
  history.replaceState(null, "", location.pathname);
  promoter("#promoter-code").value = "";
  promoter("#result-panel").hidden = true;
  showPromoterPanel("code");
});

const initialCode = extractCode(location.hash);
if (initialCode) {
  promoter("#promoter-code").value = initialCode;
  loadPortal(initialCode);
} else {
  showPromoterPanel("code");
}
