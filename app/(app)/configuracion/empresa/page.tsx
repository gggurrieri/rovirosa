import type { Metadata } from "next";
import { obtenerEmpresaConfig } from "@/lib/datos-configuracion";
import { Aviso, Encabezado } from "../componentes";
import { FormularioEmpresa } from "./FormularioEmpresa";

export const metadata: Metadata = { title: "Empresa · Rovirosa" };

export default async function Empresa({ searchParams }: PageProps<"/configuracion/empresa">) {
  const { guardada } = await searchParams;
  const e = await obtenerEmpresaConfig();
  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <Encabezado volver={{ href: "/configuracion", texto: "Configuración" }} titulo="Empresa" />
      {guardada && <Aviso>Datos de la empresa guardados.</Aviso>}
      <FormularioEmpresa nombre={e.nombre} cuit={e.cuit} dias={e.dias_vencimiento} />
    </div>
  );
}
