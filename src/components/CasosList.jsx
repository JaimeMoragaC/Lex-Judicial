import React, { useEffect, useMemo, useState } from 'react';
import { Search, FolderGit2, Scale, FolderOpen, Trash2 } from 'lucide-react';

import { MOCK_CASOS } from '../mockData';
import { findDiscoFolder } from '../utils/folderMatcher';
import { cargarExpedientes, cargarCausasPjud, eliminarExpediente } from '../utils/expedientes';
import { normalizarFechaIso } from '../utils/radarPlazos.js';

const FILTROS = {
  vigencia: [
    ['TODAS', 'Estado: todos'],
    ['VIGENTES', 'Vigentes / en trámite'],
    ['FINALIZADOS', 'Finalizados / fallados']
  ],
  ciudad: [
    ['TODAS', 'Ciudad: todas'],
    ['Temuco', 'Temuco / IX Región'],
    ['Santiago', 'Santiago / RM'],
    ['Concepción', 'Concepción / Biobío'],
    ['Valparaíso', 'Valparaíso / V Región'],
    ['Punta Arenas', 'Punta Arenas / Magallanes'],
    ['Puerto Montt', 'Puerto Montt / Los Lagos'],
    ['Coyhaique', 'Coyhaique / Aysén'],
    ['Valdivia', 'Valdivia / Los Ríos'],
    ['La Serena', 'La Serena / Coquimbo'],
    ['Antofagasta', 'Antofagasta / II Región']
  ],
  tribunal: [
    ['TODAS', 'Tribunal: todos'],
    ['Corte Suprema', 'Corte Suprema'],
    ['Corte Apelaciones', 'Corte de Apelaciones'],
    ['Civil', 'Juzgados civiles'],
    ['Penal', 'Garantía / TOP / penal'],
    ['Laboral', 'Juzgados laborales'],
    ['Familia', 'Juzgados de familia'],
    ['Cobranza', 'Juzgados de cobranza'],
    ['Arbitraje', 'Arbitraje CAM']
  ],
  materia: [
    ['TODAS', 'Materia: todas'],
    ['Penal', 'Derecho penal'],
    ['Civil', 'Civil / patrimonial'],
    ['Laboral', 'Derecho laboral'],
    ['Arbitraje', 'Arbitraje CAM']
  ],
  etapa: [
    ['TODAS', 'Etapa: todas'],
    ['Investigación', 'Investigación / garantía'],
    ['Juicio Oral', 'Juicio oral'],
    ['Probatorio', 'Término probatorio'],
    ['Preparatoria', 'Preparatoria / discusión'],
    ['Fallada', 'Fallada / terminado'],
    ['Tramitación', 'En tramitación / relación']
  ]
};

// Sinónimos por ciudad: el tribunal casi nunca dice la ciudad tal cual.
const ALIAS_CIUDAD = {
  'punta arenas': ['punta arenas', 'magallanes'],
  santiago: ['santiago', 'rm', 'metropolitana'],
  concepción: ['concepción', 'concepcion', 'biobío', 'biobio'],
  valparaíso: ['valparaíso', 'valparaiso', 'viña'],
  valdivia: ['valdivia', 'los ríos', 'los rios'],
  coyhaique: ['coyhaique', 'aysén', 'aysen']
};

const CIUDADES_TRIBUNAL = [
  ['temuco', 'Temuco'],
  ['santiago', 'Santiago'],
  ['concepcion', 'Concepción'],
  ['concepción', 'Concepción'],
  ['valparaiso', 'Valparaíso'],
  ['valparaíso', 'Valparaíso'],
  ['magallanes', 'Punta Arenas'],
  ['punta arenas', 'Punta Arenas'],
  ['valdivia', 'Valdivia']
];

