// Tests del motor de cómputo de plazos judiciales.
//
// Se ejecutan con `npm test` (usa el runner nativo de Node, sin dependencias).
//
// La estrategia es doble a propósito:
//   1. Anclas: fechas concretas verificadas a mano contra el calendario.
//   2. Invariantes: propiedades que deben cumplirse SIEMPRE, sea cual sea la
//      entrada. Son las que atrapan los errores que uno no anticipó, y las que
//      habrían detectado el cómputo invertido de los plazos de anticipación.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularPlazoCPC,
  calcularPlazoCPP,
  calcularPlazoLaboralAdmin,
  esFeriado,
  esInhabilCPC,
  esDomingo
} from './plazosChile.js';

import {
  domingoDePascua,
  solsticioDeJunio,
  listarFeriados,
  nombreFeriado
} from './feriadosChile.js';

const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diaSemana = (f) => new Date(f + 'T12:00:00').getDay(); // 0=dom, 6=sáb

// ---------------------------------------------------------------------------
// Calendario de feriados
// ---------------------------------------------------------------------------

test('Pascua se calcula bien en años conocidos', () => {
  assert.equal(fmt(domingoDePascua(2024)), '2024-03-31');
  assert.equal(fmt(domingoDePascua(2025)), '2025-04-20');
  assert.equal(fmt(domingoDePascua(2026)), '2026-04-05');
  assert.equal(fmt(domingoDePascua(2027)), '2027-03-28');
});

test('Viernes y Sábado Santo derivan de Pascua', () => {
  assert.ok(esFeriado('2025-04-18'), 'Viernes Santo 2025');
  assert.ok(esFeriado('2025-04-19'), 'Sábado Santo 2025');
  assert.ok(esFeriado('2026-04-03'), 'Viernes Santo 2026');
  assert.ok(esFeriado('2026-04-04'), 'Sábado Santo 2026');
});

test('el solsticio de junio coincide con el calendario oficial', () => {
  // Estas dos fechas venían de la lista verificada a mano del estudio.
  assert.equal(fmt(solsticioDeJunio(2025)), '2025-06-20');
  assert.equal(fmt(solsticioDeJunio(2026)), '2026-06-21');
});

test('el solsticio siempre cae entre el 19 y el 22 de junio', () => {
  for (let anio = 2024; anio <= 2060; anio++) {
    const s = solsticioDeJunio(anio);
    assert.equal(s.getMonth(), 5, `${anio}: el solsticio debe caer en junio`);
    assert.ok(s.getDate() >= 19 && s.getDate() <= 22, `${anio}: día ${s.getDate()} fuera de rango`);
  }
});

test('el Día de las Iglesias Evangélicas se traslada según la Ley 20.299', () => {
  // 31-oct-2023 fue martes -> viernes de la semana anterior
  assert.ok(esFeriado('2023-10-27'), '2023: martes se corre al viernes anterior');
  assert.ok(!esFeriado('2023-10-31'));
  // 31-oct-2024 fue jueves -> se mantiene
  assert.ok(esFeriado('2024-10-31'), '2024: jueves no se mueve');
});

test('no queda ningún precipicio de calendario a futuro', () => {
  for (const anio of [2027, 2030, 2040, 2050]) {
    assert.ok(esFeriado(`${anio}-01-01`), `Año Nuevo ${anio}`);
    assert.ok(esFeriado(`${anio}-09-18`), `Independencia ${anio}`);
    assert.ok(esFeriado(`${anio}-12-25`), `Navidad ${anio}`);
    assert.ok(listarFeriados(anio).length >= 15, `${anio} debe tener al menos 15 feriados`);
  }
});

test('nombreFeriado explica por qué se excluyó un día', () => {
  assert.equal(nombreFeriado('2026-09-18'), 'Independencia Nacional');
  assert.equal(nombreFeriado('2026-08-19'), null, 'un miércoles cualquiera no es feriado');
});

