import type { Metadata } from "next";
import Link from "next/link";
import { armarFila, estadoDelDia, NOMBRE_MOTIVO, rangoCalendario, type Vista } from "@/lib/calendario";
import { obtenerAgenda } from "@/lib/datos-calendario";
import { formatearFecha, hoyEnArgentina, sumarDias } from "@/lib/formato";
import { Grilla } from "./Grilla";

export const metadata: Metadata = { title: "Calendario · Rovirosa" };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const corta = (f: string) => formatearFecha(f).slice(0, 5);

export default async function Calendario({ searchParams }: PageProps<"/calendario">) {
  const sp = await searchParams;
  const hoy = hoyEnArgentina();
  const vista: Vista = sp.vista === "mes" ? "mes" : "2s";
  const desdePedido = typeof sp.desde === "string" && FECHA.test(sp.desde) ? sp.desde : hoy;
  const dia = typeof sp.dia === "string" && FECHA.test(sp.dia) ? sp.dia : hoy;
  const rango = rangoCalendario(vista, desdePedido);
  const [agenda, delDia] = await Promise.all([obtenerAgenda(rango.desde, rango.hasta), obtenerAgenda(dia, dia)]);

  const choques = agenda.unidades.flatMap((u) =>
    armarFila(u.id, rango.dias, agenda.viajes, agenda.bloqueos).choques.map((c) => ({ unidad: u.nombre, ...c })),
  );
  const enlace = (cambios: Record<string, string>) => `/calendario?${new URLSearchParams({ vista, desde: rango.desde, ...cambios })}`;
  const choquesBloqueo = typeof sp.choques === "string" ? sp.choques.split(",").filter(Boolean) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">
        <span className="lg:hidden">¿Quién está libre?</span>
        <span className="hidden lg:inline">Calendario</span>
      </h1>
      {sp.bloqueo && (
        <p role="status" className={`rounded-xl px-4 py-3 text-base font-medium ${choquesBloqueo.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-900"}`}>
          {choquesBloqueo.length
            ? `⚠️ Bloqueo guardado, pero choca con ${choquesBloqueo.length === 1 ? "el viaje" : "los viajes"} ${choquesBloqueo.map((n) => `#${n}`).join(", ")}: reasignalos si hace falta.`
            : "✅ Bloqueo guardado."}
        </p>
      )}
      {sp.anulado && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
          ✅ Bloqueo anulado.
        </p>
      )}

      {/* Celular: el estado de cada unidad en un día */}
      <section aria-label="Unidades del día" className="flex flex-col gap-3 lg:hidden">
        <nav aria-label="Día" className="flex flex-wrap items-center gap-2">
          {[
            [hoy, "Hoy"],
            [sumarDias(hoy, 1), "Mañana"],
          ].map(([d, t]) => (
            <Link
              key={d}
              href={`/calendario?dia=${d}`}
              aria-current={dia === d ? "page" : undefined}
              className={`flex h-11 items-center rounded-full border px-4 text-base font-medium ${dia === d ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-300 bg-white"}`}
            >
              {t}
            </Link>
          ))}
          <form action="/calendario" className="flex w-full items-center gap-2">
            <input key={dia} type="date" name="dia" defaultValue={dia} aria-label="Elegir día" className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-base" />
            <button type="submit" className="h-11 rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white">
              Ver
            </button>
          </form>
        </nav>
        <p className="text-base text-slate-600">{dia === hoy ? "Hoy" : formatearFecha(dia)}</p>
        <ul className="flex flex-col gap-2">
          {delDia.unidades.map((u) => {
            const e = estadoDelDia(u.id, dia, delDia.viajes, delDia.bloqueos);
            const tono = { libre: "border-emerald-600", viaje: "border-sky-600", bloqueo: "border-slate-400", choque: "border-red-600" }[e.tipo];
            return (
              <li key={u.id} className={`rounded-2xl border-l-4 bg-white p-4 shadow-sm ${tono}`}>
                <p className="text-base font-semibold">{u.nombre}</p>
                <p className={`text-base ${e.tipo === "libre" ? "font-medium text-emerald-800" : e.tipo === "choque" ? "font-medium text-red-700" : "text-slate-700"}`}>{e.texto}</p>
                {e.tipo === "libre" ? (
                  <Link href={`/viajes/nuevo?unidad=${u.id}&fecha=${dia}`} className="mt-2 flex h-12 items-center justify-center rounded-xl bg-sky-700 text-base font-semibold text-white active:bg-sky-800">
                    Cargar viaje
                  </Link>
                ) : e.viaje ? (
                  <Link href={`/viajes/${e.viaje.id}`} className="mt-1 inline-block py-1 text-sm font-medium text-sky-700">
                    Ver viaje #{e.viaje.numero} →
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
        <Link href={`/calendario/bloquear?desde=${dia}`} className="text-base font-medium text-sky-700">
          Bloquear una unidad o un chofer (service, VTV, franco) →
        </Link>
      </section>

      {/* Computadora: la grilla */}
      <section aria-label="Calendario por unidad" className="hidden flex-col gap-4 lg:flex">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={enlace({ desde: rango.anterior })} aria-label="Anterior" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg">
              ‹
            </Link>
            <p className="min-w-56 text-center text-base font-semibold">
              {corta(rango.desde)} al {formatearFecha(rango.hasta)}
            </p>
            <Link href={enlace({ desde: rango.siguiente })} aria-label="Siguiente" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg">
              ›
            </Link>
            <Link href={enlace({ desde: hoy })} className="ml-2 flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium">
              Hoy
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <nav aria-label="Vista" className="flex rounded-lg border border-slate-300 bg-white p-1">
              {[
                ["2s", "2 semanas"],
                ["mes", "Mes completo"],
              ].map(([v, t]) => (
                <Link
                  key={v}
                  href={`/calendario?${new URLSearchParams({ vista: v, desde: v === "2s" && hoy >= rango.desde && hoy <= rango.hasta ? hoy : rango.desde })}`}
                  aria-current={vista === v ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${vista === v ? "bg-sky-700 text-white" : "text-slate-700"}`}
                >
                  {t}
                </Link>
              ))}
            </nav>
            <Link href={`/calendario/bloquear?desde=${rango.desde < hoy ? hoy : rango.desde}`} className="flex h-10 items-center rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white">
              Bloquear
            </Link>
          </div>
        </div>

        {choques.length > 0 && (
          <section aria-label="Choques" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-900">
            <p className="font-semibold">⚠️ {choques.length === 1 ? "Hay un choque" : `Hay ${choques.length} choques`} en estos días:</p>
            <ul className="list-disc pl-5">
              {choques.map((c) => (
                <li key={`${c.unidad}-${c.desde}`}>
                  {c.unidad}: {c.etiquetas.join(" y ")} ({c.desde === c.hasta ? corta(c.desde) : `${corta(c.desde)} al ${corta(c.hasta)}`})
                </li>
              ))}
            </ul>
          </section>
        )}

        <Grilla dias={rango.dias} hoy={hoy} unidades={agenda.unidades} viajes={agenda.viajes} bloqueos={agenda.bloqueos} />
        <p className="text-sm text-slate-500">
          Tocá un día libre para cargar un viaje en esa unidad. ⚠ = viaje sin llegada estimada (ocupa solo el día de salida). Rayado ={" "}
          {Object.values(NOMBRE_MOTIVO).slice(0, 3).join(", ")} u otro bloqueo.
        </p>
      </section>
    </div>
  );
}
