// Tests del asistente por reglas. Sin ningún modelo de por medio.
//
// El criterio de estos tests no es sólo "acierta cuando puede", sino sobre todo
// "pregunta cuando no puede". Una regla que adivina es peor que una que se detiene.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  interpretar, extraerFecha, resolverReferencia, resolverProcedimiento,
  esConsultaPendientesHoy, resumenPendientesHoy, filasPendientesHoy,
  esConsultaGestionesDeHoy, resumenGestionesDeHoy, filasGestionesDeHoy
} from './asistenteReglas.js';

const HOY = '2026-07-30'; // jueves

const EXPEDIENTES = [
  { id: 'EXT-001-2026', cliente: 'VICTOR GARAI', asunto: 'gestión general', gestiones: [] },
  { id: 'pjud-caso-1225', cliente: 'GARAI/CAMPOS', asunto: 'querella Calbuco', gestiones: [] },
  { id: 'ADM-001-2026', cliente: 'VICTOR GARAI', asunto: 'caso tributario', gestiones: [] },
  { id: 'ROL 821-2026', ritVinculado: 'ROL 821-2026', cliente: 'INTENDENCIA BIO BIO', asunto: 'recurso', gestiones: [] }
];
const CAUSAS = [
  { id: 'pjud-caso-1', rit: 'ROL 35002-2026', caratula: 'MEDINA CON ISAPRE CONSALUD' },
  { id: 'pjud-caso-2', rit: 'ROL 302-2025', caratula: 'PEREZ CON FISCO' },
  { id: 'pjud-caso-1241', rit: 'ROL ', caratula: 'MINISTERIO PUBLICO CALBUCO C/ MELIHUECHUN' },
  { id: 'pjud-caso-9', rit: 'ROL 900-2020', caratula: 'SOTO CON EMPRESA POR DESPIDO INJUSTIFICADO' },
  { id: 'pjud-caso-10', rit: 'ROL 901-2020', caratula: 'ROJAS CON EMPRESA POR DESPIDO INJUSTIFICADO' }
];
const TAREAS = [
  { id: 'tar-1', titulo: 'Redactar contestación', completada: false },
  { id: 'tar-2', titulo: 'Llamar al perito', completada: false }
];

const ctx = { expedientes: EXPEDIENTES, causas: CAUSAS, tareas: TAREAS, desde: HOY };
const dime = (t) => interpretar(t, ctx);

// --- Fechas -------------------------------------------------------------------

test('entiende las fechas como las dicta un abogado', () => {
  assert.equal(extraerFecha('para hoy', HOY), '2026-07-30');
  assert.equal(extraerFecha('para mañana', HOY), '2026-07-31');
  assert.equal(extraerFecha('el 5 de agosto', HOY), '2026-08-05');
  assert.equal(extraerFecha('el 5 de agosto de 2026', HOY), '2026-08-05');
  assert.equal(extraerFecha('05/08/2026', HOY), '2026-08-05');
  assert.equal(extraerFecha('2026-08-05', HOY), '2026-08-05');
  assert.equal(extraerFecha('en 3 días', HOY), '2026-08-02');
  // 30-07-2026 es jueves: "el viernes" es mañana.
  assert.equal(extraerFecha('el viernes', HOY), '2026-07-31');
});

test('un mes ya pasado se entiende del año siguiente', () => {
  // En julio de 2026, "el 5 de marzo" no puede ser el de hace cuatro meses.
  assert.equal(extraerFecha('el 5 de marzo', HOY), '2027-03-05');
});

test('si no hay fecha devuelve null en vez de inventar una', () => {
  assert.equal(extraerFecha('redactar la contestación', HOY), null);
});

// --- Resolución de referencias -------------------------------------------------

test('un ROL escrito manda sobre las palabras', () => {
  const r = resolverReferencia('muéstrame las gestiones del ROL 821-2026', ctx);
  assert.equal(r.porRol, true);
  assert.equal(r.candidatos.length, 1);
  assert.equal(r.candidatos[0].ref, 'ROL 821-2026');
});

