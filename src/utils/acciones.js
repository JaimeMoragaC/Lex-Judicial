// acciones.js - Las operaciones que modifican el estudio, con nombre propio.
//
// Esta es la superficie que va a consumir el asistente conversacional, pero no
// depende de él: es simplemente la lista de cosas que el sistema sabe hacer.
//
// Por qué existe
// --------------
// Cada entidad ya tiene una vía única de escritura (expedientes.js, tareas.js,
// radarPlazos.js). Lo que faltaba era un lugar donde esas vías se llamen por su
// nombre -"crear expediente", "vigilar plazo"- y donde se valide ANTES de tocar
// nada. Sin eso, un asistente que escribe termina replicando la lógica de cada
// pantalla, que es exactamente cómo aparecieron los problemas que ya corregimos:
// dos componentes escribiendo la misma cosa por caminos distintos.
//
// Contrato de toda acción
// -----------------------
// 1. `validar(params, contexto)` -> { ok, error, resumen, antes, despues }
//    NO escribe. Sirve para mostrar un diff y pedir confirmación.
// 2. `ejecutar(params, contexto)` -> { ok, error, resumen, resultado }
//    Escribe por la vía única y devuelve qué cambió.
//
// La separación es deliberada: una acción que modifica o borra tiene que poder
// mostrarse antes de aplicarse. Si la IA entendió mal a qué causa te referías,
// el momento de notarlo es antes de escribir, no después.

import { cargarExpedientes, guardarExpedientes, crearExpediente, expedienteDeCaso, guardarGestionesDeCaso } from './expedientes.js';
import { cargarTareas, guardarTareas, nuevaTarea } from './tareas.js';
import { cargarPlazos, guardarPlazos, computarPlazo, buscarProcedimiento, hoyLocal } from './radarPlazos.js';
import { MOCK_CASOS } from '../mockData.js';
import { PJUD_CASOS } from '../pjudCausesData.js';

const ok = (resumen, resultado) => ({ ok: true, error: null, resumen, resultado });
const falla = (error) => ({ ok: false, error, resumen: null, resultado: null });

/** Texto no vacío, o null. */
const texto = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};

// --- Gestiones ---------------------------------------------------------------

const registrarGestion = {
  id: 'registrar_gestion',
  etiqueta: 'Registrar una gestión en un expediente',
  destructiva: false,

  async validar({ casoRef, tramite, estado, fecha }, { expedientes } = {}) {
    if (!texto(tramite)) return falla('Falta describir la gestión.');
    const exp = expedienteDeCaso({ id: casoRef, rit: casoRef }, expedientes || []);
    if (!exp) return falla(`No encontré un expediente que corresponda a "${casoRef}".`);
    return {
      ok: true,
      error: null,
      resumen: `Anotar en ${exp.id} (${exp.cliente || 'sin cliente'})`,
      antes: null,
      // Lo que se va a escribir, textual. Un contador de gestiones no deja ver si
      // el asistente entendió mal el trámite o lo dejó a medias.
      despues: {
        expediente: exp.id,
        tramite: texto(tramite),
        estado: texto(estado) || 'PENDIENTE (POR HACER)'
      }
    };
  },

  async ejecutar({ casoRef, tramite, estado, fecha }, { expedientes } = {}) {
    // Cargar ANTES de validar: si el llamador no trajo los expedientes, validar
    // contra una lista vacía haría fallar toda acción por "no encontré el
    // expediente", que además es un mensaje engañoso.
    const lista = expedientes || (await cargarExpedientes());
    const previo = await this.validar({ casoRef, tramite, estado, fecha }, { expedientes: lista });
    if (!previo.ok) return previo;

    const exp = expedienteDeCaso({ id: casoRef, rit: casoRef }, lista);
    const gestion = {
      id: `gest-${Date.now()}`,
      tramite: texto(tramite),
      estado: texto(estado) || 'PENDIENTE (POR HACER)',
      fecha: fecha || new Date().toLocaleDateString('es-CL'),
      // Sin `fechaIso`: es un registro de bitácora, no un trámite con fecha
      // elegida. radarPlazos.js usa justamente ese campo para distinguirlos.
      origen: 'Asistente'
    };
    const guardado = await guardarGestionesDeCaso(exp, [gestion, ...(exp.gestiones || [])]);
    return ok(previo.resumen, guardado);
  }
};

// --- Expedientes -------------------------------------------------------------

