import { formatearPlata, type Moneda } from "@/lib/formato";
import type { Montos as TipoMontos } from "@/lib/tablero";

const ORDEN: Moneda[] = ["ARS", "USD"];

// El "$" y el número no se separan en dos renglones: espacio que no corta (solo al mostrar).
const sinCorte = (texto: string) => texto.replace(" ", "\u00a0");

/** Muestra un monto por moneda, uno debajo del otro. Sin montos, muestra $ 0. */
export function Montos({ montos }: { montos: TipoMontos }) {
  const presentes = ORDEN.filter((m) => montos[m] !== undefined);
  if (presentes.length === 0) return <span>{sinCorte(formatearPlata(0))}</span>;
  return (
    <>
      {presentes.map((moneda) => (
        <span key={moneda} className="block">
          {sinCorte(formatearPlata(montos[moneda]!, moneda))}
        </span>
      ))}
    </>
  );
}
