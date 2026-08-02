/**
 * LexControl OJV — Popup Controller
 * Controla la extensión desde el popup del navegador.
 */

const logArea = document.getElementById("logArea");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const btnExplorar = document.getElementById("btnExplorar");
const btnIniciar = document.getElementById("btnIniciar");
const btnDetener = document.getElementById("btnDetener");
const btnExportar = document.getElementById("btnExportar");
const causasEncontradas = document.getElementById("causasEncontradas");
const pdfsDescargados = document.getElementById("pdfsDescargados");

function addLog(msg, tipo = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry log-${tipo}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
}

function updateStats(data) {
  if (data.causasEncontradas !== undefined) {
    causasEncontradas.textContent = data.causasEncontradas;
  }
  if (data.pdfsDescargados !== undefined) {
    pdfsDescargados.textContent = data.pdfsDescargados;
  }
}

function setStatus(estado, texto) {
  statusDot.className = `status-dot ${estado}`;
  statusText.textContent = texto;
}

// Enviar mensaje al content script de la pestaña activa
async function sendToContent(action, data = {}) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      addLog("No hay pestaña activa", "err");
      return null;
    }

    // Verificar que estamos en OJV
    if (!tab.url || !tab.url.includes("pjud.cl")) {
      addLog("No estás en el sitio del PJUD. Navega a oficinajudicialvirtual.pjud.cl", "warn");
      return null;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action, ...data });
    return response;
  } catch (error) {
    addLog(`Error comunicación: ${error.message}`, "err");
    return null;
  }
}

// Verificar conexión al cargar
async function verificarConexion() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes("pjud.cl")) {
    setStatus("active", "Conectado a OJV");
    addLog("Conectado al portal del Poder Judicial", "ok");
    btnExplorar.disabled = false;
  } else {
    setStatus("", "No estás en pjud.cl");
    addLog("Navega a oficinajudicialvirtual.pjud.cl primero", "warn");
  }
}

// EXPLORAR — Descubre qué hay en la página actual
btnExplorar.addEventListener("click", async () => {
  logArea.innerHTML = ""; // Limpiar bitácora anterior
  updateStats({ causasEncontradas: 0, pdfsDescargados: 0 }); // Limpiar stats
  
  addLog("Explorando página actual...", "info");
  btnExplorar.disabled = true;
  setStatus("working", "Explorando DOM...");

  const result = await sendToContent("explorar");

  if (result && result.success) {
    addLog(`Página: ${result.titulo}`, "ok");
    addLog(`URL: ${result.url}`, "info");
    addLog(`Links encontrados: ${result.links}`, "info");
    addLog(`Tablas encontradas: ${result.tablas}`, "info");

    if (result.causas && result.causas.length > 0) {
      addLog(`✅ ${result.causas.length} CAUSAS detectadas`, "ok");
      updateStats({ causasEncontradas: result.causas.length });
      btnIniciar.disabled = false;

      result.causas.slice(0, 5).forEach((c, i) => {
        addLog(`  [${i + 1}] ${c.rol || c.texto || "Sin ROL"}`, "info");
      });
      if (result.causas.length > 5) {
        addLog(`  ... y ${result.causas.length - 5} más`, "info");
      }
    } else {
      addLog("⚠️ No se detectaron causas. ¿Estás en Estado Diario?", "warn");
    }

    if (result.estructura) {
      addLog(`Estructura DOM: ${result.estructura}`, "info");
    }

    setStatus("active", "Exploración completa");
  } else {
    addLog("No se pudo explorar la página", "err");
    setStatus("", "Error en exploración");
  }

  btnExplorar.disabled = false;
});

// INICIAR — Comienza la revisión automática
btnIniciar.addEventListener("click", async () => {
  const pausa = parseInt(document.getElementById("pausaSegs").value) || 3;
  const carpeta = document.getElementById("carpetaDestino").value;

  addLog(`🚀 Iniciando revisión automática (pausa: ${pausa}s)`, "ok");
  btnIniciar.disabled = true;
  btnDetener.disabled = false;
  btnExplorar.disabled = true;
  setStatus("working", "Revisión en curso...");

  const result = await sendToContent("iniciar_revision", { pausa, carpeta });

  if (result && result.success) {
    addLog(`Revisión iniciada: ${result.totalCausas} causas por procesar`, "ok");
  } else {
    addLog("Error al iniciar revisión", "err");
    btnIniciar.disabled = false;
    btnDetener.disabled = true;
  }
});

// DETENER
btnDetener.addEventListener("click", async () => {
  addLog("⏹ Deteniendo revisión...", "warn");
  await sendToContent("detener");
  btnIniciar.disabled = false;
  btnDetener.disabled = true;
  btnExplorar.disabled = false;
  setStatus("active", "Revisión detenida");
});

// EXPORTAR
btnExportar.addEventListener("click", async () => {
  const result = await sendToContent("exportar");
  if (result && result.data) {
    // Descargar como JSON
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lexcontrol_estado_diario_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("Resultados exportados", "ok");
  }
});

// Escuchar mensajes del content script (progreso)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "progreso") {
    addLog(msg.mensaje, msg.nivel || "info");
    if (msg.stats) updateStats(msg.stats);
  }
  if (msg.type === "completado") {
    addLog("✅ Revisión completada", "ok");
    btnIniciar.disabled = false;
    btnDetener.disabled = true;
    btnExplorar.disabled = false;
    btnExportar.disabled = false;
    setStatus("active", "Revisión completada");
    if (msg.stats) updateStats(msg.stats);
  }
  if (msg.type === "pdf_descargado") {
    addLog(`📄 PDF: ${msg.archivo}`, "ok");
  }
});

// Cargar estado guardado
chrome.storage.local.get(["lexcontrol_stats"], (data) => {
  if (data.lexcontrol_stats) {
    updateStats(data.lexcontrol_stats);
  }
});

verificarConexion();
