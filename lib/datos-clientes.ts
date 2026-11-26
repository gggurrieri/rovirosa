// Clientes con sus saldos (v_clientes) y todo lo de la ficha. RLS filtra por empresa.

import { aCentavos, fallo } from "./datos";
import type { Moneda } from "./formato";
import { crearClienteServidor } from "./supabase/server";
import type { EstadoCobro, Montos } from "./tablero";
import type { EstadoViaje } from "./viajes";

export type TipoCliente = "concesionaria" | "particular" | "coleccionista" | "otro";

export type ClienteResumen = {
  id: string;
  nombre: string;
  tipo: TipoCliente;
  whatsapp: string | null;
  email: string | null;
  ciudad: string | null;
  notas: string | null;
  activo: boolean;
  saldo: Montos;
  vencido: Montos;
  aFavor: Montos;
  autosDebe: number;
  viajes: number;
  ultimoViaje: string | null;
  ultimoRecordatorio: string | null;
};

const montos = (ars: unknown, usd: unknown): Montos => {
  const m: Montos = {};
  if (aCentavos(ars) !== 0) m.ARS = aCentavos(ars);
  if (aCentavos(usd) !== 0) m.USD = aCentavos(usd);
  return m;
};

type FilaCliente = Record<string, unknown> & { id: string; nombre: string };
const COLUMNAS =
  "id, nombre, tipo, whatsapp, email, ciudad, notas, activo, saldo_ars, saldo_usd, vencido_ars, vencido_usd, a_favor_ars, a_favor_usd, autos_debe, viajes, ultimo_viaje, ultimo_recordatorio";

function aResumen(f: FilaCliente): ClienteResumen {
  return {
    id: f.id,
    nombre: f.nombre,
    tipo: f.tipo as TipoCliente,
    whatsapp: (f.whatsapp as string | null) ?? null,
    email: (f.email as string | null) ?? null,
    ciudad: (f.ciudad as string | null) ?? null,
    notas: (f.notas as string | null) ?? null,
    activo: f.activo === true,
    saldo: montos(f.saldo_ars, f.saldo_usd),
    vencido: montos(f.vencido_ars, f.vencido_usd),
    aFavor: montos(f.a_favor_ars, f.a_favor_usd),
    autosDebe: Number(f.autos_debe),
    viajes: Number(f.viajes),
    ultimoViaje: (f.ultimo_viaje as string | null) ?? null,
    ultimoRecordatorio: (f.ultimo_recordatorio as string | null) ?? null,
  };
}

export async function obtenerClientesResumen(): Promise<ClienteResumen[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("v_clientes").select(COLUMNAS).order("nombre");
  if (error) fallo("los clientes", error);
  return ((data ?? []) as FilaCliente[]).map(aResumen);
}

export type AutoDelCliente = {
  item_id: string;
  viaje_id: string;
  viaje_numero: number;
  fecha_salida: string;
  origen: string;
  destino: string;
  estado_viaje: EstadoViaje;
  vehiculo: string | null;
  moneda: Moneda;
  precio_centavos: number;
  saldo_centavos: number;
  estado_cobro: EstadoCobro;
  vencido: boolean;
};

export type PagoDelCliente = { id: string; fecha: string; monto_centavos: number; moneda: Moneda; anulado_en: string | null; a_favor_centavos: number };
export type Recordatorio = { id: string; enviado_en: string; saldo_ars: number; saldo_usd: number; autos: number };

export async function obtenerFichaCliente(id: string) {
  const supabase = await crearClienteServidor();
  const [cliente, autos, pagos, recordatorios] = await Promise.all([
    supabase.from("v_clientes").select(COLUMNAS).eq("id", id).maybeSingle(),
    supabase
      .from("v_items_saldo")
      .select("id, viaje_id, viaje_numero, fecha_salida, origen, destino, estado_viaje, vehiculo, moneda, precio_centavos, saldo_centavos, estado_cobro, vencido")
      .eq("cliente_id", id)
      .order("fecha_salida", { ascending: false }),
    supabase.from("v_pagos").select("id, fecha, monto_centavos, moneda, anulado_en, a_favor_centavos").eq("cliente_id", id).order("fecha", { ascending: false }),
    supabase.from("recordatorios").select("id, enviado_en, saldo_ars, saldo_usd, autos").eq("cliente_id", id).order("enviado_en", { ascending: false }).limit(5),
  ]);
  for (const [que, r] of [
    ["el cliente", cliente],
    ["los autos del cliente", autos],
    ["los pagos del cliente", pagos],
    ["los recordatorios", recordatorios],
  ] as const) {
    if (r.error) fallo(que, r.error);
  }
  if (!cliente.data) return null;
  return {
    cliente: aResumen(cliente.data as FilaCliente),
    autos: (autos.data ?? []).map((a) => ({
      item_id: a.id,
      viaje_id: a.viaje_id,
      viaje_numero: Number(a.viaje_numero),
      fecha_salida: a.fecha_salida,
      origen: a.origen,
      destino: a.destino,
      estado_viaje: a.estado_viaje,
      vehiculo: a.vehiculo,
      moneda: a.moneda,
      precio_centavos: aCentavos(a.precio_centavos),
      saldo_centavos: aCentavos(a.saldo_centavos),
      estado_cobro: a.estado_cobro,
      vencido: a.vencido === true,
    })) as AutoDelCliente[],
    pagos: (pagos.data ?? []).map((p) => ({
      ...p,
      monto_centavos: aCentavos(p.monto_centavos),
      a_favor_centavos: aCentavos(p.a_favor_centavos),
    })) as PagoDelCliente[],
    recordatorios: (recordatorios.data ?? []).map((r) => ({
      ...r,
      saldo_ars: aCentavos(r.saldo_ars),
      saldo_usd: aCentavos(r.saldo_usd),
    })) as Recordatorio[],
  };
}

export async function obtenerDatosCobro(): Promise<{ datos_cobro: string | null; mensaje_recordatorio: string | null }> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("empresas").select("datos_cobro, mensaje_recordatorio").maybeSingle();
  if (error) fallo("los datos para cobrar", error);
  return { datos_cobro: data?.datos_cobro ?? null, mensaje_recordatorio: data?.mensaje_recordatorio ?? null };
}
