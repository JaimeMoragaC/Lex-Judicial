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

/** Semáforo. El corte está en días hábiles, que es como se trabaja. */
export function clasificar(plazo, desde = hoyLocal()) {
  const fVenc = normalizarFechaIso(plazo.fechaVencimiento || plazo.vencimiento || plazo.fecha);
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
    fechaVencimiento: resultado.fechaVencimiento,
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

export function obtenerGestionesGlobalesLocalStorage() {
  const plazosExtraidos = [];
  const hoy = hoyLocal();

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
              const esRealizado = g.estado === 'REALIZADO' || g.estado === 'TERMINADO' || g.estado === 'FALLADO / ARCHIVADO';
              
              if (fIso && !esRealizado) {
                const fechaFinal = fIso || hoy;
                const estadoSemaforo = clasificar({ fechaVencimiento: fechaFinal }, hoy);
                
                plazosExtraidos.push({
                  id: `ls-gestion-${casoRit}-${idx}-${fechaFinal}`,
                  casoRit: casoRit,
                  rit: casoRit,
                  caratula: g.caratula || 'Carátula no especificada',
                  cliente: g.cliente || 'Cliente no asignado',
                  tribunal: g.tribunal || 'Tribunal no especificado',
                  actuacion: g.tramite || g.actuacion || 'Gestión Pendiente',
                  descripcion: g.tramite || g.actuacion || 'Gestión Pendiente',
                  asunto: g.tramite || g.actuacion || 'Gestión Pendiente',
                  regimen: 'CPC',
                  dias: 0,
                  esHaciaAtras: false,
                  fechaBase: fechaFinal,
                  fechaVencimiento: fechaFinal,
                  vencimiento: fechaFinal,
                  clasificacion: estadoSemaforo,
                  estadoSemaforo: estadoSemaforo,
                  horasRestantes: fechaFinal === hoy ? 0 : 24,
                  prioridad: estadoSemaforo === 'HOY' || estadoSemaforo === 'VENCIDO' || estadoSemaforo === 'CRITICO' ? 'CRITICA' : 'ALTA',
                  notas: g.estado || 'Ingresado en expediente'
                });
              }
            });
          }
        } catch (e) {}
      }

      // 2. Revisar tareas globales (lexcontrol_tareas_globales)
      if (key === 'lexcontrol_tareas_globales') {
        try {
          const tareas = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(tareas)) {
            tareas.forEach((t, idx) => {
              const fIso = normalizarFechaIso(t.fecha);
              if (fIso) {
                const estadoSemaforo = clasificar({ fechaVencimiento: fIso }, hoy);
                plazosExtraidos.push({
                  id: `ls-tarea-${t.id || idx}`,
                  casoRit: t.casoRit || 'AGENDA GLOBAL',
                  rit: t.casoRit || 'AGENDA GLOBAL',
                  caratula: t.caratula || 'Tarea General',
                  cliente: t.cliente || 'Estudio Jurídico',
                  tribunal: 'Agenda Local',
                  actuacion: t.titulo || t.descripcion || 'Tarea Pendiente',
                  descripcion: t.titulo || t.descripcion || 'Tarea Pendiente',
                  asunto: t.titulo || t.descripcion || 'Tarea Pendiente',
                  regimen: 'CPC',
                  dias: 0,
                  esHaciaAtras: false,
                  fechaBase: fIso,
                  fechaVencimiento: fIso,
                  vencimiento: fIso,
                  clasificacion: estadoSemaforo,
                  estadoSemaforo: estadoSemaforo,
                  horasRestantes: fIso === hoy ? 0 : 24,
                  prioridad: estadoSemaforo === 'HOY' || estadoSemaforo === 'VENCIDO' ? 'CRITICA' : 'ALTA',
                  notas: t.notas || ''
                });
              }
            });
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  return plazosExtraidos;
}

export async function cargarPlazos() {
  let plazosServidor = [];
  try {
    const res = await fetch(`${LEXCONTROL_API}/plazos`);
    if (res.ok) {
      const datos = await res.json();
      plazosServidor = (datos.plazos || []).map(recomputar);
    }
  } catch (e) {}

  const plazosLS = obtenerGestionesGlobalesLocalStorage();

  // DEDUPLICAR Y UNIFICAR
  const mapa = new Map();
  [...plazosLS, ...plazosServidor].forEach(p => {
    const fNorm = normalizarFechaIso(p.fechaVencimiento || p.vencimiento || p.fechaBase);
    const clave = `${p.rit || p.casoRit}-${p.actuacion || p.descripcion}-${fNorm}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        ...p,
        fechaVencimiento: fNorm,
        vencimiento: fNorm,
        clasificacion: clasificar({ fechaVencimiento: fNorm }, hoyLocal())
      });
    }
  });

  return Array.from(mapa.values());
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
  return [...plazos].sort((a, b) => {
    const ia = ORDEN_ESTADOS.indexOf(clasificar(a, desde));
    const ib = ORDEN_ESTADOS.indexOf(clasificar(b, desde));
    if (ia !== ib) return ia - ib;
    return a.fechaVencimiento.localeCompare(b.fechaVencimiento);
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
