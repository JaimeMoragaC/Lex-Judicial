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
  resumen,
  requiereAtencion,
  cargarAgenda,
  gestionesDeHoy,
  audienciasProximas,
  NATURALEZA
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

// --- La regla única de "qué requiere mi atención hoy" ------------------------
// Estos tests fijan la asimetría que antes vivía duplicada en cada pantalla y se
// corrigió cuatro veces por separado.

test('un plazo fatal vencido requiere atención; un trámite de fecha pasada no', () => {
  const hoy = '2026-08-07';
  const fatal = { naturaleza: NATURALEZA.FATAL, fechaObjetivo: '2026-08-03', regimen: 'CPC' };
  const tramite = { naturaleza: NATURALEZA.TRAMITE, fechaObjetivo: '2026-08-03', regimen: 'CPC' };

  assert.equal(clasificar(fatal, hoy), 'VENCIDO');
  assert.equal(clasificar(tramite, hoy), 'VENCIDO');

  // Misma fecha, mismo estado del semáforo, decisión opuesta: en el fatal la
  // fecha es un vencimiento computado, en el trámite es una fecha elegida a mano.
  assert.equal(requiereAtencion(fatal, hoy), true);
  assert.equal(requiereAtencion(tramite, hoy), false);
});

test('lo de hoy requiere atención venga de donde venga', () => {
  const hoy = '2026-08-07';
  for (const naturaleza of [NATURALEZA.FATAL, NATURALEZA.TRAMITE]) {
    assert.equal(
      requiereAtencion({ naturaleza, fechaObjetivo: '2026-08-07', regimen: 'CPC' }, hoy),
      true,
      `${naturaleza} de hoy debe aparecer`
    );
    assert.equal(
      requiereAtencion({ naturaleza, fechaObjetivo: '2026-09-30', regimen: 'CPC' }, hoy),
      false,
      `${naturaleza} lejano no debe aparecer`
    );
  }
});

test('un plazo fatal se anticipa; un trámite de otro día no', () => {
  const hoy = '2026-08-07';
  // 1 día hábil por delante: CRITICO.
  const manana = { fechaObjetivo: '2026-08-08', regimen: 'CPC' };

  // El fatal hay que verlo antes de que llegue: prepararlo es el trabajo de hoy.
  assert.equal(requiereAtencion({ ...manana, naturaleza: NATURALEZA.FATAL }, hoy), true);
  // El trámite agendado para mañana NO es trabajo de hoy. Esto es lo que hacía
  // aparecer "tareas de otros días" en la sección del día.
  assert.equal(requiereAtencion({ ...manana, naturaleza: NATURALEZA.TRAMITE }, hoy), false);

  // Lo mismo a 5 días hábiles (URGENTE).
  const enCinco = { fechaObjetivo: '2026-08-13', regimen: 'CPC' };
  assert.equal(requiereAtencion({ ...enCinco, naturaleza: NATURALEZA.FATAL }, hoy), true);
  assert.equal(requiereAtencion({ ...enCinco, naturaleza: NATURALEZA.TRAMITE }, hoy), false);
});

test('un pendiente de bitácora sigue requiriendo atención después de su día', () => {
  // La Bitácora estampa fecha = hoy al registrar. Esa fecha no es un vencimiento,
  // así que clasificarla por fecha hacía que la gestión apareciera SÓLO el día en
  // que la escribías y desapareciera al siguiente, aunque siguiera sin hacerse.
  const anotadaEl3 = { naturaleza: NATURALEZA.PENDIENTE, fechaObjetivo: '2026-08-03', regimen: 'CPC' };

  assert.equal(requiereAtencion(anotadaEl3, '2026-08-03'), true, 'el día que se anota');
  assert.equal(requiereAtencion(anotadaEl3, '2026-08-04'), true, 'al día siguiente');
  assert.equal(requiereAtencion(anotadaEl3, '2026-09-30'), true, 'dos meses después sigue pendiente');

  // Aunque por fecha caiga en VENCIDO, eso no la saca de la lista.
  assert.equal(clasificar(anotadaEl3, '2026-09-30'), 'VENCIDO');
});

