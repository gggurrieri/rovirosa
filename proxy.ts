// En Next.js 16 el "middleware" se llama "proxy". Corre antes de cada página.
import { type NextRequest, NextResponse } from "next/server";
import { actualizarSesion } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  try {
    return await actualizarSesion(request);
  } catch (error) {
    // Sin esto, un problema de configuración se ve como una pantalla genérica
    // de "la página no cargó". Mejor decir qué pasa (sin mostrar claves).
    console.error("[proxy]", error);
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return new NextResponse(paginaDeError(mensaje), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

function paginaDeError(mensaje: string) {
  const seguro = mensaje.replace(/[<>&"]/g, "");
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tracker · Error</title></head>
<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#0f172a">
<h1 style="font-size:1.4rem">La app no está bien configurada</h1>
<p style="font-size:1.05rem;line-height:1.5">${seguro}</p>
<p style="color:#475569">Si ves esto en Netlify: revisá las variables de entorno y volvé a desplegar.</p>
</body></html>`;
}

export const config = {
  // Todo menos archivos estáticos, imágenes, el manifiesto y el service worker (tienen que
  // poder bajarse sin sesión, si no el celular no puede instalar la app).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
