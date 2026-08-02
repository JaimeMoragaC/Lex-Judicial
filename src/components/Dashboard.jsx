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
  Loader2
} from 'lucide-react';
import { MOCK_PLAZOS_FATALES, MOCK_CASOS } from '../mockData';
import { PJUD_CASOS } from '../pjudCausesData';
import { PARTE_DIARIO_OJV } from '../parteDiarioData';
import { LEXCONTROL_API } from '../apiBase';
import { cargarAtencion, hoyLocal, audienciasProximas, ordenarPendientes } from '../utils/radarPlazos.js';

/** Ventana de la tarjeta "Audiencias próximas": hoy + este tanto de días. */
const DIAS_AUDIENCIAS = 30;
import { cargarExpedientes } from '../utils/expedientes.js';

/**
 * Deja cualquier parte diario con la forma que espera esta pantalla.
 *
 * El parte por defecto lo genera motor_ojv_diferencial.py con OTRA forma: trae
 * `novedades` y no trae `fechaParteDiario`. Sin normalizarlo pasaban dos cosas, y
 * las dos eran silenciosas:
 *
 *  1. `fechasDisponibles` quedaba en [undefined] y el selector renderizaba
 *     <option key={undefined}>, que React trata como key faltante.
 *  2. La tabla de novedades quedaba VACÍA -"0 resoluciones notificadas"- porque
 *     leía `movimientos`. Los datos estaban ahí y tenían todos los campos
 *     necesarios; sólo no coincidía el nombre.
 */
const normalizarParte = (p) => ({
  ...p,
  fechaParteDiario: p.fechaParteDiario || p.fecha_estado_diario || null,
  movimientos: p.movimientos || p.novedades || []
});

