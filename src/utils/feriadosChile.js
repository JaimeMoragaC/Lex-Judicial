// feriadosChile.js - Cálculo de los feriados legales de Chile para cualquier año.
//
// Reemplaza la lista escrita a mano que sólo cubría 2025 y 2026: pasado el
// 31-12-2026 el motor de plazos habría contado el 18 de septiembre como día
// hábil, en silencio y sin avisar.
//
// Los feriados se derivan de la ley, no de una tabla:
//   - Viernes y Sábado Santo salen del cómputo de Pascua (algoritmo de Meeus).
//   - El Día de los Pueblos Indígenas es el solsticio de junio (Ley 21.357),
//     que cae el 20, 21 o 22 según el año y hay que evaluarlo en hora de Chile.
//   - San Pedro y San Pablo (29-jun) y Encuentro de Dos Mundos (12-oct) se
//     trasladan según la Ley 20.215.
//   - El Día de las Iglesias Evangélicas (31-oct) se traslada según la Ley 20.299.
//   - El 18 de septiembre arrastra un feriado adicional según el día en que cae.

const MS_DIA = 86400000;

function aFechaLocal(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function fecha(anio, mes, dia) {
  return new Date(anio, mes - 1, dia);
}

function sumarDias(f, n) {
  return new Date(f.getTime() + n * MS_DIA);
}

/**
 * Domingo de Pascua gregoriano (algoritmo de Meeus/Jones/Butcher).
 * De aquí salen el Viernes Santo (Pascua - 2) y el Sábado Santo (Pascua - 1).
 */
export function domingoDePascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return fecha(anio, mes, dia);
}

// Términos periódicos de Meeus (Astronomical Algorithms, cap. 27) para afinar
// el instante del solsticio. Sin ellos el error llega a varias horas, que es
// justo lo que decide si el solsticio cae el 20 o el 21 en hora chilena.
const TERMINOS_SOLSTICIO = [
  [485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186],
  [182, 27.85, 445267.112], [156, 73.14, 45036.886], [136, 171.52, 22518.443],
  [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513],
  [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226],
  [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417],
  [18, 155.12, 67555.328], [17, 288.79, 4562.452], [16, 198.04, 62894.029],
  [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756],
  [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074]
];

const rad = (grados) => (grados * Math.PI) / 180;

/**
 * Fecha del solsticio de junio en hora local de Chile continental.
 * Es el Día Nacional de los Pueblos Indígenas (Ley 21.357).
 */
