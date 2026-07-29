import React, { useState, useEffect } from 'react';
import {
  FileText,
  Sparkles,
  Copy,
  Check,
  Loader2,
  FolderGit2,
  Send,
  Download,
  CheckCircle2,
  BookOpen,
  Gavel
} from 'lucide-react';

import { MOCK_CASOS } from '../mockData';
import { LEXCONTROL_API } from '../apiBase';
import { cargarExpedientes, guardarExpedientes } from '../utils/expedientes';

const PLANTILLAS = [
  {
    id: 'impulso',
    titulo: 'Impulso Procesal (Art. 152 CPC)',
    instruccion: 'Solicitar al tribunal dar curso progresivo a los autos y proveer la solicitud pendiente para evitar paralización.'
  },
  {
    id: 'certificacion',
    titulo: 'Certificación de Término de Plazo',
    instruccion: 'Pedir que el Sr. Secretario del tribunal certifique el vencimiento del término probatorio / plazo para contestar.'
  },
  {
    id: 'reposicion',
    titulo: 'Recurso de Reposición (Art. 181 CPC)',
    instruccion: 'Interponer recurso de reposición con subsidio de apelación en contra de la resolución que no dio lugar a la solicitud de la parte.'
  },
  {
    id: 'tengase_presente',
    titulo: 'Téngase Presente & Acompaña Documentos',
    instruccion: 'Presentar escrito de téngase presente acompañando documentos fundantes con citación.'
  },
  {
    id: 'videoconferencia',
    titulo: 'Solicitud de Comparición por Videoconferencia',
    instruccion: 'Solicitar comparecencia a la audiencia fijada mediante plataforma Zoom / videoconferencia por residir en otra comuna.'
  },
  {
    id: 'minuta',
    titulo: 'Minuta de Alegatos de Clausura',
    instruccion: 'Redactar minuta ejecutiva de alegatos sintetizando la teoría del caso, prueba rendida y conclusiones finales.'
  }
];

