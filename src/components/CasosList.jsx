import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  FolderGit2, 
  ChevronRight, 
  AlertCircle, 
  Calendar, 
  Scale, 
  User, 
  CheckCircle,
  FileText,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  FolderOpen
} from 'lucide-react';
import { MOCK_CASOS } from '../mockData';
import { findDiscoFolder } from '../utils/folderMatcher';

export default function CasosList({ onSelectCaso, onOpenMatriz }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [materiaFilter, setMateriaFilter] = useState('TODAS');
  const [etapaFilter, setEtapaFilter] = useState('TODAS');
  const [ciudadFilter, setCiudadFilter] = useState('TODAS');
  const [tribunalFilter, setTribunalFilter] = useState('TODAS');
  const [vigenciaFilter, setVigenciaFilter] = useState('TODAS');
  
  const [extrajudicialCasos, setExtrajudicialCasos] = useState([]);

  React.useEffect(() => {
    try {
      const mappingStr = localStorage.getItem('lexcontrol_extrajudicial_mapping');
      if (mappingStr) {
        const mapping = JSON.parse(mappingStr);
        const synthCasos = Object.entries(mapping).map(([cliente, extId]) => ({
          id: extId,
          rit: extId,
          rol: extId,
          nuc: "N/A",
          caratula: `Asesoría Extrajudicial - ${cliente}`,
          cliente: cliente,
          materia: "Extrajudicial",
          tribunal: "Gestión Interna",
          ciudad: "Gestión Interna",
          fechaInicio: extId.split('-')[2] || "2026",
          estadoPlazo: "VIGENTE",
          etapa: "Asesoría Activa",
          demandante: cliente,
          demandado: "N/A",
          proximaAudiencia: "",
          resumenTeoriaCaso: "Carpeta de gestión extrajudicial generada automáticamente."
        }));
        setExtrajudicialCasos(synthCasos);
      }
    } catch(e) {
      console.error(e);
    }
  }, []);

  // Filtrado de causas (combinando mock + extrajudiciales locales)
  const allCasos = [...MOCK_CASOS, ...extrajudicialCasos];
  const filteredCasos = allCasos.filter(caso => {
    const sTerm = searchTerm.toLowerCase();
    const caratula = caso.caratula || '';
    const rit = caso.rit || '';
    const nuc = caso.nuc || '';
    const cliente = caso.cliente || '';
    
    const matchesSearch = 
      caratula.toLowerCase().includes(sTerm) ||
      rit.toLowerCase().includes(sTerm) ||
      nuc.toLowerCase().includes(sTerm) ||
      cliente.toLowerCase().includes(sTerm);
    
    const materia = caso.materia || '';
    const etapa = caso.etapa || '';
    const tribunal = caso.tribunal || '';

    const matchesMateria = materiaFilter === 'TODAS' || materia.includes(materiaFilter);
    const matchesEtapa = etapaFilter === 'TODAS' || etapa.includes(etapaFilter);

    const matchesTribunal = tribunalFilter === 'TODAS' || 
      tribunal.toLowerCase().includes(tribunalFilter.toLowerCase()) || 
      materia.toLowerCase().includes(tribunalFilter.toLowerCase());

    const searchTarget = `${tribunal} ${caratula} ${cliente} ${caso.resumenTeoriaCaso || ''}`.toLowerCase();
    
    let matchesCiudad = ciudadFilter === 'TODAS';
    if (ciudadFilter !== 'TODAS') {
      const term = ciudadFilter.toLowerCase();
      if (term === 'punta arenas') {
        matchesCiudad = searchTarget.includes('punta arenas') || searchTarget.includes('magallanes');
      } else if (term === 'santiago') {
        matchesCiudad = searchTarget.includes('santiago') || searchTarget.includes('rm') || searchTarget.includes('metropolitana');
      } else if (term === 'concepción') {
        matchesCiudad = searchTarget.includes('concepción') || searchTarget.includes('concepcion') || searchTarget.includes('biobío') || searchTarget.includes('biobio');
      } else if (term === 'valparaíso') {
        matchesCiudad = searchTarget.includes('valparaíso') || searchTarget.includes('valparaiso') || searchTarget.includes('viña');
      } else if (term === 'valdivia') {
        matchesCiudad = searchTarget.includes('valdivia') || searchTarget.includes('los ríos') || searchTarget.includes('los rios');
      } else if (term === 'coyhaique') {
        matchesCiudad = searchTarget.includes('coyhaique') || searchTarget.includes('aysén') || searchTarget.includes('aysen');
      } else {
        matchesCiudad = searchTarget.includes(term);
      }
    }

    const override = localStorage.getItem(`lexcontrol_vigencia_${caso.id || rit}`);
    let isFinalizado = false;
    if (override) {
      isFinalizado = override === 'TERMINADO / CANCELADO';
    } else {
      isFinalizado = caso.estadoPlazo === 'TERMINADO' || 
        etapa.toLowerCase().includes('fallada') || 
        etapa.toLowerCase().includes('terminad') || 
        etapa.toLowerCase().includes('archiv');
    }
    
    const matchesVigencia = vigenciaFilter === 'TODAS' || 
      (vigenciaFilter === 'VIGENTES' && !isFinalizado) || 
      (vigenciaFilter === 'FINALIZADOS' && isFinalizado);

    return matchesSearch && matchesMateria && matchesEtapa && matchesTribunal && matchesCiudad && matchesVigencia;
  });

  return (
    <div className="animate-fade-in">
      {/* Top Header */}
      <div className="top-header">
        <div className="header-title">
          <h1>Expedientes & Control de Litigación</h1>
          <p>Directorio activo de causas penales, civiles, laborales y arbitrajes del estudio.</p>
        </div>
        <button className="btn-primary" onClick={() => alert("Modal de creación de nuevo expediente en prototipo.")}>
          <FolderGit2 size={18} />
          <span>Ingresar Nueva Causa</span>
        </button>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        
        {/* Input de búsqueda */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          background: 'rgba(255, 255, 255, 0.05)', 
          border: '1px solid var(--border-color)', 
          borderRadius: '10px', 
          padding: '10px 16px',
          flex: '1',
          minWidth: '280px'
        }}>
          <Search size={18} color="var(--text-muted)" />
          <input 
            type="text" 
            placeholder="Buscar por RIT, ROL, NUC, Carátula o Cliente..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              width: '100%',
              fontSize: '0.9rem',
              fontFamily: 'var(--font-body)'
            }}
          />
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Filtro por Vigencia */}
          <div>
            <select
              value={vigenciaFilter}
              onChange={(e) => setVigenciaFilter(e.target.value)}
              style={{
                background: 'var(--bg-modal)',
                color: '#fff',
                border: '1px solid var(--border-color)',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-body)',
                outline: 'none'
              }}
            >
              <option value="TODAS">⚡ Estado: Todos (Vigentes y Finalizados)</option>
              <option value="VIGENTES">🟢 Solo Expedientes Vigentes / En Trámite</option>
              <option value="FINALIZADOS">⚪ Solo Expedientes Finalizados / Fallados</option>
            </select>
          </div>

          {/* Filtro por Ciudad / Región */}
          <div>
            <select
              value={ciudadFilter}
              onChange={(e) => setCiudadFilter(e.target.value)}
              style={{
                background: 'var(--bg-modal)',
                color: '#fff',
                border: '1px solid var(--border-color)',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-body)',
                outline: 'none'
              }}
            >
              <option value="TODAS">📍 Ciudad: Todas</option>
              <option value="Temuco">Temuco / IX Región</option>
              <option value="Santiago">Santiago / RM</option>
              <option value="Concepción">Concepción / Biobío</option>
              <option value="Valparaíso">Valparaíso / V Región</option>
              <option value="Punta Arenas">Punta Arenas / Magallanes</option>
              <option value="Puerto Montt">Puerto Montt / Los Lagos</option>
              <option value="Coyhaique">Coyhaique / Aysén</option>
              <option value="Valdivia">Valdivia / Los Ríos</option>
              <option value="La Serena">La Serena / Coquimbo</option>
              <option value="Antofagasta">Antofagasta / II Región</option>
            </select>
          </div>

          {/* Filtro por Tribunal / Competencia */}
          <div>
            <select
              value={tribunalFilter}
              onChange={(e) => setTribunalFilter(e.target.value)}
              style={{
                background: 'var(--bg-modal)',
                color: '#fff',
                border: '1px solid var(--border-color)',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-body)',
                outline: 'none'
              }}
            >
              <option value="TODAS">🏛️ Tribunal: Todos</option>
              <option value="Corte Suprema">Corte Suprema</option>
              <option value="Corte Apelaciones">Corte de Apelaciones</option>
              <option value="Civil">Juzgados Civiles</option>
              <option value="Penal">Garantía / TOP / Penal</option>
              <option value="Laboral">Juzgados Laborales</option>
              <option value="Familia">Juzgados de Familia</option>
              <option value="Cobranza">Juzgados de Cobranza</option>
              <option value="Arbitraje">Arbitraje CAM</option>
            </select>
          </div>

          {/* Filtro por Materia */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} color="var(--accent-cyan)" />
            <select
              value={materiaFilter}
              onChange={(e) => setMateriaFilter(e.target.value)}
              style={{
                background: 'var(--bg-modal)',
                color: '#fff',
                border: '1px solid var(--border-color)',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-body)',
                outline: 'none'
              }}
            >
              <option value="TODAS">Materia: Todas</option>
              <option value="Penal">Derecho Penal</option>
              <option value="Civil">Civil / Patrimonial</option>
              <option value="Laboral">Derecho Laboral</option>
              <option value="Arbitraje">Arbitraje CAM</option>
            </select>
          </div>

          {/* Filtro por Etapa */}
          <div>
            <select
              value={etapaFilter}
              onChange={(e) => setEtapaFilter(e.target.value)}
              style={{
                background: 'var(--bg-modal)',
                color: '#fff',
                border: '1px solid var(--border-color)',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-body)',
                outline: 'none'
              }}
            >
              <option value="TODAS">Etapa: Todas</option>
              <option value="Investigación">Investigación / Garantía</option>
              <option value="Juicio Oral">Juicio Oral</option>
              <option value="Probatorio">Término Probatorio</option>
              <option value="Preparatoria">Preparatoria / Discusión</option>
              <option value="Fallada">Fallada / Terminado</option>
              <option value="Tramitación">En Tramitación / Relación</option>
            </select>
          </div>

        </div>
      </div>

      {/* Contador de resultados */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 4px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Mostrando <strong>{filteredCasos.length}</strong> causas en el directorio
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldAlert size={14} /> Haz clic en un expediente para revisar la teoría del caso y prueba
        </span>
      </div>

      {/* Tabla Compacta Estilo Excel */}
      <div className="glass-card" style={{ overflowX: 'auto', padding: '0', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              <th style={{ fontWeight: '600', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ resize: 'horizontal', overflow: 'hidden', padding: '16px', minWidth: '160px', position: 'relative' }} title="Arrastra el borde inferior derecho para ajustar el ancho">
                  Expediente
                </div>
              </th>
              <th style={{ fontWeight: '600', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ resize: 'horizontal', overflow: 'hidden', padding: '16px', minWidth: '100px', width: '130px', position: 'relative' }} title="Arrastra el borde inferior derecho para ajustar el ancho">
                  Tribunal y Ciudad
                </div>
              </th>
              <th style={{ fontWeight: '600', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ resize: 'horizontal', overflow: 'hidden', padding: '16px', minWidth: '100px', position: 'relative' }} title="Arrastra el borde inferior derecho para ajustar el ancho">
                  Materia
                </div>
              </th>
              <th style={{ fontWeight: '600', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ resize: 'horizontal', overflow: 'hidden', padding: '16px', minWidth: '220px', position: 'relative' }} title="Arrastra el borde inferior derecho para ajustar el ancho">
                  Última Gestión Realizada
                </div>
              </th>
              <th style={{ fontWeight: '600', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ resize: 'horizontal', overflow: 'hidden', padding: '16px', minWidth: '220px', position: 'relative' }} title="Arrastra el borde inferior derecho para ajustar el ancho">
                  Próxima Gestión / Hito
                </div>
              </th>
              <th style={{ fontWeight: '600', textAlign: 'right', padding: '16px', width: '80px' }}>
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredCasos.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No se encontraron expedientes con los filtros actuales.
                </td>
              </tr>
            ) : (
              filteredCasos.map((caso) => {
                const isUrgente = caso.estadoPlazo === 'URGENTE';
                const isAtencion = caso.estadoPlazo === 'ATENCION';
                
                // Extraer ciudad del tribunal
                const tribunalLower = caso.tribunal ? caso.tribunal.toLowerCase() : "";
                let ciudadInferred = "Ciudad no especificada";
                if (tribunalLower.includes("temuco")) ciudadInferred = "Temuco";
                else if (tribunalLower.includes("santiago")) ciudadInferred = "Santiago";
                else if (tribunalLower.includes("concepcion") || tribunalLower.includes("concepción")) ciudadInferred = "Concepción";
                else if (tribunalLower.includes("valparaiso") || tribunalLower.includes("valparaíso")) ciudadInferred = "Valparaíso";
                else if (tribunalLower.includes("magallanes") || tribunalLower.includes("punta arenas")) ciudadInferred = "Punta Arenas";
                else if (tribunalLower.includes("valdivia")) ciudadInferred = "Valdivia";
                
                // Extraer última gestión desde localStorage (si existe) o fallback
                let ultimaGestion = caso.estadoPlazo === 'URGENTE' ? caso.resumenTeoriaCaso : "Trámite inicial registrado";
                let fechaUltimaGestion = caso.fechaIngreso || "--/--/----";
                try {
                  const gestionesStr = localStorage.getItem(`lexcontrol_gestiones_${caso.id || caso.rit}`);
                  if (gestionesStr) {
                    const gest = JSON.parse(gestionesStr);
                    if (gest && gest.length > 0) {
                      const sorted = gest.sort((a,b) => new Date(b.fecha.split('/').reverse().join('-')) - new Date(a.fecha.split('/').reverse().join('-')));
                      ultimaGestion = sorted[0].titulo || sorted[0].tramite;
                      fechaUltimaGestion = sorted[0].fecha;
                    }
                  }
                } catch(e) {}
                
                const hasLocalFolder = findDiscoFolder(caso) !== null;

                // Próxima gestión / hito y su vencimiento
                let proximaGestion = caso.plazoDescripcion && caso.plazoDescripcion !== "" 
                  ? caso.plazoDescripcion 
                  : (caso.proximaAudiencia || "Sin gestiones pendientes");
                  
                // Extraer fecha explícita del vencimiento (si viene en proximaAudiencia o simulada para la UI)
                let proximaAudienciaStr = caso.proximaAudiencia || "Sin audiencia programada";
                let fechaVencimiento = proximaAudienciaStr !== "Sin audiencia programada" 
                  ? (proximaAudienciaStr.split(' -')[0] || "--/--/----") 
                  : (isUrgente ? "PRÓXIMAS 48H" : "--/--/----");

                return (
                  <tr 
                    key={caso.id || caso.rit}
                    onClick={() => onSelectCaso(caso)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      background: isUrgente ? 'rgba(239, 68, 68, 0.05)' : isAtencion ? 'rgba(245, 158, 11, 0.03)' : 'transparent',
                      borderLeft: isUrgente ? '4px solid var(--alert-red)' : isAtencion ? '4px solid var(--accent-gold)' : '4px solid transparent'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = isUrgente ? 'rgba(239, 68, 68, 0.05)' : isAtencion ? 'rgba(245, 158, 11, 0.03)' : 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', maxWidth: '0', width: '100%' }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isUrgente && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--alert-red)' }}></div>}
                        {!isUrgente && isAtencion && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-gold)' }}></div>}
                        {caso.rit}
                        {!hasLocalFolder && (
                          <span title="Carpeta física no encontrada en disco local" style={{ color: 'var(--alert-red)', marginLeft: '6px' }}>
                            <FolderOpen size={14} />
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={caso.caratula}>
                        {caso.caratula}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: '0', width: '100%' }} title={`${caso.tribunal} - ${ciudadInferred}`}>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{caso.tribunal}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ciudadInferred}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: '0', width: '100%' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{caso.materia}</span>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: '0', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`Fecha: ${fechaUltimaGestion}\nDetalle: ${ultimaGestion}`}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: '600', marginBottom: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fechaUltimaGestion}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ultimaGestion}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: '0', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`Vencimiento: ${fechaVencimiento}\nDetalle: ${proximaGestion}`}>
                      <div style={{ color: isUrgente ? 'var(--alert-red)' : 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: '600', marginBottom: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fechaVencimiento} {isUrgente && <span style={{ marginLeft: '4px' }}>({caso.diasRestantes} D)</span>}
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {proximaGestion}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button 
                        className="btn-gold" 
                        style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMatriz(caso);
                        }}
                        title="Abrir Matriz Probatoria Estratégica"
                      >
                        <Scale size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
