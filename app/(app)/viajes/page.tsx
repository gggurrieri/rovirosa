import type { Metadata } from "next";
import Link from "next/link";
import { ChipEstado } from "@/components/ChipEstado";
import { Montos } from "@/components/Montos";
import { buscarViajes, opcionesFiltros } from "@/lib/datos-grilla";
import { formatearFecha, formatearPlata } from "@/lib/formato";
import { type FilaGrilla, type FiltrosViajes as Filtros, filtrosAURL, filtrosDesdeURL, NOMBRE_COBRO, type Orden } from "@/lib/grilla";
import type { Montos as TipoMontos } from "@/lib/tablero";
import { FiltrosViajes } from "./FiltrosViajes";

export const metadata: Metadata = { title: "Viajes · Tracker" };

const POR_PAGINA = 50;

const montos = (ars: number, usd: number): TipoMontos => (usd > 0 ? { ARS: ars, USD: usd } : { ARS: ars });

const COLOR_COBRO: Record<FilaGrilla["cobro"], string> = {
  pendiente: "text-red-700",
  parcial: "text-amber-800",
  pagado: "text-emerald-700",
  vencido: "font-semibold text-red-700",
  cancelado: "text-slate-500",
  sin_autos: "text-slate-500",
};

export default async function Viajes({ searchParams }: PageProps<"/viajes">) {
  const filtros = filtrosDesdeURL(await searchParams);
  const [resultado, opciones] = await Promise.all([buscarViajes(filtros, POR_PAGINA), opcionesFiltros()]);
  const { total, totales, filas } = resultado;
  const qs = filtrosAURL(filtros);
  const hayFiltros = filtrosAURL(filtros, { orden: "fecha_salida", dir: "desc", pagina: 1 }) !== "";
  const cliente = filtros.cliente ? opciones.clientes.find((c) => c.id === filtros.cliente)?.nombre : null;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          Viajes <span className="text-base font-normal text-slate-500">({total})</span>
        </h1>
        <div className="flex w-full gap-3 lg:w-auto">
          {total > 0 ? (
            <a
              href={`/viajes/exportar${qs ? `?${qs}` : ""}`}
              download
              className="hidden h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-base font-medium text-slate-800 lg:flex"
            >
              ⬇ Exportar a Excel
            </a>
          ) : (
            <span className="hidden h-11 items-center px-4 text-sm text-slate-500 lg:flex">No hay viajes para exportar</span>
          )}
          <Link
            href="/viajes/nuevo"
            className="flex h-14 flex-1 items-center justify-center rounded-xl bg-sky-700 px-6 text-lg font-semibold text-white active:bg-sky-800 lg:h-11 lg:flex-none lg:rounded-lg lg:text-base"
          >
            Nuevo viaje
          </Link>
        </div>
      </div>

      <FiltrosViajes key={qs} filtros={filtros} unidades={opciones.unidades} clientes={opciones.clientes} />

      {filtros.fechasInvertidas && (
        <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">
          Las fechas estaban al revés: se buscó del {formatearFecha(filtros.desde!)} al {formatearFecha(filtros.hasta!)}.
        </p>
      )}

      {total === 0 ? (
        <div className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">
          {hayFiltros ? (
            <>
              No hay viajes con esos filtros.{" "}
              <Link href="/viajes" className="font-medium text-sky-700 underline">
                Limpiar filtros
              </Link>
            </>
          ) : (
            "Todavía no hay viajes cargados."
          )}
        </div>
      ) : (
        <>
          <Tarjetas filas={filas} />
          <Tabla filas={filas} filtros={filtros} cliente={cliente ?? null} />
          <Totales total={total} totales={totales} cliente={cliente ?? null} />
          {paginas > 1 && <Paginas filtros={filtros} paginas={paginas} />}
        </>
      )}
    </div>
  );
}

