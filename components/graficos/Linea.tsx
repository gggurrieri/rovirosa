// Línea de tendencia (por ejemplo, días de cobro por mes). La línea va en SVG
// estirado al ancho; los puntos y el último valor, en HTML para que no se deformen.
// Los meses sin dato cortan la línea en vez de inventar un cero.
import { escalaLimpia } from "@/lib/metricas";

export function Linea({
  categorias,
  valores,
  color,
  formato,
  etiqueta,
}: {
  categorias: string[];
  valores: (number | null)[];
  color: string;
  formato: (n: number) => string;
  etiqueta: string;
}) {
  const { tope, paso } = escalaLimpia(Math.max(0, ...valores.map((v) => v ?? 0)));
  const marcas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);
  const x = (i: number) => ((i + 0.5) / categorias.length) * 100;
  const y = (v: number) => 100 - (v / tope) * 100;
  // Tramos de la línea entre meses con dato consecutivos
  const tramos: string[] = [];
  let actual: string[] = [];
  valores.forEach((v, i) => {
    if (v === null) {
      if (actual.length > 1) tramos.push(actual.join(" "));
      actual = [];
    } else actual.push(`${x(i)},${y(v)}`);
  });
  if (actual.length > 1) tramos.push(actual.join(" "));
  const ultimo = valores.reduce<number>((u, v, i) => (v !== null ? i : u), -1);

  return (
    <figure role="img" aria-label={etiqueta} className="flex gap-2">
      <div className="relative h-36 w-16 shrink-0 text-right text-xs whitespace-nowrap text-slate-500 tabular-nums" aria-hidden="true">
        {marcas.map((m) => (
          <span key={m} className="absolute right-0" style={{ bottom: `${(m / tope) * 100}%`, transform: "translateY(50%)" }}>
            {m}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative h-36 border-b border-slate-300">
          {marcas.slice(1).map((m) => (
            <div key={m} aria-hidden="true" className="absolute inset-x-0 border-t border-slate-200" style={{ bottom: `${(m / tope) * 100}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {tramos.map((puntos) => (
              <polyline key={puntos} points={puntos} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </svg>
          {valores.map((v, i) =>
            v === null ? null : (
              <span
                key={categorias[i]}
                title={`${categorias[i]}: ${formato(v)}`}
                className="absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-white"
                style={{ left: `${x(i)}%`, bottom: `${(v / tope) * 100}%`, background: color }}
              >
                {i === ultimo && (
                  <span className="absolute right-full bottom-full mr-1 text-xs font-medium whitespace-nowrap text-slate-800">{formato(v)}</span>
                )}
              </span>
            ),
          )}
        </div>
        <div className="flex pt-1 text-xs text-slate-600" aria-hidden="true">
          {categorias.map((c) => (
            <span key={c} className="flex-1 text-center">
              {c}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
