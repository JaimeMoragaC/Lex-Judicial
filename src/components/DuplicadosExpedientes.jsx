import React, { useEffect, useState } from 'react';
import { Copy, AlertTriangle, Loader2, Trash2, RefreshCw, Info } from 'lucide-react';

import { LEXCONTROL_API } from '../apiBase.js';
import { eliminarExpediente } from '../utils/expedientes.js';

/**
 * Candidatos a expediente duplicado, para que el abogado decida -nunca fusiona
 * ni borra nada solo-. Dos niveles calculados por el servidor (/expedientes_duplicados):
 *  - "exacto": mismo ROL/RIT registrado más de una vez (certeza total).
 *  - "probable": RIT distinto, pero cliente y carátula muy parecidos y creados
 *    el mismo día -indicio de un import duplicado, no de un cliente recurrente-.
 * No usa IA: se probó embeddings acá y no discriminaban bien nombres propios
 * parecidos, así que el servidor resuelve esto con similitud de texto.
 */
export default function DuplicadosExpedientes({ onSelectCaso }) {
  const [estado, setEstado] = useState('cargando'); // cargando | listo | error
  const [exactos, setExactos] = useState([]);
  const [probables, setProbables] = useState([]);
  const [totalExpedientes, setTotalExpedientes] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const [eliminados, setEliminados] = useState(() => new Set());

  const cargar = () => {
    setEstado('cargando');
    setMensaje(null);
    fetch(`${LEXCONTROL_API}/expedientes_duplicados`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status !== 'ok') throw new Error(data.error || 'No se pudo analizar el catálogo');
        setExactos(data.exactos || []);
        setProbables(data.probables || []);
        setTotalExpedientes(data.totalExpedientes ?? null);
        setEstado('listo');
      })
      .catch((e) => {
        setMensaje(e.message);
        setEstado('error');
      });
  };

  useEffect(() => {
    cargar();
  }, []);

  const borrar = async (exp) => {
    if (!window.confirm(`¿Eliminar el expediente "${exp.id}" (${exp.caratula || exp.cliente})?\n\nEsta acción no se puede deshacer.`)) return;
    setEliminando(exp.id);
    try {
      await eliminarExpediente(exp.id);
      setEliminados((prev) => new Set(prev).add(exp.id));
    } catch (e) {
      alert(`No se pudo eliminar: ${e.message}`);
    } finally {
      setEliminando(null);
    }
  };

  const totalCandidatos = exactos.reduce((n, g) => n + g.expedientes.length, 0) + probables.length * 2;

  return (
    <div className="animate-fade-in">
      <div className="top-header">
        <div className="header-title">
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <Copy size={20} color="var(--accent)" />
            <h1>Posibles expedientes duplicados</h1>
          </div>
          <p>
            Compara ROL/RIT, cliente, carátula y fecha de creación para encontrar registros que podrían
            ser la misma causa cargada más de una vez. Sólo sugiere: nada se borra automáticamente.
          </p>
        </div>
        <button className="btn-secondary" onClick={cargar} disabled={estado === 'cargando'}>
          {estado === 'cargando' ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          Analizar de nuevo
        </button>
      </div>

      {estado === 'cargando' && (
        <div className="card card-static card-pad">
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <Loader2 size={16} className="spin" />
            <span>Comparando {totalExpedientes ? totalExpedientes.toLocaleString('es-CL') : 'los'} expedientes…</span>
          </div>
        </div>
      )}

      {estado === 'error' && (
        <div className="card sem sem-VENCIDO card-pad">
          <span style={{ color: 'var(--danger)' }}>{mensaje}</span>
        </div>
      )}

      {estado === 'listo' && totalCandidatos === 0 && (
        <div className="card card-static">
          <div className="empty-state">
            <Copy size={22} />
            <h3 style={{ marginTop: 'var(--space-3)' }}>Sin duplicados evidentes</h3>
            <p>No se encontraron ROL repetidos ni carátulas casi idénticas creadas el mismo día.</p>
          </div>
        </div>
      )}

      {estado === 'listo' && exactos.length > 0 && (
        <div className="card card-static" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-header">
            <span className="card-title">
              <AlertTriangle size={15} color="var(--danger)" style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {exactos.length} ROL/RIT registrados más de una vez
            </span>
          </div>
          <div className="stack" style={{ gap: 0 }}>
            {exactos.map((grupo) => (
              <article key={grupo.clave} className="resultado">
                <div className="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>{grupo.clave}</div>
                <div className="stack" style={{ gap: 'var(--space-2)' }}>
                  {grupo.expedientes.map((exp) => (
                    <FilaExpediente
                      key={exp.id}
                      exp={exp}
                      eliminado={eliminados.has(exp.id)}
                      eliminando={eliminando === exp.id}
                      onEliminar={() => borrar(exp)}
                      onAbrir={() => onSelectCaso && onSelectCaso(exp)}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {estado === 'listo' && probables.length > 0 && (
        <div className="card card-static">
          <div className="card-header">
            <span className="card-title">
              <Info size={15} color="var(--accent-gold)" style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {probables.length} posibles duplicados (revisar)
            </span>
          </div>
          <div className="stack" style={{ gap: 0 }}>
            {probables.map((par, i) => (
              <article key={i} className="resultado">
                <div className="eyebrow" style={{ marginBottom: 'var(--space-2)' }}>
                  Creados el mismo día ({par.creadoEn}) · carátula {Math.round(par.similitudCaratula * 100)}% parecida
                </div>
                <div className="stack" style={{ gap: 'var(--space-2)' }}>
                  {par.expedientes.map((exp) => (
                    <FilaExpediente
                      key={exp.id}
                      exp={exp}
                      eliminado={eliminados.has(exp.id)}
                      eliminando={eliminando === exp.id}
                      onEliminar={() => borrar(exp)}
                      onAbrir={() => onSelectCaso && onSelectCaso(exp)}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilaExpediente({ exp, eliminado, eliminando, onEliminar, onAbrir }) {
  return (
    <div className="row-between" style={{ alignItems: 'flex-start', opacity: eliminado ? 0.4 : 1 }}>
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <strong className="truncate" style={{ color: 'var(--text-primary)' }}>{exp.rit}</strong>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>{exp.id}</span>
        </span>
        <span className="eyebrow truncate">{exp.caratula || exp.cliente}</span>
      </div>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {eliminado ? (
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>Eliminado</span>
        ) : (
          <>
            <button className="btn-secondary btn-sm" onClick={onAbrir}>Abrir</button>
            <button className="btn-secondary btn-sm" onClick={onEliminar} disabled={eliminando}>
              {eliminando ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
              Eliminar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
