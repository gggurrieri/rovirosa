import type { Metadata } from "next";
import Link from "next/link";
import { Montos } from "@/components/Montos";
import { obtenerClientesResumen } from "@/lib/datos-clientes";
import { formatearFecha } from "@/lib/formato";
import { haceCuanto, posiblesDuplicados } from "@/lib/recordatorio";
import { tieneMonto } from "@/lib/tablero";

export const metadata: Metadata = { title: "Clientes · Tracker" };

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function Clientes({ searchParams }: PageProps<"/clientes">) {
  const { q, ver } = await searchParams;
  const texto = typeof q === "string" ? q.trim() : "";
  const filtro = ver === "deudores" || ver === "inactivos" ? ver : "activos";
  const todos = await obtenerClientesResumen();
  const duplicados = posiblesDuplicados(todos.filter((c) => c.activo));
  const clientes = todos
    .filter((c) => (filtro === "inactivos" ? !c.activo : c.activo))
    .filter((c) => filtro !== "deudores" || tieneMonto(c.saldo))
    .filter((c) => texto === "" || normalizar(`${c.nombre} ${c.ciudad ?? ""} ${c.whatsapp ?? ""}`).includes(normalizar(texto)))
    .sort((a, b) => (filtro === "deudores" ? (b.saldo.ARS ?? 0) - (a.saldo.ARS ?? 0) : a.nombre.localeCompare(b.nombre, "es")));

  const enlace = (v: string) => `/clientes?${new URLSearchParams({ ...(texto ? { q: texto } : {}), ...(v !== "activos" ? { ver: v } : {}) })}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">
        Clientes <span className="text-base font-normal text-slate-500">({clientes.length})</span>
      </h1>

      <form className="flex flex-col gap-3 lg:flex-row lg:items-center" action="/clientes">
        <input
          name="q"
          type="search"
          defaultValue={texto}
          placeholder="Buscá por nombre, ciudad o WhatsApp"
          aria-label="Buscar clientes"
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base lg:max-w-md"
        />
        {filtro !== "activos" && <input type="hidden" name="ver" value={filtro} />}
        <nav aria-label="Ver" className="flex gap-2">
          {[
            ["activos", "Todos"],
            ["deudores", "Con deuda"],
            ["inactivos", "Inactivos"],
          ].map(([v, t]) => (
            <Link
              key={v}
              href={enlace(v)}
              aria-current={filtro === v ? "page" : undefined}
              className={`flex h-10 items-center rounded-full border px-4 text-sm font-medium ${filtro === v ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {t}
            </Link>
          ))}
        </nav>
      </form>

      {clientes.length === 0 ? (
        <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">No hay clientes con ese filtro.</p>
      ) : (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 xl:grid-cols-3">
          {clientes.map((c) => (
            <li key={c.id}>
              <Link href={`/clientes/${c.id}`} className={`block h-full rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${tieneMonto(c.vencido) ? "border-l-4 border-red-600" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-base font-semibold break-words">{c.nombre}</p>
                  <p className="shrink-0 text-right text-base font-bold tabular-nums">{tieneMonto(c.saldo) ? <Montos montos={c.saldo} /> : <span className="font-normal text-emerald-700">Al día</span>}</p>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {[c.ciudad, `${c.viajes} ${c.viajes === 1 ? "viaje" : "viajes"}`, c.ultimoViaje && `último ${formatearFecha(c.ultimoViaje)}`].filter(Boolean).join(" · ")}
                </p>
                {tieneMonto(c.vencido) && (
                  <p className="mt-1 text-sm font-medium text-red-700">
                    Vencido: <Montos montos={c.vencido} />
                  </p>
                )}
                {c.ultimoRecordatorio && <p className="mt-1 text-sm text-slate-600">Último recordatorio: {haceCuanto(c.ultimoRecordatorio)}</p>}
                {!c.whatsapp && <p className="mt-1 text-sm text-amber-800">Sin WhatsApp cargado</p>}
                {duplicados.has(c.id) && <p className="mt-1 text-sm font-medium text-amber-800">⚠️ Posible duplicado: hay otro cliente con el mismo nombre</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