const crearExpedienteAccion = {
  id: 'crear_expediente',
  etiqueta: 'Abrir un expediente nuevo',
  destructiva: false,

  async validar({ cliente, asunto, tipo }, { expedientes } = {}) {
    if (!texto(cliente)) return falla('Un expediente necesita un cliente.');
    const expList = expedientes || (await cargarExpedientes());
    const yaExiste = (expList || []).find(
      (e) => String(e.cliente || '').toLowerCase().trim() === String(cliente).toLowerCase().trim() &&
             String(e.asunto || '').toLowerCase().trim() === String(asunto || '').toLowerCase().trim()
    );
    if (yaExiste) return falla(`Ya existe el expediente ${yaExiste.id} para ${cliente}${asunto ? ` — ${asunto}` : ''}.`);
    return {
      ok: true,
      error: null,
      resumen: `Abrir expediente para ${texto(cliente)}${texto(asunto) ? ` — ${texto(asunto)}` : ''}`,
      antes: null,
      despues: { cliente: texto(cliente), asunto: texto(asunto), tipo: tipo || 'extrajudicial' }
    };
  },

  async ejecutar({ cliente, asunto, tipo }, { expedientes } = {}) {
    const lista = expedientes || (await cargarExpedientes());
    const previo = await this.validar({ cliente, asunto, tipo }, { expedientes: lista });
    if (!previo.ok) return previo;

    const nuevo = crearExpediente({ cliente: texto(cliente), asunto: texto(asunto) || '', tipo: tipo || 'extrajudicial' }, lista);
    const siguientes = [nuevo, ...lista];
    await guardarExpedientes(siguientes);

    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        const casosIA = JSON.parse(localStorage.getItem('lexcontrol_casos_ia') || '[]');
        localStorage.setItem('lexcontrol_casos_ia', JSON.stringify([nuevo, ...casosIA]));
      }
    } catch (e) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lexcontrol_expedientes_updated', { detail: nuevo }));
    }
    return ok(`Expediente ${nuevo.id} creado para ${nuevo.cliente}`, nuevo);
  }
};

/** Campos que el asistente puede tocar. El resto del expediente no se expone. */
const CAMPOS_EDITABLES = ['cliente', 'asunto', 'tribunal', 'tipo', 'ritVinculado'];

const modificarExpediente = {
  id: 'modificar_expediente',
  etiqueta: 'Modificar los datos de un expediente',
  destructiva: false,

  async validar({ casoRef, cambios }, { expedientes } = {}) {
    const exp = expedienteDeCaso({ id: casoRef, rit: casoRef }, expedientes || []);
    if (!exp) return falla(`No encontré un expediente que corresponda a "${casoRef}".`);

    const aplicables = Object.entries(cambios || {})
      .filter(([k, v]) => CAMPOS_EDITABLES.includes(k) && texto(v) && texto(v) !== texto(exp[k]));
    if (!aplicables.length) return falla('No hay ningún cambio que aplicar sobre campos editables.');

    return {
      ok: true,
      error: null,
      resumen: `Modificar ${exp.id}: ${aplicables.map(([k]) => k).join(', ')}`,
      // El diff explícito: es lo que hay que mostrarle al abogado antes de escribir.
      antes: Object.fromEntries(aplicables.map(([k]) => [k, exp[k] ?? null])),
      despues: Object.fromEntries(aplicables.map(([k, v]) => [k, texto(v)]))
    };
  },

  async ejecutar({ casoRef, cambios }, { expedientes } = {}) {
    const lista = expedientes || (await cargarExpedientes());
    const previo = await this.validar({ casoRef, cambios }, { expedientes: lista });
    if (!previo.ok) return previo;

    const exp = expedienteDeCaso({ id: casoRef, rit: casoRef }, lista);
    Object.assign(exp, previo.despues);
    await guardarExpedientes(lista);
    return ok(previo.resumen, exp);
  }
};

// --- Tareas ------------------------------------------------------------------

const crearTarea = {
  id: 'crear_tarea',
  etiqueta: 'Crear una tarea en la agenda',
  destructiva: false,

  async validar({ titulo, fechaVencimiento, prioridad }) {
    if (!texto(titulo)) return falla('Una tarea necesita un título.');
    return {
      ok: true,
      error: null,
      resumen: `Crear tarea «${texto(titulo)}»`,
      antes: null,
      // Se muestran TODOS los campos que se van a escribir, incluso los vacíos.
      // El asistente puede decir "para el 6 de agosto" en su respuesta y no poner
      // la fecha en la acción: si el diff sólo mostrara el título, esa diferencia
      // pasaría desapercibida y la tarea quedaría sin vencimiento.
      despues: {
        titulo: texto(titulo),
        fechaVencimiento: texto(fechaVencimiento) || '(sin fecha)',
        prioridad: texto(prioridad) || 'ALTA'
      }
    };
  },

  async ejecutar(params) {
    const previo = await this.validar(params);
    if (!previo.ok) return previo;
    const lista = await cargarTareas();
    const tarea = nuevaTarea(params);
    await guardarTareas([tarea, ...lista]);
    return ok(previo.resumen, tarea);
  }
};