test('una gestión en el servidor y en localStorage no se duplica', async () => {
  // La ficha guardaba en localStorage bajo el id interno de la causa
  // (`pjud-caso-137`), y ahora guarda en el servidor, donde el expediente se
  // identifica por el ROL. La misma gestión llega con dos claves distintas: si se
  // deduplica antes de resolver la identidad, aparece repetida en el semáforo.
  const causa = { id: 'pjud-caso-137', rit: 'ROL 302-2025', caratula: 'PEREZ CON FISCO', origen: 'EXCEL_PJUD_OFICIAL' };
  const gestion = { tramite: 'Revisar contestación', fechaIso: '2026-07-30', fechaEsTramite: true, estado: 'PENDIENTE' };

  const store = { [`lexcontrol_gestiones_${causa.id}`]: JSON.stringify([gestion]) };
  const claves = Object.keys(store);
  const previo = globalThis.localStorage;
  globalThis.localStorage = {
    get length() { return claves.length; },
    key: (i) => claves[i] ?? null,
    getItem: (k) => store[k] ?? null
  };

  try {
    const expedientes = [{ id: causa.rit, ritVinculado: causa.rit, cliente: causa.caratula, gestiones: [gestion] }];
    const agenda = await cargarAgenda([causa], expedientes);

    assert.equal(agenda.length, 1, 'debe quedar una sola entrada');
    assert.equal(agenda[0].casoRit, causa.rit, 'mostrada con el ROL real, no con el id interno');
    assert.equal(agenda[0].enPlanilla, true);
  } finally {
    globalThis.localStorage = previo;
  }
});

test('la gestión "Ingreso PJUD" de la migración masiva no cuenta como pendiente', async () => {
  // Caso real (31-jul-2026): la migración masiva deja en CADA expediente
  // espejado una gestión sin `estado` que sólo documenta cuándo se importó la
  // causa desde el PJUD -no es un trabajo por hacer-. Sin este descarte,
  // naturalezaDeGestion() la clasificaba como PENDIENTE por defecto (no tiene
  // fechaIso ni fechaEsTramite) con la fecha de ingreso, a veces de décadas
  // atrás, e inundaba "pendientes" con 1.430 entradas fantasma de este tipo en
  // los datos reales, enterrando cualquier pendiente genuino anotado hoy.
  const expedientes = [
    {
      id: 'pjud-caso-670', ritVinculado: 'ROL V-21179-1995', cliente: 'HENRÍQUEZ',
      gestiones: [{
        id: 'gst-pjud-pjud-caso-670', fecha: '05/03/1995', tipo: 'Ingreso PJUD',
        consisteEn: 'Causa importada desde el PJUD.', origen: 'Excel Oficial PJUD'
      }]
    },
    {
      id: 'EXT-003-2026', ritVinculado: 'EXT-003-2026', cliente: 'RODRIGO OJEDA',
      gestiones: [{ tramite: 'Consulta sobre escritura pública', estado: 'PENDIENTE (POR HACER)', fecha: '31/07/2026' }]
    }
  ];
  const agenda = await cargarAgenda([], expedientes, []);
  assert.equal(agenda.some((g) => g.casoRit === 'ROL V-21179-1995'), false, 'el "Ingreso PJUD" no entra a la agenda');
  assert.equal(agenda.some((g) => g.casoRit === 'EXT-003-2026'), true, 'el pendiente real sí entra');
});

test('sin naturaleza declarada se trata como plazo fatal', () => {
  // Un plazo guardado por una versión anterior no trae el campo. Tratarlo como
  // fatal es el lado seguro: se muestra de más, no de menos.
  assert.equal(requiereAtencion({ fechaObjetivo: '2026-08-03', regimen: 'CPC' }, '2026-08-07'), true);
});

test('clasificar prefiere fechaObjetivo sobre los campos antiguos', () => {
  // Convivencia con registros viejos que traen fechaVencimiento sin fechaObjetivo.
  assert.equal(clasificar({ fechaVencimiento: '2026-08-07', regimen: 'CPC' }, '2026-08-07'), 'HOY');
  assert.equal(
    clasificar({ fechaObjetivo: '2026-08-07', fechaVencimiento: '2026-09-30', regimen: 'CPC' }, '2026-08-07'),
    'HOY'
  );
});