// ---------------------------------------------------------------------------
// Anclas: cómputo hacia adelante
// ---------------------------------------------------------------------------

test('CPC cuenta días hábiles e incluye los sábados (Art. 66)', () => {
  assert.equal(calcularPlazoCPC('2026-08-03', 15).fechaVencimiento, '2026-08-21');
});

test('laboral excluye los sábados además de domingos y feriados', () => {
  // Del 3 al 17 de agosto: se salta sáb/dom y el 15 (Asunción, que cae sábado).
  assert.equal(calcularPlazoLaboralAdmin('2026-08-03', 10).fechaVencimiento, '2026-08-17');
});

test('el mismo plazo dura más en laboral que en civil, porque pierde los sábados', () => {
  const civil = calcularPlazoCPC('2026-08-03', 10).fechaVencimiento;
  const laboral = calcularPlazoLaboralAdmin('2026-08-03', 10).fechaVencimiento;
  assert.ok(laboral > civil, `laboral (${laboral}) debe vencer después que civil (${civil})`);
});

test('CPP cuenta días corridos y prorroga si vence en día inhábil (Art. 14)', () => {
  // 10 corridos desde el 8-sep caen el 18-sep (feriado) -> se prorroga.
  const r = calcularPlazoCPP('2026-09-08', 10);
  assert.equal(r.fechaVencimiento, '2026-09-21');
  assert.ok(r.observacionProrroga, 'debe explicar la prórroga en pantalla');
});

test('CPP no prorroga cuando el vencimiento ya cae en día hábil', () => {
  const r = calcularPlazoCPP('2026-08-03', 5);
  assert.equal(r.fechaVencimiento, '2026-08-08');
  assert.equal(r.observacionProrroga, null);
});

// ---------------------------------------------------------------------------
// Anclas: cómputo hacia atrás (plazos de anticipación)
// ---------------------------------------------------------------------------

test('Art. 453 Nº1 CT: la contestación laboral se cuenta ANTES de la audiencia', () => {
  assert.equal(calcularPlazoLaboralAdmin('2026-08-20', 5, true).fechaVencimiento, '2026-08-13');
});

test('Art. 54 Ley 19.968: el cómputo hacia atrás salta los feriados intermedios', () => {
  // Entre el 18 y el 26 de mayo se cruza el 21 (Glorias Navales).
  assert.equal(calcularPlazoLaboralAdmin('2026-05-26', 5, true).fechaVencimiento, '2026-05-18');
});

test('Art. 261 CPP: 15 días corridos antes de la APJO', () => {
  assert.equal(calcularPlazoCPP('2026-08-20', 15, true).fechaVencimiento, '2026-08-05');
});

// ---------------------------------------------------------------------------
// Invariantes: las que atrapan lo que no se anticipó
// ---------------------------------------------------------------------------

const BASES = ['2026-01-05', '2026-04-02', '2026-05-20', '2026-08-03', '2026-09-17', '2026-12-24', '2027-06-18'];
const PLAZOS = [1, 2, 3, 5, 8, 10, 15, 20];

test('INVARIANTE: un plazo de anticipación nunca vence después del hito', () => {
  // Éste es exactamente el error que tenía el sistema: la contestación laboral
  // vencía una semana DESPUÉS de la audiencia a la que había que llegar.
  for (const base of BASES) {
    for (const dias of PLAZOS) {
      for (const calc of [calcularPlazoCPC, calcularPlazoLaboralAdmin, calcularPlazoCPP]) {
        const r = calc(base, dias, true);
        assert.ok(r.fechaVencimiento < base,
          `${calc.name}(${base}, ${dias}, atrás) dio ${r.fechaVencimiento}, que no es anterior al hito`);
      }
    }
  }
});

