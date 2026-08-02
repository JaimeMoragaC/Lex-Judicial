// radarPlazos.js - Registro de plazos vigilados, calculados con el motor real.
//
// Antes la agenda mostraba plazos que había adivinado Gemini: el importador
// escribía literalmente `"diasRestantes": 3 if URGENTE else 0`, así que toda
// causa "urgente" decía 3 días sin importar la realidad.
//
// Acá el dato de entrada lo pone el abogado (qué actuación y desde qué fecha se
// notificó) y la fecha de vencimiento la calcula plazosChile.js. El sistema no
// inventa fechas: computa las que se le declaran, y vigila lo computado.

import {
  calcularPlazoCPC,
  calcularPlazoCPP,
  calcularPlazoLaboralAdmin,
  esInhabilCPC,
  esFeriado,
  esDomingo,
  CATALOGO_PLAZOS
} from './plazosChile.js';
import { LEXCONTROL_API } from '../apiBase.js';
import { cargarExpedientes, ritUtilizable } from './expedientes.js';
import { cargarTareas } from './tareas.js';

/** Los tres regímenes de cómputo, cada uno con su motor. */
export const REGIMENES = {
  CPC: { etiqueta: 'Civil (CPC)', motor: calcularPlazoCPC },
  CPP: { etiqueta: 'Penal (CPP)', motor: calcularPlazoCPP },
  LAB_ADMIN: { etiqueta: 'Laboral / Familia / Admin.', motor: calcularPlazoLaboralAdmin }
};

export function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function normalizarFechaIso(f) {
  if (!f) return '';
  const s = String(f).trim();
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes('-')) {
    const parts = s.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return s;
}

/** ¿Es hábil este día bajo el régimen indicado? */
function esHabil(fechaStr, regimen) {
  const fNorm = normalizarFechaIso(fechaStr);
  if (regimen === 'CPP') return true; // días corridos
  if (regimen === 'CPC') return !esInhabilCPC(fNorm);
  const dia = new Date(fNorm + 'T12:00:00').getDay();
  return dia !== 0 && dia !== 6 && !esFeriado(fNorm) && !esDomingo(fNorm);
}

/**
 * Días HÁBILES que quedan hasta el vencimiento, no días de calendario.
 * Es la diferencia que importa: un plazo civil que vence el lunes, mirado un
 * viernes, no son "3 días" sino 1 día hábil de trabajo.
 */
export function habilesRestantes(fechaVencimiento, regimen, desde = hoyLocal()) {
  const fVenc = normalizarFechaIso(fechaVencimiento);
  const fDesde = normalizarFechaIso(desde);
  if (!fVenc || fVenc < fDesde) return -1;
  let cuenta = 0;
  const cursor = new Date(fDesde + 'T00:00:00');
  const limite = new Date(fVenc + 'T00:00:00');
  while (cursor < limite) {
    cursor.setDate(cursor.getDate() + 1);
    const f = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (esHabil(f, regimen)) cuenta++;
  }
  return cuenta;
}

/**
 * Naturaleza de una entrada del radar. Determina QUÉ SIGNIFICA su fecha, y por
 * eso mismo qué estados del semáforo son accionables.
 *
 * Esta distinción existía antes repartida en condicionales dentro de cada
 * pantalla: el Dashboard excluía a mano los VENCIDO de las gestiones, el Radar
 * hacía lo mismo con otro Set, y la Sidebar no lo hacía en absoluto. Tres copias
 * de la misma regla que se corrigieron por separado cuatro veces. Ahora la regla
 * vive una sola vez, acá.
 */
export const NATURALEZA = {
  /** Vencimiento computado por plazosChile.js desde una actuación procesal. */
  FATAL: 'FATAL',
  /**
   * Gestión con fecha ELEGIDA por el abogado en el campo "Fecha Trámite" de la
   * ficha (CasoDetailModal). Es el día en que ese trámite ocurre o debe ocurrir.
   */
  TRAMITE: 'TRAMITE',
  /**
   * Gestión registrada por la Bitácora Omnicanal, que estampa `fecha = hoy` al
   * momento de escribirla (BitacoraOmnicanal.jsx). Esa fecha es CUÁNDO SE ANOTÓ,
   * no un vencimiento: el trabajo sigue pendiente hasta que se marque REALIZADO.
   */
  PENDIENTE: 'PENDIENTE'
};

