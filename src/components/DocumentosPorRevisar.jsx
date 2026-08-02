import React, { useEffect, useMemo, useState } from 'react';
import {
  Inbox, FileText, Loader2, CheckCircle2, AlertCircle,
  X, FolderOpen, Eye, Trash2, Search
} from 'lucide-react';

import { LEXCONTROL_API } from '../apiBase.js';
import { cargarExpedientes, parecido } from '../utils/expedientes.js';

const TIPOS_GESTION = [
  'notificacion', 'citacion_audiencia', 'resolucion_tramite', 'escrito_de_parte',
  'sentencia', 'resolucion_termino_probatorio', 'otro'
];

const CAMPO_VACIO = {
  rol: '', tribunal: '', caratula: '', materia: '', hito_critico: '',
  tipo_gestion: 'otro', fecha_audiencia_fijada: ''
};

/**
 * Bandeja "Documentos por Revisar".
 *
 * Antes el Vigilante archivaba y vinculaba a un expediente en el mismo gesto de
 * detectar el documento -sin ocasión de corregir un dato mal extraído antes de
 * que quedara escrito en la bitácora-. Ahora todo lo que el Vigilante analiza
 * queda acá esperando confirmación: se ve el documento, se editan los datos que
 * la IA extrajo, se elige a qué expediente va, y sólo entonces se archiva.
 */
