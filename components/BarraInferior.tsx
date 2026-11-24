"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = [
  { href: "/", texto: "Inicio", icono: "M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" },
  { href: "/viajes", texto: "Viajes", icono: "M2 15V7h11v8M13 10h4l3 3v2M2 15h18M6 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" },
  { href: "/cobros", texto: "Cobros", icono: "M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 10v4m12-4v4" },
  { href: "/mas", texto: "Más", icono: "M5 12h.01M12 12h.01M19 12h.01" },
] as const;

export function BarraInferior() {
  const ruta = usePathname();

  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {SECCIONES.map(({ href, texto, icono }) => {
          const activa = href === "/" ? ruta === "/" : ruta.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activa ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-sm font-medium ${
                  activa ? "text-sky-700" : "text-slate-500"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={activa ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={icono} />
                </svg>
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
