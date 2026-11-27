"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const nada = () => () => {};

/** Acceso a "Instalá la app" en Más. Si ya se abrió desde el ícono instalado, no aparece. */
export function EnlaceInstalar() {
  const instalada = useSyncExternalStore(
    nada,
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
  if (instalada) return null;
  return (
    <Link
      href="/mas/instalar"
      className="flex min-h-14 items-center justify-between rounded-2xl bg-white px-5 py-3 text-lg font-semibold shadow-sm active:bg-slate-50"
    >
      <span>📲 Instalá la app</span>
      <span className="text-sm font-normal text-slate-500">Ícono en el celular →</span>
    </Link>
  );
}
