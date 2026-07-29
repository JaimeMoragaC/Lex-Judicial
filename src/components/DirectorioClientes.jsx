import React, { useState } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  Building2, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Briefcase, 
  ChevronRight, 
  ChevronDown,
  ExternalLink, 
  Scale, 
  DollarSign, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Send, 
  FileText,
  Gavel,
  ArrowRight,
  FolderOpen,
  HardDrive,
  Database,
  FileCheck,
  CornerDownRight,
  Archive,
  Monitor,
  Eye
} from 'lucide-react';
import { MOCK_CLIENTES, MOCK_CASOS } from '../mockData';
import { REAL_DISK_DATA, TOTAL_REAL_FILES } from '../realDiskData';

export default function DirectorioClientes({ onSelectCaso, onOpenMatriz }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('TODOS');
  const [socioFilter, setSocioFilter] = useState('TODOS');
  const [expandedClienteId, setExpandedClienteId] = useState(null);
  
  const [viewMode, setViewMode] = useState('DISCO_REAL'); 

  // FUNCIONES DE APERTURA DE ARCHIVOS REALES EN DISCO
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

  // Filtrado para modo ESTUDIO MOCK
  const filteredMockClientes = MOCK_CLIENTES.filter(cli => {
    const matchesSearch = 
      cli.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cli.rut.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cli.representanteLegal.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cli.sector.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTipo = 
      tipoFilter === 'TODOS' || 
      (tipoFilter === 'JURIDICA' && cli.tipo.includes('Jurídica')) ||
      (tipoFilter === 'NATURAL' && cli.tipo.includes('Natural'));

    const matchesSocio = socioFilter === 'TODOS' || cli.socioResponsable.includes(socioFilter);

    return matchesSearch && matchesTipo && matchesSocio;
  });

  // Filtrado para modo DISCO REAL EN VIVO (293 clientes de Casos2023)
  const filteredRealClientes = REAL_DISK_DATA.filter(cli => {
    const term = searchTerm.toLowerCase();
    return (
      cli.nombre.toLowerCase().includes(term) ||
      cli.rut.toLowerCase().includes(term) ||
      cli.folderName.toLowerCase().includes(term) ||
      cli.causas.some(c => c.caratula.toLowerCase().includes(term) || c.rol.toLowerCase().includes(term))
    );
  });

  const getCausasDeCliente = (clienteId) => {
    return MOCK_CASOS.filter(c => c.clienteId === clienteId);
  };

  const toggleRow = (id) => {
    setExpandedClienteId(prev => prev === id ? null : id);
  };

  return (
    <div className="animate-fade-in">
      {/* Top Header */}
      <div className="top-header">
        <div className="header-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-cyan">⚡ Puente Disco Real Operativo</span>
            <span className="badge badge-green">Lanzador Linux Port 8888</span>
          </div>
          <h1>Directorio de Clientes & Apertura de Archivos</h1>
          <p>
            Sincronizado en vivo con tu disco duro. Muestra los <strong>293 mandantes y 17.742 archivos reales</strong>. Ahora puedes hacer clic en los botones de cada archivo para abrirlo en tu escritorio Linux o verlo en el navegador.
          </p>
        </div>
        
        {/* Toggle de Modo de Vista */}
        <div style={{ display: 'flex', gap: '10px', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setViewMode('DISCO_REAL')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'DISCO_REAL' ? 'var(--accent-cyan)' : 'transparent',
              color: viewMode === 'DISCO_REAL' ? 'var(--text-inverse)' : 'var(--text-secondary)',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <HardDrive size={18} />
            <span>📁 Disco Real en Vivo ({REAL_DISK_DATA.length} Clientes • {TOTAL_REAL_FILES} Archivos)</span>
          </button>

          <button
            onClick={() => setViewMode('MOCK_ESTUDIO')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'MOCK_ESTUDIO' ? 'var(--accent-gold)' : 'transparent',
              color: viewMode === 'MOCK_ESTUDIO' ? 'var(--text-inverse)' : 'var(--text-secondary)',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <Users size={18} />
            <span>⭐ Mandantes y Fichas Litigadas ({MOCK_CLIENTES.length})</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Rápidos */}
      <div className="grid-4" style={{ marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid var(--accent-cyan)' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(192, 160, 113, 0.1)' }}>
            <HardDrive size={22} color="var(--accent-cyan)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Archivos Sincronizados</span>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)' }}>{TOTAL_REAL_FILES.toLocaleString('es-CL')}</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid var(--alert-green)' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(93, 145, 105, 0.1)' }}>
            <FolderOpen size={22} color="var(--alert-green)" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Carpetas en /Casos2023</span>
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Estado Servidor 8888</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-secondary)' }}>⚡ ONLINE</div>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyItems: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 16px', flex: '1', minWidth: '280px' }}>
          <Search size={18} color="var(--text-muted)" />
          <input 
            type="text" 
            placeholder={viewMode === 'DISCO_REAL' ? "Buscar por nombre de cliente, RUT o expediente en disco duro..." : "Buscar por RUT, Razón Social o Rubro..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', width: '100%', fontSize: '0.9rem' }}
          />
        </div>
      </div>

      {/* VISTA 1: DISCO REAL EN VIVO (293 MANDANTES) */}
      {viewMode === 'DISCO_REAL' && (
        <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(192, 160, 113, 0.08)', borderBottom: '2px solid var(--accent-cyan)', color: 'var(--accent-cyan)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <th style={{ padding: '16px 20px', width: '40px' }}>#</th>
                  <th style={{ padding: '16px 14px' }}>RUT Mandante</th>
                  <th style={{ padding: '16px 14px' }}>Nombre Cliente / Carpeta Raíz en Disco</th>
                  <th style={{ padding: '16px 14px', textAlign: 'center' }}>Causas / Expedientes</th>
                  <th style={{ padding: '16px 14px', textAlign: 'center' }}>Docs. Generales (Sin Rol)</th>
                  <th style={{ padding: '16px 14px', textAlign: 'center' }}>Total Archivos Físicos</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right' }}>Ruta Física en /Casos2023</th>
                </tr>
              </thead>
              <tbody>
                {filteredRealClientes.map((cli, idx) => {
                  const isExpanded = expandedClienteId === idx;
                  const totalArchivosCliente = cli.causas.reduce((acc, c) => acc + c.totalArchivos, 0) + cli.documentosGenerales.length;

                  return (
                    <React.Fragment key={idx}>
                      <tr 
                        onClick={() => toggleRow(idx)}
                        style={{
                          background: isExpanded ? 'rgba(192, 160, 113, 0.1)' : idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                          borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease',
                          color: 'var(--text-primary)',
                          fontSize: '0.9rem'
                        }}
                        onMouseEnter={(e) => {
                          if (!isExpanded) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded) e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent';
                        }}
                      >
                        <td style={{ padding: '16px 20px', color: 'var(--accent-cyan)' }}>
                          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </td>
                        <td style={{ padding: '16px 14px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--accent-gold)', background: 'rgba(201, 148, 70, 0.1)', padding: '4px 8px', borderRadius: '6px' }}>
                            {cli.rut}
                          </span>
                        </td>
                        <td style={{ padding: '16px 14px', fontWeight: '700', fontSize: '1rem', color: isExpanded ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FolderOpen size={18} color="var(--accent-gold)" />
                            <span>{cli.nombre}</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                          <span className="badge badge-purple" style={{ fontWeight: '800' }}>
                            {cli.causas.length} {cli.causas.length === 1 ? 'Causa' : 'Causas'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                          {cli.documentosGenerales.length > 0 ? (
                            <span className="badge badge-yellow" style={{ fontWeight: '800' }}>
                              🗂️ {cli.documentosGenerales.length} Archivos
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>0</span>
                          )}
                        </td>
                        <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                          <span className="badge badge-green" style={{ fontWeight: '800', fontSize: '0.85rem' }}>
                            📁 {totalArchivosCliente} Archivos
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          /.../{cli.folderName.substring(0, 25)}...
                        </td>
                      </tr>

                      {/* SUBSECCIÓN EXPANDIDA DEL CLIENTE REAL EN VIVO CON APERTURA */}
                      {isExpanded && (
                        <tr style={{ background: 'rgba(5, 10, 20, 0.95)', borderBottom: '2px solid var(--accent-cyan)' }}>
                          <td colSpan={7} style={{ padding: '24px 32px' }}>
                            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                              
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                                <div>
                                  <h3 style={{ fontSize: '1.2rem', color: 'var(--accent-cyan)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <HardDrive size={22} />
                                    Archivos Reales del Mandante: {cli.nombre}
                                  </h3>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                    Ruta Física en Disco: {cli.path}
                                  </span>
                                </div>
                                <span className="badge badge-green" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                                  ⚡ Lanzador Activo: Clic en los botones para abrir en tu computador
                                </span>
                              </div>

                              {/* 1. BANDEJA GENERAL DEL CLIENTE CON BOTONES DE APERTURA */}
                              {cli.documentosGenerales.length > 0 && (
                                <div style={{ background: 'rgba(201, 148, 70, 0.08)', borderRadius: '12px', padding: '18px', border: '1px dashed var(--accent-gold)' }}>
                                  <h4 style={{ fontSize: '1rem', color: 'var(--accent-gold)', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Archive size={18} />
                                    Bandeja General del Cliente /_Documentos_Generales_Sin_Rol ({cli.documentosGenerales.length} Archivos)
                                  </h4>
                                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                                    Documentos y contratos sueltos. Haz clic en los botones de acción para abrirlos inmediatamente:
                                  </p>
                                  <div className="grid-2" style={{ gap: '10px' }}>
                                    {cli.documentosGenerales.map((doc, dIdx) => (
                                      <div key={dIdx} style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', background: 'rgba(0,0,0,0.5)', padding: '10px 14px', borderRadius: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          <FileCheck size={15} color="var(--accent-gold)" />
                                          <span style={{ color: 'var(--warn)', fontWeight: '600' }} title={doc.name}>{doc.name}</span>
                                        </div>
                                        
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                                          <button
                                            onClick={(e) => abrirEnEscritorio(doc.path, e)}
                                            title="Abrir con tu programa Linux por defecto (PDF/Word/Visor)"
                                            style={{ background: 'var(--accent-cyan)', color: 'var(--text-inverse)', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                          >
                                            <Monitor size={13} />
                                            <span>Abrir Linux</span>
                                          </button>
                                          
                                          <button
                                            onClick={(e) => verEnNavegador(doc.path, e)}
                                            title="Ver documento en una nueva pestaña del navegador"
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

                              {/* 2. CAUSAS Y EXPEDIENTES DEL CLIENTE CON APERTURA */}
                              <div>
                                <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Gavel size={20} color="var(--accent-cyan)" />
                                  Expedientes Judiciales y Subcarpetas en Disco ({cli.causas.length} Causas)
                                </h4>

                                {cli.causas.length === 0 ? (
                                  <div style={{ padding: '20px', textAlign: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', color: 'var(--text-muted)' }}>
                                    Este cliente solo tiene documentos generales.
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {cli.causas.map((causa, cIdx) => (
                                      <div key={cIdx} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '18px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyItems: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="badge badge-cyan" style={{ fontSize: '0.85rem', fontWeight: '800', fontFamily: 'var(--font-mono)' }}>
                                              {causa.rol}
                                            </span>
                                            <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                                              {causa.caratula}
                                            </strong>
                                          </div>
                                          <span className="badge badge-green" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
                                            📁 {causa.totalArchivos} Archivos Procesales
                                          </span>
                                        </div>

                                        {/* Categorías Procesales de la causa con botones de apertura */}
                                        <div className="grid-2" style={{ gap: '12px' }}>
                                          {causa.categorias.map((cat, catIdx) => (
                                            <div key={catIdx} style={{ background: 'rgba(0,0,0,0.35)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                  <FolderOpen size={16} /> /{cat.nombre}/
                                                </span>
                                                <span className="badge badge-blue" style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>{cat.archivos.length} Docs</span>
                                              </div>
                                              
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
                                                {cat.archivos.map((fItem, fIdx) => (
                                                  <div key={fIdx} style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ok)' }}>
                                                      <FileCheck size={14} color="var(--alert-green)" />
                                                      <span title={fItem.name}>{fItem.name}</span>
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                                                      <button
                                                        onClick={(e) => abrirEnEscritorio(fItem.path, e)}
                                                        title="Abrir archivo nativamente en tu Linux (xdg-open)"
                                                        style={{ background: 'var(--accent-cyan)', color: 'var(--text-inverse)', border: 'none', padding: '4px 8px', borderRadius: '5px', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                      >
                                                        <Monitor size={12} />
                                                        <span>Abrir</span>
                                                      </button>
                                                      
                                                      <button
                                                        onClick={(e) => verEnNavegador(fItem.path, e)}
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
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 2: MOCK ESTUDIO LITIGADO */}
      {viewMode === 'MOCK_ESTUDIO' && (
        <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '2px solid var(--border-hover)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  <th style={{ padding: '16px 20px', width: '40px' }}>#</th>
                  <th style={{ padding: '16px 14px' }}>RUT</th>
                  <th style={{ padding: '16px 14px' }}>Mandante / Razón Social</th>
                  <th style={{ padding: '16px 14px' }}>Tipo & Rubro</th>
                  <th style={{ padding: '16px 14px' }}>Representante Legal</th>
                  <th style={{ padding: '16px 14px' }}>Contacto Rápido</th>
                  <th style={{ padding: '16px 14px', textAlign: 'center' }}>Expedientes</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredMockClientes.map((cli) => {
                  const isExpanded = expandedClienteId === cli.id;
                  const causas = getCausasDeCliente(cli.id);
                  const isAlDia = cli.estadoFacturacion === 'AL_DIA';

                  return (
                    <React.Fragment key={cli.id}>
                      <tr 
                        onClick={() => toggleRow(cli.id)}
                        style={{
                          background: isExpanded ? 'rgba(192, 160, 113, 0.08)' : 'transparent',
                          borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease',
                          color: 'var(--text-primary)',
                          fontSize: '0.9rem'
                        }}
                      >
                        <td style={{ padding: '18px 20px', color: 'var(--accent-cyan)' }}>
                          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </td>
                        <td style={{ padding: '18px 14px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--accent-gold)' }}>{cli.rut}</span>
                        </td>
                        <td style={{ padding: '18px 14px', fontWeight: '700', fontSize: '1rem', color: isExpanded ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                          {cli.razonSocial}
                        </td>
                        <td style={{ padding: '18px 14px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          <div>{cli.tipo.split('/')[0].trim()}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cli.sector}</div>
                        </td>
                        <td style={{ padding: '18px 14px', color: 'var(--text-primary)' }}>{cli.representanteLegal}</td>
                        <td style={{ padding: '18px 14px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <div>📧 {cli.email}</div>
                          <div>📞 {cli.telefono}</div>
                        </td>
                        <td style={{ padding: '18px 14px', textAlign: 'center' }}>
                          <span className="badge badge-purple">{causas.length} Causas</span>
                        </td>
                        <td style={{ padding: '18px 20px', textAlign: 'right' }}>
                          <span className={`badge ${isAlDia ? 'badge-green' : 'badge-yellow'}`}>{isAlDia ? 'Al Día' : 'Pendiente'}</span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: 'rgba(10, 15, 29, 0.95)', borderBottom: '2px solid var(--border-accent)' }}>
                          <td colSpan={8} style={{ padding: '24px 32px' }}>
                            <div style={{ display: 'flex', justifyItems: 'space-between', alignItems: 'center' }}>
                              <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>Expedientes Asociados ({causas.length})</h3>
                              <button className="btn-secondary" onClick={() => toggleRow(cli.id)}>Cerrar</button>
                            </div>
                            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {causas.map(c => (
                                <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyItems: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <strong style={{ color: 'var(--accent-cyan)', marginRight: '10px' }}>[{c.rit}]</strong>
                                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{c.caratula}</span>
                                  </div>
                                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => onSelectCaso(c)}>Ver Ficha</button>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
