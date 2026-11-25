// Consultas a Supabase. Nunca se filtra por empresa acá: RLS devuelve
// solo las filas de la empresa del usuario logueado.

import { cache } from "react";
import { redirect } from "next/navigation";
import { hoyEnArgentina } from "./formato";
import { crearClienteServidor } from "./supabase/server";
import { type ItemSaldo, ventanaProximosDias } from "./tablero";

export type Rol = "dueno" | "administrativo" | "chofer";

export type Perfil = {
  nombre: string;
  rol: Rol;
  empresa: string;
};

export type EstadoViaje =
  | "programado"
  | "en_retiro"
  | "en_viaje"
  | "entregado"
  | "cerrado"
  | "reprogramado"
  | "cancelado";

export type Viaje = {
  id: string;
  numero: number;
  fecha_salida: string;
  origen: string;
  destino: string;
  estado: EstadoViaje;
  unidad: string | null;
};

export function fallo(que: string, error: { message: string }): never {
  throw new Error(`No se pudo leer ${que}: ${error.message}`);
}

export function aCentavos(valor: unknown): number {
  const numero = typeof valor === "string" ? Number(valor) : valor;
  if (typeof numero !== "number" || !Number.isSafeInteger(numero)) {
    throw new Error(`Monto inválido en la base: ${String(valor)}`);
  }
  return numero;
}

/** Usuario logueado y su perfil. Sin sesión, manda a /login. Sin perfil, perfil = null. */
export const obtenerSesion = cache(async () => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: fila, error } = await supabase
    .from("perfiles")
    .select("nombre, rol, empresas(nombre)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fallo("tu perfil", error);

  const perfil: Perfil | null = fila
    ? {
        nombre: fila.nombre,
        rol: fila.rol,
        empresa: (fila.empresas as unknown as { nombre: string } | null)?.nombre ?? "",
      }
    : null;

  return { email: (data?.claims?.email as string | undefined) ?? "", perfil };
});

/** Solo dueño y administrativo ven viajes y cobros en la fase 1 (igual que RLS). */
export function puedeVerOperacion(perfil: Perfil | null): perfil is Perfil {
  return perfil?.rol === "dueno" || perfil?.rol === "administrativo";
}

export async function obtenerItemsSaldo(): Promise<ItemSaldo[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_items_saldo")
    .select("viaje_id, moneda, saldo_centavos, estado_cobro, vencido");
  if (error) fallo("los saldos", error);
  // bigint puede llegar como texto según la configuración de la API:
  // se convierte a número entero antes de sumar (si no, "0" + "100" = "0100").
  return (data ?? []).map((fila) => ({
    viaje_id: fila.viaje_id,
    moneda: fila.moneda,
    saldo_centavos: aCentavos(fila.saldo_centavos),
    estado_cobro: fila.estado_cobro,
    vencido: fila.vencido === true,
  }));
}

export async function contarViajesProximos(dias = 7): Promise<number> {
  const supabase = await crearClienteServidor();
  const { desde, hasta } = ventanaProximosDias(hoyEnArgentina(), dias);
  const { count, error } = await supabase
    .from("viajes")
    .select("id", { count: "exact", head: true })
    .gte("fecha_salida", desde)
    .lte("fecha_salida", hasta)
    .neq("estado", "cancelado");
  if (error) fallo("los próximos viajes", error);
  return count ?? 0;
}

export async function obtenerViajes(): Promise<Viaje[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("viajes")
    .select("id, numero, fecha_salida, origen, destino, estado, unidades(nombre)")
    .order("fecha_salida", { ascending: false })
    .order("numero", { ascending: false });
  if (error) fallo("los viajes", error);

  return (data ?? []).map((v) => ({
    id: v.id,
    numero: Number(v.numero),
    fecha_salida: v.fecha_salida,
    origen: v.origen,
    destino: v.destino,
    estado: v.estado,
    unidad: (v.unidades as unknown as { nombre: string } | null)?.nombre ?? null,
  }));
}