/**
 * Decide la naturaleza de una gestión guardada.
 *
 * Los dos formularios escriben en el mismo campo `fecha` cosas distintas, y hasta
 * ahora eran indistinguibles. El discriminador: la ficha guarda `fechaIso` porque
 * la fecha salió de un date picker; la Bitácora no la escribe nunca. Las gestiones
 * nuevas de la ficha además traen `fechaEsTramite: true`, que es explícito.
 *
 * Excepción explícita: "EN ESPERA" (ej. presentado un escrito, a la espera de que
 * el tribunal resuelva, sin fecha cierta) SIEMPRE es PENDIENTE aunque la ficha le
 * haya puesto fechaIso/fechaEsTramite -esos campos describen cuándo se ANOTÓ la
 * gestión, no una fecha con la que tenga sentido hacer cuenta regresiva. Sin esto
 * quedaba clasificada como TRÁMITE, que sólo asoma en Mi Día el día en que se creó
 * y desaparece al siguiente aunque la causa siga esperando (31-jul-2026).
 */
function naturalezaDeGestion(g) {
  if ((g.estado || '').toUpperCase().includes('EN ESPERA')) return NATURALEZA.PENDIENTE;
  return g.fechaEsTramite || g.fechaIso ? NATURALEZA.TRAMITE : NATURALEZA.PENDIENTE;
}

/**
 * Un plazo fatal se anticipa: hay que verlo antes de que llegue, y si venció es
 * lo más urgente que existe. Por eso entra desde URGENTE (5 días hábiles) y
 * conserva su VENCIDO.
 */
const ACCIONABLES_FATAL = new Set(['VENCIDO', 'HOY', 'CRITICO', 'URGENTE']);
/**
 * Un trámite con fecha propia entra SÓLO el día de su fecha.
 *
 * No se anticipa como un fatal: un trámite agendado para el jueves no es trabajo
 * de hoy, y meterlo acá es lo que hacía aparecer "tareas de otros días" en la
 * sección del día. Queda listado en los recordatorios del Radar hasta que llegue.
 *
 * Tampoco cuando ya pasó: su fecha no es un vencimiento computado, así que
 * "vencido" no describe nada.
 */
const ACCIONABLES_TRAMITE = new Set(['HOY']);

/** Semáforo. El corte está en días hábiles, que es como se trabaja. */
export function clasificar(plazo, desde = hoyLocal()) {
  const fVenc = normalizarFechaIso(
    plazo.fechaObjetivo || plazo.fechaVencimiento || plazo.vencimiento || plazo.fecha
  );
  const fDesde = normalizarFechaIso(desde);
  if (!fVenc) return 'AL_DIA';
  if (fVenc < fDesde) return 'VENCIDO';
  if (fVenc === fDesde) return 'HOY';
  const h = habilesRestantes(fVenc, plazo.regimen, fDesde);
  if (h <= 2) return 'CRITICO';
  if (h <= 5) return 'URGENTE';
  if (h <= 10) return 'PROXIMO';
  return 'AL_DIA';
}

export const ORDEN_ESTADOS = ['VENCIDO', 'HOY', 'CRITICO', 'URGENTE', 'PROXIMO', 'AL_DIA'];

export const ETIQUETA_ESTADO = {
  VENCIDO: 'Vencido',
  HOY: 'Vence hoy',
  CRITICO: 'Crítico',
  URGENTE: 'Urgente',
  PROXIMO: 'Próximo',
  AL_DIA: 'Al día'
};

/** Todos los procedimientos del catálogo, aplanados para poder elegirlos. */
export function procedimientosDisponibles() {
  const salida = [];
  for (const [regimen, grupos] of Object.entries(CATALOGO_PLAZOS)) {
    for (const grupo of grupos) {
      for (const p of grupo.procedimientos) {
        salida.push({ ...p, regimen, categoria: grupo.categoria });
      }
    }
  }
  return salida;
}

export function buscarProcedimiento(id) {
  return procedimientosDisponibles().find((p) => p.id === id) || null;
}

/**
 * Calcula el vencimiento de un plazo a partir de la actuación declarada.
 * Devuelve el registro listo para guardar, o lanza si la entrada no sirve.
 */
