import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, ShieldAlert, FolderGit2 } from 'lucide-react';
import { PJUD_CASOS } from '../pjudCausesData';
import { MOCK_CASOS } from '../mockData';

export default function PremiumCalendar({ onSelectCaso }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selectedDayEvents, setSelectedDayEvents] = useState(null);

  const allCasos = [...MOCK_CASOS, ...PJUD_CASOS];

  useEffect(() => {
    // Generate mock dates for urgent cases in the current month to demonstrate the premium calendar
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Filtramos casos urgentes o terminados para mostrarlos
    const urgentCasos = allCasos.filter(c => c.estadoPlazo === 'URGENTE').slice(0, 15);
    const attentionCasos = allCasos.filter(c => c.estadoPlazo === 'ATENCION' || c.etapa.toLowerCase().includes('prueba')).slice(0, 10);
    
    const generatedEvents = [];
    
    // Distribute randomly in the current month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    urgentCasos.forEach((c, idx) => {
      const randomDay = Math.floor(Math.random() * daysInMonth) + 1;
      generatedEvents.push({
        id: `urg-${idx}`,
        date: new Date(year, month, randomDay),
        caso: c,
        type: 'CRITICA',
        title: `Vencimiento: ${c.caratula}`
      });
    });

    attentionCasos.forEach((c, idx) => {
      const randomDay = Math.floor(Math.random() * daysInMonth) + 1;
      generatedEvents.push({
        id: `att-${idx}`,
        date: new Date(year, month, randomDay),
        caso: c,
        type: 'ALTA',
        title: `Audiencia: ${c.caratula}`
      });
    });
    
    // Add some random future tasks
    for(let i=0; i<5; i++) {
        generatedEvents.push({
            id: `rut-${i}`,
            date: new Date(year, month, Math.floor(Math.random() * daysInMonth) + 1),
            caso: allCasos[i],
            type: 'NORMAL',
            title: `Revisión Estado Diario`
        })
    }

    setEvents(generatedEvents);
  }, [currentDate.getMonth(), currentDate.getFullYear()]);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  // Adjust so Monday is 0
  const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const getEventsForDay = (day) => {
    return events.filter(e => e.date.getDate() === day && e.date.getMonth() === currentDate.getMonth() && e.date.getFullYear() === currentDate.getFullYear());
  };

  const isToday = (day) => {
    const today = new Date();
    return day === today.getDate() && currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();
  };

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const weekDays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  return (
    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
      
      {/* Calendario Grid (Left Side) */}
      <div className="glass-card" style={{ flex: '1 1 600px', padding: '24px', borderRadius: '16px', background: 'rgba(10, 15, 29, 0.7)' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', background: 'rgba(192, 160, 113, 0.1)', borderRadius: '12px' }}>
              <Calendar color="var(--accent-cyan)" size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)', fontWeight: '800', letterSpacing: '0.02em' }}>
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Agenda Judicial Dinámica</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handlePrevMonth} className="btn-secondary" style={{ padding: '8px 12px' }}><ChevronLeft size={20} /></button>
            <button onClick={handleNextMonth} className="btn-secondary" style={{ padding: '8px 12px' }}><ChevronRight size={20} /></button>
          </div>
        </div>

        {/* Days of Week */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '12px' }}>
          {weekDays.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {d.slice(0, 3)}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
          {/* Empty spaces for first week */}
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} style={{ minHeight: '100px', background: 'transparent' }} />
          ))}

          {/* Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = getEventsForDay(day);
            const today = isToday(day);
            
            const hasCritical = dayEvents.some(e => e.type === 'CRITICA');
            const hasHigh = dayEvents.some(e => e.type === 'ALTA');

            return (
              <div 
                key={`day-${day}`}
                onClick={() => setSelectedDayEvents({ day, events: dayEvents, date: new Date(currentDate.getFullYear(), currentDate.getMonth(), day) })}
                style={{
                  minHeight: '100px',
                  background: today ? 'rgba(192, 160, 113, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                  border: today ? '1px solid var(--accent-cyan)' : hasCritical ? '1px solid rgba(207, 95, 87, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: today ? '0 0 15px rgba(192, 160, 113, 0.1)' : 'none',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = today ? 'rgba(192, 160, 113, 0.05)' : 'rgba(255, 255, 255, 0.02)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: today ? '800' : '600', 
                  color: today ? 'var(--accent-cyan)' : hasCritical ? 'var(--alert-red)' : 'var(--text-primary)',
                  marginBottom: '8px'
                }}>
                  {day}
                </div>
                
                {/* Event Pills */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {dayEvents.slice(0, 3).map(e => (
                    <div 
                      key={e.id}
                      style={{
                        height: '6px',
                        borderRadius: '4px',
                        background: e.type === 'CRITICA' ? 'var(--alert-red)' : e.type === 'ALTA' ? 'var(--accent-gold)' : 'var(--accent-cyan)',
                        boxShadow: `0 0 8px ${e.type === 'CRITICA' ? 'rgba(207, 95, 87, 0.5)' : e.type === 'ALTA' ? 'rgba(201, 148, 70, 0.5)' : 'rgba(192, 160, 113, 0.5)'}`
                      }}
                      title={e.title}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '2px' }}>
                      +{dayEvents.length - 3} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side Peek Panel */}
      <div className="glass-card" style={{ flex: '1 1 300px', padding: '24px', borderRadius: '16px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {selectedDayEvents ? (
          <div className="animate-fade-in">
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} color="var(--accent-cyan)" />
              {selectedDayEvents.date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            
            {selectedDayEvents.events.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay plazos fatales ni audiencias registradas para este día.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedDayEvents.events.map(e => (
                  <div 
                    key={e.id}
                    onClick={() => { if(e.caso) onSelectCaso(e.caso); }}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${e.type === 'CRITICA' ? 'rgba(207, 95, 87, 0.3)' : e.type === 'ALTA' ? 'rgba(201, 148, 70, 0.3)' : 'rgba(192, 160, 113, 0.2)'}`,
                      borderLeft: `4px solid ${e.type === 'CRITICA' ? 'var(--alert-red)' : e.type === 'ALTA' ? 'var(--accent-gold)' : 'var(--accent-cyan)'}`,
                      padding: '16px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(ev) => ev.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={(ev) => ev.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: e.type === 'CRITICA' ? 'var(--alert-red)' : e.type === 'ALTA' ? 'var(--accent-gold)' : 'var(--accent-cyan)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                        {e.type}
                      </span>
                      {e.caso && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{e.caso.rit}</span>}
                    </div>
                    <h4 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', margin: '0 0 4px 0' }}>{e.title}</h4>
                    {e.caso && <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.caso.caratula}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', textAlign: 'center' }}>
            <Calendar size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p style={{ margin: 0 }}>Haz clic en un día del calendario para ver el desglose detallado de audiencias y plazos fatales.</p>
          </div>
        )}
      </div>
    </div>
  );
}
