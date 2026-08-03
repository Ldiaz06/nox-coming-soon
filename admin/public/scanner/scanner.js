const doorState = {
  csrf: null,
  user: null,
  stream: null,
  frame: null,
  locked: false,
  lastToken: null,
  absentFrames: 0,
  lastFrameAt: 0,
  feedbackTimer: null
};

const $ = (selector) => document.querySelector(selector);

async function doorApi(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && doorState.csrf) {
    headers["X-CSRF-Token"] = doorState.csrf;
  }
  const requested = new URL(path, window.location.origin);
  const endpoint = new URL("/index.php", window.location.origin);
  endpoint.searchParams.set("api_path", requested.pathname.replace(/^\/api\/?/, ""));
  const response = await fetch(endpoint, { credentials: "same-origin", ...options, headers });
  if (response.status === 401) {
    window.location.replace("/");
    throw new Error("La sesión expiró.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "No fue posible completar la operación.");
  }
  return response.status === 204 ? null : response.json();
}

function setConnection(ready, label) {
  $("#connection-status").textContent = label;
  $("#connection-status").classList.toggle("is-ready", ready);
}

function updateClock() {
  const now = new Date();
  $("#door-time").textContent = new Intl.DateTimeFormat("es-PA", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Panama"
  }).format(now);
  $("#door-date").textContent = new Intl.DateTimeFormat("es-PA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Panama"
  }).format(now);
}

function setCameraState(live) {
  $("#camera-indicator").classList.toggle("is-live", live);
  $("#camera-label").textContent = live ? "Escaneando" : "Cámara apagada";
  $("#stop-camera").hidden = !live;
  $("#camera-intro").hidden = live;
}

function showFeedback(result) {
  const feedback = $("#scan-feedback");
  const granted = Boolean(result.granted);
  const duration = granted ? 2800 : 4200;
  const eventDetail = result.event?.name
    ? `${result.event.name}${result.admittedCount ? ` · ${result.admittedCount} entradas` : ""}`
    : "";
  clearTimeout(doorState.feedbackTimer);
  feedback.hidden = true;
  feedback.classList.remove("is-granted", "is-denied", "is-duplicate");
  void feedback.offsetWidth;
  feedback.classList.add(granted ? "is-granted" : result.decision === "duplicate" ? "is-duplicate" : "is-denied");
  $("#feedback-icon").textContent = granted ? "✓" : "×";
  $("#feedback-title").textContent = granted
    ? (result.guest?.name ? `¡Bienvenido, ${result.guest.name}!` : "ENTRADA AUTORIZADA")
    : "ACCESO DENEGADO";
  $("#feedback-detail").textContent = granted
    ? (eventDetail || "Ingreso registrado correctamente.")
    : `${result.message || "Entrada no autorizada."}${eventDetail ? ` · ${eventDetail}` : ""}`;
  feedback.hidden = false;
  doorState.feedbackTimer = window.setTimeout(() => { feedback.hidden = true; }, duration);
  return duration;
}

async function submitToken(token) {
  if (doorState.locked) return;
  doorState.locked = true;
  let cooldown = 4200;
  try {
    const result = await doorApi("/api/access/scan", {
      method: "POST",
      body: JSON.stringify({ token })
    });
    cooldown = showFeedback(result);
    if (navigator.vibrate) navigator.vibrate(result.granted ? 90 : [70, 45, 70]);
  } catch (error) {
    cooldown = showFeedback({ granted: false, decision: "denied", message: error.message });
  } finally {
    window.setTimeout(() => { doorState.locked = false; }, cooldown);
  }
}

function scanSource(source, width, height) {
  const canvas = $("#door-canvas");
  const scale = Math.min(1, 960 / width);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
}

function scanFrame(timestamp = 0) {
  const video = $("#door-video");
  if (!doorState.stream || video.readyState < 2 || timestamp - doorState.lastFrameAt < 90) {
    doorState.frame = requestAnimationFrame(scanFrame);
    return;
  }
  doorState.lastFrameAt = timestamp;
  let code = null;
  try {
    code = scanSource(video, video.videoWidth, video.videoHeight);
  } catch {
    code = null;
  }
  if (code?.data) {
    doorState.absentFrames = 0;
    if (code.data !== doorState.lastToken && !doorState.locked) {
      doorState.lastToken = code.data;
      submitToken(code.data);
    }
  } else {
    doorState.absentFrames += 1;
    if (doorState.absentFrames > 8) doorState.lastToken = null;
  }
  doorState.frame = requestAnimationFrame(scanFrame);
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showFeedback({ granted: false, decision: "denied", message: "La cámara requiere abrir esta página mediante HTTPS." });
    return;
  }
  stopCamera();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    doorState.stream = stream;
    doorState.lastToken = null;
    doorState.absentFrames = 0;
    doorState.lastFrameAt = 0;
    const video = $("#door-video");
    video.srcObject = stream;
    await video.play();
    setCameraState(true);
    doorState.frame = requestAnimationFrame(scanFrame);
  } catch (error) {
    showFeedback({
      granted: false,
      decision: "denied",
      message: error.name === "NotAllowedError"
        ? "Permita el acceso a la cámara o use la opción de tomar una foto."
        : "No fue posible abrir la cámara."
    });
  }
}

function stopCamera() {
  if (doorState.frame) cancelAnimationFrame(doorState.frame);
  doorState.frame = null;
  if (doorState.stream) doorState.stream.getTracks().forEach((track) => track.stop());
  doorState.stream = null;
  const video = $("#door-video");
  if (video) video.srcObject = null;
  setCameraState(false);
}

async function scanPhoto(file) {
  if (!file) return;
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = objectUrl;
    });
    const code = scanSource(image, image.naturalWidth, image.naturalHeight);
    if (!code?.data) {
      showFeedback({ granted: false, decision: "denied", message: "No se encontró un QR legible en la foto." });
      return;
    }
    doorState.lastToken = null;
    await submitToken(code.data);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function initializeDoor() {
  updateClock();
  window.setInterval(updateClock, 1000);
  if (document.documentElement.requestFullscreen) $("#fullscreen-button").hidden = false;
  try {
    const { user, csrf } = await doorApi("/api/auth/me");
    doorState.user = user;
    doorState.csrf = csrf;
    $("#operator-name").textContent = user.fullName;
    setConnection(true, "Sesión activa");
    $("#start-camera").disabled = false;
    $("#door-photo").disabled = false;
    $("#door-photo-footer").disabled = false;
  } catch {
    window.location.replace("/");
  }
}

$("#start-camera").addEventListener("click", startCamera);
$("#stop-camera").addEventListener("click", stopCamera);
$("#fullscreen-button").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    // The page already fills the available viewport when native fullscreen is unavailable.
  }
});
[$("#door-photo"), $("#door-photo-footer")].forEach((input) => input.addEventListener("change", async (event) => {
  try {
    await scanPhoto(event.currentTarget.files?.[0]);
  } catch {
    showFeedback({ granted: false, decision: "denied", message: "No fue posible leer la foto seleccionada." });
  } finally {
    event.currentTarget.value = "";
  }
}));
window.addEventListener("pagehide", stopCamera);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopCamera();
});

initializeDoor();
