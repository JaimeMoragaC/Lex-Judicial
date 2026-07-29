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
import BitacoraOmnicanal from './components/BitacoraOmnicanal';
import { MOCK_CASOS } from './mockData';
import { CATALOGOS_CAIDOS } from './dataLoader';
import { LEXCONTROL_API } from './apiBase';

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
  const [activeTab, setActiveTab] = useState('smartdrive'); // Por defecto iniciar en SmartDrive para que vea la simulación de sus archivos
  const [selectedCasoForModal, setSelectedCasoForModal] = useState(null);
  const [selectedCasoForMatriz, setSelectedCasoForMatriz] = useState(null);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('lexcontrol_theme') || 'dark';
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lexcontrol_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Navegar a la matriz de un caso en particular
  const handleOpenMatriz = (caso) => {
    setSelectedCasoForMatriz(caso);
    setActiveTab('matriz');
  };

  // Navegar a expedientes
  const handleNavigateToCasos = () => {
    setActiveTab('casos');
  };

  // Volver de matriz a expedientes
  const handleBackFromMatriz = () => {
    setSelectedCasoForMatriz(null);
    setActiveTab('casos');
  };

  return (
    <div className="app-container">
      <AvisoCatalogosCaidos />
      <OmniSearch onSelectCaso={(caso) => setSelectedCasoForModal(caso)} />
      
      {/* Barra Lateral de Navegación */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} toggleTheme={toggleTheme} />

      {/* Contenido Principal */}
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
              setSelectedCasoForMatriz(MOCK_CASOS[0]); // Caso Temuco
              setActiveTab('matriz');
            }} 
          />
        )}

        {activeTab === 'bitacora' && <BitacoraOmnicanal />}

        {activeTab === 'radar' && (
          <RadarPlazos
            onSelectCaso={(caso) => setSelectedCasoForModal(caso)}
          />
        )}

        {activeTab === 'buscador' && <BuscadorTexto />}

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

      {/* Modal de Detalle de Caso */}
      {selectedCasoForModal && (
        <CasoDetailModal 
          caso={selectedCasoForModal} 
          onClose={() => setSelectedCasoForModal(null)} 
          onOpenMatriz={handleOpenMatriz}
          onSelectCaso={(c) => setSelectedCasoForModal(c)}
        />
      )}
    </div>
  );
}
