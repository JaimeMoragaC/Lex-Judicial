/**
 * LexControl OJV — Background Service Worker
 * Maneja descargas de PDFs y coordinación entre popup y content script.
 */

// Manejar descargas de PDFs
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "descargar_pdf" && msg.url) {
    chrome.downloads.download(
      {
        url: msg.url,
        filename: msg.filename || "LexControl_OJV/documento.pdf",
        conflictAction: "uniquify",
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[LexControl] Error descarga:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log(`[LexControl] Descarga iniciada: ID ${downloadId}`);
          // Notificar al popup
          chrome.runtime.sendMessage({
            type: "pdf_descargado",
            archivo: msg.filename,
            downloadId: downloadId,
          });
        }
      }
    );
  }

  // Reenviar mensajes de progreso del content script al popup
  if (msg.type === "progreso" || msg.type === "completado") {
    // Los mensajes se reenvían automáticamente al popup
    // porque ambos usan chrome.runtime.onMessage
  }

  return true;
});

// Monitorear descargas completadas
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === "complete") {
    chrome.downloads.search({ id: delta.id }, (downloads) => {
      if (downloads.length > 0) {
        const dl = downloads[0];
        console.log(`[LexControl] Descarga completada: ${dl.filename}`);
      }
    });
  }
});

// Log cuando la extensión se instala
chrome.runtime.onInstalled.addListener(() => {
  console.log("[LexControl OJV] Extensión instalada correctamente.");
});
