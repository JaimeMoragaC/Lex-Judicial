import React, { useState } from 'react';
import { X, Briefcase, Plus, CheckCircle2 } from 'lucide-react';
import { cargarExpedientes, guardarExpedientes } from '../utils/expedientes.js';

export default function CrearExpedienteModal({ isOpen, onClose, onExpedienteCreado }) {
  const [formData, setFormData] = useState({
    rit: '',
    ruc: '',
    caratula: '',
    cliente: '',
    contraparte: '',
    abogadoContraparte: '',
    tribunal: '',
    numeroTribunal: '',
    ciudad: 'Temuco',
    materia: 'Civil',
    etapa: 'Ingreso / Tramitación Inicial'
  });

  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.caratula && !formData.cliente && !formData.rit) {
      alert('Por favor ingresa al menos el ROL/RIT, la Carátula o el Cliente.');
      return;
    }

    setGuardando(true);

    try {
      const expedientesActuales = await cargarExpedientes();
      
      const nuevoExpediente = {
        id: formData.rit ? formData.rit.trim() : `EXP-${Date.now()}`,
        rit: formData.rit.trim() || 'ROL EN TRÁMITE',
        ritVinculado: formData.rit.trim() || '',
        ruc: formData.ruc.trim(),
        caratula: formData.caratula.trim() || `${formData.cliente || 'Causa'} / ${formData.contraparte || 'En Reserva'}`,
        cliente: formData.cliente.trim() || 'Cliente no especificado',
        contraparte: formData.contraparte.trim() || 'En Reserva',
        abogadoContraparte: formData.abogadoContraparte.trim() || 'No registrado',
        tribunal: formData.tribunal.trim() || 'Juzgado Civil de Temuco',
        numeroTribunal: formData.numeroTribunal.trim() || '1',
        ciudad: formData.ciudad.trim() || 'Temuco',
        materia: formData.materia || 'Civil',
        etapa: formData.etapa || 'Ingreso / Tramitación Inicial',
        estado: 'ACTIVO',
        estadoVigencia: 'EN TRAMITACIÓN',
        creadoEn: new Date().toISOString(),
        gestiones: [
          {
            id: `gst-ini-${Date.now()}`,
            fecha: new Date().toISOString().split('T')[0].split('-').reverse().join('/'),
            tipo: 'Ingreso de Causa',
            consisteEn: 'Apertura de nuevo expediente en el sistema LexControl.',
            origen: 'Creación Manual'
          }
        ]
      };

      const listaActualizada = [nuevoExpediente, ...(expedientesActuales || [])];
      await guardarExpedientes(listaActualizada);

      // Guardar también en localStorage para actualización inmediata en caliente
      try {
        const casosIA = JSON.parse(localStorage.getItem('lexcontrol_casos_ia') || '[]');
        localStorage.setItem('lexcontrol_casos_ia', JSON.stringify([nuevoExpediente, ...casosIA]));
      } catch (err) {}

      // Disparar evento global para recargar listas
      window.dispatchEvent(new CustomEvent('lexcontrol_expedientes_updated', { detail: nuevoExpediente }));

      setMensajeExito(true);
      setTimeout(() => {
        setMensajeExito(false);
        setGuardando(false);
        if (onExpedienteCreado) onExpedienteCreado(nuevoExpediente);
        onClose();
      }, 800);
    } catch (err) {
      console.error('Error al guardar expediente:', err);
      alert(`Ocurrió un error al crear el expediente: ${err.message}`);
      setGuardando(false);
    }
  };

  const cellCardStyle = {
    background: 'var(--bg-secondary, #1e293b)',
    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
    borderRadius: '10px',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, #475569)',
    background: 'var(--bg-surface, #334155)',
    color: 'var(--text-primary, #ffffff)',
    fontSize: '0.9rem',
    fontWeight: 500
  };

  const labelStyle = {
    fontSize: '0.82rem',
    fontWeight: 700,
    color: 'var(--text-primary, #f1f5f9)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em'
  };

  return (
    <div className="modal-backdrop animate-fade-in" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.12))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-header, rgba(30, 41, 59, 0.9))'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
            }}>
              <Briefcase size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                Ingresar Nuevo Expediente / Causa
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
                Completa los datos de la causa judicial o expediente extrajudicial.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content / Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {mensajeExito && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid #22c55e',
              color: '#4ade80',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.95rem'
            }}>
              <CheckCircle2 size={20} />
              <span>¡Expediente ingresado exitosamente en el sistema!</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* ROL / RIT */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                ROL / RIT <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                name="rit"
                value={formData.rit}
                onChange={handleChange}
                placeholder="ej. C-1234-2026 o ROL 35002-2026"
                required
                style={inputStyle}
              />
            </div>

            {/* RUC (Si es penal) */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                RUC (Causas Penales / MP)
              </label>
              <input
                type="text"
                name="ruc"
                value={formData.ruc}
                onChange={handleChange}
                placeholder="ej. 2400123456-7"
                style={inputStyle}
              />
            </div>

            {/* Carátula */}
            <div style={{ ...cellCardStyle, gridColumn: 'span 2' }}>
              <label style={labelStyle}>
                Carátula del Caso <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                name="caratula"
                value={formData.caratula}
                onChange={handleChange}
                placeholder="ej. GARAI / BANCO CHILE o PÉREZ CON GONZÁLEZ"
                required
                style={inputStyle}
              />
            </div>

            {/* Cliente */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                Cliente / Patrocinado <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                name="cliente"
                value={formData.cliente}
                onChange={handleChange}
                placeholder="ej. Víctor Garai Soto"
                required
                style={inputStyle}
              />
            </div>

            {/* Contraparte */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                Contraparte
              </label>
              <input
                type="text"
                name="contraparte"
                value={formData.contraparte}
                onChange={handleChange}
                placeholder="ej. Banco Estado / Juan Pérez"
                style={inputStyle}
              />
            </div>

            {/* Abogado Contraparte */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                Abogado Contraparte
              </label>
              <input
                type="text"
                name="abogadoContraparte"
                value={formData.abogadoContraparte}
                onChange={handleChange}
                placeholder="ej. Pedro Rodríguez"
                style={inputStyle}
              />
            </div>

            {/* Tribunal */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                Tribunal / Magistratura
              </label>
              <input
                type="text"
                name="tribunal"
                value={formData.tribunal}
                onChange={handleChange}
                placeholder="ej. 1º Juzgado de Letras de Temuco"
                style={inputStyle}
              />
            </div>

            {/* Número de Tribunal */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                Nº de Tribunal
              </label>
              <input
                type="text"
                name="numeroTribunal"
                value={formData.numeroTribunal}
                onChange={handleChange}
                placeholder="ej. 1, 2, 3"
                style={inputStyle}
              />
            </div>

            {/* Ciudad */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                Ciudad
              </label>
              <input
                type="text"
                name="ciudad"
                value={formData.ciudad}
                onChange={handleChange}
                placeholder="ej. Temuco, Osorno, Santiago"
                style={inputStyle}
              />
            </div>

            {/* Materia */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                Materia / Fuero
              </label>
              <select
                name="materia"
                value={formData.materia}
                onChange={handleChange}
                style={inputStyle}
              >
                <option value="Civil">Civil</option>
                <option value="Penal">Penal</option>
                <option value="Laboral">Laboral</option>
                <option value="Familia">Familia</option>
                <option value="Corte de Apelaciones">Corte de Apelaciones</option>
                <option value="Corte Suprema">Corte Suprema</option>
                <option value="Extrajudicial">Extrajudicial / Tramitación Directa</option>
              </select>
            </div>

            {/* Etapa */}
            <div style={cellCardStyle}>
              <label style={labelStyle}>
                Etapa Procesal Inicial
              </label>
              <input
                type="text"
                name="etapa"
                value={formData.etapa}
                onChange={handleChange}
                placeholder="ej. Demanda, Contestación, Probatorio"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Buttons Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '12px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-color, rgba(255,255,255,0.12))'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #475569)',
                background: 'transparent',
                color: 'var(--text-secondary, #cbd5e1)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="btn-primary"
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Plus size={18} />
              <span>{guardando ? 'Guardando...' : 'Guardar Expediente'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