const modificarTarea = {
  id: 'modificar_tarea',
  etiqueta: 'Modificar o completar una tarea',
  destructiva: false,

  async validar({ tareaId, cambios }, { tareas } = {}) {
    const lista = tareas || [];
    const tarea = lista.find((t) => t.id === tareaId);
    if (!tarea) return falla(`No encontré la tarea "${tareaId}".`);
    const permitidos = ['titulo', 'fechaVencimiento', 'prioridad', 'notas', 'completada'];
    const aplicables = Object.entries(cambios || {}).filter(([k, v]) => permitidos.includes(k) && v !== tarea[k]);
    if (!aplicables.length) return falla('No hay ningún cambio que aplicar.');
    return {
      ok: true,
      error: null,
      resumen: `Modificar tarea «${tarea.titulo}»: ${aplicables.map(([k]) => k).join(', ')}`,
      antes: Object.fromEntries(aplicables.map(([k]) => [k, tarea[k] ?? null])),
      despues: Object.fromEntries(aplicables)
    };
  },

  async ejecutar({ tareaId, cambios }, ctx) {
    const lista = (ctx && ctx.tareas) || (await cargarTareas());
    const previo = await this.validar({ tareaId, cambios }, { tareas: lista });
    if (!previo.ok) return previo;
    const siguientes = lista.map((t) => (t.id === tareaId ? { ...t, ...previo.despues } : t));
    await guardarTareas(siguientes);
    return ok(previo.resumen, siguientes.find((t) => t.id === tareaId));
  }
};

// --- Plazos ------------------------------------------------------------------

const vigilarPlazo = {
  id: 'vigilar_plazo',
  etiqueta: 'Poner un plazo fatal bajo vigilancia',
  destructiva: false,

  async validar({ procedimientoId, fechaBase, rit, caratula }) {
    const proc = procedimientoId ? buscarProcedimiento(procedimientoId) : null;
    if (!proc) return falla(`No conozco el procedimiento "${procedimientoId}". Elígelo del catálogo de Cómputo de Términos.`);
    if (!texto(fechaBase)) return falla('Falta la fecha de notificación o del hito desde el que se cuenta.');
    let calculado;
    try {
      calculado = computarPlazo({ procedimientoId, fechaBase, rit, caratula });
    } catch (e) {
      return falla(e.message);
    }
    return {
      ok: true,
      error: null,
      // El plazo se muestra YA computado por el motor real: el abogado ve la
      // fecha antes de aceptarla, no una promesa de que se calculará bien.
      resumen: `Vigilar «${proc.nombre}» — vence ${calculado.fechaVencimiento} (${calculado.normativa})`,
      antes: null,
      despues: calculado
    };
  },

  async ejecutar(params) {
    const previo = await this.validar(params);
    if (!previo.ok) return previo;
    const registro = await cargarPlazos();
    await guardarPlazos([...registro, previo.despues]);
    return ok(previo.resumen, previo.despues);
  }
};

// --- Abrir / Ver Expediente --------------------------------------------------

const abrirExpediente = {
  id: 'abrir_expediente',
  etiqueta: 'Abrir la ficha de un expediente o causa',
  destructiva: false,

  async validar({ casoRef }, { expedientes, causas } = {}) {
    if (!texto(casoRef)) return falla('Se requiere especificar la causa o expediente.');
    const expList = expedientes || [];
    const causaList = causas || [...MOCK_CASOS, ...PJUD_CASOS];

    const exp = expedienteDeCaso({ id: casoRef, rit: casoRef }, expList);
    const targetLow = String(casoRef).toLowerCase().trim();
    const causa = !exp ? causaList.find(c =>
      String(c.id).toLowerCase() === targetLow ||
      (c.rit && String(c.rit).toLowerCase() === targetLow) ||
      (c.caratula && c.caratula.toLowerCase().includes(targetLow)) ||
      (c.cliente && c.cliente.toLowerCase().includes(targetLow))
    ) : null;

    const encontrado = exp || causa;
    if (!encontrado) return falla(`No encontré ninguna causa o expediente que corresponda a "${casoRef}".`);

    const ritOId = encontrado.rit || encontrado.id || casoRef;
    const desc = encontrado.cliente || encontrado.caratula || 'Expediente digital';

    return {
      ok: true,
      error: null,
      resumen: `Abrir ficha de ${ritOId} (${desc})`,
      antes: null,
      despues: { casoRef: ritOId }
    };
  },

  async ejecutar({ casoRef }, { expedientes, causas, onSelectCaso } = {}) {
    const expList = expedientes || (await cargarExpedientes());
    const causaList = causas || [...MOCK_CASOS, ...PJUD_CASOS];
    const previo = await this.validar({ casoRef }, { expedientes: expList, causas: causaList });
    if (!previo.ok) return previo;

    const exp = expedienteDeCaso({ id: casoRef, rit: casoRef }, expList);
    const targetLow = String(casoRef).toLowerCase().trim();
    const causa = !exp ? causaList.find(c =>
      String(c.id).toLowerCase() === targetLow ||
      (c.rit && String(c.rit).toLowerCase() === targetLow) ||
      (c.caratula && c.caratula.toLowerCase().includes(targetLow)) ||
      (c.cliente && c.cliente.toLowerCase().includes(targetLow))
    ) : null;

    const encontrado = exp || causa;
    if (onSelectCaso && encontrado) {
      onSelectCaso(encontrado);
    }
    return ok(previo.resumen, encontrado);
  }
};

