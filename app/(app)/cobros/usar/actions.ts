"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { armarAplicaciones } from "@/lib/cobros";
import { obtenerPagosConSaldo, obtenerPendientes } from "@/lib/datos-cobros";
import { mensajeDeBase } from "@/lib/errores";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoUsar = { error: string | null };

const datos = z.object({
  cliente_id: z.guid(),
  pago_id: z.guid(),
  /** El saldo a favor que vio la pantalla: si cambió (otro lo usó, o es un reintento), no se aplica. */
  a_favor: z.coerce.number().int().positive(),
  excluidos: z.array(z.guid()).max(100),
});

export async function usarSaldo(_anterior: EstadoUsar, formData: FormData): Promise<EstadoUsar> {
  let excluidos: unknown = [];
  try {
    excluidos = JSON.parse(String(formData.get("excluidos") ?? "[]"));
  } catch {
    return { error: "No pudimos leer el formulario. Probá de nuevo." };
  }
  const validacion = datos.safeParse({
    cliente_id: formData.get("cliente_id"),
    pago_id: formData.get("pago_id"),
    a_favor: formData.get("a_favor"),
    excluidos,
  });
  if (!validacion.success) return { error: "Revisá los datos y probá de nuevo." };
  const d = validacion.data;

  // Todo se recalcula con lo que hay AHORA en la base, no con lo que mostraba la pantalla.
  const [pagos, pendientes] = await Promise.all([obtenerPagosConSaldo(d.cliente_id), obtenerPendientes()]);
  const pago = pagos.find((p) => p.id === d.pago_id);
  if (!pago || pago.a_favor_centavos !== d.a_favor) {
    return { error: "El saldo a favor cambió mientras lo mirabas. Recargá la página." };
  }
  const delCliente = pendientes.filter((p) => p.cliente_id === d.cliente_id);
  const { aplicaciones } = armarAplicaciones(delCliente, pago.a_favor_centavos, pago.moneda, { excluidos: d.excluidos });
  if (aplicaciones.length === 0) return { error: "Elegí al menos un auto." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("usar_saldo_a_favor", { p_pago_id: pago.id, p_aplicaciones: aplicaciones });
  if (error) return { error: mensajeDeBase(error) };
  redirect("/cobros?usado=1");
}
