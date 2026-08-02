// realDiskData.js - Catálogo del disco duro forense.
//
// Antes este archivo eran ~97.000 líneas de datos literales que terminaban
// compilados dentro del bundle. Ahora los datos viven en data/realDiskData.json
// y los sirve el servidor Python; acá solo queda el enganche.
//
// Para regenerar el JSON en disco: python3 generar_db_disco_real.py (también
// corre solo cada 30 min vía el timer lexcontrol-disco-real).
import { cargarCatalogo } from './dataLoader.js';

const catalogo = await cargarCatalogo('realDiskData');

// REAL_DISK_DATA se carga una sola vez al abrir la página -normal para un
// catálogo que antes era estático-, pero el disco cambia todo el tiempo
// -documentos archivados a mano, o por el Vigilante, mientras la pestaña
// sigue abierta-. Sin forma de refrescarlo, la ficha de un expediente podía
// mostrar una foto de hace horas del disco real (caso real 31-jul-2026:
// Cuevas Salazar Froilán, un documento recién archivado no aparecía).
//
// Se exporta un array MUTABLE (no una nueva referencia cada vez) para que
// findDiscoFolder() y cualquier otro consumidor que ya hizo `import
// { REAL_DISK_DATA }` vea los datos frescos sin tener que volver a importar
// nada -refrescarDiscoData() reemplaza el CONTENIDO del mismo array-.
export const REAL_DISK_DATA = [];
REAL_DISK_DATA.push(...(catalogo?.clientes ?? []));

export let TOTAL_REAL_FILES = catalogo?.totalArchivos ?? 0;
export let RAIZ_DISCO = catalogo?.raizDisco ?? '';

export async function refrescarDiscoData() {
  const fresco = await cargarCatalogo('realDiskData');
  if (!fresco) return false;
  REAL_DISK_DATA.length = 0;
  REAL_DISK_DATA.push(...(fresco.clientes ?? []));
  TOTAL_REAL_FILES = fresco.totalArchivos ?? 0;
  RAIZ_DISCO = fresco.raizDisco ?? '';
  return true;
}
