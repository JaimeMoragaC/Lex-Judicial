import React, { useEffect, useState, useMemo } from 'react';
import {
  Send,
  Loader2,
  CheckCircle2,
  FolderPlus,
  AlertCircle,
  ArrowRight,
  Search,
  MessageSquare,
  Clock,
  Tag,
  Filter,
  User,
  FileText,
  Check,
  AlertTriangle
} from 'lucide-react';

import { MOCK_CASOS } from '../mockData';
import { LEXCONTROL_API } from '../apiBase.js';
import {
  buscarCandidatos,
  crearExpediente,
  cargarExpedientes,
  guardarExpedientes
} from '../utils/expedientes.js';

const TIPOS_NUEVO = [
  ['extrajudicial', 'Extrajudicial'],
  ['administrativo', 'Administrativo']
];

export default function BitacoraOmnicanal() {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState('escribiendo'); // escribiendo | analizando | confirmando | guardando
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [expedientes, setExpedientes] = useState([]);

  // Lo que devolvió la IA, a la espera de que el abogado diga dónde va.
  const [propuesta, setPropuesta] = useState(null);
  const [candidatos, setCandidatos] = useState([]);
  const [eleccion, setEleccion] = useState(null);
  const [tipoNuevo, setTipoNuevo] = useState('extrajudicial');

  // Filtros para la columna derecha (Historial en Vivo)
  const [busquedaFeed, setBusquedaFeed] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODAS'); // TODAS | PENDIENTES | COMPLETADAS | EXTRAJUDICIAL | JUDICIAL

  useEffect(() => {
    cargarExpedientes()
      .then(setExpedientes)
      .catch((e) => setError(`No se pudo leer el registro de expedientes: ${e.message}`));
  }, []);

  const analizar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setEstado('analizando');
    setError(null);
    setAviso(null);

    try {
      const res = await fetch(`${LEXCONTROL_API}/bitacora_omnicanal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto })
      });
      const data = await res.json();
      if (data.status !== 'ok' || !data.datos) {
        throw new Error(data.error || 'La IA no pudo clasificar el registro');
      }

      const d = data.datos;
      const info = {
        cliente: d.cliente_detectado || '',
        asunto: d.asunto_detectado || '',
        rol: d.rol_detectado || '',
        tramite: d.tramite_generado || texto.slice(0, 120),
        estadoGestion: d.estado || 'COMPLETADO',
        urgencia: d.urgencia || 'NORMAL'
      };

      const encontrados = buscarCandidatos(info, expedientes, MOCK_CASOS);
      setPropuesta(info);
      setCandidatos(encontrados);
      setEleccion(encontrados.length ? { modo: 'existente', ref: encontrados[0] } : { modo: 'nuevo' });
      setEstado('confirmando');
    } catch (err) {
      setError(err.message);
      setEstado('escribiendo');
    }
  };

  const confirmar = async () => {
    if (!propuesta || !eleccion) return;
    setEstado('guardando');

    const gestion = {
      id: `gest-${Date.now()}`,
      fecha: new Date().toLocaleDateString('es-CL'),
      hora: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      tramite: propuesta.tramite,
      estado: propuesta.estadoGestion,
      urgencia: propuesta.urgencia,
      textoOriginal: texto,
      cliente: propuesta.cliente,
      asunto: propuesta.asunto,
      cuaderno: 'Bitácora Omnicanal',
      origen: `Registro Rápido - Cliente: ${propuesta.cliente || 'No detectado'}`,
      timestamp: new Date().toISOString()
    };

    try {
      let destino;
      let siguientes = [...expedientes];

      if (eleccion.modo === 'nuevo') {
        const nuevo = crearExpediente(
          { cliente: propuesta.cliente, asunto: propuesta.asunto, tipo: tipoNuevo },
          expedientes
        );
        nuevo.gestiones = [gestion];
        localStorage.setItem(`lexcontrol_gestiones_${nuevo.id}`, JSON.stringify(nuevo.gestiones));
        siguientes.push(nuevo);
        destino = { id: nuevo.id, etiqueta: `${nuevo.cliente}${nuevo.asunto ? ` — ${nuevo.asunto}` : ''}`, nuevo: true };
      } else if (eleccion.ref.tipo === 'causa') {
        const causa = eleccion.ref.ref;
        let exp = siguientes.find((x) => x.ritVinculado === causa.rit);
        if (!exp) {
          exp = crearExpediente({ cliente: causa.caratula, asunto: propuesta.asunto, tipo: 'judicial' }, siguientes);
          exp.id = causa.rit;
          exp.ritVinculado = causa.rit;
          siguientes.push(exp);
        }
        const key = `lexcontrol_gestiones_${exp.id || exp.ritVinculado}`;
        const savedGestiones = localStorage.getItem(key);
        let actualGest = savedGestiones ? JSON.parse(savedGestiones) : (exp.gestiones || []);
        exp.gestiones = [gestion, ...actualGest];
        localStorage.setItem(key, JSON.stringify(exp.gestiones));
        destino = { id: causa.rit, etiqueta: causa.caratula, nuevo: false };
      } else {
        const exp = siguientes.find((x) => x.id === eleccion.ref.ref.id);
        const key = `lexcontrol_gestiones_${exp.id}`;
        const savedGestiones = localStorage.getItem(key);
        let actualGest = savedGestiones ? JSON.parse(savedGestiones) : (exp.gestiones || []);
        exp.gestiones = [gestion, ...actualGest];
        localStorage.setItem(key, JSON.stringify(exp.gestiones));
        destino = {
          id: exp.id,
          etiqueta: `${exp.cliente}${exp.asunto ? ` — ${exp.asunto}` : ''}`,
          nuevo: false,
          total: exp.gestiones.length
        };
      }

      await guardarExpedientes(siguientes);
      window.dispatchEvent(new Event('lexcontrol_plazos_updated'));
      setExpedientes(siguientes);
      setAviso({
        id: destino.id,
        texto: destino.nuevo
          ? `Expediente ${destino.id} creado para ${destino.etiqueta}.`
          : `Agregado al expediente ${destino.id} — ${destino.etiqueta}${destino.total ? ` (${conteoGestiones(destino.total)})` : ''}.`
      });
      setTexto('');
      setPropuesta(null);
      setCandidatos([]);
      setEleccion(null);
      setEstado('escribiendo');
    } catch (err) {
      setError(`No se pudo guardar: ${err.message}`);
      setEstado('confirmando');
    }
  };

  const descartar = () => {
    setPropuesta(null);
    setCandidatos([]);
    setEleccion(null);
    setEstado('escribiendo');
  };

  const conteoGestiones = (n) => (n === 1 ? '1 gestión' : `${n} gestiones`);

  const etiquetaCandidato = (c) =>
    c.tipo === 'causa'
      ? `${c.ref.rit} — ${(c.ref.caratula || '').slice(0, 46)}`
      : `${c.ref.id} — ${c.ref.cliente}${c.ref.asunto ? ` · ${c.ref.asunto}` : ''}` +
        `${c.ref.gestiones?.length ? ` (${conteoGestiones(c.ref.gestiones.length)})` : ''}`;

  // Recopilar todas las gestiones de todos los expedientes para la columna de Línea de Tiempo
  const todasLasGestiones = useMemo(() => {
    const lista = [];
    expedientes.forEach((exp) => {
      (exp.gestiones || []).forEach((g) => {
        lista.push({
          ...g,
          expedienteId: exp.id,
          expedienteCliente: exp.cliente,
          expedienteAsunto: exp.asunto,
          expedienteTipo: exp.tipo || 'extrajudicial'
        });
      });
    });

    // Ordenar cronológicamente descendente (lo más reciente primero)
    return lista.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [expedientes]);

  // Filtrar el feed del historial
  const gestionesFiltradas = useMemo(() => {
    return todasLasGestiones.filter((item) => {
      // Filtro de estado / tipo
      if (filtroEstado === 'PENDIENTES' && item.estado !== 'PENDIENTE (POR HACER)') return false;
      if (filtroEstado === 'COMPLETADAS' && item.estado !== 'COMPLETADO') return false;
      if (filtroEstado === 'EXTRAJUDICIAL' && item.expedienteTipo === 'judicial') return false;
      if (filtroEstado === 'JUDICIAL' && item.expedienteTipo !== 'judicial') return false;

      // Búsqueda por texto
      if (busquedaFeed.trim()) {
        const q = busquedaFeed.toLowerCase();
        const coincide =
          (item.tramite && item.tramite.toLowerCase().includes(q)) ||
          (item.textoOriginal && item.textoOriginal.toLowerCase().includes(q)) ||
          (item.expedienteCliente && item.expedienteCliente.toLowerCase().includes(q)) ||
          (item.expedienteAsunto && item.expedienteAsunto.toLowerCase().includes(q)) ||
          (item.expedienteId && item.expedienteId.toLowerCase().includes(q));
        if (!coincide) return false;
      }

      return true;
    });
  }, [todasLasGestiones, filtroEstado, busquedaFeed]);

  return (
    <div className="view-container stack" style={{ gap: 'var(--space-6)' }}>
      {/* Cabecera Principal */}
      <div className="section-header row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <MessageSquare size={24} color="var(--accent-color)" />
            <h1 className="h2">Bitácora omnicanal</h1>
          </div>
          <p className="muted">
            Centro de registro rápido con IA y trazabilidad en vivo de interacciones con clientes.
          </p>
        </div>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <span className="badge badge-gold">
            {expedientes.length} {expedientes.length === 1 ? 'Expediente' : 'Expedientes'}
          </span>
          <span className="badge">
            {todasLasGestiones.length} {todasLasGestiones.length === 1 ? 'Gestión' : 'Gestiones'}
          </span>
        </div>
      </div>

      {/* Disposición a 2 Columnas (40% Formulario NLP + 60% Feed de Interacciones) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 420px) 1fr',
          gap: 'var(--space-6)',
          alignItems: 'start'
        }}
      >
        {/* COLUMNA IZQUIERDA: Formulario de Entrada con Procesamiento de IA */}
        <div className="card card-static">
          <div className="card-header">
            <span className="card-title">✨ Registrar gestión con IA</span>
          </div>

          <div className="card-pad">
            {aviso && (
              <div className="card sem sem-AL_DIA card-pad" style={{ marginBottom: 'var(--space-4)' }}>
                <span className="row" style={{ gap: 'var(--space-2)' }}>
                  <CheckCircle2 size={15} color="var(--ok)" />
                  <span style={{ color: 'var(--ok)', fontSize: 'var(--text-xs)' }}>{aviso.texto}</span>
                </span>
              </div>
            )}

            {error && (
              <div className="card sem sem-VENCIDO card-pad" style={{ marginBottom: 'var(--space-4)' }}>
                <span className="row" style={{ gap: 'var(--space-2)' }}>
                  <AlertCircle size={15} color="var(--danger)" />
                  <span style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</span>
                </span>
              </div>
            )}

            {estado !== 'confirmando' && (
              <form onSubmit={analizar}>
                <label className="field-label" style={{ marginBottom: 'var(--space-2)', display: 'block' }}>
                  Anotación o transcripción de WhatsApp / reunión:
                </label>
                <textarea
                  className="textarea"
                  style={{ minHeight: '140px', fontSize: 'var(--text-sm)' }}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ej: llamé a Víctor Garai por la camioneta, me confirmó que irá a la fiscalía de Calbuco el viernes"
                  aria-label="Registro rápido de gestión"
                  disabled={estado === 'analizando'}
                />
                <div className="stack" style={{ marginTop: 'var(--space-3)', gap: 'var(--space-2)' }}>
                  <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={estado === 'analizando' || !texto.trim()}>
                    {estado === 'analizando' ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                    {estado === 'analizando' ? 'Analizando con Gemini...' : 'Analizar e Inyectar'}
                  </button>
                  <span className="muted" style={{ fontSize: 'var(--text-xs)', textAlign: 'center' }}>
                    LexControl asociará automáticamente la anotación a tu cliente o expediente.
                  </span>
                </div>
              </form>
            )}

            {estado === 'confirmando' && propuesta && (
              <div className="stack" style={{ gap: 'var(--space-4)' }}>
                <div className="card card-pad" style={{ background: 'var(--bg-secondary)', borderLeft: '3px solid var(--accent-color)' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                    <span className="eyebrow" style={{ color: 'var(--accent-color)' }}>Asociación recomendada</span>
                    <span className="badge">{propuesta.rol || 'EXTRAJUDICIAL'}</span>
                  </div>
                  <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: 4 }}>
                    {propuesta.cliente || 'Cliente sin identificar'} {propuesta.asunto ? `· ${propuesta.asunto}` : ''}
                  </strong>
                  <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                    {propuesta.tramite}
                  </p>
                </div>

                <div>
                  <p className="field-label">Selecciona el expediente de destino:</p>
                  <div className="stack" style={{ gap: 'var(--space-2)', maxHeight: '240px', overflowY: 'auto' }}>
                    {candidatos.map((c, i) => {
                      const activo = eleccion?.modo === 'existente' && eleccion.ref === c;
                      return (
                        <button
                          key={`${c.tipo}-${c.ref.id || c.ref.rit}-${i}`}
                          className={`opcion-destino${activo ? ' is-active' : ''}`}
                          onClick={() => setEleccion({ modo: 'existente', ref: c })}
                          style={{ textAlign: 'left', padding: '10px' }}
                        >
                          <span className="row" style={{ gap: 'var(--space-2)', minWidth: 0, justifyContent: 'space-between', width: '100%' }}>
                            <span className="row" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
                              <ArrowRight size={14} />
                              <span className="truncate" style={{ fontSize: 'var(--text-xs)' }}>{etiquetaCandidato(c)}</span>
                            </span>
                            <span className="badge">{c.tipo === 'causa' ? 'Judicial' : 'Existente'}</span>
                          </span>
                        </button>
                      );
                    })}

                    <button
                      className={`opcion-destino${eleccion?.modo === 'nuevo' ? ' is-active' : ''}`}
                      onClick={() => setEleccion({ modo: 'nuevo' })}
                      style={{ textAlign: 'left', padding: '10px' }}
                    >
                      <span className="row" style={{ gap: 'var(--space-2)', justifyContent: 'space-between', width: '100%' }}>
                        <span className="row" style={{ gap: 'var(--space-2)' }}>
                          <FolderPlus size={14} />
                          <span style={{ fontSize: 'var(--text-xs)' }}>
                            {candidatos.length ? 'Abrir expediente nuevo' : 'Abrir expediente nuevo'}
                          </span>
                        </span>
                        {eleccion?.modo === 'nuevo' && (
                          <span className="row" style={{ gap: 'var(--space-1)' }}>
                            {TIPOS_NUEVO.map(([valor, etiqueta]) => (
                              <span
                                key={valor}
                                role="button"
                                tabIndex={0}
                                className={`badge${tipoNuevo === valor ? ' badge-gold' : ''}`}
                                onClick={(ev) => { ev.stopPropagation(); setTipoNuevo(valor); }}
                                onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); setTipoNuevo(valor); } }}
                              >
                                {etiqueta}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={confirmar} disabled={estado === 'guardando' || !eleccion}>
                    {estado === 'guardando' ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                    Confirmar
                  </button>
                  <button className="btn-ghost" onClick={descartar} disabled={estado === 'guardando'}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Registro de Interacciones / Línea de Tiempo en Vivo */}
        <div className="card card-static">
          <div className="card-header row" style={{ justifyContent: 'space-between' }}>
            <span className="card-title">⏱️ Feed de interacciones en vivo</span>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              Mostrando {gestionesFiltradas.length} de {todasLasGestiones.length}
            </span>
          </div>

          <div className="card-pad stack" style={{ gap: 'var(--space-4)' }}>
            {/* Barra de Filtros y Búsqueda */}
            <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div className="search-input-wrapper" style={{ flex: 1, minWidth: '200px' }}>
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  className="input"
                  placeholder="Filtrar por cliente, asunto o contenido..."
                  value={busquedaFeed}
                  onChange={(e) => setBusquedaFeed(e.target.value)}
                  style={{ paddingLeft: '32px' }}
                />
              </div>

              <div className="row" style={{ gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                {['TODAS', 'PENDIENTES', 'COMPLETADAS', 'EXTRAJUDICIAL', 'JUDICIAL'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFiltroEstado(f)}
                    className={`btn-tab${filtroEstado === f ? ' is-active' : ''}`}
                    style={{
                      padding: '4px 10px',
                      fontSize: 'var(--text-xs)',
                      borderRadius: 'var(--radius-sm)',
                      background: filtroEstado === f ? 'var(--bg-tertiary)' : 'transparent',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Feed Timeline */}
            <div className="stack" style={{ gap: 'var(--space-3)', maxHeight: '680px', overflowY: 'auto', paddingRight: '4px' }}>
              {gestionesFiltradas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <MessageSquare size={32} className="muted" style={{ margin: '0 auto var(--space-2) auto' }} />
                  <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                    No se encontraron gestiones registradas con el filtro actual.
                  </p>
                </div>
              ) : (
                gestionesFiltradas.map((g, idx) => {
                  const esPendiente = g.estado === 'PENDIENTE (POR HACER)';
                  const esUrgente = g.urgencia === 'URGENTE';

                  return (
                    <div
                      key={g.id || `g-${idx}`}
                      className="card card-pad stack"
                      style={{
                        gap: 'var(--space-2)',
                        background: 'var(--bg-primary)',
                        borderLeft: `4px solid ${esPendiente ? (esUrgente ? 'var(--danger)' : 'var(--warning)') : 'var(--ok)'}`
                      }}
                    >
                      {/* Fila Superior: Datos de Cliente, Asunto y Badges */}
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div className="stack" style={{ gap: 2 }}>
                          <div className="row" style={{ gap: 'var(--space-2)' }}>
                            <User size={13} color="var(--accent-color)" />
                            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                              {g.expedienteCliente || 'Cliente General'}
                            </strong>
                            {g.expedienteAsunto && (
                              <span className="badge badge-gold" style={{ fontSize: '10px' }}>
                                {g.expedienteAsunto}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="row" style={{ gap: 'var(--space-2)' }}>
                          <span
                            className={`badge ${esPendiente ? (esUrgente ? 'badge-red' : 'badge-gold') : 'sem-AL_DIA'}`}
                            style={{ fontSize: '10px' }}
                          >
                            {esPendiente ? (esUrgente ? '⚡ URGENTE' : '⏳ PENDIENTE') : '✓ COMPLETADO'}
                          </span>
                          <span className="muted" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} /> {g.fecha} {g.hora ? `· ${g.hora}` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Cuerpo de la Gestión */}
                      <p style={{ fontSize: 'var(--text-sm)', margin: 0, fontWeight: '500', color: 'var(--text-primary)' }}>
                        {g.tramite}
                      </p>

                      {/* Transcripción original si difiere */}
                      {g.textoOriginal && g.textoOriginal !== g.tramite && (
                        <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: 0, fontStyle: 'italic', background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                          "{g.textoOriginal}"
                        </p>
                      )}

                      {/* Fila Inferior: Expediente ID y Cuaderno */}
                      <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--space-1)' }}>
                        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                          📁 ID: <strong style={{ color: 'var(--text-secondary)' }}>{g.expedienteId}</strong>
                        </span>
                        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                          {g.cuaderno || 'Bitácora Omnicanal'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
