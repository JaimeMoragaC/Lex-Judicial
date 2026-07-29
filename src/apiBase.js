// Punto único donde se resuelve la dirección del servidor forense local.
// Se puede apuntar a otro host o puerto con VITE_LEXCONTROL_API en un .env.local
// (útil cuando el 8888 ya está ocupado por otra instancia).
export const LEXCONTROL_API = (
  import.meta.env.VITE_LEXCONTROL_API || 'http://localhost:8888'
).replace(/\/+$/, '');
