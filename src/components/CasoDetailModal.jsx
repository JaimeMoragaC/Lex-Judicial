import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Scale, 
  User, 
  Calendar, 
  FileText, 
  ShieldCheck, 
  AlertTriangle,
  AlertCircle,
  Maximize2,
  Minimize2,
  GripHorizontal,
  Table, 
  Gavel, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  ExternalLink,
  History,
  FolderOpen,
  Link2,
  Download,
  Eye,
  Layers,
  FileCheck,
  HardDrive,
  Share2,
  ChevronRight,
  PlusCircle,
  Trash2,
  Edit3,
  Mic,
  Play,
  Pause,
  RotateCcw,
  Printer,
  FileCode,
  Copy,
  MessageCircle,
  MessageSquare,
  BookOpen,
  MapPin,
  Sparkles,
  Loader2,
  Paperclip
} from 'lucide-react';
import { refrescarDiscoData } from '../realDiskData';
import { findDiscoFolder } from '../utils/folderMatcher';
import { MOCK_CASOS } from '../mockData';
import { PJUD_CASOS } from '../pjudCausesData';
import { LEXCONTROL_API } from '../apiBase.js';
import { cargarPlazos, guardarPlazos, normalizarFechaIso, hoyLocal } from '../utils/radarPlazos.js';
import { cargarExpedientes, guardarExpedientes, expedienteDeCaso, guardarGestionesDeCaso, eliminarExpediente, claveDeCaso } from '../utils/expedientes.js';
import ModalRedactarDocumento from './ModalRedactarDocumento.jsx';


function extraerCiudad(caso) {
  if (!caso) return 'Sin ciudad asignada';
  if (caso.ciudad) return caso.ciudad;
  const trib = (caso.tribunal || '').toLowerCase();
  if (trib.includes('temuco')) return 'Temuco';
  if (trib.includes('pichilemu')) return 'Pichilemu';
  if (trib.includes('villarrica')) return 'Villarrica';
  if (trib.includes('pucón') || trib.includes('pucon')) return 'Pucón';
  if (trib.includes('concepción') || trib.includes('concepcion')) return 'Concepción';
  if (trib.includes('santiago')) return 'Santiago';
  if (trib.includes('calbuco')) return 'Calbuco';
  if (trib.includes('castro')) return 'Castro';
  if (trib.includes('collipulli')) return 'Collipulli';
  if (trib.includes('puerto montt')) return 'Puerto Montt';
  if (trib.includes('valdivia')) return 'Valdivia';
  if (caso.jurisdiccion) return caso.jurisdiccion;

  const m = (caso.tribunal || '').match(/(?:de|en)\s+([A-ZÁÉÍÓÚÑa-záréíóúñ\s]+)$/i);
  if (m && m[1]) return m[1].trim();

  return caso.tribunal || 'Sin ciudad asignada';
}

function extraerCliente(caso) {
  if (!caso) return 'Sin cliente asignado';
  if (caso.cliente) return caso.cliente;
  if (caso.caratula) return caso.caratula;
  return 'Sin cliente asignado';
}

