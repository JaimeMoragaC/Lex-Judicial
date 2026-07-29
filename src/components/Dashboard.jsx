import React, { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  Calendar, 
  ShieldCheck, 
  FileText, 
  CheckCircle2, 
  Flame, 
  ChevronRight,
  Gavel,
  Briefcase,
  Bell,
  Monitor,
  Eye,
  RefreshCw,
  Sun,
  Moon,
  Sparkles,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { MOCK_STATS, MOCK_PLAZOS_FATALES, MOCK_AUDIENCIAS_HOY_SEMANA, MOCK_CASOS } from '../mockData';
import { PARTE_DIARIO_OJV } from '../parteDiarioData';
import { LEXCONTROL_API } from '../apiBase';

export default function Dashboard({ onNavigateToCaso, onNavigateToMatriz, onNavigateToRedactor, theme, toggleTheme }) {
  const [parteVisible, setParteVisible] = useState(true);
  
  // Cargar historial de partes diarios
  const [historialPartes, setHistorialPartes] = useState(() => {
    try {
      const saved = localStorage.getItem('lexcontrol_historial_partes_diarios');
      return saved ? JSON.parse(saved) : [PARTE_DIARIO_OJV];
    } catch {
      return [PARTE_DIARIO_OJV];
    }
  });

  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => {
    return (historialPartes[0] && historialPartes[0].fechaParteDiario) || PARTE_DIARIO_OJV.fechaParteDiario;
  });

  const datosParteDiario = useMemo(() => {
    return historialPartes.find(p => p.fechaParteDiario === fechaSeleccionada) || historialPartes[0] || PARTE_DIARIO_OJV;
  }, [historialPartes, fechaSeleccionada]);

  const fechasDisponibles = useMemo(() => {
    return historialPartes.map(p => p.fechaParteDiario);
  }, [historialPartes]);

  const novedadesUnicas = useMemo(() => {
    if (!datosParteDiario || !datosParteDiario.movimientos) return [];
    const map = new Map();
    datosParteDiario.movimientos.forEach(nov => {
      const key = `${nov.rol}-${nov.titulo}-${nov.tribunal}`;
      if (!map.has(key)) map.set(key, nov);
    });
    return Array.from(map.values());
  }, [datosParteDiario]);

  // Causas inactivas para Radar Anti-Abandono
  const causasInactivas = useMemo(() => {
    return MOCK_CASOS.filter(c => c.diasInactivo && c.diasInactivo >= 30);
  }, []);

  const verEnNavegador = (pathFisico, e) => {
    e.stopPropagation();
    if (!pathFisico) return;
    const url = `${LEXCONTROL_API}/ver_pdf?path=${encodeURIComponent(pathFisico)}`;
    window.open(url, '_blank');
  };

  const abrirEnEscritorio = (pathFisico, e) => {
    e.stopPropagation();
    if (!pathFisico) return;
    fetch(`${LEXCONTROL_API}/abrir_nativo?path=${encodeURIComponent(pathFisico)}`)
      .then(res => res.json())
      .then(data => {
        if (data.status !== "ok") alert("No se pudo abrir el archivo nativo en Linux: " + data.error);
      })
      .catch(() => alert("Servidor local no detectado en puerto 8888."));
  };

  return (
    <div className="view-container stack animate-fade-in" style={{ gap: 'var(--space-6)' }}>
      {/* Top Header Simplificado */}
      <div className="top-header">
        <div className="header-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-gold">📋 Mi Día & Plazos</span>
            <span className="badge sem-AL_DIA">Sincronizado con PJUD</span>
          </div>
          <h1>Agenda Diaria y Estado de Causas</h1>
          <p>Bienvenido, Jaime. Situación inmediata de tus audiencias, plazos fatales y novedades del Estado Diario.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {toggleTheme && (
            <button
              className="btn-secondary"
              onClick={toggleTheme}
              title="Cambiar entre modo claro y oscuro"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              {theme === 'light' ? <Moon size={18} color="var(--accent)" /> : <Sun size={18} color="var(--accent)" />}
              <span>{theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</span>
            </button>
          )}
          <button className="btn-secondary" onClick={() => onNavigateToMatriz && onNavigateToMatriz()}>
            <ShieldCheck size={18} color="var(--accent-gold)" />
            <span>Matriz Probatoria</span>
          </button>
          <button className="btn-primary" onClick={() => onNavigateToCaso && onNavigateToCaso()}>
            <Briefcase size={18} />
            <span>Nuevo Expediente</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BLOQUE 1: 🔴 AUDIENCIAS DE HOY & VENCIMIENTOS FATALES (MÁXIMA PRIORIDAD) */}
      {/* ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        {/* Tarjeta Audiencias de Hoy */}
        <div className="card card-static stack" style={{ gap: 'var(--space-3)' }}>
          <div className="card-header row" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <Calendar size={20} color="var(--accent)" />
              <span className="card-title">Audiencias de Hoy & Semana</span>
            </div>
            <span className="badge badge-gold">{MOCK_AUDIENCIAS_HOY_SEMANA.length} Confirmadas</span>
          </div>
          <div className="card-pad stack" style={{ gap: 'var(--space-3)' }}>
            {MOCK_AUDIENCIAS_HOY_SEMANA.map((aud) => (
              <div
                key={aud.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderLeft: '4px solid var(--accent)'
                }}
                className="row"
              >
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 'var(--space-2)', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
                      {aud.hora} — {aud.fecha}
                    </span>
                    <span className="badge badge-cyan">{aud.modalidad}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: '500' }}>
                    {aud.casoRit} — {aud.caratula}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    🏛️ {aud.tribunal} | Sala: {aud.sala}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tarjeta Plazos Fatales que Vencen */}
        <div className="card card-static stack" style={{ gap: 'var(--space-3)' }}>
          <div className="card-header row" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <Flame size={20} color="var(--danger)" />
              <span className="card-title">Semáforo de Plazos Fatales (48h)</span>
            </div>
            <span className="badge badge-red">⚠️ Urgencia Procesal</span>
          </div>
          <div className="card-pad stack" style={{ gap: 'var(--space-3)' }}>
            {MOCK_PLAZOS_FATALES.map((plazo) => {
              const isCritical = plazo.prioridad === 'CRITICA';
              return (
                <div
                  key={plazo.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: isCritical ? 'rgba(207, 95, 87, 0.08)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderLeft: isCritical ? '4px solid var(--danger)' : '4px solid var(--warn)'
                  }}
                  className="row"
                >
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ gap: 'var(--space-2)', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 'bold', color: isCritical ? 'var(--danger)' : 'var(--warn)', fontSize: 'var(--text-sm)' }}>
                        {plazo.casoRit}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>• {plazo.caratula}</span>
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: '600' }}>
                      {plazo.descripcion}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Vence: {plazo.fechaVencimiento} (Resp: {plazo.responsable})
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800', color: isCritical ? 'var(--danger)' : 'var(--warn)', fontFamily: 'monospace' }}>
                      {plazo.horasRestantes}h
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BLOQUE 2: 📬 NOVEDADES DEL ESTADO DIARIO PJUD (RESOLUCIONES NOTIFICADAS) */}
      {/* ========================================================================= */}
      {parteVisible && datosParteDiario && (
        <div className="card card-static stack" style={{ gap: 'var(--space-4)' }}>
          <div className="card-header row" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <Bell size={20} color="var(--accent)" />
              <div>
                <span className="card-title" style={{ display: 'block' }}>
                  Novedades del Estado Diario PJUD ({novedadesUnicas.length} Resoluciones Notificadas)
                </span>
                <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                  Sincronizado {datosParteDiario.ultimaSincronizacion} • {datosParteDiario.totalCausasAuditadas} causas auditadas
                </span>
              </div>
            </div>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <select
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="input"
                style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
              >
                {fechasDisponibles.map((f) => (
                  <option key={f} value={f}>
                    Parte: {f}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setParteVisible(false)}
                className="btn-ghost"
                style={{ padding: '4px 8px' }}
                title="Ocultar resoluciones"
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 14px' }}>Causa & Cliente</th>
                  <th style={{ padding: '10px 14px' }}>Tribunal</th>
                  <th style={{ padding: '10px 14px' }}>Resolución / Proveído</th>
                  <th style={{ padding: '10px 14px' }}>Acción Sugerida</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Documento</th>
                </tr>
              </thead>
              <tbody>
                {novedadesUnicas.map((nov, idx) => {
                  const isCrit = nov.urgencia === 'CRÍTICA' || nov.urgencia === 'ALTA';
                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        background: isCrit ? 'rgba(207, 95, 87, 0.05)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{nov.rol}</div>
                        <div className="muted">{nov.caratula}</div>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{nov.tribunal}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{nov.titulo}</div>
                        <div className="muted" style={{ fontSize: '11px' }}>{nov.detalle}</div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className={`badge ${isCrit ? 'badge-red' : 'badge-gold'}`}>{nov.plazoHoras}</span>
                        <div className="muted" style={{ fontSize: '11px', marginTop: '2px' }}>{nov.accionRecomendada}</div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: '6px' }}>
                          <button
                            onClick={(e) => verEnNavegador(nov.pathFisico, e)}
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            title="Ver PDF en navegador"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={(e) => abrirEnEscritorio(nov.pathFisico, e)}
                            className="btn-primary"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            title="Abrir con Evince/Okular nativo Linux"
                          >
                            <Monitor size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BLOQUE 3: 🚨 RADAR ANTI-ABANDONO DE PROCEDIMIENTO (ART. 152 CPC) */}
      {/* ========================================================================= */}
      <div className="card card-static stack" style={{ gap: 'var(--space-4)' }}>
        <div className="card-header row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <ShieldAlert size={20} color="var(--warn)" />
            <div>
              <span className="card-title" style={{ display: 'block' }}>
                Radar Anti-Abandono de Procedimiento (Art. 152 CPC)
              </span>
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Causas sin movimiento procesal mayor a 30 días que requieren escrito de impulso
              </span>
            </div>
          </div>
          <span className="badge badge-yellow">{causasInactivas.length} Causas en Riesgo</span>
        </div>

        <div className="card-pad stack" style={{ gap: 'var(--space-3)' }}>
          {causasInactivas.map((caso) => (
            <div
              key={caso.id}
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderLeft: '4px solid var(--warn)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div className="row" style={{ gap: 'var(--space-2)', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{caso.rit}</span>
                  <span className="badge badge-red">{caso.diasInactivo} días inactivo</span>
                  <span className="badge badge-purple">{caso.tribunal}</span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: '500' }}>
                  {caso.caratula} — Cliente: {caso.cliente}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Última resolución: {caso.ultimaResolucion} ({caso.fechaUltimaResolucion})
                </div>
              </div>

              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <button
                  onClick={() => onNavigateToCaso && onNavigateToCaso(caso)}
                  className="btn-secondary"
                  style={{ fontSize: 'var(--text-xs)', padding: '6px 12px' }}
                >
                  Ver Expediente
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
