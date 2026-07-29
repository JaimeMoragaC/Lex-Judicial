import React, { useState } from 'react';
import { 
  Scale, 
  ShieldAlert, 
  ShieldCheck, 
  FileText, 
  UserCheck, 
  Cpu, 
  Search, 
  Filter, 
  Plus, 
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Gavel,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { MOCK_MATRIZ_PROBATORIA, MOCK_CASOS } from '../mockData';

export default function MatrizProbatoria({ selectedCaso, onBack }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('TODOS');
  const [fuerzaFilter, setFuerzaFilter] = useState('TODAS');

  // Si hay un caso seleccionado, filtramos por él por defecto, de lo contrario mostramos todas las evidencias o el caso 1
  const casoActual = selectedCaso || MOCK_CASOS[0];
  
  const evidencias = MOCK_MATRIZ_PROBATORIA.filter(ev => {
    const matchesCaso = ev.casoId === casoActual.id || !selectedCaso;
    const matchesSearch = 
      ev.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.origen.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.estrategiaContra.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTipo = tipoFilter === 'TODOS' || ev.tipo.includes(tipoFilter);
    const matchesFuerza = fuerzaFilter === 'TODAS' || ev.fuerzaProbatoria === fuerzaFilter;

    return matchesCaso && matchesSearch && matchesTipo && matchesFuerza;
  });

  return (
    <div className="animate-fade-in">
      {/* Top Header del Módulo */}
      <div className="top-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            {selectedCaso && (
              <button 
                onClick={onBack} 
                style={{ background: 'transparent', color: 'var(--accent-cyan)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}
              >
                ← Volver al listado
              </button>
            )}
            <span className="badge badge-yellow">Módulo Estratégico Especial</span>
          </div>
          <h1>Matriz de Control Probatorio & Refutación</h1>
          <p>
            Análisis de admisibilidad, licitud de cadena de custodia y diseño de contrainterrogatorio para {casoActual.caratula} ({casoActual.rit}).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-gold" onClick={() => alert("Simulación: Abriendo asistente de evaluación probatoria adversarial con IA.")}>
            <BookOpen size={18} />
            <span>Auditar Licitud con IA</span>
          </button>
          <button className="btn-primary" onClick={() => alert("Simulación: Agregando nuevo medio probatorio al catálogo del caso.")}>
            <Plus size={18} />
            <span>Ingresar Evidencia</span>
          </button>
        </div>
      </div>

      {/* Banner Explicativo de la Teoría Probatoria del Caso */}
      <div className="glass-card" style={{ 
        padding: '20px 24px', 
        marginBottom: '24px', 
        background: 'linear-gradient(135deg, rgba(201, 148, 70, 0.08) 0%, rgba(22, 32, 54, 0.8) 100%)',
        borderColor: 'rgba(201, 148, 70, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: '1', minWidth: '300px' }}>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Scale size={20} /> Estrategia y Control Anti-Colapso Probatorio
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', margin: 0, marginBottom: '8px', lineHeight: 1.5 }}>
              <strong>Teoría del Caso:</strong> {casoActual.resumenTeoriaCaso}
            </p>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>🏛️ Tribunal: <strong style={{ color: 'var(--text-primary)' }}>{casoActual.tribunal}</strong></span>
              <span>⚖️ Etapa: <strong style={{ color: 'var(--accent-cyan)' }}>{casoActual.etapa}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', background: 'rgba(0,0,0,0.3)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Admitidas</span>
              <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--alert-green)' }}>{casoActual.estadisticasPrueba.admitidas}</span>
            </div>
            <div style={{ width: '1px', background: 'var(--border-color)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Impugnadas</span>
              <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--alert-red)' }}>{casoActual.estadisticasPrueba.impugnadas}</span>
            </div>
            <div style={{ width: '1px', background: 'var(--border-color)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: '700' }}>Total</span>
              <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)' }}>{casoActual.estadisticasPrueba.total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros de Evidencia */}
      <div className="glass-card" style={{ padding: '18px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px 14px', flex: '1', minWidth: '260px' }}>
          <Search size={16} color="var(--text-muted)" />
          <input 
            type="text" 
            placeholder="Buscar por código, perito, acta o descripción..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', width: '100%', fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            style={{ background: 'var(--bg-modal)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
          >
            <option value="TODOS">Tipo de Prueba: Todos</option>
            <option value="Documental">Documental / Digital</option>
            <option value="Pericial">Informes Periciales</option>
            <option value="Testimonial">Testimonios y Declaraciones</option>
          </select>

          <select
            value={fuerzaFilter}
            onChange={(e) => setFuerzaFilter(e.target.value)}
            style={{ background: 'var(--bg-modal)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' }}
          >
            <option value="TODAS">Fuerza / Valoración: Todas</option>
            <option value="Alta">Fuerza Probatoria: Alta</option>
            <option value="Media">Fuerza Probatoria: Media</option>
            <option value="Impugnada">¡Impugnada / Cuestionada!</option>
          </select>
        </div>

      </div>

      {/* Grid de Evidencias */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {evidencias.map((ev) => {
          const isImpugnada = ev.fuerzaProbatoria === 'Impugnada';
          const isAlta = ev.fuerzaProbatoria === 'Alta';

          return (
            <div 
              key={ev.id} 
              className="glass-card" 
              style={{ 
                padding: '24px', 
                borderLeft: isImpugnada ? '5px solid var(--alert-red)' : isAlta ? '5px solid var(--alert-green)' : '5px solid var(--alert-blue)',
                backgroundColor: isImpugnada ? 'rgba(207, 95, 87, 0.05)' : 'var(--bg-card)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                
                {/* Cabecera del ítem */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ 
                      fontFamily: 'var(--font-mono)', 
                      fontSize: '0.8rem', 
                      fontWeight: '800', 
                      background: 'rgba(255, 255, 255, 0.06)', 
                      padding: '4px 8px', 
                      borderRadius: '6px',
                      color: isImpugnada ? 'var(--alert-red)' : 'var(--text-primary)'
                    }}>
                      {ev.codigo}
                    </span>
                    <span className="badge badge-purple">{ev.tipo}</span>
                    <span className="badge badge-blue">Origen: {ev.origen}</span>
                    <span className={`badge ${isImpugnada ? 'badge-red' : isAlta ? 'badge-green' : 'badge-yellow'}`}>
                      Fuerza: {ev.fuerzaProbatoria}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                    {ev.descripcion}
                  </h3>
                </div>

                {/* Estado de Cadena de Custodia / Admisibilidad */}
                <div style={{ textAlign: 'right', minWidth: '240px', background: 'rgba(0,0,0,0.25)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>
                    Estado de Licitud & Custodia
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: isImpugnada ? 'var(--alert-red)' : 'var(--alert-green)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                    {isImpugnada ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
                    <span>{ev.licitud}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    📌 <em>{ev.admisibilidad}</em>
                  </div>
                </div>

              </div>

              {/* Grid 2: Impacto y Estrategia de Refutación / Contrainterrogatorio */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                
                {/* Impacto en Teoría */}
                <div style={{ 
                  padding: '14px 16px', 
                  borderRadius: '10px', 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px solid var(--border-color)' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: 'var(--accent-cyan)', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase' }}>
                    <CheckCircle2 size={16} /> Valoración e Impacto en Teoría
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                    {ev.impactoTeoria}
                  </p>
                </div>

                {/* Estrategia de Contrainterrogatorio / Defensa */}
                <div style={{ 
                  padding: '14px 16px', 
                  borderRadius: '10px', 
                  background: isImpugnada ? 'rgba(207, 95, 87, 0.1)' : 'rgba(201, 148, 70, 0.08)', 
                  border: isImpugnada ? '1px solid rgba(207, 95, 87, 0.3)' : '1px solid rgba(201, 148, 70, 0.25)' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: isImpugnada ? 'var(--alert-red)' : 'var(--accent-gold)', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase' }}>
                    <Gavel size={16} /> Estrategia de Contrainterrogatorio / Litigio
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4, fontWeight: isImpugnada ? '600' : '400' }}>
                    {ev.estrategiaContra}
                  </p>
                </div>

              </div>

              {/* Acciones del ítem */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => alert(`Editando minutas y tachas de la evidencia ${ev.codigo}`)}>
                  📝 Editar Minuta de Debate
                </button>
                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', borderColor: 'rgba(207, 95, 87, 0.4)', color: 'var(--danger)' }} onClick={() => alert(`Generando incidente de exclusión probatoria (Art. 276 CPP) para ${ev.codigo}`)}>
                  ⚠️ Redactar Incidente Exclusión
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
