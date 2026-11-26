// Métricas de cobranza: una sola llamada a la base (metricas), con RLS.

import { aCentavos, fallo } from "./datos";
import type { Metricas, Tramo } from "./metricas";
import { crearClienteServidor } from "./supabase/server";
import type { Montos } from "./tablero";

const montos = (m: Record<string, unknown> | null | undefined): Montos =>
  Object.fromEntries(Object.entries(m ?? {}).map(([moneda, v]) => [moneda, aCentavos(v)]));

type Crudo = {
  hoy: string;
  dias_vencimiento: number | null;
  meses: { mes: string; facturado: Record<string, unknown>; cobrado: Record<string, unknown>; recuperado: Record<string, unknown>; dias_cobro: number | null; autos_cobrados: number }[];
  antiguedad: { tramo: Tramo; montos: Record<string, unknown>; autos: number }[];
  top_clientes: { cliente_id: string; nombre: string; saldo: Record<string, unknown>; vencido: Record<string, unknown> }[];
  por_cobrar: Record<string, unknown>;
  vencido: Record<string, unknown>;
  dias_cobro_90: number | null;
};

export async function obtenerMetricas(meses = 6): Promise<Metricas> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("metricas", { p_meses: meses });
  if (error) fallo("las métricas", error);
  const m = data as Crudo;
  return {
    hoy: m.hoy,
    dias_vencimiento: m.dias_vencimiento ?? 7,
    meses: m.meses.map((x) => ({
      mes: x.mes,
      facturado: montos(x.facturado),
      cobrado: montos(x.cobrado),
      recuperado: montos(x.recuperado),
      dias_cobro: x.dias_cobro,
      autos_cobrados: x.autos_cobrados,
    })),
    antiguedad: m.antiguedad.map((t) => ({ tramo: t.tramo, montos: montos(t.montos), autos: t.autos })),
    top_clientes: m.top_clientes.map((c) => ({ cliente_id: c.cliente_id, nombre: c.nombre, saldo: montos(c.saldo), vencido: montos(c.vencido) })),
    por_cobrar: montos(m.por_cobrar),
    vencido: montos(m.vencido),
    dias_cobro_90: m.dias_cobro_90,
  };
}
