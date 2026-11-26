// Usuarios de la empresa e invitaciones pendientes. Las invitaciones solo las ve
// el dueño (RLS); los perfiles, cualquiera de la empresa.

import { fallo } from "./datos";
import { crearClienteServidor } from "./supabase/server";
import type { Rol } from "./datos";

export type Usuario = { user_id: string; nombre: string; rol: Rol; email: string | null; activo: boolean };
export type Invitacion = {
  id: string;
  email: string;
  nombre: string;
  rol: "dueno" | "administrativo";
  vence_en: string;
  aceptada_en: string | null;
  anulada_en: string | null;
};

export async function obtenerUsuarios(): Promise<{ usuarios: Usuario[]; invitaciones: Invitacion[] }> {
  const supabase = await crearClienteServidor();
  const [usuarios, invitaciones] = await Promise.all([
    supabase.from("perfiles").select("user_id, nombre, rol, email, activo").order("nombre"),
    supabase
      .from("invitaciones")
      .select("id, email, nombre, rol, vence_en, aceptada_en, anulada_en")
      .is("aceptada_en", null)
      .is("anulada_en", null)
      .order("creado_en", { ascending: false }),
  ]);
  if (usuarios.error) fallo("los usuarios", usuarios.error);
  if (invitaciones.error) fallo("las invitaciones", invitaciones.error);
  return { usuarios: usuarios.data ?? [], invitaciones: invitaciones.data ?? [] };
}
