import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  BookOpen, 
  Gavel, 
  Copy, 
  ExternalLink,
  ShieldCheck,
  Flame,
  ChevronRight,
  ArrowRight,
  HelpCircle,
  FileText
} from 'lucide-react';
import { CATALOGO_PLAZOS, calcularPlazoCPC, calcularPlazoCPP, calcularPlazoLaboralAdmin, formatearFechaEs } from '../utils/plazosChile';
import { MOCK_CASOS } from '../mockData';

export default function CalculadoraTerminos({ onSelectCaso }) {
  const [codigoActivo, setCodigoActivo] = useState('CPC'); // 'CPC' o 'CPP'
  const [procSeleccionadoId, setProcSeleccionadoId] = useState('cpc-ord-1');
  const [procSeleccionado, setProcSeleccionado] = useState(null);
  const [fechaNotificacion, setFechaNotificacion] = useState(new Date().toISOString().split('T')[0]);
  const [diasPersonalizados, setDiasPersonalizados] = useState(15);
  const [esHaciaAtras, setEsHaciaAtras] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [casoVinculado, setCasoVinculado] = useState(MOCK_CASOS[0].id);
  const [copiado, setCopiado] = useState(false);

  // Actualizar el procedimiento seleccionado cuando cambia el ID o el código
  useEffect(() => {
    const catalogo = CATALOGO_PLAZOS[codigoActivo];
    let encontrado = null;
    for (const cat of catalogo) {
      for (const p of cat.procedimientos) {
        if (p.id === procSeleccionadoId) {
          encontrado = p;
          break;
        }
      }
      if (encontrado) break;
    }

    // Si cambiamos de código y el id no corresponde, tomamos el primero
    if (!encontrado) {
      encontrado = catalogo[0].procedimientos[0];
      setProcSeleccionadoId(encontrado.id);
    }

    setProcSeleccionado(encontrado);
    setDiasPersonalizados(encontrado.dias);
    setEsHaciaAtras(!!encontrado.esHaciaAtras);
  }, [codigoActivo, procSeleccionadoId]);

  // Recalcular automáticamente
  useEffect(() => {
    if (!fechaNotificacion || !diasPersonalizados) return;

    if (codigoActivo === 'CPC') {
      const res = calcularPlazoCPC(fechaNotificacion, parseInt(diasPersonalizados, 10), esHaciaAtras);
      setResultado(res);
    } else if (codigoActivo === 'CPP') {
      const res = calcularPlazoCPP(fechaNotificacion, parseInt(diasPersonalizados, 10), esHaciaAtras);
      setResultado(res);
    } else {
      const res = calcularPlazoLaboralAdmin(fechaNotificacion, parseInt(diasPersonalizados, 10), esHaciaAtras);
      setResultado(res);
    }
  }, [codigoActivo, fechaNotificacion, diasPersonalizados, esHaciaAtras]);

  // Nombre del cuerpo legal y del tipo de cómputo según el código activo.
  // Ojo: LAB_ADMIN no es penal; antes caía en el 'else' y el certificado citaba
  // el Art. 14 CPP en un plazo laboral.
  const CUERPOS_LEGALES = {
    CPC: {
      nombre: 'Código de Procedimiento Civil (CPC Chile)',
      computo: 'días hábiles civiles (Art. 66 CPC)'
    },
    CPP: {
      nombre: 'Código Procesal Penal (CPP Chile)',
      computo: 'días corridos (Art. 14 CPP)'
    },
    LAB_ADMIN: {
      nombre: 'Código del Trabajo / Ley 19.968 / Ley 19.880 (Chile)',
      computo: 'días hábiles de lunes a viernes (Art. 445 CT)'
    }
  };

  // Generar minuta judicial para el portapapeles
  const copiarMinuta = () => {
    if (!resultado || !procSeleccionado) return;

    const cuerpoLegal = CUERPOS_LEGALES[codigoActivo] || CUERPOS_LEGALES.CPC;

    const texto = `=== CERTIFICADO DE CÓMPUTO DE PLAZO JUDICIAL (LEXCONTROL) ===
Código: ${cuerpoLegal.nombre}
Actuación / Hito: ${procSeleccionado.nombre}
Normativa Legal: ${procSeleccionado.articulo}
${esHaciaAtras ? 'Fecha de la Audiencia / Hito Base' : 'Fecha de Notificación / Hito Base'}: ${formatearFechaEs(fechaNotificacion)}
Plazo Legal: ${diasPersonalizados} ${cuerpoLegal.computo} ${esHaciaAtras ? '(contados hacia atrás desde la audiencia)' : ''}

>>> FECHA FATAL DE VENCIMIENTO: ${resultado.fechaVencimientoTexto.toUpperCase()} <<<
${resultado.observacionProrroga ? '\n' + resultado.observacionProrroga + '\n' : ''}
Cómputo certificado y verificado mediante calendario oficial de feriados legales de Chile.
Generado por LexControl - Inteligencia y Litigación Estratégica.`;

    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  return (
    <div className="animate-fade-in">
      {/* Top Header */}
      <div className="top-header">
        <div className="header-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-yellow">Motor Legal Procesal Chile</span>
            <span className="badge badge-cyan">Art. 66 CPC & Art. 14 CPP</span>
          </div>
          <h1>Calculadora Automatizada de Términos Judiciales</h1>
          <p>
            Cómputo instantáneo y certero de plazos fatales para juicios civiles, penales, laborales y recursos procesales según la legislación chilena.
          </p>
        </div>
        <button 
          className="btn-gold" 
          onClick={() => alert("Simulación: El plazo ha sido registrado en la agenda del estudio y notificado al socio responsable del caso con alerta SMS/Email 24h antes del vencimiento.")}
        >
          <Calendar size={18} />
          <span>Agendar Plazo en Caso</span>
        </button>
      </div>

      {/* Selector de Código Procesal (Pestañas Superiores) */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => setCodigoActivo('CPC')}
          style={{
            flex: 1,
            padding: '18px 24px',
            borderRadius: '16px',
            background: codigoActivo === 'CPC' 
              ? 'linear-gradient(135deg, rgba(0, 240, 255, 0.15) 0%, rgba(0, 102, 255, 0.15) 100%)' 
              : 'var(--bg-card)',
            border: codigoActivo === 'CPC' ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            boxShadow: codigoActivo === 'CPC' ? 'var(--shadow-glow-cyan)' : 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'left' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '12px', 
              background: codigoActivo === 'CPC' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <Gavel size={24} color={codigoActivo === 'CPC' ? '#000' : 'var(--text-muted)'} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Procedimiento Civil (CPC)
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, marginTop: '2px' }}>
                ⚖️ <strong>Días Hábiles</strong> (Excluye domingos y feriados. ¡Sábados son hábiles!)
              </p>
            </div>
          </div>
          <span className={`badge ${codigoActivo === 'CPC' ? 'badge-cyan' : 'badge-blue'}`}>Art. 66 CPC</span>
        </button>

        <button
          onClick={() => setCodigoActivo('CPP')}
          style={{
            flex: 1,
            padding: '18px 24px',
            borderRadius: '16px',
            background: codigoActivo === 'CPP' 
              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.15) 100%)' 
              : 'var(--bg-card)',
            border: codigoActivo === 'CPP' ? '2px solid var(--accent-gold)' : '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            boxShadow: codigoActivo === 'CPP' ? 'var(--shadow-glow-gold)' : 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'left' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '12px', 
              background: codigoActivo === 'CPP' ? 'var(--accent-gold)' : 'rgba(255,255,255,0.05)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <ShieldCheck size={24} color={codigoActivo === 'CPP' ? '#000' : 'var(--text-muted)'} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Procesal Penal (CPP)
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, marginTop: '2px' }}>
                ⚡ <strong>Días Corridos</strong> (Prórroga Art. 14 si vence en domingo o feriado)
              </p>
            </div>
          </div>
          <span className={`badge ${codigoActivo === 'CPP' ? 'badge-yellow' : 'badge-blue'}`}>Art. 14 CPP</span>
        </button>

        <button
          onClick={() => setCodigoActivo('LAB_ADMIN')}
          style={{
            flex: 1,
            padding: '18px 24px',
            borderRadius: '16px',
            background: codigoActivo === 'LAB_ADMIN' 
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%)' 
              : 'var(--bg-card)',
            border: codigoActivo === 'LAB_ADMIN' ? '2px solid var(--alert-green)' : '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            boxShadow: codigoActivo === 'LAB_ADMIN' ? '0 0 25px rgba(16, 185, 129, 0.3)' : 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'left' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '12px', 
              background: codigoActivo === 'LAB_ADMIN' ? 'var(--alert-green)' : 'rgba(255,255,255,0.05)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              <BookOpen size={24} color={codigoActivo === 'LAB_ADMIN' ? '#000' : 'var(--text-muted)'} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Laboral & Admin
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, marginTop: '2px' }}>
                📋 <strong>Lunes a Viernes</strong> (Excluye sábados, domingos y feriados chilenos)
              </p>
            </div>
          </div>
          <span className={`badge ${codigoActivo === 'LAB_ADMIN' ? 'badge-green' : 'badge-blue'}`}>Art. 445 CT</span>
        </button>
      </div>

      {/* Grid de Formulario de Cálculo + Resultado INMEDIATO */}
      <div className="grid-7-5" style={{ alignItems: 'flex-start' }}>
        
        {/* Columna Izquierda: Parámetros del Cálculo */}
        <div className="glass-card" style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calculator size={20} color="var(--accent-cyan)" />
            1. Configuración de Parámetros y Hito
          </h2>

          {/* Selector de Procedimiento Agrupado */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Seleccionar Tipo de Procedimiento y Actuación Legal:
            </label>
            <select
              value={procSeleccionadoId}
              onChange={(e) => setProcSeleccionadoId(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-modal)',
                color: '#fff',
                border: '1px solid var(--border-hover)',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontFamily: 'var(--font-body)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {CATALOGO_PLAZOS[codigoActivo].map((grupo, idx) => (
                <optgroup key={idx} label={`📌 ${grupo.categoria}`} style={{ background: '#0a0f1d', color: 'var(--accent-gold)', fontWeight: '700' }}>
                  {grupo.procedimientos.map((proc) => (
                    <option key={proc.id} value={proc.id} style={{ color: '#fff', padding: '8px 0' }}>
                      {proc.nombre} ({proc.dias} días - {proc.articulo})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {procSeleccionado && (
              <div style={{ marginTop: '12px', padding: '14px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '700', color: codigoActivo === 'CPC' ? 'var(--accent-cyan)' : 'var(--accent-gold)' }}>
                    📖 Fundamentación Legal: {procSeleccionado.articulo}
                  </span>
                  <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>
                    {codigoActivo === 'CPC' ? 'Días Hábiles Civiles' : 'Días Corridos Penales'}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                  {procSeleccionado.descripcion}
                </p>
              </div>
            )}
          </div>

          {/* Selector de Fecha y Días Custom */}
          <div className="grid-2" style={{ marginBottom: '20px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                📅 {esHaciaAtras ? 'Fecha Audiencia / Hito Base:' : 'Fecha de Notificación / Resolución:'}
              </label>
              <input
                type="date"
                value={fechaNotificacion}
                onChange={(e) => setFechaNotificacion(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-modal)',
                  color: '#fff',
                  border: '1px solid var(--border-hover)',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '0.95rem',
                  fontFamily: 'var(--font-body)',
                  outline: 'none',
                  colorScheme: 'dark'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                ⏱️ Plazo en Días ({codigoActivo === 'CPC' ? 'Hábiles' : 'Corridos'}):
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={diasPersonalizados}
                  onChange={(e) => setDiasPersonalizados(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-modal)',
                    color: '#fff',
                    border: '1px solid var(--border-hover)',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    fontSize: '1rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: '700',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {esHaciaAtras ? 'antes' : 'días'}
                </span>
              </div>
            </div>
          </div>

          {/* Opción de Cómputo hacia atrás o adelante */}
          {codigoActivo === 'CPP' && (
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#a78bfa', display: 'block' }}>
                  🔄 Modalidad de Cómputo:
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {esHaciaAtras ? 'Se cuenta hacia atrás desde la fecha fijada para la audiencia (Ej. Art. 261 CPP)' : 'Se cuenta hacia adelante desde el día siguiente a la notificación'}
                </span>
              </div>
              <button 
                className="btn-secondary" 
                style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                onClick={() => setEsHaciaAtras(!esHaciaAtras)}
              >
                Cambiar a {esHaciaAtras ? 'Hacia Adelante' : 'Hacia Atrás'}
              </button>
            </div>
          )}

          {/* Vincular con Causa Activa del Estudio */}
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              📁 Vincular Plazo a Expediente Activo de LexControl:
            </label>
            <select
              value={casoVinculado}
              onChange={(e) => setCasoVinculado(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-modal)',
                color: '#fff',
                border: '1px solid var(--border-color)',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-body)',
                outline: 'none'
              }}
            >
              {MOCK_CASOS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rit} • {c.caratula} ({c.materia})
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Columna Derecha: TARJETA DE RESULTADO ESTRATÉGICO */}
        {resultado && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Tarjeta de Vencimiento Fatal (Destacado Máximo) */}
            <div className="glass-card" style={{ 
              padding: '30px', 
              background: codigoActivo === 'CPC'
                ? 'linear-gradient(135deg, rgba(0, 240, 255, 0.12) 0%, rgba(10, 15, 29, 0.9) 100%)'
                : 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(10, 15, 29, 0.9) 100%)',
              border: codigoActivo === 'CPC' ? '2px solid var(--accent-cyan)' : '2px solid var(--accent-gold)',
              boxShadow: codigoActivo === 'CPC' ? '0 0 35px rgba(0, 240, 255, 0.25)' : '0 0 35px rgba(245, 158, 11, 0.25)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span className={`badge ${codigoActivo === 'CPC' ? 'badge-cyan' : 'badge-yellow'}`} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                  VENCIMIENTO FATAL VERIFICADO
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>
                  {codigoActivo === 'CPC' ? 'Ley Procesal Civil' : 'Ley Procesal Penal'}
                </span>
              </div>

              <h3 style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>
                {procSeleccionado ? procSeleccionado.nombre : 'Actuación Legal'} ({procSeleccionado ? procSeleccionado.articulo : ''})
              </h3>

              {/* Fecha y Hora Exacta en Grande */}
              <div style={{ 
                fontSize: '1.75rem', 
                fontWeight: '800', 
                color: '#fff', 
                lineHeight: 1.2, 
                marginBottom: '16px',
                paddingBottom: '16px',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
              }}>
                {resultado.fechaVencimientoTexto.toUpperCase()}
              </div>

              {/* Alerta de Prórroga Art. 14 CPP (Si aplica) */}
              {resultado.observacionProrroga && (
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid var(--alert-red)',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px'
                }}>
                  <Flame size={22} color="var(--alert-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--alert-red)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                      PRÓRROGA AUTOMÁTICA ACTIVADA (ART. 14 CPP)
                    </span>
                    <p style={{ fontSize: '0.8rem', color: '#fca5a5', margin: 0, lineHeight: 1.4 }}>
                      {resultado.observacionProrroga}
                    </p>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>📅 Fecha Base: <strong style={{ color: '#fff' }}>{formatearFechaEs(fechaNotificacion)}</strong></span>
                <span>📊 Transcurridos: <strong style={{ color: codigoActivo === 'CPC' ? 'var(--accent-cyan)' : 'var(--accent-gold)' }}>{resultado.diasTotalesTranscurridos} días de calendario</strong></span>
              </div>

              {/* Botones de Acción Inmediata */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '22px' }}>
                <button 
                  className="btn-secondary" 
                  style={{ flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,0.08)' }}
                  onClick={copiarMinuta}
                >
                  <Copy size={16} color={copiado ? 'var(--alert-green)' : '#fff'} />
                  <span style={{ color: copiado ? 'var(--alert-green)' : '#fff' }}>
                    {copiado ? '¡Minuta Copiada!' : 'Copiar Certificado Judicial'}
                  </span>
                </button>
                <button 
                  className="btn-primary" 
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => alert(`Plazo para "${procSeleccionado.nombre}" vinculado exitosamente con el caso ${casoVinculado} en la agenda de LexControl.`)}
                >
                  <span>Agendar en Expediente</span>
                  <ArrowRight size={16} />
                </button>
              </div>

            </div>

            {/* Tarjeta 2: Desglose Analítico del Calendario (Día por Día) */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Calendar size={18} color="var(--accent-cyan)" />
                  Desglose del Calendario & Auditoría Procesal
                </h3>
                <span className="badge badge-purple">{resultado.desglose.length} Días Evaluados</span>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.4 }}>
                A continuación se presenta el examen día por día generado por LexControl, contrastando con el calendario oficial de feriados chilenos y las reglas de hábil/inhábil procesal:
              </p>

              {/* Lista scrollable de días */}
              <div style={{ 
                maxHeight: '340px', 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px',
                paddingRight: '6px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                paddingTop: '12px'
              }}>
                {resultado.desglose.map((item, idx) => {
                  const esExcluido = item.color === 'red';
                  const esProrroga = item.color === 'gold';
                  const esSabadoHabil = item.color === 'orange';

                  return (
                    <div 
                      key={idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        backgroundColor: esExcluido ? 'rgba(239, 68, 68, 0.08)' : esProrroga ? 'rgba(245, 158, 11, 0.18)' : esSabadoHabil ? 'rgba(249, 115, 22, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid',
                        borderColor: esExcluido ? 'rgba(239, 68, 68, 0.3)' : esProrroga ? 'rgba(245, 158, 11, 0.5)' : esSabadoHabil ? '#f97316' : 'var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.88rem',
                        boxShadow: esSabadoHabil ? '0 0 12px rgba(249, 115, 22, 0.15)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ 
                          fontFamily: 'var(--font-mono)', 
                          fontWeight: '800', 
                          minWidth: '65px',
                          color: esExcluido ? 'var(--alert-red)' : esProrroga ? 'var(--accent-gold)' : esSabadoHabil ? '#f97316' : 'var(--accent-cyan)' 
                        }}>
                          {item.numero || '---'}
                        </span>
                        <span style={{ color: '#fff', fontWeight: esSabadoHabil ? '800' : '600' }}>
                          {item.diaSemana} {item.fecha}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: esSabadoHabil ? '700' : '400', color: esExcluido ? '#fca5a5' : esSabadoHabil ? '#fdba74' : 'var(--text-secondary)' }}>
                          {item.observacion}
                        </span>
                        <span className={`badge ${esExcluido ? 'badge-red' : esProrroga ? 'badge-yellow' : esSabadoHabil ? 'badge-yellow' : 'badge-green'}`} style={{ fontSize: '0.68rem', fontWeight: '800', background: esSabadoHabil ? 'rgba(249, 115, 22, 0.25)' : undefined, color: esSabadoHabil ? '#ffedd5' : undefined }}>
                          {item.estado}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