test('la palabra "rol" sola no arrastra el catálogo entero', () => {
  // Los 1.557 rit empiezan con "ROL ": si "rol" contara como palabra de búsqueda,
  // cualquier consulta devolvería todo.
  const r = resolverReferencia('muéstrame el rol', ctx);
  assert.equal(r.candidatos.length, 0);
});

test('gana lo que calza con MÁS palabras de la frase', () => {
  const r = resolverReferencia('abre el expediente de Garai de la querella de Calbuco', ctx);
  assert.equal(r.candidatos.length, 1, 'sólo uno calza con garai + querella + calbuco');
  assert.equal(r.candidatos[0].ref, 'pjud-caso-1225');
});

test('una referencia genérica devuelve todos los que calzan', () => {
  const r = resolverReferencia('abre los expedientes de Garai', ctx);
  assert.equal(r.candidatos.length, 3);
});

// --- Abrir fichas --------------------------------------------------------------

test('abre la ficha pedida, en la pestaña que corresponde', () => {
  const r = dime('muéstrame las gestiones del ROL 821-2026');
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].accion, 'abrir_expediente');
  assert.equal(r.acciones[0].casoRef, 'ROL 821-2026');
  assert.equal(r.acciones[0].tab, 'gestiones');

  const s = dime('abre la causa ROL 302-2025');
  assert.equal(s.acciones[0].tab, 'resumen');
});

test('con demasiadas coincidencias pregunta en vez de tapar la pantalla', () => {
  // "despido injustificado" calza con dos causas acá; con el catálogo real eran 32.
  const r = interpretar('muéstrame las causas por despido injustificado', {
    ...ctx,
    causas: Array.from({ length: 9 }, (_, i) => ({
      id: `c${i}`, rit: `ROL ${900 + i}-2020`, caratula: `X${i} CON EMPRESA POR DESPIDO INJUSTIFICADO`
    }))
  });
  assert.equal(r.acciones.length, 0, 'no abre ninguna');
  assert.match(r.respuesta, /cu[aá]l/i, 'pregunta cuál');
});

test('sin coincidencia lo dice, no abre cualquier cosa', () => {
  const r = dime('abre el expediente de Fulanito de Tal');
  assert.equal(r.acciones.length, 0);
  assert.match(r.respuesta, /No encontr/i);
});

test('un ROL que no existe lo dice, no adivina por otras palabras de la frase', () => {
  // Caso real (31-jul-2026): "26397-2019" no está en ningún expediente ni causa.
  // Antes esto seguía de largo a buscar por palabras sueltas del resto de la
  // frase y terminaba abriendo un expediente sin ninguna relación.
  const r = dime('abre el expediente 26397-2019');
  assert.equal(r.acciones.length, 0, 'no abre nada');
  assert.match(r.respuesta, /No encontr.*26397-2019/i);
});

test('un fragmento de una palabra mal escrita no calza por substring con otra palabra', () => {
  // Bug real (31-jul-2026): "ingresa comog estion..." -typo de "como gestión"-
  // generaba el token suelto "estion", que es substring literal de "geSTIÓN" y
  // calzaba con el único expediente de prueba cuyo asunto dice "gestión general"
  // (EXT-001-2026), abriendo un caso sin ninguna relación con lo pedido.
  const r = dime('ingresa comog estion en expediente 26397-2019 visitar la playa para mañana');
  assert.equal(r.acciones.filter((a) => a.accion === 'abrir_expediente').length, 0, 'no abre EXT-001-2026 ni ningún otro por el fragmento "estion"');
  assert.match(r.respuesta, /No encontr.*26397-2019/i, 'como el ROL no existe, lo dice -no cae en adivinar por "estion"-');
});

test('el calce por palabras sigue funcionando con palabras completas (no se rompió el buscador)', () => {
  const r = dime('abre el expediente de gestión general de Garai');
  assert.equal(r.acciones[0].accion, 'abrir_expediente');
  assert.equal(r.acciones[0].casoRef, 'EXT-001-2026');
});

