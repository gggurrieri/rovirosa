// Barras horizontales con el valor escrito en la punta (antigüedad de la deuda, clientes).
import Link from "next/link";

export type Fila = { clave: string; etiqueta: string; detalle?: string; valor: number; color: string; href?: string };

export function BarrasHorizontales({ filas, formato, etiqueta }: { filas: Fila[]; formato: (n: number) => string; etiqueta: string }) {
  const maximo = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <ul aria-label={etiqueta} className="flex flex-col gap-3">
      {filas.map((f) => {
        const contenido = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-800">{f.etiqueta}</span>
              <span className="shrink-0 font-semibold text-slate-900 tabular-nums">{formato(f.valor)}</span>
            </span>
            <span className="mt-1 block h-3 w-full" title={`${f.etiqueta}: ${formato(f.valor)}`}>
              <span className="block h-full rounded-r-[4px]" style={{ width: `${(f.valor / maximo) * 100}%`, minWidth: f.valor > 0 ? 2 : 0, background: f.color }} />
            </span>
            {f.detalle && <span className="mt-1 block text-xs text-slate-500">{f.detalle}</span>}
          </>
        );
        return (
          <li key={f.clave}>
            {f.href ? (
              <Link href={f.href} className="block rounded-lg active:bg-slate-50">
                {contenido}
              </Link>
            ) : (
              contenido
            )}
          </li>
        );
      })}
    </ul>
  );
}
