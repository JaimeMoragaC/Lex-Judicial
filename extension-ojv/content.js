/**
 * LexControl OJV — Content Script
 * ================================
 * Se inyecta en las páginas del PJUD y puede:
 * 1. EXPLORAR: Descubrir la estructura del DOM (links, tablas, causas)
 * 2. AUTOMATIZAR: Recorrer causas del Estado Diario, descargar PDFs
 *
 * NOTA IMPORTANTE: Este script corre DENTRO del contexto de la página real.
 * Para el WAF F5, es JavaScript normal del navegador del usuario.
 * No hay diferencia entre esto y un script de Tampermonkey.
 */

(function () {
  "use strict";

  // ─── Estado global ───────────────────────────────────────────────────
  let RUNNING = false;
  let RESULTADOS = [];
  let CAUSAS_DETECTADAS = [];
  let PDFS_DESCARGADOS = 0;
  
  // ─── Patrones de ROL del PJUD ────────────────────────────────────────
  // Formatos conocidos: C-1234-2024, O-5678-2023, T-91011-2022, etc.
  const REGEX_ROL = /\b[A-Z]-?\d{1,6}-\d{4}\b/i;
  const REGEX_ROL_AMPLIO = /\b(?:ROL|RIT|RUC|C|O|T|P|V|E|F|L|M|R|S|A)\s*-?\s*\d{1,7}\s*-\s*\d{4}\b/i;
  const REGEX_NUMERO_CAUSA = /\d{1,7}\s*-\s*\d{4}/;

  // ─── Utilidades ──────────────────────────────────────────────────────

  function log(msg, nivel = "info") {
    console.log(`[LexControl] ${msg}`);
    try {
      chrome.runtime.sendMessage({
        type: "progreso",
        mensaje: msg,
        nivel: nivel,
        stats: {
          causasEncontradas: CAUSAS_DETECTADAS.length,
          pdfsDescargados: PDFS_DESCARGADOS,
        },
      });
    } catch (e) {
      // Popup cerrado, no pasa nada
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout esperando: ${selector}`));
      }, timeout);
    });
  }

  // ─── EXPLORACIÓN ─────────────────────────────────────────────────────

  function explorarPagina() {
    const resultado = {
      success: true,
      url: window.location.href,
      titulo: document.title,
      links: 0,
      tablas: 0,
      causas: [],
      estructura: "",
      elementosInteractivos: [],
    };

    // 1. Contar links y tablas
    resultado.links = document.querySelectorAll("a").length;
    resultado.tablas = document.querySelectorAll("table").length;

    // 2. Buscar causas en el DOM
    const causasEncontradas = buscarCausasEnDOM();
    resultado.causas = causasEncontradas;
    CAUSAS_DETECTADAS = causasEncontradas;

    // 3. Describir estructura
    const bodyText = document.body.innerText.substring(0, 500);
    resultado.estructura = bodyText.replace(/\s+/g, " ").trim();

    // 4. Elementos interactivos relevantes
    const botones = document.querySelectorAll(
      "button, input[type='submit'], a.btn, .btn"
    );
    botones.forEach((btn) => {
      const texto = (btn.innerText || btn.value || "").trim();
      if (texto && texto.length < 60) {
        resultado.elementosInteractivos.push({
          tag: btn.tagName,
          texto: texto,
          href: btn.href || "",
          onclick: btn.getAttribute("onclick") || "",
        });
      }
    });

    return resultado;
  }

  function buscarCausasEnDOM() {
    const causas = [];
    const vistos = new Set();

    // Buscar TODOS los elementos que podrían ser clickeables
    const clickables = document.querySelectorAll("a, td, tr, button, div, span");

    clickables.forEach((el) => {
      const texto = (el.innerText || "").trim();
      
      // Tiene que tener ROL
      const match = texto.match(REGEX_ROL) || texto.match(REGEX_ROL_AMPLIO);
      if (!match) return;

      const rol = match[0];
      if (vistos.has(rol)) return;

      // El elemento MISMOS debe ser clickeable (href o onclick)
      // O debe tener un hijo directo que sea clickeable
      const href = el.getAttribute("href") || "";
      const onclick = el.getAttribute("onclick") || "";
      
      let linkElement = null;

      if (href || onclick) {
        // Asegurarnos de que este elemento no sea de remates
        if (texto.toLowerCase().includes("remate") || (onclick && onclick.toLowerCase().includes("remate"))) {
          return; // Ignorar
        }
        
        // Si el texto es EXACTAMENTE el ROL (o muy parecido), es el link correcto
        if (texto === rol || texto.length < rol.length + 20) {
          linkElement = el;
        } else if (href.toLowerCase().includes("causa") || onclick.toLowerCase().includes("causa")) {
          linkElement = el;
        }
      } else {
        // Buscar hijo clickeable que contenga el ROL
        const a = el.querySelector("a, button");
        if (a) {
          const aText = (a.innerText || "").trim();
          const aOnclick = a.getAttribute("onclick") || "";
          if (aText === rol || aOnclick.toLowerCase().includes("causa")) {
            if (!aText.toLowerCase().includes("remate") && !aOnclick.toLowerCase().includes("remate")) {
              linkElement = a;
            }
          }
        }
      }

      if (linkElement) {
        vistos.add(rol);
        causas.push({
          rol: rol,
          texto: texto.substring(0, 100),
          tieneLink: true,
          href: linkElement.getAttribute("href") || "",
          onclick: linkElement.getAttribute("onclick") || "",
          link: linkElement,
        });
      }
    });

    return causas;
  }
        texto.match(REGEX_ROL_AMPLIO) ||
        href.match(REGEX_ROL) ||
        onclick.match(REGEX_NUMERO_CAUSA);
      if (match && !vistos.has(match[0])) {
        vistos.add(match[0]);
        causas.push({
          rol: match[0],
          texto: texto.substring(0, 150),
          tieneLink: true,
          href: href,
          onclick: onclick,
          celdas: [],
          fila: null,
          link: link,
        });
      }
    });

    // ── Estrategia 3: Buscar divs/spans con ROL ──
    document
      .querySelectorAll(
        "[class*='causa'], [class*='rol'], [class*='caso'], [class*='item'], [id*='causa'], [id*='rol']"
      )
      .forEach((el) => {
        const texto = el.innerText.trim();
        const match =
          texto.match(REGEX_ROL) || texto.match(REGEX_ROL_AMPLIO);
        if (match && !vistos.has(match[0])) {
          vistos.add(match[0]);
          const linkDentro = el.querySelector("a");
          causas.push({
            rol: match[0],
            texto: texto.substring(0, 150),
            tieneLink: !!linkDentro,
            href: linkDentro ? linkDentro.href : null,
            onclick: linkDentro
              ? linkDentro.getAttribute("onclick")
              : el.getAttribute("onclick"),
            celdas: [],
            fila: null,
            link: linkDentro || (el.getAttribute("onclick") ? el : null),
          });
        }
      });

    // ── Estrategia 4: Buscar en el texto completo (último recurso) ──
    if (causas.length === 0) {
      const allText = document.body.innerText;
      const matches = allText.match(
        new RegExp(REGEX_ROL_AMPLIO.source, "gi")
      );
      if (matches) {
        matches.forEach((m) => {
          if (!vistos.has(m)) {
            vistos.add(m);
            causas.push({
              rol: m,
              texto: m,
              tieneLink: false,
              href: null,
              onclick: null,
              celdas: [],
              fila: null,
              link: null,
            });
          }
        });
      }
    }

    return causas;
  }

  // ─── BUSCAR PDFs EN PÁGINA DE CAUSA ──────────────────────────────────

  function buscarPDFsEnPagina() {
    const pdfs = [];
    const vistos = new Set();

    // Buscar links a PDFs
    document.querySelectorAll("a").forEach((link) => {
      const href = link.href || "";
      const onclick = link.getAttribute("onclick") || "";
      const texto = link.innerText.trim();
      const esDescargable =
        href.toLowerCase().includes(".pdf") ||
        href.toLowerCase().includes("download") ||
        href.toLowerCase().includes("descargar") ||
        href.toLowerCase().includes("archivo") ||
        href.toLowerCase().includes("documento") ||
        onclick.toLowerCase().includes("pdf") ||
        onclick.toLowerCase().includes("download") ||
        onclick.toLowerCase().includes("descargar") ||
        onclick.toLowerCase().includes("abrir") ||
        onclick.toLowerCase().includes("ver") ||
        texto.toLowerCase().includes("pdf") ||
        texto.toLowerCase().includes("descargar") ||
        texto.toLowerCase().includes("ver documento") ||
        texto.toLowerCase().includes("ver escrito") ||
        texto.toLowerCase().includes("ver resolución");

      // También buscar iconos de PDF
      const tieneIconoPdf =
        link.querySelector("img[src*='pdf']") ||
        link.querySelector("i.fa-file-pdf") ||
        link.querySelector("[class*='pdf']");

      if ((esDescargable || tieneIconoPdf) && !vistos.has(href + onclick)) {
        vistos.add(href + onclick);
        pdfs.push({
          texto: texto.substring(0, 100),
          href: href,
          onclick: onclick,
          element: link,
        });
      }
    });

    // Buscar botones de descarga
    document
      .querySelectorAll("button, input[type='button'], input[type='submit']")
      .forEach((btn) => {
        const texto = (btn.innerText || btn.value || "").trim();
        const onclick = btn.getAttribute("onclick") || "";
        if (
          texto.toLowerCase().includes("descargar") ||
          texto.toLowerCase().includes("pdf") ||
          onclick.toLowerCase().includes("pdf") ||
          onclick.toLowerCase().includes("download")
        ) {
          pdfs.push({
            texto: texto.substring(0, 100),
            href: "",
            onclick: onclick,
            element: btn,
          });
        }
      });

    // Buscar iframes con PDFs
    document.querySelectorAll("iframe").forEach((iframe) => {
      const src = iframe.src || "";
      if (src.toLowerCase().includes("pdf") || src.toLowerCase().includes("documento")) {
        pdfs.push({
          texto: "PDF en iframe",
          href: src,
          onclick: "",
          element: iframe,
        });
      }
    });

    // Buscar object/embed con PDFs
    document.querySelectorAll("object, embed").forEach((obj) => {
      const src = obj.data || obj.src || "";
      if (src.toLowerCase().includes("pdf")) {
        pdfs.push({
          texto: "PDF embebido",
          href: src,
          onclick: "",
          element: obj,
        });
      }
    });

    return pdfs;
  }

  // ─── REVISIÓN AUTOMÁTICA ─────────────────────────────────────────────

  async function iniciarRevision(config) {
    if (RUNNING) return { success: false, error: "Ya hay una revisión en curso" };
    RUNNING = true;
    RESULTADOS = [];
    PDFS_DESCARGADOS = 0;

    const pausa = (config.pausa || 3) * 1000;
    const causas = CAUSAS_DETECTADAS.filter((c) => c.tieneLink);

    if (causas.length === 0) {
      log("No hay causas con links clickeables. Explora la página primero.", "warn");
      RUNNING = false;
      return { success: false, error: "Sin causas clickeables" };
    }

    log(`Iniciando revisión de ${causas.length} causas...`, "ok");

    // Guardar URL actual para poder volver
    const urlEstadoDiario = window.location.href;

    for (let i = 0; i < causas.length; i++) {
      if (!RUNNING) {
        log("Revisión detenida por el usuario", "warn");
        break;
      }

      const causa = causas[i];
      log(
        `[${i + 1}/${causas.length}] Entrando a causa ${causa.rol}...`,
        "info"
      );

      try {
        // Hacer click en la causa
        if (causa.link) {
          // Si tiene onclick, ejecutarlo
          if (causa.onclick && !causa.href) {
            causa.link.click();
          } else if (causa.href && causa.href !== "#" && causa.href !== "javascript:void(0)") {
            // Navegar via el link
            causa.link.click();
          } else {
            causa.link.click();
          }

          // Esperar a que cargue la nueva página
          await sleep(3000);

          // Buscar PDFs en la página de la causa
          const pdfs = buscarPDFsEnPagina();
          log(`  📄 ${pdfs.length} documentos/PDFs encontrados`, pdfs.length > 0 ? "ok" : "warn");

          const resultadoCausa = {
            rol: causa.rol,
            texto: causa.texto,
            url: window.location.href,
            pdfsEncontrados: pdfs.length,
            pdfs: pdfs.map((p) => ({
              texto: p.texto,
              href: p.href,
            })),
            timestamp: new Date().toISOString(),
          };

          // En el PJUD los documentos más recientes suelen estar ARRIBA (primero en la lista)
          if (pdfs.length > 0) {
            const pdfReciente = pdfs[0]; // El primero de la lista
            log(
              `  ⬇️ Descargando: ${pdfReciente.texto || pdfReciente.href}`,
              "info"
            );

            try {
              let urlToFetch = pdfReciente.href;
              
              // Si no hay href, intentar extraer URL del onclick (ej: window.open('...'))
              if (!urlToFetch && pdfReciente.onclick) {
                const matchUrls = pdfReciente.onclick.match(/(?:'|")([^'"]+\.pdf[^'"]*)(?:'|")|(?:'|")([^'"]+descarga[^'"]*)(?:'|")/i);
                if (matchUrls) {
                  urlToFetch = matchUrls[1] || matchUrls[2];
                  if (urlToFetch && !urlToFetch.startsWith('http')) {
                    urlToFetch = new URL(urlToFetch, window.location.href).href;
                  }
                  log(`  🔍 URL extraída del onclick: ${urlToFetch}`, "info");
                }
              }

              let isRealPdf = false;
              let pdfBlobUrl = null;

              if (urlToFetch && urlToFetch.startsWith("http")) {
                // Fetch the URL to check if it's actually HTML
                const resp = await fetch(urlToFetch);
                const ct = resp.headers.get("content-type") || "";
                
                if (ct.includes("html")) {
                  // PJUD is returning an HTML viewer page
                  const text = await resp.text();
                  const parser = new DOMParser();
                  const doc = parser.parseFromString(text, "text/html");
                  // Look for iframe, embed or object containing the real PDF
                  const viewer = doc.querySelector("iframe, embed, object");
                  if (viewer && (viewer.src || viewer.data)) {
                    let realSrc = viewer.src || viewer.data;
                    // Make absolute URL
                    realSrc = new URL(realSrc, urlToFetch).href;
                    log(`  🔍 PDF real detectado en visor: ${realSrc.substring(0, 50)}...`, "info");
                    
                    // Fetch the real PDF
                    const pdfResp = await fetch(realSrc);
                    const pdfBlob = await pdfResp.blob();
                    pdfBlobUrl = URL.createObjectURL(pdfBlob);
                    isRealPdf = true;
                  }
                } else if (ct.includes("pdf")) {
                  // It's a direct PDF link
                  const pdfBlob = await resp.blob();
                  pdfBlobUrl = URL.createObjectURL(pdfBlob);
                  isRealPdf = true;
                }
              }

              if (isRealPdf && pdfBlobUrl) {
                // Enviar Blob URL local al background para descarga limpia
                chrome.runtime.sendMessage({
                  type: "descargar_pdf",
                  url: pdfBlobUrl,
                  filename: `${config.carpeta || "LexControl_OJV"}/${causa.rol.replace(/\//g, "-")}_${new Date().toISOString().slice(0, 10)}.pdf`,
                });
                PDFS_DESCARGADOS++;
                resultadoCausa.pdfDescargado = true;
                log("  ✅ PDF extraído y descargado correctamente", "ok");
                
                // Limpiar Blob URL después de unos segundos
                setTimeout(() => URL.revokeObjectURL(pdfBlobUrl), 15000);
              } else {
                // Fallback: Click directo en el elemento
                pdfReciente.element.click();
                await sleep(3000);
                PDFS_DESCARGADOS++;
                resultadoCausa.pdfDescargado = true;
                log("  ✅ PDF abierto/descargado via click normal", "ok");
              }
            } catch (e) {
              log(`  ❌ Error descargando PDF: ${e.message}`, "err");
              resultadoCausa.pdfDescargado = false;
              resultadoCausa.errorPdf = e.message;
            }
          } else {
            resultadoCausa.pdfDescargado = false;
            log("  ⚠️ Sin PDFs en esta causa", "warn");
          }

          RESULTADOS.push(resultadoCausa);

          // Volver al Estado Diario
          log("  ↩️ Volviendo al Estado Diario...", "info");
          window.history.back();
          await sleep(2000);

          // Verificar que volvimos (si no, navegar directamente)
          if (
            !window.location.href.includes("estado") &&
            !window.location.href.includes("diario")
          ) {
            window.location.href = urlEstadoDiario;
            await sleep(3000);
            // Re-explorar causas en la página
            CAUSAS_DETECTADAS = buscarCausasEnDOM();
          }
        }

        // Pausa configurable entre causas
        log(
          `  ⏳ Pausa ${config.pausa || 3}s antes de siguiente causa...`,
          "info"
        );
        await sleep(pausa);
      } catch (error) {
        log(`  ❌ Error en causa ${causa.rol}: ${error.message}`, "err");
        RESULTADOS.push({
          rol: causa.rol,
          error: error.message,
          timestamp: new Date().toISOString(),
        });

        // Intentar volver
        try {
          window.history.back();
          await sleep(2000);
        } catch (e) {
          window.location.href = urlEstadoDiario;
          await sleep(3000);
        }
      }
    }

    RUNNING = false;

    // Guardar resultados
    chrome.storage.local.set({
      lexcontrol_stats: {
        causasEncontradas: CAUSAS_DETECTADAS.length,
        pdfsDescargados: PDFS_DESCARGADOS,
      },
      lexcontrol_resultados: RESULTADOS,
    });

    // Notificar completado
    try {
      chrome.runtime.sendMessage({
        type: "completado",
        stats: {
          causasEncontradas: CAUSAS_DETECTADAS.length,
          pdfsDescargados: PDFS_DESCARGADOS,
        },
        resultados: RESULTADOS,
      });
    } catch (e) {
      // Popup cerrado
    }

    log(
      `✅ Revisión completada: ${RESULTADOS.length} causas, ${PDFS_DESCARGADOS} PDFs`,
      "ok"
    );

    // Enviar a servidor local si está disponible
    enviarAServidor(RESULTADOS);

    return { success: true, totalCausas: causas.length };
  }

  // ─── INTEGRACIÓN CON SERVIDOR LOCAL ──────────────────────────────────

  async function enviarAServidor(resultados) {
    try {
      const resp = await fetch("http://localhost:8888/estado-diario-extension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: new Date().toISOString(),
          totalCausas: resultados.length,
          pdfsDescargados: PDFS_DESCARGADOS,
          resultados: resultados,
        }),
      });
      if (resp.ok) {
        log("📡 Resultados enviados al servidor LexControl", "ok");
      }
    } catch (e) {
      // Servidor no disponible, no es crítico
      log("Servidor local no disponible (no es error)", "info");
    }
  }

  // ─── INDICADOR VISUAL EN LA PÁGINA ───────────────────────────────────

  function mostrarIndicador() {
    if (document.getElementById("lexcontrol-indicator")) return;

    const indicator = document.createElement("div");
    indicator.id = "lexcontrol-indicator";
    indicator.innerHTML = "⚖️ LexControl activo";
    document.body.appendChild(indicator);
  }

  // ─── LISTENER DE MENSAJES ────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case "explorar":
        sendResponse(explorarPagina());
        break;

      case "iniciar_revision":
        iniciarRevision(msg).then((result) => {
          // La respuesta ya se envió arriba, pero el proceso es async
        });
        sendResponse({ success: true, totalCausas: CAUSAS_DETECTADAS.length });
        break;

      case "detener":
        RUNNING = false;
        sendResponse({ success: true });
        break;

      case "exportar":
        sendResponse({ data: RESULTADOS });
        break;

      case "ping":
        sendResponse({ alive: true, url: window.location.href });
        break;

      default:
        sendResponse({ error: "Acción desconocida" });
    }

    return true; // Mantener canal abierto para async
  });

  // ─── INICIO ──────────────────────────────────────────────────────────

  mostrarIndicador();
  console.log(
    "%c[LexControl OJV] Extensión cargada en " + window.location.href,
    "color: #4ade80; font-weight: bold; font-size: 14px;"
  );
})();
