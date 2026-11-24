import { formatearPlata, type Moneda } from "@/lib/formato";
import type { Montos as TipoMontos } from "@/lib/tablero";

const ORDEN: Moneda[] = ["ARS", "USD"];

/** Muestra un monto por moneda, uno debajo del otro. Sin montos, muestra $ 0. */
export function Montos({ montos }: { montos: TipoMontos }) {
  const presentes = ORDEN.filter((m) => montos[m] !== undefined);
  if (presentes.length === 0) return <span>{formatearPlata(0)}</span>;
  return (
    <>
      {presentes.map((moneda) => (
        <span key={moneda} className="block">
          {formatearPlata(montos[moneda]!, moneda)}
        </span>
      ))}
    </>
  );
}
