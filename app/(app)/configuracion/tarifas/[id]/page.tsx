import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerTarifasConfig } from "@/lib/datos-configuracion";
import { Encabezado } from "../../componentes";
import { FormularioTarifa } from "./FormularioTarifa";

export const metadata: Metadata = { title: "Tarifa · Tracker" };

export default async function Tarifa({ params }: PageProps<"/configuracion/tarifas/[id]">) {
  const { id } = await params;
  const tarifa = id === "nueva" ? null : ((await obtenerTarifasConfig()).find((t) => t.id === id) ?? notFound());
  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <Encabezado volver={{ href: "/configuracion/tarifas", texto: "Tarifas" }} titulo={tarifa ? `${tarifa.origen} → ${tarifa.destino}` : "Nueva tarifa"} />
      <FormularioTarifa tarifa={tarifa} calculoAutomatico={Boolean(process.env.ORS_API_KEY)} />
    </div>
  );
}
