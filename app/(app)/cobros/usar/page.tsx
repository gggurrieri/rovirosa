import type { Metadata } from "next";
import Link from "next/link";
import { obtenerClientes, obtenerPagosConSaldo, obtenerPendientes } from "@/lib/datos-cobros";
import { FormularioUsar } from "./FormularioUsar";

export const metadata: Metadata = { title: "Usar saldo a favor · Rovirosa" };

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function UsarSaldo({ searchParams }: PageProps<"/cobros/usar">) {
  const { cliente } = await searchParams;
  const clienteId = typeof cliente === "string" && ES_UUID.test(cliente) ? cliente : null;
  const [clientes, pagos, pendientes] = clienteId
    ? await Promise.all([obtenerClientes(), obtenerPagosConSaldo(clienteId), obtenerPendientes()])
    : [[], [], []];
  const nombre = clientes.find((c) => c.id === clienteId)?.nombre;

  return (
    <div className="flex flex-col gap-4 lg:max-w-2xl">
      <Link href="/cobros" className="text-base font-medium text-sky-700">
        ← Cobros
      </Link>
      <h1 className="text-2xl font-bold">Usar saldo a favor</h1>
      {!clienteId || !nombre || pagos.length === 0 ? (
        <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">Ese cliente no tiene saldo a favor.</p>
      ) : (
        <>
          <p className="text-lg text-slate-700">{nombre}</p>
          <FormularioUsar clienteId={clienteId} pagos={pagos} pendientes={pendientes.filter((p) => p.cliente_id === clienteId)} />
        </>
      )}
    </div>
  );
}
