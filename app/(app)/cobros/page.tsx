import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cobros · Rovirosa" };

export default function Cobros() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Cobros</h1>
      <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">
        Próximamente vas a poder registrar pagos y ver los saldos de cada cliente.
      </p>
    </div>
  );
}
