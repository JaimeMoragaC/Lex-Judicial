import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Copy, Check, Radar, Gavel, ShieldCheck, BookOpen, AlertTriangle } from 'lucide-react';

import {
  CATALOGO_PLAZOS,
  calcularPlazoCPC,
  calcularPlazoCPP,
  calcularPlazoLaboralAdmin,
  formatearFechaEs,
  nombreFeriado
} from '../utils/plazosChile';
import { MOCK_CASOS } from '../mockData';
import { cargarPlazos, guardarPlazos, computarPlazo, hoyLocal } from '../utils/radarPlazos.js';

const CUERPOS_LEGALES = {
  CPC: {
    nombre: 'Código de Procedimiento Civil (CPC Chile)',
    computo: 'días hábiles civiles (Art. 66 CPC)',
    titulo: 'Procedimiento civil',
    regla: 'Días hábiles. Excluye domingos y feriados; los sábados sí cuentan.',
    articulo: 'Art. 66 CPC',
    icono: Gavel,
    motor: calcularPlazoCPC
  },
  CPP: {
    nombre: 'Código Procesal Penal (CPP Chile)',
    computo: 'días corridos (Art. 14 CPP)',
    titulo: 'Procesal penal',
    regla: 'Días corridos. Si vence en día inhábil se prorroga al siguiente hábil.',
    articulo: 'Art. 14 CPP',
    icono: ShieldCheck,
    motor: calcularPlazoCPP
  },
  LAB_ADMIN: {
    nombre: 'Código del Trabajo / Ley 19.968 / Ley 19.880 (Chile)',
    computo: 'días hábiles de lunes a viernes (Art. 445 CT)',
    titulo: 'Laboral, familia y administrativo',
    regla: 'Días hábiles de lunes a viernes. Excluye sábados, domingos y feriados.',
    articulo: 'Art. 445 CT',
    icono: BookOpen,
    motor: calcularPlazoLaboralAdmin
  }
};