export default function DocumentosPorRevisar() {
  const [pendientes, setPendientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [formulario, setFormulario] = useState(CAMPO_VACIO);
  const [expedientes, setExpedientes] = useState([]);
  const [expedienteElegidoId, setExpedienteElegidoId] = useState(null);
  const [busquedaExpediente, setBusquedaExpediente] = useState('');
  const [procesando, setProcesando] = useState(false);

  const cargarPendientes = () => {
    setCargando(true);
    fetch(`${LEXCONTROL_API}/documentos_pendientes`)
      .then((r) => r.json())
      .then((data) => setPendientes(data.documentos || []))
      .catch(() => setError('No se pudo cargar la bandeja de revisión.'))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargarPendientes();
    cargarExpedientes().then(setExpedientes).catch(() => setExpedientes([]));
  }, []);

  const seleccionado = pendientes.find((d) => d.id === seleccionadoId) || null;

  const abrir = (doc) => {
    setSeleccionadoId(doc.id);
    setError(null);
    const a = doc.analisis || {};
    setFormulario({
      rol: a.rol || '', tribunal: a.tribunal || '', caratula: a.caratula || '',
      materia: a.materia || '', hito_critico: a.hito_critico || '',
      tipo_gestion: a.tipo_gestion || 'otro', fecha_audiencia_fijada: a.fecha_audiencia_fijada || ''
    });
    setExpedienteElegidoId(doc.expedienteCandidatoId || null);
    setBusquedaExpediente('');
  };

  const cerrar = () => {
    setSeleccionadoId(null);
    setFormulario(CAMPO_VACIO);
    setExpedienteElegidoId(null);
  };

  // Candidatos rankeados por parecido con lo que dice el formulario -no sólo lo
  // que detectó la IA-: si el abogado ya corrigió la carátula a mano, la
  // búsqueda de expediente debe reflejar esa corrección, no la original.
  const candidatos = useMemo(() => {
    const aguja = [formulario.caratula, formulario.rol].filter(Boolean).join(' ');
    if (!aguja.trim()) return [];
    return expedientes
      .map((e) => ({
        expediente: e,
        score: Math.max(
          parecido(e.caratula || '', aguja),
          parecido(e.cliente || '', aguja),
          parecido(e.rit || e.ritVinculado || '', aguja)
        )
      }))
      .filter((c) => c.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [expedientes, formulario.caratula, formulario.rol]);

  const resultadosBusqueda = useMemo(() => {
    const q = busquedaExpediente.trim().toLowerCase();
    if (q.length < 2) return [];
    return expedientes
      .filter((e) =>
        (e.caratula || '').toLowerCase().includes(q) ||
        (e.cliente || '').toLowerCase().includes(q) ||
        (e.rit || e.ritVinculado || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [expedientes, busquedaExpediente]);

  const expedienteElegido = expedientes.find((e) => e.id === expedienteElegidoId) || null;

  const confirmar = async () => {
    if (!seleccionado) return;
    setProcesando(true);
    setError(null);
    try {
      const res = await fetch(`${LEXCONTROL_API}/confirmar_documento_pendiente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: seleccionado.id,
          ...formulario,
          expediente_id: expedienteElegidoId || undefined
        })
      });
      const data = await res.json();
      if (data.status !== 'ok') throw new Error(data.error || 'No se pudo confirmar');
      cerrar();
      cargarPendientes();
    } catch (e) {
      setError(e.message);
    } finally {
      setProcesando(false);
    }
  };

  const descartar = async () => {
    if (!seleccionado) return;
    if (!window.confirm(`¿Descartar "${seleccionado.nombreOriginal}"? Queda archivado sin clasificar, sin vincularse a ningún expediente.`)) return;
    setProcesando(true);
    setError(null);
    try {
      const res = await fetch(`${LEXCONTROL_API}/descartar_documento_pendiente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: seleccionado.id })
      });
      const data = await res.json();
      if (data.status !== 'ok') throw new Error(data.error || 'No se pudo descartar');
      cerrar();
      cargarPendientes();
    } catch (e) {
      setError(e.message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="top-header">
        <div className="header-title">
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <Inbox size={20} color="var(--accent)" />
            <h1>Documentos por Revisar</h1>
          </div>
          <p>
            Lo que el Vigilante analizó pero todavía no archivó. Revisa el documento y los datos
            antes de confirmar a qué expediente va — nada se archiva solo.
          </p>
        </div>
      </div>

      {error && (
        <div className="card sem sem-VENCIDO card-pad" style={{ marginBottom: 'var(--space-6)' }}>
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <AlertCircle size={15} color="var(--danger)" />
            <span style={{ color: 'var(--danger)' }}>{error}</span>
          </span>
        </div>
      )}

      {cargando ? (
        <div className="card card-static">
          <div className="empty-state">
            <Loader2 size={22} className="spin" />
            <h3 style={{ marginTop: 'var(--space-3)' }}>Cargando bandeja…</h3>
          </div>
        </div>
      ) : !seleccionado ? (
        pendientes.length === 0 ? (
          <div className="card card-static">
            <div className="empty-state">
              <CheckCircle2 size={22} color="var(--ok)" />
              <h3 style={{ marginTop: 'var(--space-3)' }}>No hay nada pendiente de revisión</h3>
              <p>Los documentos que detecte el Vigilante van a aparecer acá.</p>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {pendientes.map((doc) => (
              <div
                key={doc.id}
                className="card card-static card-hover-click"
                style={{ padding: '14px 18px', cursor: 'pointer' }}
                onClick={() => abrir(doc)}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 'var(--space-2)' }}>
                      <FileText size={15} color="var(--text-muted)" />
                      <strong className="truncate">{doc.nombreOriginal}</strong>
                    </div>
                    <p className="muted" style={{ fontSize: 'var(--text-xs)', margin: '4px 0 0 0' }}>
                      {doc.analisis?.hito_critico || 'Sin descripción'}
                      {doc.expedienteCandidatoCaratula ? ` · Candidato: ${doc.expedienteCandidatoCaratula}` : ' · Sin expediente candidato'}
                    </p>
                  </div>
                  <span className="muted mono" style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                    {new Date(doc.fechaDetectado).toLocaleString('es-CL')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid-7-5" style={{ alignItems: 'start' }}>
          {/* Vista previa */}
          <div className="card card-static">
            <div className="card-header">
              <span className="card-title">
                <Eye size={13} style={{ verticalAlign: '-2px' }} /> Vista previa
              </span>
              <button className="btn-ghost btn-sm" onClick={cerrar}>
                <X size={15} /> Volver a la lista
              </button>
            </div>
            <iframe
              src={`${LEXCONTROL_API}/documentos_pendientes_ver?id=${seleccionado.id}`}
              title={`Vista previa de ${seleccionado.nombreOriginal}`}
              className="previsor"
            />
          </div>

          {/* Análisis editable y destino */}
          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            <div className="card card-static">
              <div className="card-header"><span className="card-title">Datos del documento (editables)</span></div>
              <div className="card-pad stack" style={{ gap: 'var(--space-2)' }}>
                <label className="field-label">ROL / RIT</label>
                <input className="input" value={formulario.rol} onChange={(e) => setFormulario({ ...formulario, rol: e.target.value })} />

                <label className="field-label">Tribunal</label>
                <input className="input" value={formulario.tribunal} onChange={(e) => setFormulario({ ...formulario, tribunal: e.target.value })} />

                <label className="field-label">Carátula</label>
                <input className="input" value={formulario.caratula} onChange={(e) => setFormulario({ ...formulario, caratula: e.target.value })} />

                <label className="field-label">Materia</label>
                <input className="input" value={formulario.materia} onChange={(e) => setFormulario({ ...formulario, materia: e.target.value })} />

                <label className="field-label">Hito / qué resolvió</label>
                <input className="input" value={formulario.hito_critico} onChange={(e) => setFormulario({ ...formulario, hito_critico: e.target.value })} />

                <label className="field-label">Tipo de gestión</label>
                <select className="select" value={formulario.tipo_gestion} onChange={(e) => setFormulario({ ...formulario, tipo_gestion: e.target.value })}>
                  {TIPOS_GESTION.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>

                <label className="field-label">Fecha y hora de audiencia (si corresponde)</label>
                <input
                  className="input"
                  placeholder="ej: 13/08/2026 12:30"
                  value={formulario.fecha_audiencia_fijada}
                  onChange={(e) => setFormulario({ ...formulario, fecha_audiencia_fijada: e.target.value })}
                />
              </div>
            </div>

            <div className="card card-static">
              <div className="card-header"><span className="card-title">¿A qué expediente va?</span></div>
              <div className="card-pad stack" style={{ gap: 'var(--space-2)' }}>
                {expedienteElegido && (
                  <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                    Elegido: <strong className="mono">{expedienteElegido.rit || expedienteElegido.ritVinculado}</strong> — {expedienteElegido.caratula || expedienteElegido.cliente}
                  </p>
                )}
                {candidatos.map(({ expediente, score }) => (
                  <button
                    key={expediente.id}
                    className={`opcion-destino${expedienteElegidoId === expediente.id ? ' is-active' : ''}`}
                    onClick={() => setExpedienteElegidoId(expediente.id)}
                  >
                    <span className="row" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
                      <FolderOpen size={14} />
                      <span className="truncate">
                        {expediente.rit || expediente.ritVinculado} — {expediente.caratula || expediente.cliente}
                      </span>
                    </span>
                    <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{Math.round(score * 100)}%</span>
                  </button>
                ))}
                <button
                  className={`opcion-destino${!expedienteElegidoId ? ' is-active' : ''}`}
                  onClick={() => setExpedienteElegidoId(null)}
                >
                  <span className="row" style={{ gap: 'var(--space-2)' }}>
                    <FolderOpen size={14} />
                    <span>Crear expediente nuevo con el ROL de arriba</span>
                  </span>
                </button>

                <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  <Search size={14} color="var(--text-muted)" />
                  <input
                    className="input"
                    placeholder="Buscar otro expediente por rol o carátula…"
                    value={busquedaExpediente}
                    onChange={(e) => setBusquedaExpediente(e.target.value)}
                  />
                </div>
                {resultadosBusqueda.length > 0 && (
                  <div className="stack" style={{ gap: 'var(--space-1)' }}>
                    {resultadosBusqueda.map((e) => (
                      <button
                        key={e.id}
                        className={`opcion-destino${expedienteElegidoId === e.id ? ' is-active' : ''}`}
                        onClick={() => { setExpedienteElegidoId(e.id); setBusquedaExpediente(''); }}
                      >
                        <span className="truncate">{e.rit || e.ritVinculado} — {e.caratula || e.cliente}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="row">
              <button className="btn-primary" onClick={confirmar} disabled={procesando}>
                {procesando ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                Confirmar y archivar
              </button>
              <button className="btn-ghost" onClick={descartar} disabled={procesando} style={{ color: 'var(--danger)' }}>
                <Trash2 size={15} /> Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
