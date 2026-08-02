// Tests de la capa de acciones: lo que el asistente podrá hacer, y sobre todo
// lo que NO debe poder hacer.
import test from 'node:test';
import assert from 'node:assert/strict';

// Servidor simulado en memoria. Se instala antes de importar los módulos porque
// tareas.js y expedientes.js resuelven la URL al cargarse.
let expedientes = [];
let tareas = [];
let plazos = [];

globalThis.fetch = async (url, op) => {
  const u = String(url);
  const cuerpo = op?.body ? JSON.parse(op.body) : null;
  if (u.endsWith('/expedientes')) {
    if (op?.method === 'POST') { expedientes = cuerpo.expedientes; return { ok: true, json: async () => ({ status: 'ok' }) }; }
    return { ok: true, json: async () => ({ expedientes }) };
  }
  if (u.endsWith('/tareas')) {
    if (op?.method === 'POST') { tareas = cuerpo.tareas; return { ok: true, json: async () => ({ status: 'ok' }) }; }
    return { ok: true, json: async () => ({ tareas }) };
  }
  if (u.endsWith('/plazos')) {
    if (op?.method === 'POST') { plazos = cuerpo.plazos; return { ok: true, json: async () => ({ status: 'ok' }) }; }
    return { ok: true, json: async () => ({ plazos }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
globalThis.localStorage = { length: 0, key: () => null, getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { validarAccion, ejecutarAccion, ACCIONES, paramsDesdePropuesta } = await import('./acciones.js');

function reiniciar() {
  expedientes = [
    { id: 'ROL 302-2025', ritVinculado: 'ROL 302-2025', cliente: 'PEREZ CON FISCO', asunto: 'cobro', tipo: 'judicial', gestiones: [] }
  ];
  tareas = [];
  plazos = [];
}

test('validar propone sin escribir nada', async () => {
  reiniciar();
  const antes = JSON.stringify(expedientes);
  const r = await validarAccion('crear_expediente', { cliente: 'Cliente Nuevo', asunto: 'arriendo' }, { expedientes });
  assert.equal(r.ok, true);
  assert.match(r.resumen, /Cliente Nuevo/);
  assert.equal(JSON.stringify(expedientes), antes, 'validar NO debe tocar el registro');
});

test('una acción que la IA se inventó no se ejecuta', async () => {
  reiniciar();
  // El asistente puede devolver un nombre que no existe. Tiene que fallar fuerte,
  // no ignorarse en silencio.
  const r = await ejecutarAccion('borrar_todos_los_expedientes', {});
  assert.equal(r.ok, false);
  assert.match(r.error, /desconocida/i);
  assert.equal(expedientes.length, 1);
});

test('modificar_expediente entrega el diff antes de aplicar', async () => {
  reiniciar();
  const r = await validarAccion(
    'modificar_expediente',
    { casoRef: 'ROL 302-2025', cambios: { asunto: 'cobro ejecutivo' } },
    { expedientes }
  );
  assert.equal(r.ok, true);
  assert.equal(r.antes.asunto, 'cobro');
  assert.equal(r.despues.asunto, 'cobro ejecutivo');
  // Y no lo aplicó todavía.
  assert.equal(expedientes[0].asunto, 'cobro');
});

test('sólo se pueden modificar los campos declarados editables', async () => {
  reiniciar();
  // `gestiones` no está en CAMPOS_EDITABLES: el asistente no puede reescribir el
  // historial procesal de un expediente por la vía de "modificar datos".
  const r = await validarAccion(
    'modificar_expediente',
    { casoRef: 'ROL 302-2025', cambios: { gestiones: [], id: 'OTRO' } },
    { expedientes }
  );
  assert.equal(r.ok, false);
});

test('no se puede operar sobre un expediente que no existe', async () => {
  reiniciar();
  for (const [accion, params] of [
    ['modificar_expediente', { casoRef: 'FANTASMA', cambios: { asunto: 'x' } }],
    ['registrar_gestion', { casoRef: 'FANTASMA', tramite: 'algo' }]
  ]) {
    const r = await ejecutarAccion(accion, params);
    assert.equal(r.ok, false, `${accion} debió rechazar un expediente inexistente`);
    assert.match(r.error, /No encontr/i);
  }
});

test('crear_expediente no duplica uno que ya existe', async () => {
  reiniciar();
  const primero = await ejecutarAccion('crear_expediente', { cliente: 'Soto', asunto: 'despido' });
  assert.equal(primero.ok, true);
  const segundo = await ejecutarAccion('crear_expediente', { cliente: 'Soto', asunto: 'despido' });
  assert.equal(segundo.ok, false);
  assert.match(segundo.error, /Ya existe/);
});

test('vigilar_plazo computa con el motor real y rechaza lo que no puede computar', async () => {
  reiniciar();
  const bueno = await ejecutarAccion('vigilar_plazo', { procedimientoId: 'cpc-rec-4', fechaBase: '2026-08-03' });
  assert.equal(bueno.ok, true);
  assert.match(bueno.resultado.fechaVencimiento, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(plazos.length, 1);

  // La IA no puede inventar un procedimiento ni una fecha: el plazo saldría de la
  // nada, que es justo lo que el radar existe para evitar.
  const procInventado = await ejecutarAccion('vigilar_plazo', { procedimientoId: 'inventado', fechaBase: '2026-08-03' });
  assert.equal(procInventado.ok, false);
  const fechaMala = await ejecutarAccion('vigilar_plazo', { procedimientoId: 'cpc-rec-4', fechaBase: 'la semana pasada' });
  assert.equal(fechaMala.ok, false);
  assert.equal(plazos.length, 1, 'ninguna de las dos debió escribir');
});

test('crear_tarea exige título y persiste en el servidor', async () => {
  reiniciar();
  const vacio = await ejecutarAccion('crear_tarea', { titulo: '   ' });
  assert.equal(vacio.ok, false);
  assert.equal(tareas.length, 0);

  const r = await ejecutarAccion('crear_tarea', { titulo: 'Redactar contestación', fechaVencimiento: '2026-08-05' });
  assert.equal(r.ok, true);
  assert.equal(tareas.length, 1);
  assert.equal(tareas[0].completada, false);
});

// --- Traducción de lo que propone el asistente -------------------------------

test('el esquema plano del asistente se rearma en los params reales', () => {
  // Gemini devuelve campo/valor sueltos porque los esquemas anidados le salen mal.
  const p = paramsDesdePropuesta({
    accion: 'modificar_expediente', motivo: 'lo pidió', casoRef: 'ROL 302-2025',
    campo: 'asunto', valor: 'cobro ejecutivo'
  });
  assert.deepEqual(p, { casoRef: 'ROL 302-2025', cambios: { asunto: 'cobro ejecutivo' } });

  const t = paramsDesdePropuesta({
    accion: 'modificar_tarea', motivo: 'x', tareaId: 'tar-1', completada: true
  });
  assert.deepEqual(t, { tareaId: 'tar-1', cambios: { completada: true } });

  // `accion` y `motivo` son metadatos del asistente, no parámetros de la acción.
  const g = paramsDesdePropuesta({ accion: 'registrar_gestion', motivo: 'x', casoRef: 'A', tramite: 'y' });
  assert.deepEqual(g, { casoRef: 'A', tramite: 'y' });
});

test('una propuesta del asistente con identificador inventado no llega a escribir', async () => {
  reiniciar();
  // El escenario que más importa: Gemini se saca un ROL de la manga.
  const params = paramsDesdePropuesta({
    accion: 'modificar_expediente', motivo: 'inventado', casoRef: 'ROL 9999-9999',
    campo: 'cliente', valor: 'Otro'
  });
  const previo = await validarAccion('modificar_expediente', params, { expedientes });
  assert.equal(previo.ok, false, 'la validación debe frenarlo antes de mostrar el botón');
  assert.equal(expedientes[0].cliente, 'PEREZ CON FISCO', 'nada cambió');
});

test('el diff de una creación muestra TODOS los campos que se escribirán', async () => {
  reiniciar();
  // Caso real observado: el asistente dijo "para el 6 de agosto" en su respuesta
  // pero omitió `fechaVencimiento` en la acción. Con un diff que sólo mostrara el
  // título, la tarea se aplicaba sin fecha y nadie lo notaba.
  const sinFecha = await validarAccion('crear_tarea', { titulo: 'Preparar alegato' });
  assert.equal(sinFecha.ok, true);
  assert.equal(sinFecha.despues.fechaVencimiento, '(sin fecha)', 'la ausencia de fecha debe ser VISIBLE');

  const conFecha = await validarAccion('crear_tarea', { titulo: 'Preparar alegato', fechaVencimiento: '2026-08-06' });
  assert.equal(conFecha.despues.fechaVencimiento, '2026-08-06');
});

test('el diff de una gestión muestra el texto que se va a escribir', async () => {
  reiniciar();
  const r = await validarAccion('registrar_gestion', { casoRef: 'ROL 302-2025', tramite: 'Llamar al chofer' }, { expedientes });
  assert.equal(r.ok, true);
  assert.equal(r.despues.tramite, 'Llamar al chofer');
  assert.equal(r.despues.expediente, 'ROL 302-2025');
});

test('toda acción declara si es destructiva', async () => {
  // El flotante usará esto para decidir qué exige confirmación explícita.
  for (const [id, accion] of Object.entries(ACCIONES)) {
    assert.equal(typeof accion.destructiva, 'boolean', `${id} debe declarar 'destructiva'`);
    assert.equal(typeof accion.etiqueta, 'string', `${id} debe tener etiqueta legible`);
  }
});

test('abrir_expediente valida y ejecuta abriendo la ficha del caso', async () => {
  reiniciar();
  let seleccionado = null;
  const onSelectCaso = (c) => { seleccionado = c; };

  const rValid = await validarAccion('abrir_expediente', { casoRef: 'ROL 302-2025' }, { expedientes });
  assert.equal(rValid.ok, true);
  assert.equal(rValid.despues.casoRef, 'ROL 302-2025');

  const rEjec = await ejecutarAccion('abrir_expediente', { casoRef: 'ROL 302-2025' }, { expedientes, onSelectCaso });
  assert.equal(rEjec.ok, true);
  assert.notEqual(seleccionado, null);
  assert.equal(seleccionado.id, 'ROL 302-2025');
});