export default function CalculadoraTerminos() {
  const [codigoActivo, setCodigoActivo] = useState('CPC');
  const [procSeleccionadoId, setProcSeleccionadoId] = useState('cpc-ord-1');
  const [fechaBase, setFechaBase] = useState(hoyLocal());
  const [dias, setDias] = useState(15);
  const [esHaciaAtras, setEsHaciaAtras] = useState(false);
  const [casoVinculado, setCasoVinculado] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [agendado, setAgendado] = useState(null);

  const procedimientos = useMemo(
    () => CATALOGO_PLAZOS[codigoActivo].flatMap((g) => g.procedimientos),
    [codigoActivo]
  );

  const procSeleccionado = useMemo(
    () => procedimientos.find((p) => p.id === procSeleccionadoId) || procedimientos[0],
    [procedimientos, procSeleccionadoId]
  );

  // Al cambiar de código procesal, cae en la primera actuación de ese código.
  useEffect(() => {
    const primero = CATALOGO_PLAZOS[codigoActivo][0].procedimientos[0];
    setProcSeleccionadoId(primero.id);
  }, [codigoActivo]);

  useEffect(() => {
    if (!procSeleccionado) return;
    setDias(procSeleccionado.dias);
    setEsHaciaAtras(!!procSeleccionado.esHaciaAtras);
  }, [procSeleccionado]);

  const { resultado, errorCalculo } = useMemo(() => {
    try {
      const motor = CUERPOS_LEGALES[codigoActivo].motor;
      return { resultado: motor(fechaBase, Number(dias), esHaciaAtras), errorCalculo: null };
    } catch (e) {
      return { resultado: null, errorCalculo: e.message };
    }
  }, [codigoActivo, fechaBase, dias, esHaciaAtras]);

  const cuerpo = CUERPOS_LEGALES[codigoActivo];

  const copiarMinuta = () => {
    if (!resultado || !procSeleccionado) return;
    const texto = `=== CERTIFICADO DE CÓMPUTO DE PLAZO JUDICIAL (LEXCONTROL) ===
Código: ${cuerpo.nombre}
Actuación / Hito: ${procSeleccionado.nombre}
Normativa Legal: ${procSeleccionado.articulo}
${esHaciaAtras ? 'Fecha de la Audiencia / Hito Base' : 'Fecha de Notificación / Hito Base'}: ${formatearFechaEs(fechaBase)}
Plazo Legal: ${dias} ${cuerpo.computo}${esHaciaAtras ? ' (contados hacia atrás desde la audiencia)' : ''}

>>> ${esHaciaAtras ? 'ÚLTIMO DÍA PARA PRESENTAR' : 'FECHA FATAL DE VENCIMIENTO'}: ${resultado.fechaVencimientoTexto.toUpperCase()} <<<
${resultado.observacionProrroga ? '\n' + resultado.observacionProrroga + '\n' : ''}
Cómputo según el calendario de feriados legales de Chile.
Generado por LexControl.`;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  // Antes este botón mostraba un alert prometiendo avisos por SMS y email que
  // nunca existieron. Ahora inscribe el plazo de verdad en el Radar.
  const agendarEnRadar = async () => {
    if (!resultado || !procSeleccionado) return;
    try {
      const caso = MOCK_CASOS.find((c) => c.id === casoVinculado);
      const nuevo = computarPlazo({
        casoId: caso?.id || null,
        rit: caso?.rit,
        caratula: caso?.caratula,
        tribunal: caso?.tribunal,
        procedimientoId: procSeleccionado.id,
        regimen: codigoActivo,
        dias: Number(dias),
        esHaciaAtras,
        fechaBase
      });
      const actuales = await cargarPlazos();
      await guardarPlazos([...actuales, nuevo]);
      setAgendado({ ok: true, texto: `Inscrito en el radar: vence el ${nuevo.fechaVencimiento}.` });
    } catch (e) {
      setAgendado({ ok: false, texto: `No se pudo inscribir: ${e.message}` });
    }
    setTimeout(() => setAgendado(null), 5000);
  };

  return (
    <div className="animate-fade-in">
      <div className="top-header">
        <div className="header-title">
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <Calculator size={20} color="var(--accent)" />
            <h1>Cómputo de términos judiciales</h1>
          </div>
          <p>
            Cálculo de plazos para causas civiles, penales, laborales y de familia según el
            régimen que corresponde a cada código, descontando los feriados legales de Chile.
          </p>
        </div>
        <div className="row">
          <button className="btn-secondary" onClick={copiarMinuta} disabled={!resultado}>
            {copiado ? <Check size={15} /> : <Copy size={15} />}
            {copiado ? 'Copiado' : 'Copiar certificado'}
          </button>
          <button className="btn-primary" onClick={agendarEnRadar} disabled={!resultado}>
            <Radar size={15} /> Vigilar en el radar
          </button>
        </div>
      </div>

      {agendado && (
        <div className={`card card-pad sem ${agendado.ok ? 'sem-AL_DIA' : 'sem-VENCIDO'}`} style={{ marginBottom: 'var(--space-6)' }}>
          <span style={{ color: agendado.ok ? 'var(--ok)' : 'var(--danger)' }}>{agendado.texto}</span>
        </div>
      )}

      {/* Selector de régimen de cómputo */}
      <div className="grid-3">
        {Object.entries(CUERPOS_LEGALES).map(([clave, def]) => {
          const Icono = def.icono;
          const activo = codigoActivo === clave;
          return (
            <button
              key={clave}
              className={`regimen${activo ? ' is-active' : ''}`}
              onClick={() => setCodigoActivo(clave)}
              aria-pressed={activo}
            >
              <span className="row-between">
                <span className="row">
                  <Icono size={17} />
                  <strong>{def.titulo}</strong>
                </span>
                <span className={`badge ${activo ? 'badge-gold' : ''}`}>{def.articulo}</span>
              </span>
              <p className="regimen-regla">{def.regla}</p>
            </button>
          );
        })}
      </div>

      <div className="grid-7-5" style={{ alignItems: 'start' }}>
        <div className="card card-static">
          <div className="card-header"><span className="card-title">Parámetros</span></div>
          <div className="card-pad">
            <div className="field">
              <label className="field-label" htmlFor="ct-proc">Actuación procesal</label>
              <select
                id="ct-proc"
                className="select"
                value={procSeleccionadoId}
                onChange={(e) => setProcSeleccionadoId(e.target.value)}
              >
                {CATALOGO_PLAZOS[codigoActivo].map((grupo) => (
                  <optgroup key={grupo.categoria} label={grupo.categoria}>
                    {grupo.procedimientos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {procSeleccionado && (
              <p className="nota-legal">
                <strong>{procSeleccionado.articulo}</strong> · {procSeleccionado.descripcion}
              </p>
            )}

            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="field">
                <label className="field-label" htmlFor="ct-fecha">
                  {esHaciaAtras ? 'Fecha de la audiencia' : 'Fecha de notificación'}
                </label>
                <input
                  id="ct-fecha"
                  className="input"
                  type="date"
                  value={fechaBase}
                  onChange={(e) => setFechaBase(e.target.value)}
                />
                {nombreFeriado(fechaBase) && (
                  <p className="aviso-inline">
                    <AlertTriangle size={12} /> Ese día es feriado: {nombreFeriado(fechaBase)}
                  </p>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="ct-dias">Días de plazo</label>
                <input
                  id="ct-dias"
                  className="input"
                  type="number"
                  min="1"
                  value={dias}
                  onChange={(e) => setDias(e.target.value)}
                />
              </div>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={esHaciaAtras}
                onChange={(e) => setEsHaciaAtras(e.target.checked)}
              />
              <span>Contar hacia atrás desde la audiencia (plazo de anticipación)</span>
            </label>

            <div className="field" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
              <label className="field-label" htmlFor="ct-caso">Asociar a una causa (opcional)</label>
              <select
                id="ct-caso"
                className="select"
                value={casoVinculado}
                onChange={(e) => setCasoVinculado(e.target.value)}
              >
                <option value="">Sin causa asociada</option>
                {MOCK_CASOS.slice(0, 400).map((c) => (
                  <option key={c.id} value={c.id}>{c.rit} — {(c.caratula || '').slice(0, 55)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card card-static">
          <div className="card-header"><span className="card-title">Resultado</span></div>

          {errorCalculo && (
            <div className="card-pad">
              <p style={{ color: 'var(--danger)' }}>{errorCalculo}</p>
            </div>
          )}

          {resultado && (
            <>
              <div className="card-pad resultado-principal">
                <div className="stat-label">
                  {esHaciaAtras ? 'Último día para presentar' : 'Vencimiento del término'}
                </div>
                <div className="resultado-fecha mono">{resultado.fechaVencimiento}</div>
                <p className="secondary" style={{ fontSize: 'var(--text-sm)' }}>
                  {resultado.fechaVencimientoTexto}
                </p>
                {resultado.observacionProrroga && (
                  <p className="aviso-prorroga">{resultado.observacionProrroga}</p>
                )}
                <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-3)' }}>
                  {resultado.normativa}
                </p>
              </div>

              <div className="card-header"><span className="card-title">Día por día</span></div>
              <div className="desglose">
                {resultado.desglose.map((d, i) => (
                  <div key={`${d.fecha}-${i}`} className={`desglose-fila${d.numero ? '' : ' es-inhabil'}`}>
                    <span className="mono desglose-fecha">{d.fecha}</span>
                    <span className="desglose-dia">{d.diaSemana}</span>
                    <span className="desglose-num">{d.numero || '—'}</span>
                    <span className="desglose-obs truncate" title={d.observacion}>{d.observacion}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