// --- Crear vs mostrar: el verbo "abrir" ----------------------------------------

test('"ábreme UN expediente" crea, no abre fichas', () => {
  const r = dime('ábreme un expediente para Pedro Soto por despido injustificado');
  // Lo que NO debe pasar: abrir las causas que calzan con "despido injustificado".
  assert.equal(r.acciones.filter((a) => a.accion === 'abrir_expediente').length, 0);
  assert.equal(r.acciones[0].accion, 'crear_expediente');
  assert.equal(r.acciones[0].cliente, 'Pedro Soto');
});

test('los verbos inequívocos no necesitan artículo', () => {
  // «crea expediente para X» no llevaba artículo y caía en "no te entendí".
  for (const frase of [
    'crea expediente para Pedro Soto por despido injustificado',
    'nuevo expediente a Juan Pérez por cobro de pesos',
    'inicia una causa para Pedro Soto por querella'
  ]) {
    const r = interpretar(frase, ctx);
    assert.equal(r.acciones[0]?.accion, 'crear_expediente', frase);
  }
});

test('saca cliente y asunto de como se dicta en la práctica', () => {
  const a = dime('crea expediente para Pedro Soto por despido injustificado').acciones[0];
  assert.equal(a.cliente, 'Pedro Soto');
  assert.equal(a.asunto, 'despido injustificado');
  assert.equal(a.tipo, 'judicial', 'despido es materia judicial');

  const b = dime('nuevo expediente a Juan Pérez por cobro de pesos').acciones[0];
  assert.equal(b.cliente, 'Juan Pérez');
  assert.equal(b.asunto, 'cobro de pesos');

  // Dictado explícito, que es lo que se sugiere cuando la frase no alcanza.
  const c = dime('crea expediente cliente: María Rojas, asunto: pensión de alimentos').acciones[0];
  assert.equal(c.cliente, 'María Rojas');
  assert.equal(c.asunto, 'pensión de alimentos');
});

test('quita los tratamientos del nombre', () => {
  // El sistema reconoce al mismo cliente por su nombre: "don Víctor" y "Víctor"
  // tienen que quedar escritos igual o se abren expedientes duplicados.
  for (const [frase, esperado] of [
    ['crea expediente para don Víctor Garai', 'Víctor Garai'],
    ['crea expediente para doña María Rojas', 'María Rojas'],
    ['crea expediente para sr. Juan Pérez', 'Juan Pérez']
  ]) {
    assert.equal(interpretar(frase, ctx).acciones[0].cliente, esperado, frase);
  }
});

test('sin cliente pide el dato en vez de inventarlo', () => {
  const r = dime('crea expediente');
  assert.equal(r.acciones.length, 0);
  assert.match(r.respuesta, /cliente/i);
});

test('avisa si el expediente ya existe en vez de duplicarlo', () => {
  const r = dime('crea expediente para VICTOR GARAI por gestión general');
  assert.equal(r.acciones.length, 0);
  assert.match(r.respuesta, /ya existe/i);
});

test('"abre EL expediente de X" sí muestra la ficha', () => {
  const r = dime('abre el expediente de Garai de la querella de Calbuco');
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].accion, 'abrir_expediente');
});

// --- Gestiones ------------------------------------------------------------------

test('pedir ingresar una gestión abre el formulario apuntado al caso', () => {
  const r = dime('quiero ingresar una gestión en la causa 821-2026');
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].accion, 'abrir_modal_ingreso_gestion');
  assert.equal(r.acciones[0].casoRef, 'ROL 821-2026');
});

test('tolera palabras entre el verbo y "gestión"', () => {
  for (const frase of ['anota una gestión en 821-2026', 'registrar gestión', 'agregar una nueva gestión']) {
    assert.equal(interpretar(frase, ctx).acciones[0]?.accion, 'abrir_modal_ingreso_gestion', frase);
  }
});

