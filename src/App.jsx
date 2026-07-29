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
import { MOCK_CASOS } from './mockData';

export default function App() {
  const [activeTab, setActiveTab] = useState('smartdrive'); // Por defecto iniciar en SmartDrive para que vea la simulación de sus archivos
  const [selectedCasoForModal, setSelectedCasoForModal] = useState(null);
  const [selectedCasoForMatriz, setSelectedCasoForMatriz] = useState(null);

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
      <OmniSearch onSelectCaso={(caso) => setSelectedCasoForModal(caso)} />
      
      {/* Barra Lateral de Navegación */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Contenido Principal */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <Dashboard 
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
