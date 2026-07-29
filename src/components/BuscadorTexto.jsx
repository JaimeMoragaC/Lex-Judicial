import React, { useState } from 'react';
import { Search, FileText, ExternalLink, Loader2, Info } from 'lucide-react';

import { LEXCONTROL_API } from '../apiBase.js';

/**
 * Busca dentro del CONTENIDO de los expedientes, no en los nombres de archivo.
 * El índice lo construye indexar_pdfs.py y lo consulta el servidor por FTS5.
 */
export default function BuscadorTexto() {
  const [consulta, setConsulta] = useState('');
  const [estado, setEstado] = useState('inicial'); // inicial | buscando | listo | error
  const [resultados, setResultados] = useState([]);
  const [totalIndexado, setTotalIndexado] = useState(null);
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
      const res = await fetch(`${LEXCONTROL_API}/buscar_texto?q=${encodeURIComponent(q)}`);
      const datos = await res.json();
      if (!res.ok) {
        setMensaje(`${datos.error || 'Error en la búsqueda'}${datos.pista ? ` — ${datos.pista}` : ''}`);
        setEstado('error');
        return;
      }
      setResultados(datos.resultados || []);
      setTotalIndexado(datos.totalIndexado ?? null);
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
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <input
            className="input"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Ej: cláusula penal, Art. 1698, falta de emplazamiento, finiquito…"
            aria-label="Texto a buscar dentro de los expedientes"
          />
          <button type="submit" className="btn-primary" disabled={estado === 'buscando'}>
            {estado === 'buscando' ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
            Buscar
          </button>
        </div>
        {totalIndexado !== null && (
          <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-3)' }}>
            <Info size={12} style={{ verticalAlign: '-2px' }} /> {totalIndexado.toLocaleString('es-CL')} documentos
            indexados. Para incorporar los nuevos: <code className="mono">python3 indexar_pdfs.py</code>
          </p>
        )}
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
            <p>Ningún documento indexado contiene esa frase exacta. Prueba con menos palabras.</p>
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
                  <button className="btn-secondary btn-sm" onClick={() => abrirArchivo(r.ruta)}>
                    <ExternalLink size={13} /> Abrir
                  </button>
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