// --- Tareas ----------------------------------------------------------------------

test('crea una tarea con su fecha', () => {
  const r = dime('créame una tarea para el 5 de agosto: preparar alegato');
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].accion, 'crear_tarea');
  assert.equal(r.acciones[0].fechaVencimiento, '2026-08-05');
  assert.match(r.acciones[0].titulo, /preparar alegato/i);
});

test('una tarea sin fecha se crea sin fecha, y lo avisa', () => {
  const r = dime('créame una tarea: llamar al perito');
  assert.equal(r.acciones[0].fechaVencimiento, '');
  assert.match(r.respuesta, /sin (fecha|vencimiento)/i);
});

test('marcar una tarea como hecha la identifica sin ambigüedad', () => {
  const r = dime('marca como lista la tarea de la contestación');
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].accion, 'modificar_tarea');
  assert.equal(r.acciones[0].tareaId, 'tar-1');
  assert.equal(r.acciones[0].completada, true);
});

// --- Plazos -----------------------------------------------------------------------

test('vigila un plazo sólo si reconoce la actuación Y la fecha', () => {
  const proc = resolverProcedimiento('contestación de demanda misma comuna');
  assert.ok(proc, 'debe reconocer la actuación por su nombre');

  const r = dime('vigila el plazo de contestación de demanda misma comuna notificada el 2026-08-03');
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].accion, 'vigilar_plazo');
  assert.equal(r.acciones[0].fechaBase, '2026-08-03');
});

test('una actuación vaga NO se convierte en un plazo inventado', () => {
  // "recurso" calza con varias del catálogo. Computar el que sea es peor que no
  // computar: un plazo mal calculado se ve igual de confiable que uno correcto.
  const r = dime('vigílame el plazo del recurso');
  assert.equal(r.acciones.length, 0);
  assert.match(r.respuesta, /cat[aá]logo|C[oó]mputo de T[eé]rminos|exactamente/i);
});

test('sin fecha base no se computa un plazo', () => {
  const r = dime('vigila el plazo de contestación de demanda misma comuna');
  assert.equal(r.acciones.length, 0);
  assert.match(r.respuesta, /fecha/i);
});

// --- Lo que no se puede hacer -------------------------------------------------------

test('borrar se rechaza de plano y se explica la alternativa', () => {
  for (const frase of ['borra el expediente de Garai', 'elimina la tarea del perito']) {
    const r = interpretar(frase, ctx);
    assert.equal(r.acciones.length, 0, frase);
    assert.match(r.respuesta, /no puedo borrar/i);
  }
});

test('una instrucción incomprensible no produce acciones', () => {
  const r = dime('asdfgh qwerty');
  assert.equal(r.acciones.length, 0);
});

test('el texto vacío no revienta', () => {
  assert.equal(interpretar('', ctx).acciones.length, 0);
  assert.equal(interpretar(null, ctx).acciones.length, 0);
});

// --- Consulta global: "qué tengo pendiente hoy" --------------------------------
//
// El caso real que reventaba: "todas las gestiones pendientes para hoy" no es una
// orden sobre un caso puntual, es una pregunta global, y no existía ninguna regla
// para esa forma — caía en el "no te entendí" genérico.

test('reconoce la consulta global de pendientes, en varias formas', () => {
  for (const frase of [
    'todas las gestiones pendientes para hoy',   // la frase exacta que falló
    'gestiones pendientes',
    'tareas pendientes',
    'qué tengo pendiente hoy',
    'que tengo pendiente',
    'qué hay para hoy',
    'qué debo hacer',
    'resumen del día',
    'agenda de hoy'
  ]) {
    assert.equal(esConsultaPendientesHoy(frase), true, frase);
  }
});

test('no confunde una consulta con una orden sobre un caso concreto', () => {
  for (const frase of [
    'abre el expediente de Garai',
    'crea una tarea para el viernes: llamar al cliente',
    'anota una gestión en 821-2026',
    'vigila el plazo de contestación'
  ]) {
    assert.equal(esConsultaPendientesHoy(frase), false, frase);
  }
});

