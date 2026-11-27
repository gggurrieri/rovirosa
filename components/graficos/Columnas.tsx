// Gráfico de columnas por mes, en HTML: el texto queda en su tamaño real en el celular.
// Una o dos series; barras finas (≤ 24 px) con la punta redondeada, separadas 2 px,
// líneas de guía tenues y el valor escrito solo en el último mes. Cada barra tiene
// su tooltip (title) y debajo va la tabla con todos los números.
import { escalaLimpia } from "@/lib/metricas";

export type Serie = { nombre: string; color: string; valores: number[] };

export function Columnas({
  categorias,
  series,
  formatoEje,
  formatoValor,
  etiqueta,
}: {
  categorias: string[];
  series: Serie[];
  formatoEje: (n: number) => string;
  formatoValor: (n: number) => string;
  /** Descripción para lectores de pantalla. */
  etiqueta: string;
}) {
  const maximo = Math.max(0, ...series.flatMap((s) => s.valores));
  const { tope, paso } = escalaLimpia(maximo);
  const marcas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);
  const ultimo = categorias.length - 1;

  return (
    <figure className="flex flex-col gap-3">
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600" aria-label="Referencias">
          {series.map((s) => (
            <li key={s.nombre} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
              {s.nombre}
              {/* Con dos series, el valor del último mes va en la referencia: sobre las barras se pisan. */}
              <span className="font-medium text-slate-800 tabular-nums">
                · {categorias[ultimo]}: {formatoEje(s.valores[ultimo] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div role="img" aria-label={etiqueta} className="flex gap-2">
        {/* Eje: solo las etiquetas, alineadas con las líneas de guía */}
        <div className="relative h-44 w-16 shrink-0 text-right text-xs whitespace-nowrap text-slate-500 tabular-nums" aria-hidden="true">
          {marcas.map((m) => (
            <span key={m} className="absolute right-0" style={{ bottom: `${(m / tope) * 100}%`, transform: "translateY(50%)" }}>
              {formatoEje(m)}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative h-44 border-b border-slate-300">
            {marcas.slice(1).map((m) => (
              <div key={m} aria-hidden="true" className="absolute inset-x-0 border-t border-slate-200" style={{ bottom: `${(m / tope) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex">
              {categorias.map((c, i) => (
                <div key={c} className="flex flex-1 items-end justify-center gap-[2px]">
                  {series.map((s) => {
                    const v = s.valores[i] ?? 0;
                    return (
                      <div key={s.nombre} className="relative flex h-full w-full max-w-6 flex-col justify-end">
                        {i === ultimo && v > 0 && series.length === 1 && (
                          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap text-slate-800 tabular-nums" style={{ bottom: `calc(${(v / tope) * 100}% + 2px)` }}>
                            {formatoEje(v)}
                          </span>
                        )}
                        <div
                          title={`${c} · ${s.nombre}: ${formatoValor(v)}`}
                          className="w-full rounded-t-[4px]"
                          style={{ height: `${(v / tope) * 100}%`, background: s.color, minHeight: v > 0 ? 2 : 0 }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex pt-1 text-xs text-slate-600" aria-hidden="true">
            {categorias.map((c) => (
              <span key={c} className="flex-1 text-center">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
