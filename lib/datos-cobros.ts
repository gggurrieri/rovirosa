// Consultas de cobros. Como en datos.ts, nunca se filtra por empresa: lo hace RLS.

import { type FilaSaldoCliente, type ItemPendiente, resumenPorCliente } from "./cobros";
import { aCentavos, fallo } from "./datos";
import type { Moneda } from "./formato";
import { crearClienteServidor } from "./supabase/server";
import type { Montos } from "./tablero";

export type Cliente = { id: string; nombre: string };

/** Ítem pendiente con lo necesario para mostrarlo en la sugerencia. */
export type ItemPendienteDetalle = ItemPendiente & {
  origen: string;
  destino: string;
  vehiculo: string | null;
};

export type AplicacionDetalle = { viaje_numero: number; cliente_nombre: string; monto_centavos: number };

export type Pago = {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  fecha: string;
  monto_centavos: number;
  moneda: Moneda;
  medio: string;
  titular: string | null;
  anulado_en: string | null;
  anulado_motivo: string | null;
  a_favor_centavos: number;
  comprobante_path: string | null;
  aplicaciones: AplicacionDetalle[];
};

export async function obtenerClientes(): Promise<Cliente[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("clientes").select("id, nombre").order("nombre");
  if (error) fallo("los clientes", error);
  return data ?? [];
}

/** Autos con saldo pendiente (sin cancelados), de todos los clientes. */
export async function obtenerPendientes(): Promise<ItemPendienteDetalle[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_items_saldo")
    .select("id, cliente_id, viaje_numero, fecha_salida, fecha_entrega, moneda, saldo_centavos, origen, destino, vehiculo")
    .gt("saldo_centavos", 0)
    .neq("estado_cobro", "cancelado");
  if (error) fallo("los saldos pendientes", error);
  return (data ?? []).map((f) => ({
    item_id: f.id,
    cliente_id: f.cliente_id,
    viaje_numero: Number(f.viaje_numero),
    fecha_salida: f.fecha_salida,
    fecha_entrega: f.fecha_entrega,
    moneda: f.moneda,
    saldo_centavos: aCentavos(f.saldo_centavos),
    origen: f.origen,
    destino: f.destino,
    vehiculo: f.vehiculo,
  }));
}

/** Quién debe y cuánto, más el saldo a favor de cada cliente. */
export async function obtenerSaldosClientes() {
  const supabase = await crearClienteServidor();
  const [items, pagos] = await Promise.all([
    supabase.from("v_items_saldo").select("cliente_id, cliente_nombre, moneda, saldo_centavos, estado_cobro, vencido"),
    supabase.from("v_pagos").select("cliente_id, moneda, a_favor_centavos").gt("a_favor_centavos", 0),
  ]);
  if (items.error) fallo("los saldos", items.error);
  if (pagos.error) fallo("los saldos a favor", pagos.error);

  const filas: FilaSaldoCliente[] = (items.data ?? []).map((f) => ({
    ...f,
    saldo_centavos: aCentavos(f.saldo_centavos),
    vencido: f.vencido === true,
  }));

  const aFavor = new Map<string, Montos>();
  for (const p of pagos.data ?? []) {
    const montos = aFavor.get(p.cliente_id) ?? {};
    const moneda = p.moneda as Moneda;
    montos[moneda] = (montos[moneda] ?? 0) + aCentavos(p.a_favor_centavos);
    aFavor.set(p.cliente_id, montos);
  }

  return resumenPorCliente(filas).map((c) => ({ ...c, aFavor: aFavor.get(c.cliente_id) ?? {} }));
}

export async function obtenerUltimosPagos(cantidad = 15): Promise<Pago[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_pagos")
    .select("id, cliente_id, cliente_nombre, fecha, monto_centavos, moneda, medio, titular, anulado_en, anulado_motivo, a_favor_centavos, comprobante_path")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(cantidad);
  if (error) fallo("los pagos", error);
  return conAplicaciones(data ?? []);
}

export async function obtenerPago(id: string): Promise<Pago | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_pagos")
    .select("id, cliente_id, cliente_nombre, fecha, monto_centavos, moneda, medio, titular, anulado_en, anulado_motivo, a_favor_centavos, comprobante_path")
    .eq("id", id)
    .maybeSingle();
  if (error) fallo("el pago", error);
  return data ? (await conAplicaciones([data]))[0] : null;
}

export async function existePago(id: string): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { count, error } = await supabase.from("pagos").select("id", { count: "exact", head: true }).eq("id", id);
  if (error) fallo("el pago", error);
  return (count ?? 0) > 0;
}

type FilaPago =Omit<Pago, "aplicaciones" | "monto_centavos" | "a_favor_centavos"> & {
  monto_centavos: unknown;
  a_favor_centavos: unknown;
};

async function conAplicaciones(filas: FilaPago[]): Promise<Pago[]> {
  if (filas.length === 0) return [];
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("v_aplicaciones")
    .select("pago_id, viaje_numero, cliente_nombre, monto_centavos")
    .in("pago_id", filas.map((f) => f.id))
    .order("viaje_numero");
  if (error) fallo("las aplicaciones de los pagos", error);

  const porPago = new Map<string, AplicacionDetalle[]>();
  for (const a of data ?? []) {
    const lista = porPago.get(a.pago_id) ?? [];
    lista.push({
      viaje_numero: Number(a.viaje_numero),
      cliente_nombre: a.cliente_nombre,
      monto_centavos: aCentavos(a.monto_centavos),
    });
    porPago.set(a.pago_id, lista);
  }

  return filas.map((f) => ({
    ...f,
    monto_centavos: aCentavos(f.monto_centavos),
    a_favor_centavos: aCentavos(f.a_favor_centavos),
    aplicaciones: porPago.get(f.id) ?? [],
  }));
}
