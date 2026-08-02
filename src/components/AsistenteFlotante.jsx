import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Check, Loader2, AlertTriangle, FolderOpen } from 'lucide-react';

import { validarAccion, ejecutarAccion, paramsDesdePropuesta } from '../utils/acciones.js';
import {
  interpretar,
  esConsultaPendientesHoy, filasPendientesHoy,
  esConsultaGestionesDeHoy, filasGestionesDeHoy
} from '../utils/asistenteReglas.js';
import { cargarExpedientes } from '../utils/expedientes.js';
import { cargarTareas } from '../utils/tareas.js';
import { cargarAtencion, gestionesDeHoy } from '../utils/radarPlazos.js';
import { LEXCONTROL_API } from '../apiBase.js';

import { MOCK_CASOS } from '../mockData.js';
import { PJUD_CASOS } from '../pjudCausesData.js';
/**
 * Respaldo de IA (modelo local, Gemini si no) para cuando las reglas
 * deterministas de asistenteReglas.js genuinamente no entendieron la frase
 * (`data.sinEntender`). No se llama para el resto de los casos: una pregunta
 * que las reglas YA resolvieron correctamente -"no puedo borrar nada", "falta
 * el cliente"- no debe poder ser reemplazada por una respuesta de IA distinta
 * y potencialmente peor.
 */
async function consultarRespaldoIA(instruccion) {
  const res = await fetch(`${LEXCONTROL_API}/asistente`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto: instruccion })
  });
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(data.respuesta || data.error || 'El respaldo de IA no pudo responder.');
  return data;
}

/**
 * Asistente conversacional, presente en todas las pantallas.
 */
