import type { Metadata } from "next";
import Link from "next/link";
import { obtenerAgenda } from "@/lib/datos-calendario";
import { hoyEnArgentina } from "@/lib/formato";
import { FormularioBloqueo } from "./FormularioBloqueo";

export const metadata: Metadata = { title: "Bloquear · Tracker" };

export default async function Bloquear({ searchParams }: PageProps<"/calendario/bloquear">) {
  const sp = await searchParams;
  const hoy = hoyEnArgentina();
  const desde = typeof sp.desde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde) ? sp.desde : hoy;
  const { unidades, choferes } = await obtenerAgenda(hoy, hoy);
  const que = typeof sp.unidad === "string" ? `u:${sp.unidad}` : typeof sp.chofer === "string" ? `c:${sp.chofer}` : "";
  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <Link href="/calendario" className="text-base font-medium text-sky-700">
        ← Calendario
      </Link>
      <h1 className="text-2xl font-bold">Bloquear una unidad o un chofer</h1>
      <p className="text-base text-slate-600">Service, VTV, taller, franco o vacaciones: esos días se ven rayados en el calendario y avisan al cargar viajes.</p>
      <FormularioBloqueo unidades={unidades} choferes={choferes} que={que} desde={desde} />
    </div>
  );
}
