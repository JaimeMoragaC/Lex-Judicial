// Punto único donde se resuelve la dirección del servidor forense local.
// Se puede apuntar a otro host o puerto con VITE_LEXCONTROL_API en un .env.local
// (útil cuando el 8888 ya está ocupado por otra instancia).
// El optional chaining es necesario: import.meta.env sólo existe bajo Vite, y
// los tests importan estos módulos con Node a secas.
export const LEXCONTROL_API = (
  import.meta.env?.VITE_LEXCONTROL_API || 'http://localhost:8888'
).replace(/\/+$/, '');
