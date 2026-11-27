import type { Metadata } from "next";
import Link from "next/link";
import { BotonCerrarSesion } from "@/components/BotonCerrarSesion";
import { obtenerSesion } from "@/lib/datos";
import { NOMBRE_ROL } from "@/lib/usuarios";

export const metadata: Metadata = { title: "Más · Rovirosa" };

export default async function Mas() {
  const { email, perfil } = await obtenerSesion();

  return (
    <div className="flex flex-col gap-4 lg:max-w-xl">
      <h1 className="text-2xl font-bold">Más</h1>
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-lg font-semibold">{perfil?.nombre}</p>
        <p className="text-base break-all text-slate-600">{email}</p>
        {perfil && <p className="text-sm text-slate-500">{NOMBRE_ROL[perfil.rol]}</p>}
      </section>
      {perfil && (
        <Link
          href="/clientes"
          className="flex min-h-14 items-center justify-between rounded-2xl bg-white px-5 py-3 text-lg font-semibold shadow-sm active:bg-slate-50 lg:hidden"
        >
          <span>🧑‍💼 Clientes</span>
          <span className="text-sm font-normal text-slate-500">Fichas y saldos →</span>
        </Link>
      )}
      {perfil && (
        <Link
          href="/configuracion"
          className="flex min-h-14 items-center justify-between rounded-2xl bg-white px-5 py-3 text-lg font-semibold shadow-sm active:bg-slate-50 lg:hidden"
        >
          <span>⚙️ Configuración</span>
          <span className="text-sm font-normal text-slate-500">Tarifas, unidades, choferes →</span>
        </Link>
      )}
      {(perfil?.rol === "dueno" || perfil?.rol === "administrativo") && (
        <Link
          href="/mas/calendario-google"
          className="flex min-h-14 items-center justify-between rounded-2xl bg-white px-5 py-3 text-lg font-semibold shadow-sm active:bg-slate-50"
        >
          <span>📅 Calendario en Google</span>
          <span className="text-sm font-normal text-slate-500">Viajes en tu celular →</span>
        </Link>
      )}
      {perfil?.rol === "dueno" && (
        <Link
          href="/mas/datos-cobro"
          className="flex min-h-14 items-center justify-between rounded-2xl bg-white px-5 py-3 text-lg font-semibold shadow-sm active:bg-slate-50"
        >
          <span>💳 Datos para cobrar</span>
          <span className="text-sm font-normal text-slate-500">Alias, CBU y mensaje →</span>
        </Link>
      )}
      {perfil?.rol === "dueno" && (
        <Link
          href="/mas/usuarios"
          className="flex min-h-14 items-center justify-between rounded-2xl bg-white px-5 py-3 text-lg font-semibold shadow-sm active:bg-slate-50"
        >
          <span>👥 Usuarios</span>
          <span className="text-sm font-normal text-slate-500">Invitar y desactivar →</span>
        </Link>
      )}
      <BotonCerrarSesion />
    </div>
  );
}
