// plazosChile.js - Motor de Cálculo Automatizado de Términos Judiciales Chile (CPC & CPP)

// Feriados Legales en Chile (Años 2025 y 2026 para proyección procesal)
export const FERIADOS_CHILE = [
  // 2025
  '2025-01-01', // Año Nuevo
  '2025-04-18', // Viernes Santo
  '2025-04-19', // Sábado Santo
  '2025-05-01', // Día del Trabajo
  '2025-05-21', // Glorias Navales
  '2025-06-20', // Día de los Pueblos Indígenas
  '2025-06-30', // San Pedro y San Pablo
  '2025-07-16', // Virgen del Carmen
  '2025-08-15', // Asunción de la Virgen
  '2025-09-18', // Independencia Nacional
  '2025-09-19', // Glorias del Ejército
  '2025-10-13', // Encuentro de Dos Mundos
  '2025-10-31', // Día de las Iglesias Evangélicas
  '2025-11-01', // Todos los Santos
  '2025-12-08', // Inmaculada Concepción
  '2025-12-25', // Navidad
  // 2026
  '2026-01-01', // Año Nuevo
  '2026-04-03', // Viernes Santo
  '2026-04-04', // Sábado Santo
  '2026-05-01', // Día del Trabajo
  '2026-05-21', // Glorias Navales
  '2026-06-21', // Día de los Pueblos Indígenas
  '2026-06-29', // San Pedro y San Pablo
  '2026-07-16', // Virgen del Carmen
  '2026-08-15', // Asunción de la Virgen
  '2026-09-18', // Independencia Nacional
  '2026-09-19', // Glorias del Ejército
  '2026-10-12', // Encuentro de Dos Mundos
  '2026-10-30', // Día de las Iglesias Evangélicas
  '2026-11-01', // Todos los Santos
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25'  // Navidad
];

/**
 * Verifica si una fecha en formato YYYY-MM-DD es feriado legal en Chile
 */
export function esFeriado(fechaStr) {
  return FERIADOS_CHILE.includes(fechaStr);
}

/**
 * Verifica si un objeto Date o string es Domingo (día 0 en JS)
 */
export function esDomingo(fecha) {
  const d = new Date(fecha + 'T00:00:00');
  return d.getDay() === 0;
}

/**
 * Convierte un Date a 'YYYY-MM-DD' usando el calendario LOCAL.
 *
 * No usar toISOString() para esto: devuelve la fecha en UTC, así que en cualquier
 * huso horario al este de Greenwich la medianoche local cae el día anterior en UTC
 * y todo el cómputo se corre un día. En Chile (UTC-4/-3) coincidía por casualidad.
 */
