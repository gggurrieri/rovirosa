"use client";

import { MAXIMO_ENTREGA } from "@/lib/viajes";

/**
 * "Se entrega en" de un auto: para viajes que dejan autos en varias ciudades
 * (José C. Paz → Bariloche → Mendoza). Vacío = el destino del viaje.
 */
export function CampoEntrega({ numero, valor, onCambiar }: { numero: number | string; valor: string; onCambiar: (texto: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-slate-600">Se entrega en (opcional)</span>
      <input
        aria-label={`Se entrega en, auto ${numero}`}
        placeholder="Igual que el destino del viaje"
        maxLength={MAXIMO_ENTREGA}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
      />
    </label>
  );
}