test('"borra todas las gestiones pendientes" sigue siendo un rechazo de borrado, no un listado', () => {
  // Aunque contiene "todas las gestiones", ganar la lectura de "borrar" es lo
  // correcto: alguien que pide borrar no está pidiendo ver un resumen.
  assert.equal(esConsultaPendientesHoy('borra todas las gestiones pendientes'), false);
  const r = dime('borra todas las gestiones pendientes');
  assert.equal(r.acciones.length, 0);
  assert.match(r.respuesta, /no puedo borrar/i);
});

test('el resumen de pendientes lista lo urgente y lo de bitácora por separado', () => {
  const fixture = {
    atencion: [
      { casoRit: 'ROL 821-2026', titulo: 'Audiencia fijada', etiquetaEstado: 'Vence hoy' }
    ],
    pendientes: [
      { casoRit: 'EXT-001-2026', titulo: 'Consulta a Victor Garai', etiquetaTiempo: 'Pendiente hace 5 días' }
    ]
  };
  const texto = resumenPendientesHoy(fixture);
  assert.match(texto, /ROL 821-2026/);
  assert.match(texto, /Audiencia fijada/);
  assert.match(texto, /Vence hoy/);
  assert.match(texto, /EXT-001-2026/);
  assert.match(texto, /Pendiente hace 5 días/);
  assert.match(texto, /Radar de Plazos/);
});

test('sin nada pendiente el resumen lo dice claro, no queda vacío', () => {
  const texto = resumenPendientesHoy({ atencion: [], pendientes: [] });
  assert.match(texto, /no tienes nada pendiente/i);
});

test('el resumen no revienta si cargarAtencion falla y llega vacío', () => {
  assert.doesNotThrow(() => resumenPendientesHoy());
  assert.doesNotThrow(() => resumenPendientesHoy(undefined));
});

// --- "Todas las gestiones de hoy": sin filtrar por estado ----------------------
//
// Distinta de "pendientes de hoy": ésta no descarta lo ya REALIZADO. Es la
// pregunta de quien cierra el día y quiere ver todo lo que se registró.

test('reconoce el pedido de TODAS las gestiones de hoy', () => {
  for (const frase of [
    'todas las gestiones de hoy',
    'muéstrame todas las gestiones de hoy',
    'gestiones de hoy',
    'qué se hizo hoy',
    'bitácora de hoy',
    'movimientos de hoy'
  ]) {
    assert.equal(esConsultaGestionesDeHoy(frase), true, frase);
  }
});

test('"gestiones pendientes de hoy" sigue siendo la consulta FILTRADA, no ésta', () => {
  // La palabra "pendientes" es la que separa las dos intenciones. Con ella debe
  // ganar la consulta filtrada (pendientesHoy), no la de "todo sin filtrar".
  assert.equal(esConsultaGestionesDeHoy('gestiones pendientes de hoy'), false);
  assert.equal(esConsultaPendientesHoy('gestiones pendientes de hoy'), true);
});

test('la frase original que falló sigue resolviendo a la consulta filtrada', () => {
  // No debe empezar a matchear también la de "todo sin filtrar": las dos listas
  // de frases no deben solaparse.
  const frase = 'todas las gestiones pendientes para hoy';
  assert.equal(esConsultaPendientesHoy(frase), true);
  assert.equal(esConsultaGestionesDeHoy(frase), false);
});

test('"borra todas las gestiones de hoy" no lista nada: sigue siendo un rechazo', () => {
  assert.equal(esConsultaGestionesDeHoy('borra todas las gestiones de hoy'), false);
});

