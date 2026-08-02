import React, { useEffect, useMemo, useState } from 'react';
import { Radar, Plus, Trash2, RefreshCw, AlertCircle, Scale } from 'lucide-react';

import {
  cargarAtencion,
  guardarPlazos,
  computarPlazo,
  procedimientosDisponibles,
  buscarProcedimiento,
  hoyLocal,
  REGIMENES
} from '../utils/radarPlazos.js';
import { formatearFechaEs } from '../utils/plazosChile.js';
import { MOCK_CASOS } from '../mockData';
import { PJUD_CASOS } from '../pjudCausesData';

const FORM_VACIO = {
  casoId: '',
  procedimientoId: '',
  fechaBase: hoyLocal(),
  notas: ''
};

const RADAR_VACIO = {
  atencion: [], pendientes: [], resto: [], todos: [], fatales: [], recordatorios: [],
  resumen: { VENCIDO: 0, HOY: 0, CRITICO: 0, URGENTE: 0, total: 0, accionables: 0, pendientes: 0 },
  error: null, huerfanas: 0, fueraDePlanilla: 0
};

export default function RadarPlazos({ onSelectCaso }) {
  // Todo lo que se muestra sale de acá, ya clasificado y ordenado. El Radar no
  // recolecta de ninguna fuente ni decide qué estados son accionables.
  const [radar, setRadar] = useState(RADAR_VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [errorForm, setErrorForm] = useState(null);
  const [filtro, setFiltro] = useState('ACCIONABLES');

  const procedimientos = useMemo(() => procedimientosDisponibles(), []);

  const recargar = () =>
    cargarAtencion({ causas: [...MOCK_CASOS, ...PJUD_CASOS] })
      .then((r) => { setRadar(r); setError(r.error); })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));

  useEffect(() => { recargar(); }, []);

  // El registro de fatales es lo único que esta pantalla edita, y se manda de
  // vuelta sin decorar.
  const persistir = async (siguientes) => {
    try {
      await guardarPlazos(siguientes);
      setError(null);
      await recargar();
    } catch (e) {
      setError(`No se pudo guardar en el servidor: ${e.message}`);
    }
  };

  const agregar = (evento) => {
    evento.preventDefault();
    try {
      const caso = [...MOCK_CASOS, ...PJUD_CASOS].find((c) => c.id === form.casoId);
      const nuevo = computarPlazo({
        casoId: form.casoId || null,
        rit: caso?.rit,
        caratula: caso?.caratula,
        tribunal: caso?.tribunal,
        procedimientoId: form.procedimientoId,
        fechaBase: form.fechaBase,
        notas: form.notas
      });
      persistir([...radar.fatales, nuevo]);
      setForm(FORM_VACIO);
      setMostrarForm(false);
      setErrorForm(null);
    } catch (e) {
      setErrorForm(e.message);
    }
  };

  const eliminar = (id) => persistir(radar.fatales.filter((p) => p.id !== id));

  // Lo urgente se muestra junto, venga de donde venga: esconder una tarea que
  // vence hoy en una lista secundaria es peor que mezclarla. Lo que NO se pierde
  // es de qué tipo es cada cosa, porque un plazo fatal y un recordatorio no
  // tienen la misma consecuencia.
  const stats = radar.resumen;
  const visibles = filtro === 'TODOS' ? radar.todos : radar.atencion;
  const agendaResto = radar.recordatorios;

  const procSeleccionado = form.procedimientoId ? buscarProcedimiento(form.procedimientoId) : null;

  return (
    <div className="animate-fade-in">
      <div className="top-header">
        <div className="header-title">
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <Radar size={20} color="var(--accent)" />
            <h1>Radar de Plazos</h1>
          </div>
          <p>
            Vencimientos calculados con el motor procesal, no estimados. Registra la actuación
            y la fecha desde la que corre el término; el cómputo aplica el régimen que
            corresponde y descuenta feriados legales.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          <Plus size={15} /> Vigilar un plazo
        </button>
      </div>

      {error && (
        <div className="card sem sem-VENCIDO card-pad" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="row">
            <AlertCircle size={16} color="var(--danger)" />
            <span style={{ color: 'var(--danger)' }}>{error}</span>
          </div>
        </div>
      )}

      <div className="grid-4">
        <TarjetaResumen etiqueta="Vencidos" valor={stats.VENCIDO} tono="var(--danger)" />
        <TarjetaResumen etiqueta="Vencen hoy" valor={stats.HOY} tono="var(--danger)" />
        <TarjetaResumen etiqueta="Críticos y urgentes" valor={stats.CRITICO + stats.URGENTE} tono="var(--warn)" />
        {/* Los pendientes de bitácora no son plazos: cuenta aparte para no
            inflar la cifra de urgencia con trabajo sin fecha de vencimiento. */}
        <TarjetaResumen etiqueta="Pendientes de bitácora" valor={stats.pendientes} tono="var(--text-primary)" />
      </div>

      {mostrarForm && (
        <form className="card card-static" onSubmit={agregar} style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-header">
            <span className="card-title">Nuevo plazo a vigilar</span>
          </div>
          <div className="card-pad">
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="field">
                <label className="field-label" htmlFor="rp-caso">Causa</label>
                <select
                  id="rp-caso"
                  className="select"
                  value={form.casoId}
                  onChange={(e) => setForm({ ...form, casoId: e.target.value })}
                >
                  <option value="">Sin causa asociada</option>
                  {[...MOCK_CASOS, ...PJUD_CASOS].slice(0, 400).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.rit} — {(c.caratula || '').slice(0, 60)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="rp-proc">Actuación procesal</label>
                <select
                  id="rp-proc"
                  className="select"
                  required
                  value={form.procedimientoId}
                  onChange={(e) => setForm({ ...form, procedimientoId: e.target.value })}
                >
                  <option value="">Elige la actuación…</option>
                  {Object.keys(REGIMENES).map((reg) => (
                    <optgroup key={reg} label={REGIMENES[reg].etiqueta}>
                      {procedimientos.filter((p) => p.regimen === reg).map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre} ({p.dias} días)</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="field">
                <label className="field-label" htmlFor="rp-fecha">
                  {procSeleccionado?.esHaciaAtras ? 'Fecha de la audiencia' : 'Fecha de notificación'}
                </label>
                <input
                  id="rp-fecha"
                  className="input"
                  type="date"
                  required
                  value={form.fechaBase}
                  onChange={(e) => setForm({ ...form, fechaBase: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="rp-notas">Nota (opcional)</label>
                <input
                  id="rp-notas"
                  className="input"
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Referencia interna, cuaderno, etc."
                />
              </div>
            </div>

            {procSeleccionado && (
              <p className="muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-4)' }}>
                <strong style={{ color: 'var(--accent)' }}>{procSeleccionado.articulo}</strong>
                {procSeleccionado.esHaciaAtras
                  ? ` · ${procSeleccionado.dias} días contados hacia atrás desde la audiencia.`
                  : ` · ${procSeleccionado.dias} días desde la notificación.`}
              </p>
            )}

            {errorForm && (
              <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
                {errorForm}
              </p>
            )}

            <div className="row">
              <button type="submit" className="btn-primary">Calcular y vigilar</button>
              <button type="button" className="btn-ghost" onClick={() => { setMostrarForm(false); setErrorForm(null); }}>
                Cancelar
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="card card-static">
        <div className="card-header">
          <span className="card-title">
            {filtro === 'TODOS' ? 'Todos los plazos' : 'Requieren atención'}
          </span>
          <div className="row">
            <button
              className={filtro === 'ACCIONABLES' ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
              onClick={() => setFiltro('ACCIONABLES')}
            >
              Accionables ({stats.accionables})
            </button>
            <button
              className={filtro === 'TODOS' ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
              onClick={() => setFiltro('TODOS')}
            >
              Todos ({stats.total})
            </button>
          </div>
        </div>

        {cargando && (
          <div className="empty-state">
            <RefreshCw size={20} className="spin" />
            <p style={{ marginTop: 'var(--space-3)' }}>Cargando el registro de plazos…</p>
          </div>
        )}

        {!cargando && visibles.length === 0 && (
          <div className="empty-state">
            <Scale size={22} />
            <h3 style={{ marginTop: 'var(--space-3)' }}>
              {radar.todos.length === 0 ? 'Todavía no vigilas ningún plazo' : 'Nada que requiera atención'}
            </h3>
            <p>
              {radar.todos.length === 0
                ? 'Registra una actuación y su fecha de notificación: el sistema calcula el vencimiento y lo vigila.'
                : 'Ningún plazo fatal vence dentro de los próximos días hábiles y ningún trámite está agendado para hoy.'}
            </p>
          </div>
        )}

        {!cargando && radar.fueraDePlanilla > 0 && (
          <p className="aviso-inline" style={{ marginBottom: 'var(--space-3)' }}>
            <AlertCircle size={12} />
            {radar.fueraDePlanilla} {radar.fueraDePlanilla === 1 ? 'entrada está guardada' : 'entradas están guardadas'} bajo
            una causa que no existe en la planilla oficial del PJUD ni entre tus expedientes.
            Suelen ser causas que creó la IA (rol "ROL/RIT EN TRÁMITE"). Van marcadas
            <span className="badge badge-yellow" style={{ margin: '0 4px' }}>fuera de planilla</span>
            en la columna Causa.
          </p>
        )}

        {!cargando && visibles.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th>Causa</th>
                  <th>Actuación</th>
                  {/* "Vence" sólo es cierto para los fatales; una gestión tiene
                      fecha de trámite. El encabezado vale para ambos. */}
                  <th>Fecha</th>
                  <th>Cuánto queda</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  return (
                    <tr key={p.id} className={`sem sem-${p.estado}`}>
                      <td>
                        <span className={`badge chip-${p.estado}`}>{p.etiquetaEstado}</span>
                      </td>
                      <td>
                        {/* Un plazo fatal se calculó bajo una regla procesal; una
                            tarea sólo tiene la fecha que se le puso. */}
                        {p.esFatal ? (
                          <span className="badge badge-gold" title={p.normativa || 'Calculado con el motor procesal'}>
                            Plazo fatal
                          </span>
                        ) : (
                          <span className="badge" title="Recordatorio propio: la fecha es la que escribiste, no un cómputo procesal">
                            Tarea
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn-ghost btn-sm"
                          style={{ padding: 0, textAlign: 'left' }}
                          onClick={() => {
                            const caso = [...MOCK_CASOS, ...PJUD_CASOS].find((c) => c.id === p.casoId);
                            if (caso && onSelectCaso) onSelectCaso(caso);
                          }}
                        >
                          <span className="stack" style={{ gap: 2 }}>
                            <span className="row" style={{ gap: 6 }}>
                              <strong className="mono">{p.casoRit}</strong>
                              {p.fueraDePlanilla && (
                                <span className="badge badge-yellow" title={`Guardada bajo "${p.claveOriginal}", que no corresponde a ninguna causa de la planilla oficial ni a un expediente propio`}>
                                  fuera de planilla
                                </span>
                              )}
                            </span>
                            <span className="muted truncate" style={{ maxWidth: 240, fontSize: 'var(--text-xs)' }}>
                              {p.caratulaMostrada}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="stack" style={{ gap: 2 }}>
                          <span style={{ color: 'var(--text-primary)' }}>{p.titulo}</span>
                          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{p.articulo}</span>
                        </span>
                      </td>
                      <td>
                        <span className="stack" style={{ gap: 2 }}>
                          <strong className="mono">{p.fechaMostrada}</strong>
                          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                            {formatearFechaEs(p.fechaMostrada)}
                          </span>
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: p.habilesRestantes < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                          {p.etiquetaTiempo}
                        </strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!p.esFatal ? null : (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => eliminar(p.id)}
                          aria-label={`Dejar de vigilar ${p.actuacion}`}
                          title="Dejar de vigilar"
                        >
                          <Trash2 size={14} />
                        </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {radar.pendientes.length > 0 && (
        <div className="card card-static" style={{ marginTop: 'var(--space-6)' }}>
          <div className="card-header">
            <span className="card-title">Pendientes de bitácora ({radar.pendientes.length})</span>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              lo más antiguo primero
            </span>
          </div>
          <div className="card-pad">
            <p className="muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-4)' }}>
              Gestiones registradas en la Bitácora, que estampa la fecha del día en que las
              escribes. No tienen vencimiento: siguen acá hasta que las marques REALIZADO en la
              ficha del expediente. La antigüedad es la señal — si algo lleva semanas, va arriba.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Antigüedad</th><th>Causa</th><th>Gestión</th><th>Anotada</th></tr>
                </thead>
                <tbody>
                  {radar.pendientes.slice(0, 60).map((g) => (
                    <tr key={g.id}>
                      <td>
                        <strong style={{ color: g.diasPendiente >= 30 ? 'var(--danger)' : g.diasPendiente >= 7 ? 'var(--warn)' : 'var(--text-primary)' }}>
                          {g.etiquetaTiempo}
                        </strong>
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <span className={g.expedienteResuelto ? 'mono' : 'mono muted'}>{g.casoRit}</span>
                          {g.fueraDePlanilla && (
                            <span className="badge badge-yellow" title={`Guardada bajo "${g.claveOriginal}", que no corresponde a ninguna causa de la planilla oficial`}>
                              fuera de planilla
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="truncate">{g.titulo}</td>
                      <td className="mono muted">{g.fechaMostrada}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {agendaResto.length > 0 && (
        <div className="card card-static" style={{ marginTop: 'var(--space-6)' }}>
          <div className="card-header">
            <span className="card-title">Trámites agendados para otro día</span>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              {agendaResto.length} · todavía no les llega la fecha
            </span>
          </div>
          <div className="card-pad">
            <p className="muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-4)' }}>
              Gestiones con "Fecha Trámite" elegida en la ficha, para un día que aún no llega.
              Suben solos a la lista de arriba el día que corresponde. No pasaron por el motor
              de cómputo procesal, así que su fecha no es un vencimiento calculado.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Fecha del trámite</th><th>Expediente</th><th>Gestión</th></tr>
                </thead>
                <tbody>
                  {agendaResto.slice(0, 40).map((g) => (
                    <tr key={g.id}>
                      <td className="mono">{g.fechaMostrada}</td>
                      <td>
                        {g.huerfana ? (
                          <span className="badge badge-yellow" title="Guardada por la Bitácora antigua bajo un identificador que no es una causa">
                            sin expediente
                          </span>
                        ) : (
                          <span className={g.expedienteResuelto ? 'mono' : 'mono muted'}>{g.casoRit}</span>
                        )}
                      </td>
                      <td className="truncate">{g.titulo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {radar.huerfanas > 0 && (
              <p className="aviso-inline" style={{ marginTop: 'var(--space-3)' }}>
                <AlertCircle size={12} />
                {radar.huerfanas} quedaron sin expediente porque la
                Bitácora antigua las guardó bajo un identificador inventado. Vuelve a registrarlas
                desde la Bitácora para asignarles uno.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaResumen({ etiqueta, valor, tono }) {
  return (
    <div className="card card-static stat">
      <div className="stat-label">{etiqueta}</div>
      <div className="stat-value" style={{ color: valor > 0 ? tono : 'var(--text-muted)' }}>{valor}</div>
    </div>
  );
}
