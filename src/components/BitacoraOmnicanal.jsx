import React, { useState, useEffect } from 'react';
import { Send, Mic, Paperclip, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { MOCK_CASOS } from '../mockData'; // Usamos MOCK_CASOS para resolver ROLs si la IA se equivoca un poco

export default function BitacoraOmnicanal() {
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [actividadesHoy, setActividadesHoy] = useState([]);

  // Cargar actividades de hoy al montar
  const cargarActividadesHoy = () => {
    const hoyStr = new Date().toLocaleDateString('es-CL');
    const hoyActs = [];
    
    // Buscar en TODOS los localStorage que sean gestiones
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('lexcontrol_gestiones_')) {
        try {
          const guardado = localStorage.getItem(key);
          if (guardado) {
            const gestiones = JSON.parse(guardado);
            
            // Determinar a qué causa pertenece esto por la llave
            let idCaso = key.replace('lexcontrol_gestiones_', '');
            let nombreCaso = idCaso;
            // Intentar buscar el nombre bonito si existe en MOCK_CASOS
            let casoEnMock = MOCK_CASOS.find(c => (c.id === idCaso || c.rit === idCaso));
            if (casoEnMock) {
              nombreCaso = casoEnMock.rol || casoEnMock.rit;
            }

            gestiones.forEach(g => {
              if (g.fecha === hoyStr && g.cuaderno === "Bitácora Omnicanal") {
                hoyActs.push({ ...g, casoAsociado: nombreCaso });
              }
            });
          }
        } catch (e) {
          console.error("Error leyendo localStorage key:", key, e);
        }
      }
    }
    
    // Ordenar de más reciente a más antiguo por timestamp
    hoyActs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    setActividadesHoy(hoyActs);
  };

  useEffect(() => {
    cargarActividadesHoy();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;

    setLoading(true);
    setSuccess(null);

    try {
      const response = await fetch("http://localhost:8888/bitacora_omnicanal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ texto })
      });

      const data = await response.json();
      
      if (data.status === "ok" && data.datos) {
        let { cliente_detectado, rol_detectado, tramite_generado, estado, urgencia } = data.datos;
        
        let casoReal = null;
        
        // Solo intentar cruzar con causas reales si no fue declarado explícitamente como EXTRAJUDICIAL
        if (rol_detectado !== 'EXTRAJUDICIAL') {
          casoReal = MOCK_CASOS.find(c => 
            (c.rit && rol_detectado && c.rit.includes(rol_detectado)) || 
            (c.rol && rol_detectado && c.rol.includes(rol_detectado)) ||
            (c.caratula && cliente_detectado && c.caratula.toLowerCase().includes(cliente_detectado.toLowerCase()))
          );
        }

        let idGuardar = casoReal ? (casoReal.id || casoReal.rit) : rol_detectado;
        
        // Lógica de Correlativo Extrajudicial
        if (!casoReal && (rol_detectado === 'EXTRAJUDICIAL' || !rol_detectado)) {
          let mapping = {};
          try {
            mapping = JSON.parse(localStorage.getItem('lexcontrol_extrajudicial_mapping') || '{}');
          } catch(e) {}
          
          let normalizedClient = (cliente_detectado || "CLIENTE_DESCONOCIDO").toUpperCase().trim();
          
          // Buscar si ya le asignamos un correlativo a este cliente (búsqueda parcial)
          let existingKey = Object.keys(mapping).find(k => k.includes(normalizedClient) || normalizedClient.includes(k));
          
          if (existingKey) {
            idGuardar = mapping[existingKey];
          } else {
            // Generar nuevo correlativo
            const currentYear = new Date().getFullYear();
            const count = Object.values(mapping).filter(v => v.endsWith(`-${currentYear}`)).length + 1;
            idGuardar = `EXT-${count.toString().padStart(3, '0')}-${currentYear}`;
            mapping[normalizedClient] = idGuardar;
            localStorage.setItem('lexcontrol_extrajudicial_mapping', JSON.stringify(mapping));
          }
          // Actualizamos rol_detectado para que la UI lo muestre bonito
          rol_detectado = idGuardar;
        }
        
        // Crear el objeto de la nueva gestión
        const nuevaGestion = {
          fecha: new Date().toLocaleDateString('es-CL'),
          tramite: tramite_generado,
          estado: estado || "COMPLETADO",
          folio: "-",
          cuaderno: "Bitácora Omnicanal",
          origen: `Registro Rápido - Cliente: ${cliente_detectado}`,
          timestamp: new Date().toISOString()
        };

        // Inyectar en localStorage
        const key = `lexcontrol_gestiones_${idGuardar}`;
        let gestionesPrevias = [];
        try {
          const guardado = localStorage.getItem(key);
          if (guardado) gestionesPrevias = JSON.parse(guardado);
        } catch(e) {}
        
        gestionesPrevias.unshift(nuevaGestion); // Ponerla al principio
        localStorage.setItem(key, JSON.stringify(gestionesPrevias));

        setSuccess(`✅ Gestión inyectada en Causa: ${casoReal ? (casoReal.rol || casoReal.rit) : rol_detectado}`);
        setTexto('');
        cargarActividadesHoy(); // Refrescar línea de tiempo
        
        setTimeout(() => setSuccess(null), 5000);
      } else {
        alert("Error de la IA: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Error conectando con el servidor. ¿Está corriendo servidor_local_lexcontrol.py?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card animate-fade-in" style={{ 
      padding: '24px', 
      marginBottom: '26px', 
      background: 'rgba(10, 15, 25, 0.75)', 
      border: '1px solid rgba(0, 240, 255, 0.3)',
      boxShadow: '0 8px 32px 0 rgba(0, 240, 255, 0.1)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Glow Effect Top */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: 'linear-gradient(90deg, transparent, #00f0ff, transparent)',
        opacity: 0.8
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Columna Izquierda: Ingreso Inteligente */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '8px', borderRadius: '50%', background: 'rgba(0, 240, 255, 0.1)' }}>
              <Mic size={20} color="#00f0ff" />
            </div>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: '500' }}>Bitácora Omnicanal</h3>
          </div>

          <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej: Hablé con Froilán por WhatsApp, me dijo que mañana transfiere el poder. Causa ROL 25727."
              style={{
                width: '100%',
                minHeight: '120px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '16px',
                color: '#fff',
                fontSize: '1rem',
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.2s',
                fontFamily: 'var(--font-sans)'
              }}
              onFocus={(e) => e.target.style.borderColor = 'rgba(0, 240, 255, 0.5)'}
              onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
            />
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginTop: '12px' 
            }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--text-muted)', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Paperclip size={18} />
                  <span style={{ fontSize: '0.9rem' }}>Adjuntar Doc</span>
                </button>
              </div>

              <button 
                type="submit" 
                disabled={loading || !texto.trim()}
                style={{
                  background: loading ? 'transparent' : 'linear-gradient(45deg, #00f0ff, #0088ff)',
                  border: loading ? '1px solid #00f0ff' : 'none',
                  padding: '10px 24px',
                  borderRadius: '24px',
                  color: loading ? '#00f0ff' : '#000',
                  fontWeight: '600',
                  cursor: (loading || !texto.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: (!texto.trim() && !loading) ? 0.5 : 1,
                  transition: 'all 0.3s'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="spin" />
                    <span>Procesando IA...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Registrar Gestión</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {success && (
            <div className="animate-fade-in" style={{
              marginTop: '16px',
              padding: '12px 16px',
              background: 'rgba(0, 255, 128, 0.1)',
              border: '1px solid rgba(0, 255, 128, 0.3)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#00ff80',
              fontWeight: '500'
            }}>
              <CheckCircle2 size={20} />
              <span>{success}</span>
            </div>
          )}
        </div>

        {/* Columna Derecha: Línea de Tiempo de Hoy */}
        <div style={{
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          paddingLeft: '24px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '8px', borderRadius: '50%', background: 'rgba(255, 170, 0, 0.1)' }}>
              <Clock size={20} color="var(--accent-gold)" />
            </div>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: '500' }}>Bitácora del Día</h3>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '200px', paddingRight: '8px' }}>
            {actividadesHoy.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', marginTop: '30px' }}>
                Aún no has registrado interacciones hoy.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {actividadesHoy.map((act, index) => {
                  const hora = new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={index} className="animate-fade-in" style={{
                      background: 'rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      padding: '12px',
                      position: 'relative'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ color: '#00f0ff', fontSize: '0.75rem', fontWeight: '600', fontFamily: 'var(--font-mono)' }}>
                          [{hora}] {act.casoAsociado}
                        </div>
                        <span style={{
                          fontSize: '0.65rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: act.estado === 'COMPLETADO' ? 'rgba(0, 255, 128, 0.15)' : 'rgba(255, 170, 0, 0.15)',
                          color: act.estado === 'COMPLETADO' ? '#00ff80' : 'var(--accent-gold)',
                          fontWeight: '600'
                        }}>
                          {act.estado}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                        {act.tramite}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
