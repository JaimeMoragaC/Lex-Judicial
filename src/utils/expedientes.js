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

export function crearExpediente({ cliente, asunto, tipo = 'extrajudicial' }, expedientes = []) {
  const esAdmin = tipo === 'administrativo';
  const esExtrajudicial = tipo === 'extrajudicial' || !tipo;
  const prefijo = esAdmin ? 'ADM' : (esExtrajudicial ? 'EXT' : 'JUD');
  const rolCorrelativo = siguienteCorrelativo(expedientes || [], prefijo);

  return {
    id: rolCorrelativo,
    rit: rolCorrelativo,
    ritVinculado: rolCorrelativo,
    caratula: asunto ? `${cliente || 'Mandante'} — ${asunto}` : `Asesoría Extrajudicial — ${cliente || 'Mandante'}`,
    cliente: cliente || 'Cliente sin identificar',
    contraparte: 'En Reserva / Directa',
    abogadoContraparte: 'No registrado',
    asunto: asunto || 'Asesoría y Gestión Extrajudicial',
    tipo: esAdmin ? 'administrativo' : (esExtrajudicial ? 'extrajudicial' : 'judicial'),
    materia: esExtrajudicial ? 'Extrajudicial' : (esAdmin ? 'Administrativo' : 'Civil'),
    tribunal: esExtrajudicial ? 'Gestión Directa / Notarial' : (esAdmin ? 'Sede Administrativa' : 'Juzgado Civil'),
    numeroTribunal: '1',
    ciudad: 'Temuco',
    etapa: esExtrajudicial ? 'En Gestión Directa' : 'Tramitación Inicial',
    estado: 'ACTIVO',
    estadoVigencia: 'VIGENTE',
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

    // NO se migra `lexcontrol_casos_ia` a expedientes del servidor.
    //
    // Acá había un bloque que, por cada causa creada por la IA, escribía un
    // expediente en data/expedientes.json con `gestiones: []`. Dos problemas:
    //
    //  1. Es un error de categoría: una causa no es un expediente. Se creaban
    //     contenedores vacíos que después aparecían en el radar anti-abandono como
    //     causas reales (así llegaron los `caso-ia-*` con cliente "Interviniente").
    //  2. Ensuciaba el servidor con datos del navegador, que es justo lo que
    //     `data/expedientes.json` no debería contener.
    //
    // No se pierde nada: si una de esas causas tiene gestiones de verdad, entran
    // igual por `lexcontrol_gestiones_*` en obtenerAgendaLocalStorage().

    if (migrados) {
      guardarExpedientes(serverExpedientes).catch(() => {});
    }
  } catch (e) {
    console.warn('Aviso migración expedientes:', e);
  }

  return serverExpedientes;
}

/**
 * Expediente que corresponde a un caso, sea una causa de la planilla oficial o un
 * expediente propio de la bitácora.
 *
 * La Bitácora vincula por ROL (`exp.id = causa.rit` y `ritVinculado = causa.rit`),
 * así que se busca por las dos vías: el identificador interno y el rol.
 */
/**
 * ¿Este ROL sirve para identificar una causa?
 *
 * 318 de las 1.557 causas del Excel oficial -el 20%- vienen con el rit literal
 * "ROL " (la palabra sola, sin número). Usarlo como identificador hacía que esas
 * 318 causas distintas colapsaran en un mismo expediente: la gestión de un cliente
 * terminaba archivada en la carpeta de otro. Ya había pasado — la querella de
 * Calbuco quedó dentro del expediente de GARAI/CAMPOS.
 *
 * Un rol de verdad tiene dígitos. Sin dígitos no identifica nada y hay que caer al
 * id interno de la causa, que sí es único.
 */
export function ritUtilizable(rit) {
  return /\d/.test(String(rit || ''));
}

/** El identificador con el que debe archivarse un caso: su ROL si sirve, si no su id. */
export function claveDeCaso(caso) {
  const rit = String(caso?.rit || caso?.ritVinculado || '').trim();
  if (ritUtilizable(rit)) return rit;
  return String(caso?.id || '').trim() || null;
}

export function expedienteDeCaso(caso, expedientes) {
  const id = String(caso?.id || '').trim();
  const rit = String(caso?.rit || caso?.ritVinculado || '').trim();
  return (
    expedientes.find(
      (e) =>
        (id && (e.id === id || e.ritVinculado === id)) ||
        // Sólo se cruza por ROL cuando el ROL identifica de verdad.
        (ritUtilizable(rit) && (e.ritVinculado === rit || e.id === rit))
    ) || null
  );
}

