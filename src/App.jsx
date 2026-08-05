import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CasosList from './components/CasosList';
import MatrizProbatoria from './components/MatrizProbatoria';
import AgendaPlazos from './components/AgendaPlazos';
import CalculadoraTerminos from './components/CalculadoraTerminos';
import DirectorioClientes from './components/DirectorioClientes';
import AsistenteProactivo from './components/AsistenteProactivo';
import SmartDriveSorter from './components/SmartDriveSorter';
import CasoDetailModal from './components/CasoDetailModal';
import OmniSearch from './components/OmniSearch';
import RadarPlazos from './components/RadarPlazos';
import BuscadorTexto from './components/BuscadorTexto';
import SubirDocumento from './components/SubirDocumento';
import DocumentosPorRevisar from './components/DocumentosPorRevisar';
import ArchivosAnalizados from './components/ArchivosAnalizados';
import BitacoraOmnicanal from './components/BitacoraOmnicanal';
import DuplicadosExpedientes from './components/DuplicadosExpedientes';
import RedactorIA from './components/RedactorIA';
import AsistenteFlotante from './components/AsistenteFlotante';
import IngresoGestionModal from './components/IngresoGestionModal';
import CrearExpedienteModal from './components/CrearExpedienteModal';
import { MOCK_CASOS } from './mockData';
import { PJUD_CASOS } from './pjudCausesData';
import { CATALOGOS_CAIDOS } from './dataLoader';
import { LEXCONTROL_API } from './apiBase';
import { claveDeCaso, guardarGestionesDeCaso } from './utils/expedientes.js';