export default function CasosList({ onSelectCaso, onOpenMatriz, onOpenCrearExpediente }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState({
    vigencia: 'TODAS', ciudad: 'TODAS', tribunal: 'TODAS', materia: 'TODAS', etapa: 'TODAS'
  });
  const [extrajudiciales, setExtrajudiciales] = useState([]);
  const [causasPjud, setCausasPjud] = useState([]);

  const handleEliminarExpedienteCaso = async (caso) => {
    const ident = caso.rit || caso.rol || caso.caratula || 'este expediente';
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el expediente "${ident}"?`)) {
      return;
    }
    try {
      await eliminarExpediente(caso.id || caso.rit);
      reloadExpedientes();
    } catch (e) {
      alert(`Ocurrió un error al eliminar el expediente: ${e.message}`);
    }
  };

  const reloadExpedientes = () => {
    cargarExpedientes().then((expList) => {
      setExtrajudiciales((expList || []).map((e) => ({
        id: e.id,
        rit: e.rit || e.ritVinculado || e.id,
        rol: e.rit || e.ritVinculado || e.id,
        ruc: e.ruc || '',
        caratula: e.caratula || `Asesoría — ${e.cliente || e.asunto}`,
        cliente: e.cliente || 'Sin cliente',
        contraparte: e.contraparte || 'En Reserva',
        abogadoContraparte: e.abogadoContraparte || 'No registrado',
        materia: e.materia || e.tipo || 'Extrajudicial',
        tribunal: e.tribunal || 'Gestión interna',
        numeroTribunal: e.numeroTribunal || '',
        ciudad: e.ciudad || 'Temuco',
        fechaInicio: e.creadoEn ? e.creadoEn.split('T')[0] : '2026',
        estadoPlazo: 'VIGENTE',
        etapa: e.etapa || 'Asesoría activa',
        gestiones: e.gestiones || []
      })));
    });
    // PJUD_CASOS (import estático) se lee una sola vez al cargar la página -no
    // se entera de borrados sin recargar-. cargarCausasPjud() sí refleja el
    // estado real de data/pjudCausesData.json en cada recarga de esta lista,
    // así "Eliminar Expediente" hace desaparecer la fila de verdad.
    cargarCausasPjud().then(setCausasPjud);
  };

  useEffect(() => {
    reloadExpedientes();

    const handleUpdate = () => reloadExpedientes();
    window.addEventListener('lexcontrol_expedientes_updated', handleUpdate);
    return () => window.removeEventListener('lexcontrol_expedientes_updated', handleUpdate);
  }, []);

  // Se lee localStorage una vez por causa y no en cada tecla: antes el filtro
  // hacía 1.557 lecturas sincrónicas por cada carácter escrito.
  const causas = useMemo(() => {
    const clavesExtrajudiciales = new Set(
      extrajudiciales.flatMap((e) => [e.id, e.rit].filter(Boolean).map(String))
    );
    const causasPjudSinEspejo = causasPjud.filter(
      (c) => !clavesExtrajudiciales.has(String(c.id)) && !clavesExtrajudiciales.has(String(c.rit))
    );
    return [...MOCK_CASOS, ...causasPjudSinEspejo, ...extrajudiciales].map((caso) => {
      const clave = caso.id || caso.rit;
      const etapa = (caso.etapa || '').toLowerCase();

      const override = localStorage.getItem(`lexcontrol_vigencia_${clave}`);
      const finalizado = override
        ? override === 'TERMINADO / CANCELADO'
        : caso.estadoPlazo === 'TERMINADO'
          || etapa.includes('fallada') || etapa.includes('terminad') || etapa.includes('archiv');

      // Antes esto leía `lexcontrol_gestiones_${clave}` de localStorage -un
      // resabio de cuando las gestiones vivían sólo en el navegador-. Desde que
      // el servidor es la fuente de verdad (guardarGestionesDeCaso), esa clave
      // ya nunca se escribe, así que "última gestión" siempre caía al texto
      // genérico de relleno, por real que fuera la bitácora del expediente. Se
      // lee directo de caso.gestiones, que sí trae lo real.
      let ultimaGestion = caso.estadoPlazo === 'URGENTE' ? caso.resumenTeoriaCaso : 'Trámite inicial registrado';
      let fechaGestion = caso.fechaIngreso || '—';
      let proximaGestion = null;

      // "Ingreso PJUD" es un registro de auditoría de la migración masiva
      // ("esta causa se importó tal día"), no una gestión real -mismo criterio
      // que gestionesDeExpedientes() en radarPlazos.js-.
      const gestionesReales = (caso.gestiones || []).filter((g) => g.tipo !== 'Ingreso PJUD');

      if (gestionesReales.length) {
        const conFecha = gestionesReales.map((g) => ({ g, fIso: normalizarFechaIso(g.fechaIso || g.fecha) }));
        const ordenadas = [...conFecha].sort((a, b) => (b.fIso || '').localeCompare(a.fIso || ''));
        const ultima = ordenadas[0].g;
        ultimaGestion = ultima.tramite || ultima.actuacion || ultima.titulo || 'Gestión registrada';
        fechaGestion = ultima.fecha || ultima.fechaIso || '—';

        // La próxima gestión es la pendiente (no realizada) con el vencimiento
        // real más próximo -mismo criterio que "requiere mi atención hoy":
        // fechaVencimiento manda sobre la fecha de trámite, porque es el plazo
        // que de verdad importa, no cuándo se anotó-.
        const pendientes = gestionesReales
          .filter((g) => !String(g.estado || '').toUpperCase().includes('REALIZAD'))
          .map((g) => ({ g, fObjetivo: normalizarFechaIso(g.fechaVencimiento) || normalizarFechaIso(g.fechaIso || g.fecha) }))
          .filter((x) => x.fObjetivo)
          .sort((a, b) => a.fObjetivo.localeCompare(b.fObjetivo));
        if (pendientes.length) {
          const p = pendientes[0].g;
          proximaGestion = `${p.tramite || p.actuacion || 'Gestión pendiente'} (${p.fechaVencimiento || p.fecha || p.fechaIso})`;
        }
      }

      const tribunal = (caso.tribunal || '').toLowerCase();
      const ciudad = CIUDADES_TRIBUNAL.find(([aguja]) => tribunal.includes(aguja))?.[1] || 'Sin ciudad';

      return {
        caso,
        clave,
        finalizado,
        ultimaGestion,
        fechaGestion,
        proximaGestion,
        ciudad,
        tieneCarpeta: findDiscoFolder(caso) !== null,
        blancoTexto: `${caso.tribunal || ''} ${caso.caratula || ''} ${caso.cliente || ''} ${caso.resumenTeoriaCaso || ''}`.toLowerCase()
      };
    });
  }, [extrajudiciales, causasPjud]);

  const visibles = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return causas.filter(({ caso, finalizado, blancoTexto }) => {
      if (q) {
        const coincide = [caso.caratula, caso.rit, caso.nuc, caso.cliente]
          .some((v) => (v || '').toLowerCase().includes(q));
        if (!coincide) return false;
      }

      const materia = caso.materia || '';
      const etapa = caso.etapa || '';
      const tribunal = caso.tribunal || '';

      if (filtros.materia !== 'TODAS' && !materia.includes(filtros.materia)) return false;
      if (filtros.etapa !== 'TODAS' && !etapa.includes(filtros.etapa)) return false;

      if (filtros.tribunal !== 'TODAS') {
        const t = filtros.tribunal.toLowerCase();
        if (!tribunal.toLowerCase().includes(t) && !materia.toLowerCase().includes(t)) return false;
      }

      if (filtros.ciudad !== 'TODAS') {
        const t = filtros.ciudad.toLowerCase();
        const agujas = ALIAS_CIUDAD[t] || [t];
        if (!agujas.some((a) => blancoTexto.includes(a))) return false;
      }

      if (filtros.vigencia === 'VIGENTES' && finalizado) return false;
      if (filtros.vigencia === 'FINALIZADOS' && !finalizado) return false;

      return true;
    });
  }, [causas, busqueda, filtros]);

  const cambiar = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <div className="animate-fade-in">
      <div className="top-header">
        <div className="header-title">
          <h1>Expedientes</h1>
          <p>Directorio de causas penales, civiles, laborales y arbitrajes del estudio.</p>
        </div>
        <button 
          className="btn-primary" 
          onClick={() => {
            if (onOpenCrearExpediente) onOpenCrearExpediente();
            else window.dispatchEvent(new CustomEvent('lexcontrol_open_crear_expediente'));
          }}
          title="Ingresar un nuevo expediente judicial o extrajudicial"
        >
          <FolderGit2 size={16} />
          <span>Nuevo Expediente</span>
        </button>
      </div>

      <div className="card card-static card-pad toolbar">
        <label className="buscador">
          <Search size={15} color="var(--text-muted)" />
          <input
            className="buscador-input"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por ROL, RIT, NUC, carátula o cliente…"
            aria-label="Buscar expedientes"
          />
        </label>
        <div className="row wrap" style={{ gap: 'var(--space-2)' }}>
          {Object.entries(FILTROS).map(([campo, opciones]) => (
            <select
              key={campo}
              className="select select-compacto"
              value={filtros[campo]}
              onChange={cambiar(campo)}
              aria-label={`Filtrar por ${campo}`}
            >
              {opciones.map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>{etiqueta}</option>
              ))}
            </select>
          ))}
        </div>
      </div>

      <p className="muted lista-contador">
        {visibles.length.toLocaleString('es-CL')} de {causas.length.toLocaleString('es-CL')} causas.
        Haz clic en una fila para abrir el expediente.
      </p>

      <div className="card card-static">
        <div className="table-wrap">
          <table className="table tabla-causas">
            <thead>
              <tr>
                <th>Expediente</th>
                <th>Tribunal</th>
                <th>Materia</th>
                <th>Última gestión</th>
                <th>Próxima gestión</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <h3>Sin coincidencias</h3>
                      <p>Ningún expediente cumple los filtros actuales.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibles.map(({ caso, clave, ultimaGestion, fechaGestion, proximaGestion, ciudad, tieneCarpeta }) => {
                  const urgente = caso.estadoPlazo === 'URGENTE';
                  const atencion = caso.estadoPlazo === 'ATENCION';
                  const proxima = proximaGestion || caso.plazoDescripcion || caso.proximaAudiencia || 'Sin gestiones pendientes';
                  const estado = urgente ? 'VENCIDO' : atencion ? 'URGENTE' : '';

                  return (
                    <tr
                      key={clave}
                      onClick={() => onSelectCaso(caso)}
                      className={estado ? `sem sem-${estado}` : 'sem'}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSelectCaso(caso); }}
                    >
                      <td>
                        <span className="stack" style={{ gap: 2 }}>
                          <span className="row" style={{ gap: 'var(--space-2)' }}>
                            <strong className="mono">{caso.rit}</strong>
                            {!tieneCarpeta && (
                              <span title="Sin carpeta física en el disco local" className="muted">
                                <FolderOpen size={13} />
                              </span>
                            )}
                          </span>
                          <span className="truncate celda-sec" title={caso.caratula}>{caso.caratula}</span>
                        </span>
                      </td>
                      <td>
                        <span className="stack" style={{ gap: 2 }}>
                          <span className="truncate">{caso.tribunal}</span>
                          <span className="celda-sec">{ciudad}</span>
                        </span>
                      </td>
                      <td><span className="celda-sec truncate">{caso.materia}</span></td>
                      <td title={`${fechaGestion} — ${ultimaGestion}`}>
                        <span className="stack" style={{ gap: 2 }}>
                          <span className="mono celda-sec">{fechaGestion}</span>
                          <span className="truncate">{ultimaGestion}</span>
                        </span>
                      </td>
                      <td title={proxima}>
                        <span className="truncate" style={{ color: urgente ? 'var(--danger)' : undefined }}>
                          {proxima}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={(e) => { e.stopPropagation(); onOpenMatriz(caso); }}
                          title="Abrir matriz probatoria"
                          aria-label={`Matriz probatoria de ${caso.rit}`}
                        >
                          <Scale size={14} />
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          style={{ color: '#ef4444' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEliminarExpedienteCaso(caso);
                          }}
                          title="Eliminar este expediente"
                          aria-label={`Eliminar expediente ${caso.rit}`}
                        >
                          <Trash2 size={14} />
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
    </div>
  );
}