function aFechaLocal(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Verifica si un día es inhábil según el Código de Procedimiento Civil (Art. 66 CPC)
 * En el CPC, son inhábiles los domingos y los feriados legales. Los sábados SON HÁBILES (a menos que caigan en feriado).
 */
export function esInhabilCPC(fechaStr) {
  return esDomingo(fechaStr) || esFeriado(fechaStr);
}

/**
 * Formatea una fecha YYYY-MM-DD a un texto legible en español
 */
export function formatearFechaEs(fechaStr) {
  if (!fechaStr) return '';
  const [year, month, day] = fechaStr.split('-');
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Motor de Cálculo para el Código de Procedimiento Civil (CPC - Días Hábiles)
 * Art. 66 CPC: Los términos de días que establece el Código son de días hábiles.
 * @param {string} fechaNotificacion - Fecha inicial YYYY-MM-DD (o fecha de la audiencia si se cuenta hacia atrás)
 * @param {number} diasPlazo - Cantidad de días hábiles a contar
 * @param {boolean} esHaciaAtras - true para plazos de anticipación ("X días hábiles ANTES de la audiencia")
 * @returns {object} { fechaVencimiento, desglose: Array<{ dia, fecha, diaSemana, estado, observacion }> }
 */
export function calcularPlazoCPC(fechaNotificacion, diasPlazo, esHaciaAtras = false) {
  let diasContados = 0;
  let fechaActual = new Date(fechaNotificacion + 'T00:00:00');
  const desglose = [];
  const paso = esHaciaAtras ? -1 : 1;

  while (diasContados < diasPlazo) {
    // Avanzar al día siguiente (o retroceder, si el plazo es de anticipación)
    fechaActual.setDate(fechaActual.getDate() + paso);
    const fechaStr = aFechaLocal(fechaActual);
    const diaSemana = fechaActual.toLocaleDateString('es-CL', { weekday: 'short' });

    if (esInhabilCPC(fechaStr)) {
      desglose.push({
        numero: null,
        fecha: fechaStr,
        diaSemana: diaSemana.toUpperCase(),
        estado: 'EXCLUIDO (Inhábil)',
        observacion: esFeriado(fechaStr) ? 'Feriado Legal Chileno' : 'Domingo (Art. 66 CPC)',
        color: 'red'
      });
    } else {
      diasContados++;
      const esSabado = fechaActual.getDay() === 6;
      desglose.push({
        numero: `Día ${diasContados}`,
        fecha: fechaStr,
        diaSemana: diaSemana.toUpperCase(),
        estado: 'HÁBIL (Contado)',
        observacion: esSabado ? '🚨 ¡SÁBADO ES HÁBIL JUDICIAL (Art. 66 CPC)! No omitir en cómputo.' : 'Día hábil procesal civil',
        color: esSabado ? 'orange' : 'green'
      });
    }
  }

  const fechaVencimiento = aFechaLocal(fechaActual);

  return {
    fechaVencimiento,
    fechaVencimientoTexto: esHaciaAtras
      ? `${formatearFechaEs(fechaVencimiento)} (último día para presentar, hasta las 23:59 hrs.)`
      : `${formatearFechaEs(fechaVencimiento)} a las 23:59 hrs.`,
    diasTotalesTranscurridos: desglose.length,
    desglose,
    esHaciaAtras,
    normativa: esHaciaAtras
      ? "Art. 66 Código de Procedimiento Civil (Días hábiles contados HACIA ATRÁS desde la audiencia. Excluye domingos y feriados; los sábados son hábiles)."
      : "Art. 66 Código de Procedimiento Civil (Días hábiles, excluye domingos y feriados. ¡Sábados son legalmente hábiles!)."
  };
}

/**
 * Motor de Cálculo para Materia Laboral y Administrativa (Lunes a Viernes Hábiles)
 * Art. 445 Código del Trabajo y Ley 19.880: Excluye sábados, domingos y feriados chilenos.
 */
export function calcularPlazoLaboralAdmin(fechaNotificacion, diasPlazo, esHaciaAtras = false) {
  let diasContados = 0;
  let fechaActual = new Date(fechaNotificacion + 'T00:00:00');
  const desglose = [];
  const paso = esHaciaAtras ? -1 : 1;

  while (diasContados < diasPlazo) {
    fechaActual.setDate(fechaActual.getDate() + paso);
    const fechaStr = aFechaLocal(fechaActual);
    const diaSemana = fechaActual.toLocaleDateString('es-CL', { weekday: 'short' });
    const esSabado = fechaActual.getDay() === 6;
    const esDom = fechaActual.getDay() === 0;
    const esFer = esFeriado(fechaStr);

    if (esSabado || esDom || esFer) {
      desglose.push({
        numero: null,
        fecha: fechaStr,
        diaSemana: diaSemana.toUpperCase(),
        estado: 'EXCLUIDO (Inhábil)',
        observacion: esFer ? 'Feriado Legal Chileno' : esSabado ? 'Sábado Inhábil (Laboral/Admin)' : 'Domingo Inhábil',
        color: 'red'
      });
    } else {
      diasContados++;
      desglose.push({
        numero: `Día ${diasContados}`,
        fecha: fechaStr,
        diaSemana: diaSemana.toUpperCase(),
        estado: 'HÁBIL (Contado)',
        observacion: 'Día hábil laboral / administrativo (Lunes a Viernes)',
        color: 'green'
      });
    }
  }

  const fechaVencimiento = aFechaLocal(fechaActual);

  return {
    fechaVencimiento,
    fechaVencimientoTexto: esHaciaAtras
      ? `${formatearFechaEs(fechaVencimiento)} (último día para presentar, hasta las 23:59 hrs.)`
      : `${formatearFechaEs(fechaVencimiento)} a las 23:59 hrs.`,
    diasTotalesTranscurridos: desglose.length,
    desglose,
    esHaciaAtras,
    normativa: esHaciaAtras
      ? "Plazo de anticipación contado HACIA ATRÁS desde la audiencia en días hábiles de lunes a viernes (Art. 453 Nº 1 y Nº 5 Código del Trabajo / Art. 54 Ley 19.968)."
      : "Art. 445 Código del Trabajo / Ley 19.880 (Plazo de días hábiles de lunes a viernes, excluyendo sábados, domingos y feriados)."
  };
}

/**
 * Motor de Cálculo para el Código Procesal Penal (CPP - Días Corridos con Prórroga Art. 14)
 * Art. 14 CPP: Los plazos de días son corridos. Si el plazo vence en domingo o feriado, se prorroga hasta las 24:00 hrs del día siguiente no feriado.
 * @param {string} fechaNotificacion - Fecha inicial YYYY-MM-DD
 * @param {number} diasPlazo - Cantidad de días corridos a sumar
 * @param {boolean} esHaciaAtras - Para casos como "15 días antes de la APJO" (Art. 261 CPP)
 */
export function calcularPlazoCPP(fechaNotificacion, diasPlazo, esHaciaAtras = false) {
  let fechaActual = new Date(fechaNotificacion + 'T00:00:00');
  const desglose = [];

  for (let i = 1; i <= diasPlazo; i++) {
    if (esHaciaAtras) {
      fechaActual.setDate(fechaActual.getDate() - 1);
    } else {
      fechaActual.setDate(fechaActual.getDate() + 1);
    }
    
    const fechaStr = aFechaLocal(fechaActual);
    const diaSemana = fechaActual.toLocaleDateString('es-CL', { weekday: 'short' });
    const esInhabil = esDomingo(fechaStr) || esFeriado(fechaStr);
    const esSabado = fechaActual.getDay() === 6;

    desglose.push({
      numero: `Día ${i}`,
      fecha: fechaStr,
      diaSemana: diaSemana.toUpperCase(),
      estado: esInhabil ? 'CORRIDO (Inhábil civil)' : esSabado ? 'CORRIDO (Sábado)' : 'CORRIDO (Hábil)',
      observacion: esInhabil ? 'En CPP los plazos no se suspenden por feriado ni domingo' : esSabado ? 'Sábado en cómputo penal corrido' : 'Día corrido procesal penal',
      color: 'blue'
    });
  }

  let fechaVencimientoStr = aFechaLocal(fechaActual);
  let observacionProrroga = null;

  // REGLA DE SALVACIÓN ART. 14 CPP: Si el día del vencimiento cae en Domingo o Feriado, se prorroga al siguiente día hábil
  if (!esHaciaAtras && (esDomingo(fechaVencimientoStr) || esFeriado(fechaVencimientoStr))) {
    const fechaOrigen = fechaVencimientoStr;
    while (esDomingo(fechaVencimientoStr) || esFeriado(fechaVencimientoStr)) {
      fechaActual.setDate(fechaActual.getDate() + 1);
      fechaVencimientoStr = aFechaLocal(fechaActual);
    }
    const diaSemanaProrroga = fechaActual.toLocaleDateString('es-CL', { weekday: 'short' });
    
    observacionProrroga = `¡ALERTA ART. 14 CPP! El plazo vencía originalmente el ${formatearFechaEs(fechaOrigen)} (día inhábil). Se prorroga de pleno derecho hasta las 24:00 hrs del día hábil siguiente: ${formatearFechaEs(fechaVencimientoStr)}.`;
    
    desglose.push({
      numero: 'PRÓRROGA ART. 14',
      fecha: fechaVencimientoStr,
      diaSemana: diaSemanaProrroga.toUpperCase(),
      estado: 'PRÓRROGA LEGAL HÁBIL',
      observacion: observacionProrroga,
      color: 'gold'
    });
  }

  return {
    fechaVencimiento: fechaVencimientoStr,
    fechaVencimientoTexto: `${formatearFechaEs(fechaVencimientoStr)} a las 24:00 hrs.${observacionProrroga ? ' (Incluye Prórroga Art. 14 CPP)' : ''}`,
    diasTotalesTranscurridos: desglose.length,
    desglose,
    observacionProrroga,
    normativa: "Art. 14 Código Procesal Penal (Días corridos sin interrupción. Prórroga automática si el vencimiento cae en domingo o feriado)."
  };
}

// CATÁLOGO EXHAUSTIVO DE PROCEDIMIENTOS Y PLAZOS LEGALES CHILENOS
export const CATALOGO_PLAZOS = {
  CPC: [
    {
      categoria: "Procedimiento Ordinario de Mayor Cuantía",
      procedimientos: [
        {
          id: "cpc-ord-1",
          nombre: "Contestación de Demanda (Misma Comuna del Tribunal)",
          dias: 15,
          articulo: "Art. 258 inc. 1° CPC",
          descripcion: "Término para que el demandado oponga excepciones y conteste la demanda en el juicio ordinario cuando fue notificado en la comuna donde funciona el tribunal."
        },
        {
          id: "cpc-ord-2",
          nombre: "Contestación de Demanda (Distinta Comuna, Mismo Territorio Jurisdiccional)",
          dias: 18,
          articulo: "Art. 258 inc. 2° CPC (15 + 3 días)",
          descripcion: "Aumento legal de 3 días cuando el demandado es notificado fuera de la comuna donde funciona el tribunal, pero dentro de su territorio jurisdiccional."
        },
        {
          id: "cpc-ord-3",
          nombre: "Escrito de Réplica (Demandante)",
          dias: 6,
          articulo: "Art. 262 CPC",
          descripcion: "Plazo fatal del demandante para ampliar o modificar sus acciones sin alterar las que sean objeto principal del pleito."
        },
        {
          id: "cpc-ord-4",
          nombre: "Escrito de Dúplica (Demandado)",
          dias: 6,
          articulo: "Art. 262 CPC",
          descripcion: "Plazo fatal del demandado para responder a la réplica y consolidar sus excepciones de fondo."
        },
        {
          id: "cpc-ord-5",
          nombre: "Término Probatorio Ordinario",
          dias: 20,
          articulo: "Art. 328 CPC",
          descripcion: "Término fatal de 20 días hábiles para rendir toda la prueba testimonial, pericial y documental en juicio ordinario."
        },
        {
          id: "cpc-ord-6",
          nombre: "Presentación Lista de Testigos y Minuta de Puntos de Prueba",
          dias: 5,
          articulo: "Art. 320 CPC",
          descripcion: "¡MUY IMPORTANTE! Debe presentarse dentro de los 5 primeros días hábiles del término probatorio ordinario, indicando nombre, profesión y domicilio de los testigos."
        },
        {
          id: "cpc-ord-7",
          nombre: "Escrito de Observaciones a la Prueba (Alegatos por Escrito)",
          dias: 10,
          articulo: "Art. 430 CPC",
          descripcion: "Término para que las partes formulen por escrito las observaciones que les merezca la prueba rendida, una vez vencido el probatorio."
        }
      ]
    },
    {
      categoria: "Procedimiento Ejecutivo (Juicio Ejecutivo)",
      procedimientos: [
        {
          id: "cpc-ejec-1",
          nombre: "Oposición de Excepciones Ejecutivas (Misma Comuna)",
          dias: 4,
          articulo: "Art. 459 Nº 1 CPC",
          descripcion: "Plazo fatal para oponer excepciones del Art. 464 CPC cuando el requerimiento de pago se hace en la comuna donde funciona el tribunal."
        },
        {
          id: "cpc-ejec-2",
          nombre: "Oposición de Excepciones Ejecutivas (Distinta Comuna)",
          dias: 8,
          articulo: "Art. 459 Nº 2 y Art. 460 CPC",
          descripcion: "Plazo fatal cuando el ejecutado es requerido de pago fuera de la comuna del tribunal pero dentro del territorio jurisdiccional."
        },
        {
          id: "cpc-ejec-3",
          nombre: "Respuesta a las Excepciones por el Ejecutante",
          dias: 4,
          articulo: "Art. 466 CPC",
          descripcion: "Plazo del demandante ejecutante para responder a las excepciones opuestas por el ejecutado antes de que el juez se pronuncie sobre su admisibilidad."
        },
        {
          id: "cpc-ejec-4",
          nombre: "Término Probatorio en Juicio Ejecutivo",
          dias: 10,
          articulo: "Art. 468 CPC",
          descripcion: "Término probatorio ejecutivo (ampliable hasta por 10 días más a petición del acreedor o de común acuerdo)."
        }
      ]
    },
    {
      categoria: "Procedimiento Sumario e Incidentes",
      procedimientos: [
        {
          id: "cpc-sum-1",
          nombre: "Audiencia de Contestación y Conciliación en Juicio Sumario",
          dias: 5,
          articulo: "Art. 683 CPC",
          descripcion: "La audiencia se celebrará al quinto día hábil después de la última notificación, con las partes que asistan."
        },
        {
          id: "cpc-sum-2",
          nombre: "Término Probatorio Incidental / Sumario",
          dias: 8,
          articulo: "Art. 90 inc. 1° y Art. 686 CPC",
          descripcion: "Término de prueba de 8 días hábiles que se aplica tanto en los incidentes como en el procedimiento sumario."
        },
        {
          id: "cpc-sum-3",
          nombre: "Lista de Testigos en Incidentes y Juicio Sumario",
          dias: 2,
          articulo: "Art. 90 inc. 2° CPC",
          descripcion: "¡PLAZO FATAL Y BREVÍSIMO! La lista de testigos y minuta de puntos en incidentes y sumario debe presentarse dentro de los 2 primeros días del probatorio."
        }
      ]
    },
    {
      categoria: "Recursos Procesales Civiles",
      procedimientos: [
        {
          id: "cpc-rec-1",
          nombre: "Recurso de Reposición (contra autos y decretos)",
          dias: 3,
          articulo: "Art. 181 CPC",
          descripcion: "Término para interponer recurso de reposición desde la notificación de la resolución."
        },
        {
          id: "cpc-rec-2",
          nombre: "Recurso de Reposición con Apelación en Subsidio (Interlocutorias)",
          dias: 5,
          articulo: "Art. 181 inc. 2° y Art. 189 CPC",
          descripcion: "Plazo especial de 5 días para reponer y apelar en subsidio contra sentencias interlocutorias que ponen término al juicio o hacen imposible su continuación."
        },
        {
          id: "cpc-rec-3",
          nombre: "Recurso de Apelación contra Sentencia Interlocutoria",
          dias: 5,
          articulo: "Art. 189 inc. 1° CPC",
          descripcion: "Plazo general para apelar sentencias interlocutorias (salvo regla especial de 10 días o 3 días)."
        },
        {
          id: "cpc-rec-4",
          nombre: "Recurso de Apelación contra Sentencia Definitiva",
          dias: 10,
          articulo: "Art. 189 inc. 2° CPC",
          descripcion: "Plazo fatal de 10 días hábiles contados desde la notificación de la sentencia definitiva en primera instancia para apelar ante la Corte de Apelaciones."
        },
        {
          id: "cpc-rec-5",
          nombre: "Recurso de Casación en el Fondo o en la Forma (Corte Suprema / Apelaciones)",
          dias: 15,
          articulo: "Art. 770 CPC",
          descripcion: "Término fatal contados desde la notificación de la sentencia contra la cual se recurre de casación."
        }
      ]
    }
  ],

  CPP: [
    {
      categoria: "Procedimiento Ordinario (Etapa de Investigación e Intermedia)",
      procedimientos: [
        {
          id: "cpp-ord-1",
          nombre: "Acusación del Fiscal tras Cierre de Investigación",
          dias: 10,
          articulo: "Art. 248 CPP",
          descripcion: "Dentro de los 10 días corridos siguientes al cierre de la investigación, el fiscal debe acusar, solicitar sobreseimiento o comunicar la decisión de no perseverar."
        },
        {
          id: "cpp-ord-2",
          nombre: "Acusación Particular y Lista de Prueba del Querellante (Antes de APJO)",
          dias: 15,
          articulo: "Art. 261 CPP (Cómputo hacia atrás desde APJO)",
          esHaciaAtras: true,
          descripcion: "Hasta 15 días corridos ANTES de la fecha fijada para la Audiencia de Preparación del Juicio Oral (APJO), el querellante debe adherir o acusar y ofrecer su prueba."
        },
        {
          id: "cpp-ord-3",
          nombre: "Facultades de la Defensa / Ofrecimiento de Prueba Defensa (Antes de APJO)",
          dias: 1,
          articulo: "Art. 263 CPP (Hasta la víspera de APJO)",
          esHaciaAtras: true,
          descripcion: "Por escrito hasta la víspera (1 día antes) de la APJO o al inicio de la misma audiencia: la defensa ofrece su prueba, opone excepciones o señala vicios formales."
        },
        {
          id: "cpp-ord-4",
          nombre: "Plazo para Rendición de Informe Pericial a Intervinientes",
          dias: 5,
          articulo: "Art. 315 CPP (Antes de la audiencia respectiva)",
          esHaciaAtras: true,
          descripcion: "Los informes periciales escritos deben ser puestos a disposición de las demás partes a lo menos 5 días antes de la audiencia en que se rendirán."
        }
      ]
    },
    {
      categoria: "Procedimientos Especiales (Simplificado, Monitorio y Abreviado)",
      procedimientos: [
        {
          id: "cpp-esp-1",
          nombre: "Reclamación del Imputado en Procedimiento Monitorio",
          dias: 15,
          articulo: "Art. 392 CPP",
          descripcion: "Plazo fatal de 15 días corridos contados desde la notificación de la resolución que impone la multa para que el imputado reclame y pida juicio simplificado."
        },
        {
          id: "cpp-esp-2",
          nombre: "Preparación de Juicio Simplificado por el Imputado",
          dias: 10,
          articulo: "Art. 395 y 396 CPP",
          descripcion: "Citación a audiencia en juicio simplificado para debate procesal."
        }
      ]
    },
    {
      categoria: "Recursos en Materia Procesal Penal",
      procedimientos: [
        {
          id: "cpp-rec-1",
          nombre: "Recurso de Reposición fuera de Audiencia",
          dias: 3,
          articulo: "Art. 362 CPP",
          descripcion: "Contra resoluciones dictadas fuera de audiencia, dentro del tercero día (corridos). En audiencia se repone tan pronto se dictan."
        },
        {
          id: "cpp-rec-2",
          nombre: "Recurso de Apelación en Proceso Penal",
          dias: 5,
          articulo: "Art. 366 CPP",
          descripcion: "Plazo fatal de 5 días corridos contados desde la notificación de la resolución impugnable de garantía para recurrir de apelación."
        },
        {
          id: "cpp-rec-3",
          nombre: "Recurso de Nulidad (Sentencia Juicio Oral o Simplificado)",
          dias: 10,
          articulo: "Art. 372 CPP",
          descripcion: "¡EL RECURSO REY PENAL! Plazo fatal de 10 días corridos contados desde la notificación de la sentencia definitiva dictada por el TJOP o Juez de Garantía."
        }
      ]
    }
  ],

  LAB_ADMIN: [
    {
      categoria: "Procedimiento Laboral y de Familia (Lunes a Viernes Hábiles)",
      procedimientos: [
        {
          id: "lab-ord-1",
          nombre: "Contestación Demanda Laboral (Audiencia Preparatoria)",
          dias: 5,
          articulo: "Art. 453 Nº 1 Código del Trabajo",
          esHaciaAtras: true,
          descripcion: "¡PLAZO FATAL! La contestación de la demanda laboral por escrito debe presentarse con a lo menos 5 días hábiles de anticipación a la fecha de la audiencia preparatoria."
        },
        {
          id: "lab-ord-2",
          nombre: "Acompañar Evidencia Documental en Juicio Laboral",
          dias: 5,
          articulo: "Art. 453 Nº 5 CT",
          esHaciaAtras: true,
          descripcion: "Los documentos o solicitud de exhibición deben anunciarse o aportarse al menos 5 días hábiles antes de la audiencia."
        },
        {
          id: "lab-ord-3",
          nombre: "Recurso de Nulidad Laboral (contra sentencia definitiva)",
          dias: 10,
          articulo: "Art. 477 Código del Trabajo",
          descripcion: "Plazo fatal de 10 días hábiles (lunes a viernes, no feriados ni sábados) desde la notificación de la sentencia de juicio oral laboral."
        },
        {
          id: "fam-ord-1",
          nombre: "Acompañar Informes Socioeconómicos y Documental Alimentos",
          dias: 5,
          articulo: "Art. 54 Ley 19.968",
          esHaciaAtras: true,
          descripcion: "Toda prueba documental en juicio de familia debe presentarse por escrito con 5 días hábiles de anticipación a la Audiencia Preparatoria."
        }
      ]
    },
    {
      categoria: "Procedimiento Administrativo / Contencioso (Ley 19.880 / SMA / CMF)",
      procedimientos: [
        {
          id: "adm-1",
          nombre: "Recurso de Reposición Administrativa / Jerárquico",
          dias: 5,
          articulo: "Art. 59 Ley 19.880",
          descripcion: "Plazo general de 5 días hábiles administrativos (lunes a viernes) desde notificación del acto administrativo para recurrir."
        },
        {
          id: "adm-2",
          nombre: "Descargos en Formulación de Cargos Administrativos / Sanitarios",
          dias: 10,
          articulo: "Art. 33 Ley 19.880 / Ley de Bases",
          descripcion: "Término fatal para formular descargos y aportar pruebas ante servicios públicos fiscalizadores."
        }
      ]
    }
  ]
};

