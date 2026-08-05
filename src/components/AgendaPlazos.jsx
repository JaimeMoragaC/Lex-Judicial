import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Clock3, 
  User, 
  Briefcase,
  Plus,
  Flame,
  ArrowRight,
  CheckSquare,
  Square,
  ListTodo,
  Edit3,
  Trash2,
  X,
  Filter,
  PlusCircle,
  ExternalLink
} from 'lucide-react';
import { MOCK_CASOS, DEFAULT_TAREAS } from '../mockData';
import { PJUD_CASOS } from '../pjudCausesData';
import { cargarAtencion, audienciasProximas } from '../utils/radarPlazos.js';
import { cargarTareas, guardarTareas, nuevaTarea } from '../utils/tareas.js';
import { cargarExpedientes } from '../utils/expedientes.js';
import PremiumCalendar from './PremiumCalendar';
import ModalRedactarDocumento from './ModalRedactarDocumento.jsx';


/** Ventana de "Audiencias Confirmadas en Tribunales": hoy + este tanto de días. */
const DIAS_AUDIENCIAS = 30;

export default function AgendaPlazos({ onSelectCaso, onOpenCrearExpediente }) {
  const [activeTab, setActiveTab] = useState('agenda');
  const [modoVistaTareas, setModoVistaTareas] = useState('kanban'); // 'kanban' | 'lista'
  const [tareasList, setTareasList] = useState([]);
  const [showRedactarModal, setShowRedactarModal] = useState(false);
  const [redactarModalGestion, setRedactarModalGestion] = useState(null);
  const [redactarModalCaso, setRedactarModalCaso] = useState(null);

  // Plazos REALES, por la misma vía que el Dashboard, el Radar y la Sidebar.
  //
  // Antes esta pantalla pintaba MOCK_PLAZOS_FATALES, que se derivaba únicamente de
  // las causas inventadas por la IA y traía "En 5 días" como texto en el campo de
  // fecha y `horasRestantes: plazoDias * 24`. O sea: una pantalla llamada "Plazos"
  // mostrando vencimientos fabricados y ninguno de los reales.
  const [plazosReales, setPlazosReales] = useState([]);
  const [cargandoPlazos, setCargandoPlazos] = useState(true);

  // Audiencias: sólo las que tengan fecha Y hora fijada por el tribunal -flag
  // `esAudiencia`, que pone el servidor únicamente cuando el análisis de un
  // documento la detectó explícitamente-. Antes se mostraba `proximaAudiencia`
  // de las causas que inventó la IA, rotuladas "CONFIRMADA POR GEMINI IA" — una
  // audiencia adivinada presentada como confirmada, que en una agenda judicial
  // es de las afirmaciones más caras que se pueden hacer.
  const [expedientesReales, setExpedientesReales] = useState([]);
  const audienciasConfirmadas = useMemo(
    () => audienciasProximas(expedientesReales, DIAS_AUDIENCIAS),
    [expedientesReales]
  );
  const [filtroCaso, setFiltroCaso] = useState('ALL');
  const [filtroEstado, setFiltroEstado] = useState('ALL');
  const [showTareaModal, setShowTareaModal] = useState(false);
  const [editingTareaIdx, setEditingTareaIdx] = useState(null);
  const [tareaForm, setTareaForm] = useState({
    casoRit: '',
    casoCaratula: '',
    casoId: '',
    titulo: '',
    fechaVencimiento: '',
    prioridad: 'ALTA',
    responsable: 'Jaime Moraga C.',
    notas: ''
  });

  // Las tareas vienen del servidor. cargarTareas() sube por única vez lo que
  // hubiera quedado en localStorage, así que no se pierde nada de lo anotado antes.
  useEffect(() => {
    cargarTareas()
      .then(setTareasList)
      .catch(() => setTareasList(DEFAULT_TAREAS));
  }, []);

  /** Persiste y avisa al resto del sistema. Única vía de escritura de la pantalla. */
  const persistirTareas = async (siguientes) => {
    setTareasList(siguientes);
    try {
      await guardarTareas(siguientes);
      window.dispatchEvent(new Event('lexcontrol_plazos_updated'));
    } catch (e) {
      alert('No se pudo guardar la tarea en el servidor: ' + e.message);
    }
  };

  useEffect(() => {
    cargarExpedientes().then(setExpedientesReales).catch(() => setExpedientesReales([]));

    const recargar = () =>
      cargarAtencion({ causas: [...MOCK_CASOS, ...PJUD_CASOS] })
        .then((r) => setPlazosReales(r.atencion))
        .catch(() => setPlazosReales([]))
        .finally(() => setCargandoPlazos(false));

    recargar();
    window.addEventListener('lexcontrol_plazos_updated', recargar);
    return () => window.removeEventListener('lexcontrol_plazos_updated', recargar);
  }, []);

  const handleOpenAddTarea = () => {
    setEditingTareaIdx(null);
    const primerCaso = [...MOCK_CASOS, ...PJUD_CASOS][0] || { rit: "ROL C-1869-2026", caratula: "MEDINA con MORAGA", id: "caso-temuco-1869" };
    setTareaForm({
      casoRit: primerCaso.rit || "ROL General",
      casoCaratula: primerCaso.caratula || "Causa General",
      casoId: primerCaso.id || "general",
      titulo: '',
      fechaVencimiento: new Date(Date.now() + 86400000 * 3).toLocaleDateString('es-CL'),
      prioridad: 'ALTA',
      responsable: 'Jaime Moraga C.',
      notas: ''
    });
    setShowTareaModal(true);
  };

  const handleOpenEditTarea = (index, tarea) => {
    setEditingTareaIdx(index);
    setTareaForm({ ...tarea });
    setShowTareaModal(true);
  };

  const handleSaveTarea = (e) => {
    e.preventDefault();
    if (!tareaForm.titulo.trim()) return alert("Debe ingresar la descripción o título de la tarea.");
    let updated = [...tareasList];
    if (editingTareaIdx !== null) {
      updated[editingTareaIdx] = { ...tareaForm };
    } else {
      const selectedCasoObj = [...MOCK_CASOS, ...PJUD_CASOS].find(c => c.rit === tareaForm.casoRit || c.id === tareaForm.casoId);
      updated.unshift({
        ...nuevaTarea(tareaForm),
        casoCaratula: selectedCasoObj ? selectedCasoObj.caratula : tareaForm.casoCaratula
      });
    }
    persistirTareas(updated);
    setShowTareaModal(false);
  };

  const handleToggleCompletada = (index) => {
    persistirTareas(tareasList.map((t, i) => (i === index ? { ...t, completada: !t.completada } : t)));
  };

  const handleDeleteTarea = (index) => {
    if (!window.confirm("¿Estás seguro de eliminar este pendiente o tarea del estudio?")) return;
    persistirTareas(tareasList.filter((_, idx) => idx !== index));
  };

  const tareasFiltradas = tareasList.filter(t => {
    if (filtroCaso !== 'ALL' && t.casoRit !== filtroCaso && t.casoId !== filtroCaso) return false;
    if (filtroEstado === 'PENDING' && t.completada) return false;
    if (filtroEstado === 'COMPLETED' && !t.completada) return false;
    return true;
  });

  const tareasActivasCount = tareasList.filter(t => !t.completada).length;

  const kanbanTareasData = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const finSemana = new Date(hoy);
    const dayOfWeek = hoy.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    finSemana.setDate(finSemana.getDate() + daysUntilSunday);
    finSemana.setHours(23, 59, 59, 999);

    const parseFechaStr = (str) => {
      if (!str) return null;
      const s = String(str).trim();
      const partes = s.split('/');
      if (partes.length === 3) {
        const d = parseInt(partes[0], 10);
        const m = parseInt(partes[1], 10) - 1;
        const y = parseInt(partes[2], 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m, d);
      }
      const partesDash = s.split('-');
      if (partesDash.length === 3) {
        const y = parseInt(partesDash[0], 10);
        const m = parseInt(partesDash[1], 10) - 1;
        const d = parseInt(partesDash[2], 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m, d);
      }
      return null;
    };

    const colManana = [];
    const colRestoSemana = [];
    const colDemasPendientes = [];

    tareasFiltradas.forEach((tarea) => {
      if (tarea.completada) return;
      const targetDate = parseFechaStr(tarea.fechaVencimiento);

      if (targetDate) {
        targetDate.setHours(0, 0, 0, 0);
        if (targetDate.getTime() === manana.getTime()) {
          colManana.push(tarea);
        } else if (targetDate > manana && targetDate <= finSemana) {
          colRestoSemana.push(tarea);
        } else {
          colDemasPendientes.push(tarea);
        }
      } else {
        colDemasPendientes.push(tarea);
      }
    });

    return { colManana, colRestoSemana, colDemasPendientes };
  }, [tareasFiltradas]);

  return (
    <div className="animate-fade-in">
      {/* Top Header */}
      <div className="top-header">
        <div className="header-title">
          <h1>Agenda Procesal & Gestor de Tareas Vinculadas</h1>
          <p>Control centralizado de plazos fatales, audiencias confirmadas y asignación de pendientes procesales por expediente.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            className="btn-primary" 
            onClick={() => {
              if (onOpenCrearExpediente) onOpenCrearExpediente();
              else window.dispatchEvent(new CustomEvent('lexcontrol_open_crear_expediente'));
            }}
          >
            <Briefcase size={18} />
            <span>+ Nuevo Expediente</span>
          </button>
          <button className="btn-primary" style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))', fontWeight: '700' }} onClick={handleOpenAddTarea}>
            <PlusCircle size={18} />
            <span>+ Nueva Tarea</span>
          </button>
          <button className="btn-secondary" onClick={() => alert("Simulación: Sincronizando con calendario judicial del Poder Judicial / Oficina Judicial Virtual.")}>
            <Calendar size={18} />
            <span>Sincronizar PJUD</span>
          </button>
        </div>
      </div>

      {/* Barra de Navegación de Pestañas de Agenda */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('agenda')}
          style={{
            padding: '12px 20px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'agenda' ? 'rgba(192, 160, 113, 0.15)' : 'transparent',
            color: activeTab === 'agenda' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            fontWeight: '700',
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: activeTab === 'agenda' ? '3px solid var(--accent-cyan)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          <Calendar size={18} />
          <span>📅 Calendario de Audiencias & Plazos Fatales</span>
        </button>

        <button
          onClick={() => setActiveTab('tareas')}
          style={{
            padding: '12px 20px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'tareas' ? 'rgba(125, 133, 144, 0.15)' : 'transparent',
            color: activeTab === 'tareas' ? 'var(--accent-purple)' : 'var(--text-secondary)',
            fontWeight: '700',
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: activeTab === 'tareas' ? '3px solid var(--accent-purple)' : 'none',
            transition: 'all 0.2s',
            boxShadow: activeTab === 'tareas' ? 'var(--shadow-glow-purple)' : 'none'
          }}
        >
          <ListTodo size={18} />
          <span>📋 Tareas & Pendientes por Causa ({tareasActivasCount} Activas)</span>
        </button>
      </div>

      {/* PESTAÑA 1: AGENDA Y PLAZOS FATALES */}
      {activeTab === 'agenda' && (
        <div className="animate-fade-in">
          
          <div style={{ marginBottom: '40px' }}>
            <PremiumCalendar onSelectCaso={onSelectCaso} />
          </div>

          {/* Sección 1: Plazos Fatales Críticos */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Flame size={22} color="var(--alert-red)" />
              <h2 style={{ fontSize: '1.35rem', color: 'var(--text-primary)', margin: 0 }}>
                Términos Fatales en Cuenta Regresiva
              </h2>
              <span className="badge badge-red">
                {cargandoPlazos ? 'cargando…' : `${plazosReales.length} en cuenta regresiva`}
              </span>
            </div>

            {!cargandoPlazos && plazosReales.length === 0 && (
              <div className="glass-card" style={{ padding: '24px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                  No hay plazos ni trámites que venzan hoy. Los plazos fatales se agregan desde
                  Cómputo de Términos con «Vigilar en el radar»; las gestiones pendientes viven en
                  el Radar de Plazos.
                </p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
              {plazosReales.map((plazo) => {
                const isCritical = plazo.esCritico;
                const isHigh = !isCritical;

                return (
                  <div 
                    key={plazo.id}
                    className="glass-card"
                    style={{
                      padding: '24px',
                      borderTop: isCritical ? '4px solid var(--alert-red)' : isHigh ? '4px solid var(--accent-gold)' : '4px solid var(--alert-blue)',
                      background: isCritical ? 'linear-gradient(180deg, rgba(207, 95, 87, 0.12) 0%, var(--bg-card) 100%)' : 'var(--bg-card)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <span style={{ 
                        fontSize: '0.8rem', 
                        fontWeight: '800', 
                        fontFamily: 'var(--font-mono)',
                        color: isCritical ? 'var(--alert-red)' : isHigh ? 'var(--accent-gold)' : 'var(--accent-cyan)' 
                      }}>
                        {plazo.casoRit}
                      </span>
                      {/* Un plazo fatal se calculó con el motor procesal; un trámite
                          sólo tiene la fecha que se le puso. La consecuencia de
                          dejarlos pasar no es la misma, así que se distingue. */}
                      <span className={`badge ${plazo.esFatal ? 'badge-red' : 'badge-yellow'}`}>
                        {plazo.esFatal ? 'Plazo fatal' : 'Trámite'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                      {plazo.caratulaMostrada}
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '16px', lineHeight: 1.4 }}>
                      {plazo.titulo}
                    </p>

                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-color)',
                      marginBottom: '16px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        <Clock size={16} color={isCritical ? 'var(--alert-red)' : 'var(--accent-gold)'} />
                        <span>
                          {plazo.esFatal ? 'Vence' : 'Trámite'}:{' '}
                          <strong style={{ color: 'var(--text-primary)' }}>{plazo.fechaMostrada}</strong>
                        </span>
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.85rem',
                        fontWeight: '800',
                        color: isCritical ? 'var(--alert-red)' : 'var(--accent-gold)'
                      }}>
                        {plazo.etiquetaTiempo}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span>Abogado: <strong>Jaime Moraga C.</strong></span>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        onClick={() => {
                          const caso = [...MOCK_CASOS, ...PJUD_CASOS].find((c) => c.rit === plazo.casoRit || c.id === plazo.casoId);
                          if (caso && onSelectCaso) onSelectCaso(caso);
                          else alert(`No se encontró la ficha de ${plazo.casoRit}. Ábrela desde Mis Casos & Expedientes.`);
                        }}
                      >
                        Abrir ficha →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sección 2: Calendario de Audiencias Confirmadas */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Calendar size={22} color="var(--accent-cyan)" />
              <h2 style={{ fontSize: '1.35rem', color: 'var(--text-primary)', margin: 0 }}>
                Audiencias Confirmadas en Tribunales
              </h2>
              <span className="badge badge-cyan">Próximos {DIAS_AUDIENCIAS} días</span>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              {audienciasConfirmadas.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                  No hay audiencias con fecha confirmada por el tribunal en los próximos {DIAS_AUDIENCIAS} días.
                  Sólo entran acá las que un documento analizado trajo con fecha explícita -nunca una adivinada
                  por la IA a partir del texto-.
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {audienciasConfirmadas.map((aud, index) => {
                  const [, mes, dia] = aud.fecha.split('-');
                  return (
                  <div
                    key={aud.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px',
                      padding: '18px 20px',
                      borderRadius: '12px',
                      background: index === 0 ? 'rgba(192, 160, 113, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      borderLeft: index === 0 ? '4px solid var(--accent-cyan)' : '4px solid #8b5cf6'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px', flex: '1', minWidth: '320px' }}>
                      <div style={{
                        padding: '12px',
                        borderRadius: '10px',
                        background: index === 0 ? 'rgba(192, 160, 113, 0.15)' : 'rgba(125, 133, 144, 0.15)',
                        textAlign: 'center',
                        minWidth: '70px'
                      }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: index === 0 ? 'var(--accent-cyan)' : 'var(--text-secondary)', display: 'block', textTransform: 'uppercase' }}>
                          {dia}/{mes}
                        </span>
                        <span style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                          {aud.hora || '—'}
                        </span>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--accent-gold)', textTransform: 'uppercase' }}>
                            {aud.tribunal || 'Tribunal no especificado'}
                          </span>
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>{aud.casoRit}</span>
                        </div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {aud.caratula}
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                          ⚡ <strong>Trámite:</strong> {aud.tramite}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px' }} onClick={() => alert(`Preparando carpeta y minutas para la audiencia en ${aud.tribunal}`)}>
                        📂 Minuta Audiencia
                      </button>
                      <button className="btn-primary" style={{ fontSize: '0.8rem', padding: '8px 14px' }} onClick={() => alert(`Conectando con estrado / Sala Zoom para ${aud.caratula}`)}>
                        <span>Ingresar a Sala</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: GESTOR DE TAREAS & PENDIENTES */}
      {activeTab === 'tareas' && (
        <div className="animate-fade-in">
          {/* Modal de Creación / Edición de Tarea */}
          {showTareaModal && (
            <div style={{
              margin: '0 0 24px 0',
              padding: '24px',
              borderRadius: '14px',
              background: 'rgba(15, 23, 42, 0.98)',
              border: '2px solid var(--accent-purple)',
              boxShadow: '0 15px 35px rgba(0,0,0,0.7)',
              animation: 'fadeIn 0.2s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit3 size={20} color="var(--accent-purple)" />
                  {editingTareaIdx !== null ? "Modificar Pendiente Procesal" : "Asignar Nueva Tarea o Pendiente a una Causa"}
                </h3>
                <button onClick={() => setShowTareaModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveTarea} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600' }}>🔗 Expediente / Causa Vinculada</label>
                    <select 
                      value={tareaForm.casoRit} 
                      onChange={e => {
                        const selected = [...MOCK_CASOS, ...PJUD_CASOS].find(c => c.rit === e.target.value);
                        setTareaForm({
                          ...tareaForm,
                          casoRit: e.target.value,
                          casoCaratula: selected ? selected.caratula : "Causa General",
                          casoId: selected ? selected.id : "gen"
                        });
                      }}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-raised)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                    >
                      <option value="ROL C-1869-2026">ROL C-1869-2026 - MEDINA con MORAGA (Temuco)</option>
                      {[...MOCK_CASOS, ...PJUD_CASOS].map((c, idx) => (
                        <option key={idx} value={c.rit || `rol-${idx}`}>
                          {c.rit || 'Sin ROL'} - {c.caratula || 'Sin Carátula'}
                        </option>
                      ))}
                      <option value="ROL General">📌 Gestión General del Estudio</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600' }}>📅 Fecha Límite / Plazo</label>
                    <input 
                      type="text" 
                      value={tareaForm.fechaVencimiento} 
                      onChange={e => setTareaForm({ ...tareaForm, fechaVencimiento: e.target.value })}
                      placeholder="DD/MM/AAAA"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600' }}>⚡ Prioridad</label>
                    <select 
                      value={tareaForm.prioridad} 
                      onChange={e => setTareaForm({ ...tareaForm, prioridad: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-raised)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                    >
                      <option value="CRITICA">🔥 CRÍTICA (Plazo fatal inmediato)</option>
                      <option value="ALTA">🟡 ALTA (Relevante para estrategia)</option>
                      <option value="NORMAL">🔵 NORMAL (Trámite ordinario)</option>
                      <option value="BAJA">⚪ BAJA (Gestión interna)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600' }}>👤 Abogado / Responsable</label>
                    <input 
                      type="text" 
                      value={tareaForm.responsable} 
                      onChange={e => setTareaForm({ ...tareaForm, responsable: e.target.value })}
                      placeholder="Ej: Jaime Moraga C. / Procurador"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600' }}>📋 Título de la Actividad o Pendiente (Acción a realizar)</label>
                  <input 
                    type="text" 
                    value={tareaForm.titulo} 
                    onChange={e => setTareaForm({ ...tareaForm, titulo: e.target.value })}
                    placeholder="Ej: Redactar pliego de posiciones para absolución / Solicitar copia autorizada de audio"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: '600' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600' }}>📝 Instrucciones, Notas o Referencia Jurídica</label>
                  <textarea 
                    rows={2}
                    value={tareaForm.notas} 
                    onChange={e => setTareaForm({ ...tareaForm, notas: e.target.value })}
                    placeholder="Ej: Revisar jurisprudencia adjunta en carpeta. Acompañar con citación al tribunal..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => setShowTareaModal(false)}
                    style={{ padding: '10px 18px', fontSize: '0.9rem' }}
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary" 
                    style={{ padding: '10px 24px', fontSize: '0.9rem', background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))', fontWeight: '700' }}
                  >
                    {editingTareaIdx !== null ? "💾 Guardar Cambios" : "➕ Vincular Tarea a la Causa"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Barra de Filtros, Selector de Vista & Búsqueda */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                <Filter size={16} color="var(--accent-cyan)" /> Filtrar Tareas:
              </span>
              <select 
                value={filtroCaso} 
                onChange={e => setFiltroCaso(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-raised)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="ALL">📂 Todas las causas y pendientes</option>
                <option value="ROL C-1869-2026">ROL C-1869-2026 - MEDINA con MORAGA</option>
                {[...MOCK_CASOS, ...PJUD_CASOS].map((c, idx) => (
                  <option key={idx} value={c.rit || c.id}>{c.rit} - {c.caratula}</option>
                ))}
              </select>

              <select 
                value={filtroEstado} 
                onChange={e => setFiltroEstado(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-raised)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="ALL">⚡ Todos los estados</option>
                <option value="PENDING">⏳ Solo Pendientes / Activas</option>
                <option value="COMPLETED">✓ Solo Completadas</option>
              </select>
            </div>

            {/* CONMUTADOR DE MODO KANBAN VS LISTA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setModoVistaTareas('kanban')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  background: modoVistaTareas === 'kanban' ? 'rgba(74, 163, 199, 0.2)' : 'transparent',
                  color: modoVistaTareas === 'kanban' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  border: modoVistaTareas === 'kanban' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                  cursor: 'pointer'
                }}
              >
                📊 Tablero Kanban (3 Col)
              </button>
              <button
                type="button"
                onClick={() => setModoVistaTareas('lista')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  background: modoVistaTareas === 'lista' ? 'rgba(74, 163, 199, 0.2)' : 'transparent',
                  color: modoVistaTareas === 'lista' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  border: modoVistaTareas === 'lista' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                  cursor: 'pointer'
                }}
              >
                📋 Vista Lista
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Mostrando <strong>{tareasFiltradas.length}</strong> de <strong>{tareasList.length}</strong> tareas registradas
            </div>
          </div>

          {/* RENDERIZADO MODO TABLERO KANBAN DE 3 COLUMNAS */}
          {modoVistaTareas === 'kanban' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {/* COLUMNA 1: GESTIONES / PENDIENTES DE MAÑANA */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(234, 179, 8, 0.2)', paddingBottom: '10px' }}>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🌅 Mañana ({kanbanTareasData.colManana.length})
                  </strong>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(234, 179, 8, 0.2)', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                    Urgente
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '120px' }}>
                  {kanbanTareasData.colManana.length === 0 ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                      Sin pendientes para mañana
                    </div>
                  ) : (
                    kanbanTareasData.colManana.map((tarea) => {
                      const indexInList = tareasList.findIndex(t => t.id === tarea.id);
                      return (
                        <div
                          key={tarea.id}
                          className="glass-card"
                          style={{
                            padding: '14px',
                            borderRadius: '10px',
                            borderLeft: '4px solid var(--accent-gold)',
                            background: 'var(--bg-card)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                              {tarea.casoRit}
                            </span>
                            <button
                              onClick={() => handleToggleCompletada(indexInList)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                              title="Marcar como completada"
                            >
                              <Square size={18} color="var(--text-muted)" />
                            </button>
                          </div>
                          <h5 style={{ fontSize: '0.88rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                            {tarea.titulo}
                          </h5>
                          {tarea.notas && (
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>
                              "{tarea.notas}"
                            </p>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                              📅 {tarea.fechaVencimiento}
                            </span>
                            <button
                              className="btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '0.72rem', color: 'var(--accent-color, #4aa3c7)' }}
                              onClick={() => {
                                setRedactarModalGestion({ tramite: tarea.titulo, textoOriginal: tarea.notas });
                                setRedactarModalCaso({ rit: tarea.casoRit, caratula: tarea.casoCaratula });
                                setShowRedactarModal(true);
                              }}
                            >
                              ✍️ Redactar
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* COLUMNA 2: GESTIONES EN LO QUE QUEDA DE LA SEMANA */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(168, 85, 247, 0.2)', paddingBottom: '10px' }}>
                  <strong style={{ fontSize: '0.95rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📅 Resto de la Semana ({kanbanTareasData.colRestoSemana.length})
                  </strong>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontWeight: 'bold' }}>
                    Esta Semana
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '120px' }}>
                  {kanbanTareasData.colRestoSemana.length === 0 ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                      Sin pendientes en lo que queda de semana
                    </div>
                  ) : (
                    kanbanTareasData.colRestoSemana.map((tarea) => {
                      const indexInList = tareasList.findIndex(t => t.id === tarea.id);
                      return (
                        <div
                          key={tarea.id}
                          className="glass-card"
                          style={{
                            padding: '14px',
                            borderRadius: '10px',
                            borderLeft: '4px solid #c084fc',
                            background: 'var(--bg-card)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                              {tarea.casoRit}
                            </span>
                            <button
                              onClick={() => handleToggleCompletada(indexInList)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                              title="Marcar como completada"
                            >
                              <Square size={18} color="var(--text-muted)" />
                            </button>
                          </div>
                          <h5 style={{ fontSize: '0.88rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                            {tarea.titulo}
                          </h5>
                          {tarea.notas && (
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>
                              "{tarea.notas}"
                            </p>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: '0.72rem', color: '#c084fc', fontWeight: 'bold' }}>
                              📅 {tarea.fechaVencimiento}
                            </span>
                            <button
                              className="btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '0.72rem', color: 'var(--accent-color, #4aa3c7)' }}
                              onClick={() => {
                                setRedactarModalGestion({ tramite: tarea.titulo, textoOriginal: tarea.notas });
                                setRedactarModalCaso({ rit: tarea.casoRit, caratula: tarea.casoCaratula });
                                setShowRedactarModal(true);
                              }}
                            >
                              ✍️ Redactar
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* COLUMNA 3: TODAS LAS DEMÁS PENDIENTES */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid rgba(74, 163, 199, 0.3)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(74, 163, 199, 0.2)', paddingBottom: '10px' }}>
                  <strong style={{ fontSize: '0.95rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📋 Resto de Pendientes ({kanbanTareasData.colDemasPendientes.length})
                  </strong>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(74, 163, 199, 0.2)', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>
                    General
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '120px' }}>
                  {kanbanTareasData.colDemasPendientes.length === 0 ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                      No hay más pendientes registradas
                    </div>
                  ) : (
                    kanbanTareasData.colDemasPendientes.map((tarea) => {
                      const indexInList = tareasList.findIndex(t => t.id === tarea.id);
                      return (
                        <div
                          key={tarea.id}
                          className="glass-card"
                          style={{
                            padding: '14px',
                            borderRadius: '10px',
                            borderLeft: '4px solid var(--accent-cyan)',
                            background: 'var(--bg-card)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                              {tarea.casoRit}
                            </span>
                            <button
                              onClick={() => handleToggleCompletada(indexInList)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                              title="Marcar como completada"
                            >
                              <Square size={18} color="var(--text-muted)" />
                            </button>
                          </div>
                          <h5 style={{ fontSize: '0.88rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                            {tarea.titulo}
                          </h5>
                          {tarea.notas && (
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, fontStyle: 'italic' }}>
                              "{tarea.notas}"
                            </p>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                              📅 {tarea.fechaVencimiento || 'Sin plazo'}
                            </span>
                            <button
                              className="btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '0.72rem', color: 'var(--accent-color, #4aa3c7)' }}
                              onClick={() => {
                                setRedactarModalGestion({ tramite: tarea.titulo, textoOriginal: tarea.notas });
                                setRedactarModalCaso({ rit: tarea.casoRit, caratula: tarea.casoCaratula });
                                setShowRedactarModal(true);
                              }}
                            >
                              ✍️ Redactar
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Lista Estándar de Tarjetas de Tareas */
            tareasFiltradas.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                <ListTodo size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', margin: 0 }}>No hay tareas o pendientes procesales que coincidan con los filtros.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {tareasFiltradas.map((tarea) => {
                const indexInList = tareasList.findIndex(t => t.id === tarea.id);
                const isCritica = tarea.prioridad === 'CRITICA';
                const isAlta = tarea.prioridad === 'ALTA';
                const isCompletada = tarea.completada;

                return (
                  <div 
                    key={tarea.id || indexInList}
                    className="glass-card"
                    style={{
                      padding: '18px 22px',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)',
                      borderLeft: isCritica ? '4px solid var(--alert-red)' : isAlta ? '4px solid var(--accent-gold)' : '4px solid var(--accent-cyan)',
                      background: isCompletada ? 'rgba(255, 255, 255, 0.01)' : isCritica ? 'linear-gradient(90deg, rgba(207, 95, 87, 0.08) 0%, rgba(255,255,255,0.02) 100%)' : 'rgba(255, 255, 255, 0.02)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px',
                      opacity: isCompletada ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: '1', minWidth: '300px' }}>
                      <button 
                        onClick={() => handleToggleCompletada(indexInList)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: isCompletada ? 'var(--alert-green)' : 'var(--text-muted)', marginTop: '2px' }}
                        title={isCompletada ? "Marcar como pendiente" : "Marcar como completada"}
                      >
                        {isCompletada ? <CheckSquare size={22} color="var(--alert-green)" /> : <Square size={22} />}
                      </button>

                      <div style={{ flex: '1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span 
                            onClick={() => {
                              if (onSelectCaso) {
                                const c = [...MOCK_CASOS, ...PJUD_CASOS].find(caseItem => caseItem.rit === tarea.casoRit || caseItem.id === tarea.casoId);
                                if (c) onSelectCaso(c);
                              }
                            }}
                            style={{ fontSize: '0.75rem', fontWeight: '800', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', background: 'rgba(192, 160, 113, 0.1)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title="Ver ficha completa de la causa"
                          >
                            📎 {tarea.casoRit} - {tarea.casoCaratula} <ExternalLink size={11} />
                          </span>

                          <span className={`badge ${isCritica ? 'badge-red' : isAlta ? 'badge-yellow' : 'badge-blue'}`} style={{ fontSize: '0.7rem' }}>
                            Prioridad {tarea.prioridad}
                          </span>

                          {isCompletada && (
                            <span className="badge badge-green" style={{ fontSize: '0.7rem', background: 'rgba(93, 145, 105, 0.2)', color: 'var(--alert-green)' }}>
                              ✓ COMPLETADA
                            </span>
                          )}
                        </div>

                        <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: isCompletada ? '#94a3b8' : 'var(--text-primary)', margin: '0 0 6px 0', textDecoration: isCompletada ? 'line-through' : 'none' }}>
                          {tarea.titulo}
                        </h4>

                        {tarea.notas && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 8px 0', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                            💬 {tarea.notas}
                          </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          <span>📅 Plazo: <strong style={{ color: isCritica && !isCompletada ? 'var(--alert-red)' : 'var(--text-primary)' }}>{tarea.fechaVencimiento}</strong></span>
                          <span>👤 Responsable: <strong>{tarea.responsable}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--accent-color, #4aa3c7)', borderColor: 'rgba(74, 163, 199, 0.4)' }}
                        onClick={() => {
                          setRedactarModalGestion({ tramite: tarea.titulo, textoOriginal: tarea.notas });
                          setRedactarModalCaso({ rit: tarea.casoRit, caratula: tarea.casoCaratula });
                          setShowRedactarModal(true);
                        }}
                        title="Redactar escrito procesal en LibreOffice Writer"
                      >
                        ✍️ Redactar
                      </button>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--info)', borderColor: 'rgba(96, 165, 250, 0.3)' }} 
                        onClick={() => handleOpenEditTarea(indexInList, tarea)}
                        title="Editar tarea"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--danger)', borderColor: 'rgba(248, 113, 113, 0.3)' }} 
                        onClick={() => handleDeleteTarea(indexInList)}
                        title="Eliminar tarea"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
        </div>
      )}

      <ModalRedactarDocumento
        isOpen={showRedactarModal}
        onClose={() => setShowRedactarModal(false)}
        gestion={redactarModalGestion}
        caso={redactarModalCaso}
      />
    </div>
  );
}

