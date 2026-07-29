// Tests de identidad de expedientes. El caso que los origina es real: una
// anotación sobre "don Víctor Garai y la camioneta" no se reconoció como la
// misma que la del día anterior sobre "Victor Garai", y se abrió un expediente
// duplicado.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizar,
  parecido,
  puntuar,
  buscarCandidatos,
  siguienteCorrelativo,
  crearExpediente
} from './expedientes.js';

test('la normalización descarta tratamientos y tildes', () => {
  assert.equal(normalizar('don Víctor Garai'), 'victor garai');
  assert.equal(normalizar('DON VICTOR GARAI'), 'victor garai');
  assert.equal(normalizar('Sr. Víctor Garai'), 'victor garai');
  assert.equal(normalizar('  doña  María  Pérez '), 'maria perez');
});

test('los apellidos con partícula no se mutilan', () => {
  // Filtrar 'de'/'la' dejaría 'fuente' y perdería la identidad del apellido.
  assert.equal(normalizar('Juan De la Fuente'), 'juan de la fuente');
  assert.equal(normalizar('Ana del Río'), 'ana del rio');
});

test('EL CASO GARAI: las dos anotaciones se reconocen como la misma persona', () => {
  const ayer = 'Victor Garai';
  const hoy = 'don Víctor Garai';
  assert.ok(parecido(ayer, hoy) >= 0.99, `parecido fue ${parecido(ayer, hoy)}`);
});

test('un nombre parcial reconoce al completo', () => {
  assert.ok(parecido('Garai', 'Víctor Garai Soto') >= 0.9);
});

test('dos personas distintas no se confunden', () => {
  assert.ok(parecido('Víctor Garai', 'María Pérez') < 0.3);
  assert.ok(parecido('Juan Soto', 'Juan Ramírez') < 0.6);
});

test('EL CASO GARAI: la anotación de hoy cae en el expediente de ayer', () => {
  const expedientes = [
    { id: 'EXT-001-2026', cliente: 'Victor Garai', asunto: 'camioneta', tipo: 'administrativo', gestiones: [] }
  ];
  const candidatos = buscarCandidatos(
    { cliente: 'don Víctor Garai', asunto: 'camioneta', rol: 'EXTRAJUDICIAL' },
    expedientes,
    []
  );
  assert.equal(candidatos.length, 1);
  assert.equal(candidatos[0].ref.id, 'EXT-001-2026');
  assert.ok(candidatos[0].score >= 0.9, `score ${candidatos[0].score}`);
});

test('dos asuntos del MISMO cliente no se mezclan', () => {
  const expedientes = [
    { id: 'EXT-001-2026', cliente: 'Víctor Garai', asunto: 'camioneta', gestiones: [] },
    { id: 'EXT-002-2026', cliente: 'Víctor Garai', asunto: 'arriendo local Ñuñoa', gestiones: [] }
  ];
  const c = buscarCandidatos({ cliente: 'Víctor Garai', asunto: 'arriendo', rol: '' }, expedientes, []);
  // Los dos aparecen porque es el mismo cliente, pero el del arriendo va primero.
  assert.equal(c[0].ref.id, 'EXT-002-2026');
  assert.ok(c[0].score > c[1].score, 'el asunto correcto debe puntuar más alto');
});

test('sin asunto declarado la coincidencia es parcial, para que la interfaz pregunte', () => {
  const exp = { id: 'EXT-001-2026', cliente: 'Víctor Garai', asunto: 'camioneta' };
  const conAsunto = puntuar(exp, { cliente: 'Víctor Garai', asunto: 'camioneta' });
  const sinAsunto = puntuar(exp, { cliente: 'Víctor Garai', asunto: '' });
  assert.ok(sinAsunto > 0, 'debe seguir siendo candidato');
  assert.ok(sinAsunto < conAsunto, 'pero con menos confianza que la coincidencia completa');
});

test('otro cliente nunca es candidato, aunque el asunto sea idéntico', () => {
  const exp = { id: 'EXT-001-2026', cliente: 'Víctor Garai', asunto: 'camioneta' };
  assert.equal(puntuar(exp, { cliente: 'María Pérez', asunto: 'camioneta' }), 0);
});

test('un ROL que calza gana a cualquier parecido de nombre', () => {
  const causas = [
    { id: 'c1', rit: 'C-1869-2026', caratula: 'MEDINA/MORAGA' },
    { id: 'c2', rit: 'C-272-2025', caratula: 'MEDINA/ILUSTRE MUNICIPALIDAD' }
  ];
  const c = buscarCandidatos({ cliente: 'Medina', asunto: '', rol: 'C-272-2025' }, [], causas);
  assert.equal(c[0].ref.rit, 'C-272-2025');
  assert.equal(c[0].score, 1);
});

test('los correlativos continúan la numeración y no se repiten', () => {
  const anio = new Date().getFullYear();
  const existentes = [
    { id: `EXT-001-${anio}` },
    { id: `EXT-002-${anio}` },
    { id: `ADM-001-${anio}` }
  ];
  assert.equal(siguienteCorrelativo(existentes, 'EXT'), `EXT-003-${anio}`);
  assert.equal(siguienteCorrelativo(existentes, 'ADM'), `ADM-002-${anio}`);
  assert.equal(siguienteCorrelativo([], 'EXT'), `EXT-001-${anio}`);
});

test('crear un expediente no pisa uno existente', () => {
  const anio = new Date().getFullYear();
  const previos = [{ id: `EXT-001-${anio}`, cliente: 'Víctor Garai', asunto: 'camioneta' }];
  const nuevo = crearExpediente({ cliente: 'Víctor Garai', asunto: 'arriendo' }, previos);
  assert.equal(nuevo.id, `EXT-002-${anio}`);
  assert.notEqual(nuevo.id, previos[0].id);
  assert.deepEqual(nuevo.gestiones, []);
});
