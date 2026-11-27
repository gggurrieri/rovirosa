// Link de suscripción (iCal) para Google Calendar, iPhone u Outlook. Se abre sin sesión:
// el token largo y secreto es la llave, y la base solo devuelve fechas, rutas y unidades
// (nunca precios ni clientes). Si se regenera o el usuario se desactiva, deja de andar.
import { createClient } from "@supabase/supabase-js";
import { configSupabase } from "@/lib/supabase/config";
import { generarICS, type BloqueoICS, type ViajeICS } from "@/lib/ics";
import { urlBase } from "@/lib/url-base";

export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{64}$/;

export async function GET(_request: Request, ctx: RouteContext<"/ics/[token]">) {
  const { token } = await ctx.params;
  const limpio = token.replace(/\.ics$/, "");
  if (!TOKEN.test(limpio)) return noEncontrado();

  const { url, anonKey } = configSupabase();
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("calendario_ics", { p_token: limpio });
  if (error) {
    console.error("[ics]", error.message);
    return new Response("No se pudo armar el calendario. Probá de nuevo en un rato.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (!data) return noEncontrado();

  const d = data as { empresa: string; viajes: ViajeICS[]; bloqueos: BloqueoICS[] };
  const ics = generarICS({ empresa: d.empresa, viajes: d.viajes ?? [], bloqueos: d.bloqueos ?? [], urlBase: await urlBase() });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="viajes.ics"',
      "cache-control": "private, max-age=300",
      "x-robots-tag": "noindex",
    },
  });
}

function noEncontrado() {
  return new Response("Este link de calendario no existe o fue reemplazado por uno nuevo.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
