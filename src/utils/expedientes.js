// expedientes.js - Identidad y búsqueda de expedientes para la Bitácora.
//
// El problema que resuelve: una anotación sobre "don Víctor Garai y la camioneta"
// tenía que reconocerse como la misma que la de ayer sobre "Victor Garai". Antes
// el cruce se hacía con un `includes()` sobre el nombre en mayúsculas, así que un
// tratamiento ("don") o una tilde bastaban para crear un expediente duplicado.
// Y como la identidad era sólo el cliente, dos asuntos distintos de la misma
// persona terminaban revueltos en el mismo expediente.
//
// Acá la identidad es cliente + asunto, y la comparación se hace normalizada.

import { LEXCONTROL_API } from '../apiBase.js';

// Sólo tratamientos. Deliberadamente NO se filtran 'de', 'la', 'del': son parte
// de apellidos chilenos corrientes (De la Fuente, Del Río) y quitarlos los
// mutila.
const TRATAMIENTOS = [
  'don', 'dona', 'senor', 'senora', 'sr', 'sra', 'srta', 'sta',
  'estimado', 'estimada'
];

/** 'DON VÍCTOR GARAI' y 'don victor garai' -> 'victor garai'. */
export function normalizar(texto) {
  if (!texto) return '';
  const base = String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quita tildes y diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')      // puntos, comas, guiones
    .replace(/\s+/g, ' ')
    .trim();
  return base
    .split(' ')
    .filter((p) => p && !TRATAMIENTOS.includes(p))
    .join(' ');
}

/** Palabras significativas, para comparar por solapamiento y no por igualdad. */
function fichas(texto) {
  return new Set(normalizar(texto).split(' ').filter((p) => p.length > 2));
}

/**
 * Parecido entre dos textos: proporción de palabras compartidas respecto del
 * más corto. Se usa el más corto a propósito, para que "Garai" reconozca a
 * "Víctor Garai Soto" sin exigir que el abogado escriba el nombre completo.
 */
export function parecido(a, b) {
  const A = fichas(a);
  const B = fichas(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const f of A) if (B.has(f)) comunes++;
  return comunes / Math.min(A.size, B.size);
}

export const UMBRAL_CLIENTE = 0.6;
export const UMBRAL_ASUNTO = 0.5;

/**
 * Puntúa qué tan bien calza una anotación con un expediente ya abierto.
 * Devuelve 0 cuando el cliente no calza: sin la misma persona no hay expediente,
 * por mucho que el asunto se parezca.
 */
export function puntuar(expediente, { cliente, asunto }) {
  const pCliente = parecido(expediente.cliente, cliente);
  if (pCliente < UMBRAL_CLIENTE) return 0;

  // Sin asunto declarado en alguno de los dos lados no se puede afirmar que sea
  // el mismo asunto; se devuelve una coincidencia parcial para que la interfaz
  // pregunte en vez de decidir sola.
  if (!expediente.asunto || !asunto) return pCliente * 0.7;

  const pAsunto = parecido(expediente.asunto, asunto);
  if (pAsunto < UMBRAL_ASUNTO) return pCliente * 0.5;
  return (pCliente + pAsunto) / 2;
}

/**
 * Candidatos ordenados de mejor a peor, buscando en las dos poblaciones:
 * las causas judiciales del PJUD y los expedientes extrajudiciales abiertos.
 */
