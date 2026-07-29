import React, { useState, useEffect } from 'react';
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
import { MOCK_PLAZOS_FATALES, MOCK_AUDIENCIAS_HOY_SEMANA, MOCK_CASOS, DEFAULT_TAREAS } from '../mockData';
import PremiumCalendar from './PremiumCalendar';

export default function AgendaPlazos({ onSelectCaso }) {
  const [activeTab, setActiveTab] = useState('agenda');
  const [tareasList, setTareasList] = useState([]);
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

  useEffect(() => {
    const saved = localStorage.getItem('lexcontrol_tareas_globales');
    if (saved) {
      try {
        setTareasList(JSON.parse(saved));
        return;
      } catch(e) {}
    }
    setTareasList(DEFAULT_TAREAS);
    localStorage.setItem('lexcontrol_tareas_globales', JSON.stringify(DEFAULT_TAREAS));
  }, []);

  const handleOpenAddTarea = () => {
    setEditingTareaIdx(null);
    const primerCaso = MOCK_CASOS[0] || { rit: "ROL C-1869-2026", caratula: "MEDINA con MORAGA", id: "caso-temuco-1869" };
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
      const selectedCasoObj = MOCK_CASOS.find(c => c.rit === tareaForm.casoRit || c.id === tareaForm.casoId);
      updated.unshift({
        ...tareaForm,
        id: `tar-${Date.now()}`,
        casoCaratula: selectedCasoObj ? selectedCasoObj.caratula : tareaForm.casoCaratula,
        completada: false,
        fechaCreacion: new Date().toLocaleDateString('es-CL')
      });
    }
    setTareasList(updated);
    localStorage.setItem('lexcontrol_tareas_globales', JSON.stringify(updated));
    setShowTareaModal(false);
  };

  const handleToggleCompletada = (index) => {
    let updated = [...tareasList];
    updated[index].completada = !updated[index].completada;
    setTareasList(updated);
    localStorage.setItem('lexcontrol_tareas_globales', JSON.stringify(updated));
  };

  const handleDeleteTarea = (index) => {
    if (!window.confirm("¿Estás seguro de eliminar este pendiente o tarea del estudio?")) return;
    const updated = tareasList.filter((_, idx) => idx !== index);
    setTareasList(updated);
    localStorage.setItem('lexcontrol_tareas_globales', JSON.stringify(updated));
  };

  const tareasFiltradas = tareasList.filter(t => {
    if (filtroCaso !== 'ALL' && t.casoRit !== filtroCaso && t.casoId !== filtroCaso) return false;
    if (filtroEstado === 'PENDING' && t.completada) return false;
    if (filtroEstado === 'COMPLETED' && !t.completada) return false;
    return true;
  });

  const tareasActivasCount = tareasList.filter(t => !t.completada).length;

  return (
    <div className="animate-fade-in">
      {/* Top Header */}
      <div className="top-header">
        <div className="header-title">
          <h1>Agenda Procesal & Gestor de Tareas Vinculadas</h1>
          <p>Control centralizado de plazos fatales, audiencias confirmadas y asignación de pendientes procesales por expediente.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-cyan))', fontWeight: '700' }} onClick={handleOpenAddTarea}>
            <PlusCircle size={18} />
            <span>+ Nueva Tarea / Pendiente</span>
          </button>
          <button className="btn-secondary" onClick={() => alert("Simulación: Sincronizando con calendario judicial del Poder Judicial / Oficina Judicial Virtual.")}>
            <Calendar size={18} />
            <span>Sincronizar Poder Judicial</span>
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
            background: activeTab === 'agenda' ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
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
            background: activeTab === 'tareas' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
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
              <h2 style={{ fontSize: '1.35rem', color: '#fff', margin: 0 }}>
                Términos Fatales en Cuenta Regresiva
              </h2>
              <span className="badge badge-red">Monitoreo 24/7</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
              {MOCK_PLAZOS_FATALES.map((plazo) => {
                const isCritical = plazo.prioridad === 'CRITICA';
                const isHigh = plazo.prioridad === 'ALTA';

                return (
                  <div 
                    key={plazo.id}
                    className="glass-card"
                    style={{
                      padding: '24px',
                      borderTop: isCritical ? '4px solid var(--alert-red)' : isHigh ? '4px solid var(--accent-gold)' : '4px solid var(--alert-blue)',
                      background: isCritical ? 'linear-gradient(180deg, rgba(239, 68, 68, 0.12) 0%, var(--bg-card) 100%)' : 'var(--bg-card)'
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
                      <span className={`badge ${isCritical ? 'badge-red' : isHigh ? 'badge-yellow' : 'badge-blue'}`}>
                        Prioridad {plazo.prioridad}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', marginBottom: '6px' }}>
                      {plazo.caratula}
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '16px', lineHeight: 1.4 }}>
                      {plazo.descripcion}
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
                        <span>Vencimiento: <strong style={{ color: '#fff' }}>{plazo.fechaVencimiento}</strong></span>
                      </div>
                      <div style={{ 
                        fontFamily: 'var(--font-mono)', 
                        fontSize: '1.15rem', 
                        fontWeight: '800', 
                        color: isCritical ? 'var(--alert-red)' : 'var(--accent-gold)' 
                      }}>
                        {plazo.horasRestantes}h
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span>Abogado: <strong>{plazo.responsable}</strong></span>
                      <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => alert(`Marcando escrito preparado para ${plazo.casoRit}`)}>
                        ✓ Marcar Cumplido
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
              <h2 style={{ fontSize: '1.35rem', color: '#fff', margin: 0 }}>
                Audiencias Confirmadas en Tribunales
              </h2>
              <span className="badge badge-cyan">Próximos 7 días</span>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {MOCK_AUDIENCIAS_HOY_SEMANA.map((aud, index) => (
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
                      background: index === 0 ? 'rgba(0, 240, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      borderLeft: index === 0 ? '4px solid var(--accent-cyan)' : '4px solid #8b5cf6'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px', flex: '1', minWidth: '320px' }}>
                      <div style={{ 
                        padding: '12px', 
                        borderRadius: '10px', 
                        background: index === 0 ? 'rgba(0, 240, 255, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                        textAlign: 'center',
                        minWidth: '70px'
                      }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: index === 0 ? 'var(--accent-cyan)' : '#a78bfa', display: 'block', textTransform: 'uppercase' }}>
                          {aud.fecha.split('-')[0].trim()}
                        </span>
                        <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#fff' }}>
                          {aud.fecha.split('-')[1] ? aud.fecha.split('-')[1].trim() : ''}
                        </span>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--accent-gold)', textTransform: 'uppercase' }}>
                            {aud.tribunal} • {aud.sala}
                          </span>
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>{aud.estado}</span>
                        </div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff', marginBottom: '4px' }}>
                          {aud.caso}
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                          ⚡ <strong>Motivo / Debate:</strong> {aud.tipo} | 👤 Litigante: <strong>{aud.abogado}</strong>
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px' }} onClick={() => alert(`Preparando carpeta y minutas para la audiencia en ${aud.tribunal}`)}>
                        📂 Minuta Audiencia
                      </button>
                      <button className="btn-primary" style={{ fontSize: '0.8rem', padding: '8px 14px' }} onClick={() => alert(`Conectando con estrado / Sala Zoom para ${aud.caso}`)}>
                        <span>Ingresar a Sala</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ))}
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
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit3 size={20} color="var(--accent-purple)" />
                  {editingTareaIdx !== null ? "Modificar Pendiente Procesal" : "Asignar Nueva Tarea o Pendiente a una Causa"}
                </h3>
                <button onClick={() => setShowTareaModal(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}>
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
                        const selected = MOCK_CASOS.find(c => c.rit === e.target.value);
                        setTareaForm({
                          ...tareaForm,
                          casoRit: e.target.value,
                          casoCaratula: selected ? selected.caratula : "Causa General",
                          casoId: selected ? selected.id : "gen"
                        });
                      }}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem' }}
                    >
                      <option value="ROL C-1869-2026">ROL C-1869-2026 - MEDINA con MORAGA (Temuco)</option>
                      {MOCK_CASOS.map((c, idx) => (
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
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600' }}>⚡ Prioridad</label>
                    <select 
                      value={tareaForm.prioridad} 
                      onChange={e => setTareaForm({ ...tareaForm, prioridad: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem' }}
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
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem' }}
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
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.95rem', fontWeight: '600' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: '600' }}>📝 Instrucciones, Notas o Referencia Jurídica</label>
                  <textarea 
                    rows={2}
                    value={tareaForm.notas} 
                    onChange={e => setTareaForm({ ...tareaForm, notas: e.target.value })}
                    placeholder="Ej: Revisar jurisprudencia adjunta en carpeta. Acompañar con citación al tribunal..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.9rem', fontFamily: 'inherit', resize: 'vertical' }}
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

          {/* Barra de Filtros y Búsqueda */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                <Filter size={16} color="var(--accent-cyan)" /> Filtrar Tareas:
              </span>
              <select 
                value={filtroCaso} 
                onChange={e => setFiltroCaso(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.85rem' }}
              >
                <option value="ALL">📂 Todas las causas y pendientes</option>
                <option value="ROL C-1869-2026">ROL C-1869-2026 - MEDINA con MORAGA</option>
                {MOCK_CASOS.map((c, idx) => (
                  <option key={idx} value={c.rit || c.id}>{c.rit} - {c.caratula}</option>
                ))}
              </select>

              <select 
                value={filtroEstado} 
                onChange={e => setFiltroEstado(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.85rem' }}
              >
                <option value="ALL">⚡ Todos los estados</option>
                <option value="PENDING">⏳ Solo Pendientes / Activas</option>
                <option value="COMPLETED">✓ Solo Completadas</option>
              </select>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Mostrando <strong>{tareasFiltradas.length}</strong> de <strong>{tareasList.length}</strong> tareas registradas
            </div>
          </div>

          {/* Lista de Tarjetas de Tareas */}
          {tareasFiltradas.length === 0 ? (
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
                      background: isCompletada ? 'rgba(255, 255, 255, 0.01)' : isCritica ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, rgba(255,255,255,0.02) 100%)' : 'rgba(255, 255, 255, 0.02)',
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
                                const c = MOCK_CASOS.find(caseItem => caseItem.rit === tarea.casoRit || caseItem.id === tarea.casoId);
                                if (c) onSelectCaso(c);
                              }
                            }}
                            style={{ fontSize: '0.75rem', fontWeight: '800', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', background: 'rgba(0, 240, 255, 0.1)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title="Ver ficha completa de la causa"
                          >
                            📎 {tarea.casoRit} - {tarea.casoCaratula} <ExternalLink size={11} />
                          </span>

                          <span className={`badge ${isCritica ? 'badge-red' : isAlta ? 'badge-yellow' : 'badge-blue'}`} style={{ fontSize: '0.7rem' }}>
                            Prioridad {tarea.prioridad}
                          </span>

                          {isCompletada && (
                            <span className="badge badge-green" style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--alert-green)' }}>
                              ✓ COMPLETADA
                            </span>
                          )}
                        </div>

                        <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: isCompletada ? '#94a3b8' : '#fff', margin: '0 0 6px 0', textDecoration: isCompletada ? 'line-through' : 'none' }}>
                          {tarea.titulo}
                        </h4>

                        {tarea.notas && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 8px 0', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                            💬 {tarea.notas}
                          </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          <span>📅 Plazo: <strong style={{ color: isCritica && !isCompletada ? 'var(--alert-red)' : '#e2e8f0' }}>{tarea.fechaVencimiento}</strong></span>
                          <span>👤 Responsable: <strong>{tarea.responsable}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.3)' }} 
                        onClick={() => handleOpenEditTarea(indexInList, tarea)}
                        title="Editar tarea"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.3)' }} 
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
          )}
        </div>
      )}
    </div>
  );
}
