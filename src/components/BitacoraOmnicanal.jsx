import React, { useEffect, useState } from 'react';
import { Send, Loader2, CheckCircle2, FolderPlus, AlertCircle, ArrowRight } from 'lucide-react';

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
      // Se preselecciona el mejor candidato, pero NUNCA se guarda sin confirmar:
      // el problema original era justamente que el sistema decidía en silencio.
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
      fecha: new Date().toLocaleDateString('es-CL'),
      tramite: propuesta.tramite,
      estado: propuesta.estadoGestion,
      urgencia: propuesta.urgencia,
      textoOriginal: texto,
      cuaderno: 'Bitácora Omnicanal',
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
        siguientes.push(nuevo);
        destino = { id: nuevo.id, etiqueta: `${nuevo.cliente}${nuevo.asunto ? ` — ${nuevo.asunto}` : ''}`, nuevo: true };
      } else if (eleccion.ref.tipo === 'causa') {
        // Las causas judiciales viven en el catálogo del PJUD y no se modifican
        // desde acá: se abre un expediente de seguimiento enlazado al ROL.
        const causa = eleccion.ref.ref;
        let exp = siguientes.find((x) => x.ritVinculado === causa.rit);
        if (!exp) {
          exp = crearExpediente({ cliente: causa.caratula, asunto: propuesta.asunto, tipo: 'judicial' }, siguientes);
          exp.id = causa.rit;
          exp.ritVinculado = causa.rit;
          siguientes.push(exp);
        }
        exp.gestiones = [gestion, ...(exp.gestiones || [])];
        destino = { id: causa.rit, etiqueta: causa.caratula, nuevo: false };
      } else {
        const exp = siguientes.find((x) => x.id === eleccion.ref.ref.id);
        exp.gestiones = [gestion, ...(exp.gestiones || [])];
        destino = {
          id: exp.id,
          etiqueta: `${exp.cliente}${exp.asunto ? ` — ${exp.asunto}` : ''}`,
          nuevo: false,
          total: exp.gestiones.length
        };
      }

      await guardarExpedientes(siguientes);
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

  return (
    <div className="card card-static">
      <div className="card-header">
        <span className="card-title">Bitácora omnicanal</span>
        {expedientes.length > 0 && (
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            {expedientes.length} expedientes abiertos
          </span>
        )}
      </div>

      <div className="card-pad">
        {aviso && (
          <div className="card sem sem-AL_DIA card-pad" style={{ marginBottom: 'var(--space-4)' }}>
            <span className="row" style={{ gap: 'var(--space-2)' }}>
              <CheckCircle2 size={15} color="var(--ok)" />
              <span style={{ color: 'var(--ok)' }}>{aviso.texto}</span>
            </span>
          </div>
        )}

        {error && (
          <div className="card sem sem-VENCIDO card-pad" style={{ marginBottom: 'var(--space-4)' }}>
            <span className="row" style={{ gap: 'var(--space-2)' }}>
              <AlertCircle size={15} color="var(--danger)" />
              <span style={{ color: 'var(--danger)' }}>{error}</span>
            </span>
          </div>
        )}

        {estado !== 'confirmando' && (
          <form onSubmit={analizar}>
            <textarea
              className="textarea"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej: llamé a don Víctor Garai por la camioneta, quedó de mandar los papeles el lunes"
              aria-label="Registro rápido de gestión"
              disabled={estado === 'analizando'}
            />
            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <button type="submit" className="btn-primary" disabled={estado === 'analizando' || !texto.trim()}>
                {estado === 'analizando' ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                {estado === 'analizando' ? 'Analizando…' : 'Registrar'}
              </button>
              <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Antes de guardar te preguntará a qué expediente va.
              </span>
            </div>
          </form>
        )}

        {estado === 'confirmando' && propuesta && (
          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            <div className="nota-legal" style={{ marginBottom: 0 }}>
              <strong>{propuesta.cliente || 'Cliente sin identificar'}</strong>
              {propuesta.asunto ? ` · ${propuesta.asunto}` : ''}
              <br />
              {propuesta.tramite}
            </div>

            <div>
              <p className="field-label">¿A qué expediente va?</p>
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {candidatos.map((c, i) => {
                  const activo = eleccion?.modo === 'existente' && eleccion.ref === c;
                  return (
                    <button
                      key={`${c.tipo}-${c.ref.id || c.ref.rit}-${i}`}
                      className={`opcion-destino${activo ? ' is-active' : ''}`}
                      onClick={() => setEleccion({ modo: 'existente', ref: c })}
                    >
                      <span className="row" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
                        <ArrowRight size={14} />
                        <span className="truncate">{etiquetaCandidato(c)}</span>
                      </span>
                      <span className="badge">{c.tipo === 'causa' ? 'Judicial' : 'Abierto'}</span>
                    </button>
                  );
                })}

                <button
                  className={`opcion-destino${eleccion?.modo === 'nuevo' ? ' is-active' : ''}`}
                  onClick={() => setEleccion({ modo: 'nuevo' })}
                >
                  <span className="row" style={{ gap: 'var(--space-2)' }}>
                    <FolderPlus size={14} />
                    <span>
                      {candidatos.length ? 'Ninguno: abrir expediente nuevo' : 'Abrir expediente nuevo'}
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
                </button>
              </div>
            </div>

            <div className="row">
              <button className="btn-primary" onClick={confirmar} disabled={estado === 'guardando' || !eleccion}>
                {estado === 'guardando' ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                Confirmar y guardar
              </button>
              <button className="btn-ghost" onClick={descartar} disabled={estado === 'guardando'}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
