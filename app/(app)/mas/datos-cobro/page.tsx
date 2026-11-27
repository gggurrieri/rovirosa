import type { Metadata } from "next";
import Link from "next/link";
import { obtenerSesion } from "@/lib/datos";
import { obtenerDatosCobro } from "@/lib/datos-clientes";
import { FormularioDatosCobro } from "./FormularioDatosCobro";

export const metadata: Metadata = { title: "Datos para cobrar · Tracker" };

export default async function DatosCobro({ searchParams }: PageProps<"/mas/datos-cobro">) {
  const { perfil } = await obtenerSesion();
  const { guardado } = await searchParams;
  return (
    <div className="flex flex-col gap-4 lg:max-w-2xl">
      <Link href="/mas" className="text-base font-medium text-sky-700">
        ← Más
      </Link>
      <h1 className="text-2xl font-bold">Datos para cobrar</h1>
      {perfil?.rol !== "dueno" ? (
        <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">Solo el dueño de la empresa carga los datos para cobrar.</p>
      ) : (
        <>
          {guardado && (
            <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
              ✅ Guardado. Los próximos recordatorios ya salen con estos datos.
            </p>
          )}
          <Formulario empresa={perfil.empresa} />
        </>
      )}
    </div>
  );
}

async function Formulario({ empresa }: { empresa: string }) {
  const { datos_cobro, mensaje_recordatorio } = await obtenerDatosCobro();
  return <FormularioDatosCobro empresa={empresa} datos={datos_cobro ?? ""} mensaje={mensaje_recordatorio ?? ""} />;
}
