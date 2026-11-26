// Consultas de la grilla de viajes. Filtra, ordena y suma la base (buscar_viajes, con RLS).

import { aCentavos, fallo } from "./datos";
import { aParametrosBusqueda, type FilaGrilla, type FiltrosViajes } from "./grilla";
import { crearClienteServidor } from "./supabase/server";

export type ResultadoGrilla = {
  total: number;
  totales: { facturado_ars: number; saldo_ars: number; facturado_usd: number; saldo_usd: number };
  filas: FilaGrilla[];
};

export async function buscarViajes(filtros: FiltrosViajes, porPagina: number): Promise<ResultadoGrilla> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("buscar_viajes", { p_filtros: aParametrosBusqueda(filtros, porPagina) });
  if (error) fallo("los viajes", error);

  const t = data?.totales ?? {};
  return {
    total: Number(data?.total ?? 0),
    totales: {
      facturado_ars: aCentavos(t.facturado_ars ?? 0),
      saldo_ars: aCentavos(t.saldo_ars ?? 0),
      facturado_usd: aCentavos(t.facturado_usd ?? 0),
      saldo_usd: aCentavos(t.saldo_usd ?? 0),
    },
    filas: ((data?.filas ?? []) as Record<string, unknown>[]).map((f) => ({
      id: String(f.id),
      numero: Number(f.numero),
      fecha_salida: String(f.fecha_salida),
      origen: String(f.origen),
      destino: String(f.destino),
      estado: f.estado as FilaGrilla["estado"],
      cobro: f.cobro as FilaGrilla["cobro"],
      unidad: (f.unidad as string | null) ?? null,
      chofer: (f.chofer as string | null) ?? null,
      autos: Number(f.autos),
      entregados: Number(f.entregados ?? 0),
      clientes: (f.clientes as string | null) ?? null,
      facturado_ars: aCentavos(f.facturado_ars),
      saldo_ars: aCentavos(f.saldo_ars),
      facturado_usd: aCentavos(f.facturado_usd),
      saldo_usd: aCentavos(f.saldo_usd),
    })),
  };
}

/** Unidades y clientes para los desplegables de los filtros. */
export async function opcionesFiltros() {
  const supabase = await crearClienteServidor();
  const [unidades, clientes] = await Promise.all([
    supabase.from("unidades").select("id, nombre").order("nombre"),
    supabase.from("clientes").select("id, nombre").order("nombre"),
  ]);
  if (unidades.error) fallo("las unidades", unidades.error);
  if (clientes.error) fallo("los clientes", clientes.error);
  return {
    unidades: (unidades.data ?? []) as { id: string; nombre: string }[],
    clientes: (clientes.data ?? []) as { id: string; nombre: string }[],
  };
}
