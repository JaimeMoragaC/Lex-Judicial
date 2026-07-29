import React, { useEffect, useMemo, useState } from 'react';
import { Search, FolderGit2, Scale, FolderOpen } from 'lucide-react';

import { MOCK_CASOS } from '../mockData';
import { findDiscoFolder } from '../utils/folderMatcher';

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

function leerLocalStorage(clave, porDefecto = null) {
  try {
    const bruto = localStorage.getItem(clave);
    return bruto ? JSON.parse(bruto) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export default function CasosList({ onSelectCaso, onOpenMatriz }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState({
    vigencia: 'TODAS', ciudad: 'TODAS', tribunal: 'TODAS', materia: 'TODAS', etapa: 'TODAS'
  });
  const [extrajudiciales, setExtrajudiciales] = useState([]);

  useEffect(() => {
    const mapa = leerLocalStorage('lexcontrol_extrajudicial_mapping');
    if (!mapa) return;
    setExtrajudiciales(Object.entries(mapa).map(([cliente, id]) => ({
      id, rit: id, rol: id, nuc: 'N/A',
      caratula: `Asesoría extrajudicial — ${cliente}`,
      cliente, materia: 'Extrajudicial',
      tribunal: 'Gestión interna', ciudad: 'Gestión interna',
      fechaInicio: id.split('-')[2] || '2026',
      estadoPlazo: 'VIGENTE', etapa: 'Asesoría activa',
      demandante: cliente, demandado: 'N/A', proximaAudiencia: '',
      resumenTeoriaCaso: 'Carpeta de gestión extrajudicial generada automáticamente.'
    })));
  }, []);

  // Se lee localStorage una vez por causa y no en cada tecla: antes el filtro
  // hacía 1.557 lecturas sincrónicas por cada carácter escrito.
  const causas = useMemo(() => {
    return [...MOCK_CASOS, ...extrajudiciales].map((caso) => {
      const clave = caso.id || caso.rit;
      const etapa = (caso.etapa || '').toLowerCase();

      const override = localStorage.getItem(`lexcontrol_vigencia_${clave}`);
      const finalizado = override
        ? override === 'TERMINADO / CANCELADO'
        : caso.estadoPlazo === 'TERMINADO'
          || etapa.includes('fallada') || etapa.includes('terminad') || etapa.includes('archiv');

      let ultimaGestion = caso.estadoPlazo === 'URGENTE' ? caso.resumenTeoriaCaso : 'Trámite inicial registrado';
      let fechaGestion = caso.fechaIngreso || '—';
      const gestiones = leerLocalStorage(`lexcontrol_gestiones_${clave}`, []);
      if (gestiones?.length) {
        const ordenadas = [...gestiones].sort(
          (a, b) => new Date(b.fecha.split('/').reverse().join('-')) - new Date(a.fecha.split('/').reverse().join('-'))
        );
        ultimaGestion = ordenadas[0].titulo || ordenadas[0].tramite;
        fechaGestion = ordenadas[0].fecha;
      }

      const tribunal = (caso.tribunal || '').toLowerCase();
      const ciudad = CIUDADES_TRIBUNAL.find(([aguja]) => tribunal.includes(aguja))?.[1] || 'Sin ciudad';

      return {
        caso,
        clave,
        finalizado,
        ultimaGestion,
        fechaGestion,
        ciudad,
        tieneCarpeta: findDiscoFolder(caso) !== null,
        blancoTexto: `${caso.tribunal || ''} ${caso.caratula || ''} ${caso.cliente || ''} ${caso.resumenTeoriaCaso || ''}`.toLowerCase()
      };
    });
  }, [extrajudiciales]);

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
        {/* Las causas entran por importar_excel_pjud.py; el alta manual no está hecha. */}
        <button className="btn-primary" disabled title="El alta manual de causas aún no está implementada">
          <FolderGit2 size={15} /> Ingresar causa
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
                visibles.map(({ caso, clave, ultimaGestion, fechaGestion, ciudad, tieneCarpeta }) => {
                  const urgente = caso.estadoPlazo === 'URGENTE';
                  const atencion = caso.estadoPlazo === 'ATENCION';
                  const proxima = caso.plazoDescripcion || caso.proximaAudiencia || 'Sin gestiones pendientes';
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
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={(e) => { e.stopPropagation(); onOpenMatriz(caso); }}
                          title="Abrir matriz probatoria"
                          aria-label={`Matriz probatoria de ${caso.rit}`}
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
    </div>
  );
}