/**
 * Guarda las gestiones de un caso EN EL SERVIDOR, creando el expediente si hace
 * falta. Devuelve el expediente resultante.
 *
 * Existe porque la ficha del expediente (CasoDetailModal) guardaba sólo en
 * localStorage: nada de lo registrado ahí llegaba a data/expedientes.json, y una
 * limpieza del navegador -o la cuota agotada- se llevaba el trabajo. La Bitácora
 * sí persistía en el servidor, de modo que el mismo dato sobrevivía o no según
 * desde qué formulario se hubiera escrito. Ahora las dos vías terminan acá.
 */
export async function guardarGestionesDeCaso(caso, gestiones) {
  const expedientes = await cargarExpedientes();
  const siguientes = [...expedientes];
  let exp = expedienteDeCaso(caso, siguientes);

  if (!exp) {
    const rit = String(caso?.rit || '').trim();
    const clave = claveDeCaso(caso);
    exp = crearExpediente(
      {
        cliente: caso?.caratula || caso?.cliente,
        asunto: caso?.materia || caso?.asunto || '',
        tipo: rit ? 'judicial' : 'extrajudicial'
      },
      siguientes
    );
    // Mismo criterio que la Bitácora: para una causa judicial el expediente se
    // identifica por su ROL. Pero si el ROL no sirve (las 318 causas con "ROL "
    // a secas), se usa el id interno: si no, todas caerían en el mismo expediente.
    if (clave) {
      exp.id = clave;
      if (ritUtilizable(rit)) exp.ritVinculado = rit;
    }
    siguientes.push(exp);
  }

  exp.gestiones = gestiones;
  await guardarExpedientes(siguientes);
  return exp;
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

// Causas del catálogo PJUD (data/pjudCausesData.json): NO todas tienen un
// expediente espejo -~630 de 2.437 no lo tienen-. eliminarExpediente() por sí
// sola sólo tocaba expedientes.json, así que borrar una de esas causas cerraba
// el modal como si hubiera funcionado, pero no pasaba nada.
export async function cargarCausasPjud() {
  const res = await fetch(`${LEXCONTROL_API}/data/pjudCausesData`);
  if (!res.ok) throw new Error(`El servidor respondió HTTP ${res.status}`);
  const data = await res.json();
  return data.casos || [];
}

export async function guardarCausasPjud(causas) {
  const res = await fetch(`${LEXCONTROL_API}/causas_pjud`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ causas })
  });
  if (!res.ok) throw new Error(`No se pudo guardar: HTTP ${res.status}`);
  return res.json();
}

export async function eliminarExpediente(idOrRit) {
  if (!idOrRit) return;
  const targetKey = String(idOrRit).trim();

  let expedientes = [];
  try {
    expedientes = await cargarExpedientes();
  } catch (e) {}

  const filtrados = (expedientes || []).filter(
    (e) =>
      String(e.id || '').trim() !== targetKey &&
      String(e.rit || '').trim() !== targetKey &&
      String(e.ritVinculado || '').trim() !== targetKey
  );

  if (filtrados.length !== (expedientes || []).length) {
    await guardarExpedientes(filtrados);
  }

  // Igual, pero del lado de las causas PJUD -por si esta causa nunca se
  // espejó a un expediente-. Un fallo acá (ej. el sync recreó la causa justo
  // ahora) no debe impedir que el borrado del lado de expedientes, que ya se
  // aplicó arriba, quede igual.
  try {
    const causas = await cargarCausasPjud();
    const causasFiltradas = (causas || []).filter(
      (c) => String(c.id || '').trim() !== targetKey && String(c.rit || '').trim() !== targetKey
    );
    if (causasFiltradas.length !== (causas || []).length) {
      await guardarCausasPjud(causasFiltradas);
    }
  } catch (e) {}

  try {
    const casosIA = JSON.parse(localStorage.getItem('lexcontrol_casos_ia') || '[]');
    const casosIAFiltrados = casosIA.filter(
      (c) =>
        String(c.id || '').trim() !== targetKey &&
        String(c.rit || '').trim() !== targetKey
    );
    localStorage.setItem('lexcontrol_casos_ia', JSON.stringify(casosIAFiltrados));

    const mappingStr = localStorage.getItem('lexcontrol_extrajudicial_mapping');
    if (mappingStr) {
      const mapping = JSON.parse(mappingStr);
      for (const [k, v] of Object.entries(mapping)) {
        if (v === targetKey || k === targetKey) {
          delete mapping[k];
        }
      }
      localStorage.setItem('lexcontrol_extrajudicial_mapping', JSON.stringify(mapping));
    }

    Object.keys(localStorage).forEach((key) => {
      if (key.includes(targetKey)) {
        localStorage.removeItem(key);
      }
    });
  } catch (e) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lexcontrol_expedientes_updated'));
  }
}
