// Carga de los catálogos pesados (disco duro forense y causas PJUD) desde el
// servidor Python, en vez de compilarlos dentro del bundle de JavaScript.
//
// Los módulos que consumen esto usan top-level await: el grafo de módulos entero
// espera a que lleguen los datos antes de que React monte, así que los componentes
// siguen importando constantes sincrónicas y no necesitan estado de carga.
import { LEXCONTROL_API } from './apiBase';

// Catálogos que no se pudieron traer. La app lo consulta para avisar en pantalla
// en vez de renderizar en blanco cuando el servidor local no está levantado.
export const CATALOGOS_CAIDOS = [];

export async function cargarCatalogo(nombre) {
  const url = `${LEXCONTROL_API}/data/${nombre}`;
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) {
      throw new Error(`el servidor respondió HTTP ${respuesta.status}`);
    }
    return await respuesta.json();
  } catch (error) {
    CATALOGOS_CAIDOS.push({ nombre, url, motivo: error.message });
    console.error(
      `[LexControl] No se pudo cargar el catálogo "${nombre}" desde ${url}. ` +
      `¿Está corriendo servidor_local_lexcontrol.py?`,
      error
    );
    return null;
  }
}
