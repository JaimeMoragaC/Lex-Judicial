// tareas.js - Registro de tareas de la agenda del estudio.
//
// Antes las tareas vivían SÓLO en el localStorage del navegador, escritas a mano
// con tres `localStorage.setItem` dentro de AgendaPlazos.jsx. Eso tenía dos
// consecuencias: limpiar los datos del sitio las borraba sin rastro, y ninguna
// otra parte del sistema podía crear una tarea, porque no existía fuera del
// estado interno de esa pantalla.
//
// Ahora son un dato del estudio, guardado en el servidor como los expedientes y
// los plazos. Este módulo es la única vía de lectura y escritura.

import { LEXCONTROL_API } from '../apiBase.js';

/** Clave de la versión anterior, que se migra al servidor la primera vez. */
const CLAVE_LEGADO = 'lexcontrol_tareas_globales';

export function nuevaTarea({ titulo, casoRit, casoId, casoCaratula, fechaVencimiento, prioridad, responsable, notas }) {
  const limpio = String(titulo || '').trim();
  if (!limpio) throw new Error('Una tarea necesita un título.');
  return {
    id: `tar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    titulo: limpio,
    casoRit: casoRit || '',
    casoId: casoId || '',
    casoCaratula: casoCaratula || '',
    fechaVencimiento: fechaVencimiento || '',
    prioridad: prioridad || 'ALTA',
    responsable: responsable || 'Jaime Moraga C.',
    notas: notas || '',
    completada: false,
    fechaCreacion: new Date().toISOString()
  };
}

/**
 * Tareas del servidor. La primera vez sube lo que hubiera en localStorage, para
 * no perder lo que el abogado ya tenía anotado antes de este cambio.
 */
export async function cargarTareas() {
  const res = await fetch(`${LEXCONTROL_API}/tareas`);
  if (!res.ok) throw new Error(`El servidor respondió HTTP ${res.status}`);
  let tareas = (await res.json()).tareas || [];

  try {
    const legado = localStorage.getItem(CLAVE_LEGADO);
    if (legado) {
      const previas = JSON.parse(legado);
      if (Array.isArray(previas) && previas.length) {
        // Se deduplica por título + caso: si ya subieron en una carga anterior,
        // no se duplican al volver a entrar.
        const vistas = new Set(tareas.map((t) => `${t.titulo}|${t.casoRit}`));
        const faltantes = previas.filter((t) => !vistas.has(`${t.titulo}|${t.casoRit}`));
        if (faltantes.length) {
          tareas = [...faltantes, ...tareas];
          await guardarTareas(tareas);
          console.info(`LexControl: ${faltantes.length} tarea(s) migrada(s) del navegador al servidor.`);
        }
      }
    }
  } catch (e) {
    console.warn('Aviso migración de tareas:', e);
  }

  return tareas;
}

export async function guardarTareas(tareas) {
  const res = await fetch(`${LEXCONTROL_API}/tareas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tareas })
  });
  if (!res.ok) throw new Error(`No se pudo guardar: HTTP ${res.status}`);
  return res.json();
}
