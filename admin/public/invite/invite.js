const portalState = {
  token: "",
  invitation: null
};

const portal = (selector) => document.querySelector(selector);
const tokenPattern = /(?:^|[^A-Za-z0-9_-])(P[A-Za-z0-9_-]{31})(?![A-Za-z0-9_-])/;
const eventDate = new Intl.DateTimeFormat("es-PA", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "America/Panama"
});

function invitationToken(value) {
  const decoded = (() => {
    try {
      return decodeURIComponent(String(value || "").trim());
    } catch {
      return String(value || "").trim();
    }
  })();
  const match = decoded.match(tokenPattern);
  return match ? match[1] : "";
}

function shareUrl(token = portalState.token) {
  return `${window.location.origin}/invite/#${token}`;
}

function showPanel(name) {
  portal("#token-panel").hidden = name !== "token";
  portal("#loading-panel").hidden = name !== "loading";
  portal("#invitation-panel").hidden = name !== "invitation";
}

async function publicApi(path, options = {}) {
  const response = await fetch(`/index.php?api_path=${encodeURIComponent(path)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    throw new Error(payload?.error || "No fue posible completar la operación.");
  }
  return payload;
}

function renderQr(token) {
  const container = portal("#invitation-qr");
  container.replaceChildren();
  new QRCode(container, {
    text: `NOX1:${token}`,
    width: 360,
    height: 360,
    colorDark: "#050505",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

function unavailableDescription(code) {
  const descriptions = {
    cancelled: "Esta invitación fue cancelada por el organizador y su QR ya no permite el acceso.",
    admitted: "Esta invitación ya fue utilizada. La entrada quedó registrada correctamente.",
    event_cancelled: "El evento fue cancelado y esta invitación ya no permite el acceso.",
    event_closed: "El evento está cerrado y esta invitación ya no permite el acceso.",
    ended: "El horario del evento ya finalizó y esta invitación dejó de estar activa."
  };
  return descriptions[code] || "Esta invitación ya no está disponible.";
}

function renderInvitation(invitation) {
  portalState.invitation = invitation;
  portal("#guest-name").textContent = invitation.guestName;
  portal("#event-name").textContent = invitation.event.name;
  portal("#event-date").textContent = eventDate.format(new Date(invitation.event.startsAt));

  const badge = portal("#invitation-status");
  badge.textContent = invitation.status.label;
  badge.classList.toggle("is-unavailable", !invitation.qrAvailable);
  portal("#qr-area").hidden = !invitation.qrAvailable;
  portal("#invitation-actions").hidden = !invitation.qrAvailable;
  portal("#wallet-area").hidden = !invitation.qrAvailable;
  portal("#unavailable-message").hidden = invitation.qrAvailable;
  if (!invitation.qrAvailable) {
    portal("#unavailable-message").textContent = unavailableDescription(invitation.status.code);
  } else {
    renderQr(portalState.token);
  }

  portal("#apple-wallet").hidden = !invitation.wallet.apple;
  portal("#google-wallet").hidden = !invitation.wallet.google;
  portal("#wallet-message").textContent = invitation.qrAvailable
    && !invitation.wallet.apple
    && !invitation.wallet.google
    ? "El organizador todavía no ha habilitado las descargas para Wallet."
    : "";
  showPanel("invitation");
}

async function loadInvitation(token) {
  portalState.token = token;
  portal("#token-error").textContent = "";
  showPanel("loading");
  try {
    const payload = await publicApi("public/invitations/lookup", {
      body: JSON.stringify({ token })
    });
    renderInvitation(payload.invitation);
  } catch (error) {
    portalState.token = "";
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    portal("#invitation-token").value = "";
    portal("#token-error").textContent = error.message;
    showPanel("token");
    portal("#invitation-token").focus();
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function qrCanvas() {
  return portal("#invitation-qr canvas");
}

portal("#token-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const token = invitationToken(portal("#invitation-token").value);
  if (!token) {
    portal("#token-error").textContent = "El token no tiene el formato correcto. Revísalo e inténtalo nuevamente.";
    return;
  }
  history.replaceState(null, "", `#${token}`);
  loadInvitation(token);
});

portal("#change-token").addEventListener("click", () => {
  portalState.token = "";
  portalState.invitation = null;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  portal("#invitation-token").value = "";
  portal("#token-error").textContent = "";
  showPanel("token");
  portal("#invitation-token").focus();
});

portal("#download-qr").addEventListener("click", () => {
  const canvas = qrCanvas();
  if (!canvas) return;
  const link = document.createElement("a");
  link.download = `invitacion-${portalState.invitation.event.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "nox"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

portal("#share-invitation").addEventListener("click", async () => {
  const url = shareUrl();
  try {
    if (navigator.share) {
      await navigator.share({
        title: `Invitación · ${portalState.invitation.event.name}`,
        text: `${portalState.invitation.guestName}, esta es tu invitación personal a NOX.`,
        url
      });
      return;
    }
    await copyText(url);
    portal("#wallet-message").textContent = "Enlace de invitación copiado.";
  } catch (error) {
    if (error.name !== "AbortError") {
      portal("#wallet-message").textContent = "No fue posible compartir el enlace.";
    }
  }
});

portal("#apple-wallet").addEventListener("click", () => {
  portal("#wallet-message").textContent = "Preparando Apple Wallet…";
  const form = document.createElement("form");
  form.method = "post";
  form.action = "/index.php?api_path=public%2Finvitations%2Fapple-wallet";
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "token";
  input.value = portalState.token;
  form.append(input);
  document.body.append(form);
  form.submit();
  form.remove();
});

portal("#google-wallet").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  portal("#wallet-message").textContent = "Preparando Google Wallet…";
  try {
    const payload = await publicApi("public/invitations/google-wallet", {
      body: JSON.stringify({ token: portalState.token })
    });
    window.location.assign(payload.url);
  } catch (error) {
    portal("#wallet-message").textContent = error.message;
    button.disabled = false;
  }
});

const initialToken = invitationToken(location.hash);
if (initialToken) {
  portal("#invitation-token").value = initialToken;
  loadInvitation(initialToken);
} else {
  showPanel("token");
}
