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
  const [modoVistaPendientes, setModoVistaPendientes] = useState('kanban'); // 'kanban' | 'tabla'
  const pendientesOrdenados = useMemo(() => ordenarPendientes(pendientes, ordenPendientes), [pendientes, ordenPendientes]);

  const kanbanPendientesData = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const finSemana = new Date(hoy);
    const dayOfWeek = hoy.getDay(); // 0 es Domingo
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    finSemana.setDate(finSemana.getDate() + daysUntilSunday);
    finSemana.setHours(23, 59, 59, 999);

    const parseFechaStr = (str) => {
      if (!str) return null;
      const s = String(str).trim().toLowerCase();
      const MESES = {
        enero: 0, ene: 0, febrero: 1, feb: 1, marzo: 2, mar: 2, abril: 3, abr: 3,
        mayo: 4, may: 4, junio: 5, jun: 5, julio: 6, jul: 6, agosto: 7, ago: 7,
        septiembre: 8, sep: 8, setiembre: 8, octubre: 9, oct: 9, noviembre: 10, nov: 10, diciembre: 11, dic: 11
      };
      for (const [mNombre, mIndex] of Object.entries(MESES)) {
        if (s.includes(mNombre)) {
          const nums = s.match(/\d+/g);
          if (nums && nums.length >= 1) {
            const d = parseInt(nums[0], 10);
            const y = nums.length >= 2 ? parseInt(nums[nums.length - 1], 10) : new Date().getFullYear();
            const yearFinal = y < 100 ? 2000 + y : y;
            if (!isNaN(d) && !isNaN(yearFinal)) return new Date(yearFinal, mIndex, d);
          }
        }
      }
      const partes = s.split(/[/.\-\s]+/);
      if (partes.length === 3) {
        let d, m, y;
        if (partes[0].length === 4) {
          y = parseInt(partes[0], 10);
          m = parseInt(partes[1], 10) - 1;
          d = parseInt(partes[2], 10);
        } else {
          d = parseInt(partes[0], 10);
          m = parseInt(partes[1], 10) - 1;
          y = parseInt(partes[2], 10);
          if (y < 100) y += 2000;
        }
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m, d);
      }
      const dt = new Date(str);
      return isNaN(dt.getTime()) ? null : dt;
    };

    const colManana = [];
    const colRestoSemana = [];
    const colDemasPendientes = [];

    pendientes.forEach((g) => {
      const targetFechaStr = g.fechaVencimiento || g.vencimiento || g.fechaObjetivo || g.fechaTramite || g.fechaMostrada || g.fecha;
      const targetDate = parseFechaStr(targetFechaStr);

      if (targetDate) {
        targetDate.setHours(0, 0, 0, 0);
        if (targetDate.getTime() === manana.getTime()) {
          colManana.push(g);
        } else if (targetDate > manana && targetDate <= finSemana) {
          colRestoSemana.push(g);
        } else {
          colDemasPendientes.push(g);
        }
      } else {
        colDemasPendientes.push(g);
      }
    });

    return { colManana, colRestoSemana, colDemasPendientes };
  }, [pendientes]);
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

  const handleToggleEstadoPlazo = async (e, plazo) => {
    e.stopPropagation();
    try {
      const ref = plazo.casoRit || plazo.rit || plazo.claveOriginal;
      const targetCaso = (expedientesReales || []).find(e => e.id === ref || e.rit === ref || e.ritVinculado === ref) ||
        [...MOCK_CASOS, ...PJUD_CASOS].find(c => c.rit === ref || c.id === ref);

      const clave = targetCaso ? claveDeCaso(targetCaso) : ref;
      const key = clave ? `lexcontrol_gestiones_${clave}` : null;
      let gestiones = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];

      if (!gestiones.length && targetCaso && targetCaso.gestiones) {
        gestiones = [...targetCaso.gestiones];
      }

      let modificado = false;
      let nuevos = gestiones.map(g => {
        const coincide = (g.id && g.id === plazo.id) || 
          (g.tramite === plazo.titulo || g.actuacion === plazo.titulo || g.titulo === plazo.titulo);
        if (coincide) {
          modificado = true;
          const yaRealizada = String(g.estado || '').toUpperCase().includes('REALIZAD');
          return { ...g, estado: yaRealizada ? 'PENDIENTE' : 'REALIZADO' };
        }
        return g;
      });

      if (!modificado) {
        const yaRealizada = String(plazo.estado || '').toUpperCase().includes('REALIZAD');
        nuevos.push({
          id: plazo.id,
          tramite: plazo.titulo,
          actuacion: plazo.titulo,
          titulo: plazo.titulo,
          fecha: hoyLocal(),
          fechaIso: hoyLocal(),
          fechaVencimiento: plazo.fechaVencimiento || hoyLocal(),
          estado: yaRealizada ? 'PENDIENTE' : 'REALIZADO',
          casoRit: ref,
          caratula: plazo.caratulaMostrada
        });
      }

      if (key) localStorage.setItem(key, JSON.stringify(nuevos));
      if (targetCaso) {
        targetCaso.gestiones = nuevos;
        guardarGestionesDeCaso(targetCaso, nuevos).catch(() => {});
      }
    } catch(e) {}
    window.dispatchEvent(new Event('lexcontrol_plazos_updated'));
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
              const isDone = plazo.esRealizado || String(plazo.estado || '').toUpperCase().includes('REALIZAD');
              const isCritical = !isDone && plazo.esCritico;
              return (
                <div
                  key={plazo.id}
                  onClick={() => handleAbrirCasoDesdePlazo(plazo)}
                  title="Haz clic para abrir la ficha completa de este expediente"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: isDone ? 'rgba(34, 197, 94, 0.12)' : (isCritical ? 'rgba(207, 95, 87, 0.08)' : 'var(--bg-secondary)'),
                    border: isDone ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid var(--border-color)',
                    borderLeft: isDone ? '4px solid #22c55e' : (isCritical ? '4px solid var(--danger)' : '4px solid var(--warn)'),
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  className="row card-hover-click"
                >
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ gap: 'var(--space-2)', marginBottom: '2px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold', color: isDone ? '#22c55e' : (isCritical ? 'var(--danger)' : 'var(--warn)'), fontSize: 'var(--text-sm)' }}>
                        {plazo.casoRit}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>• {plazo.caratulaMostrada}</span>
                      {isDone ? (
                        <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.25)', color: '#22c55e', fontWeight: 'bold' }}>
                          ✓ REALIZADO HOY
                        </span>
                      ) : (
                        !plazo.esFatal && (
                          <span className="badge" title="Gestión de bitácora: la fecha es la Fecha Trámite que elegiste, no un cómputo procesal">
                            Tarea
                          </span>
                        )
                      )}
                      {plazo.fueraDePlanilla && (
                        <span className="badge badge-yellow" title={`Guardada bajo "${plazo.claveOriginal}", que no corresponde a ninguna causa de la planilla oficial ni a un expediente propio. Suele ser una causa creada por la IA.`}>
                          fuera de planilla
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: isDone ? '#22c55e' : 'var(--text-primary)', fontWeight: '600', textDecoration: isDone ? 'line-through' : 'none' }}>
                      {plazo.titulo}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {plazo.esFatal ? 'Vence' : 'Trámite'}: {plazo.fechaMostrada} (Resp: Jaime Moraga C.)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: isDone ? '#22c55e' : (isCritical ? 'var(--danger)' : 'var(--warn)'), fontFamily: 'monospace' }}>
                      {isDone ? '✓ Completado' : plazo.etiquetaTiempo}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleToggleEstadoPlazo(e, plazo)}
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        borderRadius: '4px',
                        border: isDone ? '1px solid #22c55e' : '1px solid var(--border-color)',
                        background: isDone ? 'rgba(34, 197, 94, 0.2)' : 'var(--bg-primary)',
                        color: isDone ? '#22c55e' : 'var(--text-secondary)',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                      title={isDone ? "Reabrir como pendiente" : "Marcar como realizada hoy"}
                    >
                      {isDone ? '✔ Realizado' : '◯ Marcar Realizado'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pendientes de bitácora — Tablero Kanban de 3 Columnas o Tabla estilo Planilla */}
      {pendientes.length > 0 && (
        <div className="card card-static" style={{ overflow: 'hidden' }}>
          <div className="card-header row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <Flame size={20} color="var(--warn)" />
              <span className="card-title">Pendientes de bitácora ({pendientes.length})</span>
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>— Haz clic en cualquier tarjeta para abrir la causa</span>
            </div>

            {/* Selector de Vista: Kanban (3 Col) vs Planilla */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setModoVistaPendientes('kanban')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  background: modoVistaPendientes === 'kanban' ? 'rgba(74, 163, 199, 0.2)' : 'transparent',
                  color: modoVistaPendientes === 'kanban' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  border: modoVistaPendientes === 'kanban' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                  cursor: 'pointer'
                }}
              >
                📊 Tablero Kanban (3 Col)
              </button>
              <button
                type="button"
                onClick={() => setModoVistaPendientes('tabla')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  background: modoVistaPendientes === 'tabla' ? 'rgba(74, 163, 199, 0.2)' : 'transparent',
                  color: modoVistaPendientes === 'tabla' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  border: modoVistaPendientes === 'tabla' ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                  cursor: 'pointer'
                }}
              >
                📋 Vista Planilla
              </button>
            </div>
          </div>

          {modoVistaPendientes === 'kanban' ? (
            /* TABLERO KANBAN DE 3 COLUMNAS EN MI DÍA / DASHBOARD */
            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', background: 'var(--bg-secondary)' }}>
              {/* COLUMNA 1: GESTIONES DE MAÑANA */}
              <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(234, 179, 8, 0.2)', paddingBottom: '8px' }}>
                  <strong style={{ fontSize: '0.88rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🌅 Mañana ({kanbanPendientesData.colManana.length})
                  </strong>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(234, 179, 8, 0.2)', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                    Urgente
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
                  {kanbanPendientesData.colManana.length === 0 ? (
                    <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                      Sin gestiones para mañana
                    </div>
                  ) : (
                    kanbanPendientesData.colManana.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => handleAbrirCasoDesdePlazo(g)}
                        className="feed-item-clickable"
                        style={{
                          padding: '12px',
                          borderRadius: '10px',
                          background: 'var(--bg-secondary)',
                          borderLeft: '4px solid var(--accent-gold)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="mono" style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--accent-cyan)' }}>
                            {g.casoRit || g.rit || 'Expediente'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                            📅 {g.fechaVencimiento || g.fechaObjetivo || g.fechaTramite || g.fechaMostrada || g.fecha || 'Sin plazo'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {g.titulo || g.actuacion || g.tramite || g.descripcion || 'Gestión Pendiente'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {g.caratulaMostrada || g.caratula || g.cliente || g.asunto || ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* COLUMNA 2: GESTIONES EN LO QUE QUEDA DE LA SEMANA */}
              <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(168, 85, 247, 0.2)', paddingBottom: '8px' }}>
                  <strong style={{ fontSize: '0.88rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📅 Resto de la Semana ({kanbanPendientesData.colRestoSemana.length})
                  </strong>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontWeight: 'bold' }}>
                    Semana
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
                  {kanbanPendientesData.colRestoSemana.length === 0 ? (
                    <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                      Sin gestiones esta semana
                    </div>
                  ) : (
                    kanbanPendientesData.colRestoSemana.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => handleAbrirCasoDesdePlazo(g)}
                        className="feed-item-clickable"
                        style={{
                          padding: '12px',
                          borderRadius: '10px',
                          background: 'var(--bg-secondary)',
                          borderLeft: '4px solid #c084fc',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="mono" style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--accent-cyan)' }}>
                            {g.casoRit || g.rit || 'Expediente'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#c084fc', fontWeight: 'bold' }}>
                            📅 {g.fechaVencimiento || g.fechaObjetivo || g.fechaTramite || g.fechaMostrada || g.fecha || 'Sin plazo'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {g.titulo || g.actuacion || g.tramite || g.descripcion || 'Gestión Pendiente'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {g.caratulaMostrada || g.caratula || g.cliente || g.asunto || ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* COLUMNA 3: RESTO DE PENDIENTES */}
              <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid rgba(74, 163, 199, 0.3)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(74, 163, 199, 0.2)', paddingBottom: '8px' }}>
                  <strong style={{ fontSize: '0.88rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📋 Resto de Pendientes ({kanbanPendientesData.colDemasPendientes.length})
                  </strong>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(74, 163, 199, 0.2)', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>
                    General
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
                  {kanbanPendientesData.colDemasPendientes.length === 0 ? (
                    <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>
                      No hay más pendientes registradas
                    </div>
                  ) : (
                    kanbanPendientesData.colDemasPendientes.map((g) => (
                      <div
                        key={g.id}
                        onClick={() => handleAbrirCasoDesdePlazo(g)}
                        className="feed-item-clickable"
                        style={{
                          padding: '12px',
                          borderRadius: '10px',
                          background: 'var(--bg-secondary)',
                          borderLeft: '4px solid var(--accent-cyan)',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="mono" style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--accent-cyan)' }}>
                            {g.casoRit || g.rit || 'Expediente'}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                            📅 {g.fechaVencimiento || g.fechaObjetivo || g.fechaTramite || g.fechaMostrada || g.fecha || 'Sin plazo'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {g.titulo || g.actuacion || g.tramite || g.descripcion || 'Gestión Pendiente'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {g.caratulaMostrada || g.caratula || g.cliente || g.asunto || ''}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* VISTA TABLA PLANILLA */
            <div className="table-wrap">
              <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>Causa / ROL</th>
                    <th>Gestión pendiente</th>
                    <th
                      style={{ width: '130px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => setOrdenPendientes(ordenPendientes === 'creacion_asc' ? 'creacion_desc' : 'creacion_asc')}
                      title="Haz clic para ordenar por fecha de creación"
                    >
                      Creada
                      {' '}{ordenPendientes === 'creacion_asc' ? '▲' : ordenPendientes === 'creacion_desc' ? '▼' : ''}
                    </th>
                    <th
                      style={{ width: '135px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      onClick={() => setOrdenPendientes(ordenPendientes === 'vencimiento_asc' ? 'vencimiento_desc' : 'vencimiento_asc')}
                      title="Haz clic para ordenar por fecha de vencimiento"
                    >
                      Vencimiento
                      {' '}{ordenPendientes === 'vencimiento_asc' ? '▲' : ordenPendientes === 'vencimiento_desc' ? '▼' : ''}
                    </th>
                    <th style={{ width: '130px' }}>Antigüedad</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientesOrdenados.slice(0, 25).map((g) => {
                    const colorBorde = g.diasPendiente >= 30 ? 'var(--danger)' : g.diasPendiente >= 7 ? 'var(--warn)' : 'var(--border-color)';
                    return (
                      <tr
                        key={g.id}
                        onClick={() => handleAbrirCasoDesdePlazo(g)}
                        title="Haz clic para abrir la ficha y marcarla REALIZADO"
                        style={{ cursor: 'pointer', borderLeft: `3px solid ${colorBorde}` }}
                      >
                        {/* Causa */}
                        <td>
                          <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                            <span className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 'var(--text-xs)' }}>{g.casoRit}</span>
                            {g.fueraDePlanilla && (
                              <span className="badge badge-yellow" style={{ fontSize: '10px' }} title="Fuera de planilla">ext</span>
                            )}
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>{g.caratulaMostrada}</div>
                        </td>
                        {/* Gestión */}
                        <td style={{ maxWidth: 0 }}>
                          <div style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--text-primary)',
                            fontWeight: 500,
                            fontSize: 'var(--text-xs)'
                          }}>
                            {g.titulo}
                          </div>
                          {(g.notas || '').toUpperCase().includes('EN ESPERA') && (
                            <span style={{ fontSize: '10px', color: 'var(--accent-purple)' }}>⚖️ en espera del tribunal</span>
                          )}
                        </td>
                        {/* Fecha creación */}
                        <td className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {g.fechaCreacion || g.fechaMostrada || '—'}
                        </td>
                        {/* Fecha vencimiento */}
                        <td className="mono" style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                          {g.fechaVencimiento
                            ? <strong style={{ color: 'var(--warn)' }}>{g.fechaVencimiento}</strong>
                            : <span style={{ color: 'var(--text-muted)' }}>Sin vencimiento</span>
                          }
                        </td>
                        {/* Antigüedad */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <strong style={{
                            fontFamily: 'monospace',
                            fontSize: 'var(--text-xs)',
                            color: g.diasPendiente >= 30 ? 'var(--danger)' : g.diasPendiente >= 7 ? 'var(--warn)' : 'var(--text-secondary)'
                          }}>
                            {g.etiquetaTiempo}
                          </strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pendientes.length > 25 && (
            <div className="card-pad">
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                y {pendientes.length - 25} más — están todas en el Radar de Plazos.
              </span>
            </div>
          )}
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
