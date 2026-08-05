import React, { useState, useEffect, useRef } from 'react';
import { X, Save, CheckCircle, FileText, Search } from 'lucide-react';
import { cargarExpedientes } from '../utils/expedientes';
import { MOCK_CASOS } from '../mockData';
import { PJUD_CASOS } from '../pjudCausesData';

export default function IngresoGestionModal({ abierto, onClose, onSave, initialCasoRef }) {
  const [casoRef, setCasoRef] = useState('');
  const [casoLabel, setCasoLabel] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [fecha, setFecha] = useState('');
  const [tipo, setTipo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [estado, setEstado] = useState('PENDIENTE');
  const [mostrarConfirmacionOtra, setMostrarConfirmacionOtra] = useState(false);
  const [todosLosCasos, setTodosLosCasos] = useState([]);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (abierto) {
      setCasoRef(initialCasoRef || '');
      setCasoLabel(initialCasoRef || '');
      setBusqueda(initialCasoRef || '');
      setFecha(new Date().toISOString().split('T')[0]);
      setTipo('');
      setDescripcion('');
      setEstado('PENDIENTE');
      setMostrarConfirmacionOtra(false);
      setMostrarResultados(false);

      cargarExpedientes().then((exp) => {
        // Tres fuentes: expedientes (incluye los extrajudiciales/administrativos,
        // que no tienen ROL PJUD) y PJUD_CASOS (las causas judiciales reales, el
        // catálogo completo). MOCK_CASOS queda por compatibilidad -está vacío-.
        // Antes esto sólo miraba MOCK_CASOS (vacío) y usaba el id interno como
        // "rit" buscable en vez del ROL real: un ROL real como "V-21179-1995"
        // nunca aparecía en el buscador, ni el de los ~1.550 expedientes que sí
        // tienen ROL espejo (buscaba por "pjud-caso-670", no por el ROL) ni el de
        // las ~630 causas que sólo existen en el catálogo PJUD y no tienen
        // expediente espejo.
        const items = [
          ...(exp || []).map(e => ({ id: e.id, rit: e.rit || e.id, titulo: e.cliente || e.asunto || 'Expediente' })),
          ...(MOCK_CASOS || []).map(c => ({ id: c.id, rit: c.rit || c.id, titulo: c.caratula || c.cliente || 'Causa judicial' })),
          ...(PJUD_CASOS || []).map(c => ({ id: c.id, rit: c.rit || c.id, titulo: c.caratula || c.cliente || 'Causa judicial' }))
        ];
        // Un mismo ROL puede aparecer como expediente Y como causa PJUD (la
        // migración espejó ~1.557 de las 2.437 causas): se queda con la primera
        // aparición -el expediente, si existe- para no listar el mismo caso dos veces.
        const vistos = new Set();
        const lista = items.filter((it) => {
          const clave = String(it.rit || it.id || '').trim().toUpperCase();
          if (!clave || vistos.has(clave)) return false;
          vistos.add(clave);
          return true;
        });
        setTodosLosCasos(lista);
      }).catch(console.error);
    }
  }, [abierto, initialCasoRef]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!abierto) return;
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setMostrarResultados(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [abierto]);

  if (!abierto) return null;

  // Filtrar casos según búsqueda
  const terminos = busqueda.toLowerCase().trim();
  const casosFiltrados = terminos.length < 1
    ? todosLosCasos.slice(0, 30)
    : todosLosCasos.filter(c => {
        const haystack = `${c.rit} ${c.titulo}`.toLowerCase();
        return terminos.split(/\s+/).every(t => haystack.includes(t));
      }).slice(0, 30);

  const seleccionarCaso = (c) => {
    setCasoRef(c.rit);
    setCasoLabel(`${c.rit} — ${c.titulo}`);
    setBusqueda(`${c.rit} — ${c.titulo}`);
    setMostrarResultados(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!casoRef) return alert("Selecciona un expediente o causa.");

    // Antes no se esperaba el resultado de onSave: si fallaba (ej. una causa sin
    // expediente espejo, que ahora sí aparece en el buscador), el modal igual
    // mostraba "Gestión Ingresada" -una confirmación falsa sobre algo que nunca
    // se guardó-.
    try {
      await onSave({
        casoRef,
        fecha,
        fechaVencimiento: fecha,
        fechaMostrada: fecha,
        tramite: tipo,
        titulo: tipo || descripcion,
        descripcion,
        estado: estado || 'PENDIENTE'
      });
      setMostrarConfirmacionOtra(true);
    } catch (err) {
      alert(`No se pudo guardar la gestión: ${err.message}`);
    }
  };

  const handleOtraGestion = (quiereOtra) => {
    if (quiereOtra) {
      setMostrarConfirmacionOtra(false);
      setTipo('');
      setDescripcion('');
      setEstado('PENDIENTE');
    } else {
      onClose();
    }
  };

  if (mostrarConfirmacionOtra) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bg-card)', padding: '28px', borderRadius: '12px', border: '1px solid var(--accent-cyan)', width: '480px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <CheckCircle size={48} color="var(--ok)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Gestión Ingresada</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>¿Se requiere ingresar alguna gestión vinculada a la anterior?</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => handleOtraGestion(false)} style={{ padding: '8px 24px' }}>No, cerrar</button>
            <button className="btn-primary" onClick={() => handleOtraGestion(true)} style={{ padding: '8px 24px', background: 'var(--accent-cyan)' }}>Sí, ingresar otra</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', width: '720px', maxWidth: '94vw', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--accent-gold)" /> Ingreso de Gestión
          </h3>
          <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}><X size={18} /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Buscador de Expediente / ROL */}
          <div ref={searchRef} style={{ position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Expediente / ROL</label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                className="input"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setCasoRef('');
                  setCasoLabel('');
                  setMostrarResultados(true);
                }}
                onFocus={() => setMostrarResultados(true)}
                placeholder="Buscar por ROL, cliente, carátula..."
                autoComplete="off"
                style={{ width: '100%', paddingLeft: '36px' }}
              />
            </div>
            {/* Resultados */}
            {mostrarResultados && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: 'var(--bg-raised, #1e1e2e)', border: '1px solid var(--border-color)',
                borderRadius: '0 0 8px 8px', maxHeight: '220px', overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
              }}>
                {casosFiltrados.length === 0 ? (
                  <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin coincidencias</div>
                ) : casosFiltrados.map((c, i) => (
                  <div
                    key={`${c.rit}-${i}`}
                    onClick={() => seleccionarCaso(c)}
                    style={{
                      padding: '10px 16px', cursor: 'pointer', fontSize: '0.85rem',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: casoRef === c.rit ? 'rgba(0,200,200,0.1)' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = casoRef === c.rit ? 'rgba(0,200,200,0.1)' : 'transparent'}
                  >
                    <span style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginRight: '8px' }}>{c.rit}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{c.titulo}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Indicador de selección */}
            {casoRef && (
              <div style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={12} /> Seleccionado: <strong>{casoLabel}</strong>
              </div>
            )}
          </div>

          {/* Fila: Fecha + Tipo + Estado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Fecha / Plazo</label>
              <input type="date" className="input" value={fecha} onChange={e => setFecha(e.target.value)} required style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Tipo de gestión</label>
              <input type="text" className="input" value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Ej: Trámite, Presentación..." required style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Estado</label>
              <select
                className="input"
                value={estado}
                onChange={e => setEstado(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-raised)' }}
              >
                <option value="PENDIENTE">⏳ PENDIENTE (En Kanban / Radar)</option>
                <option value="EN ESPERA">⚖️ EN ESPERA del tribunal</option>
                <option value="REALIZADO">✓ REALIZADO / Cumplido</option>
              </select>
            </div>
          </div>

          {/* Detalle */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>¿En qué consiste?</label>
            <textarea className="input" value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4} placeholder="Detalle de la gestión realizada..." required style={{ width: '100%', resize: 'vertical' }} />
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '4px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-cyan)' }}>
              <Save size={16} /> Guardar Gestión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
