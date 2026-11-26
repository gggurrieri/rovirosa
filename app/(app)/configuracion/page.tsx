import type { Metadata } from "next";
import Link from "next/link";
import { obtenerSesion } from "@/lib/datos";
import { obtenerChoferesConfig, obtenerEmpresaConfig, obtenerTarifasConfig, obtenerUnidadesConfig } from "@/lib/datos-configuracion";

export const metadata: Metadata = { title: "Configuración · Rovirosa" };

export default async function Configuracion() {
  const [{ perfil }, tarifas, unidades, choferes, empresa] = await Promise.all([
    obtenerSesion(),
    obtenerTarifasConfig(),
    obtenerUnidadesConfig(),
    obtenerChoferesConfig(),
    obtenerEmpresaConfig(),
  ]);
  const tarjetas = [
    { href: "/configuracion/tarifas", titulo: "💲 Tarifas", detalle: `${tarifas.filter((t) => t.activa).length} rutas activas · importar desde Excel` },
    { href: "/configuracion/unidades", titulo: "🚚 Unidades", detalle: `${unidades.filter((u) => u.activa).length} activas` },
    { href: "/configuracion/choferes", titulo: "🧑‍✈️ Choferes", detalle: `${choferes.filter((c) => c.activo).length} activos` },
    { href: "/configuracion/empresa", titulo: "🏢 Empresa", detalle: `${empresa.nombre} · vence a los ${empresa.dias_vencimiento} días` },
    ...(perfil?.rol === "dueno" ? [{ href: "/mas/datos-cobro", titulo: "💳 Datos para cobrar", detalle: "Alias, CBU y mensaje del recordatorio" }] : []),
  ];
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <h1 className="text-2xl font-bold">Configuración</h1>
      <p className="text-base text-slate-600">Los datos de tu empresa: lo que usan los viajes, los cobros y las alertas.</p>
      <ul className="grid gap-3 lg:grid-cols-2">
        {tarjetas.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="flex h-full flex-col gap-1 rounded-2xl bg-white p-5 shadow-sm active:bg-slate-50">
              <span className="text-lg font-semibold">{t.titulo}</span>
              <span className="text-sm text-slate-600">{t.detalle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
