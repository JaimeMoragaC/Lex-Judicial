// pjudCausesData.js - Catálogo de causas PJUD.
//
// Antes este archivo contenía ~84.000 líneas de datos literales que se
// compilaban dentro del bundle. Ahora los datos viven en data/pjudCausesData.json
// y los sirve el servidor Python por /data/pjudCausesData; acá queda el enganche.
//
// Esto permite que el Vigilante de Descargas actualice el catálogo en disco y
// el frontend lo vea en la siguiente recarga, sin necesidad de recompilar.
//
// Para regenerar el JSON: python3 importar_excel_pjud.py
import { cargarCatalogo } from './dataLoader.js';

const catalogo = await cargarCatalogo('pjudCausesData');

export const PJUD_DATA = catalogo ?? { totalCausas: 0, matchDisco: 0, casos: [] };

export const PJUD_CASOS = PJUD_DATA.casos ?? [];
export const PJUD_CASOS_TOTAL = PJUD_DATA.totalCausas ?? 0;

export default PJUD_DATA;