test('el resumen de gestiones de hoy muestra pendientes Y realizadas, separadas', () => {
  const fixture = [
    { casoRit: 'ADM-001-2026', titulo: 'Creación expediente', realizada: false },
    { casoRit: 'ROL 821-2026', titulo: 'Solicitud de copia de audios', realizada: true }
  ];
  const texto = resumenGestionesDeHoy(fixture);
  assert.match(texto, /Gestiones de hoy \(2\)/);
  assert.match(texto, /Pendientes \(1\)/);
  assert.match(texto, /ADM-001-2026/);
  assert.match(texto, /Realizadas \(1\)/);
  assert.match(texto, /ROL 821-2026/);
  // Lo realizado tiene que aparecer: es justo lo que "pendientes de hoy" omite.
  assert.match(texto, /Solicitud de copia de audios/);
});

test('sin ninguna gestión hoy lo dice, no queda en blanco', () => {
  assert.match(resumenGestionesDeHoy([]), /no hay ninguna gesti[oó]n/i);
});

// --- Filas para tabla: mismo dato que el resumen de texto, otra forma --------
//
// El chat mostraba "gestiones pendientes" como párrafo con viñetas; el abogado
// pidió verlo como planilla. Mismos datos, sin recalcular nada.

test('filasPendientesHoy junta atención y bitácora en filas, con su categoría', () => {
  const fixture = {
    atencion: [
      { casoRit: 'ROL 821-2026', titulo: 'Audiencia fijada', etiquetaEstado: 'Vence hoy' }
    ],
    pendientes: [
      { casoRit: 'EXT-001-2026', titulo: 'Consulta a Victor Garai', etiquetaTiempo: 'Pendiente hace 5 días' }
    ]
  };
  const filas = filasPendientesHoy(fixture);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[0], { categoria: 'Atención hoy', rol: 'ROL 821-2026', gestion: 'Audiencia fijada', cuando: 'Vence hoy' });
  assert.deepEqual(filas[1], { categoria: 'Pendiente de bitácora', rol: 'EXT-001-2026', gestion: 'Consulta a Victor Garai', cuando: 'Pendiente hace 5 días' });
});

test('filasPendientesHoy sin nada pendiente devuelve un arreglo vacío, no revienta', () => {
  assert.deepEqual(filasPendientesHoy({ atencion: [], pendientes: [] }), []);
  assert.deepEqual(filasPendientesHoy(), []);
});

test('filasGestionesDeHoy distingue pendientes de realizadas por fila', () => {
  const fixture = [
    { casoRit: 'ADM-001-2026', titulo: 'Creación expediente', realizada: false, estado: 'PENDIENTE (POR HACER)' },
    { casoRit: 'ROL 821-2026', titulo: 'Solicitud de copia de audios', realizada: true, estado: 'REALIZADO' }
  ];
  const filas = filasGestionesDeHoy(fixture);
  assert.equal(filas.length, 2);
  assert.equal(filas[0].categoria, 'Pendiente');
  assert.equal(filas[1].categoria, 'Realizada');
  assert.equal(filas[1].rol, 'ROL 821-2026');
});

// --- sinEntender: la señal para escalar al respaldo de IA ----------------------
//
// Sólo debe encenderse cuando el sistema de verdad no entendió nada. El resto de
// las respuestas -aunque también sean preguntas- ya resolvieron la intención
// correctamente y sólo piden un dato puntual; escalarlas al modelo local sería
// arriesgar una respuesta peor que la regla determinista.

test('sinEntender se enciende SÓLO en el "no te entendí" final', () => {
  const r = dime('asdfgh qwerty esto no significa nada');
  assert.equal(r.sinEntender, true);
});

test('sinEntender NO se enciende en preguntas que ya resolvieron la intención', () => {
  const casos = [
    'borra el expediente de Garai',                                  // rechazo correcto
    'vigílame el plazo del recurso',                                 // proc ambiguo, no vago
    'crea expediente',                                                // falta el cliente
    'marca como lista la tarea del perito inexistente',              // no encontró la tarea
  ];
  for (const frase of casos) {
    const r = dime(frase);
    assert.equal(r.sinEntender ?? false, false, frase);
  }
});
