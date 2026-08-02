import React, { useState } from 'react';
import { Search, FileText, ExternalLink, Loader2, Info, Sparkles, Quote } from 'lucide-react';

import { LEXCONTROL_API } from '../apiBase.js';

const ENDPOINT_POR_MODO = {
  frase: 'buscar_texto',
  semantica: 'buscar_semantico'
};

/**
 * Busca dentro del CONTENIDO de los expedientes, no en los nombres de archivo.
 * Dos modos:
 *  - "frase": FTS5 literal (indexar_pdfs.py). Exige la frase exacta, es instantánea.
 *  - "semantica": embeddings nomic-embed-text + similitud coseno (indexar_embeddings.py).
 *    Encuentra documentos por significado aunque no compartan las palabras exactas
 *    (ej. "despido sin causa justificada" encuentra un documento que dice "se puso
 *    término al contrato sin invocar causal"). Un poco más lenta (~1-2s: hay que
 *    vectorizar la consulta), y sólo cubre lo que indexar_embeddings.py ya vectorizó.
 */
export default function BuscadorTexto() {
  const [consulta, setConsulta] = useState('');
  const [modo, setModo] = useState('frase'); // frase | semantica
  const [estado, setEstado] = useState('inicial'); // inicial | buscando | listo | error
  const [resultados, setResultados] = useState([]);
  const [totalIndexado, setTotalIndexado] = useState(null);
  const [totalVectorizado, setTotalVectorizado] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const buscar = async (evento) => {
    evento.preventDefault();
    const q = consulta.trim();
    if (q.length < 3) {
      setMensaje('Escribe al menos 3 caracteres.');
      setEstado('error');
      return;
    }

    setEstado('buscando');
    setMensaje(null);
    try {
      const endpoint = ENDPOINT_POR_MODO[modo];
      const res = await fetch(`${LEXCONTROL_API}/${endpoint}?q=${encodeURIComponent(q)}`);
      const datos = await res.json();
      if (!res.ok) {
        setMensaje(`${datos.error || 'Error en la búsqueda'}${datos.pista ? ` — ${datos.pista}` : ''}`);
        setEstado('error');
        return;
      }
      setResultados(datos.resultados || []);
      setTotalIndexado(datos.totalIndexado ?? null);
      setTotalVectorizado(datos.totalVectorizado ?? null);
      setEstado('listo');
    } catch (e) {
      setMensaje(`No hay respuesta del servidor local: ${e.message}`);
      setEstado('error');
    }
  };

  const abrirArchivo = (ruta) => {
    fetch(`${LEXCONTROL_API}/abrir?ruta=${encodeURIComponent(ruta)}`).catch(() => {});
  };

  return (
    <div className="animate-fade-in">
      <div className="top-header">
        <div className="header-title">
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <Search size={20} color="var(--accent)" />
            <h1>Búsqueda en el contenido</h1>
          </div>
          <p>
            Busca dentro del texto de los expedientes, no en los nombres de archivo. Sirve para
            encontrar una cláusula, un RUT, un artículo citado o un argumento y saber en qué
            carpeta está.
          </p>
        </div>
      </div>

      <form onSubmit={buscar} className="card card-static card-pad" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <button
            type="button"
            className={modo === 'frase' ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
            onClick={() => setModo('frase')}
            aria-pressed={modo === 'frase'}
          >
            <Quote size={13} /> Frase exacta
          </button>
          <button
            type="button"
            className={modo === 'semantica' ? 'btn-secondary btn-sm' : 'btn-ghost btn-sm'}
            onClick={() => setModo('semantica')}
            aria-pressed={modo === 'semantica'}
          >
            <Sparkles size={13} /> Por significado
          </button>
        </div>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <input
            className="input"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder={
              modo === 'semantica'
                ? 'Ej: despido sin causa justificada, incumplimiento de contrato de arriendo…'
                : 'Ej: cláusula penal, Art. 1698, falta de emplazamiento, finiquito…'
            }
            aria-label="Texto a buscar dentro de los expedientes"
          />
          <button type="submit" className="btn-primary" disabled={estado === 'buscando'}>
            {estado === 'buscando' ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
            Buscar
          </button>
        </div>
        <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-3)' }}>
          <Info size={12} style={{ verticalAlign: '-2px' }} />{' '}
          {modo === 'semantica' ? (
            <>
              Encuentra documentos por significado aunque no usen las mismas palabras.
              {totalVectorizado !== null && totalIndexado !== null && (
                <> {totalVectorizado.toLocaleString('es-CL')} de {totalIndexado.toLocaleString('es-CL')} documentos ya
                vectorizados. Para completar el resto: <code className="mono">python3 indexar_embeddings.py</code></>
              )}
            </>
          ) : (
            <>
              Exige la frase exacta.
              {totalIndexado !== null && (
                <> {totalIndexado.toLocaleString('es-CL')} documentos indexados. Para incorporar los nuevos:{' '}
                <code className="mono">python3 indexar_pdfs.py</code></>
              )}
            </>
          )}
        </p>
      </form>

      {estado === 'error' && (
        <div className="card sem sem-VENCIDO card-pad">
          <span style={{ color: 'var(--danger)' }}>{mensaje}</span>
        </div>
      )}

      {estado === 'listo' && resultados.length === 0 && (
        <div className="card card-static">
          <div className="empty-state">
            <Search size={22} />
            <h3 style={{ marginTop: 'var(--space-3)' }}>Sin coincidencias</h3>
            <p>
              {modo === 'semantica'
                ? 'Ningún documento vectorizado se acerca a esa consulta. Prueba con otras palabras.'
                : 'Ningún documento indexado contiene esa frase exacta. Prueba con menos palabras.'}
            </p>
          </div>
        </div>
      )}

      {estado === 'listo' && resultados.length > 0 && (
        <div className="card card-static">
          <div className="card-header">
            <span className="card-title">
              {resultados.length}{resultados.length === 60 ? '+' : ''} documentos
            </span>
          </div>
          <div className="stack" style={{ gap: 0 }}>
            {resultados.map((r) => (
              <article key={r.ruta} className="resultado">
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <span className="row" style={{ gap: 'var(--space-2)' }}>
                      <FileText size={14} color="var(--text-muted)" />
                      <strong className="truncate" style={{ color: 'var(--text-primary)' }}>{r.nombre}</strong>
                    </span>
                    <span className="eyebrow">{r.carpeta}</span>
                  </div>
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    {modo === 'semantica' && typeof r.score === 'number' && (
                      <span
                        className="eyebrow"
                        title="Similitud semántica (coseno, 0 a 1)"
                        style={{ background: 'var(--bg-surface-2)', padding: '2px 6px', borderRadius: 4 }}
                      >
                        {Math.round(r.score * 100)}%
                      </span>
                    )}
                    <button className="btn-secondary btn-sm" onClick={() => abrirArchivo(r.ruta)}>
                      <ExternalLink size={13} /> Abrir
                    </button>
                  </div>
                </div>
                <p className="extracto">{r.extracto}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
