// mockData.js - Base de Datos 100% Reales y Expedientes Litigados del Estudio
import { PJUD_CASOS, PJUD_CASOS_TOTAL } from './pjudCausesData';
import { REAL_DISK_DATA } from './realDiskData';

export const MOCK_STATS = {
  casosActivos: typeof PJUD_CASOS_TOTAL !== 'undefined' ? PJUD_CASOS_TOTAL : 0,
  plazosFatales48h: 0,
  audienciasMes: 0,
  tasaExitoLitigio: "N/A",
  pruebaAdmitidaPromedio: "N/A"
};

// Clientes Reales del Disco Duro Local
export const MOCK_CLIENTES = [
  ...REAL_DISK_DATA.map((cli, index) => ({
    id: cli.id || `cli-real-${index}`,
    rut: cli.rut || "Sin RUT",
    razonSocial: cli.nombre || cli.folderName || "Mandante sin denominación",
    tipo: "Mandante Real",
    representanteLegal: cli.nombre || "N/A",
    email: "contacto@estudio.cl",
    telefono: "+56 9 (Registrado en Ficha)",
    direccion: "Ver en Expediente Digital",
    sector: "Litigación y Defensa",
    modeloHonorarios: "Prestación de Servicios",
    estadoFacturacion: "AL_DIA",
    socioResponsable: "Jaime Moraga C.",
    notasConfidenciales: `Expediente físico: ${cli.path || cli.folderName}`
  }))
];

// Cargar casos guardados por IA en sesiones anteriores
let savedIACasos = [];
try {
  savedIACasos = JSON.parse(localStorage.getItem('lexcontrol_casos_ia') || '[]');
} catch(e) {}

// Array de Causas Reales: Causas IA + Causas oficiales del Excel PJUD
export const MOCK_CASOS = [
  ...savedIACasos,
  ...(typeof PJUD_CASOS !== 'undefined' ? PJUD_CASOS : [])
];

export const MOCK_MATRIZ_PROBATORIA = [];

const savedPlazos = savedIACasos.filter(c => c.plazoDias || c.estadoPlazo === "URGENTE").map(c => ({
  id: `plz-${c.id}`,
  casoRit: c.rit,
  caratula: `${c.caratula} (${c.tribunal})`,
  descripcion: `⚡ ${c.etapa}: ${c.resumenTeoriaCaso}`,
  fechaVencimiento: c.proximaAudiencia !== "Sin audiencia programada" ? c.proximaAudiencia : `En ${c.plazoDias || 5} días`,
  horasRestantes: (c.plazoDias || 5) * 24,
  prioridad: (c.plazoDias && c.plazoDias <= 3) ? "CRITICA" : "ALTA",
  responsable: "Jaime Moraga C."
}));

export const MOCK_PLAZOS_FATALES = [
  ...savedPlazos
];

const savedAudiencias = savedIACasos.filter(c => c.proximaAudiencia && c.proximaAudiencia !== "Sin audiencia programada").map(c => ({
  id: `aud-${c.id}`,
  fecha: c.proximaAudiencia,
  tribunal: c.tribunal,
  sala: "Verificar en resolución u Oficina Virtual PJUD",
  caso: `${c.caratula} (${c.rit})`,
  tipo: c.etapa,
  abogado: "Jaime Moraga C. (IA)",
  estado: "CONFIRMADA POR GEMINI IA"
}));

export const MOCK_AUDIENCIAS_HOY_SEMANA = [
  ...savedAudiencias
];

// Función exportada para integrar expedientes en vivo por Inteligencia Artificial
export function integrarExpedienteIA(dataIA) {
  const rolLimpio = dataIA.rol ? dataIA.rol.trim() : "";
  const existente = MOCK_CASOS.find(c => c.rit === rolLimpio && rolLimpio !== "");
  
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
  } catch(e) {}

  return nuevoCaso;
}

export const DEFAULT_TAREAS = [];