export default function RedactorIA({ onSelectCaso }) {
  const [expedientes, setExpedientes] = useState([]);
  const [casoSeleccionado, setCasoSeleccionado] = useState(null);
  const [tipoEscrito, setTipoEscrito] = useState('Solicitud de impulso procesal');
  const [instruccion, setInstruccion] = useState('');
  const [modoGeneracion, setModoGeneracion] = useState('ia'); // 'ia' o 'heuristico'
  const [generando, setGenerando] = useState(false);
  const [escritoResultado, setEscritoResultado] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [guardadoBitacora, setGuardadoBitacora] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    cargarExpedientes()
      .then((data) => {
        setExpedientes(data);
        if (data.length > 0) {
          setCasoSeleccionado(data[0]);
        } else if (MOCK_CASOS.length > 0) {
          setCasoSeleccionado(MOCK_CASOS[0]);
        }
      })
      .catch(() => {
        if (MOCK_CASOS.length > 0) setCasoSeleccionado(MOCK_CASOS[0]);
      });
  }, []);

  // Todos los casos disponibles (Causas PJUD + Expedientes Extrajudiciales)
  const todosLosCasos = React.useMemo(() => {
    const lista = [];
    MOCK_CASOS.forEach((c) => {
      lista.push({
        id: c.rit,
        rit: c.rit,
        caratula: c.caratula,
        tribunal: c.tribunal,
        materia: c.materia,
        tipo: 'Judicial (PJUD)'
      });
    });
    expedientes.forEach((e) => {
      if (!lista.some((x) => x.id === e.id || x.rit === e.ritVinculado)) {
        lista.push({
          id: e.id,
          rit: e.ritVinculado || e.id,
          caratula: e.cliente + (e.asunto ? ` — ${e.asunto}` : ''),
          tribunal: 'Gestión Extrajudicial / Administrativa',
          materia: e.asunto || 'Asesoría / Tramitación',
          tipo: 'Extrajudicial'
        });
      }
    });
    return lista;
  }, [expedientes]);

  const seleccionarPlantilla = (p) => {
    setTipoEscrito(p.titulo);
    setInstruccion(p.instruccion);
  };

  const generarEscrito = async (e) => {
    if (e) e.preventDefault();
    if (!casoSeleccionado) {
      setError('Por favor selecciona una causa antes de generar el escrito.');
      return;
    }

    setGenerando(true);
    setError(null);
    setCopiado(false);
    setGuardadoBitacora(false);

    try {
      const res = await fetch(`${LEXCONTROL_API}/generar_escrito_ia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caso: casoSeleccionado,
          tipo_escrito: tipoEscrito,
          instruccion: instruccion || 'Solicitar proveído de conformidad.',
          modo: modoGeneracion
        })
      });

      const data = await res.json();
      if (data.status === 'ok' && data.escrito) {
        setEscritoResultado(data.escrito);
      } else {
        throw new Error(data.error || 'No se pudo generar el escrito.');
      }
    } catch (err) {
      setError(`Aviso de generación: ${err.message}`);
    } finally {
      setGenerando(false);
    }
  };

  const copiarAlPortapapeles = () => {
    if (!escritoResultado) return;
    navigator.clipboard.writeText(escritoResultado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  const guardarEnBitacora = async () => {
    if (!casoSeleccionado || !escritoResultado) return;
    try {
      const gestion = {
        id: `gest-${Date.now()}`,
        fecha: new Date().toLocaleDateString('es-CL'),
        hora: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        tramite: `Escrito redactado por IA: ${tipoEscrito}`,
        estado: 'COMPLETADO',
        urgencia: 'NORMAL',
        textoOriginal: escritoResultado.slice(0, 300) + '...',
        cuaderno: 'Redactor IA',
        timestamp: new Date().toISOString()
      };

      let siguientes = [...expedientes];
      let exp = siguientes.find((x) => x.id === casoSeleccionado.id || x.ritVinculado === casoSeleccionado.rit);
      if (!exp) {
        exp = {
          id: casoSeleccionado.id,
          cliente: casoSeleccionado.caratula,
          asunto: tipoEscrito,
          tipo: 'judicial',
          gestiones: []
        };
        siguientes.push(exp);
      }
      exp.gestiones = [gestion, ...(exp.gestiones || [])];

      await guardarExpedientes(siguientes);
      setExpedientes(siguientes);
      setGuardadoBitacora(true);
      setTimeout(() => setGuardadoBitacora(false), 3000);
    } catch (e) {
      alert(`Error al guardar en bitacora: ${e.message}`);
    }
  };

  return (
    <div className="view-container stack" style={{ gap: 'var(--space-6)' }}>
      {/* Cabecera Principal */}
      <div className="section-header row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <Sparkles size={24} color="var(--accent-color)" />
            <h1 className="h2">Redactor & Copiloto IA Forense</h1>
          </div>
          <p className="muted">
            Generador automático de escritos judiciales chilenos formateados (CPC/CPP) para copiar a Word u OJV.
          </p>
        </div>
        <span className="badge badge-gold">Gemini 2.5 Flash Habilitado</span>
      </div>

      {/* Disposición de 2 Columnas (Configuración + Escrito Generado) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(340px, 440px) 1fr',
          gap: 'var(--space-6)',
          alignItems: 'start'
        }}
      >
        {/* COLUMNA IZQUIERDA: Configuración del Escrito */}
        <div className="card card-static stack" style={{ gap: 'var(--space-4)' }}>
          <div className="card-header">
            <span className="card-title">1. Selecciona la causa y tipo de escrito</span>
          </div>

          <div className="card-pad stack" style={{ gap: 'var(--space-4)' }}>
            {/* Selección de Causa */}
            <div>
              <label className="field-label" style={{ marginBottom: 'var(--space-2)', display: 'block' }}>
                Causa o Expediente de destino:
              </label>
              <select
                className="input"
                value={casoSeleccionado ? casoSeleccionado.id : ''}
                onChange={(e) => {
                  const en = todosLosCasos.find((x) => x.id === e.target.value);
                  setCasoSeleccionado(en);
                }}
                style={{ width: '100%' }}
              >
                {todosLosCasos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rit} — {c.caratula.slice(0, 40)} ({c.tipo})
                  </option>
                ))}
              </select>
            </div>

            {/* Plantillas Rápidas */}
            <div>
              <label className="field-label" style={{ marginBottom: 'var(--space-2)', display: 'block' }}>
                Plantillas judiciales rápidas:
              </label>
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {PLANTILLAS.map((p) => {
                  const activa = tipoEscrito === p.titulo;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`opcion-destino${activa ? ' is-active' : ''}`}
                      onClick={() => seleccionarPlantilla(p)}
                      style={{ padding: '8px 12px', textAlign: 'left' }}
                    >
                      <span className="row" style={{ gap: 'var(--space-2)' }}>
                        <FileText size={14} color={activa ? 'var(--accent-color)' : 'var(--text-secondary)'} />
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: activa ? 'bold' : 'normal' }}>
                          {p.titulo}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selector de Modo: IA vs Heurístico 100% Local */}
            <div>
              <label className="field-label" style={{ marginBottom: 'var(--space-2)', display: 'block' }}>
                Motor de Redacción:
              </label>
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className={`btn-secondary${modoGeneracion === 'ia' ? ' is-active' : ''}`}
                  onClick={() => setModoGeneracion('ia')}
                  style={{
                    flex: 1,
                    fontSize: 'var(--text-xs)',
                    padding: '8px',
                    borderColor: modoGeneracion === 'ia' ? 'var(--accent)' : 'var(--border-color)',
                    background: modoGeneracion === 'ia' ? 'var(--accent-wash)' : 'transparent'
                  }}
                >
                  <Sparkles size={14} color="var(--accent)" />
                  <span>🤖 Con IA Gemini</span>
                </button>
                <button
                  type="button"
                  className={`btn-secondary${modoGeneracion === 'heuristico' ? ' is-active' : ''}`}
                  onClick={() => setModoGeneracion('heuristico')}
                  style={{
                    flex: 1,
                    fontSize: 'var(--text-xs)',
                    padding: '8px',
                    borderColor: modoGeneracion === 'heuristico' ? 'var(--ok)' : 'var(--border-color)',
                    background: modoGeneracion === 'heuristico' ? 'rgba(93, 145, 105, 0.12)' : 'transparent'
                  }}
                >
                  <Gavel size={14} color="var(--ok)" />
                  <span>⚡ 100% Local (Sin IA)</span>
                </button>
              </div>
            </div>

            {/* Instrucción Específica */}
            <div>
              <label className="field-label" style={{ marginBottom: 'var(--space-2)', display: 'block' }}>
                Instrucción o fundamentación específica:
              </label>
              <textarea
                className="textarea"
                style={{ minHeight: '80px', fontSize: 'var(--text-xs)' }}
                value={instruccion}
                onChange={(e) => setInstruccion(e.target.value)}
                placeholder="Ej: Pedir citación de audiencia y certificación de haber vencido el plazo probatorio..."
              />
            </div>

            {error && (
              <div className="card sem sem-VENCIDO card-pad">
                <span className="muted" style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>
                  {error}
                </span>
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={generarEscrito}
              disabled={generando || !casoSeleccionado}
            >
              {generando ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              {generando ? 'Redactando borrador forense...' : 'Generar Escrito Judicial'}
            </button>
          </div>
        </div>

        {/* COLUMNA DERECHA: Visor de Escrito Generado */}
        <div className="card card-static stack" style={{ gap: 'var(--space-4)' }}>
          <div className="card-header row" style={{ justifyContent: 'space-between' }}>
            <span className="card-title">2. Escrito redactado listo para usar</span>
            {escritoResultado && (
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={copiarAlPortapapeles}
                  style={{ fontSize: 'var(--text-xs)', padding: '6px 12px' }}
                >
                  {copiado ? <Check size={14} color="var(--ok)" /> : <Copy size={14} />}
                  <span>{copiado ? '¡Copiado!' : 'Copiar Escrito'}</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={guardarEnBitacora}
                  style={{ fontSize: 'var(--text-xs)', padding: '6px 12px' }}
                >
                  {guardadoBitacora ? <CheckCircle2 size={14} color="var(--ok)" /> : <BookOpen size={14} />}
                  <span>{guardadoBitacora ? '¡Guardado!' : 'Guardar en Bitácora'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="card-pad stack" style={{ gap: 'var(--space-4)' }}>
            {!escritoResultado && !generando && (
              <div style={{ textAlign: 'center', padding: 'var(--space-12)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <Gavel size={40} className="muted" style={{ margin: '0 auto var(--space-3) auto', opacity: 0.4 }} />
                <h3 className="h4" style={{ marginBottom: 'var(--space-1)' }}>
                  Ningún escrito redactado aún
                </h3>
                <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  Selecciona la causa en el panel izquierdo y haz clic en <strong>Generar Escrito Judicial</strong> para que la IA elabore el texto formal.
                </p>
              </div>
            )}

            {generando && (
              <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                <Loader2 size={36} className="spin" color="var(--accent-color)" style={{ margin: '0 auto var(--space-3) auto' }} />
                <p style={{ fontWeight: 'bold', fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>
                  Redactando escrito forense conforme al CPC/CPP chileno...
                </p>
                <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                  Construyendo sumas, individualización de partes, fundamentos procesales y petitorio.
                </p>
              </div>
            )}

            {escritoResultado && !generando && (
              <div className="stack" style={{ gap: 'var(--space-3)' }}>
                <textarea
                  className="textarea"
                  readOnly
                  value={escritoResultado}
                  style={{
                    minHeight: '520px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    background: 'var(--bg-inset)',
                    color: 'var(--text-primary)',
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-strong)'
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
