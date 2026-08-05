import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  FileText,
  Sparkles,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  BookOpen,
  Gavel,
  PenTool,
  ExternalLink,
  Bot,
  RefreshCw,
  Scale,
  Building2,
  Clock,
  ShieldCheck,
  Trash2,
  Zap,
  AlignLeft,
  FileSpreadsheet,
  GripHorizontal,
  RotateCcw
} from 'lucide-react';
import { LEXCONTROL_API } from '../apiBase';
import { cargarExpedientes, guardarExpedientes } from '../utils/expedientes';

const SUGERENCIAS_RAPIDAS = [
  'Solicitud de Impulso Procesal (Art. 152 CPC)',
  'Recurso de Reposición (Art. 181 CPC)',
  'Téngase Presente & Acompaña Documentos',
  'Certificación de Término Probatorio',
  'Cumple lo Ordenado por S.S.',
  'Comparecencia por Videoconferencia',
  'Minuta de Alegatos de Clausura'
];

export default function ModalRedactarDocumento({ isOpen, onClose, gestion, caso }) {
  const [tipoEscrito, setTipoEscrito] = useState('Solicitud Procesal / Escrito Judicial');
  const [instruccion, setInstruccion] = useState('');
  const [modoGeneracion, setModoGeneracion] = useState('heuristico'); // 'heuristico' o 'ia'
  const [generando, setGenerando] = useState(false);
  const [abriendoWriter, setAbriendoWriter] = useState(false);
  const [escritoResultado, setEscritoResultado] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [guardadoBitacora, setGuardadoBitacora] = useState(false);
  const [mensajeWriter, setMensajeWriter] = useState(null);
  const [error, setError] = useState(null);

  // Estado de ventana flotante y arrastre
  const [posicionFlotante, setPosicionFlotante] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

  const handleMouseDownDrag = (e) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: posicionFlotante.x,
      initialY: posicionFlotante.y
    };
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosicionFlotante({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Datos del expediente limpios
  const rit = caso?.rit || caso?.rol || gestion?.expedienteRit || 'C-2026';

  let caratulaRaw = caso?.caratula || caso?.cliente || gestion?.expedienteAsunto || gestion?.expedienteCliente || 'PARTE ACTORA con PARTE DEMANDADA';
  const caratula = caratulaRaw.replace(/📁?\s*\(Expediente en Disco:[^)]*\)/gi, '').replace(/📁?\s*Expediente en Disco:[^\n]*/gi, '').trim() || 'PARTE ACTORA con PARTE DEMANDADA';

  let tribunalRaw = caso?.tribunal || gestion?.origen || 'Calbuco';
  const tribunal = tribunalRaw.replace(/📁?\s*\(Expediente en Disco:[^)]*\)/gi, '').trim() || 'Calbuco';

  let tramiteBaseRaw = gestion?.tramite || gestion?.textoOriginal || 'Gestión procesal pendiente';
  const tramiteBase = tramiteBaseRaw.replace(/📁?\s*\(Expediente en Disco:[^)]*\)/gi, '').trim();

  const cuaderno = gestion?.cuaderno || 'Principal';
  const folio = gestion?.folio || '';

  // Estadísticas del escrito en tiempo real
  const stats = useMemo(() => {
    if (!escritoResultado) return { palabras: 0, lineas: 0, caracteres: 0 };
    const palabras = escritoResultado.trim() ? escritoResultado.trim().split(/\s+/).length : 0;
    const lineas = escritoResultado.split('\n').length;
    const caracteres = escritoResultado.length;
    return { palabras, lineas, caracteres };
  }, [escritoResultado]);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setMensajeWriter(null);

    let tipoInferido = 'Solicitud de Impulso Procesal';
    const tr = tramiteBase.toLowerCase();
    if (tr.includes('reposic') || tr.includes('recurso')) tipoInferido = 'Recurso de Reposición (Art. 181 CPC)';
    else if (tr.includes('tengase') || tr.includes('documento') || tr.includes('acompaña')) tipoInferido = 'Téngase Presente & Acompaña Documentos';
    else if (tr.includes('certific')) tipoInferido = 'Solicitud de Certificación de Término';
    else if (tr.includes('cumple') || tr.includes('ordena')) tipoInferido = 'Cumple lo Ordenado por S.S.';
    else if (tr.includes('zoom') || tr.includes('video')) tipoInferido = 'Solicitud de Comparecencia por Videoconferencia';
    else if (tr.includes('minuta') || tr.includes('alegato')) tipoInferido = 'Minuta de Alegatos de Clausura';

    setTipoEscrito(tipoInferido);

    const propuestaInicial = `FUNDAMENTOS PROCESALES EXTRAÍDOS DEL EXPEDIENTE:
• Causa ROL/RIT: ${rit}
• Carátula: ${caratula}
• Tribunal: ${tribunal}
• Actuación registrada: ${tramiteBase}${folio ? ` (${folio})` : ''}
• Cuaderno: ${cuaderno}

FUNDAMENTOS Y PETICIÓN SUGERIDA:
Que habiéndose cumplido los plazos legales aplicables y encontrándose pendiente el pronunciamiento del tribunal sobre la actuación "${tramiteBase}", se solicita formalmente dar curso progresivo a los autos.`;

    setInstruccion(propuestaInicial);
    generarBorrador(tipoInferido, propuestaInicial, 'heuristico');
  }, [isOpen, gestion, caso]);

  const generarBorrador = async (tipo, inst, modo) => {
    setGenerando(true);
    setError(null);
    setCopiado(false);
    setGuardadoBitacora(false);
    setMensajeWriter(null);

    try {
      const res = await fetch(`${LEXCONTROL_API}/generar_escrito_ia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caso: { rit, caratula, tribunal, materia: caso?.materia || 'Derecho Procesal' },
          tipo_escrito: tipo || tipoEscrito,
          instruccion: inst || instruccion || 'Solicitar proveído de conformidad.',
          modo: modo || modoGeneracion
        })
      });

      const data = await res.json();
      if (data.status === 'ok' && data.escrito) {
        setEscritoResultado(data.escrito);
      } else {
        throw new Error(data.error || 'No se pudo generar el escrito.');
      }
    } catch (err) {
      const escritoLocal = `EN LO PRINCIPAL: ${(tipo || tipoEscrito).toUpperCase()}.

S. J. L. (${tribunal.toUpperCase()})

JAIME MARCELO MORAGA CARRASCO, abogado, por la parte correspondiente en los autos caratulados "${caratula}", ROL/RIT ${rit}, cuaderno ${cuaderno}, a S.S. respetuosamente digo:

Que por este acto vengo en solicitar a S.S. proveer de conformidad respecto a la actuación procesal: "${tramiteBase}".

FUNDAMENTOS DE HECHO Y DE DERECHO:
Que conforme a los antecedentes del expediente y las normas del Código de Procedimiento Civil / Procesal Penal chileno, habiéndose cumplido los trámites legales de rigor, corresponde dar curso progresivo a los autos.

POR TANTO,
A S.S. RUEGO acceder a lo solicitado y proveer de conformidad.`;
      setEscritoResultado(escritoLocal);
    } finally {
      setGenerando(false);
    }
  };

  const abrirEnLibreOffice = async () => {
    if (!escritoResultado) return;
    setAbriendoWriter(true);
    setMensajeWriter(null);
    setError(null);

    try {
      const url = `${LEXCONTROL_API}/abrir_libreoffice`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrito: escritoResultado,
          titulo: tipoEscrito,
          rit,
          caratula
        })
      });

      const data = await res.json();
      if (data.status === 'ok') {
        setMensajeWriter(`✅ LibreOffice 24.8 Writer iniciado nativamente en tu escritorio Linux. Archivo: ${data.ruta}`);
      } else {
        throw new Error(data.error || 'Servidor no pudo abrir LibreOffice Writer.');
      }
    } catch (err) {
      setError(`⚠️ Aviso al abrir en LibreOffice: ${err.message}`);
    } finally {
      setAbriendoWriter(false);
    }
  };

  const copiarAlPortapapeles = () => {
    if (!escritoResultado) return;
    navigator.clipboard.writeText(escritoResultado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  const guardarEnBitacora = async () => {
    if (!escritoResultado) return;
    try {
      const expedientes = await cargarExpedientes();
      const expId = caso?.id || rit;
      let exp = expedientes.find((x) => x.id === expId || x.ritVinculado === rit);
      if (!exp) {
        exp = {
          id: expId,
          cliente: caratula,
          asunto: tipoEscrito,
          tipo: 'judicial',
          ritVinculado: rit,
          gestiones: []
        };
        expedientes.push(exp);
      }

      const nuevaGestion = {
        id: `gest-${Date.now()}`,
        fecha: new Date().toLocaleDateString('es-CL'),
        hora: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        tramite: `Escrito redactado: ${tipoEscrito}`,
        estado: 'COMPLETADO',
        urgencia: 'NORMAL',
        textoOriginal: escritoResultado.slice(0, 300) + '...',
        cuaderno: 'Redactor LibreOffice',
        timestamp: new Date().toISOString()
      };

      exp.gestiones = [nuevaGestion, ...(exp.gestiones || [])];
      await guardarExpedientes(expedientes);
      setGuardadoBitacora(true);
      setTimeout(() => setGuardadoBitacora(false), 3000);
    } catch (e) {
      alert(`Error al guardar en bitacora: ${e.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        backdropFilter: 'none',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        pointerEvents: 'none'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '90vw',
          maxWidth: '1280px',
          height: '88vh',
          maxHeight: '920px',
          background: '#ffffff',
          border: '2px solid #cbd5e1',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#0f172a',
          pointerEvents: 'auto',
          transform: `translate(${posicionFlotante.x}px, ${posicionFlotante.y}px)`,
          transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* BARRA SUPERIOR DE ARRASTRE FLOTANTE */}
        <div
          onMouseDown={handleMouseDownDrag}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 14px',
            background: '#e0f2fe',
            borderBottom: '1px solid #bae6fd',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
            color: '#0369a1',
            fontSize: '12px',
            fontWeight: 700
          }}
          title="Haz clic y arrastra para mover la ventana del Redactor Forense por cualquier lugar del Dashboard"
        >
          <GripHorizontal size={16} />
          <span>Mover Redactor Forense por la pantalla (arrastra aquí)</span>
        </div>

        {/* CABECERA PRINCIPAL EN TONOS CLAROS */}
        <div
          style={{
            padding: '16px 24px',
            background: '#f1f5f9',
            borderBottom: '2px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap'
          }}
        >
          <div className="row" style={{ gap: '14px', alignItems: 'center' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0284c7, #4f46e5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
              }}
            >
              <PenTool size={24} />
            </div>
            <div>
              <div className="row" style={{ gap: '10px', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, color: '#0f172a', letterSpacing: '-0.01em' }}>
                  Redactor Forense & Procesador LibreOffice Writer
                </h2>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '0.72rem',
                    fontWeight: 'bold',
                    background: '#dcfce7',
                    color: '#15803d',
                    border: '1px solid #86efac',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a' }}></span>
                  LibreOffice Nativo Listo
                </span>
              </div>

              {/* Chips de Metadatos de la Causa */}
              <div className="row" style={{ gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Scale size={14} color="#0284c7" /> ROL/RIT: <strong style={{ color: '#0f172a', fontFamily: 'var(--font-mono)' }}>{rit}</strong>
                </span>
                <span style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Building2 size={14} color="#7c3aed" /> Tribunal: <strong style={{ color: '#0f172a' }}>{tribunal}</strong>
                </span>
                <span style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <FileText size={14} color="#d97706" /> Carátula: <strong style={{ color: '#0f172a' }}>{caratula}</strong>
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(posicionFlotante.x !== 0 || posicionFlotante.y !== 0) && (
              <button
                type="button"
                onClick={() => setPosicionFlotante({ x: 0, y: 0 })}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: '#fef3c7',
                  border: '1px solid #fde047',
                  cursor: 'pointer',
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '700'
                }}
                title="Re-centrar ventana en la pantalla"
              >
                <RotateCcw size={14} /> Re-centrar
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                cursor: 'pointer',
                color: '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                fontWeight: '700',
                transition: 'all 0.2s ease'
              }}
            >
              <X size={18} /> Cerrar
            </button>
          </div>
        </div>

        {/* CUERPO DEL REDACTOR EN 2 COLUMNAS AMPLIAS (LIGHT THEME) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 440px) 1fr',
            gap: '20px',
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
            background: '#f8fafc'
          }}
        >
          {/* COLUMNA 1 (IZQUIERDA): Panel de Control del Expediente & IA */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              padding: '18px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '800', margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="#0284c7" /> 1. Configuración & Prompts Procesales
              </h3>
              <span style={{ fontSize: '10px', background: '#f3e8ff', color: '#7e22ce', padding: '2px 8px', borderRadius: '6px', fontWeight: '700', border: '1px solid #d8b4fe' }}>
                Auto-Inferencia
              </span>
            </div>

            {/* Campo Libre: Tipo de Escrito Judicial */}
            <div>
              <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '700' }}>
                Tipo de Escrito Judicial:
              </label>
              <input
                type="text"
                value={tipoEscrito}
                onChange={(e) => setTipoEscrito(e.target.value)}
                placeholder="Ej: Impulso Procesal, Téngase Presente, Recurso, etc."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  color: '#0f172a',
                  fontSize: '0.88rem',
                  fontWeight: '600',
                  outline: 'none'
                }}
              />

              {/* Botones de sugerencias rápidas */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                {SUGERENCIAS_RAPIDAS.map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setTipoEscrito(sug)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      background: tipoEscrito === sug ? '#e0f2fe' : '#f1f5f9',
                      border: tipoEscrito === sug ? '1px solid #0284c7' : '1px solid #cbd5e1',
                      color: tipoEscrito === sug ? '#0369a1' : '#475569',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    + {sug.split(' ')[0]} {sug.split(' ')[1] || ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Conmutador de Motor de Redacción */}
            <div>
              <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '700' }}>
                Motor de Redacción Procesal:
              </label>
              <div className="row" style={{ gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModoGeneracion('heuristico')}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: '800',
                    background: modoGeneracion === 'heuristico' ? '#dcfce7' : '#f1f5f9',
                    border: modoGeneracion === 'heuristico' ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                    color: modoGeneracion === 'heuristico' ? '#15803d' : '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Gavel size={15} /> ⚡ Local Heurístico
                </button>
                <button
                  type="button"
                  onClick={() => setModoGeneracion('ia')}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: '800',
                    background: modoGeneracion === 'ia' ? '#f3e8ff' : '#f1f5f9',
                    border: modoGeneracion === 'ia' ? '1.5px solid #9333ea' : '1px solid #cbd5e1',
                    color: modoGeneracion === 'ia' ? '#7e22ce' : '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Bot size={15} /> 🤖 IA Gemini 2.5
                </button>
              </div>
            </div>

            {/* Instrucciones & Propuesta Legal */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '700' }}>
                Instrucciones & Propuesta Generada:
              </label>
              <textarea
                value={instruccion}
                onChange={(e) => setInstruccion(e.target.value)}
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: '150px',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '0.82rem',
                  lineHeight: '1.5',
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  color: '#0f172a',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none'
                }}
                placeholder="Fundamentos y propuesta procesal..."
              />
            </div>

            <button
              type="button"
              onClick={() => generarBorrador(tipoEscrito, instruccion, modoGeneracion)}
              disabled={generando}
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0284c7, #4f46e5)',
                border: 'none',
                color: '#ffffff',
                fontWeight: '800',
                fontSize: '0.88rem',
                cursor: generando ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)'
              }}
            >
              {generando ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
              {generando ? 'Redactando borrador judicial...' : '✨ Proponer Redacción con LLM / Heurístico'}
            </button>
          </div>

          {/* COLUMNA 2 (DERECHA): Procesador de Texto Forense Profesional & Lanzador LibreOffice Writer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              padding: '18px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
            }}
          >
            {/* BARRA SUPERIOR DE ACCIONES */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px'
              }}
            >
              <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlignLeft size={18} color="#059669" /> 2. Procesador de Texto Judicial
                </h3>
              </div>

              {/* BARRA DE HERRAMIENTAS Y ACCIONES */}
              <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={abrirEnLibreOffice}
                  disabled={abriendoWriter || !escritoResultado}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    background: '#059669',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '800',
                    fontSize: '0.85rem',
                    cursor: abriendoWriter || !escritoResultado ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                  }}
                  title="Abre directamente LibreOffice 24.8 Writer nativo en Linux con este escrito cargado"
                >
                  {abriendoWriter ? <Loader2 size={16} className="spin" /> : <ExternalLink size={16} />}
                  <span>🖊️ Abrir en LibreOffice Writer</span>
                </button>

                <button
                  type="button"
                  onClick={copiarAlPortapapeles}
                  disabled={!escritoResultado}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {copiado ? <Check size={15} color="#059669" /> : <Copy size={15} />}
                  <span>{copiado ? '¡Copiado!' : 'Copiar'}</span>
                </button>

                <button
                  type="button"
                  onClick={guardarEnBitacora}
                  disabled={!escritoResultado}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {guardadoBitacora ? <CheckCircle2 size={15} color="#059669" /> : <BookOpen size={15} />}
                  <span>{guardadoBitacora ? '¡Guardado!' : 'Guardar en Bitácora'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEscritoResultado('')}
                  disabled={!escritoResultado}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: '#fef2f2',
                    border: '1px solid #fca5a5',
                    color: '#dc2626',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                  title="Limpiar texto"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* NOTIFICACIONES Y MENSAJES DE ESTADO */}
            {mensajeWriter && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  color: '#15803d',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <CheckCircle2 size={16} /> {mensajeWriter}
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  color: '#dc2626',
                  fontSize: '0.82rem',
                  fontWeight: '600'
                }}
              >
                {error}
              </div>
            )}

            {/* BARRA INFORMATIVA DE ESTADÍSTICAS DEL ESCRITO */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: '#f1f5f9',
                borderRadius: '6px',
                fontSize: '0.78rem',
                color: '#475569',
                border: '1px solid #cbd5e1'
              }}
            >
              <div className="row" style={{ gap: '16px' }}>
                <span>Palabras: <strong style={{ color: '#0f172a' }}>{stats.palabras}</strong></span>
                <span>Líneas: <strong style={{ color: '#0f172a' }}>{stats.lineas}</strong></span>
                <span>Caracteres: <strong style={{ color: '#0f172a' }}>{stats.caracteres}</strong></span>
              </div>
              <span>Salida: <strong style={{ color: '#059669' }}>Doc `.docx` / `.odt`</strong></span>
            </div>

            {/* EDITOR DE TEXTO EN VIVO INTEGRADO (LIGHT THEME) */}
            <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
              <textarea
                value={escritoResultado}
                onChange={(e) => setEscritoResultado(e.target.value)}
                style={{
                  width: '100%',
                  flex: 1,
                  height: '100%',
                  minHeight: '400px',
                  fontFamily: '"Fira Code", "Courier New", monospace',
                  fontSize: '0.92rem',
                  lineHeight: '1.75',
                  background: '#f8fafc',
                  color: '#0f172a',
                  padding: '18px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  resize: 'none',
                  outline: 'none',
                  fontWeight: '500'
                }}
                placeholder="El escrito procesal redactado aparecerá aquí..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
