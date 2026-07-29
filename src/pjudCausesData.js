// pjudCausesData.js - Catálogo de causas del Excel oficial del PJUD.
//
// Antes eran ~40.000 líneas de datos literales dentro del bundle. Ahora viven en
// data/pjudCausesData.json y los sirve el servidor Python.
//
// Para regenerar el JSON: python3 importar_excel_pjud.py
import { cargarCatalogo } from './dataLoader';

const catalogo = await cargarCatalogo('pjudCausesData');

export const PJUD_CASOS = catalogo?.casos ?? [];
export const PJUD_CASOS_TOTAL = catalogo?.totalCausas ?? 0;
export const PJUD_CASOS_MATCH_DISCO = catalogo?.matchDisco ?? 0;
