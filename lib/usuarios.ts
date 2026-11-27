// Usuarios e invitaciones: estados y mensaje para mandar por WhatsApp. Funciones puras.

export type RolInvitable = "dueno" | "administrativo";

export const NOMBRE_ROL: Record<"dueno" | "administrativo" | "chofer", string> = {
  dueno: "Dueño",
  administrativo: "Administrativo",
  chofer: "Chofer",
};

export type EstadoInvitacion = "pendiente" | "vencida" | "aceptada" | "anulada";

export function estadoInvitacion(
  inv: { vence_en: string; aceptada_en: string | null; anulada_en: string | null },
  ahora: Date = new Date(),
): EstadoInvitacion {
  if (inv.aceptada_en) return "aceptada";
  if (inv.anulada_en) return "anulada";
  return new Date(inv.vence_en) <= ahora ? "vencida" : "pendiente";
}

export function textoVence(venceEn: string, ahora: Date = new Date()): string {
  const dias = Math.floor((new Date(venceEn).getTime() - ahora.getTime()) / 86_400_000);
  if (dias <= 0) return "Vence hoy";
  return `Vence en ${dias} ${dias === 1 ? "día" : "días"}`;
}

export function mensajeInvitacion(d: { nombre: string; email: string; empresa: string; url: string }): string {
  return `Hola ${d.nombre}, te invité a usar Tracker, el sistema de ${d.empresa}. Creá tu usuario con el email ${d.email} en ${d.url} (la invitación vence en 7 días).`;
}

/** Link para abrir WhatsApp con el texto escrito; sin número, la persona elige el contacto. */
export function linkWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