export function solsticioDeJunio(anio) {
  const Y = (anio - 2000) / 1000;
  // Instante medio del solsticio en Días Julianos (JDE0)
  const jde0 = 2451716.56767 + 365241.62603 * Y + 0.00325 * Y ** 2
    + 0.00888 * Y ** 3 - 0.0003 * Y ** 4;

  const T = (jde0 - 2451545.0) / 36525;
  const W = 35999.373 * T - 2.47;
  const deltaLambda = 1 + 0.0334 * Math.cos(rad(W)) + 0.0007 * Math.cos(rad(2 * W));
  const S = TERMINOS_SOLSTICIO.reduce((acc, [A, B, C]) => acc + A * Math.cos(rad(B + C * T)), 0);
  const jde = jde0 + (0.00001 * S) / deltaLambda;

  // Día Juliano -> milisegundos UTC (JD 2440587.5 = epoch Unix)
  const utc = new Date((jde - 2440587.5) * MS_DIA);

  // El feriado se fija por la fecha en Chile continental, no en UTC.
  const enChile = new Date(utc.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  return fecha(enChile.getFullYear(), enChile.getMonth() + 1, enChile.getDate());
}

/**
 * Traslado de la Ley 20.215 para el 29 de junio y el 12 de octubre:
 * si caen martes, miércoles o jueves se corren al lunes de esa misma semana;
 * si caen viernes, al lunes de la semana siguiente. En otro caso no se mueven.
 */
function trasladarLey20215(f) {
  const dia = f.getDay(); // 0=domingo ... 6=sábado
  if (dia >= 2 && dia <= 4) return sumarDias(f, -(dia - 1)); // martes/miércoles/jueves -> lunes anterior
  if (dia === 5) return sumarDias(f, 3);                     // viernes -> lunes siguiente
  return f;
}

/**
 * Traslado de la Ley 20.299 para el Día de las Iglesias Evangélicas (31-oct):
 * si cae martes se celebra el viernes de la semana anterior; si cae miércoles,
 * el viernes de la misma semana. En otro caso se mantiene el 31.
 */
function trasladarLey20299(f) {
  const dia = f.getDay();
  if (dia === 2) return sumarDias(f, -4); // martes -> viernes anterior
  if (dia === 3) return sumarDias(f, 2);  // miércoles -> viernes siguiente
  return f;
}

/**
 * Devuelve un Map 'YYYY-MM-DD' -> nombre del feriado para el año pedido.
 */
export function feriadosDe(anio) {
  const pascua = domingoDePascua(anio);
  const dieciocho = fecha(anio, 9, 18);

  const lista = [
    [fecha(anio, 1, 1), 'Año Nuevo'],
    [sumarDias(pascua, -2), 'Viernes Santo'],
    [sumarDias(pascua, -1), 'Sábado Santo'],
    [fecha(anio, 5, 1), 'Día Nacional del Trabajo'],
    [fecha(anio, 5, 21), 'Día de las Glorias Navales'],
    [solsticioDeJunio(anio), 'Día Nacional de los Pueblos Indígenas'],
    [trasladarLey20215(fecha(anio, 6, 29)), 'San Pedro y San Pablo'],
    [fecha(anio, 7, 16), 'Virgen del Carmen'],
    [fecha(anio, 8, 15), 'Asunción de la Virgen'],
    [fecha(anio, 9, 18), 'Independencia Nacional'],
    [fecha(anio, 9, 19), 'Día de las Glorias del Ejército'],
    [trasladarLey20215(fecha(anio, 10, 12)), 'Encuentro de Dos Mundos'],
    [trasladarLey20299(fecha(anio, 10, 31)), 'Día de las Iglesias Evangélicas'],
    [fecha(anio, 11, 1), 'Día de Todos los Santos'],
    [fecha(anio, 12, 8), 'Inmaculada Concepción'],
    [fecha(anio, 12, 25), 'Navidad']
  ];

  // Art. 2 Ley 20.215: si el 18 cae martes se agrega el lunes 17; si cae
  // miércoles, se agrega el viernes 20.
  if (dieciocho.getDay() === 2) lista.push([fecha(anio, 9, 17), 'Fiestas Patrias (Ley 20.215)']);
  if (dieciocho.getDay() === 3) lista.push([fecha(anio, 9, 20), 'Fiestas Patrias (Ley 20.215)']);

  const mapa = new Map();
  for (const [f, nombre] of lista) mapa.set(aFechaLocal(f), nombre);
  return mapa;
}

/**
 * Ajustes manuales sobre el resultado del algoritmo.
 *
 * Las reglas de traslado admiten lectura discutible cuando el feriado cae en
 * domingo o sábado, y ahí manda el calendario oficial, no este archivo. Cuando
 * verifiques una fecha contra el calendario oficial, fíjala acá y el algoritmo
 * deja de opinar sobre ella.
 *
 *   2026: { quitar: ['2026-10-31'], agregar: { '2026-10-30': 'Iglesias Evangélicas' } }
 *
 * El criterio por defecto es no inventar feriados que la ley no ordena mover:
 * un feriado de más alarga el plazo y te haría creer que tienes un día extra
 * que no tienes. Ante la duda, el algoritmo se queda corto y no largo.
 */
export const AJUSTES_OFICIALES = {
  // Vacío a propósito: hasta ahora el algoritmo no ha necesitado correcciones.
};

// Los años ya calculados se guardan para no repetir el cómputo en cada consulta.
const cache = new Map();

function feriadosCache(anio) {
  if (!cache.has(anio)) {
    const mapa = feriadosDe(anio);
    const ajuste = AJUSTES_OFICIALES[anio];
    if (ajuste) {
      for (const f of ajuste.quitar || []) mapa.delete(f);
      for (const [f, nombre] of Object.entries(ajuste.agregar || {})) mapa.set(f, nombre);
    }
    cache.set(anio, mapa);
  }
  return cache.get(anio);
}

/**
 * ¿Es feriado legal en Chile la fecha 'YYYY-MM-DD'?
 * Funciona para cualquier año, sin tabla que mantener.
 */
export function esFeriado(fechaStr) {
  if (!fechaStr) return false;
  const anio = Number(fechaStr.slice(0, 4));
  if (!Number.isFinite(anio)) return false;
  return feriadosCache(anio).has(fechaStr);
}

/**
 * Nombre del feriado, o null si el día es hábil. Sirve para explicar en
 * pantalla por qué un día quedó excluido del cómputo.
 */
export function nombreFeriado(fechaStr) {
  if (!fechaStr) return null;
  const anio = Number(fechaStr.slice(0, 4));
  if (!Number.isFinite(anio)) return null;
  return feriadosCache(anio).get(fechaStr) || null;
}

/**
 * Listado ordenado de los feriados de un año. Útil para mostrarlos y para
 * contrastarlos con el calendario oficial.
 */
export function listarFeriados(anio) {
  return [...feriadosDe(anio).entries()]
    .map(([fecha, nombre]) => ({ fecha, nombre }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
