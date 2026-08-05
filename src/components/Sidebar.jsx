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
  FileSignature,
  Download,
  MessageSquare,
  UploadCloud,
  Inbox,
  Sun,
  Moon,
  Copy
} from 'lucide-react';

import { MOCK_STATS, MOCK_CASOS } from '../mockData';
import { cargarAtencion } from '../utils/radarPlazos.js';
import { LEXCONTROL_API } from '../apiBase.js';

export default function Sidebar({ activeTab, setActiveTab, theme, toggleTheme }) {
  // El aviso del pie era un texto fijo en el código ("ALERTA ROJA 28/07") que
  // seguiría diciendo lo mismo para siempre. Ahora sale del registro real.
  const [alerta, setAlerta] = useState(null);
  const [pendientesRevision, setPendientesRevision] = useState(0);

  useEffect(() => {
    // Misma función que el Dashboard y el Radar. Antes esta cifra contaba sólo
    // los plazos fatales, así que el badge podía decir 2 mientras el semáforo
    // mostraba 5 gestiones venciendo hoy.
    cargarAtencion({ causas: MOCK_CASOS })
      .then((r) => setAlerta(r.resumen))
      .catch(() => setAlerta(null));

    fetch(`${LEXCONTROL_API}/documentos_pendientes`)
      .then((r) => r.json())
      .then((data) => setPendientesRevision((data.documentos || []).length))
      .catch(() => setPendientesRevision(0));
  }, []);

  // Toda sección que App.jsx sepa renderizar tiene que tener entrada acá. Cinco
  // habían quedado sin la suya (radar, proactivo, buscador, calculadora, matriz):
  // el código seguía en App.jsx pero no había forma de llegar a ellas.
  const menuItems = [
    { id: 'dashboard', label: 'Mi Día & Plazos', icon: LayoutDashboard, badge: alerta?.accionables || null, tono: 'badge-red' },
    { id: 'radar', label: 'Radar de Plazos', icon: Radar, badge: alerta?.accionables || null, tono: 'badge-red' },
    { id: 'agenda', label: 'Agenda & Calendario', icon: CalendarClock },
    { id: 'calculadora', label: 'Cómputo de Términos', icon: Calculator },
    { id: 'chat_bot', label: 'Chatbot Asistente IA', icon: MessageSquare },

    { id: 'documentos_pendientes', label: 'Documentos por Revisar', icon: Inbox, badge: pendientesRevision || null, tono: 'badge-gold', grupo: 'Documentos' },
    { id: 'subir', label: 'Subir & Analizar Documento', icon: UploadCloud, grupo: 'Documentos' },
    { id: 'archivos_analizados', label: 'Documentos Analizados', icon: FileSearch, grupo: 'Documentos' },
    { id: 'proactivo', label: 'Asistente Proactivo (IA)', icon: Sparkles, grupo: 'Documentos' },
    { id: 'smartdrive', label: 'Explorador del Disco', icon: HardDrive, grupo: 'Documentos' },
    { id: 'buscador', label: 'Buscar en el Contenido', icon: FileSearch, grupo: 'Documentos' },
    { id: 'redactor', label: 'Redactor & Copiloto IA', icon: FileSignature, grupo: 'Documentos' },

    { id: 'casos', label: 'Mis Casos & Expedientes', icon: FolderGit2, badge: MOCK_STATS.casosActivos || null, grupo: 'Expedientes' },
    { id: 'matriz', label: 'Matriz Probatoria', icon: Scale, grupo: 'Expedientes' },
    { id: 'clientes', label: 'Directorio de Clientes', icon: Users, grupo: 'Expedientes' },
    { id: 'bitacora', label: 'Bitácora Instantánea', icon: MessageSquare, grupo: 'Expedientes' },
    { id: 'duplicados', label: 'Posibles Duplicados', icon: Copy, grupo: 'Expedientes' }
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
        <p className="eyebrow sidebar-nav-title">Plazos</p>
        {menuItems.map((item, i) => {
          const Icon = item.icon;
          const activo = activeTab === item.id;
          // Encabezado cuando arranca un grupo distinto al del ítem anterior.
          const grupoNuevo = item.grupo && item.grupo !== menuItems[i - 1]?.grupo;
          return (
            <React.Fragment key={item.id}>
            {grupoNuevo && <p className="eyebrow sidebar-nav-title sidebar-nav-grupo">{item.grupo}</p>}
            <button
              onClick={() => {
                if (item.id === 'chat_bot') {
                  window.dispatchEvent(new CustomEvent('lexcontrol_open_chat_asistente'));
                } else {
                  setActiveTab(item.id);
                }
              }}
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
            </React.Fragment>
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

      <button
        className="sidebar-search"
        style={{ marginTop: 'var(--space-2)', border: '1px solid var(--accent-cyan)', color: 'var(--text-primary)' }}
        onClick={() => window.dispatchEvent(new CustomEvent('lexcontrol_open_ingreso_gestion'))}
        title="Abrir ventana de ingreso de gestiones procesales (Ctrl + G)"
      >
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <FileSignature size={14} color="var(--accent-cyan)" />
          <span style={{ fontWeight: 600 }}>+ Nueva Gestión</span>
        </span>
        <span className="row" style={{ gap: 3 }}>
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">G</kbd>
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
