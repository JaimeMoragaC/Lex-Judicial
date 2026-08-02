// asistenteReglas.js - El asistente, sin ninguna llamada a un modelo.
//
// Interpreta lo que escribe el abogado con reglas deterministas y devuelve las
// mismas ACCIONES que consumía la versión con Gemini. Mismo contrato, misma
// pantalla, cero cuota, cero internet, cero latencia.
//
// El principio que ordena todo esto
// ---------------------------------
// Una regla NO adivina. Cuando la instrucción no alcanza para identificar algo sin
// ambigüedad, se pregunta. Es preferible un "¿cuál de estos?" a abrir el
// expediente equivocado o inventar un cliente — que es exactamente lo que pasaba
// cuando la palabra "despido" abría 32 fichas.
//
// Y donde hace falta extraer texto libre (el contenido de una gestión, el nombre
// de un cliente nuevo), no se intenta interpretar: se abre el formulario ya
// apuntado al caso correcto y lo escribe el abogado. El sistema no pone palabras
// que él no puso.

import { procedimientosDisponibles, hoyLocal } from './radarPlazos.js';

// --- Texto -------------------------------------------------------------------

/** Minúsculas y sin tildes, para comparar sin sorpresas. */
export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Palabras que no distinguen nada.
 *
 * Incluye las ESTRUCTURALES del dominio: "rol" está en los 1.557 rit del catálogo,
 * así que buscar por esa palabra devuelve todo y no sirve de nada.
 */
const PARADA = new Set([
  'muestrame', 'muestra', 'muestre', 'ver', 'veme', 'abre', 'abrir', 'abreme', 'abrame',
  'dame', 'trae', 'traeme', 'busca', 'buscar', 'buscame', 'consulta', 'consultar',
  'quiero', 'necesito', 'porfa', 'favor', 'puedes', 'podrias', 'ayudame',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'del', 'de', 'al', 'a',
  'en', 'por', 'para', 'con', 'sin', 'sobre', 'que', 'qué', 'mi', 'mis', 'su', 'sus',
  'y', 'o', 'e', 'u', 'lo', 'le', 'me', 'se', 'es', 'son', 'esta', 'este', 'esa', 'ese',
  'expediente', 'expedientes', 'causa', 'causas', 'caso', 'casos', 'ficha', 'fichas',
  'carpeta', 'carpetas', 'juicio', 'juicios',
  'rol', 'rit', 'caratula', 'cliente', 'clientes', 'tribunal', 'juzgado', 'corte',
  'gestion', 'gestiones', 'movimiento', 'movimientos', 'tramite', 'tramites',
  'historial', 'bitacora', 'anotacion', 'anotaciones',
  'tarea', 'tareas', 'pendiente', 'pendientes', 'recordatorio', 'recordatorios',
  'plazo', 'plazos', 'termino', 'terminos',
  'hoy', 'ayer', 'manana', 'dia', 'dias', 'fecha', 'fechas'
]);

function tokens(texto) {
  return normalizar(texto)
    .split(/[^a-z0-9ñ-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !PARADA.has(w));
}

// --- Fechas ------------------------------------------------------------------

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};
const DIAS_SEMANA = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Fecha mencionada en la frase, o null.
 *
 * Devolver null cuando no hay fecha es parte del diseño: una tarea sin fecha se
 * crea sin fecha y se ve en el diff. Poner "hoy" por defecto sería inventar un
 * vencimiento que el abogado no dijo.
 */