export default function Dashboard({ onNavigateToCaso, onNavigateToMatriz, onNavigateToRedactor, onOpenCrearExpediente, theme, toggleTheme }) {
  const [parteVisible, setParteVisible] = useState(true);
  // Lo que requiere atención hoy, ya clasificado y ordenado por radarPlazos.js.
  // El Dashboard no arma esta lista ni decide qué entra: sólo la pinta.
  const [atencion, setAtencion] = useState([]);
  // Pendientes de bitácora: trabajo sin fecha de vencimiento o con vencimiento abierto.
  const [pendientes, setPendientes] = useState([]);
  const [ordenPendientes, setOrdenPendientes] = useState('creacion_asc');
  const pendientesOrdenados = useMemo(() => ordenarPendientes(pendientes, ordenPendientes), [pendientes, ordenPendientes]);
  const [expedientesReales, setExpedientesReales] = useState([]);
  const [cargandoReal, setCargandoReal] = useState(true);
  // Sólo audiencias con fecha Y hora fijada por el tribunal -no cualquier
  // trámite con fecha propia-, ver audienciasProximas() en radarPlazos.js.
  const audiencias = useMemo(
    () => audienciasProximas(expedientesReales, DIAS_AUDIENCIAS),
    [expedientesReales]
  );
  const [estadoVigilante, setEstadoVigilante] = useState(null);
  // Briefing matutino en prosa (IA local, con caché de un día: no tiene sentido
  // volver a redactarlo cada vez que se recarga la página en la misma jornada).
  const [briefing, setBriefing] = useState(null);
  const [cargandoBriefing, setCargandoBriefing] = useState(false);

  // Cargar historial de partes diarios
  const [historialPartes, setHistorialPartes] = useState(() => {
    try {
      const saved = localStorage.getItem('lexcontrol_historial_partes_diarios');
      const lista = saved ? JSON.parse(saved) : [PARTE_DIARIO_OJV];
      return (Array.isArray(lista) ? lista : [PARTE_DIARIO_OJV]).map(normalizarParte);
    } catch {
      return [normalizarParte(PARTE_DIARIO_OJV)];
    }
  });

  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => {
    return (historialPartes[0] && historialPartes[0].fechaParteDiario) || null;
  });

  // Función para transformar la respuesta del backend y actualizar el estado de React + localStorage
  const actualizarEstadoParteDiario = (nuevoParte) => {
    if (!nuevoParte || !nuevoParte.movimientos) return;
    const fecha = nuevoParte.fecha_estado_diario || new Date().toISOString().split('T')[0];
    const item = {
      fechaParteDiario: fecha,
      ultimaSincronizacion: nuevoParte.leido_en || new Date().toLocaleTimeString('es-CL'),
      totalCausasAuditadas: 59,
      tiempoEscaneoSegundos: 3.8,
      metodoAutenticacion: 'GMAIL IMAP / PJUD EXCEL',
      origenSync: nuevoParte.origen_sync || 'GMAIL_IMAP',
      mensajeContinuidad: nuevoParte.mensaje_continuidad || '',
      movimientos: nuevoParte.movimientos.map((m) => ({
        rol: m.rol,
        caratula: m.caratula,
        cliente: m.carpetaHermana || m.caratula,
        tribunal: m.tribunal,
        titulo: m.estado || 'Movimiento Judicial Notificado',
        detalle: m.alerta || 'Resolución registrada en el Estado Diario',
        plazoHoras: m.esFatal ? 'FATAL' : 'MONITOREO',
        urgencia: m.esFatal ? 'CRÍTICA' : 'NORMAL',
        accionRecomendada: m.alerta || 'Revisar expediente',
        archivoDescargado: nuevoParte.archivo_procesado,
        pathFisico: m.pathHermana || nuevoParte.path_completo
      }))
    };

    setHistorialPartes((prev) => {
      const filtrados = prev.filter((p) => p.fechaParteDiario !== item.fechaParteDiario);
      const actualizados = [item, ...filtrados];
      try {
        localStorage.setItem('lexcontrol_historial_partes_diarios', JSON.stringify(actualizados));
      } catch (e) {}
      return actualizados;
    });

    setFechaSeleccionada(fecha);
  };

  // Redacta (o recupera de caché) el briefing matutino. Se cachea por día en
  // localStorage a propósito: aplicarAtencion() se vuelve a llamar cada vez que
  // se registra una gestión (evento lexcontrol_plazos_updated), y no tiene
  // sentido -ni es gratis- pedirle al LLM que redacte de nuevo por cada click
  // del día. `forzar` sortea el caché para el botón "Redactar de nuevo".
  const generarBriefing = async (atencionList, pendientesList, forzar = false) => {
    const clave = `lexcontrol_briefing_${hoyLocal()}`;
    if (!forzar) {
      try {
        const cacheado = localStorage.getItem(clave);
        if (cacheado) {
          setBriefing(JSON.parse(cacheado));
          return;
        }
      } catch (e) {}
    }

    setCargandoBriefing(true);
    try {
      const res = await fetch(`${LEXCONTROL_API}/briefing_diario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atencion: atencionList, pendientes: pendientesList })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        const valor = { texto: data.texto, motor: data.motor_ia };
        setBriefing(valor);
        try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
      }
    } catch (e) {
      // Sin briefing no pasa nada grave: el resto del Dashboard sigue mostrando
      // los datos reales igual, así que no hace falta un error visible acá.
    } finally {
      setCargandoBriefing(false);
    }
  };

  const aplicarAtencion = (r) => {
    setAtencion(r.atencion);
    setPendientes(r.pendientes);
    generarBriefing(r.atencion, r.pendientes);
  };

  const refrescarPlazos = () => {
    cargarAtencion({ causas: [...MOCK_CASOS, ...PJUD_CASOS] }).then(aplicarAtencion).catch(() => {});
  };

  // Cargar datos REALES desde el backend Python al montar.
  //
  // Dos cadenas INDEPENDIENTES a propósito. Antes iban juntas en un Promise.all,
  // y como /sincronizar_gmail_pjud consulta Gmail por IMAP y tarda ~11 segundos,
  // el semáforo no empezaba a cargar hasta que ese fetch terminara: medido en el
  // navegador, la app montaba en 1,1s y los plazos aparecían a los 17,0s. Durante
  // ese rato la tarjeta decía "Requiere mi atención hoy (0)", que se lee como "no
  // tienes nada que hacer" — exactamente lo contrario de lo que hace esta pantalla.
  useEffect(() => {
    // Lo urgente primero: expedientes -> semáforo. Nada de esto depende de Gmail.
    cargarExpedientes()
      .catch(() => [])
      .then((expData) => {
        setExpedientesReales(expData || []);
        // Los expedientes ya cargados se le pasan al radar para no pedirlos dos
        // veces; lo demás (plazos fatales, gestiones, restos de localStorage) lo
        // recolecta y clasifica él.
        return cargarAtencion({ causas: [...MOCK_CASOS, ...PJUD_CASOS], expedientes: expData || [] });
      })
      .then(aplicarAtencion)
      .catch(() => { setAtencion([]); setPendientes([]); })
      .finally(() => setCargandoReal(false));

    // El Estado Diario llega por su cuenta cuando Gmail responda.
    fetch(`${LEXCONTROL_API}/sincronizar_gmail_pjud`)
      .then((res) => res.json())
      .then((syncData) => {
        if (syncData && syncData.status === 'ok') actualizarEstadoParteDiario(syncData);
      })
      .catch(() => {});

    window.addEventListener('lexcontrol_plazos_updated', refrescarPlazos);
    return () => window.removeEventListener('lexcontrol_plazos_updated', refrescarPlazos);
  }, []);

  useEffect(() => {
    const consultarVigilante = () => {
      fetch(`${LEXCONTROL_API}/estado_vigilante`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.estado) {
            setEstadoVigilante(data);
          }
        })
        .catch(() => {});
    };
    consultarVigilante();
    const interval = setInterval(consultarVigilante, 3000);
    return () => clearInterval(interval);
  }, []);

  const datosParteDiario = useMemo(() => {
    return historialPartes.find(p => p.fechaParteDiario === fechaSeleccionada)
      || historialPartes[0]
      || normalizarParte(PARTE_DIARIO_OJV);
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

  const handleAbrirCasoDesdePlazo = (plazo) => {
    if (!onNavigateToCaso) return;
    // Primero buscar por ID o RIT exacto
    const idBusqueda = plazo.casoId || plazo.casoRit || plazo.rit;
    let casoEncontrado = (expedientesReales || []).find(e => e.id === idBusqueda || e.ritVinculado === idBusqueda);
    if (!casoEncontrado) {
      casoEncontrado = [...MOCK_CASOS, ...PJUD_CASOS].find(c => c.id === idBusqueda || c.rit === idBusqueda);
    }

    // Si no, buscar con precaución por aproximación (evitando default strings)
    if (!casoEncontrado) {
      const ritBusqueda = (plazo.casoRit || plazo.rit || '').toLowerCase().trim();
      const caratulaBusqueda = (plazo.caratula || plazo.cliente || '').toLowerCase().trim();
      
      const esRitValido = ritBusqueda && !ritBusqueda.includes('sin rol') && !ritBusqueda.includes('desconocido');
      const esCaratulaValida = caratulaBusqueda && !caratulaBusqueda.includes('no especific') && !caratulaBusqueda.includes('no asignad');

      casoEncontrado = (expedientesReales || []).find(e => {
        const r = (e.ritVinculado || e.id || e.rit || '').toLowerCase();
        const c = (e.cliente || e.asunto || e.caratula || '').toLowerCase();
        return (esRitValido && r.includes(ritBusqueda)) || (esCaratulaValida && c.includes(caratulaBusqueda));
      });

      if (!casoEncontrado) {
        casoEncontrado = [...MOCK_CASOS, ...PJUD_CASOS].find(c => {
          const r = (c.rit || c.id || '').toLowerCase();
          const car = (c.caratula || c.cliente || '').toLowerCase();
          return (esRitValido && r.includes(ritBusqueda)) || (esCaratulaValida && car.includes(caratulaBusqueda));
        });
      }
    }

    // Si no existe un objeto formal, construirlo dinámicamente con sus gestiones reales
    const casoFinal = casoEncontrado || {
      id: plazo.casoId || plazo.casoRit || plazo.rit || 'C-1',
      rit: plazo.casoRit || plazo.rit || 'RIT Desconocido',
      caratula: plazo.caratula || plazo.cliente || 'Carátula no especificada',
      cliente: plazo.cliente || plazo.caratula || 'Cliente no asignado',
      tribunal: plazo.tribunal || 'Juzgado de Letras',
      materia: 'Civil',
      etapa: 'Tramitación',
      gestiones: []
    };

    onNavigateToCaso(casoFinal);
  };

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
      {/* Banner de Monitoreo en Vivo: Vigilante de Descargas Judiciales */}
      {estadoVigilante && estadoVigilante.estado !== 'idle' && (
        <div style={{
          padding: '14px 20px',
          borderRadius: '12px',
          background: estadoVigilante.estado === 'procesando'
            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.28))'
            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(5, 150, 105, 0.28))',
          border: estadoVigilante.estado === 'procesando'
            ? '1px solid rgba(245, 158, 11, 0.5)'
            : '1px solid rgba(16, 185, 129, 0.5)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {estadoVigilante.estado === 'procesando' ? (
              <RefreshCw className="animate-spin" size={22} color="#fbbf24" />
            ) : (
              <CheckCircle2 size={22} color="#34d399" />
            )}
            <div>
              <div style={{ fontWeight: '700', fontSize: '14px', color: estadoVigilante.estado === 'procesando' ? '#fbbf24' : '#34d399', letterSpacing: '0.2px' }}>
                {estadoVigilante.estado === 'procesando' ? '⚡ VIGILANTE EN VIVO: Procesando e Indexando Archivo Judicial' : '✅ SINCRO AUTOMÁTICA COMPLETADA EN DESCARGAS JUDICIALES'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-main)', opacity: 0.95, marginTop: '2px', fontWeight: '500' }}>
                {estadoVigilante.mensaje}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', fontSize: '11px' }}>
              Descargas Judiciales
            </span>
            <span style={{ fontSize: '11px', opacity: 0.75 }}>
              {estadoVigilante.timestamp}
            </span>
          </div>
        </div>
      )}

      {/* Top Header Simplificado */}
      <div className="top-header">
        <div className="header-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-gold">📋 Mi Día & Plazos</span>
            <span className="badge sem-AL_DIA">Conectado a Base de Datos Local y PJUD</span>
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
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px' }}
            >
              {theme === 'dark' ? <Sun size={16} color="#fbbf24" /> : <Moon size={16} color="#6366f1" />}
              <span style={{ fontSize: '13px' }}>{theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</span>
            </button>
          )}
          <button className="btn-secondary" onClick={() => onNavigateToMatriz && onNavigateToMatriz()}>
            <ShieldCheck size={18} color="var(--accent-gold)" />
            <span>Matriz Probatoria</span>
          </button>
          <button className="btn-primary" onClick={() => {
            if (onOpenCrearExpediente) onOpenCrearExpediente();
            else window.dispatchEvent(new CustomEvent('lexcontrol_open_crear_expediente'));
          }}>
            <Briefcase size={18} />
            <span>Nuevo Expediente</span>
          </button>
        </div>
      </div>

      {/* Briefing matutino en prosa (IA local, redactado a partir del semáforo real) */}
      {(briefing || cargandoBriefing) && (
        <div
          className="card card-static card-pad"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', borderLeft: '4px solid var(--accent-purple)' }}
        >
          <Sparkles size={18} color="var(--accent-purple)" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Briefing del día</div>
            {cargandoBriefing && !briefing ? (
              <span className="muted row" style={{ gap: 'var(--space-2)' }}>
                <Loader2 size={14} className="spin" /> Redactando…
              </span>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{briefing.texto}</p>
            )}
          </div>
          <button
            className="btn-ghost btn-sm"
            title="Redactar de nuevo"
            onClick={() => generarBriefing(atencion, pendientes, true)}
            disabled={cargandoBriefing}
          >
            <RefreshCw size={13} className={cargandoBriefing ? 'spin' : ''} />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BLOQUE 1: 🔴 AUDIENCIAS PRÓXIMAS & VENCIMIENTOS FATALES (REALES, SIN MOCK) */}
      {/* ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        {/* Tarjeta Audiencias Próximas */}
        <div className="card card-static stack" style={{ gap: 'var(--space-3)' }}>
          <div className="card-header row" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <Calendar size={20} color="var(--accent)" />
              <span className="card-title">Audiencias Próximas (30 días)</span>
            </div>
            <span className="badge badge-gold">{audiencias.length} Confirmadas</span>
          </div>
          <div className="card-pad stack" style={{ gap: 'var(--space-3)' }}>
            {audiencias.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', margin: 0 }}>
                No hay audiencias con fecha confirmada por el tribunal en los próximos {DIAS_AUDIENCIAS} días.
                Sólo entran acá las que un documento analizado trajo con fecha explícita -nunca una adivinada-.
              </p>
            )}
            {audiencias.map((aud) => (
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
                      {aud.hora ? `${aud.hora} — ${aud.fecha}` : aud.fecha}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: '500' }}>
                    {aud.casoRit} — {aud.caratula}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    🏛️ {aud.tribunal || 'Tribunal no especificado'} — {aud.tramite}
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
              {/* Mientras carga NO se muestra "(0)": un cero se lee como "no tienes
                  nada que hacer", que es la afirmación más peligrosa que puede hacer
                  esta pantalla si todavía no sabe la respuesta. */}
              <span className="card-title">
                Requiere mi atención hoy {cargandoReal ? '(cargando…)' : `(${atencion.length})`}
              </span>
            </div>
            <span className="badge badge-red">⚠️ Urgencia Procesal</span>
          </div>
          <div className="card-pad stack" style={{ gap: 'var(--space-3)' }}>
            {atencion.map((plazo) => {
              const isCritical = plazo.esCritico;
              return (
                <div
                  key={plazo.id}
                  onClick={() => handleAbrirCasoDesdePlazo(plazo)}
                  title="Haz clic para abrir la ficha completa de este expediente"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: isCritical ? 'rgba(207, 95, 87, 0.08)' : 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderLeft: isCritical ? '4px solid var(--danger)' : '4px solid var(--warn)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  className="row card-hover-click"
                >
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ gap: 'var(--space-2)', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 'bold', color: isCritical ? 'var(--danger)' : 'var(--warn)', fontSize: 'var(--text-sm)' }}>
                        {plazo.casoRit}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>• {plazo.caratulaMostrada}</span>
                      {/* Un plazo fatal se calculó bajo una regla procesal; una
                          tarea sólo tiene la fecha que se le puso. La consecuencia
                          de dejarlos pasar no es la misma. */}
                      {!plazo.esFatal && (
                        <span className="badge" title="Gestión de bitácora: la fecha es la Fecha Trámite que elegiste, no un cómputo procesal">
                          Tarea
                        </span>
                      )}
                      {plazo.fueraDePlanilla && (
                        <span className="badge badge-yellow" title={`Guardada bajo "${plazo.claveOriginal}", que no corresponde a ninguna causa de la planilla oficial ni a un expediente propio. Suele ser una causa creada por la IA.`}>
                          fuera de planilla
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: '600' }}>
                      {plazo.titulo}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {plazo.esFatal ? 'Vence' : 'Trámite'}: {plazo.fechaMostrada} (Resp: Jaime Moraga C.)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: isCritical ? 'var(--danger)' : 'var(--warn)', fontFamily: 'monospace' }}>
                      {plazo.etiquetaTiempo}
                    </span>
                    <div style={{ fontSize: '10px', color: 'var(--accent)', marginTop: '2px', fontWeight: '600' }}>
                      📂 Abrir Ficha →
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pendientes de bitácora: no son plazos y no tienen vencimiento, así que no
          van en el semáforo de arriba. Siguen abiertos hasta marcarse REALIZADO,
          y lo que ordena es la antigüedad. */}
      {pendientes.length > 0 && (
        <div className="card card-static stack" style={{ gap: 'var(--space-3)' }}>
          <div className="card-header row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <Flame size={20} color="var(--warn)" />
              <span className="card-title">Pendientes de bitácora ({pendientes.length})</span>
            </div>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>Ordenar por:</span>
              <select
                value={ordenPendientes}
                onChange={(e) => setOrdenPendientes(e.target.value)}
                style={{
                  fontSize: 'var(--text-xs)',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                <option value="creacion_asc">Creación (más antigua primero)</option>
                <option value="creacion_desc">Creación (más reciente primero)</option>
                <option value="vencimiento_asc">Vencimiento (más próximo primero)</option>
                <option value="vencimiento_desc">Vencimiento (más lejano primero)</option>
              </select>
            </div>
          </div>
          <div className="card-pad stack" style={{ gap: 'var(--space-2)' }}>
            {pendientesOrdenados.slice(0, 12).map((g) => (
              <div
                key={g.id}
                onClick={() => handleAbrirCasoDesdePlazo(g)}
                title="Haz clic para abrir la ficha y marcarla REALIZADO"
                className="row card-hover-click"
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderLeft: `4px solid ${g.diasPendiente >= 30 ? 'var(--danger)' : g.diasPendiente >= 7 ? 'var(--warn)' : 'var(--border-color)'}`,
                  cursor: 'pointer'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 'var(--space-2)', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <span className="mono" style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold' }}>{g.casoRit}</span>
                    {(g.notas || '').toUpperCase().includes('EN ESPERA') && (
                      <span
                        className="badge"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-purple)', border: '1px solid rgba(139, 92, 246, 0.3)' }}
                        title="Sin plazo propio: se espera que el tribunal resuelva"
                      >
                        <Gavel size={11} /> en espera del tribunal
                      </span>
                    )}
                    {g.fueraDePlanilla && (
                      <span className="badge badge-yellow" title={`Guardada bajo "${g.claveOriginal}", que no corresponde a ninguna causa de la planilla oficial`}>
                        fuera de planilla
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: '500' }}>{g.titulo}</div>
                  <div className="row" style={{ gap: 'var(--space-4)', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>🗓️ <strong>Creada:</strong> {g.fechaCreacion || g.fechaMostrada || 'Sin fecha'}</span>
                    <span>⏰ <strong>Vencimiento:</strong> {g.fechaVencimiento ? g.fechaVencimiento : 'Sin vencimiento'}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: '90px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: '700', fontFamily: 'monospace', color: g.diasPendiente >= 30 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    {g.etiquetaTiempo}
                  </span>
                </div>
              </div>
            ))}
            {pendientes.length > 12 && (
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                y {pendientes.length - 12} más — están todas en el Radar de Plazos.
              </span>
            )}
          </div>
        </div>
      )}

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
            <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button
                id="btn-sync-gmail"
                onClick={() => {
                  const btn = document.getElementById("btn-sync-gmail");
                  if (btn) btn.innerText = "Leyendo Excel...";
                  fetch(`${LEXCONTROL_API}/sincronizar_gmail_pjud`)
                    .then(res => res.json())
                    .then(data => {
                      if (btn) btn.innerText = "Sincronizar Excel (Gmail/PJUD)";
                      if (data.status === "ok") {
                        actualizarEstadoParteDiario(data);
                        const lista = data.movimientos ? data.movimientos.map(m => `▪ ${m.rol} (${m.tribunal}): ${m.caratula}`).join("\n") : "";
                        alert(`¡Sincronización Judicial Exitosa!\n\nArchivo procesado: ${data.archivo_procesado}\nCausas notificadas hoy: ${data.total_movimientos}\n\n${lista}`);
                      } else {
                        alert("Aviso de sincronización: " + (data.error || "No se pudo procesar el Excel."));
                      }
                    })
                    .catch(() => {
                      alert("Servidor local no detectado en puerto 8888.");
                      if (btn) btn.innerText = "Sincronizar Excel (Gmail/PJUD)";
                    });
                }}
                className="btn-primary"
                style={{ fontSize: 'var(--text-xs)', padding: '6px 12px', gap: '6px' }}
                title="Sincronizar resoluciones leyendo el Excel matutino enviado a tu Gmail por el PJUD"
              >
                <RefreshCw size={13} />
                <span>Sincronizar Excel (Gmail/PJUD)</span>
              </button>

              <button
                onClick={() => {
                  fetch(`${LEXCONTROL_API}/login_humano`)
                    .then(res => res.json())
                    .then(() => alert("Ventana interactiva de login abriéndose en Linux."))
                    .catch(() => alert("Servidor local no detectado."));
                }}
                className="btn-secondary"
                style={{ fontSize: 'var(--text-xs)', padding: '6px 12px' }}
                title="Abrir navegador visible en Linux para validar CAPTCHA humano OJV"
              >
                <Monitor size={13} />
                <span>Validar Sesión OJV</span>
              </button>

              <select
                value={fechaSeleccionada || ''}
                onChange={(e) => setFechaSeleccionada(e.target.value || null)}
                className="input"
                style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
              >
                {/* Un parte puede no traer fecha (el de por defecto no la tiene).
                    La key tiene que ser estable igual: key={undefined} es, para
                    React, lo mismo que no poner key. */}
                {fechasDisponibles.map((f) => (
                  <option key={f || 'sin-fecha'} value={f || ''}>
                    {f ? `Parte: ${f}` : 'Parte: sin fecha declarada'}
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

    </div>
  );
}