export default function AsistenteFlotante({ onSelectCaso }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);

  useEffect(() => {
    const handleOpenChat = () => setAbierto(true);
    window.addEventListener('lexcontrol_open_chat_asistente', handleOpenChat);
    return () => window.removeEventListener('lexcontrol_open_chat_asistente', handleOpenChat);
  }, []);
  const [mensajes, setMensajes] = useState([
    {
      rol: 'asistente',
      texto: 'Dime qué hacer y te lo propongo antes de tocar nada. Por ejemplo: «muéstrame la causa Medina», «anota en el expediente de Garai que llamé al chofer», «créame una tarea para el viernes» o «qué tengo pendiente hoy».'
    }
  ]);
  const finRef = useRef(null);

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, abierto]);

  const agregar = (m) => setMensajes((prev) => [...prev, m]);

  const enviar = async (e) => {
    e?.preventDefault();
    const instruccion = texto.trim();
    if (!instruccion || pensando) return;

    agregar({ rol: 'abogado', texto: instruccion });
    setTexto('');
    setPensando(true);

    try {
      // Contexto real, una sola vez para todas las propuestas de esta respuesta.
      const [expedientes, tareas] = await Promise.all([
        cargarExpedientes().catch(() => []),
        cargarTareas().catch(() => [])
      ]);

      // "Todas las gestiones de hoy" pide TODO lo registrado hoy, esté cerrado o
      // no — a diferencia de "pendientes de hoy", que filtra por lo que falta.
      // gestionesDeHoy() no descarta lo REALIZADO a propósito: es la pregunta de
      // quien cierra el día y quiere ver lo que escribió, completo.
      if (esConsultaGestionesDeHoy(instruccion)) {
        const filas = filasGestionesDeHoy(gestionesDeHoy(expedientes));
        agregar({
          rol: 'asistente',
          texto: filas.length ? `Gestiones de hoy (${filas.length}):` : 'Hoy no hay ninguna gestión registrada todavía.',
          tabla: filas
        });
        return;
      }

      // "Todas las gestiones pendientes para hoy" no es una orden sobre un caso
      // puntual: es una pregunta global. Antes no había ninguna regla para esa
      // forma y terminaba en el "no te entendí" genérico. Se responde ANTES de
      // interpretar(), reutilizando cargarAtencion() -la misma función que arma
      // el semáforo del Dashboard y el Radar- para que el chat nunca pueda decir
      // algo distinto de lo que ya muestra el resto de la app. Se muestra como
      // tabla -no como párrafo con viñetas-, que es como el abogado pidió verlo.
      if (esConsultaPendientesHoy(instruccion)) {
        const atencionActual = await cargarAtencion({ causas: [...MOCK_CASOS, ...PJUD_CASOS], expedientes }).catch(() => null);
        if (!atencionActual) {
          agregar({ rol: 'asistente', texto: 'No pude leer el registro. ¿Está corriendo el servidor local en el puerto 8888?' });
          return;
        }
        const filas = filasPendientesHoy(atencionActual);
        agregar({
          rol: 'asistente',
          texto: filas.length ? `${filas.length} gestión(es) pendiente(s):` : 'No tienes nada pendiente para hoy. Puedes revisarlo igual en el Radar de Plazos.',
          tabla: filas
        });
        return;
      }

      // Las reglas corren acá mismo, contra los datos ya cargados: instantáneo,
      // sin cuota, sin internet, sin que nada se invente un cliente o un ROL.
      let data = interpretar(instruccion, { expedientes, tareas, causas: [...MOCK_CASOS, ...PJUD_CASOS] });

      // Sólo cuando las reglas genuinamente no entendieron nada (data.sinEntender)
      // se escala al respaldo de IA -local primero, Gemini si no hay Ollama-. El
      // servidor arma su propio contexto (ya acotado a lo relevante: mandarle el
      // catálogo completo satura a un modelo local de 4B) y devuelve la misma
      // forma {respuesta, acciones} que interpretar(), así el resto del flujo de
      // abajo no necesita saber cuál de las dos lo resolvió.
      if (data.sinEntender) {
        try {
          data = await consultarRespaldoIA(instruccion);
        } catch (err) {
          // Ni las reglas ni la IA entendieron: se queda con el mensaje original
          // de las reglas ("no te entendí, dime cuál de estas cosas") en vez de
          // reemplazarlo por un error de red que asusta más de lo que informa.
          console.warn('Respaldo de IA no disponible:', err.message);
        }
      }

      const propuestas = [];
      const casosParaAbrir = [];

      for (const p of data.acciones || []) {
        const params = paramsDesdePropuesta(p);
        const previo = await validarAccion(p.accion, params, { expedientes, tareas, causas: [...MOCK_CASOS, ...PJUD_CASOS] });
        propuestas.push({ accion: p.accion, motivo: p.motivo, params, previo, estado: 'propuesta' });
      }

      // Si hay propuestas de abrir_expediente válidas, ejecutarlas todas automáticamente y recopilar los casos
      const esPidioGestiones = ["gestion", "gestiones", "movimiento", "movimientos", "tramite", "tramites", "historial", "bitacora"].some(w => instruccion.toLowerCase().includes(w));
      let targetTab = esPidioGestiones ? 'gestiones' : 'resumen';

      for (let i = 0; i < propuestas.length; i++) {
        const prop = propuestas[i];
        if (prop.accion === 'abrir_expediente' && prop.previo?.ok) {
          if (prop.params?.tab) targetTab = prop.params.tab;
          const r = await ejecutarAccion('abrir_expediente', prop.params, { causas: [...MOCK_CASOS, ...PJUD_CASOS] });
          if (r.ok) {
            prop.estado = 'aplicada';
            prop.resultado = r.resumen;
            if (r.resultado) casosParaAbrir.push(r.resultado);
          }
        }
        // Auto-ejecutar ingreso de gestión: abre el modal flotante de inmediato
        if (prop.accion === 'abrir_modal_ingreso_gestion' && prop.previo?.ok) {
          const r = await ejecutarAccion('abrir_modal_ingreso_gestion', prop.params, {});
          if (r.ok) {
            prop.estado = 'aplicada';
            prop.resultado = r.resumen;
          }
        }
      }

      if (casosParaAbrir.length > 0 && onSelectCaso) {
        onSelectCaso(casosParaAbrir.length === 1 ? casosParaAbrir[0] : casosParaAbrir, targetTab);
      }

      agregar({ rol: 'asistente', texto: data.respuesta || 'Listo.', propuestas });
    } catch (err) {
      agregar({ rol: 'asistente', texto: `No pude hablar con el servidor local: ${err.message}` });
    } finally {
      setPensando(false);
    }
  };

  const aplicar = async (idxMensaje, idxPropuesta) => {
    const propuesta = mensajes[idxMensaje].propuestas[idxPropuesta];
    const marcar = (estado, resultado) =>
      setMensajes((prev) => prev.map((m, i) => {
        if (i !== idxMensaje) return m;
        const props = m.propuestas.map((p, j) => (j === idxPropuesta ? { ...p, estado, resultado } : p));
        return { ...m, propuestas: props };
      }));

    marcar('aplicando');
    const r = await ejecutarAccion(propuesta.accion, propuesta.params, { onSelectCaso, causas: [...MOCK_CASOS, ...PJUD_CASOS] });
    if (r.ok) {
      marcar('aplicada', r.resumen);
      // Que el resto del sistema se entere sin recargar la página.
      window.dispatchEvent(new Event('lexcontrol_plazos_updated'));

      // Al crear un expediente se abre su ficha de inmediato. Lo que sigue casi
      // siempre es registrar la primera gestión, y mandar al abogado a buscarlo
      // en una lista de 1.557 causas es un paso de más sobre algo que el sistema
      // acaba de crear y sabe perfectamente cuál es.
      //
      // La navegación se resuelve acá y no en acciones.js a propósito: esa capa
      // escribe datos y no debe saber que existe una pantalla.
      if (propuesta.accion === 'crear_expediente' && r.resultado && onSelectCaso) {
        onSelectCaso(r.resultado, 'resumen');
      }
    } else {
      marcar('fallida', r.error);
    }
  };

  const descartar = (idxMensaje, idxPropuesta) =>
    setMensajes((prev) => prev.map((m, i) => {
      if (i !== idxMensaje) return m;
      return { ...m, propuestas: m.propuestas.map((p, j) => (j === idxPropuesta ? { ...p, estado: 'descartada' } : p)) };
    }));

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        title="Abrir Asistente IA / Chatbot"
        aria-label="Abrir el asistente"
        style={{
          position: 'fixed', right: '28px', bottom: '28px', zIndex: 99999,
          width: '58px', height: '58px', borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.2)', cursor: 'pointer',
          background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
          boxShadow: '0 8px 25px rgba(59, 130, 246, 0.5), 0 0 15px rgba(139, 92, 246, 0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s ease, boxShadow 0.2s ease'
        }}
      >
        <MessageSquare size={24} color="#ffffff" />
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', right: '24px', bottom: '24px', zIndex: 99999,
        width: 'min(440px, calc(100vw - 48px))', maxHeight: 'min(640px, calc(100vh - 48px))',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card, #1e293b)', border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
        borderRadius: '16px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>
        <span className="row" style={{ gap: 8, fontWeight: 700, fontSize: 'var(--text-sm)' }}>
          <MessageSquare size={16} color="var(--accent)" /> Asistente
        </span>
        <button onClick={() => setAbierto(false)} className="btn-ghost" aria-label="Cerrar el asistente" style={{ padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {mensajes.map((m, i) => (
          <div key={i} style={{ alignSelf: m.rol === 'abogado' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
            <div style={{
              padding: '9px 12px', borderRadius: '10px', fontSize: 'var(--text-xs)', lineHeight: 1.45,
              background: m.rol === 'abogado' ? 'var(--accent-soft, rgba(201,160,70,0.14))' : 'var(--bg-secondary)',
              border: '1px solid var(--border-color)', color: 'var(--text-primary)',
              // El resumen de "qué tengo pendiente hoy" viene con saltos de línea
              // reales; sin esto se ven colapsados en un solo párrafo ilegible.
              whiteSpace: 'pre-line'
            }}>
              {m.texto}
            </div>

            {m.tabla && m.tabla.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: '6px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Causa</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Gestión</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.tabla.map((fila, k) => (
                      <tr key={k} style={{ borderBottom: k < m.tabla.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                        <td className="mono" style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fila.rol}</td>
                        <td style={{ padding: '6px 8px' }}>{fila.gestion}</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                          <div>{fila.cuando}</div>
                          <div className="muted" style={{ fontSize: '0.65rem' }}>{fila.categoria}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(m.propuestas || []).map((p, j) => (
              <Propuesta
                key={j}
                p={p}
                onAplicar={() => aplicar(i, j)}
                onDescartar={() => descartar(i, j)}
              />
            ))}
          </div>
        ))}
        {pensando && (
          <span className="row muted" style={{ gap: 6, fontSize: 'var(--text-xs)' }}>
            <Loader2 size={13} className="spin" /> pensando…
          </span>
        )}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviar} className="row" style={{ gap: 8, padding: '12px', borderTop: '1px solid var(--border-color)' }}>
        <input
          className="input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Qué hago…"
          aria-label="Instrucción para el asistente"
          style={{ flex: 1, fontSize: 'var(--text-xs)' }}
        />
        <button type="submit" className="btn-primary" disabled={pensando || !texto.trim()} style={{ padding: '7px 11px' }}>
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

/** Una acción propuesta, con su diff y sus dos botones. */
function Propuesta({ p, onAplicar, onDescartar }) {
  const { previo, estado } = p;

  // Lo que no pasa la validación NO se ofrece aplicar. Es el caso de un
  // identificador inventado o un dato que falta: mostrar el botón sería invitar a
  // escribir algo que ya sabemos que está mal.
  if (!previo.ok) {
    return (
      <div style={recuadro('var(--danger)')}>
        <span className="row" style={{ gap: 6, color: 'var(--danger)', fontWeight: 700, fontSize: '11px' }}>
          <AlertTriangle size={12} /> No se puede aplicar
        </span>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 4 }}>{previo.error}</div>
      </div>
    );
  }

  const tono = estado === 'aplicada' ? 'var(--ok, #4a9e6f)'
    : estado === 'fallida' ? 'var(--danger)'
    : estado === 'descartada' ? 'var(--border-color)'
    : 'var(--warn)';

  return (
    <div style={recuadro(tono)}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>{previo.resumen}</div>
      {p.motivo && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>{p.motivo}</div>}

      {/* Lo que se va a escribir, campo por campo. En una modificación se muestra
          antes → después; en una creación, sólo el valor que quedará. Se pinta
          SIEMPRE que haya `despues`: si sólo apareciera en las modificaciones, una
          creación con un dato que el asistente omitió se aplicaría sin que se vea. */}
      {previo.despues && (
        <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
          {Object.keys(previo.despues).map((k) => (
            <div key={k}>
              <span className="muted">{k}: </span>
              {previo.antes && (
                <>
                  <span style={{ color: 'var(--danger)' }}>{String(previo.antes[k] ?? '—')}</span>
                  <span className="muted"> → </span>
                </>
              )}
              <span style={{ color: 'var(--ok, #4a9e6f)' }}>{String(previo.despues[k])}</span>
            </div>
          ))}
        </div>
      )}

      {estado === 'propuesta' && (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <button className="btn-primary" onClick={onAplicar} style={{ padding: '4px 10px', fontSize: '10px' }}>
            {p.accion === 'abrir_expediente' ? <FolderOpen size={11} /> : <Check size={11} />}
            {p.accion === 'abrir_expediente' ? ' Abrir Ficha' : ' Aplicar'}
          </button>
          <button className="btn-ghost" onClick={onDescartar} style={{ padding: '4px 10px', fontSize: '10px' }}>
            Descartar
          </button>
        </div>
      )}
      {estado === 'aplicando' && <div style={{ fontSize: '10px', marginTop: 6 }} className="muted">aplicando…</div>}
      {estado === 'aplicada' && <div style={{ fontSize: '10px', marginTop: 6, color: 'var(--ok, #4a9e6f)' }}>✓ aplicada</div>}
      {estado === 'descartada' && <div style={{ fontSize: '10px', marginTop: 6 }} className="muted">descartada</div>}
      {estado === 'fallida' && <div style={{ fontSize: '10px', marginTop: 6, color: 'var(--danger)' }}>No se pudo: {p.resultado}</div>}
    </div>
  );
}

const recuadro = (tono) => ({
  marginTop: 8,
  padding: '9px 11px',
  borderRadius: '9px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderLeft: `3px solid ${tono}`
});
