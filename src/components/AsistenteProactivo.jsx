import React, { useState, useRef } from 'react';
import { 
  Zap, 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Send, 
  Gavel, 
  ShieldAlert, 
  Clock, 
  ArrowRight, 
  Cpu, 
  ExternalLink,
  Sparkles,
  FileCheck2,
  Calendar,
  MapPin,
  UserCheck
} from 'lucide-react';
import { MOCK_CASOS, integrarExpedienteIA } from '../mockData';
import { PJUD_CASOS } from '../pjudCausesData';

export default function AsistenteProactivo({ onSelectCaso }) {
  const fileInputRef = useRef(null);
  const [activeSubTab, setActiveSubTab] = useState('ingesta'); // ingesta, escritos, radar
  const [ingestaRealizada, setIngestaRealizada] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analizadoData, setAnalizadoData] = useState(null);
  const [selectedCasoId, setSelectedCasoId] = useState('caso-temuco-1869');
  const [selectedTemplate, setSelectedTemplate] = useState('enervacion');
  const [copiado, setCopiado] = useState(false);

  const subirYAnalizarArchivo = (file) => {
    if (!file) return;
    setIsAnalyzing(true);
    
    const formData = new FormData();
    formData.append("file", file, file.name);

    fetch("http://localhost:8888/analizar_documento", {
      method: "POST",
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        setIsAnalyzing(false);
        if (data.status === "ok") {
          setAnalizadoData(data);
          setIngestaRealizada(true);
          integrarExpedienteIA(data); // ⚡ Integración automática a causas activas
          
          if (data.ruta_guardado) {
            alert(`✅ Archivo guardado inteligentemente en:\n${data.ruta_guardado}`);
          }
        } else {
          alert("Aviso de análisis: " + (data.error || "No se pudo extraer el texto del PDF."));
        }
      })
      .catch(err => {
        setIsAnalyzing(false);
        alert("⚠️ No se pudo conectar al servidor local en puerto 8888.");
      });
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      subirYAnalizarArchivo(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      subirYAnalizarArchivo(e.target.files[0]);
    }
  };

  const casoSeleccionado = [...MOCK_CASOS, ...PJUD_CASOS].find(c => c.id === selectedCasoId) || [...MOCK_CASOS, ...PJUD_CASOS][0];

  // Generador de textos legales adaptados a la realidad chilena
  const generarEscrito = () => {
    const isTemuco = casoSeleccionado.id === 'caso-temuco-1869';

    if (selectedTemplate === 'enervacion') {
      return `EN LO PRINCIPAL: CONTESTA DEMANDA DE TERMINACIÓN DE CONTRATO DE ARRENDAMIENTO, OPONE EXCEPCIÓN DE PAGO Y ENERVACIÓN DE LA ACCIÓN. PRIMER OTROSÍ: ACOMPAÑA DOCUMENTOS CON CITACIÓN. SEGUNDO OTROSÍ: TENGA PRESENTE.

S. J. L. EN LO CIVIL DE TEMUCO (3º) [ROL C-1869-2026]

JAIME MARCELO MORAGA CARRASCO, abogado, actuando por sí y en su calidad de demandado en autos sobre juicio especial de arrendamiento caratulados "MEDINA con MORAGA", a US. respetuosamente digo:

Que, estando dentro de la oportunidad procesal legal, vengo en contestar la demanda de terminación de contrato y desahucio interpuesta por la contraria, oponiendo perentoriamente la excepción de pago íntegro anterior a la constitución en mora, solicitando su rechazo con expresa condena en costas, en base a los siguientes antecedentes:
1. CONSTANCIA DEL PAGO OPORTUNO: Como consta en los comprobantes de transferencia electrónica bancaria y cupones Servipag que se acompañan en el primer otrosí, esta parte procedió a pagar la totalidad de la renta de abril de 2026 ($690.000) y de los servicios básicos domiciliarios de luz, agua y gas, con fecha 06 DE MAYO DE 2026.
2. ENERVACIÓN DEL ART. 1977 DEL CÓDIGO CIVIL: Habiéndose efectuado el pago de manera íntegra y fehaciente con anterioridad a la notificación judicial de la demanda (que constituye la primera reconvención de pago en nuestra legislación procesal), la acción resolutoria ha quedado completamente enervada y extinguida, careciendo la demanda de todo objeto y causa licita.
3. INEXIGIBILIDAD DE CLÁUSULA PENAL Y MULTA MORATORIA: Por mandato del Art. 1538 y 1557 del Código Civil, el deudor no incurre en la pena sino cuando se ha constituido en mora mediante reconvención judicial. Al haberse verificado el pago antes del emplazamiento, la pretensión contraria de cobrar 0,52 UF diarias resulta improcedente y abusiva.

POR TANTO, en mérito de lo expuesto y normas legales citadas,
RUEGO A US.: Tener por contestada la demanda y opuesta la excepción de pago y enervación, rechazando la acción resolutoria en todas sus partes, con expresa condena en costas.`;
    }

    if (selectedTemplate === 'zoom') {
      return `SOLICITA AUTORIZACIÓN PARA COMPARECENCIA REMOTA POR VIDEOCONFERENCIA (ART. 77 BIS CPC).

S. J. L. EN LO CIVIL DE TEMUCO (3º) [ROL C-1869-2026]

JAIME MARCELO MORAGA CARRASCO, por la parte demandada y demandante reconvencional en autos sobre juicio especial de arrendamiento caratulados "MEDINA con MORAGA", a US. respetuosamente digo:

En mérito de lo dispuesto en el artículo 77 bis del Código de Procedimiento Civil, solicito a Us. tener a bien autorizar mi comparecencia de manera remota mediante la plataforma de videoconferencia Zoom u homóloga dispuesta por el tribunal, para las próximas audiencias y diligencias probatorias decretadas en autos. Lo anterior fundado en que esta parte cuenta con los medios tecnológicos idóneos y dicha modalidad no causa indefensión alguna a las partes intervinientes.
Al efecto, señalo como datos de contacto oficial el correo electrónico: justicia.chile@gmail.com y teléfono celular +56 9 7828 0767.

POR TANTO,
RUEGO A US.: Acceder a lo solicitado, autorizando la comparecencia remota de esta parte en la forma señalada.`;
    }

    if (selectedTemplate === 'documentos') {
      return `ACOMPAÑA DOCUMENTOS EN PARTE DE PRUEBA CON CITACIÓN Y BAJO APERCIBIMIENTO LEGAL.

S. J. L. EN LO CIVIL DE TEMUCO (3º) [ROL C-1869-2026]

JAIME MARCELO MORAGA CARRASCO, por la parte demandada en autos caratulados "MEDINA con MORAGA", a US. respetuosamente digo:

Que, encontrándome en la oportunidad procesal del artículo 8º de la Ley Nº 18.101, vengo en acompañar en parte de prueba los siguientes instrumentos, bajo los apercibimientos legales que en cada caso se indican:
1. CON CITACIÓN:
a) Certificado de saldo emitido por Aguas Araucanía (Servicio Nº 736696) que acredita deuda cero al mes en curso.
b) Certificado y comprobante de pago emitido por COMPAÑÍA GENERAL DE ELECTRICIDAD CGE (Cliente Nº 2678767) que demuestra pago íntegro de consumos de energía eléctrica.
c) Certificado de pago en línea Servipag y Abastible S.A. (Cliente Nº 04508459-0) por consumos de gas domiciliario.
2. BAJO APERCIBIMIENTO DEL ARTÍCULO 346 Nº 3 DEL CPC:
a) Comprobante de transferencia electrónica bancaria MACH por la suma de $690.000.- dirigida a la cuenta corriente del Banco Estado Nº 61500054467 de la actora, de fecha 06 de mayo de 2026, que prueba el pago íntegro de la renta antes del requerimiento judicial.

POR TANTO,
RUEGO A US.: Tener por acompañados en parte de prueba los documentos individualizados, con citación y bajo el apercibimiento legal solicitado.`;
    }

    if (selectedTemplate === 'delegacion') {
      return `DELEGA PODER Y PATROCINIO EN LA FORMA QUE INDICA.

S. J. L. EN LO CIVIL DE TEMUCO (3º) [ROL C-1869-2026]

JAIME MARCELO MORAGA CARRASCO, abogado, actuando por sí en causa caratulada "MEDINA con MORAGA", a US. respetuosamente digo:

Que por este acto vengo en delegar el poder con que actúo en estos autos en la abogada habilitada para el ejercicio de la profesión, doña VALENTINA JAVIERA GARNICA MANQUELIPE (RUT Nº 19.985.633-2), de mi mismo domicilio y forma de notificación para estos efectos, confiriéndole las mismas y amplias facultades que me fueron otorgadas, sin perjuicio de mi derecho a reasumir la representación cuando sea pertinente.

POR TANTO,
RUEGO A US.: Tener presente la delegación de poder conferida en los términos señalados.`;
    }

    return `ANUNCIO DE ALEGATOS EN FORMA LEGAL (ART. 223 CPC).

ILMA. CORTE DE APELACIONES DE TEMUCO / EXCMA. CORTE SUPREMA

JAIME MARCELO MORAGA CARRASCO, abogado litigante, en los autos caratulados "MEDINA con MORAGA", a S.I. / S.E. respetuosamente digo:

Que, encontrándose la presente causa en tabla para su vista y conocimiento en la sala correspondiente, vengo en anunciar alegatos por la parte demandada y demandante reconvencional por un tiempo estimado de 15 MINUTOS, solicitando expresamente poder alegar de manera presencial / remota según las disposiciones vigentes del tribunal ad-quem.

POR TANTO,
RUEGO A S.I. / S.E.: Tener por anunciado el alegato por el tiempo y en la forma señalada.`;
  };

  const copiarAlPortapapeles = () => {
    navigator.clipboard.writeText(generarEscrito());
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  return (
    <div className="animate-fade-in">
      {/* Top Header */}
      <div className="top-header">
        <div className="header-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-yellow">⚡ Cero Cargas Administrativas</span>
            <span className="badge badge-cyan">Conectado a OJV Temuco</span>
          </div>
          <h1>Asistente Proactivo & Inteligencia Litigante</h1>
          <p>
            Reingeniería procesal diseñada para liberar al abogado tramitador de digitaciones inútiles, automatizando la ingesta de resoluciones OJV y la redacción de escritos.
          </p>
        </div>
        <button 
          className="btn-gold" 
          onClick={() => {
            setActiveSubTab('ingesta');
            setIngestaRealizada(true);
          }}
        >
          <Sparkles size={18} />
          <span>⚡ Simular Ingesta ROL C-1869-2026</span>
        </button>
      </div>

      {/* Navegación por Sub-Pestañas del Asistente */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveSubTab('ingesta')}
          className={activeSubTab === 'ingesta' ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '10px 20px', borderRadius: '10px' }}
        >
          <UploadCloud size={18} />
          <span>1. 📥 Ingesta Automática OJV (Sin Digitar)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('escritos')}
          className={activeSubTab === 'escritos' ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '10px 20px', borderRadius: '10px' }}
        >
          <FileText size={18} />
          <span>2. ✍️ Generador 1-Clic de Escritos</span>
        </button>

        <button
          onClick={() => setActiveSubTab('radar')}
          className={activeSubTab === 'radar' ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '10px 20px', borderRadius: '10px', background: activeSubTab === 'radar' ? 'var(--alert-red)' : 'transparent', borderColor: activeSubTab === 'radar' ? 'var(--alert-red)' : 'var(--border-color)' }}
        >
          <ShieldAlert size={18} />
          <span>3. 🛡️ Radar Anti-Colapso (Art. 394 CPC)</span>
        </button>
      </div>

      {/* CONTENIDO PESTAÑA 1: INGESTA AUTOMÁTICA OJV */}
      {activeSubTab === 'ingesta' && (
        <div className="animate-fade-in">
          {/* Hidden File Input */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" 
            style={{ display: 'none' }} 
          />

          {/* Zona de Arrastre o Selección Activa (Drag & Drop) */}
          <div 
            className="glass-card" 
            style={{ 
              padding: '40px', 
              textAlign: 'center', 
              border: isDragging ? '3px solid var(--accent-cyan)' : '2px dashed var(--accent-cyan)', 
              background: isDragging 
                ? 'linear-gradient(180deg, rgba(192, 160, 113, 0.2) 0%, rgba(10, 15, 29, 0.9) 100%)' 
                : 'linear-gradient(180deg, rgba(192, 160, 113, 0.05) 0%, rgba(10, 15, 29, 0.6) 100%)',
              boxShadow: isDragging ? '0 0 30px rgba(192, 160, 113, 0.4)' : 'none',
              marginBottom: '24px',
              cursor: 'pointer',
              transition: 'all 0.25s ease-in-out'
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
          >
            <Cpu size={48} color="var(--accent-cyan)" style={{ margin: '0 auto 16px auto' }} className={isAnalyzing ? "animate-spin" : ""} />
            <h3 style={{ fontSize: '1.4rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
              {isAnalyzing ? "⏳ Analizando resolución judicial con IA Forense PyMuPDF..." : (isDragging ? "¡Suelta aquí tu PDF de la Resolución u OJV!" : "Suelta aquí el PDF de la resolución OJV o carpeta judicial")}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto 20px auto' }}>
              La Inteligencia Artificial de LexControl leerá el documento, identificará el tribunal, carátula, abogados intervinientes, calculará los plazos chilenos y creará las alertas en el calendario automáticamente.
            </p>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current && fileInputRef.current.click(); }}
                style={{ background: 'var(--accent-cyan)', color: 'var(--text-inverse)', fontWeight: '800' }}
              >
                <UploadCloud size={18} />
                <span>📂 Seleccionar PDF desde tu disco Linux</span>
              </button>
            </div>
            {/* Antes había acá un botón "Analizar PDF en Disco" que, sin decir cuál
                archivo, tomaba uno al azar de ~/Descargas (glob.glob sin orden
                garantizado) y lo archivaba de inmediato. Si el heurístico de carpeta
                erraba, terminaba guardado en el expediente de otro cliente. Se quitó:
                para analizar un PDF hay que elegirlo, con el botón de arriba o desde
                "Subir y analizar documento", que además muestra una vista previa y no
                archiva nada hasta que confirmas la carpeta de destino. */}
          </div>

          {/* RESULTADO DE LA INGESTA REAL */}
          {ingestaRealizada && (
            <div className="animate-fade-in">
              <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'rgba(93, 145, 105, 0.15)', border: '1px solid var(--alert-green)', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <CheckCircle2 size={24} color="var(--alert-green)" />
                  <div>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '1rem', display: 'block' }}>
                      ¡Ingesta Procesal Completa! Documento {analizadoData ? `"${analizadoData.archivo}" (${analizadoData.total_paginas} pág)` : "58 páginas"} analizado en 0.4s
                    </strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--ok)' }}>
                      Se han registrado automáticamente las partes, tribunal, carátula y el plazo fatal de {analizadoData ? analizadoData.plazo_dias : 5} días {analizadoData ? analizadoData.tipo_plazo : "hábiles (Art. 66 CPC)"}.
                    </span>
                  </div>
                </div>
                <span className="badge badge-green" style={{ fontSize: '0.8rem' }}>0 Cargas Administrativas</span>
              </div>

              {/* Tarjeta Detalle Extracción OJV */}
              <div className="glass-card" style={{ padding: '28px', borderLeft: '4px solid var(--accent-cyan)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span className="badge badge-cyan" style={{ fontSize: '0.85rem', fontWeight: '800' }}>{analizadoData ? analizadoData.rol : "ROL C-1869-2026"}</span>
                      <span className="badge badge-purple">{analizadoData ? analizadoData.tribunal : "3º Juzgado Civil de Temuco"}</span>
                      <span className="badge badge-blue">{analizadoData ? analizadoData.materia : "Ley 18.101 Arrendamiento"}</span>
                    </div>
                    <h2 style={{ fontSize: '1.6rem', color: 'var(--text-primary)', margin: 0 }}>
                      {analizadoData ? analizadoData.caratula : "MEDINA con MORAGA"}
                    </h2>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      🏛️ <strong>Cuaderno:</strong> {analizadoData ? analizadoData.cuaderno : "Principal"} • <strong>Hito Procesal:</strong> {analizadoData ? analizadoData.hito_critico : "En Tramitación (Término Probatorio)"}
                    </span>
                  </div>

                  <button 
                    className="btn-primary" 
                    style={{ background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-cyan))', border: 'none', padding: '10px 20px', fontSize: '0.95rem', fontWeight: '800', boxShadow: '0 4px 15px rgba(201, 148, 70, 0.4)' }}
                    onClick={() => {
                      const casoIntegrado = integrarExpedienteIA(analizadoData || {});
                      alert(`✅ ¡EXPEDIENTE INTEGRADO Y ACTIVO!\n\nCausa: ${casoIntegrado.caratula}\nRol/RIT: ${casoIntegrado.rit}\nTribunal: ${casoIntegrado.tribunal}\n\nTe llevaremos directamente a la Ficha Oficial de la causa en LexControl.`);
                      if (onSelectCaso) onSelectCaso(casoIntegrado);
                    }}
                  >
                    <span>⚡ ABRIR FICHA DE CAUSA INTEGRADA EN LEXCONTROL</span>
                    <ArrowRight size={18} />
                  </button>
                </div>

                {/* Banner de Audiencia Judicial Programada (Si IA la detecta) */}
                {analizadoData && analizadoData.fecha_audiencia_fijada && (
                  <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(201, 148, 70, 0.22), rgba(207, 95, 87, 0.22))', border: '2px solid var(--accent-gold)', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '2.2rem' }}>📅</span>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                          ⚡ AUDIENCIA JUDICIAL FIJADA POR EL TRIBUNAL
                        </span>
                        <strong style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                          {analizadoData.fecha_audiencia_fijada}
                        </strong>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--danger)', fontWeight: '700' }}>
                        ⏳ {analizadoData.tipo_plazo}
                      </span>
                    </div>
                  </div>
                )}

                {/* Grid de Datos Extraídos por IA */}
                <div className="grid-3" style={{ marginBottom: '20px' }}>
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      👤 Parte / Interviniente Detectado
                    </span>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem', display: 'block' }}>{analizadoData ? (analizadoData.caratula.includes("con") ? analizadoData.caratula.split("con")[0] : analizadoData.caratula) : "María Aurora Medina Soto"}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      RUTs: {analizadoData && analizadoData.ruts_detectados && analizadoData.ruts_detectados.length > 0 ? analizadoData.ruts_detectados.join(", ") : "7.503.348-6"}
                    </span>
                  </div>

                  <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)', borderColor: 'rgba(201, 148, 70, 0.4)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      🛡️ Parte Contraparte / Mandante
                    </span>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem', display: 'block' }}>{analizadoData && analizadoData.caratula.includes("con") ? analizadoData.caratula.split("con")[1] : "Jaime Marcelo Moraga Carrasco"}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>RUT: 8.328.581-8</span>
                  </div>

                  <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(207, 95, 87, 0.12)', border: '1px solid var(--alert-red)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--alert-red)', fontWeight: '800', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      🚨 {analizadoData ? (analizadoData.tipo_plazo.includes("CPP") ? "HITO PROCESAL PENAL (ART. 14 CPP)" : "HITO PROCESAL FATAL (ART. 66 CPC)") : "HITO PROCESAL FATAL (ART. 66 CPC)"}
                    </span>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem', display: 'block' }}>{analizadoData ? analizadoData.hito_critico : "2º Llamado Absolución de Posiciones"}</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--danger)', fontWeight: '600' }}>⚡ Vencimiento: {analizadoData ? `${analizadoData.plazo_dias} días (${analizadoData.tipo_plazo})` : "Martes 28/07/2026"}</span>
                  </div>
                </div>

                {/* Síntesis Estratégica IA */}
                <div style={{ padding: '18px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.95rem', color: 'var(--accent-gold)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={18} /> Acción Sugerida por Motor Forense LexControl
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                    {analizadoData ? analizadoData.accion_sugerida : "La pretensión contraria de desahucio es improcedente: se acreditó mediante transferencias y percepción documental (10/07/2026) el pago íntegro anterior a la notificación judicial, enervando la acción por completo (Art. 1977 CC)."}
                  </p>
                </div>

                {/* NUEVO: Análisis de Demanda / Pretensión de la Actora */}
                {analizadoData && analizadoData.analisis_demanda_o_pretension && (
                  <div style={{ padding: '18px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '0.95rem', color: 'var(--accent-blue)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      ⚖️ Análisis Forense de la Demanda / Pretensión de la Actora
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                      {analizadoData.analisis_demanda_o_pretension}
                    </p>
                  </div>
                )}

                {/* NUEVO: Análisis de Defensas y Excepciones */}
                {analizadoData && analizadoData.analisis_defensas_y_excepciones && (
                  <div style={{ padding: '18px', borderRadius: '12px', background: 'rgba(93, 145, 105, 0.08)', border: '1px solid rgba(93, 145, 105, 0.3)', marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '0.95rem', color: 'var(--accent-green)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      🛡️ Evaluación de las Defensas / Contestación / Reconvención
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                      {analizadoData.analisis_defensas_y_excepciones}
                    </p>
                  </div>
                )}

                {/* NUEVO: Auditoría Forense de Emplazamiento y Notificaciones (Control de Receptores Judiciales) */}
                {analizadoData && analizadoData.auditoria_emplazamiento_y_notificaciones && (
                  <div style={{ padding: '18px', borderRadius: '12px', background: 'rgba(207, 95, 87, 0.15)', border: '2px solid var(--alert-red)', marginBottom: '16px', boxShadow: '0 4px 15px rgba(207, 95, 87, 0.2)' }}>
                    <h4 style={{ fontSize: '0.98rem', color: 'var(--danger)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800' }}>
                      🚨 Auditoría Forense de Emplazamiento y Notificaciones (Control de Receptores Judiciales)
                    </h4>
                    {typeof analizadoData.auditoria_emplazamiento_y_notificaciones === 'object' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        <p style={{ margin: 0, lineHeight: 1.5, background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #f87171' }}>
                          <strong>🔍 Verificación Legal de Emplazamiento: </strong> {analizadoData.auditoria_emplazamiento_y_notificaciones.verificacion_notificacion_subsidiaria || JSON.stringify(analizadoData.auditoria_emplazamiento_y_notificaciones)}
                        </p>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5, background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #f87171' }}>
                        {analizadoData.auditoria_emplazamiento_y_notificaciones}
                      </p>
                    )}
                  </div>
                )}

                {/* NUEVO: Auditoría Forense de Tramitación (Búsqueda de Vicios y Errores) */}
                {analizadoData && analizadoData.errores_y_vicios_tramitacion && (
                  <div style={{ padding: '18px', borderRadius: '12px', background: 'rgba(207, 95, 87, 0.12)', border: '2px solid var(--alert-red)', marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800' }}>
                      🚨 Auditoría Forense de Tramitación: Búsqueda de Errores, Vicios y Nulidades
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Array.isArray(analizadoData.errores_y_vicios_tramitacion) ? (
                        analizadoData.errores_y_vicios_tramitacion.map((err, idx) => (
                          <li key={idx} style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.4, fontWeight: err.includes("No se detectaron") ? '400' : '700' }}>
                            {err}
                          </li>
                        ))
                      ) : (
                        <li style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{analizadoData.errores_y_vicios_tramitacion}</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* NUEVO: Estrategia Ofensiva Litigante */}
                {analizadoData && analizadoData.estrategia_ofensiva_litigante && (
                  <div style={{ padding: '20px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(201, 148, 70, 0.15), rgba(168, 85, 247, 0.15))', border: '1px solid var(--accent-gold)', marginBottom: '10px' }}>
                    <h4 style={{ fontSize: '0.95rem', color: 'var(--accent-gold)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800' }}>
                      🎯 Estrategia Ofensiva Litigante de Alto Nivel
                    </h4>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                      {analizadoData.estrategia_ofensiva_litigante}
                    </p>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTENIDO PESTAÑA 2: GENERADOR 1-CLIC DE ESCRITOS */}
      {activeSubTab === 'escritos' && (
        <div className="grid-7-5" style={{ alignItems: 'flex-start' }}>
          
          {/* Columna Izquierda: Selector de Plantilla y Caso */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileCheck2 size={20} color="var(--accent-cyan)" />
              Seleccionar Plantilla Antiburocracia
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Escoge el escrito procesal que necesitas presentar. La IA completará automáticamente la suma, juzgado, rol y argumentos con los datos del caso seleccionado.
            </p>

            {/* Selector de Caso */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                📂 Expediente Destino en OJV:
              </label>
              <select
                value={selectedCasoId}
                onChange={(e) => setSelectedCasoId(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-modal)', color: 'var(--text-primary)', border: '1px solid var(--border-hover)', padding: '10px 14px', borderRadius: '10px', fontSize: '0.9rem', outline: 'none' }}
              >
                {[...MOCK_CASOS, ...PJUD_CASOS].map(c => (
                  <option key={c.id} value={c.id}>{c.rit} • {c.caratula} ({c.tribunal})</option>
                ))}
              </select>
            </div>

            {/* Lista de Plantillas de Escritos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { id: 'enervacion', titulo: 'Escrito de Enervación por Pago Anterior al Emplazamiento (Art. 1977 CC)', badge: '¡Especial Temuco!', color: 'gold' },
                { id: 'zoom', titulo: 'Solicitud Comparecencia Remota Videoconferencia (Art. 77 bis CPC)', badge: 'Muy Usado', color: 'cyan' },
                { id: 'documentos', titulo: 'Acompaña Documentos con Citación y Bajo Apercibimiento Legal', badge: 'Prueba', color: 'blue' },
                { id: 'delegacion', titulo: 'Delegación de Poder Judicial y Patrocinio (Art. 7 CPC)', badge: 'Trámite', color: 'purple' },
                { id: 'alegatos', titulo: 'Anuncio de Alegatos ante Corte de Apelaciones / Suprema (Art. 223 CPC)', badge: 'Corte', color: 'green' },
              ].map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl.id)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    background: selectedTemplate === tpl.id ? 'rgba(192, 160, 113, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid',
                    borderColor: selectedTemplate === tpl.id ? 'var(--accent-cyan)' : 'var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: selectedTemplate === tpl.id ? '700' : '500', color: selectedTemplate === tpl.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {tpl.titulo}
                  </span>
                  <span className={`badge badge-${tpl.color === 'gold' ? 'yellow' : tpl.color}`} style={{ fontSize: '0.65rem' }}>
                    {tpl.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Columna Derecha: Vista Previa y Botón Copiar al Portapapeles */}
          <div className="glass-card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: '700', textTransform: 'uppercase' }}>
                    BORRADOR LISTO PARA INGRESO EN OJV
                  </span>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', margin: 0 }}>
                    {casoSeleccionado.caratula} ({casoSeleccionado.rit})
                  </h3>
                </div>
                <span className="badge badge-green">Formato Judicial Chileno</span>
              </div>

              {/* Caja de Texto del Escrito */}
              <div style={{
                background: '#070a14',
                border: '1px solid var(--border-accent)',
                borderRadius: '12px',
                padding: '20px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                maxHeight: '420px',
                overflowY: 'auto',
                marginBottom: '20px',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
              }}>
                {generarEscrito()}
              </div>
            </div>

            {/* Botón de Acción Portapapeles */}
            <button 
              className="btn-primary" 
              style={{ 
                width: '100%', 
                justifyContent: 'center', 
                padding: '16px', 
                background: copiado ? 'var(--alert-green)' : 'var(--accent-cyan)',
                color: 'var(--text-inverse)',
                fontWeight: '800',
                fontSize: '1rem',
                transition: 'all 0.3s'
              }}
              onClick={copiarAlPortapapeles}
            >
              <Copy size={20} />
              <span>{copiado ? '¡ESCRITO COPIADO AL PORTAPAPELES! (LISTO PARA OJV)' : 'COPIAR ESCRITO PARA PEGAR EN OFICINA JUDICIAL VIRTUAL'}</span>
            </button>
          </div>

        </div>
      )}

      {/* CONTENIDO PESTAÑA 3: RADAR ANTI-COLAPSO (ART. 394 CPC) */}
      {activeSubTab === 'radar' && (
        <div className="animate-fade-in">
          <div style={{ padding: '20px 24px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(207, 95, 87, 0.2) 0%, rgba(10, 15, 29, 0.9) 100%)', border: '2px solid var(--alert-red)', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--alert-red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert size={28} color="#000" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="badge badge-red" style={{ fontSize: '0.8rem', fontWeight: '800' }}>¡ALERTA ROJA INMINENTE!</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: '700' }}>ROL C-1869-2026 • 3º JUZGADO CIVIL DE TEMUCO</span>
                </div>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', margin: 0 }}>
                  Apercibimiento Grave de Confesión Tácita (Art. 394 CPC)
                </h2>
              </div>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--danger)', lineHeight: 1.5, marginBottom: '20px' }}>
              Según consta en la resolución de Folio 24 proveyendo el escrito de folio 23, se ha ordenado citar por <strong>segundo llamado a absolver posiciones</strong> al demandado don Jaime Marcelo Moraga Carrasco para el <strong>MARTES 28 DE JULIO DE 2026 A LAS 11:00 HORAS</strong>. Al ser un segundo llamado tras inasistencia al primero, la falta de comparecencia presencial provocará la <strong>confesión ficta o tácita</strong> de las posiciones adversarias.
            </p>

            {/* Plan de Acción Inmediata Anti-Colapso */}
            <div className="grid-3" style={{ gap: '14px' }}>
              <button 
                className="btn-secondary" 
                style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.2)', padding: '14px', justifyContent: 'center' }}
                onClick={() => alert("Simulación: ¡Asistencia al 2º llamado confirmada en la agenda de Temuco! Alerta SMS enviada al teléfono celular del socio.")}
              >
                <UserCheck size={18} color="var(--alert-green)" />
                <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>1. Confirmar Asistencia Presencial</span>
              </button>

              <button 
                className="btn-secondary" 
                style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.2)', padding: '14px', justifyContent: 'center' }}
                onClick={() => onSelectCaso([...MOCK_CASOS, ...PJUD_CASOS][0])}
              >
                <FileText size={18} color="var(--accent-cyan)" />
                <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>2. Revisar Pliego de Posiciones</span>
              </button>

              <button 
                className="btn-secondary" 
                style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.2)', padding: '14px', justifyContent: 'center' }}
                onClick={() => alert("Simulación: Ruta GPS y recordatorio agendado hacia Balmaceda Nº 490, 3er Piso, Temuco para el Martes 28 a las 10:30 hrs.")}
              >
                <MapPin size={18} color="var(--accent-gold)" />
                <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>3. Logística Balmaceda 490, Temuco</span>
              </button>
            </div>
          </div>

          {/* Otros Riesgos Monitoreados en el Estudio */}
          <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '16px' }}>
            🛡️ Otras Alertas Procesales Monitoreadas en Tiempo Real
          </h3>
          <div className="grid-2">
            <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid var(--accent-gold)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="badge badge-yellow">Art. 187 CPP</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RIT O-342-2026 (2º TJOP)</span>
              </div>
              <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>Ruptura de Cadena de Custodia PDI</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                El hash MD5 del peritaje informático varió en dependencias policiales. Interrogar al perito en audiencia del 30/07.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid var(--accent-cyan)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="badge badge-cyan">Art. 14 CPP</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RIT P-908-2025 (7º Garantía)</span>
              </div>
              <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>Prórroga Automática Vencimiento Fatal</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                Plazo para solicitud de nuevas diligencias prorroga automáticamente al día hábil siguiente por caer en domingo.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