/** Celular: una tarjeta por viaje. */
function Tarjetas({ filas }: { filas: FilaGrilla[] }) {
  return (
    <ul className="flex flex-col gap-3 lg:hidden">
      {filas.map((v) => {
        const debe = v.saldo_ars + v.saldo_usd > 0;
        return (
          <li key={v.id}>
            <Link href={`/viajes/${v.id}`} className="block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">#{v.numero}</span> · {formatearFecha(v.fecha_salida)}
                </p>
                <ChipEstado estado={v.estado} />
              </div>
              <p className="mt-2 text-lg font-semibold break-words">
                {v.origen} → {v.destino}
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-base text-slate-600">
                  {v.unidad ?? "Sin unidad"}
                  {v.estado === "en_viaje" && v.entregados > 0 && ` · ${v.entregados} de ${v.autos} entregados`}
                </p>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Saldo</p>
                  <p className={`text-base font-semibold tabular-nums ${debe ? "text-red-700" : "text-emerald-700"}`}>
                    <Montos montos={montos(v.saldo_ars, v.saldo_usd)} />
                  </p>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const COLUMNAS: { orden: Orden | null; texto: string; clases?: string; numerica?: boolean }[] = [
  { orden: "numero", texto: "#", numerica: true },
  { orden: "fecha_salida", texto: "Salida" },
  { orden: "ruta", texto: "Ruta" },
  { orden: "unidad", texto: "Unidad" },
  { orden: null, texto: "Chofer", clases: "hidden 2xl:table-cell" },
  { orden: "autos", texto: "Autos", numerica: true },
  { orden: null, texto: "Clientes", clases: "hidden 2xl:table-cell" },
  { orden: "estado", texto: "Estado" },
  { orden: null, texto: "Cobro" },
  { orden: "facturado", texto: "Facturado", numerica: true },
  { orden: "saldo", texto: "Saldo", numerica: true },
];

/** Computadora: tabla con orden por columna. Toda la fila abre el detalle. */
function Tabla({ filas, filtros, cliente }: { filas: FilaGrilla[]; filtros: Filtros; cliente: string | null }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm lg:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-600">
          <tr>
            {COLUMNAS.map((c) => {
              const activa = c.orden !== null && filtros.orden === c.orden;
              const dir = activa ? (filtros.dir === "asc" ? "desc" : "asc") : c.numerica || c.orden === "fecha_salida" ? "desc" : "asc";
              return (
                <th
                  key={c.texto}
                  scope="col"
                  aria-sort={activa ? (filtros.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`px-3 py-3 font-medium whitespace-nowrap ${c.numerica ? "text-right" : ""} ${c.clases ?? ""}`}
                >
                  {c.orden ? (
                    <Link href={`/viajes?${filtrosAURL(filtros, { orden: c.orden, dir, pagina: 1 })}`} className="hover:text-sky-700">
                      {c.texto}
                      {(c.texto === "Facturado" || c.texto === "Saldo") && cliente ? " *" : ""}
                      {activa && (filtros.dir === "asc" ? " ▲" : " ▼")}
                    </Link>
                  ) : (
                    c.texto
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filas.map((v) => (
            <tr key={v.id} className="relative border-b border-slate-100 last:border-0 hover:bg-sky-50">
              <td className="px-3 py-3 text-right font-semibold tabular-nums">
                {/* El link se estira sobre toda la fila: un clic en cualquier parte abre el viaje. */}
                <Link href={`/viajes/${v.id}`} className="after:absolute after:inset-0" aria-label={`Viaje ${v.numero}`}>
                  {v.numero}
                </Link>
              </td>
              <td className="px-3 py-3 whitespace-nowrap tabular-nums">{formatearFecha(v.fecha_salida)}</td>
              <td className="min-w-52 px-3 py-3">
                {v.origen} → {v.destino}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">{v.unidad ?? "—"}</td>
              <td className="hidden px-3 py-3 whitespace-nowrap 2xl:table-cell">{v.chofer ?? "—"}</td>
              <td className="px-3 py-3 text-right tabular-nums">{v.autos}</td>
              <td className="hidden max-w-56 truncate px-3 py-3 2xl:table-cell" title={v.clientes ?? ""}>
                {v.clientes ?? "—"}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">
                <ChipEstado estado={v.estado} />
                {v.estado === "en_viaje" && v.entregados > 0 && (
                  <span className="ml-1 text-xs text-slate-600">
                    {v.entregados}/{v.autos} entregados
                  </span>
                )}
              </td>
              <td className={`px-3 py-3 whitespace-nowrap ${COLOR_COBRO[v.cobro]}`}>{NOMBRE_COBRO[v.cobro]}</td>
              <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                <Montos montos={montos(v.facturado_ars, v.facturado_usd)} />
              </td>
              <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                <Montos montos={montos(v.saldo_ars, v.saldo_usd)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Totales = { facturado_ars: number; saldo_ars: number; facturado_usd: number; saldo_usd: number };

function Totales({ total, totales, cliente }: { total: number; totales: Totales; cliente: string | null }) {
  return (
    <section aria-label="Totales" className="flex flex-col gap-1 rounded-2xl bg-slate-200/60 p-4 text-base">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="font-semibold">
          {total} {total === 1 ? "viaje" : "viajes"}
        </p>
        <p>
          Facturado <strong className="tabular-nums">{formatearPlata(totales.facturado_ars)}</strong>
          {totales.facturado_usd > 0 && <strong className="ml-2 tabular-nums">{formatearPlata(totales.facturado_usd, "USD")}</strong>}
        </p>
        <p>
          Saldo <strong className="tabular-nums">{formatearPlata(totales.saldo_ars)}</strong>
          {totales.saldo_usd > 0 && <strong className="ml-2 tabular-nums">{formatearPlata(totales.saldo_usd, "USD")}</strong>}
        </p>
      </div>
      {cliente && <p className="text-sm text-slate-600">* Facturado y saldo de los autos de {cliente}.</p>}
    </section>
  );
}

function Paginas({ filtros, paginas }: { filtros: Filtros; paginas: number }) {
  const enlace = (pagina: number) => `/viajes?${filtrosAURL(filtros, { pagina })}`;
  return (
    <nav aria-label="Páginas" className="flex items-center justify-center gap-4 text-base">
      {filtros.pagina > 1 ? (
        <Link href={enlace(filtros.pagina - 1)} className="font-medium text-sky-700">
          ‹ Anterior
        </Link>
      ) : (
        <span className="text-slate-400">‹ Anterior</span>
      )}
      <span>
        Página {filtros.pagina} de {paginas}
      </span>
      {filtros.pagina < paginas ? (
        <Link href={enlace(filtros.pagina + 1)} className="font-medium text-sky-700">
          Siguiente ›
        </Link>
      ) : (
        <span className="text-slate-400">Siguiente ›</span>
      )}
    </nav>
  );
}