const abrirModalIngresoGestion = {
  id: 'abrir_modal_ingreso_gestion',
  etiqueta: 'Ingresar nueva gestión manualmente',
  destructiva: false,

  async validar({ casoRef }, { expedientes, causas } = {}) {
    return {
      ok: true,
      error: null,
      resumen: `Abrir formulario para ingresar gestión ${casoRef ? 'al caso ' + casoRef : ''}`,
      antes: null,
      despues: {}
    };
  },

  async ejecutar({ casoRef }) {
    const previo = await this.validar({ casoRef });
    if (!previo.ok) return previo;
    
    // Disparar evento para que App.jsx abra el modal
    window.dispatchEvent(new CustomEvent('lexcontrol_open_ingreso_gestion', { detail: { casoRef } }));
    return ok(previo.resumen, null);
  }
};

// --- Registro ----------------------------------------------------------------

export const ACCIONES = {
  [registrarGestion.id]: registrarGestion,
  [crearExpedienteAccion.id]: crearExpedienteAccion,
  [modificarExpediente.id]: modificarExpediente,
  [crearTarea.id]: crearTarea,
  [modificarTarea.id]: modificarTarea,
  [vigilarPlazo.id]: vigilarPlazo,
  [abrirExpediente.id]: abrirExpediente,
  [abrirModalIngresoGestion.id]: abrirModalIngresoGestion
};

/**
 * Traduce una acción propuesta por el asistente a los parámetros que espera
 * `validarAccion` / `ejecutarAccion`.
 *
 * El esquema que devuelve Gemini es PLANO (campo + valor) porque los esquemas
 * anidados le salen mal y porque un cambio por acción se explica mejor en un diff.
 * Acá se rearma la forma real. No se valida nada: de eso se encarga cada acción.
 */
export function paramsDesdePropuesta(p = {}) {
  const base = { ...p };
  delete base.accion;
  delete base.motivo;

  if (p.accion === 'modificar_expediente') {
    return { casoRef: p.casoRef, cambios: p.campo ? { [p.campo]: p.valor } : {} };
  }
  if (p.accion === 'modificar_tarea') {
    const cambios = {};
    for (const k of ['titulo', 'fechaVencimiento', 'prioridad', 'notas', 'completada']) {
      if (p[k] !== undefined) cambios[k] = p[k];
    }
    return { tareaId: p.tareaId, cambios };
  }
  return base;
}

/** Catálogo para construir el schema del asistente sin repetir esta lista. */
export function catalogoDeAcciones() {
  return Object.values(ACCIONES).map((a) => ({
    id: a.id,
    etiqueta: a.etiqueta,
    destructiva: a.destructiva
  }));
}

/**
 * Valida una acción propuesta sin escribir. Devuelve el diff para confirmar.
 * Una acción desconocida NO es un error silencioso: el asistente puede inventar
 * un nombre y hay que verlo.
 */
export async function validarAccion(accionId, params, contexto = {}) {
  const accion = ACCIONES[accionId];
  if (!accion) return falla(`Acción desconocida: "${accionId}".`);
  try {
    return await accion.validar(params || {}, contexto);
  } catch (e) {
    return falla(e.message);
  }
}

/** Ejecuta una acción ya confirmada. Revalida antes de escribir. */
export async function ejecutarAccion(accionId, params, contexto = {}) {
  const accion = ACCIONES[accionId];
  if (!accion) return falla(`Acción desconocida: "${accionId}".`);
  try {
    return await accion.ejecutar(params || {}, contexto);
  } catch (e) {
    return falla(e.message);
  }
}
