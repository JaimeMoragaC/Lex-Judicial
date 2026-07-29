// Tests del radar de plazos: lo que decide si una alerta aparece o no.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  habilesRestantes,
  clasificar,
  computarPlazo,
  buscarProcedimiento,
  procedimientosDisponibles,
  ordenarPorUrgencia,
  resumen
} from './radarPlazos.js';

test('los días restantes se cuentan en hábiles, no en calendario', () => {
  // Del viernes 2026-08-07 al lunes 2026-08-10 hay 3 días de calendario,
  // pero sólo 1 hábil de trabajo en régimen laboral (sáb y dom no cuentan).
  assert.equal(habilesRestantes('2026-08-10', 'LAB_ADMIN', '2026-08-07'), 1);
  // En civil el sábado sí es hábil, así que son 2.
  assert.equal(habilesRestantes('2026-08-10', 'CPC', '2026-08-07'), 2);
  // En penal se cuentan corridos: 3.
  assert.equal(habilesRestantes('2026-08-10', 'CPP', '2026-08-07'), 3);
});

test('un plazo ya vencido se detecta como tal', () => {
  assert.equal(habilesRestantes('2026-08-01', 'CPC', '2026-08-07'), -1);
  assert.equal(clasificar({ fechaVencimiento: '2026-08-01', regimen: 'CPC' }, '2026-08-07'), 'VENCIDO');
});

test('el semáforo distingue hoy, crítico, urgente y al día', () => {
  const c = (v, desde) => clasificar({ fechaVencimiento: v, regimen: 'CPC' }, desde);
  assert.equal(c('2026-08-07', '2026-08-07'), 'HOY');
  assert.equal(c('2026-08-08', '2026-08-07'), 'CRITICO');   // 1 hábil
  assert.equal(c('2026-08-13', '2026-08-07'), 'URGENTE');   // 5 hábiles
  assert.equal(c('2026-09-30', '2026-08-07'), 'AL_DIA');
});

test('computarPlazo usa el motor real y hereda el sentido del catálogo', () => {
  // Este procedimiento está marcado esHaciaAtras en el catálogo: el radar debe
  // respetarlo y dar una fecha ANTERIOR a la audiencia.
  const proc = buscarProcedimiento('lab-ord-1');
  assert.ok(proc, 'debe existir el procedimiento de contestación laboral');
  assert.equal(proc.esHaciaAtras, true);

  const p = computarPlazo({ procedimientoId: 'lab-ord-1', fechaBase: '2026-08-20', rit: 'T-100-2026' });
  assert.equal(p.fechaVencimiento, '2026-08-13');
  assert.ok(p.fechaVencimiento < p.fechaBase, 'un plazo de anticipación vence antes del hito');
  assert.equal(p.regimen, 'LAB_ADMIN');
  assert.equal(p.articulo, 'Art. 453 Nº 1 Código del Trabajo');
});

test('computarPlazo hacia adelante en civil', () => {
  const p = computarPlazo({ procedimientoId: 'cpc-rec-4', fechaBase: '2026-08-03' });
  assert.equal(p.dias, 10);
  assert.ok(p.fechaVencimiento > '2026-08-03');
});

test('todos los procedimientos del catálogo se pueden computar sin reventar', () => {
  const procs = procedimientosDisponibles();
  assert.ok(procs.length >= 25, `se esperaban al menos 25 procedimientos, hay ${procs.length}`);
  for (const proc of procs) {
    const p = computarPlazo({ procedimientoId: proc.id, fechaBase: '2026-08-20' });
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.fechaVencimiento), `${proc.id} dio "${p.fechaVencimiento}"`);
    if (proc.esHaciaAtras) {
      assert.ok(p.fechaVencimiento < '2026-08-20', `${proc.id} es de anticipación y no venció antes del hito`);
    } else {
      assert.ok(p.fechaVencimiento > '2026-08-20', `${proc.id} es hacia adelante y no venció después`);
    }
  }
});

test('el orden pone primero lo vencido y después lo que vence antes', () => {
  const plazos = [
    { id: 'a', fechaVencimiento: '2026-09-30', regimen: 'CPC' },
    { id: 'b', fechaVencimiento: '2026-08-01', regimen: 'CPC' }, // vencido
    { id: 'c', fechaVencimiento: '2026-08-10', regimen: 'CPC' },
    { id: 'd', fechaVencimiento: '2026-08-07', regimen: 'CPC' }  // hoy
  ];
  const orden = ordenarPorUrgencia(plazos, '2026-08-07').map((p) => p.id);
  assert.deepEqual(orden, ['b', 'd', 'c', 'a']);
});

test('el resumen cuenta lo accionable', () => {
  const plazos = [
    { fechaVencimiento: '2026-08-01', regimen: 'CPC' }, // vencido
    { fechaVencimiento: '2026-08-07', regimen: 'CPC' }, // hoy
    { fechaVencimiento: '2026-09-30', regimen: 'CPC' }  // al día
  ];
  const r = resumen(plazos, '2026-08-07');
  assert.equal(r.total, 3);
  assert.equal(r.VENCIDO, 1);
  assert.equal(r.HOY, 1);
  assert.equal(r.accionables, 2);
});

test('una fecha base inválida no crea un plazo fantasma', () => {
  assert.throws(() => computarPlazo({ procedimientoId: 'cpc-rec-4', fechaBase: 'ayer' }), /Fecha base inválida/);
});
