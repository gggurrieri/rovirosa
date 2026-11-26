"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { formatearPlata } from "@/lib/formato";
import { type Estado, guardarEmpresa, previsualizarVencimiento, type VistaPrevia } from "../actions";
import { campo, ErrorForm } from "../componentes";

const monto = (x: { ars: number; usd: number }) => [x.ars > 0 || x.usd === 0 ? formatearPlata(x.ars) : null, x.usd > 0 ? formatearPlata(x.usd, "USD") : null].filter(Boolean).join(" y ");

export function FormularioEmpresa({ nombre, cuit, dias }: { nombre: string; cuit: string | null; dias: number }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(guardarEmpresa, { error: null });
  const [nuevosDias, setNuevosDias] = useState(String(dias));
  const [vista, setVista] = useState<VistaPrevia>(null);
  const [, iniciar] = useTransition();
  const n = Number(nuevosDias);
  const cambia = Number.isInteger(n) && n !== dias;

  useEffect(() => {
    if (!cambia) return;
    const espera = setTimeout(() => iniciar(async () => setVista(await previsualizarVencimiento(n))), 300);
    return () => clearTimeout(espera);
  }, [cambia, n]);

  return (
    <form action={accion} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Nombre de la empresa</span>
        <input name="nombre" required maxLength={120} defaultValue={nombre} className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">CUIT</span>
        <input name="cuit" maxLength={20} defaultValue={cuit ?? ""} placeholder="20-12345678-9" className={campo} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Días para que un cobro venza (desde la entrega del auto)</span>
        <input name="dias" type="number" inputMode="numeric" min={0} max={180} required value={nuevosDias} onChange={(e) => setNuevosDias(e.target.value)} className={`${campo} max-w-32`} />
      </label>
      {cambia && vista && (
        <section aria-label="Qué cambia" className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-950">
          <p className="font-semibold">Si pasás de {dias} a {n} días:</p>
          <p>
            Vencidos hoy: {vista.actual.autos} {vista.actual.autos === 1 ? "auto" : "autos"} ({monto(vista.actual)}) → pasarían a ser {vista.nuevo.autos} ({monto(vista.nuevo)}).
          </p>
          <p className="text-sm">Cambia en Inicio, Cobros, Métricas y los recordatorios.</p>
        </section>
      )}
      <ErrorForm error={estado.error} />
      <button type="submit" disabled={enviando} className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:opacity-60">
        {enviando ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