export default function CasoDetailModal({ caso: casoProp, onClose, onOpenMatriz, onSelectCaso, initialTab = 'resumen' }) {
  const listaCasos = useMemo(() => (Array.isArray(casoProp) ? casoProp : [casoProp].filter(Boolean)), [casoProp]);
  const [idxCasoSel, setIdxCasoSel] = useState(0);
  const [esModoFlotante, setEsModoFlotante] = useState(true);
  const [posicionFlotante, setPosicionFlotante] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [subVistaPlanilla, setSubVistaPlanilla] = useState(() => (initialTab === 'gestiones' ? 'gestiones' : 'expedientes'));
  const [vistaModal, setVistaModal] = useState(() => (Array.isArray(casoProp) && casoProp.length > 1 ? 'planilla' : 'ficha'));
  const [modoVistaGestiones, setModoVistaGestiones] = useState('planilla');
  const [showRedactarModal, setShowRedactarModal] = useState(false);
  const [redactarModalGestion, setRedactarModalGestion] = useState(null);
  const [exportandoNotebook, setExportandoNotebook] = useState(false);
  const [showCambiarCarpeta, setShowCambiarCarpeta] = useState(false);
  const [nuevaRutaCarpeta, setNuevaRutaCarpeta] = useState('');
  const [guardandoCarpeta, setGuardandoCarpeta] = useState(false);
  const [expedientesServidor, setExpedientesServidor] = useState([]);

  const [browserRutaActual, setBrowserRutaActual] = useState('');
  const [browserPadre, setBrowserPadre] = useState(null);
  const [browserSubcarpetas, setBrowserSubcarpetas] = useState([]);
  const [browserAtajos, setBrowserAtajos] = useState([]);
  const [browserCargando, setBrowserCargando] = useState(false);
  const [browserFiltro, setBrowserFiltro] = useState('');

  const cargarNavegadorDirectorios = async (pathSolicitado) => {
    setBrowserCargando(true);
    try {
      const url = `${LEXCONTROL_API}/listar_directorios_disco${pathSolicitado ? `?path=${encodeURIComponent(pathSolicitado)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'ok') {
        setBrowserRutaActual(data.rutaActual);
        setBrowserPadre(data.padre);
        setBrowserSubcarpetas(data.subcarpetas || []);
        setBrowserAtajos(data.atajos || []);
        setNuevaRutaCarpeta(data.rutaActual);
      }
    } catch (e) {
      console.warn("Error cargando directorios:", e);
    } finally {
      setBrowserCargando(false);
    }
  };

  const handleVincularCarpeta = async (rutaAUsar) => {
    const rutaFinal = typeof rutaAUsar === 'string' ? rutaAUsar : (nuevaRutaCarpeta || browserRutaActual);
    if (!rutaFinal || !rutaFinal.trim()) {
      alert("Por favor ingresa o selecciona la ruta de la carpeta física.");
      return;
    }
    setGuardandoCarpeta(true);
    try {
      const casoTarget = caso;
      if (!casoTarget) throw new Error("No hay expediente activo seleccionado.");

      const res = await fetch(`${LEXCONTROL_API}/vincular_carpeta_caso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: casoTarget.id || casoTarget.rit,
          rit: casoTarget.rit || casoTarget.rol,
          cliente: casoTarget.cliente,
          caratula: casoTarget.caratula,
          nuevaCarpeta: rutaFinal.trim()
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        alert(`✅ Ubicación de carpeta en disco vinculada con éxito:\n\n${data.carpetaFisica}`);
        setShowCambiarCarpeta(false);
        const expsActualizados = await cargarExpedientes().catch(() => []);
        setExpedientesServidor(expsActualizados);
        refrescarDiscoData().catch(() => {});
      } else {
        alert(`Error al vincular carpeta: ${data.error}`);
      }
    } catch (err) {
      alert(`Error al vincular carpeta: ${err.message}`);
    } finally {
      setGuardandoCarpeta(false);
    }
  };

  const handleExportarNotebookLM = async () => {
    setExportandoNotebook(true);
    try {
      const casoTarget = caso;
      const gestiones = customGestiones || (casoTarget ? casoTarget.gestiones : []);
      const res = await fetch(`${LEXCONTROL_API}/exportar_dossier_notebooklm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caso: casoTarget, gestiones })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        alert(`✅ Dossier compilado con éxito para Google NotebookLM!\n\nArchivo de origen generado: ${data.ruta}\n\nSe abrirá https://notebooklm.google.com en una nueva pestaña. Simplemente arrastra el archivo ${data.filename} para generar tu podcast en audio o análisis interactivo.`);
        window.open('https://notebooklm.google.com', '_blank');
      } else {
        alert(`Error exportando a NotebookLM: ${data.error}`);
      }
    } catch (err) {
      alert(`Error al conectar con backend local: ${err.message}`);
    } finally {
      setExportandoNotebook(false);
    }
  };


  useEffect(() => {
    if (Array.isArray(casoProp) && casoProp.length > 1) {
      setVistaModal('planilla');
    } else if (casoProp && !Array.isArray(casoProp)) {
      setVistaModal('ficha');
    }
    if (initialTab === 'gestiones') {
      setSubVistaPlanilla('gestiones');
      setActiveTab('gestiones');
    }
  }, [casoProp, initialTab]);

  const esTextoFecha = (str) => {
    if (!str) return false;
    const s = String(str).trim();
    if (s.length > 30) return false;
    if (s.toLowerCase().includes('sin vencimiento') || s.toLowerCase().includes('sin plazo') || s.toLowerCase().includes('sin fecha')) return false;
    return /\d/.test(s) && (s.includes('/') || s.includes('-') || s.includes('.'));
  };

  const obtenerVencimientoGestion = (g, casoItem) => {
    if (esTextoFecha(g.fechaVencimiento)) return g.fechaVencimiento.trim();
    if (esTextoFecha(g.fechaObjetivo)) return g.fechaObjetivo.trim();
    if (esTextoFecha(g.vencimiento)) return g.vencimiento.trim();
    if (g._isGhost) return '🚨 Inmediato (Abandono)';
    return 'Sin plazo fatal';
  };

  const todasLasGestionesConsolidadas = useMemo(() => {
    const result = [];
    listaCasos.forEach((c, cIdx) => {
      let gList = [];
      const clave = claveDeCaso(c);
      const overrideGest = clave ? localStorage.getItem(`lexcontrol_gestiones_${clave}`) : null;
      if (overrideGest) {
        try { gList = JSON.parse(overrideGest); } catch(e) {}
      } else if (c.gestiones && Array.isArray(c.gestiones)) {
        gList = c.gestiones;
      } else if (c.movimientos && Array.isArray(c.movimientos)) {
        gList = c.movimientos;
      }

      if (gList.length === 0) {
        gList = [{
          fecha: c.fechaIngreso || new Date().toLocaleDateString('es-CL'),
          tramite: c.proximaAudiencia || c.estadoPlazo || 'Ingreso de causa / En tramitación judicial',
          cuaderno: 'Principal',
          origen: c.tribunal || 'Juzgado',
          estado: c.estadoPlazo === 'URGENTE' ? 'PENDIENTE' : 'REALIZADO'
        }];
      }

      gList.forEach(g => {
        result.push({
          ...g,
          casoIdx: cIdx,
          rit: c.rit || c.id || `EXP-${cIdx+1}`,
          cliente: c.cliente || c.caratula || 'Sin denominación',
          tribunal: c.tribunal || 'Juzgado'
        });
      });
    });
    return result;
  }, [listaCasos]);

  const caso = listaCasos[idxCasoSel] || listaCasos[0] || {};

  const isDraggingRef = useRef(false);
  const startMouseRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });

  const handleMouseDownDrag = (e) => {
    if (!esModoFlotante) return;
    if (e.target.closest('button, input, select, textarea, a')) return;

    isDraggingRef.current = true;
    setIsDragging(true);
    startMouseRef.current = { x: e.clientX, y: e.clientY };
    startPosRef.current = { ...posicionFlotante };

    const handleMouseMove = (ev) => {
      if (!isDraggingRef.current) return;
      const dx = ev.clientX - startMouseRef.current.x;
      const dy = ev.clientY - startMouseRef.current.y;
      setPosicionFlotante({
        x: startPosRef.current.x + dx,
        y: startPosRef.current.y + dy
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const [linkedCases, setLinkedCases] = useState([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [searchLinkTerm, setSearchLinkTerm] = useState('');
  const [selectedMotivoNuevo, setSelectedMotivoNuevo] = useState('Acumulación Judicial de Autos (Art. 92 CPC)');

  // Estados para Taller Forense OJV
  const [tipoEscrito, setTipoEscrito] = useState('reposicion_subsidio');
  const [escritoGenerado, setEscritoGenerado] = useState(false);
  const [firmadoFEA, setFirmadoFEA] = useState(false);
  const [copiadoEscrito, setCopiadoEscrito] = useState(false);

  // Estados para Estudio de Alegatos
  const [tiempoAlegato, setTiempoAlegato] = useState('10');
  const [cronoActivo, setCronoActivo] = useState(false);
  const [segundosCrono, setSegundosCrono] = useState(600);
  const [insumosActivos, setInsumosActivos] = useState([]);
  const [cargandoInsumos, setCargandoInsumos] = useState(false);

  // Estados para Generador de Reporte WhatsApp
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppText, setWhatsAppText] = useState('');

  // Estados para Bitácora Extrajudicial
  const [bitacoraEntries, setBitacoraEntries] = useState([]);
  const [nuevaBitacora, setNuevaBitacora] = useState({ tipo: 'Reunión Presencial', descripcion: '' });

  // Resumen ejecutivo en prosa (IA local), a pedido: se genera al hacer clic,
  // no automáticamente al abrir -abrir muchos casos seguidos no debe encolar
  // llamadas al modelo local, que corre una a la vez en esta máquina-.
  const [resumenIA, setResumenIA] = useState(null);
  const [cargandoResumenIA, setCargandoResumenIA] = useState(false);

  // Estados para CRUD de Gestiones / Actuaciones (Añadir, Modificar, Eliminar)
  const [customGestiones, setCustomGestiones] = useState([]);
  const [showGestionModal, setShowGestionModal] = useState(false);
  const [editingGestionIdx, setEditingGestionIdx] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Diálogo propio -no window.confirm()- para preguntar por una gestión
  // conexa justo después de crear una: null = oculto, o los datos ya
  // calculados (tramite guardado, folio/cuaderno/origen para la siguiente).
  const [confirmarConexaInfo, setConfirmarConexaInfo] = useState(null);

  // Estado de Vigencia del Caso
  const [estadoVigencia, setEstadoVigencia] = useState(() => {
    const override = localStorage.getItem(`lexcontrol_vigencia_${caso.id || caso.rit}`);
    if (override) return override;
    const et = (caso.etapa || "").toLowerCase();
    const isTerminado = caso.estadoPlazo === 'TERMINADO' || et.includes('fallada') || et.includes('terminad') || et.includes('archiv');
    return isTerminado ? 'TERMINADO / CANCELADO' : 'VIGENTE';
  });

  // Estado de Edición de Datos Maestros de la Causa
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [overrides, setOverrides] = useState(() => {
    try {
      const stored = localStorage.getItem(`lexcontrol_overrides_${caso.id || caso.rit}`);
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return {};
  });

  useEffect(() => {
    if (!caso) return;
    const overrideV = localStorage.getItem(`lexcontrol_vigencia_${caso.id || caso.rit}`);
    if (overrideV) {
      setEstadoVigencia(overrideV);
    } else {
      const et = (caso.etapa || "").toLowerCase();
      const isTerminado = caso.estadoPlazo === 'TERMINADO' || et.includes('fallada') || et.includes('terminad') || et.includes('archiv');
      setEstadoVigencia(isTerminado ? 'TERMINADO / CANCELADO' : 'VIGENTE');
    }

    try {
      const storedO = localStorage.getItem(`lexcontrol_overrides_${caso.id || caso.rit}`);
      setOverrides(storedO ? JSON.parse(storedO) : {});
    } catch(e) {
      setOverrides({});
    }
  }, [caso]);

  // El objeto caso visible será la mezcla entre el original y los overrides
  const displayCaso = { ...caso, ...overrides };

  const handleSaveInfo = async () => {
    setIsEditingInfo(false);
    localStorage.setItem(`lexcontrol_overrides_${caso.id || caso.rit}`, JSON.stringify(overrides));
    
    try {
      const expList = await cargarExpedientes();
      const targetId = caso.id || caso.rit;
      const idx = (expList || []).findIndex(e => e.id === targetId || e.rit === targetId || e.ritVinculado === targetId);
      if (idx !== -1) {
        expList[idx] = { ...expList[idx], ...overrides };
        await guardarExpedientes(expList);
      }
    } catch (e) {
      // Vacío antes: con `guardarExpedientes` sin importar, esto lanzaba un
      // ReferenceError en CADA guardado del encabezado y se tragaba en silencio.
      // La edición quedaba SÓLO en localStorage (línea de arriba) y nunca llegaba
      // al servidor, así que "Guardar" parecía funcionar y no persistía nada.
      alert('No se pudo guardar en el servidor: ' + e.message);
    }

    window.dispatchEvent(new Event('lexcontrol_plazos_updated'));
    window.dispatchEvent(new CustomEvent('lexcontrol_expedientes_updated'));
  };

  // Diccionario de autocompletado dinámico
  const [diccionarioTramites, setDiccionarioTramites] = useState(() => {
    try {
      const stored = localStorage.getItem('lexcontrol_diccionario_tramites');
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return [
      "Acompaña documentos",
      "Delega poder",
      "Renuncia patrocinio y poder",
      "Asume patrocinio y poder",
      "Contesta demanda y opone excepciones",
      "Evacúa traslado",
      "Solicita recibimiento de causa a prueba",
      "Acompaña lista de testigos y minuta de puntos",
      "Solicita absolución de posiciones",
      "Solicita citación a oír sentencia",
      "Interpone recurso de reposición",
      "Interpone recurso de apelación",
      "Solicita liquidación de crédito y tasación de costas",
      "Solicita embargo de bienes",
      "Solicita oficio a retención bancaria",
      "Solicita certificación de ejecutoria",
      "Acompaña comprobante de pago",
      "Solicita apremios",
      "Presenta acusación particular",
      "Solicita audiencia de revisión de medidas cautelares"
    ];
  });
  const [gestionForm, setGestionForm] = useState({
    fecha: new Date().toLocaleDateString('es-CL'),
    tramite: '',
    folio: 'Folio ',
    cuaderno: 'Principal',
    origen: 'Jaime Moraga C. (Abogado)',
    estado: 'PRESENTADO'
  });

  // Cargar Bitácora
  useEffect(() => {
    if (!caso) return;
    try {
      const key = `lexcontrol_bitacora_${caso.id || caso.rit}`;
      const data = localStorage.getItem(key);
      if (data) setBitacoraEntries(JSON.parse(data));
      else setBitacoraEntries([]);
    } catch (e) {
      setBitacoraEntries([]);
    }
  }, [caso]);

  const handleGenerarReporteWhatsApp = () => {
    let ultima = "No se registran gestiones recientes.";
    if (gestionesList && gestionesList.length > 0) {
      const u = gestionesList[0];
      ultima = `${u.tramite || u.titulo} (del ${u.fecha})`;
    }
    const prox = caso.proximaAudiencia && caso.proximaAudiencia !== 'Sin audiencia programada' 
      ? caso.proximaAudiencia 
      : 'Sin hitos próximos programados.';
      
    const txt = `Estimado/a cliente,\n\nJunto con saludarle, le informamos el estado actualizado de su causa judicial caratulada "${caso.caratula}" (RIT: ${caso.rit}):\n\n📌 *Última gestión realizada:* ${ultima}\n📅 *Próxima audiencia / vencimiento:* ${prox}\n\nQuedamos a su disposición por cualquier consulta.\n\nSaludos cordiales,\nEquipo Legal.`;
    
    setWhatsAppText(txt);
    setShowWhatsAppModal(true);
  };
  
  const handleGuardarBitacora = (e) => {
    e.preventDefault();
    if (!nuevaBitacora.descripcion.trim()) return;
    const entry = {
      id: Date.now(),
      fecha: new Date().toLocaleDateString('es-CL'),
      tipo: nuevaBitacora.tipo,
      descripcion: nuevaBitacora.descripcion
    };
    const updated = [entry, ...bitacoraEntries];
    setBitacoraEntries(updated);
    localStorage.setItem(`lexcontrol_bitacora_${caso.id || caso.rit}`, JSON.stringify(updated));
    setNuevaBitacora({ ...nuevaBitacora, descripcion: '' });
  };

  useEffect(() => {
    let intv = null;
    if (cronoActivo && segundosCrono > 0) {
      intv = setInterval(() => setSegundosCrono(s => s - 1), 1000);
    } else if (segundosCrono === 0) {
      setCronoActivo(false);
    }
    return () => clearInterval(intv);
  }, [cronoActivo, segundosCrono]);

  // Cambiar cronómetro al seleccionar minutos
  useEffect(() => {
    setSegundosCrono(parseInt(tiempoAlegato, 10) * 60);
    setCronoActivo(false);
  }, [tiempoAlegato]);

  const formatearTiempo = (seg) => {
    const mins = Math.floor(seg / 60);
    const segs = seg % 60;
    return `${mins.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!caso) return;
    const dFolder = findDiscoFolder(caso);

    if (dFolder && dFolder.path) {
      setCargandoInsumos(true);
      fetch(`http://localhost:8888/insumos_carpeta?ruta=${encodeURIComponent(dFolder.path)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.status === 'ok' && data.insumos && data.insumos.length > 0) {
            setInsumosActivos(data.insumos);
          } else {
            fallbackInsumos(dFolder);
          }
        })
        .catch(err => {
          fallbackInsumos(dFolder);
        })
        .finally(() => setCargandoInsumos(false));
    } else {
      fallbackInsumos(null);
    }
  }, [caso]);

  const abrirArchivoFisico = (ruta) => {
    if (!ruta || ruta.startsWith('/portal/') || ruta.startsWith('/docs/')) {
      alert(`Simulación de previsualización web de archivo genérico: ${ruta}`);
      return;
    }
    fetch(`http://localhost:8888/abrir?ruta=${encodeURIComponent(ruta)}`)
      .then(res => res.json())
      .then(data => {
         if(data.error) alert("No se pudo abrir el archivo físico: " + data.error);
      })
      .catch(e => console.error("Error abriendo archivo", e));
  };

  const fallbackInsumos = (dFolder) => {
    const lista = [];
    if (dFolder) {
      // 1. Extraer archivos sueltos (documentosGenerales)
      if (dFolder.documentosGenerales) {
        dFolder.documentosGenerales.forEach((doc, idx) => {
          const nLow = (doc.name || '').toLowerCase();
          let cat = "Documento de Respaldo";
          let rel = "Antecedente documental en carpeta local del mandante.";
          if (nLow.includes("pdf")) cat = "Prueba Instrumental (PDF)";
          if (nLow.includes("docx") || nLow.includes("doc")) cat = "Escrito / Borrador (DOCX)";
          if (nLow.includes("xlsx") || nLow.includes("xls")) cat = "Planilla / Matriz Financiera";
          if (nLow.includes("alcoholemia") || nLow.includes("fiscalia") || nLow.includes("penal")) cat = "Evidencia Penal / Parte";

          lista.push({
            nombre: doc.name || `Doc_General_${idx+1}.pdf`,
            tamano: doc.size || "Archivo Local",
            categoria: cat,
            relevancia: rel,
            path: doc.path || `${dFolder.path}/${doc.name || 'doc.pdf'}`,
            incluido: true
          });
        });
      }

      // 2. Extraer archivos dentro de expedientes específicos (causas)
      if (dFolder.causas) {
        dFolder.causas.forEach(c => {
          // Filtramos solo la causa que coincida con el caso actual, o si no hay carátula, extraemos todas
          const cCaratula = c.caratula || '';
          const casoCaratula = caso.caratula || '';
          if (!caso.caratula || caso.caratula === '--' || casoCaratula.toLowerCase().includes(cCaratula.toLowerCase()) || cCaratula.toLowerCase().includes(casoCaratula.toLowerCase())) {
            if (c.categorias) {
              c.categorias.forEach(cat => {
                if (cat.archivos) {
                  cat.archivos.forEach((doc, idx) => {
                    const nLow = (doc.name || '').toLowerCase();
                    let catName = cat.nombre || "Expediente Judicial";
                    lista.push({
                      nombre: doc.name || `Expediente_Doc_${idx+1}.pdf`,
                      tamano: doc.size || "Archivo Local",
                      categoria: catName,
                      relevancia: `Ubicado en carpeta: ${c.folderName} / ${catName}`,
                      path: doc.path,
                      incluido: true
                    });
                  });
                }
              });
            }
          }
        });
      }
    }
    if (lista.length === 0) {
      lista.push(
        { nombre: `Expediente_Digital_PJUD_${caso.rit || 'ROL'}.pdf`, tamano: "4.2 MB", categoria: "Expediente Completo OJV", relevancia: "Copia íntegra de la causa certificada en pjud.cl.", path: "/portal/ojv/expediente.pdf", incluido: true },
        { nombre: `Contrato_Servicios_o_Mandato_${caso.cliente || 'Cliente'}.pdf`, tamano: "1.2 MB", categoria: "Escritura / Contrato", relevancia: "Instrumento basal que acredita legitimación procesal y representación.", path: "/docs/contrato.pdf", incluido: true },
        { nombre: `Documento_Prueba_Nativo.txt`, tamano: "1 KB", categoria: "Prueba Física Local", relevancia: "Archivo físico real creado en tu disco (/Descargas) para probar que el sistema puede lanzar aplicaciones de tu computador.", path: "/home/jaime/Descargas/lex-control-casos/Documento_Prueba.txt", incluido: true }
      );
    }
    setInsumosActivos(lista);
  };

  const toggleInsumo = (index) => {
    setInsumosActivos(prev => prev.map((ins, i) => i === index ? { ...ins, incluido: !ins.incluido } : ins));
  };

  const generarContenidoOJV = () => {
    const abog = "JAIME MORAGA C.";
    const trib = caso.tribunal ? caso.tribunal.toUpperCase() : "TRIBUNAL DE LEJAS";
    const car = caso.caratula || "DEMANDANTE / DEMANDADO";
    const rol = caso.rit || "C-000-2026";
    const mat = caso.materia || "JUICIO ORDINARIO";
    const cli = caso.cliente || "PARTE REPRESENTADA";
    const cont = caso.contraparte || "CONTRAPARTE";

    const insumosSeleccionados = insumosActivos.filter(i => i.incluido);
    const textoPruebaInsumos = insumosSeleccionados.length > 0 
      ? insumosSeleccionados.map((ins, idx) => `   ${idx + 1}) Instrumento singularizado como "${ins.nombre}" (${ins.tamano || 'Archivo local'}): ${ins.relevancia || 'Acredita veracidad de nuestras alegaciones procesales.'}`).join('\n')
      : "   1) Certificado de vigencia y representación judicial en carpeta electrónica;\n   2) Correo electrónico y bitácora forense de LexControl certificada.";

    if (tipoEscrito === 'reposicion_subsidio') {
      return `SUMA: EN LO PRINCIPAL: Interpone recurso de reposición con apelación en subsidio; EN EL PRIMER OTROSÍ: Acompaña documentos con citación; EN EL SEGUNDO OTROSÍ: Patrocinio y poder / Forma de notificación electrónica.

S. J. L. DE ${trib}

${abog}, abogado, por la representación de la parte (${cli}), en los autos sobre ${mat}, caratulados "${car}", ROL Nº ${rol}, a US. respetuosamente digo:

Que por el presente acto, y encontrándome dentro de plazo fatal legal (Art. 181 CPC / Art. 362 CPP), vengo en interponer recurso de reposición con apelación en subsidio en contra de la resolución dictada en autos con fecha reciente, que rechazó la solicitud de esta parte, solicitando se deje sin efecto y, en su lugar, se acceda íntegramente a lo solicitado, en base a los siguientes antecedentes de hecho y derecho:

1. AGRAVIO PROCESAL: La resolución impugnada causa un agravio irreparable a mi representada (${cli}), por cuanto omite ponderar la prueba documental obrante en la carpeta física/digital de nuestra parte, vulnerando el principio de contradictorio y el debido proceso garantizado en el Art. 19 Nº 3 de la Constitución Política de la República.
2. ANÁLISIS FORENSE DE INSUMOS DE LA CARPETA DEL CLIENTE: Que, para mejor resolver y acreditar el yerro del sentenciador, hacemos expresa remisión y acompañamos con citación los siguientes antecedentes extraídos directamente de la carpeta de custodia judicial de nuestro mandante en el sistema LexControl:
${textoPruebaInsumos}

3. FUNDAMENTACIÓN LEGAL: Conforme al Art. 181 del Código de Procedimiento Civil, la reposición procede contra autos y decretos cuando se hacen valer nuevos antecedentes o error de derecho. Asimismo, en subsidio y para el evento improbable de no acogerse la reposición, interpongo desde ya recurso de apelación (Art. 189 CPC) para ante la Iltma. Corte de Apelaciones respectiva.

POR TANTO, en mérito de lo expuesto y normas legales citadas,
RUEGO A US.: Tener por interpuesto recurso de reposición y apelación en subsidio en contra de la resolución singularizada, acogerlo en todas sus partes, y en definitiva dejarla sin efecto dictando la resolución de reemplazo que en derecho corresponda; o en su defecto, conceder el recurso de apelación para ante el tribunal de alzada.

PRIMER OTROSÍ: Ruego a US. tener por acompañados con citación legal (Art. 342 y 346 CPC) los ${insumosSeleccionados.length || 2} instrumentos y archivos digitales antes individualizados, extraídos directamente desde la carpeta de nuestro cliente (${cli}), cargándose en este acto al portal de la Oficina Judicial Virtual en formato PDF/DOCX con su respectivo código de verificación de integridad y cadena de custodia.
SEGUNDO OTROSÍ: Ruego a US. tener presente que en mi calidad de abogado habilitado para el ejercicio de la profesión, mantengo el patrocinio y poder conferido en estos autos, fijando domicilio electrónico en el sistema de tramitación OJV.`;
    } else if (tipoEscrito === 'lista_testigos') {
      return `SUMA: EN LO PRINCIPAL: Presenta lista de testigos y minuta de puntos de prueba; EN EL OTROSÍ: Acompaña minuta documental forense.

S. J. L. DE ${trib}

${abog}, abogado, por la parte (${cli}), en autos sobre ${mat}, ROL Nº ${rol}, a US. respetuosamente digo:

En cumplimiento con lo ordenado en el término probatorio y conforme a lo dispuesto en el Art. 320 del Código de Procedimiento Civil, vengo en presentar la lista de testigos que depondrán por esta parte en la audiencia testimonial respectiva:

1. DON ALBERTO ROJAS SEPÚLVEDA, cédula de identidad Nº 12.345.678-9, profesión ingeniero comercial, domiciliado en Av. Providencia 1234, Santiago.
2. DOÑA MARÍA FERNÁNDEZ GÓMEZ, cédula de identidad Nº 15.678.901-2, profesión contadora auditora, domiciliada en Calle Ahumada 312, Santiago.

MINUTA DE PUNTOS DE PRUEBA E INSUMOS DOCUMENTALES:
Los testigos antes singularizados depondrán al tenor de los hechos substanciales, pertinentes y controvertidos fijados en la resolución que recibió la causa a prueba, depurando sus dichos con el respaldo forense de la carpeta local de nuestro representado (${cli}), constituida por:
${textoPruebaInsumos}

POR TANTO, en virtud del Art. 320 y 321 del CPC,
RUEGO A US.: Tener por presentada dentro de plazo fatal legal la lista de testigos y minuta probatoria, ordenando su agregación a los autos en la Oficina Judicial Virtual.`;
    } else {
      return `SUMA: EN LO PRINCIPAL: Evacua traslado y formula alegaciones de fondo; EN EL OTROSÍ: Acompaña jurisprudencia e insumos probatorios del mandante.

S. J. L. DE ${trib}

${abog}, abogado, por la representación de la parte (${cli}), en los autos ROL Nº ${rol}, a US. respetuosamente digo:

Que por este acto vengo en evacuar el traslado conferido respecto de la presentación de la contraria (${cont}), solicitando desde ya su íntegro rechazo con expresa condenación en costas, en virtud de los siguientes fundamentos documentales:

1. IMPROCEDENCIA DE LO ALEGADO POR EL ADVERSARIO: La parte contraria intenta desnaturalizar la relación jurídica procesal invirtiendo la carga de la prueba (Art. 1698 Código Civil), omitiendo que el cumplimiento y veracidad de nuestra postura consta fehacientemente en los archivos que obran en la carpeta de nuestra representada:
${textoPruebaInsumos}
2. RIGOR PROCESAL: La jurisprudencia uniforme de la Excma. Corte Suprema ha reiterado que las alegaciones carentes de sustento documental forense como el aportado por esta parte no pueden prosperar en juicio.

POR TANTO,
RUEGO A US.: Tener por evacuado el traslado en tiempo y forma, rechazando la solicitud del adversario en todas sus partes, con costas.`;
    }
  };

  // Inicializar vínculos con detección de motivo procesal
  useEffect(() => {
    if (!caso) return;
    const primerNombreCliente = caso.cliente ? caso.cliente.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '') : '';
    
    const detectados = [...MOCK_CASOS, ...PJUD_CASOS].filter(c => {
      if (c.id === caso.id) return false;
      const sameCliente = primerNombreCliente && primerNombreCliente.length > 3 && c.cliente && c.cliente.includes(primerNombreCliente);
      const sameCaratula = caso.caratula && c.caratula && (
        c.caratula.split('/')[0].trim() === caso.caratula.split('/')[0].trim() ||
        c.caratula.split(' ')[0].trim() === caso.caratula.split(' ')[0].trim()
      ) && caso.caratula.split(' ')[0].length > 3;
      const sameRut = caso.clienteId && c.clienteId && caso.clienteId === c.clienteId && caso.clienteId !== 'cli-pjud-0';
      return sameCliente || sameCaratula || sameRut;
    }).slice(0, 8).map(c => {
      let motivo = "Identidad de Mandante / Representación Común";
      if ((c.materia && c.materia.includes("Apelaciones")) || c.tribunal.includes("C.A.") || c.tribunal.includes("Corte")) {
        motivo = "Recurso de Apelación / Alzada en Corte Superior";
      } else if (caso.caratula && c.caratula && c.caratula.split(' ')[0] === caso.caratula.split(' ')[0]) {
        motivo = "Litigio Conexo / Misma Carátula Base";
      }
      return {
        ...c,
        motivoVinculacion: motivo
      };
    });

    setLinkedCases(detectados);
  }, [caso]);

  // El servidor es la fuente de verdad. localStorage queda sólo como respaldo de
  // lo que se escribió antes de que esta pantalla guardara en el servidor: si se
  // leyera primero, una entrada vieja del navegador taparía la del servidor.
  useEffect(() => {
    if (!caso) return;
    let cancelado = false;

    const legacy = () => {
      try {
        const clave = claveDeCaso(caso);
        const saved = clave ? localStorage.getItem(`lexcontrol_gestiones_${clave}`) : null;
        const parsed = saved ? JSON.parse(saved) : null;
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
      return null;
    };

    // Se refresca junto con las gestiones -no antes, no en un efecto aparte-
    // para que la MISMA re-renderización que ya dispara setCustomGestiones()
    // muestre también la carpeta física al día: findDiscoFolder() se calcula
    // en cada render a partir de REAL_DISK_DATA, así que basta con que el
    // array esté fresco antes de ese setState.
    Promise.all([cargarExpedientes(), refrescarDiscoData().catch(() => false)])
      .then(([expedientes]) => {
        if (cancelado) return;
        setExpedientesServidor(expedientes || []);
        const exp = expedienteDeCaso(caso, expedientes);
        if (exp && Array.isArray(exp.gestiones) && exp.gestiones.length > 0) {
          setCustomGestiones(exp.gestiones);
          return;
        }
        setCustomGestiones(legacy() || caso.gestiones || []);
      })
      .catch(() => {
        if (!cancelado) setCustomGestiones(legacy() || caso.gestiones || []);
      });

    return () => { cancelado = true; };
  }, [caso]);

  const handleOpenAddGestion = () => {
    try {
      setEditingGestionIdx(null);
      // Formatear fecha actual a YYYY-MM-DD para el input type="date"
      const hoy = new Date();
      const yyyy = hoy.getFullYear();
      const mm = String(hoy.getMonth() + 1).padStart(2, '0');
      const dd = String(hoy.getDate()).padStart(2, '0');
      
      setGestionForm({
        fecha: `${yyyy}-${mm}-${dd}`,
        tramite: '',
        folio: `Folio ${(customGestiones || []).length + 1}`,
        cuaderno: 'Principal',
        origen: 'Jaime Moraga C. (Abogado)',
        estado: 'PENDIENTE (POR HACER)'
      });
      setShowGestionModal(true);
    } catch (err) {
      alert("Error UI: " + err.message);
    }
  };

  const handleConvertirSugerencia = (sug) => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');

    setEditingGestionIdx(null);
    setGestionForm({
      fecha: `${yyyy}-${mm}-${dd}`,
      folio: 'Sugerencia Automatizada',
      cuaderno: 'Principal',
      tramite: sug.accion || sug.titulo,
      origen: 'Motor Jurídico Heurístico',
      estado: sug.prioridad === 'ALTA' ? 'URGENTE' : 'PENDIENTE (POR HACER)'
    });
    setShowGestionModal(true);
  };

  const handleOpenEditGestion = (index, g) => {
    setEditingGestionIdx(index);

    // Convertir de DD/MM/YYYY a YYYY-MM-DD si es necesario
    let fechaInput = g.fecha;
    if (fechaInput && fechaInput.includes('/')) {
      const parts = fechaInput.split('/');
      if (parts.length === 3) {
        fechaInput = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    // Fecha Vencimiento/Plazo: mismo criterio. Si no es una fecha DD/MM/YYYY
    // parseable -vacío, "Sin plazo", texto libre de antes del calendario-, el
    // selector de fecha simplemente queda vacío: para esta app "sin fecha" y
    // "sin plazo" ya significan lo mismo (ver esTextoFecha/obtenerVencimientoGestion).
    let vencimientoInput = '';
    if (g.fechaVencimiento && g.fechaVencimiento.includes('/')) {
      const parts = g.fechaVencimiento.split('/');
      if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
        vencimientoInput = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }

    setGestionForm({ ...g, fecha: fechaInput, fechaVencimiento: vencimientoInput });
    setShowGestionModal(true);
  };

  const handleSaveGestionSubmit = async (e) => {
    try {
      e.preventDefault();
      if (!gestionForm.tramite.trim()) return alert("Debe ingresar la descripción de la gestión o trámite.");
      
      let updated = [...(customGestiones || [])];
      
      let fechaFinal = gestionForm.fecha;
      let fechaIso = normalizarFechaIso(fechaFinal) || hoyLocal();
      if (fechaFinal && fechaFinal.includes('-')) {
        const parts = fechaFinal.split('-');
        if (parts.length === 3) {
          fechaFinal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      // Fecha Vencimiento/Plazo: el selector de fecha entrega YYYY-MM-DD (o
      // vacío si se dejó sin marcar, que es "sin plazo"). Se guarda en el mismo
      // formato DD/MM/YYYY que el resto de las fechas de la app.
      let vencimientoFinal = gestionForm.fechaVencimiento;
      if (vencimientoFinal && vencimientoFinal.includes('-')) {
        const parts = vencimientoFinal.split('-');
        if (parts.length === 3) {
          vencimientoFinal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      // `fechaEsTramite` marca explícitamente que esta fecha la ELIGIÓ el abogado
      // en el campo "Fecha Trámite". La Bitácora, en cambio, estampa la fecha del
      // registro. El semáforo necesita distinguirlas: un trámite con fecha propia
      // vence ese día, y un pendiente de bitácora sigue pendiente hasta que se
      // marque realizado. Antes ambas cosas eran un campo `fecha` indistinguible.
      const gestionToSave = { ...gestionForm, fecha: fechaFinal, fechaVencimiento: vencimientoFinal, fechaIso, fechaEsTramite: true };

      if (editingGestionIdx !== null) {
        updated[editingGestionIdx] = gestionToSave;
      } else {
        updated.unshift(gestionToSave);
      }
      setCustomGestiones(updated);

      // Aprender nuevo trámite para el autocompletado
      const tramiteLimpio = gestionForm.tramite.trim();
      if (tramiteLimpio && !diccionarioTramites.includes(tramiteLimpio)) {
        const nuevoDiccionario = [...diccionarioTramites, tramiteLimpio];
        setDiccionarioTramites(nuevoDiccionario);
        localStorage.setItem('lexcontrol_diccionario_tramites', JSON.stringify(nuevoDiccionario));
      }

      if (caso) {
        caso.gestiones = updated;
        const clave = claveDeCaso(caso);
        if (clave) {
          try { localStorage.setItem(`lexcontrol_gestiones_${clave}`, JSON.stringify(updated)); } catch(e) {}
        }
        guardarGestionesDeCaso(caso, updated).catch(() => {});
        window.dispatchEvent(new Event('lexcontrol_plazos_updated'));
      }

      setShowGestionModal(false);

      setConfirmarConexaInfo({
        tramite: gestionToSave.tramite,
        folioSiguiente: updated.length + 1,
        cuaderno: gestionToSave.cuaderno || 'Principal',
        origen: gestionToSave.origen || 'Jaime Moraga C. (Abogado)'
      });
    } catch (err) {
      alert("Error al guardar: " + err.message);
    }
  };

  const handleConfirmarConexaSi = () => {
    const info = confirmarConexaInfo;
    if (!info) return;
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    setEditingGestionIdx(null);
    setGestionForm({
      fecha: `${yyyy}-${mm}-${dd}`,
      tramite: '',
      folio: `Folio ${info.folioSiguiente}`,
      cuaderno: info.cuaderno,
      origen: info.origen,
      estado: 'PENDIENTE'
    });
    setConfirmarConexaInfo(null);
    setShowGestionModal(true);
  };

  const handleToggleEstadoGestion = async (index) => {
    const actual = customGestiones[index];
    if (!actual) return;
    const yaRealizada = String(actual.estado || '').toUpperCase().includes('REALIZAD');
    const updated = customGestiones.map((g, i) =>
      i === index ? { ...g, estado: yaRealizada ? 'PENDIENTE' : 'REALIZADO' } : g
    );
    setCustomGestiones(updated);
    if (caso) {
      caso.gestiones = updated;
      const clave = claveDeCaso(caso);
      if (clave) {
        try { localStorage.setItem(`lexcontrol_gestiones_${clave}`, JSON.stringify(updated)); } catch(e) {}
      }
      guardarGestionesDeCaso(caso, updated).catch(() => {});
      window.dispatchEvent(new Event('lexcontrol_plazos_updated'));
    }
  };

  const handleDeleteGestion = async (index) => {
    if (!window.confirm("¿Está seguro de eliminar esta actuación o gestión del historial procesal?")) return;
    const updated = customGestiones.filter((_, idx) => idx !== index);
    setCustomGestiones(updated);
    if (caso) {
      caso.gestiones = updated;
      const clave = claveDeCaso(caso);
      if (clave) {
        try { localStorage.setItem(`lexcontrol_gestiones_${clave}`, JSON.stringify(updated)); } catch(e) {}
      }
      guardarGestionesDeCaso(caso, updated).catch(() => {});
      window.dispatchEvent(new Event('lexcontrol_plazos_updated'));
    }
  };

  if (!caso) return null;

  const isUrgente = caso.estadoPlazo === 'URGENTE';

  // 1. Generar Gestiones Históricas del Caso (Reactivo y Editable)
  let gestionesList = [...(customGestiones || [])];

  // Calcular inactividad 7 días
  let hasRecentActivity = false;
  if (gestionesList.length > 0) {
    const lastGestion = gestionesList[0];
    if (lastGestion && lastGestion.fecha) {
      const fechaPartes = lastGestion.fecha.split('/');
      if (fechaPartes.length === 3) {
        const fechaUltima = new Date(`${fechaPartes[2]}-${fechaPartes[1]}-${fechaPartes[0]}T00:00:00`);
        const hoy = new Date();
        const diffTime = Math.abs(hoy - fechaUltima);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) {
          hasRecentActivity = true;
        }
      }
    }
  }

  const vigencia = localStorage.getItem(`lexcontrol_vigencia_${caso.id || caso.rit}`);
  const etapaLower = (caso.etapa || "").toLowerCase();
  const isFinalizado = vigencia === 'TERMINADO / CANCELADO' || 
                       caso.estadoPlazo === 'TERMINADO' || 
                       etapaLower.includes('fallada') || 
                       etapaLower.includes('archiv');



  // 2. Vincular Documentos y Expediente en Disco Local (usa función centralizada)
  const discoFolder = useMemo(() => findDiscoFolder(caso, expedientesServidor), [caso, expedientesServidor]);

  const ultimaGestionPendiente = gestionesList.find(g => g.estado && (g.estado.includes('PENDIENTE') || g.estado === 'URGENTE'));

  const documentosList = [];
  if (discoFolder) {
    if (discoFolder.documentosGenerales) {
      discoFolder.documentosGenerales.forEach((doc, idx) => {
        documentosList.push({
          id: `doc-disk-${idx}`,
          nombre: doc.name || `Documento_Forense_${idx+1}.pdf`,
          tipo: "Archivo de Trabajo / Expediente Local",
          fecha: doc.fecha || doc.mtime || doc.date || "Sincronizado Disco Duro",
          tamano: doc.size || "Archivo Local",
          path: doc.path || `${discoFolder.path}/${doc.name || 'doc.pdf'}`,
          origen: "Disco Duro Local (/Casos2023)"
        });
      });
    }
    
    if (discoFolder.causas) {
      discoFolder.causas.forEach(c => {
        const cCaratula = c.caratula || '';
        const casoCaratula = caso.caratula || '';
        if (!caso.caratula || caso.caratula === '--' || casoCaratula.toLowerCase().includes(cCaratula.toLowerCase()) || cCaratula.toLowerCase().includes(casoCaratula.toLowerCase())) {
          if (c.categorias) {
            c.categorias.forEach(cat => {
              if (cat.archivos) {
                cat.archivos.forEach((doc, idx) => {
                  documentosList.push({
                    id: `doc-disk-causa-${c.folderName}-${idx}`,
                    nombre: doc.name || `Expediente_Doc_${idx+1}.pdf`,
                    tipo: cat.nombre || "Expediente Judicial",
                    fecha: doc.fecha || doc.mtime || doc.date || "Sincronizado Disco Duro",
                    tamano: doc.size || "Archivo Local",
                    path: doc.path,
                    origen: `Carpeta: ${c.folderName}`
                  });
                });
              }
            });
          }
        }
      });
    }
  }
  
  // Si el caso no tiene carpeta en el disco, la lista quedará vacía (sin documentos falsos/mock).
  
  // Agregar documentos adjuntados mediante la Bitácora Omnicanal (en el arreglo de gestiones)
  gestionesList.forEach((g, gIdx) => {
    if (g.documentos && Array.isArray(g.documentos)) {
      g.documentos.forEach((doc, idx) => {
        documentosList.push({
          id: `doc-gestion-${g.id || gIdx}-${idx}`,
          nombre: doc.nombre,
          tipo: "Adjunto a Gestión",
          fecha: g.fecha || "Desconocida",
          tamano: "Subido por Bitácora",
          path: doc.ruta,
          origen: `Gestión: ${g.tramite || 'Sin título'}`
        });
      });
    }
  });

  // 4. Motor de Inteligencia Procesal: Gestiones Legalmente Procedentes
  // 4. Motor de Inteligencia Procesal: Gestiones Legalmente Procedentes EN VIVO
  const getSugerenciasIA = () => {
    const mat = (caso.materia || "").toLowerCase();
    const trib = (caso.tribunal || "").toLowerCase();
    const sugerencias = [];
    
    // Extraer la última actuación real para anclar la sugerencia al momento procesal exacto
    const historial = customGestiones || [];
    let ultimaGestionStr = "";
    if (historial.length > 0) {
      ultimaGestionStr = (historial[0].tramite || "").toLowerCase();
    } else {
      ultimaGestionStr = (caso.etapa || "").toLowerCase();
    }

    // Lógica dinámica procesal real
    if (mat.includes("civil") || trib.includes("civil")) {
      if (ultimaGestionStr.includes("demanda") && !ultimaGestionStr.includes("contest")) {
        sugerencias.push({
          titulo: "Notificar Demanda y Resolución Recaída",
          plazoFatal: "Impulso procesal inmediato para trabar la litis y evitar abandono.",
          accion: "Coordinar con Receptor Judicial búsqueda de domicilio y efectuar notificación personal al demandado.",
          fundamento: "Art. 40 y ss. Código de Procedimiento Civil.",
          prioridad: "ALTA"
        });
      } else if (ultimaGestionStr.includes("contest") || ultimaGestionStr.includes("replica") || ultimaGestionStr.includes("duplica")) {
        sugerencias.push({
          titulo: "Solicitud de Recibimiento de Causa a Prueba",
          plazoFatal: "Trámite esencial tras evacuación de fase de discusión.",
          accion: "Solicitar al tribunal que fije los hechos sustanciales, pertinentes y controvertidos y abra el término probatorio.",
          fundamento: "Art. 318 CPC.",
          prioridad: "ALTA"
        });
      } else if (ultimaGestionStr.includes("prueba") || ultimaGestionStr.includes("testig")) {
        sugerencias.push({
          titulo: "Acompañar Lista de Testigos y Minuta de Puntos",
          plazoFatal: "Fatal: Dentro de 5 días hábiles desde notificación por estado diario de interlocutoria de prueba.",
          accion: "Ingresar nómina con individualización completa y pedir citación judicial si hay testigos hostiles.",
          fundamento: "Art. 320 CPC.",
          prioridad: "CRITICA"
        });
      } else if (ultimaGestionStr.includes("fallo") || ultimaGestionStr.includes("sentencia")) {
        sugerencias.push({
          titulo: "Interposición de Recurso de Apelación",
          plazoFatal: "Fatal: 10 días desde notificación de la sentencia definitiva.",
          accion: "Redactar agravios y presentar apelación; revisar necesidad concurrente de casación en la forma.",
          fundamento: "Art. 189 y 768 CPC.",
          prioridad: "CRITICA"
        });
      } else {
        sugerencias.push({
          titulo: "Certificación de Abandono del Procedimiento (Preventiva)",
          plazoFatal: "Alerta de impulso: Evitar inactividad procesal prolongada.",
          accion: "Revisar última foja útil. Ingresar escrito de mero trámite pidiendo dar curso progresivo a los autos.",
          fundamento: "Art. 152 CPC.",
          prioridad: "MEDIA"
        });
      }
    } 
    else if (mat.includes("penal") || mat.includes("garantía") || mat.includes("oral") || trib.includes("garantía")) {
      if (ultimaGestionStr.includes("formaliza")) {
        sugerencias.push({
          titulo: "Solicitud de Revisión de Medidas Cautelares",
          plazoFatal: "En cualquier etapa del proceso penal ante cambio de circunstancias.",
          accion: "Presentar nuevos antecedentes patrimoniales o familiares para pedir alzamiento o sustitución de prisión preventiva.",
          fundamento: "Art. 144 y 145 Código Procesal Penal.",
          prioridad: "ALTA"
        });
      } else if (ultimaGestionStr.includes("acusaci")) {
        sugerencias.push({
          titulo: "Preparación de Defensa en Audiencia de Preparación (APJO)",
          plazoFatal: "Hasta la víspera de la APJO (Audiencia de Preparación de Juicio Oral).",
          accion: "Ofrecer prueba propia, pedir exclusión de prueba fiscal por ilicitud (Art. 276 CPP) y detectar convenciones.",
          fundamento: "Art. 276 y ss. CPP.",
          prioridad: "CRITICA"
        });
      } else {
        sugerencias.push({
          titulo: "Petición de Diligencias Específicas al Fiscal",
          plazoFatal: "Durante el plazo de investigación vigente.",
          accion: "Solicitar al Ministerio Público peritajes, incautación de cámaras, tráfico de llamadas (Art. 183 CPP).",
          fundamento: "Art. 183 CPP.",
          prioridad: "ALTA"
        });
      }
    }
    else if (mat.includes("laboral") || trib.includes("trabajo")) {
      if (ultimaGestionStr.includes("contest")) {
        sugerencias.push({
          titulo: "Preparación de Evidencia para Audiencia Preparatoria",
          plazoFatal: "Fatal: Acompañar documental al menos 5 días antes de la Audiencia de Juicio.",
          accion: "Solicitar exhibición de libro de asistencia, liquidaciones de sueldo bajo apercibimiento del Art. 453 No. 5.",
          fundamento: "Art. 453 y 454 Código del Trabajo.",
          prioridad: "ALTA"
        });
      } else {
        sugerencias.push({
          titulo: "Liquidación Precisa de Recargos y Excepciones",
          plazoFatal: "Para plantear incidentalmente o en conciliación.",
          accion: "Verificar si proceden recargos legales del 30%, 50% u 80% y nulidad del despido por cotizaciones.",
          fundamento: "Art. 162 y 168 Código del Trabajo.",
          prioridad: "MEDIA"
        });
      }
    }
    else if (mat.includes("familia") || trib.includes("familia")) {
      if (ultimaGestionStr.includes("alimento")) {
        sugerencias.push({
          titulo: "Acompañar Informe Socioeconómico y Oficios AFP/SII",
          plazoFatal: "Antes o durante la Audiencia Preparatoria de Familia.",
          accion: "Acreditar real capacidad económica del alimentante mediante oficios a instituciones financieras.",
          fundamento: "Art. 54 Ley 19.968 y Ley 14.908.",
          prioridad: "ALTA"
        });
      } else {
        sugerencias.push({
          titulo: "Informe Pericial Psicológico (Habilidades Parentales)",
          plazoFatal: "Presentar antes de la audiencia de juicio.",
          accion: "En casos de cuidado personal, contactar perito particular e ingresar informe metodológico al tribunal.",
          fundamento: "Ley 19.968.",
          prioridad: "ALTA"
        });
      }
    }
    else {
      sugerencias.push({
          titulo: "Auditoría Procesal Inmediata (Lectura de Expediente)",
          plazoFatal: "Proceder Inmediatamente",
          accion: "No se registran gestiones recientes reconocidas. Es perentorio revisar en el OJV el último estado de tramitación.",
          fundamento: "Deber de diligencia profesional y control de plazos.",
          prioridad: "ALTA"
      });
    }

    return sugerencias;
  };

  const sugerenciasIA = getSugerenciasIA();

  const handleEliminarExpediente = async () => {
    const ident = displayCaso.rit || displayCaso.rol || displayCaso.cliente || 'este expediente';
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el expediente "${ident}" y todas sus gestiones?`)) {
      return;
    }
    try {
      await eliminarExpediente(caso.id || caso.rit || displayCaso.rit);
      onClose();
    } catch (e) {
      alert(`Ocurrió un error al eliminar el expediente: ${e.message}`);
    }
  };

  const generarResumenIA = async () => {
    setCargandoResumenIA(true);
    try {
      const res = await fetch(`${LEXCONTROL_API}/resumen_expediente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caso: { caratula: displayCaso.caratula, materia: displayCaso.materia, tribunal: displayCaso.tribunal },
          gestiones: gestionesList
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setResumenIA({ texto: data.texto, motor: data.motor_ia });
      } else {
        setResumenIA({ texto: data.error || 'No se pudo generar el resumen.', error: true });
      }
    } catch (e) {
      setResumenIA({ texto: `No hay respuesta del servidor local: ${e.message}`, error: true });
    } finally {
      setCargandoResumenIA(false);
    }
  };

  return (
    <div className="lex-control-modal-root">
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: esModoFlotante ? 'transparent' : 'rgba(10, 15, 29, 0.82)',
      backdropFilter: esModoFlotante ? 'none' : 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 850,
      padding: '20px',
      pointerEvents: esModoFlotante ? 'none' : 'auto'
    }}
    onClick={esModoFlotante ? undefined : onClose}
    >
      <div 
        className="glass-card animate-fade-in" 
        style={{
          width: '90vw',
          maxWidth: '1240px',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '24px 28px',
          backgroundColor: 'var(--bg-modal)',
          border: '1px solid var(--border-hover)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.75)',
          position: 'relative',
          pointerEvents: 'auto',
          transform: esModoFlotante ? `translate(${posicionFlotante.x}px, ${posicionFlotante.y}px)` : 'none',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra para arrastrar la ventana flotante */}
        {esModoFlotante && (
          <div
            onMouseDown={handleMouseDownDrag}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              marginBottom: '16px',
              marginTop: '-10px',
              background: 'rgba(74, 163, 199, 0.15)',
              borderRadius: '8px',
              border: '1px solid var(--accent-cyan)',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              color: 'var(--accent-cyan)',
              fontSize: '12px',
              fontWeight: 700
            }}
            title="Haz clic y arrastra para mover la ventana por cualquier lugar de la pantalla"
          >
            <GripHorizontal size={16} />
            <span>Mover ventana por la pantalla (arrastra aquí)</span>
          </div>
        )}
        {/* Botones de Control de la Ventana */}
        <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', gap: '8px', alignItems: 'center', zIndex: 10 }}>
          {esModoFlotante && (posicionFlotante.x !== 0 || posicionFlotante.y !== 0) && (
            <button
              onClick={() => setPosicionFlotante({ x: 0, y: 0 })}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
              title="Volver a centrar la ventana en la pantalla"
            >
              <RotateCcw size={13} />
              <span>Re-centrar</span>
            </button>
          )}
          {listaCasos.length > 1 && (
            <button
              onClick={() => setVistaModal(vistaModal === 'planilla' ? 'ficha' : 'planilla')}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: vistaModal === 'planilla' ? 'rgba(74, 163, 199, 0.2)' : 'rgba(201, 160, 70, 0.15)',
                borderColor: vistaModal === 'planilla' ? 'var(--accent-cyan)' : 'var(--accent-gold)',
                color: 'var(--text-primary)'
              }}
              title={vistaModal === 'planilla' ? "Ver Ficha Detallada" : "Volver a la Planilla Excel"}
            >
              <Table size={13} />
              <span>{vistaModal === 'planilla' ? 'Ver Ficha' : `Planilla Excel (${listaCasos.length})`}</span>
            </button>
          )}
          <button
            onClick={() => {
              const proxFlotante = !esModoFlotante;
              setEsModoFlotante(proxFlotante);
              if (!proxFlotante) setPosicionFlotante({ x: 0, y: 0 });
            }}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            title={esModoFlotante ? "Expandir a pantalla completa" : "Modo Ventana Flotante (sin ocultar el Dashboard)"}
          >
            {esModoFlotante ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
            <span>{esModoFlotante ? 'Expandir' : 'Ventana Flotante'}</span>
          </button>
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            title="Cerrar Ficha"
          >
            <X size={20} />
          </button>
        </div>

        {/* VISTA PLANILLA TIPO EXCEL */}
        {vistaModal === 'planilla' ? (
          <div style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontWeight: '700' }}>
                  <Table size={20} color="var(--accent-gold)" />
                  <span>
                    {subVistaPlanilla === 'gestiones' 
                      ? `Planilla Consolidada de Gestiones & Movimientos (${todasLasGestionesConsolidadas.length})` 
                      : `Planilla de Expedientes Solicitados (${listaCasos.length})`}
                  </span>
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                  Haz clic en cualquier fila para desplegar la Ficha del Expediente correspondiente como ventana flotante.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  type="button"
                  className={subVistaPlanilla === 'expedientes' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setSubVistaPlanilla('expedientes')}
                  style={{ padding: '6px 14px', fontSize: '0.78rem', borderRadius: '6px' }}
                >
                  📂 Expedientes ({listaCasos.length})
                </button>
                <button
                  type="button"
                  className={subVistaPlanilla === 'gestiones' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setSubVistaPlanilla('gestiones')}
                  style={{ 
                    padding: '6px 14px', 
                    fontSize: '0.78rem', 
                    borderRadius: '6px',
                    background: subVistaPlanilla === 'gestiones' ? 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))' : 'transparent',
                    color: 'var(--text-primary)'
                  }}
                >
                  📋 Planilla Gestiones ({todasLasGestionesConsolidadas.length})
                </button>
              </div>
            </div>

            {subVistaPlanilla === 'gestiones' ? (
              <div style={{
                overflowX: 'auto',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.06)', borderBottom: '1px solid var(--border-color)', color: 'var(--accent-cyan)' }}>
                      <th style={{ padding: '12px 14px', width: '40px' }}>#</th>
                      <th style={{ padding: '12px 14px', width: '130px' }}>RIT / Causa</th>
                      <th style={{ padding: '12px 14px', width: '180px' }}>Cliente / Carátula</th>
                      <th style={{ padding: '12px 14px', width: '110px' }}>Fecha Trámite</th>
                      <th style={{ padding: '12px 14px', width: '150px', color: 'var(--accent-gold)' }}>Fecha Vencimiento</th>
                      <th style={{ padding: '12px 14px', width: '120px' }}>Cuaderno / Folio</th>
                      <th style={{ padding: '12px 14px' }}>Trámite / Providencia Judicial</th>
                      <th style={{ padding: '12px 14px', width: '160px' }}>Origen / Magistratura</th>
                      <th style={{ padding: '12px 14px', width: '100px' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todasLasGestionesConsolidadas.map((g, idx) => {
                      const venc = obtenerVencimientoGestion(g, g.casoRef);
                      const esPendiente = g.estado === 'URGENTE' || (g.estado || '').includes('PENDIENTE') || g._isGhost;
                      return (
                        <tr 
                          key={idx}
                          onClick={() => {
                            setIdxCasoSel(g.casoIdx);
                            setVistaModal('ficha');
                            setActiveTab('gestiones');
                          }}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            cursor: 'pointer',
                            background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(74, 163, 199, 0.15)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}
                        >
                          <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 'bold', color: 'var(--accent-cyan)' }}>{g.rit}</td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-primary)', fontWeight: '600' }}>{g.cliente}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 'bold', color: 'var(--accent-gold)', whiteSpace: 'nowrap' }}>{g.fecha || 'Sin fecha'}</td>
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 'bold',
                              background: esPendiente ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.12)',
                              color: esPendiente ? 'var(--danger)' : 'var(--ok)',
                              border: esPendiente ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.25)'
                            }}>
                              {venc}
                            </span>
                          </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                          {g.cuaderno || 'Principal'} {g.folio ? `(${g.folio})` : ''}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-primary)', fontWeight: '600' }}>
                          {g.tramite || 'Gestión procesal'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                          {g.origen || g.tribunal || 'Juzgado'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            background: g.estado === 'REALIZADO' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                            color: g.estado === 'REALIZADO' ? 'var(--ok)' : 'var(--warning)'
                          }}>
                            {g.estado === 'REALIZADO' ? 'REALIZADO' : 'PENDIENTE'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <button 
                            className="btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.72rem', borderRadius: '4px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIdxCasoSel(g.casoIdx);
                              setVistaModal('ficha');
                              setActiveTab('gestiones');
                            }}
                          >
                            📂 Ver Ficha
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
            ) : (
              <div style={{
                overflowX: 'auto',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.06)', borderBottom: '1px solid var(--border-color)', color: 'var(--accent-gold)' }}>
                      <th style={{ padding: '12px 14px', width: '40px' }}>#</th>
                      <th style={{ padding: '12px 14px' }}>RIT / Identificador</th>
                      <th style={{ padding: '12px 14px' }}>Cliente</th>
                      <th style={{ padding: '12px 14px' }}>Carátula / Asunto</th>
                      <th style={{ padding: '12px 14px' }}>Tribunal / Vía</th>
                      <th style={{ padding: '12px 14px' }}>Estado</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaCasos.map((c, idx) => {
                      const ritId = c.rit || c.id || `EXP-${idx+1}`;
                      const cli = c.cliente || 'Sin cliente';
                      const car = c.caratula || c.asunto || 'Sin carátula';
                      const trib = c.tribunal || (c.tipo === 'extrajudicial' ? 'Extrajudicial' : 'PJUD');
                      const est = c.estadoPlazo || c.estado || 'VIGENTE';
                      return (
                        <tr 
                          key={idx}
                          onClick={() => {
                            setIdxCasoSel(idx);
                            setVistaModal('ficha');
                          }}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease',
                            background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(74, 163, 199, 0.15)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}
                        >
                          <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 'bold', color: 'var(--accent-cyan)' }}>{ritId}</td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-primary)', fontWeight: '600' }}>{cli}</td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{car}</td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{trib}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '10px',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              background: est === 'VIGENTE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: est === 'VIGENTE' ? 'var(--ok)' : 'var(--danger)'
                            }}>
                              {est}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button 
                                className="btn-primary"
                                style={{ padding: '4px 10px', fontSize: '0.72rem', borderRadius: '4px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIdxCasoSel(idx);
                                  setVistaModal('ficha');
                                }}
                              >
                                📂 Abrir Ficha
                              </button>
                              <button 
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.72rem', borderRadius: '4px', background: 'rgba(74, 163, 199, 0.15)', borderColor: 'var(--accent-cyan)', color: 'var(--text-primary)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIdxCasoSel(idx);
                                  setVistaModal('ficha');
                                  setActiveTab('gestiones');
                                }}
                              >
                                📋 Ver Gestiones
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* VISTA FICHA INDIVIDUAL */
          <div className="ficha-individual-wrapper">
            {/* Selector de Causas cuando se abrieron múltiples simultáneamente */}
            {listaCasos.length > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                marginBottom: '20px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                overflowX: 'auto',
                width: 'calc(100% - 130px)'
              }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-gold)', whiteSpace: 'nowrap' }}>
                  📂 Causas Abiertas ({listaCasos.length}):
                </span>
                {listaCasos.map((c, idx) => (
                  <button
                    key={idx}
                    onClick={() => setIdxCasoSel(idx)}
                    className={idxCasoSel === idx ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px', whiteSpace: 'nowrap' }}
                  >
                    {c.rit || c.id} — {c.cliente || c.caratula || 'Sin denominación'}
                  </button>
                ))}
              </div>
            )}

        {/* Cabecera del Caso — Estructura Completa de Ficha con 9 Campos Clave */}
        {(() => {
          const esCasoExtrajudicial = caso.materia === 'Extrajudicial' || caso.tipo === 'extrajudicial' || (displayCaso.rit && String(displayCaso.rit).startsWith('EXT'));
          return (
        <div style={{ marginBottom: '24px', paddingBottom: '18px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {/* Fila 1: ROL / RIT + RUC + Materia + Vigencia + Editar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: '800', color: esCasoExtrajudicial ? '#f59e0b' : 'var(--accent-cyan)', background: esCasoExtrajudicial ? 'rgba(245, 158, 11, 0.12)' : 'rgba(192, 160, 113, 0.1)', padding: '8px 18px', borderRadius: '8px', border: `1px solid ${esCasoExtrajudicial ? 'rgba(245, 158, 11, 0.4)' : 'rgba(192, 160, 113, 0.3)'}`, letterSpacing: '0.5px' }}>
                {esCasoExtrajudicial ? 'ROL EXTRAJUDICIAL: ' : 'ROL/RIT: '}{displayCaso.rit || displayCaso.rol || 'Sin ROL'}
              </div>
              {!esCasoExtrajudicial && (displayCaso.ruc || displayCaso.materia?.toLowerCase().includes('penal') || displayCaso.tribunal?.toLowerCase().includes('garantía')) && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#ec4899', background: 'rgba(236,72,153,0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(236,72,153,0.3)', fontWeight: '700' }}>
                  RUC: {displayCaso.ruc || 'Sin RUC'}
                </div>
              )}
              <span className={esCasoExtrajudicial ? "badge badge-gold" : "badge badge-purple"} style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
                {esCasoExtrajudicial ? '📂 EXPEDIENTE EXTRAJUDICIAL' : (caso.materia || 'Judicial')}
              </span>
              <select 
                value={estadoVigencia}
                onChange={(e) => {
                  const val = e.target.value;
                  setEstadoVigencia(val);
                  localStorage.setItem(`lexcontrol_vigencia_${caso.id || caso.rit}`, val);
                  if (val === 'TERMINADO / CANCELADO') { caso.estadoPlazo = 'TERMINADO'; } else { caso.estadoPlazo = 'VIGENTE'; }
                }}
                style={{
                  background: estadoVigencia === 'VIGENTE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(207, 95, 87, 0.15)',
                  color: estadoVigencia === 'VIGENTE' ? 'var(--ok)' : 'var(--danger)',
                  border: `1px solid ${estadoVigencia === 'VIGENTE' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(207, 95, 87, 0.4)'}`,
                  padding: '5px 12px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: '700', outline: 'none', cursor: 'pointer', fontFamily: 'inherit'
                }}
              >
                <option value="VIGENTE" style={{ background: 'var(--bg-app)', color: 'var(--ok)' }}>🟢 VIGENTE</option>
                <option value="TERMINADO / CANCELADO" style={{ background: 'var(--bg-app)', color: 'var(--danger)' }}>TERMINADA / CANCELADA</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {discoFolder && discoFolder.path && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fetch(`${LEXCONTROL_API}/abrir?ruta=${encodeURIComponent(discoFolder.path)}`).catch(console.error);
                  }}
                  className="btn-secondary"
                  style={{ padding: '6px 14px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-cyan)', border: '1px solid rgba(59, 130, 246, 0.4)' }}
                  title="Abrir la carpeta física en el disco duro local"
                >
                  <FolderOpen size={14} /> Carpeta
                </button>
              )}
              {isEditingInfo ? (
                <button onClick={handleSaveInfo} className="btn-primary" style={{ padding: '6px 14px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem' }}>
                  <CheckCircle2 size={14} /> Guardar
                </button>
              ) : (
                <button onClick={() => setIsEditingInfo(true)} className="btn-secondary" style={{ padding: '6px 14px', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Edit3 size={14} /> Editar
                </button>
              )}
              <button
                onClick={handleEliminarExpediente}
                style={{
                  padding: '6px 14px',
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  background: 'rgba(239, 68, 68, 0.18)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
                title="Eliminar este expediente permanentemente del sistema"
              >
                <Trash2 size={14} /> Eliminar Expediente
              </button>
            </div>
          </div>

          {/* Carátula principal */}
          {isEditingInfo ? (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Carátula</label>
              <input 
                type="text" 
                value={overrides.caratula !== undefined ? overrides.caratula : (caso.caratula || '')}
                onChange={(e) => setOverrides({...overrides, caratula: e.target.value})}
                className="input-field"
                style={{ width: '100%', fontSize: '1.1rem', marginTop: '4px', fontWeight: 'bold' }}
                placeholder="Ej: MORAGA / PEREZ"
              />
            </div>
          ) : (
            <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 14px 0', lineHeight: '1.3', opacity: estadoVigencia === 'VIGENTE' ? 1 : 0.6 }}>
              {esCasoExtrajudicial ? '📁' : '⚖️'} Carátula: {displayCaso.caratula || displayCaso.cliente || 'Carátula no especificada'}
            </h2>
          )}

          {/* Fila Grid: 8 Campos Restantes (ROL/RIT, RUC, Tribunal, Nº Tribunal, Ciudad, Cliente, Contraparte, Abogado Contraparte) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>
                {esCasoExtrajudicial ? 'ROL EXTRAJUDICIAL' : 'ROL / RIT'}
              </div>
              {isEditingInfo ? (
                <input type="text" className="input-field" style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem' }} value={overrides.rit !== undefined ? overrides.rit : (caso.rit || '')} onChange={(e) => setOverrides({...overrides, rit: e.target.value})} placeholder="Ej: EXT-001-2026" />
              ) : (
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: esCasoExtrajudicial ? '#f59e0b' : 'var(--accent-cyan)' }}>{displayCaso.rit || displayCaso.rol || 'N/A'}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>
                {esCasoExtrajudicial ? 'TIPO DE TRÁMITE' : 'RUC (Causas Penales)'}
              </div>
              {isEditingInfo ? (
                <input type="text" className="input-field" style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem' }} value={overrides.ruc !== undefined ? overrides.ruc : (caso.ruc || '')} onChange={(e) => setOverrides({...overrides, ruc: e.target.value})} placeholder="Ej: Asesoría Contratual" />
              ) : (
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {displayCaso.ruc || (esCasoExtrajudicial ? '💼 Asesoría / Negociación Directa' : 'Sin RUC')}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>Cliente / Patrocinado</div>
              {isEditingInfo ? (
                <input type="text" className="input-field" style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem' }} value={overrides.cliente !== undefined ? overrides.cliente : (caso.cliente || '')} onChange={(e) => setOverrides({...overrides, cliente: e.target.value})} placeholder="Nombre del cliente" />
              ) : (
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)' }}>👤 {extraerCliente(displayCaso)}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>Contraparte</div>
              {isEditingInfo ? (
                <input type="text" className="input-field" style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem' }} value={overrides.contraparte !== undefined ? overrides.contraparte : (caso.contraparte || '')} onChange={(e) => setOverrides({...overrides, contraparte: e.target.value})} placeholder="Nombre contraparte" />
              ) : (
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>👥 {displayCaso.contraparte || 'En Reserva / Directa'}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>Abogado Contraparte</div>
              {isEditingInfo ? (
                <input type="text" className="input-field" style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem' }} value={overrides.abogadoContraparte !== undefined ? overrides.abogadoContraparte : (caso.abogadoContraparte || '')} onChange={(e) => setOverrides({...overrides, abogadoContraparte: e.target.value})} placeholder="Ej: Juan Pérez L." />
              ) : (
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>⚖️ {displayCaso.abogadoContraparte || 'No registrado'}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>
                {esCasoExtrajudicial ? 'SEDE DE GESTIÓN / LUGAR' : 'Tribunal'}
              </div>
              {isEditingInfo ? (
                <input type="text" className="input-field" style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem' }} value={overrides.tribunal !== undefined ? overrides.tribunal : (caso.tribunal || '')} onChange={(e) => setOverrides({...overrides, tribunal: e.target.value})} placeholder="Ej: Notaría / Directo" />
              ) : (
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {displayCaso.tribunal || (esCasoExtrajudicial ? '📁 Tramitación Directa / Notarial' : 'Juzgado de Letras')}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>
                {esCasoExtrajudicial ? 'MODALIDAD' : 'Nº Tribunal'}
              </div>
              {isEditingInfo ? (
                <input type="text" className="input-field" style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem' }} value={overrides.numeroTribunal !== undefined ? overrides.numeroTribunal : (caso.numeroTribunal || '')} onChange={(e) => setOverrides({...overrides, numeroTribunal: e.target.value})} placeholder="Ej: 1°" />
              ) : (
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {displayCaso.numeroTribunal || (esCasoExtrajudicial ? '✍️ Asesoría Integral' : '1°')}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>Ciudad</div>
              {isEditingInfo ? (
                <input type="text" className="input-field" style={{ width: '100%', padding: '4px 8px', fontSize: '0.85rem' }} value={overrides.ciudad !== undefined ? overrides.ciudad : (caso.ciudad || extraerCiudad(caso))} onChange={(e) => setOverrides({...overrides, ciudad: e.target.value})} placeholder="Ej: Concepción" />
              ) : (
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)' }}>📍 {extraerCiudad(displayCaso)}</div>
              )}
            </div>
          </div>
        </div>
          );
        })()}

        {/* Barra de Pestañas — 4 esenciales */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '0' }}>
          {[
            { id: 'resumen', label: 'Resumen', color: 'var(--accent-cyan)' },
            { id: 'gestiones', label: `Gestiones (${gestionesList.length})`, color: 'var(--accent-purple)' },
            { id: 'documentos', label: `Documentos (${documentosList.length})`, color: 'var(--alert-green)' },
            { id: 'bitacora', label: 'Bitácora', color: '#3b82f6' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 18px',
                border: 'none',
                background: 'transparent',
                color: activeTab === tab.id ? tab.color : 'var(--text-secondary)',
                fontWeight: '700',
                fontSize: '0.85rem',
                cursor: 'pointer',
                borderBottom: activeTab === tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
                transition: 'all 0.2s',
                borderRadius: '0'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* PESTAÑA 1: RESUMEN Y TEORÍA DEL CASO - Rediseñada para ser más limpia */}
        {activeTab === 'resumen' && (
          <div className="animate-fade-in" style={{ padding: '10px 0' }}>
            {/* Resumen ejecutivo en prosa (IA local), a pedido -no opina ni sugiere
                estrategia, sólo redacta lo que ya está en la bitácora-. */}
            <div style={{
              padding: '18px 20px',
              borderRadius: '12px',
              background: 'rgba(139,92,246,0.05)',
              border: '1px solid rgba(139,92,246,0.2)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px'
            }}>
              <Sparkles size={18} color="#8b5cf6" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: '#8b5cf6', textTransform: 'uppercase', fontWeight: '700', marginBottom: '8px' }}>
                  Resumen Ejecutivo (IA)
                </div>
                {resumenIA ? (
                  <p style={{ margin: 0, fontSize: '0.88rem', color: resumenIA.error ? 'var(--danger)' : 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {resumenIA.texto}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Redacta un resumen del estado procesal a partir de las gestiones registradas.
                  </p>
                )}
              </div>
              <button
                className="btn-secondary btn-sm"
                onClick={generarResumenIA}
                disabled={cargandoResumenIA}
                style={{ flexShrink: 0 }}
              >
                {cargandoResumenIA ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                {resumenIA ? 'Redactar de nuevo' : 'Generar resumen'}
              </button>
            </div>

            {/* Layout 2 columnas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

              {/* Columna izquierda: Datos del Caso */}
              <div>
                {/* Partes */}
                <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '12px' }}>Defensa / Representación</div>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>{caso.cliente || 'Mandante en registro'}</p>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '10px 0' }}></div>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Abogado: <strong style={{ color: 'var(--text-primary)' }}>{caso.abogadoAspirante || 'Jaime Moraga C.'}</strong></span>
                </div>

                <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-purple)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '12px' }}>Contraparte</div>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>{caso.contraparte || 'Parte contraria según carátula'}</p>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '10px 0' }}></div>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Ingreso: <strong style={{ color: 'var(--text-primary)' }}>{caso.fechaIngreso || 'Ver en OJV'}</strong></span>
                </div>

                {/* Teoría del Caso */}
                {caso.resumenTeoriaCaso && (
                  <div style={{ padding: '20px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(192,160,113,0.03), rgba(125,133,144,0.03))', border: '1px solid rgba(125,133,144,0.2)' }}>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', margin: '0 0 10px 0' }}>Teoría del Caso</h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>{caso.resumenTeoriaCaso}</p>
                  </div>
                )}
              </div>

              {/* Columna derecha: Hito pendiente + Acciones rápidas */}
              <div>
                {/* Banner de Hito Procesal */}
                <div style={{
                  padding: '20px',
                  borderRadius: '12px',
                  backgroundColor: isUrgente ? 'rgba(207,95,87,0.08)' : (ultimaGestionPendiente ? 'rgba(125,133,144,0.08)' : 'rgba(201,148,70,0.08)'),
                  border: isUrgente ? '1px solid rgba(207,95,87,0.3)' : (ultimaGestionPendiente ? '1px solid rgba(125,133,144,0.3)' : '1px solid rgba(201,148,70,0.3)'),
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    {isUrgente ? <AlertTriangle size={24} color="var(--alert-red)" /> : (ultimaGestionPendiente ? <AlertCircle size={24} color="var(--accent-purple)" /> : <Clock size={24} color="var(--accent-gold)" />)}
                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: isUrgente ? 'var(--alert-red)' : (ultimaGestionPendiente ? 'var(--accent-purple)' : 'var(--accent-gold)'), textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {ultimaGestionPendiente ? 'GESTIÓN PENDIENTE' : `Hito Procesal (${caso.estadoPlazo || 'VIGENTE'})`} {caso.diasRestantes ? `— ${caso.diasRestantes} días` : ''}
                    </span>
                  </div>

                  {ultimaGestionPendiente ? (
                    <>
                      <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 6px 0', lineHeight: 1.4 }}>{ultimaGestionPendiente.tramite}</p>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Programado: <strong>{ultimaGestionPendiente.fecha}</strong> • <strong>{ultimaGestionPendiente.estado}</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      {caso.proximaAudiencia && <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 4px 0' }}>{caso.proximaAudiencia}</p>}
                      {caso.plazoDescripcion && <span style={{ fontSize: '0.85rem', color: isUrgente ? 'var(--danger)' : 'var(--text-secondary)' }}>{caso.plazoDescripcion}</span>}
                      {!caso.proximaAudiencia && !caso.plazoDescripcion && <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>Sin hitos pendientes registrados</p>}
                    </>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    {ultimaGestionPendiente && (
                      <button className="btn-primary" style={{ fontSize: '0.8rem', padding: '8px 14px', borderRadius: '8px', background: 'var(--accent-purple)' }} onClick={() => setActiveTab('gestiones')}>Ver Gestiones</button>
                    )}
                    {caso.materia !== "Extrajudicial" && (
                      <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px', borderRadius: '8px' }} onClick={() => alert("Abriendo expediente en OJV...")}>
                        Ver en OJV <ExternalLink size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Acciones rápidas (lo que antes eran pestañas) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button onClick={handleGenerarReporteWhatsApp} className="btn-secondary" style={{ padding: '12px', fontSize: '0.8rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <MessageCircle size={18} color="var(--ok)" />
                    <span>Reporte WhatsApp</span>
                  </button>
                  <button onClick={() => setActiveTab('redaccion')} className="btn-secondary" style={{ padding: '12px', fontSize: '0.8rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'rgba(192,160,113,0.06)', border: '1px solid rgba(192,160,113,0.2)' }}>
                    <Edit3 size={18} color="var(--accent-cyan)" />
                    <span>Redacción OJV (IA)</span>
                  </button>
                  <button onClick={() => setActiveTab('alegatos')} className="btn-secondary" style={{ padding: '12px', fontSize: '0.8rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <Mic size={18} color="#8b5cf6" />
                    <span>Estudio Alegatos</span>
                  </button>
                  <button
                    onClick={handleExportarNotebookLM}
                    disabled={exportandoNotebook}
                    className="btn-secondary"
                    style={{ padding: '12px', fontSize: '0.8rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#4ade80' }}
                    title="Exportar causa completa y abrir Google NotebookLM"
                  >
                    <BookOpen size={18} color="#4ade80" />
                    <span>{exportandoNotebook ? 'Exportando...' : '📓 Exportar NotebookLM'}</span>
                  </button>
                  <button onClick={() => setActiveTab('vinculadas')} className="btn-secondary" style={{ padding: '12px', fontSize: '0.8rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'rgba(201,148,70,0.06)', border: '1px solid rgba(201,148,70,0.2)' }}>
                    <Link2 size={18} color="var(--accent-gold)" />
                    <span>Causas Conexas ({linkedCases.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: GESTIONES Y ESTADO DIARIO */}
        {activeTab === 'gestiones' && (
          <div className="animate-fade-in">


            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, letterSpacing: '0.5px' }}>
                Historial de Tramitación & Movimientos OJV
              </h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModoVistaGestiones(modoVistaGestiones === 'planilla' ? 'tarjetas' : 'planilla')}
                  style={{
                    fontSize: '0.75rem',
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: modoVistaGestiones === 'planilla' ? 'rgba(74, 163, 199, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    borderColor: modoVistaGestiones === 'planilla' ? 'var(--accent-cyan)' : 'var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  title={modoVistaGestiones === 'planilla' ? "Cambiar a Vista Tarjetas" : "Cambiar a Vista Planilla Excel de Gestiones"}
                >
                  <Table size={14} />
                  <span>{modoVistaGestiones === 'planilla' ? 'Vista Tarjetas' : 'Planilla Excel Gestiones'}</span>
                </button>
                <button 
                  type="button"
                  className="btn-primary" 
                  style={{ fontSize: '0.78rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))', fontWeight: '700' }} 
                  onClick={handleOpenAddGestion}
                >
                  <PlusCircle size={15} />
                  <span>+ Nueva Actuación / Gestión</span>
                </button>
                <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '6px 12px' }} onClick={() => alert("Sincronizando últimas providencias con servidor Estado Diario PJUD...")}>
                  <span>Sincronizar en Vivo</span>
                </button>
              </div>
            </div>

            {showGestionModal && (
              <div style={{
                margin: '0 0 20px 0',
                padding: '20px',
                borderRadius: '12px',
                background: 'var(--bg-raised)',
                border: '2px solid var(--accent-purple)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                animation: 'fadeIn 0.2s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                  <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Edit3 size={18} color="var(--accent-purple)" />
                    {editingGestionIdx !== null ? "Modificar Actuación Procesal / Trámite" : "Registrar Nueva Actuación Procesal"}
                  </h4>
                  <button onClick={() => setShowGestionModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveGestionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Fecha Trámite</label>
                      <input 
                        type="date" 
                        value={gestionForm.fecha} 
                        onChange={e => setGestionForm({ ...gestionForm, fecha: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Fecha Vencimiento / Plazo</label>
                      <input
                        type="date"
                        value={gestionForm.fechaVencimiento || ''}
                        onChange={e => setGestionForm({ ...gestionForm, fechaVencimiento: e.target.value })}
                        title="Déjalo vacío si no hay plazo"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Folio / Referencia</label>
                      <input 
                        type="text" 
                        value={gestionForm.folio} 
                        onChange={e => setGestionForm({ ...gestionForm, folio: e.target.value })}
                        placeholder="Ej: Folio 55 / Escrito 4"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Cuaderno</label>
                      <select 
                        value={gestionForm.cuaderno} 
                        onChange={e => setGestionForm({ ...gestionForm, cuaderno: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      >
                        <option value="Principal">Principal</option>
                        <option value="Prueba">Prueba</option>
                        <option value="Reconvención">Reconvención</option>
                        <option value="Cautelar">Cautelar / Apremio</option>
                        <option value="Incidente">Incidente / Otro</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Estado</label>
                      <select 
                        value={gestionForm.estado} 
                        onChange={e => setGestionForm({ ...gestionForm, estado: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      >
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="EN ESPERA (RESOLUCIÓN PENDIENTE)">EN ESPERA (resolución del tribunal)</option>
                        <option value="REALIZADO">REALIZADO</option>
                      </select>
                      {gestionForm.estado === 'EN ESPERA (RESOLUCIÓN PENDIENTE)' && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                          Sin fecha de vencimiento propia: se muestra en Mi Día &amp; Plazos ordenada por antigüedad, no como plazo fatal.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Origen / Magistratura / Interviniente</label>
                    <input 
                      type="text" 
                      value={gestionForm.origen} 
                      onChange={e => setGestionForm({ ...gestionForm, origen: e.target.value })}
                      placeholder="Ej: 3º Juzgado Civil de Temuco / Jaime Moraga C. / Receptor Judicial"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Descripción Detallada del Trámite o Providencia Judicial</label>
                    <input 
                      value={gestionForm.tramite} 
                      onChange={e => {
                        setGestionForm({ ...gestionForm, tramite: e.target.value });
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Ej: Acompaña lista de testigos (Escribe para buscar sugerencias...)"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit' }}
                    />
                    
                    {showSuggestions && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'var(--bg-app)',
                        border: '1px solid var(--accent-purple)',
                        borderRadius: '6px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 100,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
                        marginTop: '4px'
                      }}>
                        {diccionarioTramites
                          .filter(t => t.toLowerCase().includes((gestionForm.tramite || "").toLowerCase()))
                          .map((t, i) => (
                            <div 
                              key={i}
                              onClick={() => {
                                setGestionForm({ ...gestionForm, tramite: t });
                                setShowSuggestions(false);
                              }}
                              style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                fontSize: '0.85rem',
                                borderBottom: '1px solid var(--border-color)',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(125, 133, 144, 0.2)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                              }}
                            >
                              {t}
                            </div>
                          ))}
                          {diccionarioTramites.filter(t => t.toLowerCase().includes((gestionForm.tramite || "").toLowerCase())).length === 0 && (
                            <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                              Presiona "Guardar" y este trámite nuevo se aprenderá automáticamente.
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      onClick={() => setShowGestionModal(false)}
                      style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      className="btn-primary" 
                      style={{ padding: '8px 20px', fontSize: '0.85rem', background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))', fontWeight: '700' }}
                    >
                      {editingGestionIdx !== null ? "Guardar Cambios" : "Incorporar Gestión al Expediente"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {modoVistaGestiones === 'planilla' ? (
              <div style={{
                overflowX: 'auto',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                marginBottom: '24px'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.06)', borderBottom: '1px solid var(--border-color)', color: 'var(--accent-cyan)' }}>
                      <th style={{ padding: '10px 12px', width: '36px' }}>#</th>
                      <th style={{ padding: '10px 12px', width: '110px' }}>Fecha Trámite</th>
                      <th style={{ padding: '10px 12px', width: '140px', color: 'var(--accent-gold)' }}>Fecha Vencimiento</th>
                      <th style={{ padding: '10px 12px', width: '120px' }}>Cuaderno / Folio</th>
                      <th style={{ padding: '10px 12px' }}>Trámite / Providencia Judicial</th>
                      <th style={{ padding: '10px 12px' }}>Origen / Magistratura</th>
                      <th style={{ padding: '10px 12px', width: '100px' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gestionesList.map((g, index) => {
                      const isGhost = g._isGhost;
                      const realIndex = isGhost ? null : (gestionesList[0]._isGhost ? index - 1 : index);
                      const venc = obtenerVencimientoGestion(g, caso);
                      const esPendiente = g.estado === 'URGENTE' || (g.estado || '').includes('PENDIENTE') || isGhost;
                      return (
                        <tr
                          key={index}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                            transition: 'background 0.15s ease',
                            cursor: realIndex !== null ? 'pointer' : 'default'
                          }}
                          onClick={() => realIndex !== null && handleOpenEditGestion(realIndex, g)}
                          title={realIndex !== null ? 'Clic para editar esta gestión' : undefined}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(74, 163, 199, 0.12)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}
                        >
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 'bold' }}>{index + 1}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 'bold', color: 'var(--accent-gold)', whiteSpace: 'nowrap' }}>{g.fecha || 'Sin fecha'}</td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 'bold',
                              background: esPendiente ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.12)',
                              color: esPendiente ? 'var(--danger)' : 'var(--ok)',
                              border: esPendiente ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.25)'
                            }}>
                              {venc}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                            {g.cuaderno || 'Principal'} {g.folio ? `(${g.folio})` : ''}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: '600' }}>
                            {g.tramite || 'Gestión procesal'}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                            {g.origen || 'Juzgado'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '10px',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              background: g.estado === 'REALIZADO' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                              color: g.estado === 'REALIZADO' ? 'var(--ok)' : 'var(--warning)'
                            }}>
                              {g.estado === 'REALIZADO' ? 'REALIZADO' : 'PENDIENTE'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              {gestionesList.map((g, index) => {
                const isGhost = g._isGhost;
                const realIndex = isGhost ? null : (gestionesList[0]._isGhost ? index - 1 : index);
                
                return (
                <div key={index} className="glass-card" style={{ 
                  padding: '20px 24px', 
                  borderRadius: '12px', 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px solid var(--border-color)',
                  borderLeft: index === 0 ? '4px solid var(--accent-cyan)' : '4px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                  boxShadow: index === 0 ? '0 8px 24px rgba(192, 160, 113, 0.08)' : '0 4px 12px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                >
                  <div style={{ flex: '1', minWidth: '250px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', background: 'rgba(192, 160, 113, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                        {g.fecha}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-primary)', background: 'rgba(255, 255, 255, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                        {g.folio}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Cuaderno: {g.cuaderno}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                      {g.tramite}
                    </p>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                      Origen / Magistratura: <strong>{g.origen}</strong>
                    </span>
                    {g.documentos && g.documentos.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {g.documentos.map((doc, docIdx) => (
                          <span key={docIdx} className="badge" style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-cyan)', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Paperclip size={12} /> {doc.nombre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="badge" style={{ 
                      background: g.estado === 'URGENTE' ? 'var(--alert-red)' : (g.estado.includes('PENDIENTE') ? 'var(--accent-gold)' : (index === 0 ? 'rgba(93, 145, 105, 0.2)' : 'rgba(255,255,255,0.05)')), 
                      color: g.estado === 'URGENTE' ? 'var(--text-primary)' : (g.estado.includes('PENDIENTE') ? 'var(--text-inverse)' : (index === 0 ? 'var(--alert-green)' : 'var(--text-secondary)')), 
                      fontWeight: '700' 
                    }}>
                      {g.estado}
                    </span>
                    {!isGhost ? (
                      <>
                        <button
                          className="btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--accent-color, #4aa3c7)', borderColor: 'rgba(74, 163, 199, 0.4)' }}
                          onClick={() => { setRedactarModalGestion(g); setShowRedactarModal(true); }}
                          title="Redactar documento en LibreOffice Writer"
                        >
                          ✍️ Redactar
                        </button>
                        <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => alert(`Abriendo PDF del ${g.folio} en visor judicial digital...`)} title="Ver Escrito">
                          <Eye size={14} />
                        </button>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--info)', borderColor: 'rgba(96, 165, 250, 0.3)' }} 
                          onClick={() => handleOpenEditGestion(realIndex, g)} 
                          title="Modificar actuación"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'rgba(248, 113, 113, 0.3)' }} 
                          onClick={() => handleDeleteGestion(realIndex)} 
                          title="Eliminar actuación"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (

                      <button 
                        className="btn-primary" 
                        style={{ padding: '6px 10px', fontSize: '0.75rem', background: 'var(--alert-red)' }} 
                        onClick={() => handleConvertirSugerencia({ titulo: "Impulso Procesal", prioridad: "ALTA", accion: "Revisar expediente e ingresar solicitud de impulso para evitar abandono." })} 
                      >
                        Resolver Auditoría
                      </button>
                    )}
                  </div>
                </div>
              )})}
            </div>
            )}
          </div>
        )}

        {/* PESTAÑA 3: DOCUMENTOS VINCULADOS */}
        {activeTab === 'documentos' && (
          <div className="animate-fade-in" style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', background: 'rgba(93, 145, 105, 0.05)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(93, 145, 105, 0.2)' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>
                  Repositorio Digital & Archivos en Disco Duro Local
                </h3>
                {discoFolder ? (
                  <span style={{ fontSize: '0.9rem', color: 'var(--alert-green)', marginTop: '4px', display: 'block' }}>
                    Sincronizado automáticamente con carpeta en disco duro: <strong>{discoFolder.path || discoFolder.folderName}</strong>
                  </span>
                ) : (
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Archivos digitales indexados del portal judicial y minutas del estudio.
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  className="btn-primary" 
                  style={{ fontSize: '0.75rem', padding: '6px 12px', background: 'var(--alert-green)' }} 
                  onClick={() => {
                    if (discoFolder && discoFolder.path) {
                      abrirArchivoFisico(discoFolder.path);
                    } else {
                      alert("No existe carpeta local vinculada a este caso.");
                    }
                  }}
                >
                  <FolderOpen size={15} />
                  <span>Abrir Carpeta Nativa Linux</span>
                </button>

                <button 
                  className="btn-secondary" 
                  style={{ fontSize: '0.75rem', padding: '6px 12px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }} 
                  onClick={() => {
                    const prox = !showCambiarCarpeta;
                    setShowCambiarCarpeta(prox);
                    if (prox) {
                      const initialPath = (discoFolder && discoFolder.path) || '/media/jaime/c11cad3b-6d38-462a-9c2e-49c33f1f6c18/Casos2023';
                      cargarNavegadorDirectorios(initialPath);
                    }
                  }}
                  title="Explorar el disco duro para elegir la carpeta física de esta causa"
                >
                  <Edit3 size={14} />
                  <span>{showCambiarCarpeta ? "Cerrar Navegador" : "📂 Cambiar Ubicación de Carpeta"}</span>
                </button>
              </div>
            </div>

            {/* NAVEGADOR VISUAL DE DISCO DURO EN TONO CLARO */}
            {showCambiarCarpeta && (
              <div className="animate-fade-in" style={{ padding: '22px', borderRadius: '16px', background: '#ffffff', border: '2px solid #0284c7', marginBottom: '24px', boxShadow: '0 12px 36px rgba(0,0,0,0.18)', color: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FolderOpen size={22} color="#0284c7" /> Explorador de Disco Duro &amp; Selección de Carpeta Destino
                  </h4>
                  <button
                    className="btn-primary"
                    style={{ padding: '9px 18px', fontSize: '0.85rem', background: '#10b981', color: '#ffffff', fontWeight: '800', borderRadius: '8px', border: 'none', boxShadow: '0 3px 10px rgba(16,185,129,0.3)', cursor: 'pointer' }}
                    onClick={() => handleVincularCarpeta(nuevaRutaCarpeta || browserRutaActual)}
                    disabled={guardandoCarpeta}
                  >
                    ✔ Vincular Carpeta Actual
                  </button>
                </div>

                {/* ATAJOS RÁPIDOS */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '800' }}>Atajos Rápidos:</span>
                  {browserAtajos.map((atajo, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => cargarNavegadorDirectorios(atajo.path)}
                      style={{
                        padding: '5px 12px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        borderRadius: '6px',
                        background: browserRutaActual === atajo.path ? '#e0f2fe' : '#f1f5f9',
                        border: '1px solid ' + (browserRutaActual === atajo.path ? '#0284c7' : '#cbd5e1'),
                        color: browserRutaActual === atajo.path ? '#0369a1' : '#334155',
                        cursor: 'pointer'
                      }}
                    >
                      📁 {atajo.nombre}
                    </button>
                  ))}
                </div>

                {/* BARRA DE RUTA CON NAVEGACIÓN PADRE Y ENTRADA MANUAL */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                  {browserPadre && (
                    <button
                      type="button"
                      onClick={() => cargarNavegadorDirectorios(browserPadre)}
                      style={{ padding: '8px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap', background: '#e2e8f0', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}
                      title="Subir a carpeta padre (..)"
                    >
                      ⬆️ Subir Nivel
                    </button>
                  )}

                  <div style={{ flex: 1, minWidth: '300px', display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 14px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', marginRight: '8px', fontWeight: '800' }}>Ruta:</span>
                    <input
                      type="text"
                      value={nuevaRutaCarpeta}
                      onChange={(e) => setNuevaRutaCarpeta(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') cargarNavegadorDirectorios(nuevaRutaCarpeta); }}
                      placeholder="/media/jaime/..."
                      style={{ flex: 1, background: 'transparent', border: 'none', color: '#0369a1', fontSize: '0.88rem', fontFamily: 'var(--font-mono)', fontWeight: '700', outline: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => cargarNavegadorDirectorios(nuevaRutaCarpeta)}
                      style={{ background: '#0284c7', border: 'none', color: '#ffffff', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700' }}
                      title="Ir a la ruta tipeada"
                    >
                      🔍 Ir
                    </button>
                  </div>
                </div>

                {/* FILTRO RÁPIDO DE SUBCARPETAS */}
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="text"
                    value={browserFiltro}
                    onChange={(e) => setBrowserFiltro(e.target.value)}
                    placeholder={`Escribe el nombre del cliente para buscar entre las ${browserSubcarpetas.length} subcarpetas...`}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.85rem', fontWeight: '600' }}
                  />
                </div>

                {/* REJILLA DE SUBCARPETAS CON NAVEGACIÓN O SELECCIÓN DIRECTA */}
                <div style={{ maxHeight: '280px', overflowY: 'auto', background: '#f8fafc', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '10px' }}>
                  {browserCargando ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.88rem', fontWeight: '600' }}>
                      ⏳ Escaneando subcarpetas de disco duro...
                    </div>
                  ) : browserSubcarpetas.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.88rem', fontWeight: '600' }}>
                      No hay más subcarpetas en este directorio.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '10px' }}>
                      {browserSubcarpetas
                        .filter(sub => !browserFiltro || sub.nombre.toLowerCase().includes(browserFiltro.toLowerCase()))
                        .map((sub, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              background: '#ffffff',
                              border: '1px solid #e2e8f0',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#e0f2fe'; e.currentTarget.style.borderColor = '#0284c7'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                          >
                            <span
                              onClick={() => cargarNavegadorDirectorios(sub.path)}
                              style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}
                              title={`Abrir subcarpeta ${sub.nombre}`}
                            >
                              📁 {sub.nombre}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleVincularCarpeta(sub.path)}
                              style={{
                                padding: '5px 10px',
                                fontSize: '0.75rem',
                                borderRadius: '6px',
                                background: '#059669',
                                border: 'none',
                                color: '#ffffff',
                                fontWeight: '800',
                                cursor: 'pointer',
                                flexShrink: 0,
                                boxShadow: '0 2px 4px rgba(5,150,105,0.2)'
                              }}
                              title={`Vincular esta causa a la carpeta ${sub.nombre}`}
                            >
                              ✔ Elegir
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {documentosList.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)', marginBottom: '24px' }}>
                <FolderOpen size={40} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
                <h4 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', margin: '0 0 8px 0' }}>No hay archivos locales indexados</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
                  Esta causa no tiene una carpeta física vinculada en el disco duro (/Casos2023) o la carpeta está vacía. 
                  Usa el navegador de arriba para vincular la carpeta correcta.
                </p>
              </div>
            ) : (
              <div style={{ maxHeight: '410px', overflowY: 'auto', overflowX: 'auto', borderRadius: '14px', border: '2px solid #cbd5e1', background: '#ffffff', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: '#f1f5f9' }}>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#1e293b' }}>
                      <th style={{ padding: '14px 18px', fontWeight: '800', fontSize: '0.85rem' }}>Documento / Nombre del Archivo</th>
                      <th style={{ padding: '14px 18px', fontWeight: '800', fontSize: '0.85rem' }}>Fecha Subido / Modificado</th>
                      <th style={{ padding: '14px 18px', fontWeight: '800', fontSize: '0.85rem' }}>Carpeta u Origen</th>
                      <th style={{ padding: '14px 18px', fontWeight: '800', fontSize: '0.85rem' }}>Tamaño</th>
                      <th style={{ padding: '14px 18px', fontWeight: '800', fontSize: '0.85rem', textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentosList.map((doc, idx) => {
                      const isPdf = doc.nombre && doc.nombre.toLowerCase().endsWith('.pdf');
                      const isWord = doc.nombre && (doc.nombre.toLowerCase().endsWith('.doc') || doc.nombre.toLowerCase().endsWith('.docx'));
                      return (
                        <tr
                          key={doc.id || idx}
                          onClick={() => abrirArchivoFisico(doc.path)}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            background: '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#e0f2fe'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}
                          title="Haz clic en cualquier parte de la fila para abrir este documento en tu sistema Linux"
                        >
                          <td style={{ padding: '14px 18px', color: '#0f172a', fontWeight: '700' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <FileText size={20} color={isPdf ? '#dc2626' : (isWord ? '#2563eb' : '#d97706')} />
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '420px' }}>
                                {doc.nombre}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '14px 18px', color: '#0f172a', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                            {doc.fecha || '—'}
                          </td>
                          <td style={{ padding: '14px 18px', color: '#475569', fontSize: '0.82rem', fontStyle: 'italic', fontWeight: '500' }}>
                            {doc.origen}
                          </td>
                          <td style={{ padding: '14px 18px', color: '#64748b', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>
                            {doc.tamano}
                          </td>
                          <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                            <button
                              type="button"
                              style={{
                                padding: '7px 14px',
                                fontSize: '0.78rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#059669',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '800',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(5,150,105,0.25)'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirArchivoFisico(doc.path);
                              }}
                              title="Abrir archivo nativo"
                            >
                              <ExternalLink size={14} color="#ffffff" />
                              <span>Abrir Nivel OS</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 4: CAUSAS CONEXAS Y RECURSOS VINCULADOS */}
        {activeTab === 'vinculadas' && (
          <div className="animate-fade-in" style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', background: 'rgba(201, 148, 70, 0.05)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(201, 148, 70, 0.2)' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>
                  Causas Conexas, Acumulaciones y Recursos ({linkedCases.length})
                </h3>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Cada vínculo procesal especifica el motivo jurídico de su conexitud. Puedes desvincular o sumar nuevos expedientes.
                </p>
              </div>

              <button 
                className="btn-gold" 
                style={{ fontSize: '0.8rem', padding: '8px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setShowLinkModal(!showLinkModal)}
              >
                <PlusCircle size={16} />
                <span>{showLinkModal ? "Cerrar Buscador" : "Vincular Otra Causa"}</span>
              </button>
            </div>

            {/* BUSCADOR MANUAL PARA VINCULAR NUEVA CAUSA */}
            {showLinkModal && (
              <div className="animate-fade-in" style={{ padding: '18px', borderRadius: '12px', background: 'rgba(201, 148, 70, 0.08)', border: '1px solid var(--accent-gold)', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Agregar Vinculación Procesal Manual</span>
                </h4>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <input 
                    type="text" 
                    placeholder="Buscar por RIT, ROL, NUC, Carátula o Cliente en los 1.557 expedientes..." 
                    value={searchLinkTerm}
                    onChange={(e) => setSearchLinkTerm(e.target.value)}
                    style={{
                      flex: '1',
                      minWidth: '260px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-body)',
                      outline: 'none'
                    }}
                  />

                  <select
                    value={selectedMotivoNuevo}
                    onChange={(e) => setSelectedMotivoNuevo(e.target.value)}
                    style={{
                      background: 'var(--bg-modal)',
                      border: '1px solid var(--accent-gold)',
                      color: 'var(--accent-gold)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      fontFamily: 'var(--font-body)',
                      outline: 'none',
                      maxWidth: '340px'
                    }}
                  >
                    <option value="Acumulación Judicial de Autos (Art. 92 CPC)">Acumulación Judicial (Art. 92 CPC)</option>
                    <option value="Recurso de Apelación / Alzada en Corte Superior">Recurso / Alzada en Corte Superior</option>
                    <option value="Litigio Conexo / Misma Carátula Base">Litigio Conexo / Misma Carátula Base</option>
                    <option value="Identidad de Mandante / Representación Común">Identidad de Mandante / Mismo Cliente</option>
                    <option value="Arista Penal / Laboral / Civil derivada">Arista Penal / Laboral / Civil derivada</option>
                    <option value="Cuaderno Separado de Medidas / Cautelares">Cuaderno Separado de Medidas / Cautelares</option>
                  </select>
                </div>

                {/* Resultados de búsqueda inline */}
                {searchLinkTerm.trim().length >= 2 && (
                  <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {[...MOCK_CASOS, ...PJUD_CASOS].filter(c => {
                      const cCaratula = c.caratula || '';
                      const cRit = c.rit || '';
                      const cCliente = c.cliente || '';
                      return c.id !== caso.id && 
                      !linkedCases.some(lc => lc.id === c.id) &&
                      (cCaratula.toLowerCase().includes(searchLinkTerm.toLowerCase()) ||
                       cRit.toLowerCase().includes(searchLinkTerm.toLowerCase()) ||
                       (cCliente.toLowerCase().includes(searchLinkTerm.toLowerCase())));
                    }).slice(0, 6).map(res => (
                      <div key={res.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.85rem', display: 'block' }}>{res.rit} • {res.caratula}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{res.tribunal} ({res.materia})</span>
                        </div>
                        <button 
                          className="btn-gold" 
                          style={{ padding: '6px 12px', fontSize: '0.75rem', flexShrink: 0 }}
                          onClick={() => {
                            setLinkedCases(prev => [{ ...res, motivoVinculacion: selectedMotivoNuevo }, ...prev]);
                            setSearchLinkTerm('');
                            setShowLinkModal(false);
                          }}
                        >
                          <span>+ Vincular Ahora</span>
                        </button>
                      </div>
                    ))}
                    {[...MOCK_CASOS, ...PJUD_CASOS].filter(c => {
                      const cCaratula = c.caratula || '';
                      const cRit = c.rit || '';
                      const cCliente = c.cliente || '';
                      return c.id !== caso.id && 
                      !linkedCases.some(lc => lc.id === c.id) &&
                      (cCaratula.toLowerCase().includes(searchLinkTerm.toLowerCase()) ||
                       cRit.toLowerCase().includes(searchLinkTerm.toLowerCase()) ||
                       (cCliente.toLowerCase().includes(searchLinkTerm.toLowerCase())));
                    }).length === 0 && (
                      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No se encontraron expedientes con ese criterio en los 1.557 casos.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {linkedCases.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', marginBottom: '16px' }}>
                <Layers size={36} color="var(--text-muted)" style={{ margin: '0 auto 10px auto' }} />
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0, fontWeight: '600' }}>
                  No hay causas vinculadas activas para este expediente.
                </p>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  Utiliza el botón <strong>"Vincular Otra Causa"</strong> arriba a la derecha para relacionar cuadernos, recursos o apelaciones en Corte.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                {linkedCases.map((cVinc) => (
                  <div 
                    key={cVinc.id}
                    className="glass-card"
                    onClick={() => {
                      if (onSelectCaso) {
                        onSelectCaso(cVinc);
                      } else {
                        alert(`Saltando a causa vinculada: ${cVinc.rit} (${cVinc.caratula})`);
                      }
                    }}
                    style={{ 
                      padding: '24px', 
                      borderRadius: '16px', 
                      background: 'rgba(255, 255, 255, 0.02)', 
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '20px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      flexWrap: 'wrap',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-gold)';
                      e.currentTarget.style.background = 'rgba(201, 148, 70, 0.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                  >
                    <div style={{ flex: '1', minWidth: '280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-primary)', background: 'linear-gradient(90deg, rgba(201, 148, 70, 0.25) 0%, rgba(125, 133, 144, 0.25) 100%)', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(201, 148, 70, 0.4)' }}>
                          {cVinc.motivoVinculacion || 'Conexitud Procesal'}
                        </span>
                        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: '800', color: 'var(--accent-gold)', background: 'rgba(201, 148, 70, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                          {cVinc.rit}
                        </span>
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>{cVinc.materia}</span>
                        <span className="badge badge-blue" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>Etapa: {cVinc.etapa}</span>
                      </div>
                      <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)', display: 'block' }}>
                        {cVinc.caratula}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                        {cVinc.tribunal} • <strong>Cliente:</strong> {cVinc.cliente}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setLinkedCases(prev => prev.filter(item => item.id !== cVinc.id));
                        }}
                        style={{ 
                          padding: '6px 12px', 
                          borderRadius: '8px', 
                          background: 'rgba(207, 95, 87, 0.1)', 
                          border: '1px solid rgba(207, 95, 87, 0.3)', 
                          color: 'var(--danger)', 
                          fontSize: '0.75rem', 
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s'
                        }}
                        title="Romper vinculación entre ambas causas"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(207, 95, 87, 0.25)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(207, 95, 87, 0.1)';
                          e.currentTarget.style.color = 'var(--danger)';
                        }}
                      >
                        <Trash2 size={14} />
                        <span>Desvincular</span>
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-gold)', fontSize: '0.85rem', fontWeight: '700' }}>
                        <span>Abrir Ficha</span>
                        <ChevronRight size={18} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 5: TALLER FORENSE DE REDACCIÓN DE ESCRITOS OJV */}
        {activeTab === 'redaccion' && (
          <div className="animate-fade-in" style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '18px 22px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(192, 160, 113, 0.1) 0%, rgba(10, 15, 29, 0.9) 100%)', border: '1px solid var(--accent-cyan)' }}>
              <div>
                <span className="badge badge-cyan" style={{ marginBottom: '6px' }}>Automatización Procesal Litigante</span>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Taller Forense de Redacción para Oficina Judicial Virtual (OJV)
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>
                  Generador estructurado con ritualidad procesal chilena: Suma, Principal, Otrosíes, patrocinio y peticiones concretas.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className="btn-gold" 
                  onClick={() => {
                    setEscritoGenerado(true);
                    setFirmadoFEA(false);
                    alert("¡Escrito generado instantáneamente por IA de LexControl bajo normativa procesal aplicable!");
                  }}
                >
                  <FileCode size={16} />
                  <span>Redactar Escrito IA</span>
                </button>
              </div>
            </div>

            <div className="grid-2" style={{ alignItems: 'flex-start', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Selector de Tipo de Escrito y Configuración */}
                <div className="glass-card" style={{ padding: '28px', borderTop: '4px solid var(--accent-gold)' }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  1. Plantilla Ritual Procesal
                </h4>

                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                  Seleccionar Escrito a Presentar en OJV:
                </label>
                <select
                  value={tipoEscrito}
                  onChange={(e) => { setTipoEscrito(e.target.value); setEscritoGenerado(true); setFirmadoFEA(false); }}
                  style={{
                    width: '100%',
                    background: 'var(--bg-modal)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-hover)',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    fontSize: '0.9rem',
                    marginBottom: '20px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="reposicion_subsidio">Reposición con Apelación en Subsidio (Art. 181 y 189 CPC)</option>
                  <option value="lista_testigos">Lista de Testigos y Minuta de Puntos de Prueba (Art. 320 CPC)</option>
                  <option value="traslado">Evacuación de Traslado / Réplica o Dúplica (Art. 311 CPC)</option>
                </select>

                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--accent-cyan)', display: 'block', marginBottom: '6px' }}>
                    Datos Inyectados desde Ficha del Caso:
                  </span>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <li><strong>Tribunal:</strong> {caso.tribunal || 'No registrado'}</li>
                    <li><strong>Carátula:</strong> {caso.caratula}</li>
                    <li><strong>ROL / RIT:</strong> <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{caso.rit}</span></li>
                    <li><strong>Representado:</strong> {caso.cliente || 'Cliente Estudio'}</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    className="btn-primary" 
                    style={{ justifyContent: 'center' }}
                    onClick={() => {
                      setFirmadoFEA(true);
                      alert("Escrito firmado digitalmente con Firma Electrónica Avanzada (FEA). Archivo .PDF / .DOCX listo para carga en pjud.cl.");
                    }}
                  >
                    <ShieldCheck size={18} />
                    <span>{firmadoFEA ? '¡Firmado FEA (Listo para OJV)!' : 'Aplicar Firma Electrónica Avanzada (FEA)'}</span>
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ justifyContent: 'center' }}
                    onClick={() => {
                      navigator.clipboard.writeText(generarContenidoOJV());
                      setCopiadoEscrito(true);
                      setTimeout(() => setCopiadoEscrito(false), 3000);
                    }}
                  >
                    <Copy size={16} color={copiadoEscrito ? 'var(--alert-green)' : 'var(--text-primary)'} />
                    <span style={{ color: copiadoEscrito ? 'var(--alert-green)' : 'var(--text-primary)' }}>
                      {copiadoEscrito ? '¡Texto Copiado al Portapapeles!' : 'Copiar Escrito Completo'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Selector de Insumos Documentales de la Carpeta del Cliente */}
              <div className="glass-card" style={{ padding: '28px', borderTop: '4px solid var(--alert-green)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    2. Insumos de la Carpeta en Disco Real
                  </h4>
                  <span className="badge badge-yellow" style={{ fontSize: '0.7rem' }}>
                    {insumosActivos.filter(i => i.incluido).length} de {insumosActivos.length} seleccionados
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>
                  Selecciona qué archivos de <strong>{caso.cliente || 'el mandante'}</strong> se inyectarán como sustento probatorio y se singularizarán en el Otrosí del escrito OJV:
                </p>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button 
                    onClick={() => setInsumosActivos(prev => prev.map(i => ({ ...i, incluido: true })))}
                    style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Marcar Todos
                  </button>
                  <button 
                    onClick={() => setInsumosActivos(prev => prev.map(i => ({ ...i, incluido: false })))}
                    style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    Desmarcar Todos
                  </button>
                </div>

                {cargandoInsumos ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>
                    Escaneando archivos en carpeta del cliente...
                  </div>
                ) : (
                  <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                    {insumosActivos.map((ins, idx) => (
                      <div
                        key={idx}
                        onClick={() => toggleInsumo(idx)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: ins.incluido ? 'rgba(201, 148, 70, 0.1)' : 'rgba(0, 0, 0, 0.4)',
                          border: ins.incluido ? '1px solid var(--accent-gold)' : '1px solid rgba(255,255,255,0.05)',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: '700', color: ins.incluido ? 'var(--text-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{ins.incluido ? '' : ''}</span>
                            <span style={{ wordBreak: 'break-all' }}>{ins.nombre}</span>
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            {ins.tamano}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: ins.incluido ? 'var(--text-secondary)' : 'var(--text-muted)', display: 'block', paddingLeft: '22px', lineHeight: 1.3 }}>
                          {ins.categoria} • <em>{ins.relevancia}</em>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Vista Previa Oficial Estilo Papel Forense */}
              <div className="glass-card" style={{ padding: '32px', background: '#070a14', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 12px 40px rgba(0,0,0,0.8)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>VISTA PREVIA RITUAL JUDICIAL</span>
                  {firmadoFEA && (
                    <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> CERTIFICADO FEA VÁLIDO
                    </span>
                  )}
                </div>

                <pre style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.82rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                  maxHeight: '440px',
                  overflowY: 'auto',
                  padding: '16px',
                  background: 'rgba(0,0,0,0.5)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  margin: 0
                }}>
                  {generarContenidoOJV()}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 6: ESTUDIO DE PREPARACIÓN DE ALEGATOS PARA CORTE Y SALA */}
        {activeTab === 'alegatos' && (
          <div className="animate-fade-in" style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '18px 22px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(125, 133, 144, 0.15) 0%, rgba(10, 15, 29, 0.9) 100%)', border: '1px solid #8b5cf6' }}>
              <div>
                <span className="badge badge-purple" style={{ marginBottom: '6px' }}>Litigación en Estrados & Alzada</span>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Estudio de Preparación de Alegatos para Corte de Apelaciones y Suprema
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>
                  Minutas de alegato estructuradas en agravios, vicios *in judicando*, normas infringidas y puntos débiles de la contraparte.
                </p>
              </div>
              
              {/* Cronómetro de Alegatos en Vivo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(0,0,0,0.5)', padding: '10px 18px', borderRadius: '12px', border: '1px solid rgba(125, 133, 144, 0.4)' }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Cronómetro Estrados</span>
                  <span style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', fontWeight: '800', color: segundosCrono < 60 ? 'var(--alert-red)' : 'var(--text-primary)' }}>
                    {formatearTiempo(segundosCrono)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '8px', background: cronoActivo ? 'rgba(207, 95, 87, 0.2)' : 'rgba(93, 145, 105, 0.2)' }}
                    onClick={() => setCronoActivo(!cronoActivo)}
                    title={cronoActivo ? "Pausar" : "Iniciar Ensayo"}
                  >
                    {cronoActivo ? <Pause size={16} color="var(--alert-red)" /> : <Play size={16} color="var(--alert-green)" />}
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '8px' }}
                    onClick={() => { setCronoActivo(false); setSegundosCrono(parseInt(tiempoAlegato, 10) * 60); }}
                    title="Reiniciar Cronómetro"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Selector de Tiempo y Tipo de Audiencia */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              {[
                { m: '5', label: '5 Minutos (Cuenta en Sala / Incidente)', desc: 'Preciso para vistas breves y recursos procesales de mero trámite.' },
                { m: '10', label: '10 Minutos (Vista Ordinaria en Corte)', desc: 'Estándar para recursos de apelación y nulidad ante Corte de Apelaciones.' },
                { m: '15', label: '15 Minutos (Excma. Corte Suprema / Juicio Fondo)', desc: 'Alegato in extenso para casación en el fondo o audiencias de juicio oral.' }
              ].map((op) => (
                <button
                  key={op.m}
                  onClick={() => setTiempoAlegato(op.m)}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    borderRadius: '12px',
                    background: tiempoAlegato === op.m ? 'rgba(125, 133, 144, 0.2)' : 'var(--bg-card)',
                    border: tiempoAlegato === op.m ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    {op.label}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3, display: 'block' }}>
                    {op.desc}
                  </span>
                </button>
              ))}
            </div>

            {/* Grid de las 4 Tarjetas Estructurales del Alegato */}
            <div className="grid-2" style={{ gap: '20px', marginBottom: '20px' }}>
              <div className="glass-card" style={{ 
                padding: '24px', 
                borderLeft: '4px solid var(--accent-cyan)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(192, 160, 113, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>
                    1. Síntesis del Fallo Recurrido & Estado Procesal
                  </span>
                  <span className="badge badge-cyan">Minuto 0:00 - 2:00</span>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                  <strong>Señorías Ilustrísimas:</strong> Comparezco por la representación de <strong>{caso.cliente || 'la parte recurrente'}</strong>, solicitando desde ya la revocación íntegra de la sentencia dictada por {caso.tribunal || 'el tribunal a quo'}, que en forma errada desestimó nuestras pretensiones al ponderar deficientemente la prueba aportada en autos.
                </p>
              </div>

              <div className="glass-card" style={{ 
                padding: '24px', 
                borderLeft: '4px solid var(--alert-red)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(207, 95, 87,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--alert-red)', textTransform: 'uppercase' }}>
                    2. Agravios Concretos y Vicios Judiciales (*In Judicando*)
                  </span>
                  <span className="badge badge-red">Minuto 2:00 - 6:00</span>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                  El agravio central radica en la <strong>infracción a las reglas de la sana crítica</strong> (lógica y máximas de la experiencia). El sentenciador omitió valorar los documentos bancarios y la pericial contable que demostraba la efectividad del cumplimiento de mi mandante, incurriendo en un manifiesto vicio de falta de fundamentación (Art. 170 Nº 4 CPC).
                </p>
              </div>

              <div className="glass-card" style={{ 
                padding: '24px', 
                borderLeft: '4px solid var(--accent-gold)',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(201, 148, 70,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--accent-gold)', textTransform: 'uppercase' }}>
                    3. Normas Chilenas Infringidas por la Sentencia
                  </span>
                  <span className="badge badge-yellow">Minuto 6:00 - 8:00</span>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                  Se ha vulnerado expresamente el <strong>Art. 1698 del Código Civil</strong> al alterar el *onus probandi*, así como los artículos 160 y 342 del Código de Procedimiento Civil al prescindir de prueba instrumental pública acompañada con citación procesal y no objetada por el adversario en el término legal.
                </p>
              </div>

              <div className="glass-card" style={{ 
                padding: '24px', 
                borderLeft: '4px solid #a78bfa',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(167,139,250,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    4. Puntos Débiles de la Contraparte ({caso.contraparte || 'Adversario'})
                  </span>
                  <span className="badge badge-purple">Minuto 8:00 - 10:00</span>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                  La contraparte basa su defensa en meras alegaciones sin sustento en la matriz probatoria. Sus dos testigos principales cayeron en manifiestas contradicciones sobre las fechas de ejecución, y no aportaron ningún correo electrónico ni orden de trabajo que desacredite la bitácora registral de LexControl.
                </p>
              </div>
            </div>

            {/* Botón de Exportación de Minuta */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button 
                className="btn-secondary" 
                onClick={() => alert("Simulación: Cronómetro reseteado para nuevo ensayo de estrados frente a espejo / Zoom.")}
              >
                <RotateCcw size={16} />
                <span>Reiniciar Cronómetro</span>
              </button>
              <button 
                className="btn-primary"
                style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', borderColor: 'var(--text-secondary)' }}
                onClick={() => alert("¡Minuta de Alegato Exportada en PDF y enviada a la tablet/móvil del abogado litigante para la audiencia!")}
              >
                <Printer size={16} />
                <span>Exportar Minuta de Alegato para Sala (.PDF)</span>
              </button>
            </div>
          </div>
        )}

        {/* Pie y Acción Rápida a Matriz Probatoria */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', padding: '16px 20px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', marginTop: '20px' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '700' }}>
              Control de Licitud Probatoria & Cadena de Custodia
            </span>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem' }}>Total Evidencia: <strong style={{ color: 'var(--text-primary)', fontSize: '1.05rem' }}>{caso.estadisticasPrueba ? caso.estadisticasPrueba.total : 10}</strong></span>
              <span style={{ fontSize: '0.85rem' }}>Admitida Lícita: <strong style={{ color: 'var(--alert-green)', fontSize: '1.05rem' }}>{caso.estadisticasPrueba ? caso.estadisticasPrueba.admitidas : 10}</strong></span>
              <span style={{ fontSize: '0.85rem' }}>Impugnada/Cuestionada: <strong style={{ color: 'var(--alert-red)', fontSize: '1.05rem' }}>{caso.estadisticasPrueba ? caso.estadisticasPrueba.impugnadas : 0}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={onClose}>
              Cerrar Ficha
            </button>
            <button 
              className="btn-gold" 
              onClick={() => {
                onClose();
                onOpenMatriz(caso);
              }}
            >
              <Scale size={16} />
              <span>Abrir Matriz Probatoria</span>
            </button>
          </div>
        </div>

        {/* PESTAÑA BITÁCORA EXTRAJUDICIAL */}
        {activeTab === 'bitacora' && (
          <div className="animate-fade-in" style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              
              {/* Formulario Nueva Entrada */}
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PlusCircle size={18} color="var(--accent-cyan)" />
                    Nuevo Hito Extrajudicial
                  </h3>
                  <form onSubmit={handleGuardarBitacora}>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Tipo de Contacto</label>
                      <select 
                        value={nuevaBitacora.tipo}
                        onChange={e => setNuevaBitacora({...nuevaBitacora, tipo: e.target.value})}
                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', padding: '10px', borderRadius: '8px', outline: 'none' }}
                      >
                        <option value="Reunión Presencial">🤝 Reunión Presencial</option>
                        <option value="Llamada Telefónica">📞 Llamada Telefónica</option>
                        <option value="Mensaje WhatsApp">💬 Mensaje WhatsApp</option>
                        <option value="Correo Electrónico">📧 Correo Electrónico</option>
                        <option value="Gestión en Terreno">🚶‍♂️ Gestión en Terreno</option>
                        <option value="Peritaje / Informe">📑 Peritaje / Informe Privado</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Descripción del Hito</label>
                      <textarea
                        value={nuevaBitacora.descripcion}
                        onChange={e => setNuevaBitacora({...nuevaBitacora, descripcion: e.target.value})}
                        placeholder="Ej: El cliente aportó nuevos correos electrónicos impresos..."
                        rows={4}
                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', padding: '10px', borderRadius: '8px', outline: 'none', resize: 'vertical' }}
                      />
                    </div>
                    <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                      Guardar en Bitácora
                    </button>
                  </form>
                </div>
              </div>

              {/* Línea de Tiempo */}
              <div style={{ flex: '2 1 400px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={18} color="var(--accent-cyan)" />
                  Registro Histórico Interno
                </h3>
                
                {bitacoraEntries.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <BookOpen size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
                    <p>No hay registros extrajudiciales en esta causa.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '16px', top: '10px', bottom: '10px', width: '2px', background: 'rgba(255,255,255,0.1)' }} />
                    {bitacoraEntries.map((b, idx) => (
                      <div key={b.id} style={{ display: 'flex', gap: '16px', position: 'relative' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--bg-modal)', border: '2px solid var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                          <CheckCircle2 size={16} color="var(--accent-cyan)" />
                        </div>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>{b.tipo}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.fecha}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {b.descripcion}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      </div>
    </div>

    {/* MODAL GENERADOR WHATSAPP */}
    {showWhatsAppModal && (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div className="animate-fade-in" style={{
          background: 'var(--bg-modal)', width: '100%', maxWidth: '500px',
          borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageCircle color="#4ade80" /> Reporte de Cliente
            </h3>
            <button onClick={() => setShowWhatsAppModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
          </div>
          
          <div style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
            <textarea 
              value={whatsAppText}
              onChange={e => setWhatsAppText(e.target.value)}
              style={{ width: '100%', height: '200px', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.5, resize: 'none', outline: 'none' }}
            ></textarea>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn-secondary" 
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                navigator.clipboard.writeText(whatsAppText);
                alert("Texto copiado al portapapeles.");
              }}
            >
              <Copy size={16} /> Copiar Texto
            </button>
            <button 
              className="btn-primary" 
              style={{ flex: 1, justifyContent: 'center', background: 'var(--ok)', borderColor: 'var(--ok)', color: 'var(--text-primary)' }}
              onClick={() => {
                window.open(`https://wa.me/?text=${encodeURIComponent(whatsAppText)}`, '_blank');
              }}
            >
              <MessageSquare size={16} /> Enviar WhatsApp
            </button>
          </div>
        </div>
      </div>
    )}

    {/* DIÁLOGO GESTIÓN CONEXA -flotante, sin telón oscuro: no tapa el fondo */}
    {confirmarConexaInfo && (
      <div
        className="animate-fade-in"
        style={{
          position: 'fixed', right: '24px', bottom: '24px', zIndex: 99999,
          width: 'min(380px, calc(100vw - 48px))',
          background: 'var(--bg-modal)', border: '1px solid var(--border-color)',
          borderRadius: '16px', padding: '20px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Link2 size={20} color="var(--accent-purple)" />
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Gestión conexa</h3>
        </div>
        <p style={{ margin: '0 0 4px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Se guardó la gestión <strong style={{ color: 'var(--text-primary)' }}>"{confirmarConexaInfo.tramite}"</strong>.
        </p>
        <p style={{ margin: '0 0 20px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          ¿Deseas agregar una gestión conexa a este expediente?
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => setConfirmarConexaInfo(null)}
          >
            No, gracias
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1, justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))' }}
            onClick={handleConfirmarConexaSi}
          >
            <PlusCircle size={16} /> Sí, agregar
          </button>
        </div>
      </div>
    )}

      <ModalRedactarDocumento
        isOpen={showRedactarModal}
        onClose={() => setShowRedactarModal(false)}
        gestion={redactarModalGestion}
        caso={caso}
      />
    </div>
  );
}

