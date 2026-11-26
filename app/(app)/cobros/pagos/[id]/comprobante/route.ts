// Abre el comprobante de un pago con un link temporal: la página nunca muestra la
// ruta del archivo ni un link permanente. RLS decide si el usuario puede verlo.
import { NextResponse } from "next/server";
import { linkComprobante } from "@/lib/comprobante-servidor";
import { obtenerPago } from "@/lib/datos-cobros";

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteContext<"/cobros/pagos/[id]/comprobante">) {
  const { id } = await params;
  const pago = ES_UUID.test(id) ? await obtenerPago(id) : null;
  const link = pago?.comprobante_path ? await linkComprobante(pago.comprobante_path) : null;
  if (!link) {
    return new NextResponse("No encontramos ese comprobante.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.redirect(link, { headers: { "cache-control": "no-store" } });
}
