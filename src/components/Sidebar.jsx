import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FolderGit2,
  Scale,
  CalendarClock,
  Users,
  Radar,
  Gavel,
  Calculator,
  Sparkles,
  HardDrive,
  Search,
  FileSearch,
  Download,
  MessageSquare,
  Sun,
  Moon
} from 'lucide-react';

import { MOCK_STATS } from '../mockData';
import { cargarPlazos, resumen } from '../utils/radarPlazos.js';

export default function Sidebar({ activeTab, setActiveTab, theme, toggleTheme }) {
  // El aviso del pie era un texto fijo en el código ("ALERTA ROJA 28/07") que
  // seguiría diciendo lo mismo para siempre. Ahora sale del registro real.
  const [alerta, setAlerta] = useState(null);

  useEffect(() => {
    cargarPlazos()
      .then((plazos) => setAlerta(resumen(plazos)))
      .catch(() => setAlerta(null));
  }, []);

  const menuItems = [
    { id: 'dashboard', label: 'Mi Día & Plazos', icon: LayoutDashboard, badge: alerta?.accionables || null, tono: 'badge-red' },
    { id: 'redactor', label: 'Redactor & Copiloto IA', icon: Sparkles },
    { id: 'agenda', label: 'Agenda & Calendario', icon: CalendarClock },
    { id: 'casos', label: 'Mis Casos & Expedientes', icon: FolderGit2, badge: MOCK_STATS.casosActivos || null },
    { id: 'clientes', label: 'Directorio de Clientes', icon: Users },
    { id: 'bitacora', label: 'Bitácora Instantánea', icon: MessageSquare }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-mark" aria-hidden="true">
          <Gavel size={18} strokeWidth={2} />
        </span>
        <span className="stack" style={{ gap: 0 }}>
          <span className="sidebar-wordmark">LexControl</span>
          <span className="eyebrow">Litigación y prueba</span>
        </span>
      </div>

      <div className="sidebar-user" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 'var(--space-2)', minWidth: 0 }}>
          <span className="avatar" aria-hidden="true">JM</span>
          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
            <span className="sidebar-user-name truncate">Jaime Moraga C.</span>
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>Socio litigante</span>
          </span>
        </div>
        {toggleTheme && (
          <button
            onClick={toggleTheme}
            className="btn-ghost"
            style={{ padding: '6px', borderRadius: 'var(--radius-sm)' }}
            title={theme === 'light' ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro'}
          >
            {theme === 'light' ? <Moon size={16} color="var(--text-primary)" /> : <Sun size={16} color="var(--accent)" />}
          </button>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Módulos del estudio">
        <p className="eyebrow sidebar-nav-title">Módulos</p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const activo = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`sidebar-link${activo ? ' is-active' : ''}`}
              aria-current={activo ? 'page' : undefined}
            >
              <span className="row" style={{ gap: 'var(--space-3)', minWidth: 0 }}>
                <Icon size={16} />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge ? (
                <span className={`badge ${item.tono || ''}`}>{item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <button
        className="sidebar-search"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
      >
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <Search size={14} />
          <span>Buscar</span>
        </span>
        <span className="row" style={{ gap: 3 }}>
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>

      <a
        href="http://localhost:8888/descargar_backup"
        download
        className="sidebar-search"
        style={{ marginTop: 'var(--space-2)', textDecoration: 'none', color: 'inherit' }}
        title="Descargar copia de seguridad en formato ZIP"
      >
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <Download size={14} />
          <span>Respaldar Datos (ZIP)</span>
        </span>
      </a>

      {alerta && alerta.accionables > 0 && (
        <button className="sidebar-alert sem sem-VENCIDO" onClick={() => setActiveTab('radar')}>
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <span className="pulse-indicator" style={{ background: 'var(--danger)' }} />
            <span className="eyebrow" style={{ color: 'var(--danger)' }}>
              {alerta.accionables} {alerta.accionables === 1 ? 'plazo requiere acción' : 'plazos requieren acción'}
            </span>
          </span>
          <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
            {alerta.VENCIDO > 0 && `${alerta.VENCIDO} vencido${alerta.VENCIDO === 1 ? '' : 's'}. `}
            {alerta.HOY > 0 && `${alerta.HOY} vence${alerta.HOY === 1 ? '' : 'n'} hoy. `}
            Abrir el radar.
          </p>
        </button>
      )}
    </aside>
  );
}
