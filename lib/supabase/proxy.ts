import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { configSupabase } from "./config";

const RUTAS_PUBLICAS = ["/login", "/registro", "/auth/confirmar"];

/**
 * Corre antes de cada página: refresca la sesión de Supabase (y guarda las
 * cookies nuevas) y redirige a /login si no hay usuario.
 */
export async function actualizarSesion(request: NextRequest) {
  const { url, anonKey } = configSupabase();
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesParaGuardar, headers) {
        cookiesParaGuardar.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        cookiesParaGuardar.forEach(({ name, value, options }) =>
          respuesta.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([clave, valor]) => respuesta.headers.set(clave, valor));
      },
    },
  });

  // getClaims valida el token; no confiar en getSession() del lado del servidor.
  const { data } = await supabase.auth.getClaims();
  const hayUsuario = Boolean(data?.claims?.sub);
  const ruta = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some((r) => ruta === r || ruta.startsWith(`${r}/`));

  if (!hayUsuario && !esPublica) {
    return redirigir(request, "/login", respuesta);
  }
  if (hayUsuario && esPublica) {
    return redirigir(request, "/", respuesta);
  }
  return respuesta;
}

// Al redirigir hay que copiar las cookies refrescadas para no cortar la sesión.
function redirigir(request: NextRequest, destino: string, respuesta: NextResponse) {
  const redireccion = NextResponse.redirect(new URL(destino, request.url));
  respuesta.cookies.getAll().forEach((cookie) => redireccion.cookies.set(cookie));
  return redireccion;
}
