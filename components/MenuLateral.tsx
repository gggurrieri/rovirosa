"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECCIONES } from "./BarraInferior";

/** Menú de la computadora (1024 px o más). En el celular se usa la barra inferior. */
export function MenuLateral({ empresa }: { empresa: string }) {
  const ruta = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col bg-sky-800 text-white lg:flex">
      <p className="px-6 py-6 text-lg font-semibold leading-tight">{empresa}</p>
      <nav aria-label="Secciones (computadora)">
        <ul className="flex flex-col gap-1 px-3">
          {SECCIONES.map(({ href, texto, icono }) => {
            const activa = href === "/" ? ruta === "/" : ruta.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={activa ? "page" : undefined}
                  className={`flex h-11 items-center gap-3 rounded-lg px-3 text-base font-medium ${
                    activa ? "bg-white/15 text-white" : "text-sky-100 hover:bg-white/10"
                  }`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d={icono} />
                  </svg>
                  {texto}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