test('INVARIANTE: un plazo hacia adelante nunca vence antes de la notificación', () => {
  for (const base of BASES) {
    for (const dias of PLAZOS) {
      for (const calc of [calcularPlazoCPC, calcularPlazoLaboralAdmin, calcularPlazoCPP]) {
        const r = calc(base, dias);
        assert.ok(r.fechaVencimiento > base,
          `${calc.name}(${base}, ${dias}) dio ${r.fechaVencimiento}, anterior a la base`);
      }
    }
  }
});

test('INVARIANTE: en CPC y laboral el vencimiento siempre cae en día hábil', () => {
  for (const base of BASES) {
    for (const dias of PLAZOS) {
      for (const atras of [false, true]) {
        const civil = calcularPlazoCPC(base, dias, atras).fechaVencimiento;
        assert.ok(!esInhabilCPC(civil), `CPC ${base}/${dias}/${atras}: ${civil} es inhábil`);

        const lab = calcularPlazoLaboralAdmin(base, dias, atras).fechaVencimiento;
        assert.ok(!esDomingo(lab) && !esFeriado(lab) && diaSemana(lab) !== 6,
          `Laboral ${base}/${dias}/${atras}: ${lab} no es hábil de lunes a viernes`);
      }
    }
  }
});

test('INVARIANTE: se cuentan exactamente los días hábiles pedidos, ni uno más', () => {
  for (const base of BASES) {
    for (const dias of PLAZOS) {
      for (const atras of [false, true]) {
        const r = calcularPlazoCPC(base, dias, atras);
        const contados = r.desglose.filter((d) => d.numero !== null).length;
        assert.equal(contados, dias, `CPC ${base}/${dias}/${atras}: contó ${contados}`);
      }
    }
  }
});

test('INVARIANTE: más días de plazo nunca dan una fecha más corta', () => {
  for (const base of BASES) {
    for (let dias = 1; dias < 20; dias++) {
      const corto = calcularPlazoCPC(base, dias).fechaVencimiento;
      const largo = calcularPlazoCPC(base, dias + 1).fechaVencimiento;
      assert.ok(largo > corto, `${base}: ${dias + 1} días (${largo}) no supera a ${dias} días (${corto})`);
    }
  }
});

test('INVARIANTE: el resultado no depende de la zona horaria del computador', () => {
  // Antes sí dependía: toISOString() devuelve UTC, así que el mismo cómputo
  // daba 21-08 en Santiago y 20-08 en Madrid.
  const tzOriginal = process.env.TZ;
  const esperado = {};
  try {
    for (const tz of ['America/Santiago', 'Europe/Madrid', 'Asia/Tokyo', 'UTC', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      for (const base of BASES) {
        for (const dias of [5, 15]) {
          const clave = `${base}/${dias}`;
          const valor = calcularPlazoCPC(base, dias).fechaVencimiento;
          if (esperado[clave] === undefined) esperado[clave] = valor;
          assert.equal(valor, esperado[clave], `${clave} cambió en ${tz}`);
        }
      }
    }
  } finally {
    if (tzOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = tzOriginal;
  }
});

// ---------------------------------------------------------------------------
// Entradas inválidas: deben reventar, nunca devolver un plazo inventado
// ---------------------------------------------------------------------------

test('una entrada inválida lanza error en vez de inventar una fecha', () => {
  assert.throws(() => calcularPlazoCPC('', 5), /Fecha base inválida/);
  assert.throws(() => calcularPlazoCPC('20-08-2026', 5), /Fecha base inválida/);
  assert.throws(() => calcularPlazoCPC('2026-02-30', 5), /no existe en el calendario/);
  assert.throws(() => calcularPlazoCPC('2026-08-03', 0), /Plazo inválido/);
  assert.throws(() => calcularPlazoCPC('2026-08-03', -3), /Plazo inválido/);
  assert.throws(() => calcularPlazoCPC('2026-08-03', 2.5), /Plazo inválido/);
  assert.throws(() => calcularPlazoLaboralAdmin('2026-08-03', NaN), /Plazo inválido/);
});
