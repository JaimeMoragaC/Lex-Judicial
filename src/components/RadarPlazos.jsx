import React, { useEffect, useMemo, useState } from 'react';
import { Radar, Plus, Trash2, RefreshCw, AlertCircle, Scale } from 'lucide-react';

import {
  cargarPlazos,
  guardarPlazos,
  computarPlazo,
  clasificar,
  habilesRestantes,
  ordenarPorUrgencia,
  resumen,
  procedimientosDisponibles,
  buscarProcedimiento,
  hoyLocal,
  REGIMENES,
  ETIQUETA_ESTADO,
  cargarAgenda
} from '../utils/radarPlazos.js';
import { formatearFechaEs } from '../utils/plazosChile.js';
import { MOCK_CASOS } from '../mockData';
import { cargarExpedientes } from '../utils/expedientes.js';

const FORM_VACIO = {
  casoId: '',
  procedimientoId: '',
  fechaBase: hoyLocal(),
  notas: ''
};

export default function RadarPlazos({ onSelectCaso }) {
  const [plazos, setPlazos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [errorForm, setErrorForm] = useState(null);
  const [filtro, setFiltro] = useState('ACCIONABLES');

  const hoy = hoyLocal();
  const procedimientos = useMemo(() => procedimientosDisponibles(), []);

  const [agenda, setAgenda] = useState([]);

  useEffect(() => {
    cargarPlazos()
      .then((p) => { setPlazos(p); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));

    // La agenda se carga aparte: son recordatorios, no plazos fatales, y se
    // necesitan las causas y los expedientes para saber cuáles quedaron
    // huérfanas de la Bitácora antigua.
    cargarExpedientes()
      .catch(() => [])
      .then((exps) => cargarAgenda(MOCK_CASOS, exps || []))
      .then(setAgenda)
      .catch(() => setAgenda([]));
  }, []);

  const persistir = async (siguientes) => {
    setPlazos(siguientes);
    try {
      await guardarPlazos(siguientes);
      setError(null);
    } catch (e) {
      setError(`No se pudo guardar en el servidor: ${e.message}`);
    }
  };

  const agregar = (evento) => {
    evento.preventDefault();
    try {
      const caso = MOCK_CASOS.find((c) => c.id === form.casoId);
      const nuevo = computarPlazo({
        casoId: form.casoId || null,
        rit: caso?.rit,
        caratula: caso?.caratula,
        tribunal: caso?.tribunal,
        procedimientoId: form.procedimientoId,
        fechaBase: form.fechaBase,
        notas: form.notas
      });
      persistir([...plazos, nuevo]);
      setForm(FORM_VACIO);
      setMostrarForm(false);
      setErrorForm(null);
    } catch (e) {
      setErrorForm(e.message);
    }
  };

  const eliminar = (id) => persistir(plazos.filter((p) => p.id !== id));

  const stats = useMemo(() => resumen(plazos, hoy), [plazos, hoy]);

  const visibles = useMemo(() => {
    const ordenados = ordenarPorUrgencia(plazos, hoy);
    if (filtro === 'TODOS') return ordenados;
    return ordenados.filter((p) => {
      const estado = clasificar(p, hoy);
      return estado !== 'AL_DIA' && estado !== 'PROXIMO';
    });
  }, [plazos, filtro, hoy]);

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
        <TarjetaResumen etiqueta="Total vigilados" valor={stats.total} tono="var(--text-primary)" />
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
                  {MOCK_CASOS.slice(0, 400).map((c) => (
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
              {plazos.length === 0 ? 'Todavía no vigilas ningún plazo' : 'Nada que requiera atención'}
            </h3>
            <p>
              {plazos.length === 0
                ? 'Registra una actuación y su fecha de notificación: el sistema calcula el vencimiento y lo vigila.'
                : 'Ningún plazo vence dentro de los próximos días hábiles.'}
            </p>
          </div>
        )}

        {!cargando && visibles.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Causa</th>
                  <th>Actuación</th>
                  <th>Vence</th>
                  <th>Hábiles restantes</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const estado = clasificar(p, hoy);
                  const restantes = habilesRestantes(p.fechaVencimiento, p.regimen, hoy);
                  return (
                    <tr key={p.id} className={`sem sem-${estado}`}>
                      <td>
                        <span className={`badge chip-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>
                      </td>
                      <td>
                        <button
                          className="btn-ghost btn-sm"
                          style={{ padding: 0, textAlign: 'left' }}
                          onClick={() => {
                            const caso = MOCK_CASOS.find((c) => c.id === p.casoId);
                            if (caso && onSelectCaso) onSelectCaso(caso);
                          }}
                        >
                          <span className="stack" style={{ gap: 2 }}>
                            <strong className="mono">{p.rit}</strong>
                            <span className="muted truncate" style={{ maxWidth: 240, fontSize: 'var(--text-xs)' }}>
                              {p.caratula}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="stack" style={{ gap: 2 }}>
                          <span style={{ color: 'var(--text-primary)' }}>{p.actuacion}</span>
                          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{p.articulo}</span>
                        </span>
                      </td>
                      <td>
                        <span className="stack" style={{ gap: 2 }}>
                          <strong className="mono">{p.fechaVencimiento}</strong>
                          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                            {formatearFechaEs(p.fechaVencimiento)}
                          </span>
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: restantes < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                          {restantes < 0 ? 'Vencido' : `${restantes} ${restantes === 1 ? 'día' : 'días'}`}
                        </strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => eliminar(p.id)}
                          aria-label={`Dejar de vigilar ${p.actuacion}`}
                          title="Dejar de vigilar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {agenda.length > 0 && (
        <div className="card card-static" style={{ marginTop: 'var(--space-6)' }}>
          <div className="card-header">
            <span className="card-title">Recordatorios de agenda</span>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              {agenda.length} · no son plazos fatales
            </span>
          </div>
          <div className="card-pad">
            <p className="muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-4)' }}>
              Notas y tareas con fecha. No pasaron por el motor de cómputo procesal, así que
              su fecha es la que se escribió, no un vencimiento calculado.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Fecha</th><th>Expediente</th><th>Gestión</th></tr>
                </thead>
                <tbody>
                  {agenda.slice(0, 40).map((g) => (
                    <tr key={g.id}>
                      <td className="mono">{g.fechaVencimiento}</td>
                      <td>
                        {g.huerfana ? (
                          <span className="badge badge-yellow" title="Guardada por la Bitácora antigua bajo un identificador que no es una causa">
                            sin expediente
                          </span>
                        ) : (
                          <span className={g.expedienteResuelto ? 'mono' : 'mono muted'}>{g.casoRit}</span>
                        )}
                      </td>
                      <td className="truncate">{g.actuacion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {agenda.filter((g) => g.huerfana).length > 0 && (
              <p className="aviso-inline" style={{ marginTop: 'var(--space-3)' }}>
                <AlertCircle size={12} />
                {agenda.filter((g) => g.huerfana).length} quedaron sin expediente porque la
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
