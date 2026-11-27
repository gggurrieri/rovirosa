import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerTarifasConfig } from "@/lib/datos-configuracion";
import { hayCalculoAutomatico } from "@/lib/ors";
import { Encabezado } from "../../componentes";
import { FormularioTarifa } from "./FormularioTarifa";

export const metadata: Metadata = { title: "Tarifa · Tracker" };

export default async function Tarifa({ params }: PageProps<"/configuracion/tarifas/[id]">) {
  const { id } = await params;
  const tarifas = await obtenerTarifasConfig();
  const tarifa = id === "nueva" ? null : (tarifas.find((t) => t.id === id) ?? notFound());
  const lugaresUsados = [...new Set(tarifas.flatMap((t) => [t.origen, t.destino]))];
  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <Encabezado volver={{ href: "/configuracion/tarifas", texto: "Tarifas" }} titulo={tarifa ? `${tarifa.origen} → ${tarifa.destino}` : "Nueva tarifa"} />
      <FormularioTarifa tarifa={tarifa} calculoAutomatico={hayCalculoAutomatico()} lugaresUsados={lugaresUsados} />
    </div>
  );
}