export function computarPlazo({ id, casoId, rit, caratula, tribunal, procedimientoId, regimen, dias, fechaBase, esHaciaAtras, notas }) {
  const proc = procedimientoId ? buscarProcedimiento(procedimientoId) : null;
  const regimenFinal = regimen || proc?.regimen || 'CPC';
  const diasFinal = Number(dias ?? proc?.dias);
  const atras = esHaciaAtras ?? proc?.esHaciaAtras ?? false;

  const motor = REGIMENES[regimenFinal]?.motor;
  if (!motor) throw new Error(`Régimen de cómputo desconocido: ${regimenFinal}`);

  const resultado = motor(fechaBase, diasFinal, atras);

  return {
    id: id || `plz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    casoId: casoId || null,
    rit: rit || 'Sin ROL/RIT',
    caratula: caratula || 'Sin carátula',
    tribunal: tribunal || '',
    procedimientoId: procedimientoId || null,
    actuacion: proc?.nombre || 'Plazo personalizado',
    articulo: proc?.articulo || '',
    regimen: regimenFinal,
    dias: diasFinal,
    esHaciaAtras: atras,
    fechaBase,
    naturaleza: NATURALEZA.FATAL,
    fechaVencimiento: resultado.fechaVencimiento,
    // Fecha que lee el semáforo. En un fatal es el vencimiento computado; en una
    // gestión es la fecha de registro. Tener un único nombre para "la fecha que
    // clasifica" es lo que permite que exista una sola regla de clasificación.
    fechaObjetivo: resultado.fechaVencimiento,
    fechaVencimientoTexto: resultado.fechaVencimientoTexto,
    normativa: resultado.normativa,
    observacionProrroga: resultado.observacionProrroga || null,
    notas: notas || '',
    creadoEn: new Date().toISOString()
  };
}

/**
 * Recalcula el vencimiento de un plazo ya guardado.
 * Sirve para que un cambio en el calendario de feriados se propague a los
 * plazos vigentes en vez de quedar congelado en el valor de cuando se guardó.
 */
export function recomputar(plazo) {
  try {
    return { ...plazo, ...computarPlazo({ ...plazo }), id: plazo.id, creadoEn: plazo.creadoEn };
  } catch {
    return plazo;
  }
}

// --- Persistencia y Recolección Unificada ------------------------------------

/**
 * Recolecta las notas y tareas con fecha que hay en el navegador.
 *
 * IMPORTANTE: esto NO son plazos fatales. Son recordatorios. Un plazo fatal nace
 * de una actuación procesal con su fecha de notificación y un régimen de cómputo;
 * lo calcula plazosChile.js y vive en el registro del servidor. Estas entradas
 * sólo tienen la fecha en que se escribió la nota, con dias:0, así que meterlas
 * en el semáforo de fatales hacía que cada anotación apareciera venciendo hoy y
 * en rojo. Van en su propia lista.
 */
/**
 * Convierte una tarea de la agenda en una entrada del radar, o null si no
 * corresponde vigilarla (sin fecha, o ya completada).
 *
 * OJO con el nombre del campo: una tarea guarda `fechaVencimiento`, no `fecha`.
 * Acá se leía `t.fecha`, que en una tarea nunca existe, así que la fecha salía
 * vacía y la tarea se descartaba en silencio: ninguna tarea con vencimiento llegó
 * jamás al semáforo. Se aceptan los dos nombres para no romper lo ya guardado.
 */
function tareaARadar(t, id) {
  const fIso = normalizarFechaIso(t.fechaVencimiento || t.fecha);
  const estadoNorm = (t.estado || '').trim().toUpperCase();
  const realizada = t.completada === true ||
    ['REALIZAD', 'COMPLETAD', 'TERMINAD', 'FALLADO', 'ARCHIVADO'].some((w) => estadoNorm.includes(w));
  if (!fIso || realizada) return null;

  const titulo = t.titulo || t.descripcion || 'Tarea pendiente';
  return {
    id,
    casoRit: t.casoRit || 'AGENDA GLOBAL',
    rit: t.casoRit || 'AGENDA GLOBAL',
    caratula: t.casoCaratula || t.caratula || 'Tarea general',
    cliente: t.cliente || 'Estudio jurídico',
    tribunal: 'Agenda',
    actuacion: titulo,
    descripcion: titulo,
    asunto: titulo,
    // La fecha de una tarea la eligió el abogado, igual que una "Fecha Trámite".
    naturaleza: NATURALEZA.TRAMITE,
    regimen: 'CPC',
    fechaTramite: fIso,
    fechaObjetivo: fIso,
    notas: t.notas || ''
  };
}

/** Tareas del servidor, ya con forma de entrada del radar. */
export function tareasParaRadar(tareas) {
  return (tareas || [])
    .map((t, idx) => tareaARadar(t, `tarea-${t.id || idx}`))
    .filter(Boolean);
}

export function obtenerAgendaLocalStorage() {
  const plazosExtraidos = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      // 1. Revisar gestiones de casos (lexcontrol_gestiones_*)
      if (key && key.startsWith('lexcontrol_gestiones_')) {
        const casoRit = key.replace('lexcontrol_gestiones_', '');
        try {
          const gestiones = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(gestiones)) {
            gestiones.forEach((g, idx) => {
              const fIso = normalizarFechaIso(g.fechaIso || g.fecha);
              const estadoNorm = (g.estado || '').trim().toUpperCase();
              const esRealizado = estadoNorm.includes('REALIZAD') || estadoNorm.includes('COMPLETAD') || estadoNorm.includes('TERMINAD') || estadoNorm.includes('FALLADO') || estadoNorm.includes('ARCHIVADO');
              
              if (fIso && !esRealizado) {
                plazosExtraidos.push({
                  id: `ls-gestion-${casoRit}-${idx}-${fIso}`,
                  casoRit: casoRit,
                  rit: casoRit,
                  caratula: g.caratula || 'Carátula no especificada',
                  cliente: g.cliente || 'Cliente no asignado',
                  tribunal: g.tribunal || 'Tribunal no especificado',
                  actuacion: g.tramite || g.actuacion || 'Gestión Pendiente',
                  descripcion: g.tramite || g.actuacion || 'Gestión Pendiente',
                  asunto: g.tramite || g.actuacion || 'Gestión Pendiente',
                  naturaleza: naturalezaDeGestion(g),
                  regimen: 'CPC',
                  // Deliberadamente NO hay fechaVencimiento: esta fecha es la que
                  // se escribió en la nota. Nombrarla como vencimiento es lo que
                  // hacía que el semáforo la tratara como plazo fatal.
                  fechaTramite: fIso,
                  fechaObjetivo: fIso,
                  notas: g.estado || 'Ingresado en expediente'
                });
              }
            });
          }
        } catch (e) {}
      }

      // 2. Tareas que hayan quedado en el navegador de antes de que existiera
      //    /tareas. Las nuevas llegan del servidor (ver tareasParaRadar).
      if (key === 'lexcontrol_tareas_globales') {
        try {
          const tareas = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(tareas)) {
            tareas.forEach((t, idx) => {
              const item = tareaARadar(t, `ls-tarea-${t.id || idx}`);
              if (item) plazosExtraidos.push(item);
            });
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  return plazosExtraidos;
}

/**
 * Plazos fatales: sólo los calculados con el motor procesal y guardados en el
 * servidor. Se había quitado este fetch por creer que data/plazos.json era data
 * de prueba; no lo es, es el registro que se llena desde la Calculadora con
 * "Vigilar en el radar". Sin él el semáforo mostraba únicamente notas.
 */
export async function cargarPlazos() {
  const res = await fetch(`${LEXCONTROL_API}/plazos`);
  if (!res.ok) throw new Error(`El servidor respondió HTTP ${res.status}`);
  const datos = await res.json();
  return (datos.plazos || []).map(recomputar).map(normalizarFatal);
}

/**
 * Un plazo guardado antes de que existiera `fechaObjetivo` -o uno cuyo recómputo
 * falló- llega sin los campos que el semáforo necesita. Se completan acá, no en
 * la pantalla que lo va a mostrar.
 */
function normalizarFatal(p) {
  const fVenc = normalizarFechaIso(p.fechaVencimiento || p.vencimiento || p.fecha);
  return { ...p, naturaleza: NATURALEZA.FATAL, fechaVencimiento: fVenc, fechaObjetivo: fVenc };
}

/**
 * Agenda: notas y tareas con fecha. Cada una se marca con el expediente al que
 * dice pertenecer y si ese expediente se pudo resolver, porque muchas claves de
 * localStorage vienen de la Bitácora antigua y apuntan a identificadores que
 * nunca fueron causas ('EXTRAJUDICIAL', 's/n', roles inventados por la IA).
 */
/**
 * Gestiones guardadas dentro de los expedientes del servidor.
 *
 * La Bitácora dejó de escribir en localStorage y pasó a guardar cada gestión
 * dentro de su expediente en data/expedientes.json. Sin leer de acá, todo lo
 * anotado desde ese cambio quedaba invisible en el semáforo.
 */
function gestionesDeExpedientes(expedientes) {
  const salida = [];
  for (const exp of expedientes) {
    for (const [idx, g] of (exp.gestiones || []).entries()) {
      // La gestión "Ingreso PJUD" que deja la migración masiva de causas no es
      // un pendiente de bitácora: es un registro de auditoría ("esta causa se
      // importó tal día"), sin `estado` porque nunca se pensó como un trabajo
      // por hacer. Sin este descarte, naturalezaDeGestion() la clasifica como
      // PENDIENTE por defecto -no tiene fechaIso ni fechaEsTramite- con la
      // fecha de ingreso a veces de hace décadas, y en la práctica real (31-jul-
      // 2026) esto inundaba "pendientes" con 1.430 entradas de este tipo,
      // enterrando cualquier pendiente genuino anotado hoy.
      if (g.tipo === 'Ingreso PJUD') continue;
      const fIso = normalizarFechaIso(g.fechaIso || g.fecha);
      // Si la gestión tiene un plazo fatal propio (el campo "Fecha Vencimiento
      // / Plazo" del formulario), ESE es el que importa para "requiere mi
      // atención hoy" -no la fecha de trámite, que sólo dice cuándo se anotó-.
      // Antes se usaba siempre fIso: un trámite anotado hoy con vencimiento
      // dentro de tres semanas aparecía urgente HOY, y el día en que el
      // vencimiento real llegaba -la fecha de trámite ya en el pasado- la
      // gestión no aparecía como vencida en ninguna parte, porque
      // ACCIONABLES_TRAMITE sólo mira el día exacto de la fecha de trámite.
      const fVencIso = normalizarFechaIso(g.fechaVencimiento);
      const estado = (g.estado || '').trim().toUpperCase();
      const realizada = ['REALIZAD', 'COMPLETAD', 'TERMINAD', 'FALLADO', 'ARCHIVADO']
        .some((w) => estado.includes(w));
      if ((!fIso && !fVencIso) || realizada) continue;

      salida.push({
        id: `exp-${exp.id}-${idx}-${fVencIso || fIso}`,
        casoRit: exp.ritVinculado || exp.id,
        rit: exp.ritVinculado || exp.id,
        caratula: exp.cliente || 'Sin carátula',
        asunto: exp.asunto || '',
        cliente: exp.cliente || '',
        tribunal: exp.tribunal || '',
        actuacion: g.tramite || g.actuacion || 'Gestión pendiente',
        descripcion: g.tramite || g.actuacion || 'Gestión pendiente',
        naturaleza: fVencIso ? NATURALEZA.FATAL : naturalezaDeGestion(g),
        regimen: 'CPC',
        fechaTramite: fIso,
        fechaObjetivo: fVencIso || fIso,
        notas: g.estado || ''
      });
    }
  }
  return salida;
}

/**
 * TODAS las gestiones (de cualquier expediente) fechadas hoy, sin filtrar por
 * estado.
 *
 * Es una pregunta distinta de "qué requiere atención": gestionesDeExpedientes()
 * -la que alimenta el semáforo vía cargarAtencion()- descarta a propósito lo
 * REALIZADO/COMPLETADO porque ya no hay nada que hacer con eso. Pero un abogado
 * que cierra el día y pregunta "todas las gestiones de hoy" quiere ver las dos
 * cosas: lo que quedó pendiente Y lo que ya se cerró. Filtrar eso sería mostrar
 * una versión incompleta de lo que él mismo escribió hoy.
 */
export function gestionesDeHoy(expedientes, desde = hoyLocal()) {
  const salida = [];
  for (const exp of expedientes || []) {
    for (const [idx, g] of (exp.gestiones || []).entries()) {
      const fIso = normalizarFechaIso(g.fechaIso || g.fecha);
      if (fIso !== desde) continue;
      const estadoNorm = (g.estado || '').trim().toUpperCase();
      const realizada = ['REALIZAD', 'COMPLETAD', 'TERMINAD', 'FALLADO', 'ARCHIVADO']
        .some((w) => estadoNorm.includes(w));
      salida.push({
        id: `exp-${exp.id}-${idx}-${fIso}`,
        casoRit: exp.ritVinculado || exp.id,
        caratula: exp.cliente || 'Sin carátula',
        titulo: g.tramite || g.actuacion || 'Gestión sin descripción',
        estado: g.estado || (realizada ? 'REALIZADO' : 'PENDIENTE'),
        realizada,
        fecha: fIso
      });
    }
  }
  return salida;
}

/**
 * Audiencias con fecha Y hora fijada explícitamente por el tribunal, dentro de
 * los próximos `dias` días.
 *
 * A propósito sólo entra lo que trae `esAudiencia: true` en la gestión -lo pone
 * el servidor únicamente cuando el análisis del documento detectó una fecha de
 * audiencia real (ver gestion_desde_analisis())-, nunca cualquier trámite con
 * fecha propia. Antes esta tarjeta mostraba audiencias "confirmadas" que en
 * realidad la IA había adivinado del texto; se sacaron por eso, y este filtro
 * existe para que no vuelva a pasar (31-jul-2026).
 */
export function audienciasProximas(expedientes, dias = 30, desde = hoyLocal()) {
  const inicio = new Date(normalizarFechaIso(desde) + 'T00:00:00');
  const limite = new Date(inicio);
  limite.setDate(limite.getDate() + dias);
  const hasta = limite.toISOString().slice(0, 10);
  const hoy = normalizarFechaIso(desde);

  const salida = [];
  for (const exp of expedientes || []) {
    for (const g of exp.gestiones || []) {
      if (!g.esAudiencia) continue;
      const fIso = normalizarFechaIso(g.fechaIso || g.fecha);
      if (!fIso || fIso < hoy || fIso > hasta) continue;
      salida.push({
        id: `aud-${exp.id}-${g.id || fIso}`,
        casoRit: exp.ritVinculado || exp.id,
        caratula: exp.caratula || exp.cliente || 'Sin carátula',
        tribunal: exp.tribunal || '',
        tramite: g.tramite || 'Audiencia',
        fecha: fIso,
        hora: g.horaAudiencia || ''
      });
    }
  }
  return salida.sort((a, b) => (a.fecha + (a.hora || '99:99')).localeCompare(b.fecha + (b.hora || '99:99')));
}

export async function cargarAgenda(causas = [], expedientes = [], tareas = []) {
  const ritsConocidos = new Set(causas.map((c) => String(c.rit || '').toUpperCase()));
  const idsConocidos = new Set(expedientes.map((e) => String(e.id || '').toUpperCase()));
  const huerfano = /^(extrajudicial|s\/n|sin rol|undefined|null|)$/i;

  // Índice de la planilla por identificador INTERNO y por ROL.
  //
  // CasoDetailModal guarda cada gestión bajo la clave
  // `lexcontrol_gestiones_${caso.id || caso.rit}`, y para las 1.557 causas del
  // Excel ese id es `pjud-caso-N`. Sin traducirlo, la pantalla mostraba
  // "pjud-caso-137" como si fuera una causa ajena a la planilla. Acá se resuelve
  // al ROL y la carátula reales.
  const porClave = new Map();
  for (const c of causas) {
    // El id interno siempre; el ROL sólo si identifica de verdad. 318 causas del
    // Excel comparten el rit literal "ROL ", así que indexar por ese valor hacía
    // que todas resolvieran a la misma causa: la última en ganar el mapa.
    const claves = [c.id];
    if (ritUtilizable(c.rit)) claves.push(c.rit);
    for (const k of claves) {
      const clave = String(k || '').toUpperCase().trim();
      if (clave) porClave.set(clave, c);
    }
  }

  // Las dos fuentes: el registro del servidor (autoritativo) y los restos en
  // localStorage (lo que escribió la ficha antes de guardar en el servidor).
  //
  // La identidad se resuelve ANTES de deduplicar, y esto importa: la misma gestión
  // llega con `casoRit` distinto según la fuente -del servidor viene como
  // "ROL 302-2025" y de localStorage como "pjud-caso-137", que es la clave con que
  // la guardó la ficha-. Deduplicando sobre el valor crudo, las dos copias tenían
  // claves diferentes y la gestión aparecía repetida.
  const crudas = [
    ...gestionesDeExpedientes(expedientes),
    ...tareasParaRadar(tareas),
    ...obtenerAgendaLocalStorage()
  ];

  const resueltas = crudas.map((g) => {
    const ref = String(g.casoRit || '').toUpperCase().trim();
    const causa = porClave.get(ref);
    const resuelto = !!causa || ritsConocidos.has(ref) || idsConocidos.has(ref);
    // El ROL sólo se muestra si existe. En 318 causas del Excel el campo trae
    // "ROL " a secas: pintarlo tal cual deja una etiqueta vacía que parece un
    // error de la app, cuando en realidad la planilla no trajo el número. Se dice.
    const ritReal = ritUtilizable(causa?.rit) ? causa.rit : null;
    const etiquetaCausa = causa ? (ritReal || 'Sin ROL') : g.casoRit;
    return {
      ...g,
      origen: 'agenda',
      // Si la clave era un id interno, se reemplaza por el ROL y la carátula de
      // la planilla. Lo que se muestra es siempre la causa real, no el id.
      casoRit: etiquetaCausa,
      rit: ritReal || g.rit,
      sinRolEnPlanilla: !!causa && !ritReal,
      caratula: causa?.caratula || g.caratula,
      tribunal: causa?.tribunal || g.tribunal,
      claveOriginal: g.casoRit,
      expedienteResuelto: resuelto,
      // Las 1.557 causas del Excel vienen marcadas con este origen. Lo que no lo
      // tiene y tampoco es un expediente propio de la bitácora no corresponde a
      // ninguna causa real: son las causas que inventó la IA (`lexcontrol_casos_ia`,
      // con id `caso-ia-*` y rit "ROL/RIT EN TRÁMITE") o roles a medio escribir.
      enPlanilla: causa?.origen === 'EXCEL_PJUD_OFICIAL',
      esExpedientePropio: idsConocidos.has(ref),
      fueraDePlanilla: causa?.origen !== 'EXCEL_PJUD_OFICIAL' && !idsConocidos.has(ref),
      // Huérfana: no hay expediente al que pertenezca, ni por nombre ni por forma.
      huerfana: !resuelto && huerfano.test(ref)
    };
  });

  // Ahora sí se deduplica, sobre la identidad ya resuelta. El servidor va primero
  // en `crudas`, así que ante una copia doble gana la suya, que es la autoritativa.
  const vistas = new Set();
  return resueltas.filter((g) => {
    const clave = `${g.casoRit}|${g.actuacion}|${g.fechaObjetivo}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

export async function guardarPlazos(plazos) {
  const res = await fetch(`${LEXCONTROL_API}/plazos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plazos })
  });
  if (!res.ok) throw new Error(`No se pudo guardar: HTTP ${res.status}`);
  return res.json();
}

/** Ordena por urgencia real: primero lo vencido, después lo que vence antes. */
export function ordenarPorUrgencia(plazos, desde = hoyLocal()) {
  const fechaDe = (p) =>
    normalizarFechaIso(p.fechaObjetivo || p.fechaVencimiento || p.vencimiento || p.fecha) || '';
  return [...plazos].sort((a, b) => {
    const ia = ORDEN_ESTADOS.indexOf(clasificar(a, desde));
    const ib = ORDEN_ESTADOS.indexOf(clasificar(b, desde));
    if (ia !== ib) return ia - ib;
    return fechaDe(a).localeCompare(fechaDe(b));
  });
}

/** Resumen para las tarjetas de cabecera del radar. */
export function resumen(plazos, desde = hoyLocal()) {
  const conteo = Object.fromEntries(ORDEN_ESTADOS.map((e) => [e, 0]));
  for (const p of plazos) conteo[clasificar(p, desde)]++;
  return {
    ...conteo,
    total: plazos.length,
    accionables: conteo.VENCIDO + conteo.HOY + conteo.CRITICO + conteo.URGENTE
  };
}

// --- Qué requiere mi atención hoy -------------------------------------------
//
// Punto de entrada único. Dashboard, Radar y Sidebar consumen esto y no arman
// listas propias: antes cada uno recolectaba de fuentes distintas y reaplicaba
// a mano la regla de qué estados cuentan según el tipo de entrada, con lo que
// cada corrección puntual arreglaba una pantalla y dejaba a las otras dos
// discrepando.

/**
 * ¿Esta entrada requiere atención hoy? Única regla del sistema.
 *
 * Depende de la naturaleza porque la fecha no significa lo mismo en cada caso:
 * un fatal vencido es la máxima urgencia, una gestión "vencida" sólo es una nota
 * escrita hace días.
 */
export function requiereAtencion(item, desde = hoyLocal()) {
  // Un pendiente de bitácora no se decide por fecha: su fecha es cuándo se anotó.
  // Está pendiente hasta que se marque REALIZADO, y los recolectores ya descartan
  // lo realizado. Antes se clasificaba por fecha y por eso aparecía sólo el día en
  // que lo escribías y desaparecía al siguiente, aunque siguiera sin hacerse.
  if (item.naturaleza === NATURALEZA.PENDIENTE) return true;
  const estado = clasificar(item, desde);
  const set = item.naturaleza === NATURALEZA.TRAMITE ? ACCIONABLES_TRAMITE : ACCIONABLES_FATAL;
  return set.has(estado);
}

/** Días de calendario transcurridos entre dos fechas ISO. */
export function diasTranscurridos(desdeIso, hastaIso) {
  const a = new Date(normalizarFechaIso(desdeIso) + 'T00:00:00');
  const b = new Date(normalizarFechaIso(hastaIso) + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Etiqueta honesta de cuánto queda. Reemplaza el "24h" fijo que se inventaba. */
function describirTiempo(item, estado, habiles, desde) {
  if (item.naturaleza === NATURALEZA.PENDIENTE) {
    // No hay cuenta regresiva: hay antigüedad. Lo que importa es cuánto lleva sin
    // hacerse, no cuándo "vence", porque no vence.
    const dias = diasTranscurridos(item.fechaObjetivo, desde);
    if (dias === 0) return 'Anotada hoy';
    if (dias === 1) return 'Pendiente desde ayer';
    return `Pendiente hace ${dias} días`;
  }
  if (item.naturaleza === NATURALEZA.TRAMITE) {
    if (estado === 'HOY') return 'El trámite es hoy';
    if (estado === 'VENCIDO') return 'Fecha de trámite ya pasada';
    return `El trámite es en ${habiles} ${habiles === 1 ? 'día hábil' : 'días hábiles'}`;
  }
  if (estado === 'VENCIDO') return 'Vencido';
  if (estado === 'HOY') return 'Vence hoy';
  return `${habiles} ${habiles === 1 ? 'día hábil' : 'días hábiles'}`;
}

/**
 * Añade lo que las pantallas necesitan mostrar, calculado una sola vez.
 *
 * Incluye los campos de presentación ya resueltos. Antes cada pantalla repetía
 * su propia cadena de fallbacks (`casoRit || rit || rol`, `actuacion ||
 * descripcion || asunto`) y no siempre con los mismos términos ni en el mismo
 * orden, así que la misma entrada se veía distinta en el Dashboard y en el Radar.
 */
function decorar(item, desde) {
  const estado = clasificar(item, desde);
  const habiles = habilesRestantes(item.fechaObjetivo, item.regimen, desde);
  const esFatal = item.naturaleza === NATURALEZA.FATAL;
  const esPendiente = item.naturaleza === NATURALEZA.PENDIENTE;
  return {
    ...item,
    estado,
    esPendiente,
    // Un pendiente de bitácora no tiene estado de semáforo: no hay fecha que
    // clasificar. Mostrarle "Vencido" o "Vence hoy" sería inventar un plazo.
    etiquetaEstado: esPendiente ? 'Pendiente' : ETIQUETA_ESTADO[estado],
    habilesRestantes: habiles,
    diasPendiente: esPendiente ? diasTranscurridos(item.fechaObjetivo, desde) : null,
    etiquetaTiempo: describirTiempo(item, estado, habiles, desde),
    esFatal,
    // Rojo o ámbar. Una sola definición de "esto no puede esperar".
    esCritico: !esPendiente && (estado === 'VENCIDO' || estado === 'HOY' || estado === 'CRITICO'),
    // La fecha ya viene resuelta: ninguna pantalla vuelve a decidir cuál de los
    // campos de fecha es el que corresponde leer.
    fechaMostrada: item.fechaObjetivo,
    casoRit: item.casoRit || item.rit || item.rol || 'Sin ROL',
    titulo: item.actuacion || item.descripcion || item.asunto || 'Trámite procesal pendiente',
    caratulaMostrada: item.caratula || item.cliente || 'Carátula no especificada',
    requiereAtencion: requiereAtencion(item, desde)
  };
}

/**
 * Responde "qué requiere mi atención hoy" con TODAS las fuentes ya unificadas:
 * plazos fatales del registro del servidor + gestiones de los expedientes +
 * restos de la Bitácora antigua en localStorage.
 *
 * Devuelve las listas ya clasificadas y ordenadas. El consumidor sólo pinta.
 */
export async function cargarAtencion({ causas = [], expedientes = null, desde = hoyLocal() } = {}) {
  let error = null;

  const fatales = await cargarPlazos().catch((e) => {
    // El registro de fatales vive en el servidor; si no responde hay que decirlo,
    // porque una lista corta sin aviso se lee como "no tengo nada que hacer".
    error = e.message;
    return [];
  });

  // Si el consumidor ya tenía los expedientes cargados los reutiliza; si no, se
  // buscan acá. Ninguna pantalla necesita saber que hacen falta para esto.
  const exps = expedientes || (await cargarExpedientes().catch(() => []));
  const tareas = await cargarTareas().catch(() => []);
  const gestiones = await cargarAgenda(causas, exps, tareas).catch(() => []);

  const todos = ordenarPorUrgencia([...fatales, ...gestiones], desde).map((i) => decorar(i, desde));

  // Tres grupos, porque son tres cosas distintas y mezclarlas es lo que venía
  // fallando:
  //
  //   atencion    -> lo que tiene fecha y esa fecha es hoy (o el fatal se acerca).
  //   pendientes  -> bitácora sin fecha de vencimiento, ordenada por antigüedad.
  //   recordatorios -> trámites con fecha propia que todavía no llega.
  const conFecha = todos.filter((i) => !i.esPendiente);
  const atencion = conFecha.filter((i) => i.requiereAtencion);
  const resto = conFecha.filter((i) => !i.requiereAtencion);
  const recordatorios = resto.filter((i) => !i.esFatal);
  // Lo más viejo primero: si algo lleva tres semanas sin hacerse, va arriba.
  const pendientes = todos
    .filter((i) => i.esPendiente)
    .sort((a, b) => String(a.fechaObjetivo).localeCompare(String(b.fechaObjetivo)));

  return {
    atencion,
    pendientes,
    resto,
    todos,
    error,
    // Los fatales SIN decorar. El Radar además de mostrar edita este registro, y
    // lo que se manda de vuelta al servidor no debe llevar los campos de
    // presentación que agrega `decorar`.
    fatales,
    recordatorios,
    // El resumen se cuenta sobre lo que de verdad entra al semáforo, no sobre el
    // total crudo: así la cifra de la Sidebar y la del Radar no pueden diferir.
    // `pendientes` va aparte: no son plazos y no deben inflar la cifra de urgencia.
    resumen: {
      ...resumen(atencion, desde),
      total: todos.length,
      accionables: atencion.length,
      pendientes: pendientes.length
    },
    huerfanas: recordatorios.filter((i) => i.huerfana).length,
    // Entradas cuya causa no está en la planilla oficial ni es un expediente
    // propio. Se cuenta sobre todo lo recolectado para poder avisarlo en pantalla
    // en vez de dejar que se mezclen con las causas reales.
    fueraDePlanilla: todos.filter((i) => i.fueraDePlanilla).length
  };
}
