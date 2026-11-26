// Destino del link del mail de confirmación. Supabase ya confirmó el email antes de
// mandar acá; si además viene un código y el registro se hizo en este mismo
// navegador, se abre la sesión directo. Si no (lo abrió en otro dispositivo), se
// pide entrar con email y contraseña: el email igual quedó confirmado.
import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const codigo = url.searchParams.get("code");
  if (codigo) {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(new URL("/", url));
  }
  return NextResponse.redirect(new URL("/login?confirmado=1", url));
}
