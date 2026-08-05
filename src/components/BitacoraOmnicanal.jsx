import React, { useEffect, useState, useMemo, memo } from 'react';
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
  AlertTriangle,
  Paperclip,
  X
} from 'lucide-react';

import { MOCK_CASOS } from '../mockData';
import { PJUD_CASOS } from '../pjudCausesData';
import { LEXCONTROL_API } from '../apiBase.js';
import {
  buscarCandidatos,
  crearExpediente,
  cargarExpedientes,
  guardarExpedientes,
  claveDeCaso,
  ritUtilizable
} from '../utils/expedientes.js';
import ModalRedactarDocumento from './ModalRedactarDocumento.jsx';


const TIPOS_NUEVO = [
  ['extrajudicial', 'Extrajudicial'],
  ['administrativo', 'Administrativo']
];

export default function BitacoraOmnicanal({ onSelectCaso }) {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState('escribiendo'); // escribiendo | analizando | confirmando | guardando
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [expedientes, setExpedientes] = useState([]);
  const [showRedactarModal, setShowRedactarModal] = useState(false);
  const [redactarModalGestion, setRedactarModalGestion] = useState(null);

  const handleOpenRedactar = (g) => {
    setRedactarModalGestion(g);
    setShowRedactarModal(true);
  };


  // Lo que devolvió la IA, a la espera de que el abogado diga dónde va.
  const [propuesta, setPropuesta] = useState(null);
  const [motorUsado, setMotorUsado] = useState(null); // 'local' | 'gemini' | 'heuristico'
  const [candidatos, setCandidatos] = useState([]);
  const [eleccion, setEleccion] = useState(null);
  const [tipoNuevo, setTipoNuevo] = useState('extrajudicial');

  // Documentos que el abogado adjunta a la gestión. Se guardan como File en
  // memoria -no se suben hasta confirmar()-, porque recién ahí se sabe a qué
  // expediente van (el destino puede cambiar respecto de lo que propuso la IA).
  const [archivosAdjuntos, setArchivosAdjuntos] = useState([]);
  const [subiendoAdjuntos, setSubiendoAdjuntos] = useState(false);

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

      // MOCK_CASOS está vacío (export const MOCK_CASOS = []); las causas PJUD
      // reales viven en PJUD_CASOS. Con sólo MOCK_CASOS, buscarCandidatos()
      // nunca encontraba una causa por el nombre de la parte que NO quedó en
      // el campo `cliente` del expediente espejado -ese campo es sólo la
      // primera parte de la carátula (ver procesar_excel_pjud en el servidor)-,
      // así que un cliente real que aparece SEGUNDO en la carátula (ej. ROL
      // 700-2026: cliente="SALEM SOTO...", pero el cliente real de Jaime es
      // "ALEJANDRO NÚÑEZ VERA", la contraparte según ese campo) nunca
      // aparecía como opción, aunque buscarCandidatos() SÍ compara la
      // carátula completa contra `causas` -por eso pasar el arreglo real acá
      // es lo que lo destraba, no un cambio en la lógica de matching-.
      const encontrados = buscarCandidatos(info, expedientes, [...MOCK_CASOS, ...PJUD_CASOS]);
      setPropuesta(info);
      setMotorUsado(data.motor_ia || null);
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
        siguientes.push(nuevo);
        destino = { id: nuevo.id, etiqueta: `${nuevo.cliente}${nuevo.asunto ? ` — ${nuevo.asunto}` : ''}`, nuevo: true, cliente_real: nuevo.cliente, rol_real: propuesta.rol };
      } else if (eleccion.ref.tipo === 'causa') {
        const causa = eleccion.ref.ref;
        // La clave es el ROL sólo si el ROL identifica de verdad. 318 causas del
        // Excel traen "ROL " sin número: archivar por ese valor metía gestiones de
        // clientes distintos en un mismo expediente.
        const clave = claveDeCaso(causa);
        let exp = siguientes.find((x) => x.id === clave || (ritUtilizable(causa.rit) && x.ritVinculado === causa.rit));
        if (!exp) {
          exp = crearExpediente({ cliente: causa.caratula, asunto: propuesta.asunto, tipo: 'judicial' }, siguientes);
          exp.id = clave;
          if (ritUtilizable(causa.rit)) exp.ritVinculado = causa.rit;
          siguientes.push(exp);
        }
        // La base son las gestiones DEL SERVIDOR, que es la fuente de verdad.
        // Antes se leía localStorage con prioridad: una copia vieja del navegador
        // tapaba lo del servidor y acto seguido lo sobrescribía al guardar.
        exp.gestiones = [gestion, ...(exp.gestiones || [])];
        destino = { id: causa.rit, etiqueta: causa.caratula, nuevo: false, cliente_real: causa.cliente || propuesta.cliente, rol_real: causa.rit || propuesta.rol };
      } else {
        const exp = siguientes.find((x) => x.id === eleccion.ref.ref.id);
        exp.gestiones = [gestion, ...(exp.gestiones || [])];
        destino = {
          id: exp.id,
          etiqueta: `${exp.cliente}${exp.asunto ? ` — ${exp.asunto}` : ''}`,
          nuevo: false,
          total: exp.gestiones.length,
          cliente_real: exp.cliente || propuesta.cliente,
          rol_real: exp.ritVinculado || exp.id || propuesta.rol
        };
      }

      // Adjuntos: recién acá se sabe el expediente destino real -puede ser
      // distinto del que propuso la IA, si el abogado eligió otro-, así que
      // recién acá se archivan. Un adjunto que falla no bloquea el guardado de
      // la gestión: se avisa aparte y el texto igual queda registrado.
      if (archivosAdjuntos.length) {
        setSubiendoAdjuntos(true);
        const documentos = [];
        const fallidos = [];
        for (const item of archivosAdjuntos) {
          try {
            const content_b64 = await archivoABase64(item.file);
            const res = await fetch(`${LEXCONTROL_API}/adjuntar_documento_bitacora`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: item.file.name,
                content_b64,
                cliente: destino.cliente_real,
                caratula: destino.etiqueta,
                rol: destino.rol_real
              })
            });
            const data = await res.json();
            if (data.status === 'ok') {
              documentos.push({ nombre: data.nombre, ruta: data.ruta });
            } else {
              fallidos.push(item.file.name);
            }
          } catch (e) {
            fallidos.push(item.file.name);
          }
        }
        setSubiendoAdjuntos(false);
        if (documentos.length) gestion.documentos = documentos;
        if (fallidos.length) {
          setError(`No se pudieron adjuntar: ${fallidos.join(', ')}. El resto de la gestión sí se guardó.`);
        }
      }

      await guardarExpedientes(siguientes);
      window.dispatchEvent(new Event('lexcontrol_plazos_updated'));
      setExpedientes(siguientes);
      const sufijoDocs = gestion.documentos?.length
        ? ` ${gestion.documentos.length === 1 ? '1 documento archivado' : `${gestion.documentos.length} documentos archivados`}.`
        : '';
      setAviso({
        id: destino.id,
        texto: (destino.nuevo
          ? `Expediente ${destino.id} creado para ${destino.etiqueta}.`
          : `Agregado al expediente ${destino.id} — ${destino.etiqueta}${destino.total ? ` (${conteoGestiones(destino.total)})` : ''}.`
        ) + sufijoDocs
      });
      setTexto('');
      setPropuesta(null);
      setMotorUsado(null);
      setCandidatos([]);
      setEleccion(null);
      setArchivosAdjuntos([]);
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

  const archivoABase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });

  const MAX_ADJUNTO_MB = 60; // mismo tope que el servidor (MAX_SUBIDA_BYTES)

  const agregarArchivos = (fileList) => {
    const nuevos = Array.from(fileList || [])
      .filter((f) => {
        if (f.size > MAX_ADJUNTO_MB * 1024 * 1024) {
          setError(`${f.name} pesa más de ${MAX_ADJUNTO_MB} MB y no se puede adjuntar.`);
          return false;
        }
        return true;
      })
      .map((f) => ({ id: `${f.name}-${f.size}-${f.lastModified}`, file: f }));
    setArchivosAdjuntos((prev) => {
      const yaEstan = new Set(prev.map((a) => a.id));
      return [...prev, ...nuevos.filter((n) => !yaEstan.has(n.id))];
    });
  };

  const quitarArchivo = (id) => {
    setArchivosAdjuntos((prev) => prev.filter((a) => a.id !== id));
  };

  const formatoTamano = (bytes) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const conteoGestiones = (n) => (n === 1 ? '1 gestión' : `${n} gestiones`);

  // Mostraba c.ref.id -el identificador interno, "pjud-caso-670"- en vez de
  // c.ref.rit -el ROL real, "ROL V-21179-1995"-, y nunca la carátula: el
  // abogado no tenía forma de reconocer la causa correcta entre varios
  // candidatos parecidos. rit/ritVinculado antes que id porque no todo
  // expediente extrajudicial tiene un ROL distinto de su id.
  const etiquetaCandidato = (c) =>
    c.tipo === 'causa'
      ? `${c.ref.rit} — ${c.ref.caratula || 'Sin carátula'}`
      : `${c.ref.rit || c.ref.ritVinculado || c.ref.id} — ${c.ref.caratula || c.ref.cliente}` +
        `${c.ref.asunto ? ` · ${c.ref.asunto}` : ''}` +
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
          expedienteTipo: exp.tipo || 'extrajudicial',
          expedienteRit: exp.ritVinculado || (exp.id && exp.id.startsWith('ROL') ? exp.id : null)
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

      {/* Disposición a 2 columnas. La izquierda se ensanchó (antes topaba a
          420px, luego a 620px) para que quepan cómodamente los documentos
          adjuntos y, ahora, el ROL/carátula real de cada expediente candidato
          -antes sólo mostraba el id interno, cortísimo, así que 420px nunca
          se había sentido angosto para ESE contenido en particular-. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 760px) 1fr',
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

                {/* Documentos adjuntos: se guardan en memoria hasta confirmar(),
                    porque recién ahí se sabe el expediente destino real. */}
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <label
                    className="btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}
                  >
                    <Paperclip size={14} />
                    Adjuntar documentos
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx"
                      style={{ display: 'none' }}
                      onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }}
                    />
                  </label>

                  {archivosAdjuntos.length > 0 && (
                    <div className="stack" style={{ gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
                      {archivosAdjuntos.map((a) => (
                        <div
                          key={a.id}
                          className="row-between"
                          style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-inset)', border: '1px solid var(--border-color)' }}
                        >
                          <span className="row truncate" style={{ gap: 'var(--space-2)', minWidth: 0, fontSize: 'var(--text-xs)' }}>
                            <FileText size={13} color="var(--text-muted)" />
                            <span className="truncate">{a.file.name}</span>
                            <span className="muted">({formatoTamano(a.file.size)})</span>
                          </span>
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ padding: 2 }}
                            onClick={() => quitarArchivo(a.id)}
                            aria-label={`Quitar ${a.file.name}`}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="stack" style={{ marginTop: 'var(--space-3)', gap: 'var(--space-2)' }}>
                  <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={estado === 'analizando' || !texto.trim()}>
                    {estado === 'analizando' ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                    {/* Antes decía "...con Gemini" fijo, aunque el motor por defecto
                        hoy es el local (Ollama): no se sabe cuál va a responder hasta
                        que vuelve la respuesta, así que acá queda genérico. */}
                    {estado === 'analizando' ? 'Analizando...' : 'Analizar e Inyectar'}
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
                    <span className="row" style={{ gap: 'var(--space-2)' }}>
                      {motorUsado && (
                        <span className="muted" style={{ fontSize: 'var(--text-xs)' }} title="Motor de IA que clasificó este registro">
                          {motorUsado === 'local' ? 'IA local' : motorUsado === 'gemini' ? 'Gemini' : 'heurístico'}
                        </span>
                      )}
                      <span className="badge">{propuesta.rol || 'EXTRAJUDICIAL'}</span>
                    </span>
                  </div>
                  <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: 4 }}>
                    {propuesta.cliente || 'Cliente sin identificar'} {propuesta.asunto ? `· ${propuesta.asunto}` : ''}
                  </strong>
                  <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                    {propuesta.tramite}
                  </p>
                  {archivosAdjuntos.length > 0 && (
                    <p className="muted row" style={{ fontSize: 'var(--text-xs)', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
                      <Paperclip size={12} />
                      {archivosAdjuntos.length === 1 ? '1 documento adjunto' : `${archivosAdjuntos.length} documentos adjuntos`}
                      {' '}se archivará{archivosAdjuntos.length === 1 ? '' : 'n'} en el expediente que elijas abajo.
                    </p>
                  )}
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
                          {/* Antes truncaba a una sola línea: con el ROL real y la
                              carátula completa -no sólo el id interno- el texto es
                              más largo, así que ahora se deja envolver en vez de
                              cortarlo con "...". alignItems flex-start para que la
                              insignia no quede descentrada cuando el texto ocupa
                              dos o más líneas. */}
                          <span className="row" style={{ gap: 'var(--space-2)', minWidth: 0, justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
                            <span className="row" style={{ gap: 'var(--space-2)', minWidth: 0, alignItems: 'flex-start' }}>
                              <ArrowRight size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                              <span style={{ fontSize: 'var(--text-xs)', wordBreak: 'break-word' }}>{etiquetaCandidato(c)}</span>
                            </span>
                            <span className="badge" style={{ flexShrink: 0 }}>{c.tipo === 'causa' ? 'Judicial' : 'Existente'}</span>
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
                    {subiendoAdjuntos ? 'Archivando adjuntos...' : 'Confirmar'}
                  </button>
                  <button className="btn-ghost" onClick={descartar} disabled={estado === 'guardando'}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Registro de Interacciones / Línea de Tiempo en Vivo.
            Componente aparte y memoizado a propósito: son ~1.559 tarjetas por
            defecto (una por expediente). Antes vivían inline acá, así que cada
            tecla escrita en el textarea de la izquierda -estado del mismo
            componente- volvía a renderizar y reconciliar esa lista entera,
            aunque su contenido no hubiera cambiado. Eso es lo que se sentía
            como lentitud al escribir, no la IA. Con esto afuera y memoizado,
            React se salta el re-render de la lista mientras sus props
            (gestionesFiltradas, busquedaFeed, filtroEstado) no cambien. */}
        <FeedInteracciones
          gestionesFiltradas={gestionesFiltradas}
          totalGestiones={todasLasGestiones.length}
          busquedaFeed={busquedaFeed}
          setBusquedaFeed={setBusquedaFeed}
          filtroEstado={filtroEstado}
          setFiltroEstado={setFiltroEstado}
          onSelectCaso={onSelectCaso}
          onOpenRedactar={handleOpenRedactar}
        />
      </div>

      <ModalRedactarDocumento
        isOpen={showRedactarModal}
        onClose={() => setShowRedactarModal(false)}
        gestion={redactarModalGestion}
        caso={redactarModalGestion ? { rit: redactarModalGestion.expedienteRit, caratula: redactarModalGestion.expedienteAsunto || redactarModalGestion.expedienteCliente } : null}
      />
    </div>
  );
}

const RenderKanbanCard = memo(function RenderKanbanCard({ g, onSelectCaso, onOpenRedactar, badgeColor }) {
  return (
    <div
      className="card card-pad stack feed-item-clickable"
      onClick={() => {
        if (onSelectCaso && g.expedienteId) {
          onSelectCaso({ 
            id: g.expedienteId, 
            rit: g.expedienteRit, 
            caratula: g.expedienteAsunto, 
            cliente: g.expedienteCliente 
          });
        }
      }}
      style={{
        gap: '6px',
        background: 'var(--bg-primary)',
        borderLeft: `4px solid ${badgeColor}`,
        cursor: 'pointer',
        padding: '10px 12px',
        borderRadius: '8px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '4px' }}>
        <strong style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
          {g.expedienteCliente || 'Cliente General'}
        </strong>
        {g.expedienteRit && (
          <span className="badge" style={{ fontSize: '9px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}>
            {g.expedienteRit}
          </span>
        )}
      </div>

      <p style={{ fontSize: '0.78rem', margin: 0, fontWeight: '500', color: 'var(--text-primary)', lineHeight: 1.4 }}>
        {g.tramite}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="muted" style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={10} /> {g.fechaVencimiento || g.fecha || 'Sin plazo'}
        </span>
        {onOpenRedactar && (
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '2px 6px', fontSize: '10px', color: 'var(--accent-color, #4aa3c7)' }}
            onClick={(e) => { e.stopPropagation(); onOpenRedactar(g); }}
            title="Redactar escrito con LibreOffice Writer"
          >
            ✍️ Redactar
          </button>
        )}
      </div>
    </div>
  );
});

const FeedInteracciones = memo(function FeedInteracciones({
  gestionesFiltradas, totalGestiones, busquedaFeed, setBusquedaFeed, filtroEstado, setFiltroEstado, onSelectCaso, onOpenRedactar
}) {

  const kanbanData = useMemo(() => {
    if (filtroEstado !== 'PENDIENTES') return null;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const finSemana = new Date(hoy);
    const dayOfWeek = hoy.getDay(); // 0 es Domingo
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    finSemana.setDate(finSemana.getDate() + daysUntilSunday);
    finSemana.setHours(23, 59, 59, 999);

    const parseFechaStr = (str) => {
      if (!str) return null;
      const s = String(str).trim().toLowerCase();
      const MESES = {
        enero: 0, ene: 0, febrero: 1, feb: 1, marzo: 2, mar: 2, abril: 3, abr: 3,
        mayo: 4, may: 4, junio: 5, jun: 5, julio: 6, jul: 6, agosto: 7, ago: 7,
        septiembre: 8, sep: 8, setiembre: 8, octubre: 9, oct: 9, noviembre: 10, nov: 10, diciembre: 11, dic: 11
      };
      for (const [mNombre, mIndex] of Object.entries(MESES)) {
        if (s.includes(mNombre)) {
          const nums = s.match(/\d+/g);
          if (nums && nums.length >= 1) {
            const d = parseInt(nums[0], 10);
            const y = nums.length >= 2 ? parseInt(nums[nums.length - 1], 10) : new Date().getFullYear();
            const yearFinal = y < 100 ? 2000 + y : y;
            if (!isNaN(d) && !isNaN(yearFinal)) return new Date(yearFinal, mIndex, d);
          }
        }
      }
      const partes = s.split(/[/.\-\s]+/);
      if (partes.length === 3) {
        let d, m, y;
        if (partes[0].length === 4) {
          y = parseInt(partes[0], 10);
          m = parseInt(partes[1], 10) - 1;
          d = parseInt(partes[2], 10);
        } else {
          d = parseInt(partes[0], 10);
          m = parseInt(partes[1], 10) - 1;
          y = parseInt(partes[2], 10);
          if (y < 100) y += 2000;
        }
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m, d);
      }
      const dt = new Date(str);
      return isNaN(dt.getTime()) ? null : dt;
    };

    const colManana = [];
    const colRestoSemana = [];
    const colDemasPendientes = [];

    gestionesFiltradas.forEach((g) => {
      const targetFechaStr = g.fechaVencimiento || g.vencimiento || g.fecha;
      const targetDate = parseFechaStr(targetFechaStr);

      if (targetDate) {
        targetDate.setHours(0, 0, 0, 0);
        if (targetDate.getTime() === manana.getTime()) {
          colManana.push(g);
        } else if (targetDate > manana && targetDate <= finSemana) {
          colRestoSemana.push(g);
        } else {
          colDemasPendientes.push(g);
        }
      } else {
        colDemasPendientes.push(g);
      }
    });

    return { colManana, colRestoSemana, colDemasPendientes };
  }, [gestionesFiltradas, filtroEstado]);

  return (
    <div className="card card-static">
      <div className="card-header row" style={{ justifyContent: 'space-between' }}>
        <span className="card-title">⏱️ Feed de interacciones en vivo</span>
        <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
          Mostrando {gestionesFiltradas.length} de {totalGestiones}
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

        {/* MODO TABLERO KANBAN DE 3 COLUMNAS PARA PENDIENTES */}
        {filtroEstado === 'PENDIENTES' && kanbanData ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', maxHeight: '680px', overflowY: 'auto' }}>
            {/* COLUMNA 1: GESTIONES DE MAÑANA */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(234, 179, 8, 0.2)', paddingBottom: '8px' }}>
                <strong style={{ fontSize: '0.85rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🌅 Mañana ({kanbanData.colManana.length})
                </strong>
                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(234, 179, 8, 0.2)', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                  Urgente
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '580px' }}>
                {kanbanData.colManana.length === 0 ? (
                  <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>
                    Sin gestiones para mañana
                  </div>
                ) : (
                  kanbanData.colManana.map((g, i) => (
                    <RenderKanbanCard key={g.id || i} g={g} onSelectCaso={onSelectCaso} onOpenRedactar={onOpenRedactar} badgeColor="var(--accent-gold)" />
                  ))
                )}
              </div>
            </div>

            {/* COLUMNA 2: GESTIONES EN LO QUE QUEDA DE LA SEMANA */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(168, 85, 247, 0.2)', paddingBottom: '8px' }}>
                <strong style={{ fontSize: '0.85rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📅 Resto de la Semana ({kanbanData.colRestoSemana.length})
                </strong>
                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontWeight: 'bold' }}>
                  Semana
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '580px' }}>
                {kanbanData.colRestoSemana.length === 0 ? (
                  <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>
                    Sin gestiones en lo que queda de semana
                  </div>
                ) : (
                  kanbanData.colRestoSemana.map((g, i) => (
                    <RenderKanbanCard key={g.id || i} g={g} onSelectCaso={onSelectCaso} onOpenRedactar={onOpenRedactar} badgeColor="#c084fc" />
                  ))
                )}
              </div>
            </div>

            {/* COLUMNA 3: RESTO DE PENDIENTES */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid rgba(74, 163, 199, 0.3)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(74, 163, 199, 0.2)', paddingBottom: '8px' }}>
                <strong style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📋 Resto de Pendientes ({kanbanData.colDemasPendientes.length})
                </strong>
                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '8px', background: 'rgba(74, 163, 199, 0.2)', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>
                  General
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '580px' }}>
                {kanbanData.colDemasPendientes.length === 0 ? (
                  <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>
                    No hay más pendientes registadas
                  </div>
                ) : (
                  kanbanData.colDemasPendientes.map((g, i) => (
                    <RenderKanbanCard key={g.id || i} g={g} onSelectCaso={onSelectCaso} onOpenRedactar={onOpenRedactar} badgeColor="var(--accent-cyan)" />
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Feed Timeline Estándar para el Resto de los Filtros */
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
                  className="card card-pad stack feed-item-clickable"
                  onClick={() => {
                    if (onSelectCaso && g.expedienteId) {
                      onSelectCaso({ 
                        id: g.expedienteId, 
                        rit: g.expedienteRit, 
                        caratula: g.expedienteAsunto, 
                        cliente: g.expedienteCliente 
                      });
                    }
                  }}
                  style={{
                    gap: 'var(--space-2)',
                    background: 'var(--bg-primary)',
                    borderLeft: `4px solid ${esPendiente ? (esUrgente ? 'var(--danger)' : 'var(--warning)') : 'var(--ok)'}`,
                    cursor: onSelectCaso ? 'pointer' : 'default',
                    transition: 'transform 0.1s ease, box-shadow 0.1s ease'
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
                        {g.expedienteRit && (
                          <span className="badge" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}>
                            {g.expedienteRit}
                          </span>
                        )}
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

                  {/* Documentos adjuntados a esta gestión */}
                  {g.documentos && g.documentos.length > 0 && (
                    <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      {g.documentos.map((doc, di) => (
                        <button
                          key={di}
                          type="button"
                          className="btn-secondary btn-sm"
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                          onClick={() => fetch(`${LEXCONTROL_API}/abrir?ruta=${encodeURIComponent(doc.ruta)}`).catch(() => {})}
                          title={doc.ruta}
                        >
                          <Paperclip size={11} /> {doc.nombre}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Fila Inferior: Expediente ID, Botón Redactar y Cuaderno */}
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--space-1)', alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                      📁 ID: <strong style={{ color: 'var(--text-secondary)' }}>{g.expedienteId}</strong>
                    </span>
                    <div className="row" style={{ gap: 'var(--space-2)' }}>
                      {onOpenRedactar && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          style={{ fontSize: '11px', padding: '3px 8px', color: 'var(--accent-color, #4aa3c7)' }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onOpenRedactar(g);
                          }}
                          title="Redactar escrito en LibreOffice Writer"
                        >
                          ✍️ Redactar Documento
                        </button>
                      )}
                      <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                        {g.cuaderno || 'Bitácora Omnicanal'}
                      </span>
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>
        )}
      </div>
    </div>
  );
});