test('el orden no revienta cuando una entrada no tiene fechaVencimiento', () => {
  // Una gestión ya no lleva fechaVencimiento: antes ordenarPorUrgencia hacía
  // a.fechaVencimiento.localeCompare(...) y explotaba con undefined.
  const items = [
    { id: 'g', naturaleza: NATURALEZA.PENDIENTE, fechaObjetivo: '2026-08-08', regimen: 'CPC' },
    { id: 'f', naturaleza: NATURALEZA.FATAL, fechaObjetivo: '2026-08-07', fechaVencimiento: '2026-08-07', regimen: 'CPC' }
  ];
  const orden = ordenarPorUrgencia(items, '2026-08-07').map((i) => i.id);
  assert.deepEqual(orden, ['f', 'g']);
});

// --- gestionesDeHoy: TODO lo registrado hoy, sin filtrar por estado -----------
//
// A diferencia de gestionesDeExpedientes() (interno, usado por cargarAtencion
// para el semáforo), esto NO descarta lo REALIZADO. Son preguntas distintas:
// "qué requiere atención" vs. "qué se registró hoy".

test('trae gestiones de hoy sin importar el estado', () => {
  const expedientes = [
    {
      id: 'EXT-001-2026', ritVinculado: null, cliente: 'VICTOR GARAI',
      gestiones: [
        { fecha: '30-07-2026', tramite: 'Pendiente de hoy', estado: 'PENDIENTE (POR HACER)' },
        { fecha: '30-07-2026', tramite: 'Ya cerrada hoy', estado: 'COMPLETADO' },
        { fecha: '29-07-2026', tramite: 'De ayer, no cuenta', estado: 'PENDIENTE (POR HACER)' }
      ]
    }
  ];
  const r = gestionesDeHoy(expedientes, '2026-07-30');
  assert.equal(r.length, 2, 'sólo las de hoy, pero las dos, sin filtrar por estado');
  assert.ok(r.some((g) => g.titulo === 'Pendiente de hoy' && g.realizada === false));
  assert.ok(r.some((g) => g.titulo === 'Ya cerrada hoy' && g.realizada === true));
  assert.ok(!r.some((g) => g.titulo.includes('De ayer')));
});

test('sin expedientes o sin gestiones no revienta', () => {
  assert.deepEqual(gestionesDeHoy([], '2026-07-30'), []);
  assert.deepEqual(gestionesDeHoy(undefined, '2026-07-30'), []);
  assert.deepEqual(gestionesDeHoy([{ id: 'X', gestiones: [] }], '2026-07-30'), []);
});

// --- audienciasProximas: sólo lo que el tribunal fijó como audiencia real -----
//
// Depende del flag `esAudiencia` -lo pone el servidor sólo cuando el análisis
// del documento detectó una fecha de audiencia real, nunca por cualquier
// trámite con fecha propia (ver gestion_desde_analisis() en el servidor)-.

test('audienciasProximas trae sólo gestiones con esAudiencia dentro de la ventana', () => {
  const expedientes = [
    {
      id: 'pjud-caso-1', ritVinculado: 'ROL 1-2026', caratula: 'A CON B', tribunal: 'Corte Suprema',
      gestiones: [
        { id: 'g1', fechaIso: '2026-08-05', horaAudiencia: '09:30', tramite: 'Audiencia de juicio oral', esAudiencia: true },
        { id: 'g2', fechaIso: '2026-08-10', tramite: 'Trámite cualquiera con fecha, no es audiencia' },
        { id: 'g3', fechaIso: '2026-06-01', tramite: 'Audiencia ya pasada', esAudiencia: true }
      ]
    },
    {
      id: 'pjud-caso-2', ritVinculado: 'ROL 2-2026', caratula: 'C CON D', tribunal: 'Juzgado de Cañete',
      gestiones: [
        { id: 'g4', fechaIso: '2026-09-15', tramite: 'Audiencia fuera de los 30 días', esAudiencia: true }
      ]
    }
  ];
  const r = audienciasProximas(expedientes, 30, '2026-08-01');
  assert.equal(r.length, 1, 'sólo entra la que tiene esAudiencia Y está dentro de la ventana futura');
  assert.equal(r[0].tramite, 'Audiencia de juicio oral');
  assert.equal(r[0].hora, '09:30');
  assert.equal(r[0].casoRit, 'ROL 1-2026');
});