export function buscarCandidatos({ cliente, asunto, rol, tramite }, expedientes, causas) {
  const salida = [];
  const yaVistos = new Set();

  for (const e of expedientes) {
    let score = puntuar(e, { cliente, asunto });

    // Búsqueda cruzada adicional por palabras clave si la nota no incluyó el cliente directo
    if (score === 0 && (asunto || tramite)) {
      const textoBuscado = `${asunto || ''} ${tramite || ''}`;
      const pAsuntoExp = parecido(e.asunto, textoBuscado);
      const pClienteExp = parecido(e.cliente, textoBuscado);
      if (pAsuntoExp >= 0.4 || pClienteExp >= 0.4) {
        score = Math.max(pAsuntoExp, pClienteExp) * 0.75;
      }
    }

    if (score > 0) {
      salida.push({ tipo: 'expediente', score, ref: e });
      yaVistos.add(e.id);
    }
  }

  const rolNorm = normalizar(rol);
  for (const c of causas) {
    if (rolNorm && rolNorm !== 'extrajudicial' && normalizar(c.rit).includes(rolNorm)) {
      salida.push({ tipo: 'causa', score: 1, ref: c });
      continue;
    }
    let score = parecido(c.caratula, cliente);

    // Búsqueda secundaria por tribunal, ciudad o materia (ej: Calbuco, querella, etc.)
    if (score < UMBRAL_CLIENTE && (asunto || tramite)) {
      const textoCausa = `${c.caratula || ''} ${c.tribunal || ''} ${c.materia || ''} ${c.resumenTeoriaCaso || ''}`;
      const textoNota = `${cliente || ''} ${asunto || ''} ${tramite || ''}`;
      const pGeneral = parecido(textoCausa, textoNota);
      if (pGeneral >= 0.60) {
        score = pGeneral * 0.7;
      }
    }

    if (score >= 0.50) {
      salida.push({ tipo: 'causa', score: score * 0.9, ref: c });
    }
  }

  return salida.sort((a, b) => b.score - a.score).slice(0, 8);
}

/** Correlativo del año, continuando la numeración existente. */
export function siguienteCorrelativo(expedientes, prefijo = 'EXT') {
  const anio = new Date().getFullYear();
  const usados = expedientes
    .map((e) => new RegExp(`^${prefijo}-(\\d+)-${anio}$`).exec(e.id || ''))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;
  return `${prefijo}-${String(siguiente).padStart(3, '0')}-${anio}`;
}

export function crearExpediente({ cliente, asunto, tipo = 'extrajudicial' }, expedientes) {
  return {
    id: siguienteCorrelativo(expedientes, tipo === 'administrativo' ? 'ADM' : 'EXT'),
    cliente: cliente || 'Cliente sin identificar',
    asunto: asunto || '',
    tipo,
    creadoEn: new Date().toISOString(),
    gestiones: []
  };
}

// --- Persistencia en el servidor ---------------------------------------------
// No en localStorage: perder el registro de expedientes al limpiar el navegador
// significa perder la relación entre cada cliente y su correlativo.

export async function cargarExpedientes() {
  const res = await fetch(`${LEXCONTROL_API}/expedientes`);
  if (!res.ok) throw new Error(`El servidor respondió HTTP ${res.status}`);
  let serverExpedientes = (await res.json()).expedientes || [];

  // Migración de respaldo desde localStorage por si hay expedientes creados antes de la servidorización
  try {
    let migrados = false;
    const mappingStr = localStorage.getItem('lexcontrol_extrajudicial_mapping');
    if (mappingStr) {
      const mapping = JSON.parse(mappingStr);
      for (const [cliente, extId] of Object.entries(mapping)) {
        if (!serverExpedientes.some((e) => e.id === extId || normalizar(e.cliente) === normalizar(cliente))) {
          serverExpedientes.push({
            id: extId,
            cliente,
            asunto: 'gestión general',
            tipo: extId.startsWith('ADM') ? 'administrativo' : 'extrajudicial',
            creadoEn: new Date().toISOString(),
            gestiones: []
          });
          migrados = true;
        }
      }
    }

    const casosIAStr = localStorage.getItem('lexcontrol_casos_ia');
    if (casosIAStr) {
      const casosIA = JSON.parse(casosIAStr);
      for (const c of casosIA) {
        if (c.cliente && !serverExpedientes.some((e) => e.id === c.id || normalizar(e.cliente) === normalizar(c.cliente))) {
          serverExpedientes.push({
            id: c.id || `EXT-${Date.now()}`,
            cliente: c.cliente,
            asunto: c.asunto || c.caratula || 'gestión general',
            tipo: 'extrajudicial',
            creadoEn: new Date().toISOString(),
            gestiones: []
          });
          migrados = true;
        }
      }
    }

    if (migrados) {
      guardarExpedientes(serverExpedientes).catch(() => {});
    }
  } catch (e) {
    console.warn('Aviso migración expedientes:', e);
  }

  return serverExpedientes;
}

export async function guardarExpedientes(expedientes) {
  const res = await fetch(`${LEXCONTROL_API}/expedientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expedientes })
  });
  if (!res.ok) throw new Error(`No se pudo guardar: HTTP ${res.status}`);
  return res.json();
}
