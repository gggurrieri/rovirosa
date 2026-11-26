// Exporta a Excel (CSV) exactamente los viajes que muestra la grilla con estos filtros.
import { buscarViajes } from "@/lib/datos-grilla";
import { hoyEnArgentina } from "@/lib/formato";
import { aCSV, filtrosDesdeURL } from "@/lib/grilla";

const MAXIMO = 5000;

export async function GET(request: Request) {
  const filtros = { ...filtrosDesdeURL(new URL(request.url).searchParams), pagina: 1 };
  const { filas } = await buscarViajes(filtros, MAXIMO);
  return new Response(aCSV(filas), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="viajes-${hoyEnArgentina()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
