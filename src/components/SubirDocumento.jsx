import React, { useMemo, useRef, useState } from 'react';
import {
  UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle,
  X, FolderOpen, Eye
} from 'lucide-react';

import { LEXCONTROL_API } from '../apiBase.js';
import { REAL_DISK_DATA } from '../realDiskData.js';
import { parecido } from '../utils/expedientes.js';

const MAX_MB = 60;
const BANDEJA = '_Bandeja de entrada (sin clasificar)';

/**
 * Subir y analizar un documento, con vista previa ANTES de integrarlo.
 *
 * El flujo anterior archivaba el PDF en el mismo gesto de soltarlo: no había
 * ocasión de mirar qué documento era ni de revisar lo que la IA había extraído,
 * y si la carátula no calzaba con ninguna carpeta el archivo se perdía. Acá el
 * análisis es de sólo lectura (?archivar=false) y nada entra al expediente hasta
 * que se confirma el destino.
 */
export default function SubirDocumento() {
  const [archivo, setArchivo] = useState(null);
  const [urlPrevia, setUrlPrevia] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [estado, setEstado] = useState('vacio'); // vacio | analizando | revisando | integrando | listo
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [carpeta, setCarpeta] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef(null);

  // Candidatos de carpeta ordenados por parecido. No basta con la carátula que
  // devuelve la IA: se la vio entregar "Causa Penal: RIT C-272-2025" para un
  // documento cuyas partes eran "MEDINA con ILUSTRE MUNICIPALIDAD". Se suma el
  // texto del documento y el nombre del archivo, donde los apellidos sí están.
  const candidatos = useMemo(() => {
    if (!analisis) return [];
    const aguja = [
      analisis.caratula,
      analisis.rol,
      archivo?.name?.replace(/\.[a-z0-9]+$/i, ''),
      (analisis.texto_extraido_muestra || '').slice(0, 400)
    ].filter(Boolean).join(' ');
    if (!aguja.trim()) return [];
    return REAL_DISK_DATA
      .map((c) => ({ nombre: c.folderName, score: parecido(c.folderName, aguja) }))
      .filter((c) => c.score >= 0.34)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [analisis, archivo]);

  const limpiar = () => {
    if (urlPrevia) URL.revokeObjectURL(urlPrevia);
    setArchivo(null); setUrlPrevia(null); setAnalisis(null);
    setError(null); setResultado(null); setCarpeta(''); setEstado('vacio');
  };

  const recibirArchivo = async (file) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo es ${MAX_MB} MB.`);
      return;
    }
    setError(null);
    setResultado(null);
    setArchivo(file);
    // La vista previa se arma en el navegador con el archivo local: no requiere
    // subirlo antes, así que se puede mirar sin que nada toque el expediente.
    if (urlPrevia) URL.revokeObjectURL(urlPrevia);
    setUrlPrevia(URL.createObjectURL(file));
    setEstado('analizando');

    try {
      const res = await fetch(
        `${LEXCONTROL_API}/analizar_documento?archivar=false&filename=${encodeURIComponent(file.name)}`,
        { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } }
      );
      const data = await res.json();
      if (data.status !== 'ok') throw new Error(data.error || 'No se pudo analizar el documento');
      setAnalisis(data);
      setEstado('revisando');
    } catch (e) {
      setError(`Análisis fallido: ${e.message}. Puedes integrarlo igual y clasificarlo después.`);
      setAnalisis({ archivo: file.name });
      setEstado('revisando');
    }
  };

  const integrar = async () => {
    if (!archivo) return;
    setEstado('integrando');
    setError(null);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1]);
        fr.onerror = () => reject(new Error('No se pudo leer el archivo'));
        fr.readAsDataURL(archivo);
      });

      const res = await fetch(`${LEXCONTROL_API}/subir_documento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: archivo.name,
          content_b64: b64,
          carpeta_cliente: carpeta || BANDEJA
        })
      });
      const data = await res.json();
      if (data.status !== 'ok') throw new Error(data.error || 'No se pudo guardar');
      setResultado(data);
      setEstado('listo');
    } catch (e) {
      setError(e.message);
      setEstado('revisando');
    }
  };

  const esPdf = archivo && (archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name));

  return (
    <div className="animate-fade-in">
      <div className="top-header">
        <div className="header-title">
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <UploadCloud size={20} color="var(--accent)" />
            <h1>Subir y analizar documento</h1>
          </div>
          <p>
            El documento se analiza sin salir de acá. Puedes verlo y revisar lo que la IA
            extrajo antes de decidir a qué expediente entra. Nada se archiva hasta que confirmes.
          </p>
        </div>
        {archivo && (
          <button className="btn-ghost" onClick={limpiar}>
            <X size={15} /> Empezar de nuevo
          </button>
        )}
      </div>

      {error && (
        <div className="card sem sem-VENCIDO card-pad" style={{ marginBottom: 'var(--space-6)' }}>
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <AlertCircle size={15} color="var(--danger)" />
            <span style={{ color: 'var(--danger)' }}>{error}</span>
          </span>
        </div>
      )}

      {resultado && (
        <div className="card sem sem-AL_DIA card-pad" style={{ marginBottom: 'var(--space-6)' }}>
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <CheckCircle2 size={15} color="var(--ok)" />
            <span style={{ color: 'var(--ok)' }}>{resultado.message}</span>
          </span>
          <p className="muted mono" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
            {resultado.path}
          </p>
        </div>
      )}

      {estado === 'vacio' && (
        <div
          className={`zona-suelta${arrastrando ? ' is-activa' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault(); setArrastrando(false);
            recibirArchivo(e.dataTransfer.files?.[0]);
          }}
        >
          <UploadCloud size={26} color="var(--text-muted)" />
          <h3>Suelta aquí el documento</h3>
          <p className="muted">
            Resolución de la OJV, escrito, contrato o expediente. PDF, DOCX o imagen, hasta {MAX_MB} MB.
          </p>
          <button className="btn-primary" onClick={() => inputRef.current?.click()}>
            Elegir archivo
          </button>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
            onChange={(e) => recibirArchivo(e.target.files?.[0])}
          />
        </div>
      )}

      {estado === 'analizando' && (
        <div className="card card-static">
          <div className="empty-state">
            <Loader2 size={22} className="spin" />
            <h3 style={{ marginTop: 'var(--space-3)' }}>Analizando {archivo?.name}</h3>
            <p>Extrayendo rol, tribunal, carátula y plazos. No se ha archivado nada todavía.</p>
          </div>
        </div>
      )}

      {(estado === 'revisando' || estado === 'integrando' || estado === 'listo') && archivo && (
        <div className="grid-7-5" style={{ alignItems: 'start' }}>
          {/* Vista previa */}
          <div className="card card-static">
            <div className="card-header">
              <span className="card-title">
                <Eye size={13} style={{ verticalAlign: '-2px' }} /> Vista previa
              </span>
              <span className="muted truncate" style={{ fontSize: 'var(--text-xs)', maxWidth: 220 }}>
                {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB
              </span>
            </div>
            {esPdf ? (
              <iframe src={urlPrevia} title="Vista previa del documento" className="previsor" />
            ) : /^image\//.test(archivo.type) ? (
              <div className="previsor-imagen">
                <img src={urlPrevia} alt={`Vista previa de ${archivo.name}`} />
              </div>
            ) : (
              <div className="empty-state">
                <FileText size={22} />
                <h3 style={{ marginTop: 'var(--space-3)' }}>Sin vista previa</h3>
                <p>
                  El navegador no puede mostrar {archivo.name.split('.').pop()?.toUpperCase()} en pantalla.
                  Su texto sí se indexa al integrarlo.
                </p>
              </div>
            )}
          </div>

          {/* Análisis y destino */}
          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            <div className="card card-static">
              <div className="card-header"><span className="card-title">Lo que leyó la IA</span></div>
              <div className="card-pad">
                {[
                  ['ROL / RIT', analisis?.rol],
                  ['Tribunal', analisis?.tribunal],
                  ['Carátula', analisis?.caratula],
                  ['Materia', analisis?.materia],
                  ['Hito', analisis?.hito_critico],
                  ['Plazo', analisis?.plazo_dias ? `${analisis.plazo_dias} días · ${analisis.tipo_plazo || ''}` : null]
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="dato-fila">
                    <span className="field-label" style={{ margin: 0 }}>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
                <p className="aviso-inline" style={{ marginTop: 'var(--space-3)' }}>
                  <AlertCircle size={12} /> Extraído por IA: verifícalo contra el documento antes de confiar en él.
                </p>
              </div>
            </div>

            <div className="card card-static">
              <div className="card-header"><span className="card-title">¿A qué carpeta va?</span></div>
              <div className="card-pad stack" style={{ gap: 'var(--space-2)' }}>
                {candidatos.map((c) => (
                  <button
                    key={c.nombre}
                    className={`opcion-destino${carpeta === c.nombre ? ' is-active' : ''}`}
                    onClick={() => setCarpeta(c.nombre)}
                    disabled={estado !== 'revisando'}
                  >
                    <span className="row" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
                      <FolderOpen size={14} />
                      <span className="truncate">{c.nombre}</span>
                    </span>
                  </button>
                ))}
                <button
                  className={`opcion-destino${carpeta === BANDEJA ? ' is-active' : ''}`}
                  onClick={() => setCarpeta(BANDEJA)}
                  disabled={estado !== 'revisando'}
                >
                  <span className="row" style={{ gap: 'var(--space-2)' }}>
                    <FolderOpen size={14} />
                    <span>{candidatos.length ? 'Ninguna: dejar por clasificar' : 'Dejar en la bandeja por clasificar'}</span>
                  </span>
                </button>

                <select
                  className="select"
                  value={candidatos.some((c) => c.nombre === carpeta) || carpeta === BANDEJA ? '' : carpeta}
                  onChange={(e) => setCarpeta(e.target.value)}
                  disabled={estado !== 'revisando'}
                  aria-label="Buscar otra carpeta de cliente"
                  style={{ marginTop: 'var(--space-2)' }}
                >
                  <option value="">…o busca entre las {REAL_DISK_DATA.length} carpetas</option>
                  {REAL_DISK_DATA.map((c) => (
                    <option key={c.folderName} value={c.folderName}>{c.folderName}</option>
                  ))}
                </select>
              </div>
            </div>

            {estado !== 'listo' && (
              <div className="row">
                <button className="btn-primary" onClick={integrar} disabled={estado === 'integrando' || !carpeta}>
                  {estado === 'integrando' ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                  Integrar al expediente
                </button>
                <button className="btn-ghost" onClick={limpiar} disabled={estado === 'integrando'}>
                  Descartar
                </button>
              </div>
            )}
            {estado === 'revisando' && !carpeta && (
              <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Elige una carpeta para poder integrarlo.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