export function extraerFecha(texto, desde = hoyLocal()) {
  const t = normalizar(texto);
  const base = new Date(desde + 'T12:00:00');

  if (/\bhoy\b/.test(t)) return iso(base);
  if (/\bmanana\b/.test(t) && !/\bpasado manana\b/.test(t)) {
    const d = new Date(base); d.setDate(d.getDate() + 1); return iso(d);
  }
  if (/\bpasado manana\b/.test(t)) {
    const d = new Date(base); d.setDate(d.getDate() + 2); return iso(d);
  }

  // "en 3 días"
  const enDias = t.match(/\ben (\d{1,3}) dias?\b/);
  if (enDias) {
    const d = new Date(base); d.setDate(d.getDate() + Number(enDias[1])); return iso(d);
  }

  // ISO o dd-mm-aaaa / dd/mm/aaaa
  const isoDirecto = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoDirecto) {
    return `${isoDirecto[1]}-${String(isoDirecto[2]).padStart(2, '0')}-${String(isoDirecto[3]).padStart(2, '0')}`;
  }
  const ddmm = t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (ddmm) {
    return `${ddmm[3]}-${String(ddmm[2]).padStart(2, '0')}-${String(ddmm[1]).padStart(2, '0')}`;
  }

  // "5 de agosto" / "5 de agosto de 2026"
  const conMes = t.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/);
  if (conMes && MESES[conMes[2]]) {
    const anio = conMes[3] ? Number(conMes[3]) : base.getFullYear();
    const mes = MESES[conMes[2]];
    const dia = Number(conMes[1]);
    const cand = new Date(`${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T12:00:00`);
    if (isNaN(cand)) return null;
    // Sin año explícito y ya pasó: se entiende el del año siguiente.
    if (!conMes[3] && iso(cand) < desde) cand.setFullYear(anio + 1);
    return iso(cand);
  }

  // "el viernes" -> el próximo
  const diaSem = t.match(/\b(?:el\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
  if (diaSem) {
    const objetivo = DIAS_SEMANA[diaSem[1]];
    const d = new Date(base);
    let saltos = (objetivo - d.getDay() + 7) % 7;
    if (saltos === 0) saltos = 7;
    d.setDate(d.getDate() + saltos);
    return iso(d);
  }

  return null;
}

// --- Resolución de a qué causa se refiere ------------------------------------

const tieneDigito = (s) => /\d/.test(String(s || ''));

/**
 * A qué causa o expediente apunta la frase.
 *
 * Devuelve siempre el conjunto completo de candidatos y su puntaje, para que el
 * llamador decida: con uno claro actúa, con varios pregunta. Nunca elige "el
 * primero que calzó".
 */
export function resolverReferencia(texto, { expedientes = [], causas = [] } = {}) {
  const t = normalizar(texto);
  const tks = tokens(texto);

  // 1. Un ROL escrito manda sobre cualquier otra pista. Si el abogado se tomó el
  //    trabajo de dictar "821-2026", eso es lo que quiere: no hay nada que inferir.
  const mRol = t.match(/\b([a-z]{0,2}-?\d{1,6}-\d{4})\b/);
  if (mRol) {
    const patron = mRol[1];
    const exactos = [];
    for (const e of expedientes) {
      const hay = `${normalizar(e.id)} ${normalizar(e.ritVinculado)}`;
      if (hay.includes(patron)) exactos.push({ ref: e.id, etiqueta: e.cliente || e.id, origen: 'expediente', puntaje: 99 });
    }
    for (const c of causas) {
      if (normalizar(c.rit).includes(patron)) {
        const ref = tieneDigito(c.rit) ? c.rit : c.id;
        if (!exactos.some((x) => x.ref === ref)) {
          exactos.push({ ref, etiqueta: c.caratula || ref, origen: 'causa', puntaje: 99 });
        }
      }
    }
    if (exactos.length) return { candidatos: exactos, porRol: true };
    // El abogado dictó algo con forma de ROL/RIT y no hay ningún expediente ni
    // causa con ese identificador. Antes esto seguía de largo hacia el punto 2
    // (calce por palabras sueltas del resto de la frase), así que un ROL
    // inexistente podía terminar abriendo un caso sin ninguna relación con lo
    // pedido -sólo porque otra palabra de la frase calzaba con algo-. Un ROL
    // dictado es la pista más fuerte que hay: si no existe, se dice, no se
    // reemplaza por una adivinanza con el resto del texto.
    return { candidatos: [], porRol: true, rolNoEncontrado: patron };
  }

  if (!tks.length) return { candidatos: [], porRol: false };

  // 2. Por palabras, puntuando cuántas distintas calzan. Lo que calza con más
  //    palabras de la frase es lo que se pidió: "Garai de la querella de Calbuco"
  //    calza parcialmente con todos los de Garai, pero con las tres sólo con uno.
  //
  //    El calce es por TOKEN completo, no por substring: `hay.includes(w)`
  //    comparaba subcadenas, y un fragmento corto de una palabra mal escrita
  //    podía calzar dentro de otra palabra sin relación. Pasó de verdad
  //    (31-jul-2026): "ingresa COMOG ESTION..." -typo de "como gestión"- generó
  //    el token suelto "estion", que es substring literal de "geSTIÓN" y así
  //    calzó con el único expediente cuyo asunto dice "Asesoría y Gestión
  //    Extrajudicial", abriendo un caso sin ninguna relación con lo pedido.
  const unicos = new Set(tks);
  const candidatos = [];

  for (const e of expedientes) {
    const hayTokens = new Set(tokens(`${e.cliente} ${e.id} ${e.asunto} ${e.ritVinculado || ''}`));
    const puntaje = [...unicos].filter((w) => hayTokens.has(w)).length;
    if (puntaje) candidatos.push({ ref: e.id, etiqueta: e.cliente || e.id, origen: 'expediente', puntaje });
  }
  for (const c of causas) {
    const hayTokens = new Set(tokens(`${c.caratula} ${c.rit} ${c.cliente || ''}`));
    const puntaje = [...unicos].filter((w) => hayTokens.has(w)).length;
    if (puntaje) {
      const ref = tieneDigito(c.rit) ? c.rit : c.id;
      if (!candidatos.some((x) => x.ref === ref)) {
        candidatos.push({ ref, etiqueta: c.caratula || ref, origen: 'causa', puntaje });
      }
    }
  }

  if (!candidatos.length) return { candidatos: [], porRol: false };

  // Sólo sobreviven los de mejor puntaje.
  const mejor = Math.max(...candidatos.map((c) => c.puntaje));
  return { candidatos: candidatos.filter((c) => c.puntaje === mejor), porRol: false };
}

// --- Procedimientos del catálogo de plazos ------------------------------------

/** El procedimiento del catálogo que mejor calza, sólo si calza de verdad. */
export function resolverProcedimiento(texto) {
  const unicos = new Set(tokens(texto));
  if (!unicos.size) return null;

  let mejor = null;
  for (const p of procedimientosDisponibles()) {
    const hay = normalizar(p.nombre);
    const puntaje = [...unicos].filter((w) => w.length > 3 && hay.includes(w)).length;
    if (puntaje && (!mejor || puntaje > mejor.puntaje)) mejor = { proc: p, puntaje };
  }
  // Con una sola palabra suelta ("recurso") calzan demasiados: no alcanza.
  return mejor && mejor.puntaje >= 2 ? mejor.proc : null;
}

// --- Intenciones --------------------------------------------------------------

const hay = (t, palabras) => palabras.some((w) => t.includes(w));

const RE_INGRESO_GESTION = /\b(ingres\w*|agreg\w*|registr\w*|anot\w*|apunt\w*|nuev[oa])\b(?:\s+\w+){0,3}?\s+\b(gestion\w*|tramite\w*)\b/;

/**
 * Verbos que SÓLO pueden significar crear. "crea", "inicia" o "nuevo" no admiten
 * la otra lectura, así que no hace falta artículo indefinido para reconocerlos:
 * exigirlo hacía que «crea expediente para Pedro Soto» no se detectara y cayera
 * en el "no te entendí".
 */
const RE_CREAR_INEQUIVOCO = /\b(crea\w*|nuev[oa]|inicia\w*|constituy\w*)\b(?:\s+\w+){0,2}?\s+\b(expediente|causa|caso|carpeta)\b/;
/** "abrir" es ambiguo: sólo es crear si viene con artículo indefinido. */
const RE_ABRIR = /\b(abre\w*|abr[ei]\w*)\b(?:\s+\w+){0,2}?\s+\b(expediente|causa|caso|carpeta)\b/;
const RE_INDEFINIDO = /\b(un|una|nuevo|nueva)\s+(expediente|causa|caso|carpeta)\b|\b(expediente|causa)\s+nuev[oa]\b/;

/** Quita tratamientos y deja el nombre como lo usa el resto del sistema. */
function limpiarNombre(s) {
  if (!s) return null;
  const limpio = String(s)
    .replace(/^\s*(don|do[ñn]a|sr\.?|sra\.?|se[ñn]or|se[ñn]ora|dn\.?)\s+/i, '')
    .replace(/[.,;:]+$/, '')
    .trim();
  return limpio || null;
}

const CORTE_ASUNTO = /\s+\b(?:por|sobre|respecto|asunto|materia|de\s+tipo)\b/i;

/**
 * Saca cliente y asunto de la frase.
 *
 * No hay magia: en la práctica el abogado dicta con preposiciones muy regulares
 * ("expediente PARA Pedro Soto POR despido"). Y si la extracción sale mal, se ve
 * en el diff antes de escribir — que es justamente para lo que existe el diff.
 */
export function extraerClienteAsunto(crudo) {
  const t = String(crudo || '');
  let cliente = null;
  let asunto = null;

  // 1. Dictado explícito, que es lo que se le sugiere al abogado cuando falla.
  const mCli = t.match(/\bcliente\s*[:=]\s*([^,;]+?)(?=\s*(?:,|;|\basunto\b|\bmateria\b|$))/i);
  if (mCli) cliente = mCli[1];
  const mAsu = t.match(/\b(?:asunto|materia)\s*[:=]\s*([^,;]+?)(?=\s*(?:,|;|\bcliente\b|$))/i);
  if (mAsu) asunto = mAsu[1];

  // 2. Por preposición: "para X", y si no, "a X".
  if (!cliente) {
    const m = t.match(/\bpara\s+(.+)/i) || t.match(/\ba[l]?\s+(.+)/i);
    if (m) cliente = m[1].split(CORTE_ASUNTO)[0];
  }
  // 3. Sin preposición: lo que va entre el sustantivo y el "por".
  if (!cliente) {
    const m = t.match(/\b(?:expediente|causa|caso|carpeta)\s+(.+)/i);
    if (m) {
      const resto = m[1].split(CORTE_ASUNTO)[0];
      if (resto && !/^(nuev[oa]|un|una)\b/i.test(resto.trim())) cliente = resto;
    }
  }

  if (!asunto) {
    const m = t.match(/\b(?:por|sobre)\s+(.+)/i);
    if (m) asunto = m[1];
  }

  return {
    cliente: limpiarNombre(cliente),
    asunto: asunto ? String(asunto).replace(/[.,;:]+$/, '').trim() || null : null
  };
}

/** Tipo de expediente deducido del vocabulario. Ante la duda, extrajudicial. */
export function deducirTipo(crudo) {
  const t = normalizar(crudo);
  if (hay(t, ['demanda', 'querella', 'juicio', 'tribunal', 'juzgado', 'recurso', 'apelacion', 'corte', 'penal', 'laboral', 'despido', 'alimentos'])) return 'judicial';
  if (hay(t, ['sii', 'impuestos', 'municipal', 'municipalidad', 'administrativ', 'contraloria', 'tesoreria', 'superintendencia'])) return 'administrativo';
  return 'extrajudicial';
}

/** Texto que sigue a un marcador, limpio. Sirve para el título de una tarea. */
function despuesDe(texto, marcadores) {
  for (const m of marcadores) {
    const i = normalizar(texto).indexOf(m);
    if (i >= 0) {
      const resto = texto.slice(i + m.length).trim().replace(/^[:,-]\s*/, '');
      if (resto) return resto;
    }
  }
  return null;
}

/** Quita la parte de la frase que sólo expresaba la fecha. */
function sinFecha(texto) {
  return texto
    .replace(/\bpara\s+(el\s+)?(hoy|manana|mañana|pasado\s+ma[nñ]ana)\b/gi, '')
    .replace(/\bpara\s+(el\s+)?\d{1,2}\s+de\s+[a-záéíóú]+(\s+de\s+\d{4})?/gi, '')
    .replace(/\bpara\s+(el\s+)?(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\b/gi, '')
    .replace(/\b(el\s+)?\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/g, '')
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, '')
    .replace(/\ben \d{1,3} dias?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const pregunta = (respuesta, sinEntender = false) => ({ respuesta, acciones: [], sinEntender });

// --- Consulta: "qué tengo pendiente hoy" ---------------------------------------
//
// "todas las gestiones pendientes para hoy" no es una orden sobre un caso
// concreto: es una pregunta global ("muéstrame qué hay"). Antes no existía
// ninguna regla para esta forma, así que caía en el "no te entendí" genérico —
// el mismo síntoma de siempre: una intención real sin regla que la reconozca.
//
// Frases ya normalizadas (sin tildes, en minúscula) porque normalizar() les
// quita los acentos antes de comparar.
const FRASES_CONSULTA_PENDIENTES = [
  'todas las tareas pendientes', 'todas las pendientes', 'todo lo pendiente',
  'gestiones pendientes', 'tareas pendientes', 'pendientes de hoy', 'pendiente de hoy',
  'que tengo pendiente', 'que tengo hoy', 'que hay pendiente', 'que hay para hoy',
  'que debo hacer', 'resumen del dia', 'mi dia de hoy', 'agenda de hoy', 'agenda del dia'
];

/**
 * Frases que piden TODO lo registrado hoy, sin filtrar por estado.
 *
 * Deliberadamente sin la palabra "pendiente": esa palabra es la que separa esta
 * intención de la anterior. "Gestiones pendientes de hoy" filtra por lo que falta;
 * "todas las gestiones de hoy" no filtra nada — incluye lo ya REALIZADO también.
 */
const FRASES_GESTIONES_DE_HOY = [
  // Sin "todas las gestiones" a secas: esa frase es substring de "todas las
  // gestiones PENDIENTES para hoy" (el caso original), y con ella acá las dos
  // listas dejarían de ser mutuamente excluyentes. "gestiones de hoy" alcanza.
  'gestiones de hoy', 'gestiones del dia', 'todas las gestiones de hoy',
  'que se hizo hoy', 'lo que se hizo hoy', 'bitacora de hoy',
  'movimientos de hoy', 'log de hoy', 'historial de hoy', 'registro de hoy'
];

/**
 * ¿Pide TODAS las gestiones de hoy (cualquier estado), no sólo lo pendiente?
 *
 * Se revisa antes que esConsultaPendientesHoy: por diseño no hay solape entre las
 * dos listas (una exige "pendiente", la otra no lo menciona nunca), así que el
 * orden no cambia el resultado — pero mantenerlo explícito deja claro cuál manda.
 */
export function esConsultaGestionesDeHoy(texto) {
  const t = normalizar(texto);
  if (/\b(borra|borrar|elimina|eliminar|suprime)\b/.test(t)) return false;
  return FRASES_GESTIONES_DE_HOY.some((f) => t.includes(f));
}

/**
 * Redacta el listado completo de gestiones de hoy, agrupado en pendientes y
 * realizadas, a partir de lo que ya calculó gestionesDeHoy() en radarPlazos.js.
 */
export function resumenGestionesDeHoy(gestiones = []) {
  if (!gestiones.length) {
    return 'Hoy no hay ninguna gestión registrada todavía.';
  }

  const pendientes = gestiones.filter((g) => !g.realizada);
  const realizadas = gestiones.filter((g) => g.realizada);
  const lineas = [`Gestiones de hoy (${gestiones.length}):`];

  const listar = (items, tope = 10) => {
    for (const g of items.slice(0, tope)) lineas.push(`• ${g.casoRit} — ${g.titulo}`);
    if (items.length > tope) lineas.push(`… y ${items.length - tope} más.`);
  };

  if (pendientes.length) {
    lineas.push('');
    lineas.push(`Pendientes (${pendientes.length}):`);
    listar(pendientes);
  }
  if (realizadas.length) {
    lineas.push('');
    lineas.push(`Realizadas (${realizadas.length}):`);
    listar(realizadas);
  }
  return lineas.join('\n');
}

/**
 * ¿La frase pide un LISTADO de lo pendiente, en vez de actuar sobre un caso?
 *
 * Se excluye explícitamente si además pide borrar: "borra todas las gestiones
 * pendientes" tiene que seguir cayendo en el rechazo de borrado, no en un listado.
 */
export function esConsultaPendientesHoy(texto) {
  const t = normalizar(texto);
  if (/\b(borra|borrar|elimina|eliminar|suprime)\b/.test(t)) return false;
  return FRASES_CONSULTA_PENDIENTES.some((f) => t.includes(f));
}

/**
 * Redacta el resumen a partir de lo que YA calculó cargarAtencion() en
 * radarPlazos.js — la misma fuente que usan el Dashboard, el Radar y la Sidebar.
 *
 * No se recalcula nada acá: esta función sólo convierte esos datos a texto. Si
 * mañana cambia qué cuenta como "pendiente hoy", cambia en un solo lugar
 * (radarPlazos.js) y el chat queda de acuerdo automáticamente con el resto de
 * la app — la razón de ser de tener una sola fuente para el semáforo.
 */
export function resumenPendientesHoy({ atencion = [], pendientes = [] } = {}) {
  if (!atencion.length && !pendientes.length) {
    return 'No tienes nada pendiente para hoy. Puedes revisarlo igual en el Radar de Plazos.';
  }

  const lineas = [];
  if (atencion.length) {
    lineas.push(`Hoy requieren atención (${atencion.length}):`);
    for (const it of atencion.slice(0, 8)) {
      lineas.push(`• ${it.casoRit} — ${it.titulo} (${it.etiquetaEstado})`);
    }
    if (atencion.length > 8) lineas.push(`… y ${atencion.length - 8} más.`);
  }
  if (pendientes.length) {
    if (lineas.length) lineas.push('');
    lineas.push(`Pendientes de bitácora sin cerrar (${pendientes.length}), lo más antiguo primero:`);
    for (const it of pendientes.slice(0, 5)) {
      lineas.push(`• ${it.casoRit} — ${it.titulo} (${it.etiquetaTiempo})`);
    }
    if (pendientes.length > 5) lineas.push(`… y ${pendientes.length - 5} más.`);
  }
  lineas.push('');
  lineas.push('Puedes verlas y actuarlas en el Radar de Plazos.');
  return lineas.join('\n');
}

/**
 * Mismos datos que resumenPendientesHoy(), en filas para pintar como tabla en
 * vez de una lista de texto con viñetas -lo que pide el abogado cuando
 * pregunta "gestiones pendientes" en el chat-. Misma fuente (cargarAtencion()
 * de radarPlazos.js): esto no recalcula nada, sólo cambia la forma en que se
 * presentan los mismos datos.
 */
export function filasPendientesHoy({ atencion = [], pendientes = [] } = {}) {
  const filas = [];
  for (const it of atencion) {
    filas.push({ categoria: 'Atención hoy', rol: it.casoRit, gestion: it.titulo, cuando: it.etiquetaEstado });
  }
  for (const it of pendientes) {
    filas.push({ categoria: 'Pendiente de bitácora', rol: it.casoRit, gestion: it.titulo, cuando: it.etiquetaTiempo });
  }
  return filas;
}

/**
 * Mismos datos que resumenGestionesDeHoy(), en filas para tabla.
 */
export function filasGestionesDeHoy(gestiones = []) {
  return gestiones.map((g) => ({
    categoria: g.realizada ? 'Realizada' : 'Pendiente',
    rol: g.casoRit,
    gestion: g.titulo,
    cuando: g.estado || (g.realizada ? 'REALIZADO' : 'PENDIENTE')
  }));
}

function preguntarCual(candidatos, verbo = 'Cuál') {
  const lista = candidatos.slice(0, 10).map((c) => `${c.ref} (${String(c.etiqueta).slice(0, 40)})`).join(' · ');
  const sobran = candidatos.length - 10;
  return pregunta(
    `${verbo} de estos: ${lista}${sobran > 0 ? ` … y ${sobran} más.` : ''}`
  );
}

/**
 * Interpreta la instrucción y devuelve acciones propuestas.
 *
 * El orden de evaluación importa: se prueba primero lo más específico. "quiero
 * ingresar una gestión" tiene que ganarle a "quiero ver algo de esta causa",
 * porque las dos mencionan la causa pero sólo una dice qué hacer con ella.
 */
export function interpretar(texto, contexto = {}) {
  const { expedientes = [], causas = [], tareas = [], desde = hoyLocal() } = contexto;
  const crudo = String(texto || '').trim();
  if (!crudo) return pregunta('Dime qué necesitas.');
  const t = normalizar(crudo);

  // --- Nada de borrar: no existe la acción, y se dice claro. -----------------
  if (hay(t, ['borra', 'borrar', 'elimina', 'eliminar', 'suprime'])) {
    return pregunta(
      'No puedo borrar nada: el asistente no tiene esa facultad. Si quieres cerrar algo, ' +
      'marca la gestión como REALIZADO en la ficha, o dime qué dato corregir.'
    );
  }

  // --- Vigilar un plazo ------------------------------------------------------
  if (hay(t, ['plazo', 'vence', 'computa', 'computar', 'vigila', 'vigilar', 'termino'])) {
    const proc = resolverProcedimiento(crudo);
    const fecha = extraerFecha(crudo, desde);
    if (!proc) {
      return pregunta(
        'Para vigilar un plazo necesito saber exactamente qué actuación es (hay 34 en el ' +
        'catálogo). Dímelo con más palabras, o agrégalo desde Cómputo de Términos, que ' +
        'te deja elegirla de una lista. Un plazo mal calculado es peor que ninguno.'
      );
    }
    if (!fecha) {
      return pregunta(
        `Entendí «${proc.nombre}», pero me falta la fecha desde la que se cuenta ` +
        '(la de notificación o la del hito). Dímela y lo computo.'
      );
    }
    const { candidatos } = resolverReferencia(crudo, { expedientes, causas });
    const ref = candidatos.length === 1 ? candidatos[0] : null;
    return {
      respuesta: `Computo «${proc.nombre}» (${proc.dias} días) desde el ${fecha}.`,
      acciones: [{
        accion: 'vigilar_plazo',
        motivo: `${proc.nombre} — ${proc.articulo || 'catálogo de plazos'}`,
        procedimientoId: proc.id,
        fechaBase: fecha,
        rit: ref ? ref.ref : undefined,
        caratula: ref ? ref.etiqueta : undefined
      }]
    };
  }

  // --- Tareas ----------------------------------------------------------------
  const pideTarea = hay(t, ['tarea', 'recuerdame', 'recordarme', 'acuerdame', 'pendiente para']);
  const marcaHecho = hay(t, ['marca', 'marcar', 'ya hice', 'ya la hice', 'ya lo hice', 'complete', 'completa', 'termine', 'terminada', 'lista', 'listo', 'hecha', 'hecho']);

  if (pideTarea && marcaHecho) {
    const unicos = new Set(tokens(crudo));
    const calzan = tareas.filter((x) => {
      const h = normalizar(x.titulo);
      return [...unicos].some((w) => h.includes(w));
    });
    if (!calzan.length) return pregunta('No encontré una tarea que calce con eso. ¿Cómo se llama?');
    if (calzan.length > 1) {
      return pregunta(`Hay varias que calzan: ${calzan.slice(0, 8).map((x) => `«${x.titulo}»`).join(' · ')}. ¿Cuál?`);
    }
    return {
      respuesta: `Marco «${calzan[0].titulo}» como completada.`,
      acciones: [{
        accion: 'modificar_tarea',
        motivo: 'Se pidió darla por terminada',
        tareaId: calzan[0].id,
        completada: true
      }]
    };
  }

  if (pideTarea || (hay(t, ['crea', 'crear', 'agenda', 'agendar', 'anota']) && hay(t, ['tarea']))) {
    const fecha = extraerFecha(crudo, desde);
    const titulo = despuesDe(crudo, [':', ' que ', ' de ']) || sinFecha(crudo);
    const limpio = String(titulo || '')
      .replace(/^(crea|crear|agenda|agendar|anota|anotar|recuerdame|recuérdame)\s+(me\s+)?(una\s+|la\s+)?tarea\s*/i, '')
      .replace(/^(una\s+|la\s+)?tarea\s*/i, '')
      .trim();
    if (!limpio || limpio.length < 3) {
      return pregunta('¿Qué dice la tarea? Escríbeme el texto y le pongo fecha si me la das.');
    }
    const { candidatos } = resolverReferencia(crudo, { expedientes, causas });
    const ref = candidatos.length === 1 ? candidatos[0] : null;
    return {
      respuesta: fecha
        ? `Creo la tarea para el ${fecha}.`
        : 'Creo la tarea. No dijiste fecha, así que queda sin vencimiento — se ve en el detalle.',
      acciones: [{
        accion: 'crear_tarea',
        motivo: 'Se pidió agendar un pendiente',
        titulo: limpio,
        fechaVencimiento: fecha || '',
        casoRit: ref ? ref.ref : '',
        casoCaratula: ref ? ref.etiqueta : ''
      }]
    };
  }

  // --- Crear un expediente nuevo --------------------------------------------
  // "abrir" es ambiguo en la práctica chilena: "ábreme UN expediente" es crear y
  // "abre EL expediente de Garai" es mostrar. Los verbos inequívocos (crear,
  // nuevo, iniciar) no necesitan artículo; "abrir" sí lo necesita para contar
  // como creación.
  const esCreacion = RE_CREAR_INEQUIVOCO.test(t) || (RE_ABRIR.test(t) && RE_INDEFINIDO.test(t));
  if (esCreacion) {
    const { cliente, asunto } = extraerClienteAsunto(crudo);

    if (!cliente) {
      return pregunta(
        'Voy a crear el expediente, pero necesito el cliente. Dímelo así: ' +
        '«crea expediente para Pedro Soto por despido injustificado», o bien ' +
        '«cliente: Pedro Soto, asunto: despido injustificado».'
      );
    }

    // Si ya hay uno igual se avisa acá y no se propone un duplicado: la acción lo
    // rechazaría igual, pero el aviso es más útil que un error al confirmar.
    const yaExiste = expedientes.find(
      (e) => normalizar(e.cliente) === normalizar(cliente) &&
             normalizar(e.asunto) === normalizar(asunto || '')
    );
    if (yaExiste) {
      return pregunta(
        `Ya existe el expediente ${yaExiste.id} para ${yaExiste.cliente}` +
        `${yaExiste.asunto ? ` — ${yaExiste.asunto}` : ''}. ¿Lo abro?`
      );
    }

    const tipo = deducirTipo(crudo);
    return {
      respuesta: asunto
        ? `Creo un expediente ${tipo} para ${cliente}, por ${asunto}. Revisa los campos antes de aplicar.`
        : `Creo un expediente ${tipo} para ${cliente}. No dijiste el asunto, así que queda vacío — se ve en el detalle.`,
      acciones: [{
        accion: 'crear_expediente',
        motivo: 'Se pidió abrir un expediente nuevo',
        cliente,
        asunto: asunto || '',
        tipo
      }]
    };
  }

  // --- Ingresar una gestión --------------------------------------------------
  if (RE_INGRESO_GESTION.test(t)) {
    const { candidatos } = resolverReferencia(crudo, { expedientes, causas });
    const ref = candidatos.length === 1 ? candidatos[0] : null;
    // Deliberadamente NO se intenta extraer el texto del trámite de la frase: se
    // abre el formulario apuntado al caso y lo escribe el abogado. Una bitácora
    // procesal debe decir lo que él escribió, no una paráfrasis del sistema.
    return {
      respuesta: ref
        ? `Te abro el formulario de gestión sobre ${ref.ref}.`
        : 'Te abro el formulario de gestión. Elige ahí el expediente.',
      acciones: [{
        accion: 'abrir_modal_ingreso_gestion',
        motivo: 'Se pidió registrar una gestión',
        casoRef: ref ? ref.ref : ''
      }]
    };
  }

  // --- Ver / abrir fichas ----------------------------------------------------
  const pideVer = hay(t, ['muestra', 'muestrame', 'ver', 'abre', 'abrir', 'abreme', 'dame', 'trae', 'consulta', 'busca']);
  const pideGestiones = hay(t, ['gestion', 'gestiones', 'movimiento', 'movimientos', 'tramite', 'tramites', 'historial', 'bitacora']);
  const pideTodos = hay(t, ['todos', 'todas', 'todo', 'planilla', 'listado', 'tabla']);

  const { candidatos, porRol, rolNoEncontrado } = resolverReferencia(crudo, { expedientes, causas });

  if (!candidatos.length) {
    // Un ROL/RIT dictado es la pista más fuerte que hay -por eso resolverReferencia
    // no lo cambia por un calce de palabras sueltas cuando no existe-, así que acá
    // se responde con certeza, no con la pregunta genérica. No es "no te entendí":
    // se entendió perfecto, y ese ROL no está. Por eso sinEntender queda en false
    // -no tiene sentido escalarle al modelo local un ROL que ya se confirmó que
    // no existe en el catálogo-.
    if (rolNoEncontrado) {
      return pregunta(`No encontré ningún expediente ni causa con el ROL/RIT ${rolNoEncontrado}.`);
    }
    // sinEntender: true SÓLO acá -es el único punto de la función donde el
    // sistema de verdad no sabe qué se le pidió, a diferencia de los demás
    // `pregunta(...)` de arriba, que entendieron la intención y piden un dato
    // puntual que falta. Ese marcador es lo que decide, en el cliente, si vale
    // la pena escalar la frase al modelo local: escalar una pregunta ya
    // correctamente resuelta (como "no puedo borrar nada") arriesgaría que la
    // IA -con menos certeza que una regla- proponga algo distinto y peor.
    return pregunta(
      pideVer
        ? 'No encontré ninguna causa ni expediente que calce con eso. Dime el ROL, el nombre del cliente o parte de la carátula.'
        : 'No te entendí. Puedo abrir fichas, registrar gestiones, crear tareas y vigilar plazos — dime cuál de esas y sobre qué causa.',
      true
    );
  }

  // Si el usuario pide explícitamente "todos", "todas", "planilla", abre la vista Planilla Excel.
  const TOPE = 5;
  if (candidatos.length > TOPE && !porRol && !pideTodos) return preguntarCual(candidatos);

  const tab = pideGestiones ? 'gestiones' : 'resumen';
  return {
    respuesta: candidatos.length === 1
      ? `Abro ${candidatos[0].ref}${pideGestiones ? ' en sus gestiones' : ''}.`
      : `Te abro la planilla Excel con los ${candidatos.length} expedientes que calzan con tu consulta.`,
    acciones: candidatos.map((c) => ({
      accion: 'abrir_expediente',
      motivo: `${pideGestiones ? 'Gestiones de ' : ''}${c.ref} (${String(c.etiqueta).slice(0, 40)})`,
      casoRef: c.ref,
      tab
    }))
  };
}
