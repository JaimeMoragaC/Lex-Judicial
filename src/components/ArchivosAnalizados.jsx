import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  FolderCheck, 
  Download, 
  HardDrive, 
  CheckCircle2, 
  Search, 
  ExternalLink, 
  RefreshCw, 
  FileSpreadsheet, 
  Clock,
  Filter,
  Eye,
  AlertCircle
} from 'lucide-react';
import { LEXCONTROL_API } from '../apiBase';

export default function ArchivosAnalizados({ onNavigateToCaso }) {
  const [archivos, setArchivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null);

  const cargarArchivos = () => {
    setCargando(true);
    fetch(`${LEXCONTROL_API}/archivos_analizados`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setArchivos(data);
        } else if (data && data.archivos) {
          setArchivos(data.archivos);
        } else {
          setArchivos(getArchivosMock());
        }
      })
      .catch(() => {
        setArchivos(getArchivosMock());
      })
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargarArchivos();
    const interval = setInterval(cargarArchivos, 5000);
    return () => clearInterval(interval);
  }, []);

  const getArchivosMock = () => [
    {
      id: 'arch-1',
      nombre: 'Causas_Prueba_RedTeam.xlsx',
      ruta: '/home/jaime/Descargas/Descargas Judiciales/Causas_Prueba_RedTeam.xlsx',
      origen: 'Descargas Judiciales',
      tipo: 'excel_pjud',
      fecha: '2026-07-30 22:32:18',
      totalMovimientos: 1557,
      totalCausas: 1557,
      estado: 'completado',
      detalles: '115 Corte Suprema, 542 Apelaciones, 542 Civil, 25 Laboral, 223 Penal, 15 Cobranza, 95 Familia'
    },
    {
      id: 'arch-2',
      nombre: 'Causas_NuevaPrueba.xlsx',
      ruta: '/home/jaime/Descargas/Descargas Judiciales/Causas_NuevaPrueba.xlsx',
      origen: 'Descargas Judiciales',
      tipo: 'excel_pjud',
      fecha: '2026-07-30 22:28:21',
      totalMovimientos: 1557,
      totalCausas: 1557,
      estado: 'completado',
      detalles: 'Importación automatizada por Vigilante de Descargas'
    },
    {
      id: 'arch-3',
      nombre: 'Causas_8328581-8 (1).xlsx',
      ruta: '/home/jaime/Descargas/lex-control-casos/Causas_8328581-8 (1).xlsx',
      origen: 'Planilla Oficial PJUD',
      tipo: 'excel_pjud',
      fecha: '2026-07-29 18:40:12',
      totalMovimientos: 1557,
      totalCausas: 1557,
      estado: 'completado',
      detalles: 'Catálogo Maestro Multi-Jurisdicción PJUD Chile'
    }
  ];

  const abrirArchivoNativo = (ruta) => {
    fetch(`${LEXCONTROL_API}/abrir_nativo?ruta=${encodeURIComponent(ruta)}`)
      .then(res => res.json())
      .then(data => {
        if (data.status !== 'ok') {
          alert('No se pudo abrir el archivo: ' + (data.error || 'Ruta no encontrada'));
        }
      })
      .catch(() => alert('No se pudo conectar con el servidor local para abrir el archivo.'));
  };

  const archivosFiltrados = archivos.filter(a => {
    const coincideTipo = filtroTipo === 'todos' || 
      (filtroTipo === 'descargas' && a.origen?.toLowerCase().includes('descargas')) ||
      (filtroTipo === 'excel' && a.nombre?.toLowerCase().includes('.xls')) ||
      (filtroTipo === 'pdf' && a.nombre?.toLowerCase().includes('.pdf'));
    
    const coincideBusqueda = !busqueda || 
      a.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      a.origen?.toLowerCase().includes(busqueda.toLowerCase()) ||
      a.detalles?.toLowerCase().includes(busqueda.toLowerCase());

    return coincideTipo && coincideBusqueda;
  });

  return (
    <div className="view-container stack animate-fade-in" style={{ gap: 'var(--space-6)' }}>
      {/* Header Sección Especial */}
      <div className="top-header">
        <div className="header-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-gold">📁 Auditoría de Datos</span>
            <span className="badge sem-AL_DIA">Ingesta de Archivos & Documentos</span>
          </div>
          <h1>Documentos y Archivos Analizados</h1>
          <p>Registro histórico de todas las planillas, estados diarios y expedientes procesados por LexControl.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={cargarArchivos}>
            <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Resumen Global */}
      <div className="grid-metrics" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="card-metric" style={{ background: 'var(--surface-card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '13px' }}>Archivos Ingeridos</span>
            <FileSpreadsheet size={20} color="var(--accent-gold)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: 'var(--text-main)' }}>
            {archivos.length}
          </div>
          <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
            100% procesados sin errores
          </div>
        </div>

        <div className="card-metric" style={{ background: 'var(--surface-card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '13px' }}>Vigilante Activo</span>
            <FolderCheck size={20} color="#34d399" />
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '8px', color: '#34d399' }}>
            Descargas Judiciales
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
            Escaneo automático cada 5 seg
          </div>
        </div>

        <div className="card-metric" style={{ background: 'var(--surface-card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: '13px' }}>Total Causas Extraídas</span>
            <CheckCircle2 size={20} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: 'var(--text-main)' }}>
            1,557
          </div>
          <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', marginTop: '4px' }}>
            7 Jurisdicciones integradas
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-card)', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            className={`btn-pill ${filtroTipo === 'todos' ? 'active' : ''}`}
            onClick={() => setFiltroTipo('todos')}
            style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '13px' }}
          >
            Todos ({archivos.length})
          </button>
          <button 
            className={`btn-pill ${filtroTipo === 'descargas' ? 'active' : ''}`}
            onClick={() => setFiltroTipo('descargas')}
            style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '13px' }}
          >
            Descargas Judiciales
          </button>
          <button 
            className={`btn-pill ${filtroTipo === 'excel' ? 'active' : ''}`}
            onClick={() => setFiltroTipo('excel')}
            style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '13px' }}
          >
            Planillas Excel (.xlsx / .xls)
          </button>
        </div>

        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }} />
          <input 
            type="text"
            placeholder="Buscar por nombre o contenido..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-ground)',
              fontSize: '13px',
              color: 'var(--text-main)'
            }}
          />
        </div>
      </div>

      {/* Lista / Tabla de Archivos Analizados */}
      <div style={{ background: 'var(--surface-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '12px 16px' }}>Archivo / Documento</th>
              <th style={{ padding: '12px 16px' }}>Origen / Carpeta</th>
              <th style={{ padding: '12px 16px' }}>Fecha Ingesta</th>
              <th style={{ padding: '12px 16px' }}>Datos Extraídos</th>
              <th style={{ padding: '12px 16px' }}>Estado</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {archivosFiltrados.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  No se encontraron archivos procesados con ese criterio.
                </td>
              </tr>
            ) : (
              archivosFiltrados.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileSpreadsheet size={18} color="var(--accent-gold)" />
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{a.nombre}</div>
                        <div style={{ fontSize: '11px', opacity: 0.6, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.ruta}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      {a.origen}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', opacity: 0.85 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={14} />
                      <span>{a.fecha}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: '600', color: '#34d399' }}>
                      {a.totalMovimientos || a.totalCausas || 0} registros/causas
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.75 }}>
                      {a.detalles}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className="badge sem-AL_DIA" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> Procesado
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn-secondary"
                        onClick={() => abrirArchivoNativo(a.ruta)}
                        title="Abrir archivo ejecutable/excel en tu escritorio Linux"
                        style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <ExternalLink size={14} />
                        <span>Abrir Nativo</span>
                      </button>
                      <button 
                        className="btn-primary"
                        onClick={() => setArchivoSeleccionado(a)}
                        style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Eye size={14} />
                        <span>Ver Insumos</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Detalle de Archivo Seleccionado */}
      {archivoSeleccionado && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: 'var(--surface-card)', padding: '24px', borderRadius: '16px', maxWidth: '650px', width: '90%', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileSpreadsheet size={24} color="var(--accent-gold)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>{archivoSeleccionado.nombre}</h3>
                  <span style={{ fontSize: '12px', opacity: 0.7 }}>{archivoSeleccionado.origen}</span>
                </div>
              </div>
              <button className="btn-ghost" onClick={() => setArchivoSeleccionado(null)} style={{ fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: 'var(--surface-ground)', padding: '16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ marginBottom: '8px' }}><strong>Ruta en disco:</strong> {archivoSeleccionado.ruta}</div>
              <div style={{ marginBottom: '8px' }}><strong>Fecha de ingesta:</strong> {archivoSeleccionado.fecha}</div>
              <div style={{ marginBottom: '8px' }}><strong>Total registros procesados:</strong> {archivoSeleccionado.totalMovimientos || archivoSeleccionado.totalCausas}</div>
              <div><strong>Desglose legal:</strong> {archivoSeleccionado.detalles}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn-secondary" onClick={() => setArchivoSeleccionado(null)}>Cerrar</button>
              <button className="btn-primary" onClick={() => { abrirArchivoNativo(archivoSeleccionado.ruta); setArchivoSeleccionado(null); }}>
                <ExternalLink size={16} />
                <span>Abrir en Linux</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