test('audienciasProximas respeta el rango de días pedido', () => {
  const expedientes = [
    {
      id: 'X', ritVinculado: 'ROL X', caratula: 'X', tribunal: 'T',
      gestiones: [{ id: 'g1', fechaIso: '2026-08-20', tramite: 'Audiencia', esAudiencia: true }]
    }
  ];
  assert.equal(audienciasProximas(expedientes, 7, '2026-08-01').length, 0, 'a 19 días, no entra con ventana de 7');
  assert.equal(audienciasProximas(expedientes, 30, '2026-08-01').length, 1, 'sí entra con ventana de 30');
});

test('audienciasProximas sin expedientes o sin gestiones no revienta', () => {
  assert.deepEqual(audienciasProximas([], 30, '2026-08-01'), []);
  assert.deepEqual(audienciasProximas(undefined, 30, '2026-08-01'), []);
  assert.deepEqual(audienciasProximas([{ id: 'X', gestiones: [] }], 30, '2026-08-01'), []);
});

// --- El vencimiento real decide "requiere atención hoy", no la fecha de trámite ---
//
// Antes gestionesDeExpedientes() anclaba fechaObjetivo siempre a la fecha de
// trámite (cuándo se anotó la gestión), ignorando fechaVencimiento (el plazo
// fatal real elegido en el formulario). Un trámite anotado hoy con vencimiento
// en tres semanas aparecía urgente HOY; y el día en que el vencimiento real
// llegaba, con la fecha de trámite ya en el pasado, la gestión no aparecía
// vencida en ninguna parte -ACCIONABLES_TRAMITE sólo mira el día exacto de la
// fecha de trámite, nunca "ya pasó"-.

test('una gestión con vencimiento lejano NO urge hoy aunque se haya anotado hoy', async () => {
  const hoy = '2026-08-07';
  const expedientes = [{
    id: 'EXP-1', ritVinculado: 'ROL 1-2026', cliente: 'CLIENTE UNO',
    gestiones: [{
      tramite: 'Se presentó demanda, vence en 3 semanas',
      estado: 'PENDIENTE (POR HACER)',
      fecha: '07/08/2026',
      fechaVencimiento: '28/08/2026',
      fechaEsTramite: true
    }]
  }];
  const agenda = await cargarAgenda([], expedientes, []);
  const g = agenda.find((i) => i.casoRit === 'ROL 1-2026');
  assert.ok(g, 'la gestión entra a la agenda');
  assert.equal(g.fechaObjetivo, '2026-08-28', 'se ancla al vencimiento, no a la fecha de trámite');
  assert.equal(requiereAtencion(g, hoy), false, 'no urge hoy: el vencimiento real está a 3 semanas');
});

test('una gestión con vencimiento ya pasado SÍ urge, aunque la fecha de trámite sea vieja', async () => {
  const hoy = '2026-08-07';
  const expedientes = [{
    id: 'EXP-2', ritVinculado: 'ROL 2-2026', cliente: 'CLIENTE DOS',
    gestiones: [{
      tramite: 'Trámite anotado hace semanas, plazo ya vencido',
      estado: 'PENDIENTE (POR HACER)',
      fecha: '10/07/2026',
      fechaVencimiento: '05/08/2026',
      fechaEsTramite: true
    }]
  }];
  const agenda = await cargarAgenda([], expedientes, []);
  const g = agenda.find((i) => i.casoRit === 'ROL 2-2026');
  assert.ok(g, 'la gestión entra a la agenda');
  assert.equal(clasificar(g, hoy), 'VENCIDO');
  assert.equal(requiereAtencion(g, hoy), true, 'urge: el plazo real ya venció, aunque la fecha de trámite sea vieja');
});

test('sin fechaVencimiento, se preserva el comportamiento de trámite (sólo urge el día exacto)', async () => {
  const hoy = '2026-08-07';
  const expedientes = [{
    id: 'EXP-3', ritVinculado: 'ROL 3-2026', cliente: 'CLIENTE TRES',
    gestiones: [{
      tramite: 'Trámite sin vencimiento propio',
      estado: 'PENDIENTE (POR HACER)',
      fecha: '10/07/2026',
      fechaEsTramite: true
    }]
  }];
  const agenda = await cargarAgenda([], expedientes, []);
  const g = agenda.find((i) => i.casoRit === 'ROL 3-2026');
  assert.ok(g, 'la gestión entra a la agenda');
  assert.equal(g.fechaObjetivo, '2026-07-10', 'sin vencimiento, se ancla a la fecha de trámite como antes');
  assert.equal(requiereAtencion(g, hoy), false, 'un trámite de otro día no urge hoy');
});
