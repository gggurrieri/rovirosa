// Errores que la base ya escribe en español para Rodrigo (triggers y funciones
// con "raise exception"). Cualquier otro error se muestra como uno genérico.
const CODIGOS_CON_MENSAJE = new Set(["P0001", "P0002", "22023", "42501"]);

export function mensajeDeBase(error: { code?: string; message: string }): string {
  if (error.code && CODIGOS_CON_MENSAJE.has(error.code)) return `${error.message}.`.replace(/\.\.$/, ".");
  return "No pudimos guardar. Revisá la conexión y probá de nuevo.";
}
