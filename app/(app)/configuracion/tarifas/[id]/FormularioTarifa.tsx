"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { type Coordenadas, linkGoogleMaps, type ResultadoDistancia } from "@/lib/distancias";
import type { TarifaConfig } from "@/lib/datos-configuracion";
import { formatearPlata } from "@/lib/formato";
import { calcularKm, type Estado, guardarTarifa } from "../../actions";
import { campo, ErrorForm } from "../../componentes";
import { CampoLugar } from "./CampoLugar";

export function FormularioTarifa({ tarifa, calculoAutomatico, lugaresUsados }: { tarifa: TarifaConfig | null; calculoAutomatico: boolean; lugaresUsados: string[] }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(guardarTarifa, { error: null });
  const [origen, setOrigen] = useState(tarifa?.origen ?? "");
  const [destino, setDestino] = useState(tarifa?.destino ?? "");
  const [ubicaciones, setUbicaciones] = useState<{ origen: Coordenadas | null; destino: Coordenadas | null }>({ origen: null, destino: null });
  const [calculo, setCalculo] = useState<ResultadoDistancia | null>(null);
  const [calculando, iniciar] = useTransition();
  const km = useRef<HTMLInputElement>(null);
  const completos = origen.trim() !== "" && destino.trim() !== "";

  function calcular() {
    iniciar(async () => {
      const r = await calcularKm(origen, destino, ubicaciones);
      setCalculo(r);
      if (r.ok && km.current) km.current.value = String(r.km);
    });
  }

  return (
    <form action={accion} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <input type="hidden" name="id" value={tarifa?.id ?? "nueva"} />
      <div className="grid grid-cols-2 gap-3">
        <CampoLugar
          nombre="origen"
          etiqueta="Origen"
          valor={origen}
          propios={lugaresUsados}
          conServicio={calculoAutomatico}
          onEscribir={(t) => { setOrigen(t); setUbicaciones((u) => ({ ...u, origen: null })); setCalculo(null); }}
          onElegir={(t, c) => { setOrigen(t); setUbicaciones((u) => ({ ...u, origen: c })); setCalculo(null); }}
        />
        <CampoLugar
          nombre="destino"
          etiqueta="Destino"
          valor={destino}
          propios={lugaresUsados}
          conServicio={calculoAutomatico}
          onEscribir={(t) => { setDestino(t); setUbicaciones((u) => ({ ...u, destino: null })); setCalculo(null); }}
          onElegir={(t, c) => { setDestino(t); setUbicaciones((u) => ({ ...u, destino: c })); setCalculo(null); }}
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Km</span>
          <input ref={km} name="km" type="number" inputMode="numeric" min={1} required defaultValue={tarifa?.km} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Moneda</span>
          <select name="moneda" defaultValue={tarifa?.moneda ?? "ARS"} className={campo}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
        <div className="col-span-2 -mt-1 flex flex-col gap-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {calculoAutomatico && (
              <button
                type="button"
                onClick={calcular}
                disabled={!completos || calculando}
                className="flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-base font-medium text-slate-800 active:bg-slate-50 disabled:opacity-50"
              >
                {calculando ? "Calculando…" : "📍 Calcular km"}
              </button>
            )}
            {completos && (
              <a href={linkGoogleMaps(origen, destino)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-base font-medium text-sky-700">
                Ver en Google Maps ↗
              </a>
            )}
          </div>
          {calculo?.ok && (
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">
              {calculo.origen} → {calculo.destino}: <b>{calculo.km.toLocaleString("es-AR")} km</b> por ruta en camión. Revisá que sean los lugares correctos; podés corregir los km.
              <span className="mt-1 block text-xs text-sky-800">© openrouteservice.org · © colaboradores de OpenStreetMap</span>
            </p>
          )}
          {calculo && !calculo.ok && (
            <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {calculo.error}
            </p>
          )}
        </div>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-sm text-slate-600">Precio por auto</span>
          <input
            name="precio"
            inputMode="decimal"
            required
            defaultValue={tarifa ? formatearPlata(tarifa.precio_base_centavos, tarifa.moneda).replace(/^(US)?\$ /, "") : ""}
            placeholder="950.000"
            className={`${campo} text-lg tabular-nums`}
          />
        </label>
      </div>
      <label className="flex items-center gap-3">
        <input name="activa" type="checkbox" defaultChecked={tarifa?.activa ?? true} className="h-5 w-5 accent-sky-700" />
        <span className="text-base">Activa (aparece en Nuevo viaje)</span>
      </label>
      {tarifa && <p className="text-sm text-slate-500">Un precio nuevo vale para los viajes que se carguen desde ahora. Los ya cargados conservan el suyo.</p>}
      <ErrorForm error={estado.error} />
      <button type="submit" disabled={enviando} className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60">
        {enviando ? "Guardando…" : "Guardar tarifa"}
      </button>
    </form>
  );
}
