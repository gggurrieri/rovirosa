import type { Metadata } from "next";
import { obtenerClientes, obtenerPendientes } from "@/lib/datos-cobros";
import { hoyEnArgentina } from "@/lib/formato";
import { FormularioPago } from "./FormularioPago";

export const metadata: Metadata = { title: "Registrar pago · Rovirosa" };

export default async function NuevoPago({ searchParams }: PageProps<"/cobros/nuevo">) {
  const { cliente } = await searchParams;
  const [clientes, pendientes] = await Promise.all([obtenerClientes(), obtenerPendientes()]);

  // Primero los que deben (más deuda arriba), después el resto por nombre.
  const deudaPesos = new Map<string, number>();
  for (const item of pendientes) {
    if (item.moneda === "ARS") deudaPesos.set(item.cliente_id, (deudaPesos.get(item.cliente_id) ?? 0) + item.saldo_centavos);
  }
  const opciones = clientes
    .map((c) => ({ ...c, deuda: deudaPesos.get(c.id) ?? 0 }))
    .sort((a, b) => b.deuda - a.deuda || a.nombre.localeCompare(b.nombre, "es"));

  const clienteInicial = typeof cliente === "string" && clientes.some((c) => c.id === cliente) ? cliente : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Registrar pago</h1>
      <FormularioPago
        // Un id nuevo cada vez que se abre: si el mismo envío llega dos veces, la base guarda uno solo.
        id={crypto.randomUUID()}
        hoy={hoyEnArgentina()}
        clientes={opciones}
        pendientes={pendientes}
        clienteInicial={clienteInicial}
      />
    </div>
  );
}
