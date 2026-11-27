import type { Metadata } from "next";
import { Encabezado } from "../../componentes";
import { Importador } from "./Importador";

export const metadata: Metadata = { title: "Importar tarifas · Tracker" };

export default function ImportarTarifas() {
  return (
    <div className="flex flex-col gap-4 lg:max-w-2xl">
      <Encabezado volver={{ href: "/configuracion/tarifas", texto: "Tarifas" }} titulo="Importar tarifas desde Excel" />
      <Importador />
    </div>
  );
}
