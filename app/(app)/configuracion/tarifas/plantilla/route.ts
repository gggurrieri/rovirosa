// Planilla de ejemplo para importar tarifas (CSV que Excel abre en español).
import { PLANTILLA_CSV } from "@/lib/configuracion";

export function GET() {
  return new Response(`﻿${PLANTILLA_CSV}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="tarifas-ejemplo.csv"',
    },
  });
}
