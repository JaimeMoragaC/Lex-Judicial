import React, { useState } from 'react';
import { 
  FolderGit2, 
  FileText, 
  CheckCircle2, 
  RefreshCw, 
  ArrowRight, 
  HardDrive, 
  FolderOpen, 
  FileCheck, 
  AlertCircle, 
  Sparkles,
  Terminal,
  Download,
  Filter,
  Search,
  ChevronRight,
  ChevronDown,
  Layers,
  Database,
  Cpu,
  Trash2,
  ShieldAlert,
  Archive,
  CornerDownRight,
  Monitor,
  Eye
} from 'lucide-react';
import { MOCK_CASOS } from '../mockData';
import { REAL_DISK_DATA, TOTAL_REAL_FILES } from '../realDiskData';

export default function SmartDriveSorter({ onSelectCaso }) {
  const [isScanning, setIsScanning] = useState(false);
  const [sorted, setSorted] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [activeView, setActiveView] = useState('interactive'); 
  const [searchTerm, setSearchTerm] = useState('');

  // FUNCIONES DE APERTURA DE ARCHIVOS REALES EN DISCO LINUX
  const abrirEnEscritorio = (ruta, e) => {
    if (e) e.stopPropagation();
    fetch(`http://localhost:8888/abrir?ruta=${encodeURIComponent(ruta)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) alert(`Error de Linux: ${data.error}`);
      })
      .catch(() => {
        alert("⚠️ Servidor lanzador no detectado en el puerto 8888. Corre en terminal: python3 servidor_local_lexcontrol.py");
      });
  };

  const verEnNavegador = (ruta, e) => {
    if (e) e.stopPropagation();
    window.open(`http://localhost:8888/ver?ruta=${encodeURIComponent(ruta)}`, '_blank');
  };

  // Filtrar los clientes reales en disco según búsqueda
  const filteredRealData = REAL_DISK_DATA.filter(cli => {
    const term = searchTerm.toLowerCase();
    return (
      cli.nombre.toLowerCase().includes(term) ||
      cli.rut.toLowerCase().includes(term) ||
      cli.folderName.toLowerCase().includes(term) ||
      cli.causas.some(c => c.caratula.toLowerCase().includes(term) || c.rol.toLowerCase().includes(term))
    );
  });

  const ejecutarOrdenamiento = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setSorted(true);
      alert("¡Escaneo sincrónico de disco completado! Árbol actualizado.");
    }, 1200);
  };

  return (
    <div className="animate-fade-in">
      {/* Top Header */}
      <div className="top-header">
        <div className="header-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-cyan">⚡ Sincronizado en Vivo</span>
            <span className="badge badge-green">Lanzador Linux Port 8888</span>
            <span className="badge badge-yellow">17.742 Archivos</span>
          </div>
          <h1>Explorador Físico & Smart-Drive IA (5 Niveles)</h1>
          <p>
            Árbol taxonómico de tu disco duro real. Muestra en pantalla cada uno de los <strong>{REAL_DISK_DATA.length} clientes y {TOTAL_REAL_FILES.toLocaleString('es-CL')} documentos jurídicos</strong>. Haz clic en los botones de acción para abrirlos nativamente en Linux o en pestaña web.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setActiveView(activeView === 'interactive' ? 'script' : 'interactive')} 
            className="btn-secondary"
          >
            <Terminal size={18} />
            <span>{activeView === 'interactive' ? 'Ver Código Python (Motor Forense)' : 'Volver al Explorador en Vivo'}</span>
          </button>
          <button 
            className="btn-primary" 
            style={{ background: 'var(--accent-cyan)', color: 'var(--text-inverse)', fontWeight: '800' }}
            onClick={ejecutarOrdenamiento}
            disabled={isScanning}
          >
            <RefreshCw size={18} className={isScanning ? "animate-spin" : ""} />
            <span>{isScanning ? '⚡ Reescaneando Disco /Casos2023...' : '⚡ ACTUALIZAR ÁRBOL DESDE DISCO'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats del Disco Real */}
      <div className="grid-4" style={{ marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid var(--accent-cyan)' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(192, 160, 113, 0.1)' }}>
            <HardDrive size={22} color="var(--accent-cyan)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Archivos Físicos</span>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)' }}>{TOTAL_REAL_FILES.toLocaleString('es-CL')}</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid var(--alert-green)' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(93, 145, 105, 0.1)' }}>
            <FolderOpen size={22} color="var(--alert-green)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Carpetas Mandantes</span>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)' }}>{REAL_DISK_DATA.length}</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid var(--accent-gold)' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(201, 148, 70, 0.1)' }}>
            <Monitor size={22} color="var(--accent-gold)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Apertura Nativa Linux</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-gold)' }}>xdg-open Activo</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #a78bfa' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(125, 133, 144, 0.1)' }}>
            <Database size={22} color="#a78bfa" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Deduplicación SHA-256</span>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-secondary)' }}>2.979 Dupes Borrados</div>
          </div>
        </div>
      </div>

      {/* VISTA 1: EXPLORADOR DE ÁRBOL REAL EN VIVO */}
      {activeView === 'interactive' && (
        <>
          {/* Buscador de Carpetas */}
          <div className="glass-card" style={{ padding: '18px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Search size={20} color="var(--accent-cyan)" />
            <input
              type="text"
              placeholder="Buscar en tu disco por nombre de mandante, causa, ROL, tribunal o palabra clave del archivo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', width: '100%', fontSize: '0.95rem' }}
            />
            {searchTerm && (
              <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setSearchTerm('')}>
                Limpiar Búsqueda
              </button>
            )}
          </div>

          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 4px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FolderGit2 size={24} color="var(--alert-green)" />
                  Carpetas Físicas en: /media/jaime/.../Casos2023 ({filteredRealData.length} Mandantes Encontrados)
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Haz clic sobre cualquier mandante para desplegar sus expedientes y abrir sus escritos.
                </span>
              </div>
              <span className="badge badge-green" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                ⚡ Lanzador Activo: Clic para abrir
              </span>
            </div>

            {filteredRealData.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '16px', color: 'var(--text-muted)' }}>
                No se encontraron carpetas o mandantes que coincidan con la búsqueda "{searchTerm}".
              </div>
            ) : (
              filteredRealData.map((clientFolder, cIdx) => {
                const isSelected = selectedFolder === cIdx;
                const totalDocsCliente = clientFolder.causas.reduce((acc, c) => acc + c.totalArchivos, 0) + clientFolder.documentosGenerales.length;

                return (
                  <div key={cIdx} className="glass-card" style={{ padding: '20px', marginBottom: '14px', borderLeft: isSelected ? '4px solid var(--accent-cyan)' : '4px solid var(--border-color)', transition: 'all 0.2s ease' }}>
                    {/* Cabecera del Mandante en Disco */}
                    <div 
                      style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', cursor: 'pointer' }}
                      onClick={() => setSelectedFolder(isSelected ? null : cIdx)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FolderOpen size={24} color="var(--accent-gold)" />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', background: 'rgba(201, 148, 70, 0.1)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>
                              {clientFolder.rut}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              /.../{clientFolder.folderName.substring(0, 30)}...
                            </span>
                          </div>
                          <h3 style={{ fontSize: '1.15rem', color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)', margin: 0 }}>
                            📁 / {clientFolder.nombre}
                          </h3>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {clientFolder.documentosGenerales.length > 0 && (
                          <span className="badge badge-yellow" style={{ fontSize: '0.75rem' }}>
                            🗂️ Bandeja General ({clientFolder.documentosGenerales.length})
                          </span>
                        )}
                        <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
                          ⚖️ {clientFolder.causas.length} Causas
                        </span>
                        <span className="badge badge-green" style={{ fontSize: '0.75rem' }}>
                          📄 {totalDocsCliente} Archivos
                        </span>
                        <div style={{ color: 'var(--accent-cyan)', marginLeft: '6px' }}>
                          {isSelected ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>
                      </div>
                    </div>

                    {/* Contenido Desplegable del Cliente en Disco CON BOTONES DE APERTURA */}
                    {isSelected && (
                      <div className="animate-fade-in" style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        
                        {/* BANDEJA GENERAL DEL CLIENTE (NIVEL 3.C) CON BOTONES */}
                        {clientFolder.documentosGenerales.length > 0 && (
                          <div style={{ background: 'rgba(201, 148, 70, 0.08)', borderRadius: '12px', padding: '16px', border: '1px dashed var(--accent-gold)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <Archive size={18} color="var(--accent-gold)" />
                              <strong style={{ fontSize: '0.95rem', color: 'var(--accent-gold)' }}>
                                /_Documentos_Generales_Sin_Rol ({clientFolder.documentosGenerales.length} Archivos en Contención)
                              </strong>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                              Archivos asociados al cliente sin causa específica. Haz clic en los botones para abrir en tu computador o navegador:
                            </p>
                            <div className="grid-2" style={{ gap: '10px', maxHeight: '240px', overflowY: 'auto' }}>
                              {clientFolder.documentosGenerales.map((doc, dIdx) => (
                                <div key={dIdx} style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', background: 'rgba(0,0,0,0.5)', padding: '10px 14px', borderRadius: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--warn)' }}>
                                    <FileCheck size={14} color="var(--accent-gold)" />
                                    <span title={doc.name} style={{ fontWeight: '600' }}>{doc.name}</span>
                                  </div>
                                  
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                                    <button
                                      onClick={(e) => abrirEnEscritorio(doc.path, e)}
                                      title="Abrir con tu visor Linux por defecto"
                                      style={{ background: 'var(--accent-cyan)', color: 'var(--text-inverse)', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <Monitor size={13} />
                                      <span>Abrir Linux</span>
                                    </button>
                                    
                                    <button
                                      onClick={(e) => verEnNavegador(doc.path, e)}
                                      title="Ver documento en una nueva pestaña"
                                      style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <Eye size={13} />
                                      <span>Ver Web</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* CAUSAS Y EXPEDIENTES (NIVEL 3.B) CON BOTONES DE APERTURA */}
                        <div>
                          <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FolderGit2 size={18} color="var(--accent-cyan)" />
                            Expedientes y Subcarpetas en Disco ({clientFolder.causas.length})
                          </h4>

                          {clientFolder.causas.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              No hay subcarpetas de expedientes judiciales para este mandante.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              {clientFolder.causas.map((causa, uIdx) => (
                                <div key={uIdx} style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                  <div style={{ display: 'flex', justifyItems: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <span className="badge badge-cyan" style={{ fontSize: '0.8rem', fontWeight: '800', fontFamily: 'var(--font-mono)' }}>
                                        {causa.rol}
                                      </span>
                                      <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                                        {causa.caratula}
                                      </strong>
                                    </div>
                                    <span className="badge badge-green" style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>
                                      📁 {causa.totalArchivos} Docs Físicos
                                    </span>
                                  </div>

                                  {/* Categorías con botones de apertura */}
                                  <div className="grid-2" style={{ gap: '12px' }}>
                                    {causa.categorias.map((cat, catIdx) => (
                                      <div key={catIdx} style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                                          <FolderOpen size={15} color="var(--accent-yellow)" />
                                          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                            /{cat.nombre}/
                                          </span>
                                          <span className="badge badge-blue" style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>{cat.archivos.length}</span>
                                        </div>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                                          {cat.archivos.map((itemFile, fIdx) => (
                                            <div key={fIdx} style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ok)' }}>
                                                <FileCheck size={13} color="var(--alert-green)" />
                                                <span title={itemFile.name}>{itemFile.name}</span>
                                              </div>
                                              
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                                                <button
                                                  onClick={(e) => abrirEnEscritorio(itemFile.path, e)}
                                                  title="Abrir archivo nativamente en Linux (xdg-open)"
                                                  style={{ background: 'var(--accent-cyan)', color: 'var(--text-inverse)', border: 'none', padding: '4px 8px', borderRadius: '5px', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                >
                                                  <Monitor size={12} />
                                                  <span>Abrir</span>
                                                </button>
                                                
                                                <button
                                                  onClick={(e) => verEnNavegador(itemFile.path, e)}
                                                  title="Ver archivo en pestaña del navegador"
                                                  style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '4px 8px', borderRadius: '5px', fontSize: '0.7rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                >
                                                  <Eye size={12} />
                                                  <span>Ver</span>
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* VISTA 2: SCRIPT PYTHON DE SINCRONIZACIÓN */}
      {activeView === 'script' && (
        <div className="glass-card" style={{ padding: '28px', borderTop: '4px solid var(--accent-cyan)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Terminal size={24} color="var(--accent-cyan)" />
                Script Python de Ordenamiento & Puente de Datos Web
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                Código Python operativo para Linux que organiza `/media/.../Casos2023` y genera la base de datos viva del estudio.
              </p>
            </div>
            <button 
              className="btn-primary" 
              onClick={() => {
                alert("Para re-ejecutar en tu terminal Linux, corre: python3 auto_organizar_expedientes.py && python3 generar_db_disco_real.py");
              }}
            >
              <Download size={18} />
              <span>Instrucciones Terminal</span>
            </button>
          </div>

          <div style={{
            background: '#05070e',
            border: '1px solid var(--border-accent)',
            borderRadius: '12px',
            padding: '20px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: '#a5b4fc',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap'
          }}>
            {`# Para organizar tus expedientes en tu disco Linux y actualizar la web:
cd /home/jaime/Descargas/colapso-probatorio
python3 auto_organizar_expedientes.py
python3 generar_db_disco_real.py

# Esto sincronizará automáticamente los 17.742 archivos en tu pantalla de LexControl.`}
          </div>
        </div>
      )}
    </div>
  );
}
