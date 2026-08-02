// mockData.js - Base de Datos 100% Reales y Expedientes Litigados del Estudio
import { PJUD_CASOS, PJUD_CASOS_TOTAL } from './pjudCausesData.js';
import { REAL_DISK_DATA } from './realDiskData.js';

export const MOCK_STATS = {
  casosActivos: typeof PJUD_CASOS_TOTAL !== 'undefined' ? PJUD_CASOS_TOTAL : 0,
  plazosFatales48h: 0,
  audienciasMes: 0,
  tasaExitoLitigio: "N/A",
  pruebaAdmitidaPromedio: "N/A"
};

// Clientes Reales del Disco Duro Local
export const MOCK_CLIENTES = [];

// Array de Causas Reales: Sistema reiniciado para partir de nuevo desde cero
export const MOCK_CASOS = [];

export const MOCK_MATRIZ_PROBATORIA = [];

export const MOCK_PLAZOS_FATALES = [];

// Función exportada para integrar expedientes en vivo por Inteligencia Artificial
export function integrarExpedienteIA(dataIA) {
  const rolLimpio = dataIA.rol ? dataIA.rol.trim() : "";
  let existente = MOCK_CASOS.find(c => c.rit === rolLimpio && rolLimpio !== "");

  // Sin rol legible no había forma de reconocer la causa, así que cada documento
  // analizado creaba una causa nueva `caso-ia-<timestamp>` con rit "ROL/RIT EN
  // TRÁMITE". Analizar 40 PDF sin rol dejaba 40 causas fantasma, cada una con sus
  // gestiones, y el radar las mostraba como causas ajenas a la planilla.
  //
  // Cuando no hay rol se reutiliza la causa IA que ya tenga la misma carátula y
  // tribunal, en vez de acuñar otro id. No es identificación perfecta -sin rol no
  // existe-, pero acota el crecimiento a una causa por expediente distinto.
  if (!existente && !rolLimpio) {
    const caratulaIA = (dataIA.caratula || "").trim().toUpperCase();
    const tribunalIA = (dataIA.tribunal || "").trim().toUpperCase();
    if (caratulaIA) {
      existente = MOCK_CASOS.find(c =>
        String(c.id || "").startsWith("caso-ia-") &&
        String(c.caratula || "").trim().toUpperCase() === caratulaIA &&
        String(c.tribunal || "").trim().toUpperCase() === tribunalIA
      );
    }
  }

  const idCaso = existente ? existente.id : `caso-ia-${Date.now()}`;

  const datosActualizados = {
    nuc: (dataIA.ruts_detectados && dataIA.ruts_detectados.length > 0) ? dataIA.ruts_detectados[0] : (existente ? existente.nuc : "Sin RUT registrado"),
    caratula: dataIA.caratula || (existente ? existente.caratula : "Nueva Causa Judicial"),
    materia: dataIA.materia || (existente ? existente.materia : "Materia Judicial Procesal"),
    etapa: dataIA.hito_critico || (existente ? existente.etapa : "Análisis Documental Gemini"),
    tribunal: dataIA.tribunal || (existente ? existente.tribunal : "Juzgado / Corte de Apelaciones"),
    proximaAudiencia: dataIA.fecha_audiencia_fijada || (existente ? existente.proximaAudiencia : "Sin audiencia programada"),
    estadoPlazo: (dataIA.plazo_dias && dataIA.plazo_dias <= 5) ? "URGENTE" : "AL DIA",
    plazoDescripcion: `${dataIA.hito_critico} (${dataIA.tipo_plazo || "Plazo legal"})`,
    diasRestantes: dataIA.plazo_dias || 5,
    resumenTeoriaCaso: `ESTRATEGIA IA: ${dataIA.accion_sugerida || "Revisar actuaciones."}`,
    analisisDemanda: dataIA.analisis_demanda_o_pretension || "",
    analisisDefensas: dataIA.analisis_defensas_y_excepciones || "",
    auditoriaEmplazamiento: dataIA.auditoria_emplazamiento_y_notificaciones || "",
    erroresTramitacion: dataIA.errores_y_vicios_tramitacion || [],
    estrategiaOfensiva: dataIA.estrategia_ofensiva_litigante || ""
  };

  if (existente) {
    // Actualizar en memoria (mutación in-place para que afecte a toda la app)
    Object.assign(existente, datosActualizados);
    
    try {
      const prev = JSON.parse(localStorage.getItem('lexcontrol_casos_ia') || '[]');
      const actualizados = prev.map(c => c.id === existente.id ? { ...c, ...datosActualizados } : c);
      localStorage.setItem('lexcontrol_casos_ia', JSON.stringify(actualizados));
    } catch(e) {}
    
    return existente;
  }

  const nuevoCaso = {
    id: idCaso,
    clienteId: "cli-moraga-self",
    rit: rolLimpio || "ROL/RIT EN TRÁMITE",
    abogadoAspirante: "Jaime Moraga C.",
    cliente: "Interviniente",
    contraparte: "Contraparte Judicial",
    fechaIngreso: new Date().toLocaleDateString('es-CL'),
    probabilidadExito: "Alta (IA)",
    estadisticasPrueba: { total: 1, admitidas: 1, impugnadas: 0 },
    ...datosActualizados
  };

  MOCK_CASOS.unshift(nuevoCaso);

  try {
    const prev = JSON.parse(localStorage.getItem('lexcontrol_casos_ia') || '[]');
    localStorage.setItem('lexcontrol_casos_ia', JSON.stringify([nuevoCaso, ...prev]));
  } catch (e) {
    // Este catch estaba vacío, y es la explicación más probable de las gestiones
    // que apuntan a un `caso-ia-*` inexistente: si el guardado falla (cuota de
    // localStorage agotada), la causa nunca se persiste, pero la gestión que se
    // guarda después sí -es mucho más pequeña- y queda apuntando a una causa que
    // no existe. Fallar en silencio hacía que el síntoma apareciera lejos de acá.
    console.error('LexControl: no se pudo guardar la causa integrada por IA. La gestión que registres sobre ella quedará huérfana.', e);
  }

  return nuevoCaso;
}

export const DEFAULT_TAREAS = [];

