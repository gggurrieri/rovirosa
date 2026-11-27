"use client";

import { useActionState, useState } from "react";
import { parsearCSVTarifas } from "@/lib/configuracion";
import { formatearPlata } from "@/lib/formato";
import { type Estado, importarTarifas } from "../../actions";
import { ErrorForm } from "../../componentes";

/** Elegís el archivo (o pegás las filas), ves qué se va a cargar y confirmás. */
export function Importador() {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(importarTarifas, { error: null });
  const [csv, setCsv] = useState("");
  const { filas, errores } = csv.trim() === "" ? { filas: [], errores: [] } : parsearCSVTarifas(csv);

  async function leerArchivo(archivo: File | undefined) {
    if (archivo) setCsv(await archivo.text());
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-base text-slate-700">
        <li>
          Bajá la{" "}
          <a href="/configuracion/tarifas/plantilla" download className="font-medium text-sky-700 underline">
            planilla de ejemplo
          </a>{" "}
          y completala en Excel: una fila por ruta.
        </li>
        <li>Guardala como &quot;CSV (delimitado por comas)&quot;.</li>
        <li>Elegila acá abajo, revisá y confirmá.</li>
      </ol>
      <label className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5">
        <span className="text-base font-medium">Archivo CSV</span>
        <input type="file" accept=".csv,text/csv" aria-label="Archivo CSV de tarifas" onChange={(e) => leerArchivo(e.target.files?.[0])} className="text-base" />
      </label>
      <details className="rounded-xl bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-base font-medium text-slate-700">O pegá las filas acá</summary>
        <textarea
          aria-label="Filas de tarifas"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={"Origen;Destino;Km;Precio;Moneda\nBuenos Aires;Córdoba;700;950.000;ARS"}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
        />
      </details>
      <input type="hidden" name="csv" value={csv} />

      {errores.length > 0 && (
        <section aria-label="Filas con problemas" className="rounded-2xl bg-red-50 p-4 text-base text-red-900">
          <p className="font-semibold">Hay {errores.length} {errores.length === 1 ? "fila" : "filas"} para corregir:</p>
          <ul className="mt-1 list-disc pl-5">
            {errores.map((e) => (
              <li key={e.linea}>
                Fila {e.linea}: {e.error}
              </li>
            ))}
          </ul>
        </section>
      )}
      {filas.length > 0 && (
        <section aria-label="Vista previa" className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Ruta</th>
                <th className="px-3 py-2 text-right font-medium">Km</th>
                <th className="px-3 py-2 text-right font-medium">Precio</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.origen}-${f.destino}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    {f.origen} → {f.destino}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.km}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatearPlata(f.precio_centavos, f.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="text-sm text-slate-500">Si una ruta ya existe, se actualiza su precio (y se reactiva). Si hay una fila mal, no se carga ninguna.</p>
      <ErrorForm error={estado.error} />
      <button
        type="submit"
        disabled={enviando || filas.length === 0 || errores.length > 0}
        className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:bg-slate-300 disabled:text-slate-600"
      >
        {enviando ? "Importando…" : filas.length > 0 ? `Importar ${filas.length} ${filas.length === 1 ? "tarifa" : "tarifas"}` : "Importar"}
      </button>
    </form>
  );
}
