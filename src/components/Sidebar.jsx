import React from 'react';
import { 
  LayoutDashboard, 
  FolderGit2, 
  Scale, 
  CalendarClock, 
  Users, 
  ShieldAlert, 
  Settings, 
  LogOut,
  Gavel,
  Calculator,
  Briefcase,
  Sparkles,
  HardDrive,
  Search
} from 'lucide-react';

import { MOCK_STATS } from '../mockData';

export default function Sidebar({ activeTab, setActiveTab }) {
  const menuItems = [
    { id: 'dashboard', label: 'Centro de Mando', icon: LayoutDashboard, badge: '' },
    { id: 'proactivo', label: 'Asistente IA (Cero Cargas)', icon: Sparkles, badge: '¡OJV TEMUCO!', badgeColor: 'gold' },
    { id: 'smartdrive', label: 'Smart-Drive (Ordenador)', icon: HardDrive, badge: '¡ANTI-CAOS!', badgeColor: 'cyan' },
    { id: 'calculadora', label: 'Calculadora CPC / CPP', icon: Calculator, badge: '¡CHILE!', badgeColor: 'cyan' },
    { id: 'casos', label: 'Expedientes & Casos', icon: FolderGit2, badge: String(MOCK_STATS.casosActivos) },
    { id: 'matriz', label: 'Matriz Probatoria', icon: Scale, badge: '¡Especial!', badgeColor: 'gold' },
    { id: 'agenda', label: 'Plazos & Audiencias', icon: CalendarClock, badge: '4 URG', badgeColor: 'red' },
    { id: 'clientes', label: 'Directorio Clientes', icon: Users, badge: '' },
  ];

  return (
    <aside style={{
      position: 'fixed',
      top: 0,
      left: 0,
      bottom: 0,
      width: '260px',
      backgroundColor: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 50,
      padding: '24px 16px'
    }}>
      {/* Branding Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px 24px 8px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #00f0ff 0%, #0066ff 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 15px rgba(0, 240, 255, 0.3)'
        }}>
          <Gavel size={22} color="#000" strokeWidth={2.5} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.03em', color: '#fff', margin: 0 }}>
            Lex<span style={{ color: 'var(--accent-cyan)' }}>Control</span>
          </h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '600' }}>
            Litigación & Prueba
          </span>
        </div>
      </div>

      {/* Perfil del Abogado */}
      <div style={{
        margin: '20px 0',
        padding: '12px',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '700',
          color: '#000',
          fontSize: '0.9rem'
        }}>
          JM
        </div>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: '600', color: '#fff', margin: 0, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            Jaime Moraga C.
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: '500' }}>
            Socio Litigante
          </span>
        </div>
      </div>

      {/* Menú de Navegación */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '600', padding: '0 8px', marginBottom: '4px' }}>
          Módulos del Estudio
        </p>
        
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: '10px',
                background: isActive 
                  ? 'linear-gradient(90deg, rgba(0, 240, 255, 0.15) 0%, rgba(0, 240, 255, 0.03) 100%)' 
                  : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent-cyan)' : '3px solid transparent',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                fontWeight: isActive ? '600' : '500',
                transition: 'all 0.2s ease',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Icon size={18} color={isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'} />
                <span style={{ fontSize: '0.9rem' }}>{item.label}</span>
              </div>

              {item.badge && (
                <span className={`badge ${
                  item.badgeColor === 'red' ? 'badge-red' : 
                  item.badgeColor === 'gold' ? 'badge-yellow' : 
                  item.badgeColor === 'cyan' ? 'badge-cyan' :
                  'badge-blue'
                }`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Buscador Global Hint */}
      <div 
        style={{
          margin: '12px 14px',
          padding: '10px 14px',
          borderRadius: '10px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Search size={14} color="var(--text-muted)" />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Búsqueda Global</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <span style={{ fontSize: '0.65rem', background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '4px', color: 'var(--text-muted)' }}>Ctrl</span>
          <span style={{ fontSize: '0.65rem', background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '4px', color: 'var(--text-muted)' }}>K</span>
        </div>
      </div>

      {/* Alerta Estratégica / Footer Sidebar */}
      <div style={{
        padding: '14px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.02) 100%)',
        border: '1px solid rgba(239, 68, 68, 0.35)',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <ShieldAlert size={16} color="var(--alert-red)" />
          <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--alert-red)' }}>
            ¡ALERTA ROJA 28/07!
          </span>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#fca5a5', margin: 0, lineHeight: 1.4 }}>
          Confesional Temuco C-1869-2026. Apercibimiento Art. 394 CPC.
        </p>
      </div>

      {/* Botón Salir */}
      <button style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        color: 'var(--text-muted)',
        background: 'transparent',
        borderRadius: '8px',
        fontSize: '0.85rem',
        fontWeight: '500'
      }}>
        <LogOut size={16} />
        <span>Cerrar Sesión</span>
      </button>
    </aside>
  );
}
