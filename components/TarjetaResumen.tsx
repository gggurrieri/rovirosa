import type { ReactNode } from "react";

export function TarjetaResumen({
  titulo,
  valor,
  detalle,
  tono = "normal",
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: string;
  tono?: "normal" | "alerta";
}) {
  return (
    <section
      className={`rounded-2xl bg-white p-5 shadow-sm ${tono === "alerta" ? "border-l-4 border-red-600" : ""}`}
    >
      <h2 className="text-base font-medium text-slate-600">{titulo}</h2>
      <p
        className={`mt-1 text-3xl font-bold tabular-nums ${tono === "alerta" ? "text-red-700" : "text-slate-900"}`}
      >
        {valor}
      </p>
      {detalle && <p className="mt-1 text-sm text-slate-500">{detalle}</p>}
    </section>
  );
}
