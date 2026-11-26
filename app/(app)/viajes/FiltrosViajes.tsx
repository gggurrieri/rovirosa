"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FiltrosViajes as Filtros, filtrosAURL, filtrosDesdeURL } from "@/lib/grilla";
import { NOMBRE_ESTADO } from "@/lib/viajes";

const ESTADOS = Object.entries(NOMBRE_ESTADO) as [keyof typeof NOMBRE_ESTADO, string][];
const campo =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200";

/**
 * Filtros de la grilla. Viven en la URL: "atrás" los conserva y un link los comparte.
 * En el celular quedan plegados detrás de "Filtrar"; en la computadora, siempre a la vista.
 */
export function FiltrosViajes({
  filtros,
  unidades,
  clientes,
}: {
  filtros: Filtros;
  unidades: { id: string; nombre: string }[];
  clientes: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const activos =
    filtros.estados.length + [filtros.cobro, filtros.desde, filtros.hasta, filtros.unidad, filtros.cliente, filtros.texto].filter(Boolean).length;

  function aplicar(formData: FormData) {
    const params = new URLSearchParams();
    for (const [clave, valor] of formData) if (typeof valor === "string" && valor.trim() !== "") params.append(clave, valor);
    const nuevos = filtrosDesdeURL(params);
    // Se conserva el orden elegido; se vuelve a la primera página.
    const qs = filtrosAURL(nuevos, { orden: filtros.orden, dir: filtros.dir, pagina: 1 });
    setAbierto(false);
    router.push(qs ? `/viajes?${qs}` : "/viajes");
  }

  return (
    <section aria-label="Filtros" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex h-12 items-center justify-between rounded-xl border border-slate-300 bg-white px-4 text-base font-medium lg:hidden"
      >
        <span>🔎 Filtrar{activos > 0 ? ` (${activos} ${activos === 1 ? "filtro" : "filtros"})` : ""}</span>
        <span aria-hidden="true">{abierto ? "▴" : "▾"}</span>
      </button>

      <form
        action={aplicar}
        className={`${abierto ? "flex" : "hidden"} flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm lg:flex`}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-sm text-slate-600">Buscar</span>
            <input name="q" type="search" defaultValue={filtros.texto} placeholder="Ruta, cliente, unidad, número…" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">Cobro</span>
            <select name="cobro" defaultValue={filtros.cobro ?? ""} className={campo}>
              <option value="">Todos</option>
              <option value="con_saldo">Con saldo</option>
              <option value="vencidos">Vencidos</option>
              <option value="pagados">Pagados</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">Unidad</span>
            <select name="unidad" defaultValue={filtros.unidad ?? ""} className={campo}>
              <option value="">Todas</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-sm text-slate-600">Cliente</span>
            <select name="cliente" defaultValue={filtros.cliente ?? ""} className={campo}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">Salida desde</span>
            <input name="desde" type="date" defaultValue={filtros.desde ?? ""} className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">Salida hasta</span>
            <input name="hasta" type="date" defaultValue={filtros.hasta ?? ""} className={campo} />
          </label>
          <fieldset className="flex flex-col gap-1 lg:col-span-4">
            <legend className="mb-1 text-sm text-slate-600">Estado del viaje</legend>
            <div className="flex flex-wrap gap-2">
              {ESTADOS.map(([valor, texto]) => (
                <label
                  key={valor}
                  className="flex h-9 cursor-pointer items-center rounded-full border border-slate-300 px-3 text-sm has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50 has-[:checked]:text-sky-900"
                >
                  <input type="checkbox" name="estado" value={valor} defaultChecked={filtros.estados.includes(valor)} className="sr-only" />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex items-center gap-4">
          <button type="submit" className="h-11 rounded-lg bg-sky-700 px-6 text-base font-semibold text-white active:bg-sky-800">
            Aplicar
          </button>
          {activos > 0 && (
            <Link href="/viajes" className="text-base font-medium text-slate-600 underline">
              Limpiar filtros
            </Link>
          )}
        </div>
      </form>
    </section>
  );
}