// Si el servidor forense local no está levantado, los catálogos llegan vacíos y la
// app se vería sin causas y sin explicación. Este aviso dice qué falta y cómo arreglarlo.
function AvisoCatalogosCaidos() {
  if (CATALOGOS_CAIDOS.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#7f1d1d', color: '#fee2e2', padding: '10px 18px',
      fontSize: 13, lineHeight: 1.5, borderBottom: '1px solid #b91c1c'
    }}>
      <strong>Catálogos no disponibles</strong> ({CATALOGOS_CAIDOS.map(c => c.nombre).join(', ')}).
      {' '}No hay respuesta de <code>{LEXCONTROL_API}</code>. Levanta el puente con{' '}
      <code>python3 servidor_local_lexcontrol.py</code> y recarga la página.
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // Inicio directo en Mi Día & Plazos
  const [selectedCasoForModal, setSelectedCasoForModal] = useState(null);
  
  // Estado para el modal heurístico de gestiones
  const [ingresoGestionAbierto, setIngresoGestionAbierto] = useState(false);
  const [ingresoGestionCasoRef, setIngresoGestionCasoRef] = useState('');
  const [selectedCasoForMatriz, setSelectedCasoForMatriz] = useState(null);
  const [modalInitialTab, setModalInitialTab] = useState('resumen');

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('lexcontrol_theme') || 'dark';
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lexcontrol_theme', theme);
  }, [theme]);

  // Estado para el modal de crear expedientes
  const [crearExpedienteAbierto, setCrearExpedienteAbierto] = useState(false);

  React.useEffect(() => {
    const handleOpenIngreso = (e) => {
      setIngresoGestionCasoRef(e.detail?.casoRef || '');
      setIngresoGestionAbierto(true);
    };
    const handleOpenCrearExpediente = () => {
      setCrearExpedienteAbierto(true);
    };

    const handleKeyDown = (e) => {
      const isG = e.key && (e.key.toLowerCase() === 'g' || e.code === 'KeyG');
      if (isG && (e.ctrlKey || e.metaKey || e.altKey)) {
        e.preventDefault();
        e.stopPropagation();
        setIngresoGestionCasoRef('');
        setIngresoGestionAbierto(true);
      }
    };

    window.addEventListener('lexcontrol_open_ingreso_gestion', handleOpenIngreso);
    window.addEventListener('lexcontrol_open_crear_expediente', handleOpenCrearExpediente);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('lexcontrol_open_ingreso_gestion', handleOpenIngreso);
      window.removeEventListener('lexcontrol_open_crear_expediente', handleOpenCrearExpediente);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleOpenMatriz = (caso) => {
    setSelectedCasoForMatriz(caso);
    setActiveTab('matriz');
  };

  const handleNavigateToCasos = () => {
    setActiveTab('casos');
  };

  const handleBackFromMatriz = () => {
    setSelectedCasoForMatriz(null);
    setActiveTab('casos');
  };

  return (
    <div className="app-container">
      <AvisoCatalogosCaidos />
      <OmniSearch onSelectCaso={(caso) => setSelectedCasoForModal(caso)} />
      
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} toggleTheme={toggleTheme} />

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <Dashboard 
            theme={theme}
            toggleTheme={toggleTheme}
            onNavigateToCaso={(caso) => {
              if (caso) {
                setSelectedCasoForModal(caso);
              } else {
                setActiveTab('casos');
              }
            }} 
            onNavigateToMatriz={() => {
              setSelectedCasoForMatriz(MOCK_CASOS[0]);
              setActiveTab('matriz');
            }} 
            onOpenCrearExpediente={() => setCrearExpedienteAbierto(true)}
          />
        )}

        {activeTab === 'bitacora' && <BitacoraOmnicanal onSelectCaso={(caso) => setSelectedCasoForModal(caso)} />}

        {activeTab === 'duplicados' && (
          <DuplicadosExpedientes onSelectCaso={(caso) => setSelectedCasoForModal(caso)} />
        )}

        {activeTab === 'redactor' && (
          <RedactorIA onSelectCaso={(caso) => setSelectedCasoForModal(caso)} />
        )}

        {activeTab === 'radar' && (
          <RadarPlazos
            onSelectCaso={(caso) => setSelectedCasoForModal(caso)}
          />
        )}

        {activeTab === 'buscador' && <BuscadorTexto />}

        {activeTab === 'subir' && <SubirDocumento />}
        {activeTab === 'documentos_pendientes' && <DocumentosPorRevisar />}

        {activeTab === 'archivos_analizados' && (
          <ArchivosAnalizados onNavigateToCaso={(caso) => setSelectedCasoForModal(caso)} />
        )}

        {activeTab === 'proactivo' && (
          <AsistenteProactivo 
            onSelectCaso={(caso) => {
              setSelectedCasoForModal(caso);
              setActiveTab('casos');
            }}
          />
        )}

        {activeTab === 'smartdrive' && (
          <SmartDriveSorter 
            onSelectCaso={(caso) => {
              setSelectedCasoForModal(caso);
              setActiveTab('casos');
            }}
          />
        )}

        {activeTab === 'calculadora' && (
          <CalculadoraTerminos 
            onSelectCaso={(caso) => setSelectedCasoForModal(caso)}
          />
        )}

        {activeTab === 'casos' && (
          <CasosList 
            onSelectCaso={(caso) => setSelectedCasoForModal(caso)}
            onOpenMatriz={handleOpenMatriz}
            onOpenCrearExpediente={() => setCrearExpedienteAbierto(true)}
          />
        )}

        {activeTab === 'matriz' && (
          <MatrizProbatoria 
            selectedCaso={selectedCasoForMatriz || MOCK_CASOS[0]} 
            onBack={handleBackFromMatriz} 
          />
        )}

        {activeTab === 'agenda' && (
          <AgendaPlazos 
            onSelectCaso={(caso) => setSelectedCasoForModal(caso)} 
            onOpenCrearExpediente={() => setCrearExpedienteAbierto(true)}
          />
        )}

        {activeTab === 'clientes' && (
          <DirectorioClientes 
            onSelectCaso={(caso) => {
              setSelectedCasoForModal(caso);
              setActiveTab('casos');
            }}
            onOpenMatriz={handleOpenMatriz}
          />
        )}
      </main>

      {selectedCasoForModal && (
        <CasoDetailModal
          caso={selectedCasoForModal}
          initialTab={modalInitialTab}
          onClose={() => setSelectedCasoForModal(null)}
          onOpenMatriz={handleOpenMatriz}
          onSelectCaso={(c, tab) => {
            setSelectedCasoForModal(c);
            if (tab) setModalInitialTab(tab);
          }}
        />
      )}

      <IngresoGestionModal
        abierto={ingresoGestionAbierto}
        onClose={() => setIngresoGestionAbierto(false)}
        initialCasoRef={ingresoGestionCasoRef}
        onSave={async (gestion) => {
          const { cargarExpedientes } = await import('./utils/expedientes');
          const expList = await cargarExpedientes();
          const ref = gestion.casoRef;
          // Antes sólo miraba expList y MOCK_CASOS (siempre vacío): una causa que
          // sólo existe en el catálogo PJUD -sin expediente espejo, ~630 de 2.437-
          // no se encontraba y la gestión se descartaba en silencio, mientras el
          // modal igual mostraba "Gestión Ingresada" como si hubiera funcionado.
          const targetCaso =
            expList.find(e => e.id === ref || e.rit === ref) ||
            MOCK_CASOS.find(c => c.rit === ref || c.id === ref) ||
            PJUD_CASOS.find(c => c.rit === ref || c.id === ref);

          if (!targetCaso) {
            throw new Error(`No encontré ningún expediente ni causa con la referencia "${ref}". La gestión no se guardó.`);
          }

          const clave = claveDeCaso(targetCaso);
          const existingGestionesStr = clave ? localStorage.getItem(`lexcontrol_gestiones_${clave}`) : null;
          let gestiones = existingGestionesStr ? JSON.parse(existingGestionesStr) : [];
          
          // Corregir gestiones creadas anteriormente que hayan quedado guardadas con REALIZADO
          gestiones = gestiones.map(g => (g.estado === 'REALIZADO' ? { ...g, estado: 'PENDIENTE' } : g));

          const { normalizarFechaIso } = await import('./utils/radarPlazos');
          const fIsoNorm = normalizarFechaIso(gestion.fechaVencimiento || gestion.fecha || new Date().toISOString().split('T')[0]);

          gestiones.push({
            id: `ls-gestion-${ref}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ...gestion,
            casoRit: targetCaso.rit || ref,
            casoCaratula: targetCaso.caratula || targetCaso.cliente || '',
            fecha: fIsoNorm,
            fechaIso: fIsoNorm,
            fechaVencimiento: fIsoNorm,
            fechaMostrada: fIsoNorm,
            titulo: gestion.titulo || gestion.tramite || gestion.descripcion,
            tramite: gestion.tramite || gestion.titulo || gestion.descripcion,
            actuacion: gestion.tramite || gestion.titulo || gestion.descripcion,
            estado: gestion.estado || 'PENDIENTE'
          });

          if (clave) localStorage.setItem(`lexcontrol_gestiones_${clave}`, JSON.stringify(gestiones));
          
          // Corregir globalmente en localStorage para que cualquier gestión previa aparezca
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith('lexcontrol_gestiones_')) {
                const items = JSON.parse(localStorage.getItem(k) || '[]');
                if (Array.isArray(items)) {
                  const corregidos = items.map(g => g.estado === 'REALIZADO' ? { ...g, estado: 'PENDIENTE' } : g);
                  localStorage.setItem(k, JSON.stringify(corregidos));
                }
              }
            }
          } catch(e) {}

          guardarGestionesDeCaso(targetCaso, gestiones).catch(() => {});
          window.dispatchEvent(new Event('lexcontrol_plazos_updated'));
        }}
      />

      <CrearExpedienteModal
        isOpen={crearExpedienteAbierto}
        onClose={() => setCrearExpedienteAbierto(false)}
        onExpedienteCreado={(nuevoExp) => {
          setSelectedCasoForModal(nuevoExp);
          setActiveTab('casos');
        }}
      />

      <AsistenteFlotante onSelectCaso={(caso, tab) => {
        setModalInitialTab(tab || 'resumen');
        setSelectedCasoForModal(caso);
      }} />
    </div>
  );
}
