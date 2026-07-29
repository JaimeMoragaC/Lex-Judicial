import React, { useState, useEffect } from 'react';
import { 
  X, 
  Scale, 
  User, 
  Calendar, 
  FileText, 
  ShieldCheck, 
  AlertTriangle,
  AlertCircle, 
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
  BookOpen
} from 'lucide-react';
import { REAL_DISK_DATA } from '../realDiskData';
import { findDiscoFolder } from '../utils/folderMatcher';
import { MOCK_CASOS } from '../mockData';

export default function CasoDetailModal({ caso, onClose, onOpenMatriz, onSelectCaso }) {
  const [activeTab, setActiveTab] = useState('resumen');
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

  // Estados para CRUD de Gestiones / Actuaciones (Añadir, Modificar, Eliminar)
  const [customGestiones, setCustomGestiones] = useState([]);
  const [showGestionModal, setShowGestionModal] = useState(false);
  const [editingGestionIdx, setEditingGestionIdx] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Estado de Vigencia del Caso
  const [estadoVigencia, setEstadoVigencia] = useState(() => {
    const override = localStorage.getItem(`lexcontrol_vigencia_${caso.id || caso.rit}`);
    if (override) return override;
    const et = (caso.etapa || "").toLowerCase();
    const isTerminado = caso.estadoPlazo === 'TERMINADO' || et.includes('fallada') || et.includes('terminad') || et.includes('archiv');
    return isTerminado ? 'TERMINADO / CANCELADO' : 'VIGENTE';
  });

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
    
    const detectados = MOCK_CASOS.filter(c => {
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

  useEffect(() => {
    if (!caso) return;
    const storageKey = `lexcontrol_gestiones_${caso.id || caso.rit}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCustomGestiones(parsed);
          return;
        }
      } catch (e) {}
    }
    const defaultList = caso.gestiones && caso.gestiones.length > 0 ? caso.gestiones : (
      caso.id === 'caso-temuco-1869' || (caso.rit && caso.rit.includes('1869')) ? [
        { fecha: "26/07/2026", tramite: "Certificación de cumplimiento probatorio y citación a 2º llamado confesional", folio: "Folio 52", cuaderno: "Principal", origen: "3º Juzgado Civil de Temuco", estado: "RESUELTO" },
        { fecha: "10/07/2026", tramite: "Audiencia telemática Zoom - Exhibición y ratificación de comprobantes de pago MACH y Servipag", folio: "Folio 48", cuaderno: "Prueba", origen: "Receptor Judicial / Tribunal", estado: "REALIZADA" },
        { fecha: "15/06/2026", tramite: "Escrito de Defensa y Demanda Reconvencional por infracción Art. 24 Nº3 Ley 18.101 (No entrega de recibos)", folio: "Folio 24", cuaderno: "Reconvención", origen: "Jaime Moraga C.", estado: "PROVEIDO" },
        { fecha: "06/05/2026", tramite: "Pago íntegro de renta de abril ($690.000) vía MACH previa notificación judicial", folio: "Anexo 1", cuaderno: "Comprobantes", origen: "Servipag / MACH", estado: "ACREDITADO" },
        { fecha: "24/04/2026", tramite: "Ingreso de Demanda Principal por terminación de contrato de arriendo y emplazamiento", folio: "Folio 1", cuaderno: "Principal", origen: "Parte Actora", estado: "NOTIFICADO" }
      ] : [
        { fecha: "Última Actuación", tramite: `Estado Procesal en ${caso.tribunal}: ${caso.etapa}`, folio: "Último Folio", cuaderno: "Principal", origen: "PJUD Estado Diario", estado: caso.estadoPlazo === "TERMINADO" ? "FALLADO / ARCHIVADO" : "EN TRAMITE" },
        { fecha: "Gestión Intermedia", tramite: `Providencia judicial / Tramitación ordinaria de la causa en ${caso.materia}`, folio: "Folio en curso", cuaderno: "Principal", origen: caso.tribunal, estado: "PROVEIDO" },
        { fecha: caso.fechaIngreso || "Fecha de Ingreso", tramite: `Ingreso de demanda / querella a distribución procesal ROL ${caso.rit}`, folio: "Folio 1", cuaderno: "Principal", origen: "Corte / Distribución", estado: "INGRESADO" }
      ]
    );
    setCustomGestiones(defaultList);
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
    
    setGestionForm({ ...g, fecha: fechaInput });
    setShowGestionModal(true);
  };

  const handleSaveGestionSubmit = (e) => {
    try {
      e.preventDefault();
      if (!gestionForm.tramite.trim()) return alert("Debe ingresar la descripción de la gestión o trámite.");
      
      let updated = [...(customGestiones || [])];
      
      // Convertir fecha de YYYY-MM-DD a DD/MM/YYYY para almacenamiento coherente
      let fechaFinal = gestionForm.fecha;
      if (fechaFinal && fechaFinal.includes('-')) {
        const parts = fechaFinal.split('-');
        if (parts.length === 3) {
          fechaFinal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      const gestionToSave = { ...gestionForm, fecha: fechaFinal };

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
        localStorage.setItem(`lexcontrol_gestiones_${caso.id || caso.rit}`, JSON.stringify(updated));
      }
      setShowGestionModal(false);
    } catch (err) {
      alert("Error al guardar: " + err.message);
    }
  };

  const handleDeleteGestion = (index) => {
    if (!window.confirm("¿Está seguro de eliminar esta actuación o gestión del historial procesal?")) return;
    const updated = customGestiones.filter((_, idx) => idx !== index);
    setCustomGestiones(updated);
    if (caso) {
      caso.gestiones = updated;
      localStorage.setItem(`lexcontrol_gestiones_${caso.id || caso.rit}`, JSON.stringify(updated));
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

  if (!hasRecentActivity && !isFinalizado && caso.materia !== "Extrajudicial") {
    gestionesList.unshift({
      _isGhost: true,
      tramite: "AUDITORÍA PROCESAL: Expediente sin movimientos registrados en más de 7 días. Requiere impulso para evitar abandono.",
      estado: 'URGENTE',
      fecha: new Date().toLocaleDateString('es-CL'),
      folio: '-',
      cuaderno: 'Todos',
      origen: 'Alerta Automática de Sistema'
    });
  }

  // 2. Vincular Documentos y Expediente en Disco Local (usa función centralizada)
  const discoFolder = findDiscoFolder(caso);

  const ultimaGestionPendiente = gestionesList.find(g => g.estado && (g.estado.includes('PENDIENTE') || g.estado === 'URGENTE'));

  const documentosList = [];
  if (discoFolder) {
    if (discoFolder.documentosGenerales) {
      discoFolder.documentosGenerales.forEach((doc, idx) => {
        documentosList.push({
          id: `doc-disk-${idx}`,
          nombre: doc.name || `Documento_Forense_${idx+1}.pdf`,
          tipo: "Archivo de Trabajo / Expediente Local",
          fecha: "Sincronizado Disco Duro",
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
                    fecha: "Sincronizado Disco Duro",
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

  return (
    <div className="lex-control-modal-root">
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 15, 29, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }}
    onClick={onClose}
    >
      <div 
        className="glass-card animate-fade-in" 
        style={{
          width: '100%',
          maxWidth: '940px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '32px',
          backgroundColor: 'var(--bg-modal)',
          border: '1px solid var(--border-hover)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón Cerrar */}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '24px',
            right: '24px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 10
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
        >
          <X size={20} />
        </button>

        {/* Cabecera del Caso - Rediseñada para mayor legibilidad y aire */}
        <div style={{ marginBottom: '28px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {/* Fila 1: Metadatos y Badges */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: '800', color: 'var(--accent-cyan)', background: 'rgba(0, 240, 255, 0.1)', padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(0, 240, 255, 0.3)', letterSpacing: '0.5px' }}>
                {caso.rit}
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)', padding: '6px 0' }}>
                NUC: {caso.nuc || 'No registrado'}
              </span>
              <span className="badge badge-purple" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>{caso.materia}</span>
              <span className="badge badge-blue" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Etapa: {caso.etapa}</span>
            </div>
            
            {/* Controles: WhatsApp y Vigencia */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button 
                onClick={handleGenerarReporteWhatsApp}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.3)', color: '#4ade80' }}
              >
                <MessageCircle size={16} />
                <span>Reporte Cliente</span>
              </button>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Estado:</span>
              <select 
                value={estadoVigencia}
                onChange={(e) => {
                  const val = e.target.value;
                  setEstadoVigencia(val);
                  localStorage.setItem(`lexcontrol_vigencia_${caso.id || caso.rit}`, val);
                  if (val === 'TERMINADO / CANCELADO') {
                    caso.estadoPlazo = 'TERMINADO';
                  } else {
                    caso.estadoPlazo = 'VIGENTE';
                  }
                }}
                style={{
                  background: estadoVigencia === 'VIGENTE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: estadoVigencia === 'VIGENTE' ? '#4ade80' : '#f87171',
                  border: `1px solid ${estadoVigencia === 'VIGENTE' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                  padding: '6px 14px',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                <option value="VIGENTE" style={{ background: '#0f172a', color: '#4ade80' }}>🟢 VIGENTE</option>
                <option value="TERMINADO / CANCELADO" style={{ background: '#0f172a', color: '#f87171' }}>TERMINADA / CANCELADA</option>
              </select>
            </div>
          </div>

          </div>
          {/* Fila 2: Título Principal (Carátula) */}
          <h2 style={{ fontSize: '1.8rem', color: '#fff', marginBottom: '12px', lineHeight: '1.3', opacity: estadoVigencia === 'VIGENTE' ? 1 : 0.6, letterSpacing: '-0.5px' }}>
            {caso.caratula}
          </h2>

          {/* Fila 3: Tribunal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.95rem', background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderRadius: '8px', display: 'inline-flex' }}>
            <span style={{ fontSize: '1.1rem' }}></span>
            <strong>Tribunal / Magistratura:</strong> 
            <span style={{ color: '#e2e8f0' }}>{caso.tribunal}</span>
          </div>
        </div>

        {/* Barra de Pestañas de la Ficha */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('resumen')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'resumen' ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
              color: activeTab === 'resumen' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'resumen' ? '2px solid var(--accent-cyan)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <span>Resumen & Teoría ({caso.estadisticasPrueba ? caso.estadisticasPrueba.total : 10} Pruebas)</span>
          </button>

          <button
            onClick={() => setActiveTab('gestiones')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'gestiones' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              color: activeTab === 'gestiones' ? 'var(--accent-purple)' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'gestiones' ? '2px solid var(--accent-purple)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <span>Gestiones & Estado Diario ({gestionesList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('documentos')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'documentos' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              color: activeTab === 'documentos' ? 'var(--alert-green)' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'documentos' ? '2px solid var(--alert-green)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <span>Documentos ({documentosList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('vinculadas')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'vinculadas' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
              color: activeTab === 'vinculadas' ? 'var(--accent-gold)' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'vinculadas' ? '2px solid var(--accent-gold)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <span>Causas Conexas / Recursos ({linkedCases.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('redaccion')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'redaccion' ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
              color: activeTab === 'redaccion' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'redaccion' ? '2px solid var(--accent-cyan)' : 'none',
              transition: 'all 0.2s',
              boxShadow: activeTab === 'redaccion' ? 'var(--shadow-glow-cyan)' : 'none'
            }}
          >
            <Edit3 size={16} />
            <span>Redacción OJV (IA)</span>
          </button>

          <button
            onClick={() => setActiveTab('alegatos')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'alegatos' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              color: activeTab === 'alegatos' ? '#c4b5fd' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'alegatos' ? '2px solid #8b5cf6' : 'none',
              transition: 'all 0.2s',
              boxShadow: activeTab === 'alegatos' ? '0 0 20px rgba(139, 92, 246, 0.3)' : 'none'
            }}
          >
            <span>Estudio de Alegatos</span>
          </button>
          
          <button
            onClick={() => setActiveTab('bitacora')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'bitacora' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: activeTab === 'bitacora' ? '#60a5fa' : 'var(--text-secondary)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'bitacora' ? '2px solid #3b82f6' : 'none',
              transition: 'all 0.2s',
              boxShadow: activeTab === 'bitacora' ? '0 0 20px rgba(59, 130, 246, 0.3)' : 'none'
            }}
          >
            <BookOpen size={16} />
            <span>Bitácora Extrajudicial</span>
          </button>
        </div>

        {/* PESTAÑA 1: RESUMEN Y TEORÍA DEL CASO - Rediseñada para ser más limpia */}
        {activeTab === 'resumen' && (
          <div className="animate-fade-in" style={{ padding: '10px 0' }}>
            
            {/* Banner de Hito Procesal y Última Gestión Pendiente */}
            <div style={{
              padding: '24px 28px',
              borderRadius: '16px',
              backgroundColor: isUrgente ? 'rgba(239, 68, 68, 0.08)' : (ultimaGestionPendiente ? 'rgba(139, 92, 246, 0.08)' : 'rgba(245, 158, 11, 0.08)'),
              border: isUrgente ? '1px solid rgba(239, 68, 68, 0.3)' : (ultimaGestionPendiente ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'),
              marginBottom: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '20px',
              boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {isUrgente ? <AlertTriangle size={32} color="var(--alert-red)" /> : (ultimaGestionPendiente ? <AlertCircle size={32} color="var(--accent-purple)" /> : <Clock size={32} color="var(--accent-gold)" />)}
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: isUrgente ? 'var(--alert-red)' : (ultimaGestionPendiente ? 'var(--accent-purple)' : 'var(--accent-gold)'), textTransform: 'uppercase', display: 'block', marginBottom: '4px', letterSpacing: '0.5px' }}>
                    {ultimaGestionPendiente ? 'GESTIÓN PENDIENTE PRIORITARIA' : `Próximo Hito Procesal (${caso.estadoPlazo})`} {caso.diasRestantes ? `- ${caso.diasRestantes} días restantes` : ''}
                  </span>
                  
                  {ultimaGestionPendiente ? (
                    <>
                      <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#fff', margin: '0 0 6px 0', lineHeight: 1.4 }}>
                        {ultimaGestionPendiente.tramite}
                      </p>
                      <span style={{ fontSize: '0.9rem', color: '#cbd5e1', opacity: 0.9 }}>
                        Programado para: <strong>{ultimaGestionPendiente.fecha}</strong> • Estado: <strong>{ultimaGestionPendiente.estado}</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#fff', margin: '0 0 6px 0', lineHeight: 1.4 }}>
                        {caso.proximaAudiencia || 'Consultar en Estado Diario / Tramitación'}
                      </p>
                      <span style={{ fontSize: '0.9rem', color: isUrgente ? '#fca5a5' : '#fde68a', opacity: 0.9 }}>
                        {caso.plazoDescripcion || 'Monitorear plazos en OJV.'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {ultimaGestionPendiente && (
                  <button className="btn-primary" style={{ fontSize: '0.9rem', padding: '10px 20px', borderRadius: '8px', background: 'var(--accent-purple)' }} onClick={() => setActiveTab('gestiones')}>
                    <span>Ver Gestiones</span>
                  </button>
                )}
                {caso.materia !== "Extrajudicial" && (
                  <button className="btn-secondary" style={{ fontSize: '0.9rem', padding: '10px 20px', borderRadius: '8px' }} onClick={() => alert("Simulación: Abriendo expediente en el portal del Poder Judicial.")}>
                    <span>Ver en Portal Judicial</span>
                    <ExternalLink size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Grid de Partes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
              <div style={{ padding: '24px', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', letterSpacing: '0.5px' }}>
                  Defensa / Representación
                </span>
                <p style={{ fontSize: '1.15rem', fontWeight: '600', color: '#fff', margin: '0 0 12px 0' }}>
                  {caso.cliente || 'Mandante en registro'}
                </p>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '12px 0' }}></div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block' }}>
                  Abogado Litigante a Cargo:<br/>
                  <strong style={{ color: '#e2e8f0', fontSize: '0.95rem', marginTop: '4px', display: 'block' }}>{caso.abogadoAspirante || 'Jaime Moraga C.'}</strong>
                </span>
              </div>

              <div style={{ padding: '24px', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-purple)', textTransform: 'uppercase', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', letterSpacing: '0.5px' }}>
                  Contraparte & Intervinientes
                </span>
                <p style={{ fontSize: '1.15rem', fontWeight: '600', color: '#fff', margin: '0 0 12px 0' }}>
                  {caso.contraparte || 'Parte contraria según carátula'}
                </p>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '12px 0' }}></div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block' }}>
                  Fecha Ingreso Judicial:<br/>
                  <strong style={{ color: '#e2e8f0', fontSize: '0.95rem', marginTop: '4px', display: 'block' }}>{caso.fechaIngreso || 'Ver en OJV'}</strong>
                </span>
              </div>
            </div>

            {/* Teoría del Caso */}
            <div style={{ 
              padding: '28px', 
              borderRadius: '16px', 
              background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.03) 0%, rgba(139, 92, 246, 0.03) 100%)', 
              border: '1px solid rgba(139, 92, 246, 0.2)',
              marginBottom: '16px'
            }}>
              <h3 style={{ fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', letterSpacing: '0.5px' }}>
                Teoría del Caso & Estrategia Litigante
              </h3>
              <p style={{ fontSize: '1rem', color: '#cbd5e1', margin: 0, lineHeight: 1.7, fontWeight: '400' }}>
                {caso.resumenTeoriaCaso || 'Expediente bajo monitoreo procesal activo por parte del estudio legal.'}
              </p>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: GESTIONES Y ESTADO DIARIO */}
        {activeTab === 'gestiones' && (
          <div className="animate-fade-in">
            {/* SECCIÓN DE SUGERENCIAS LEGALES DE INTELIGENCIA ARTIFICIAL */}
            {caso.materia !== 'Extrajudicial' && (
              <div style={{ 
              padding: '28px', 
              borderRadius: '16px', 
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(0, 240, 255, 0.08) 100%)', 
              border: '1px solid var(--accent-purple)', 
              marginBottom: '32px',
              boxShadow: '0 10px 30px -5px rgba(139, 92, 246, 0.25)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800' }}>
                  <span style={{ fontSize: '1.25rem' }}></span>
                  <span>Sugerencias de Estrategia Procesal (Motor Heurístico Local) ({sugerenciasIA.length})</span>
                </h4>
                <span className="badge badge-purple" style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'rgba(139, 92, 246, 0.25)', border: '1px solid var(--accent-purple)' }}>
                  Procedimiento: {caso.materia}
                </span>
              </div>

              <p style={{ fontSize: '0.88rem', color: '#cbd5e1', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                Evaluando la competencia y el estado actual (<strong>{caso.etapa}</strong> en <strong>{caso.tribunal}</strong>), el motor jurídico forense recomienda impulsar las siguientes gestiones conforme al código procesal aplicable:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sugerenciasIA.map((sug, idx) => (
                  <div key={idx} style={{ 
                    padding: '20px 24px', 
                    borderRadius: '14px', 
                    background: 'rgba(0, 0, 0, 0.5)', 
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '20px',
                    flexWrap: 'wrap',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}>
                    <div style={{ flex: '1', minWidth: '280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ 
                          fontSize: '0.72rem', 
                          fontWeight: '800', 
                          color: sug.prioridad === 'ALTA' ? '#ef4444' : '#f59e0b',
                          background: sug.prioridad === 'ALTA' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          padding: '3px 8px', 
                          borderRadius: '6px',
                          border: sug.prioridad === 'ALTA' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)'
                        }}>
                          PRIORIDAD {sug.prioridad}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>
                          {sug.fundamento}
                        </span>
                      </div>
                      
                      <strong style={{ fontSize: '1rem', color: '#fff', display: 'block', marginBottom: '6px' }}>
                        {sug.titulo}
                      </strong>
                      
                      <p style={{ fontSize: '0.88rem', color: '#e2e8f0', margin: '0 0 6px 0', lineHeight: 1.4 }}>
                        <strong>Acción Litigante:</strong> {sug.accion}
                      </p>
                      
                      <span style={{ fontSize: '0.8rem', color: '#fca5a5', fontWeight: '700', display: 'block', background: 'rgba(239, 68, 68, 0.08)', padding: '4px 8px', borderRadius: '6px', width: 'fit-content', marginTop: '4px' }}>
                        {sug.plazoFatal}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignSelf: 'center' }}>
                      <button 
                        className="btn-primary" 
                        style={{ padding: '8px 14px', fontSize: '0.78rem', background: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => handleConvertirSugerencia(sug)}
                      >
                        <span>Añadir como Gestión Pendiente</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', margin: 0, letterSpacing: '0.5px' }}>
                Historial de Tramitación & Movimientos OJV
              </h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                background: 'rgba(15, 23, 42, 0.98)',
                border: '2px solid var(--accent-purple)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
                animation: 'fadeIn 0.2s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                  <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Edit3 size={18} color="var(--accent-purple)" />
                    {editingGestionIdx !== null ? "Modificar Actuación Procesal / Trámite" : "Registrar Nueva Actuación Procesal"}
                  </h4>
                  <button onClick={() => setShowGestionModal(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}>
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
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Folio / Referencia</label>
                      <input 
                        type="text" 
                        value={gestionForm.folio} 
                        onChange={e => setGestionForm({ ...gestionForm, folio: e.target.value })}
                        placeholder="Ej: Folio 55 / Escrito 4"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Cuaderno</label>
                      <select 
                        value={gestionForm.cuaderno} 
                        onChange={e => setGestionForm({ ...gestionForm, cuaderno: e.target.value })}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
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
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
                      >
                        <option value="PENDIENTE (POR HACER)">PENDIENTE (POR HACER)</option>
                        <option value="URGENTE">URGENTE</option>
                        <option value="PRESENTADO">PRESENTADO</option>
                        <option value="PROVEIDO">PROVEIDO</option>
                        <option value="RESUELTO">RESUELTO</option>
                        <option value="EN TRAMITE">EN TRAMITE</option>
                        <option value="REALIZADA">REALIZADA</option>
                        <option value="NOTIFICADO">NOTIFICADO</option>
                        <option value="ACREDITADO">ACREDITADO</option>
                        <option value="RECHAZADO">RECHAZADO</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Origen / Magistratura / Interviniente</label>
                    <input 
                      type="text" 
                      value={gestionForm.origen} 
                      onChange={e => setGestionForm({ ...gestionForm, origen: e.target.value })}
                      placeholder="Ej: 3º Juzgado Civil de Temuco / Jaime Moraga C. / Receptor Judicial"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.85rem' }}
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
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem', fontFamily: 'inherit' }}
                    />
                    
                    {showSuggestions && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: '#0f172a',
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
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
                                e.currentTarget.style.color = '#fff';
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
                  boxShadow: index === 0 ? '0 8px 24px rgba(0, 240, 255, 0.08)' : '0 4px 12px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                >
                  <div style={{ flex: '1', minWidth: '250px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', background: 'rgba(0, 240, 255, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                        {g.fecha}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#fff', background: 'rgba(255, 255, 255, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                        {g.folio}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Cuaderno: {g.cuaderno}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.95rem', fontWeight: '600', color: '#e2e8f0', margin: 0 }}>
                      {g.tramite}
                    </p>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                      Origen / Magistratura: <strong>{g.origen}</strong>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="badge" style={{ 
                      background: g.estado === 'URGENTE' ? 'var(--alert-red)' : (g.estado.includes('PENDIENTE') ? 'var(--accent-gold)' : (index === 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)')), 
                      color: g.estado === 'URGENTE' ? '#fff' : (g.estado.includes('PENDIENTE') ? '#000' : (index === 0 ? 'var(--alert-green)' : 'var(--text-secondary)')), 
                      fontWeight: '700' 
                    }}>
                      {g.estado}
                    </span>
                    {!isGhost ? (
                      <>
                        <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => alert(`Abriendo PDF del ${g.folio} en visor judicial digital...`)} title="Ver Escrito">
                          <Eye size={14} />
                        </button>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 10px', fontSize: '0.75rem', color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.3)' }} 
                          onClick={() => handleOpenEditGestion(realIndex, g)} 
                          title="Modificar actuación"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 10px', fontSize: '0.75rem', color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.3)' }} 
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
          </div>
        )}

        {/* PESTAÑA 3: DOCUMENTOS VINCULADOS */}
        {activeTab === 'documentos' && (
          <div className="animate-fade-in" style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', background: 'rgba(16, 185, 129, 0.05)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>
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
              <button 
                className="btn-primary" 
                style={{ fontSize: '0.75rem', padding: '6px 12px', background: 'var(--alert-green)' }} 
                onClick={() => {
                  if (discoFolder && discoFolder.path) {
                    abrirArchivoFisico(discoFolder.path);
                  } else {
                    alert("No existe carpeta local vinculada a este caso en /Casos2023.");
                  }
                }}
              >
                <FolderOpen size={15} />
                <span>Abrir Carpeta Nativa Linux</span>
              </button>
            </div>

            {documentosList.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)', marginBottom: '24px' }}>
                <FolderOpen size={40} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
                <h4 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 8px 0' }}>No hay archivos locales indexados</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
                  Esta causa no tiene una carpeta física vinculada en el disco duro (/Casos2023) o la carpeta está vacía. 
                  El sistema busca automáticamente coincidencias exactas o nombres de clientes/contrapartes.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {documentosList.map((doc) => (
                  <div key={doc.id} className="glass-card" style={{ 
                    padding: '20px', 
                    borderRadius: '14px', 
                    background: 'rgba(255, 255, 255, 0.02)', 
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                      <div style={{ padding: '10px', borderRadius: '10px', background: doc.nombre && doc.nombre.endsWith('.pdf') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', flexShrink: 0 }}>
                        <FileText size={22} color={doc.nombre && doc.nombre.endsWith('.pdf') ? '#ef4444' : '#3b82f6'} />
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#fff', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {doc.nombre}
                        </span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                            {doc.tipo}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            • {doc.tamano}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px', fontStyle: 'italic' }}>
                          {doc.origen}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-secondary" style={{ padding: '8px', borderRadius: '8px' }} title="Previsualizar Archivo" onClick={() => abrirArchivoFisico(doc.path)}>
                        <Eye size={16} />
                      </button>
                      <button className="btn-secondary" style={{ padding: '8px', borderRadius: '8px' }} title="Descargar al equipo" onClick={() => abrirArchivoFisico(doc.path)}>
                        <Download size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 4: CAUSAS CONEXAS Y RECURSOS VINCULADOS */}
        {activeTab === 'vinculadas' && (
          <div className="animate-fade-in" style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', background: 'rgba(245, 158, 11, 0.05)', padding: '24px', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>
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
              <div className="animate-fade-in" style={{ padding: '18px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid var(--accent-gold)', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#fff', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                      color: '#fff',
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
                    {MOCK_CASOS.filter(c => {
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
                          <strong style={{ color: '#fff', fontSize: '0.85rem', display: 'block' }}>{res.rit} • {res.caratula}</strong>
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
                    {MOCK_CASOS.filter(c => {
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
                      e.currentTarget.style.background = 'rgba(245, 158, 11, 0.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                  >
                    <div style={{ flex: '1', minWidth: '280px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#fff', background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%)', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                          {cVinc.motivoVinculacion || 'Conexitud Procesal'}
                        </span>
                        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: '800', color: 'var(--accent-gold)', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                          {cVinc.rit}
                        </span>
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>{cVinc.materia}</span>
                        <span className="badge badge-blue" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>Etapa: {cVinc.etapa}</span>
                      </div>
                      <span style={{ fontSize: '1rem', fontWeight: '700', color: '#fff', display: 'block' }}>
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
                          background: 'rgba(239, 68, 68, 0.1)', 
                          border: '1px solid rgba(239, 68, 68, 0.3)', 
                          color: '#ef4444', 
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
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          e.currentTarget.style.color = '#ef4444';
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '18px 22px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.1) 0%, rgba(10, 15, 29, 0.9) 100%)', border: '1px solid var(--accent-cyan)' }}>
              <div>
                <span className="badge badge-cyan" style={{ marginBottom: '6px' }}>Automatización Procesal Litigante</span>
                <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                <h4 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    color: '#fff',
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
                    <li><strong>ROL / RIT:</strong> <span style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{caso.rit}</span></li>
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
                    <Copy size={16} color={copiadoEscrito ? 'var(--alert-green)' : '#fff'} />
                    <span style={{ color: copiadoEscrito ? 'var(--alert-green)' : '#fff' }}>
                      {copiadoEscrito ? '¡Texto Copiado al Portapapeles!' : 'Copiar Escrito Completo'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Selector de Insumos Documentales de la Carpeta del Cliente */}
              <div className="glass-card" style={{ padding: '28px', borderTop: '4px solid var(--alert-green)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-color)', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
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
                          background: ins.incluido ? 'rgba(245, 158, 11, 0.1)' : 'rgba(0, 0, 0, 0.4)',
                          border: ins.incluido ? '1px solid var(--accent-gold)' : '1px solid rgba(255,255,255,0.05)',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: '700', color: ins.incluido ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  color: '#e2e8f0',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '18px 22px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(10, 15, 29, 0.9) 100%)', border: '1px solid #8b5cf6' }}>
              <div>
                <span className="badge badge-purple" style={{ marginBottom: '6px' }}>Litigación en Estrados & Alzada</span>
                <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Estudio de Preparación de Alegatos para Corte de Apelaciones y Suprema
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, marginTop: '4px' }}>
                  Minutas de alegato estructuradas en agravios, vicios *in judicando*, normas infringidas y puntos débiles de la contraparte.
                </p>
              </div>
              
              {/* Cronómetro de Alegatos en Vivo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(0,0,0,0.5)', padding: '10px 18px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.4)' }}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Cronómetro Estrados</span>
                  <span style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', fontWeight: '800', color: segundosCrono < 60 ? 'var(--alert-red)' : '#fff' }}>
                    {formatearTiempo(segundosCrono)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '8px', background: cronoActivo ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)' }}
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
                    background: tiempoAlegato === op.m ? 'rgba(139, 92, 246, 0.2)' : 'var(--bg-card)',
                    border: tiempoAlegato === op.m ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#fff', display: 'block', marginBottom: '4px' }}>
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
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,240,255,0.1)'; }}
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
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(239,68,68,0.1)'; }}
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
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(245,158,11,0.1)'; }}
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
                  <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#c4b5fd', textTransform: 'uppercase' }}>
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
                style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', borderColor: '#a78bfa' }}
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
              <span style={{ fontSize: '0.85rem' }}>Total Evidencia: <strong style={{ color: '#fff', fontSize: '1.05rem' }}>{caso.estadisticasPrueba ? caso.estadisticasPrueba.total : 10}</strong></span>
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
                  <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PlusCircle size={18} color="var(--accent-cyan)" />
                    Nuevo Hito Extrajudicial
                  </h3>
                  <form onSubmit={handleGuardarBitacora}>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Tipo de Contacto</label>
                      <select 
                        value={nuevaBitacora.tipo}
                        onChange={e => setNuevaBitacora({...nuevaBitacora, tipo: e.target.value})}
                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px', borderRadius: '8px', outline: 'none' }}
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
                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px', borderRadius: '8px', outline: 'none', resize: 'vertical' }}
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
                <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff' }}>{b.tipo}</span>
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
            <h3 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageCircle color="#4ade80" /> Reporte de Cliente
            </h3>
            <button onClick={() => setShowWhatsAppModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
          </div>
          
          <div style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
            <textarea 
              value={whatsAppText}
              onChange={e => setWhatsAppText(e.target.value)}
              style={{ width: '100%', height: '200px', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.9rem', lineHeight: 1.5, resize: 'none', outline: 'none' }}
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
              style={{ flex: 1, justifyContent: 'center', background: '#25D366', borderColor: '#25D366', color: '#fff' }}
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
    </div>
  );
}
