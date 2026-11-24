import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configSupabase } from "./config";

/** Cliente de Supabase para server components y server actions. */
export async function crearClienteServidor() {
  // Leer las cookies primero marca la página como dinámica (depende del usuario),
  // así el build no intenta pre-generarla ni necesita las claves.
  const almacen = await cookies();
  const { url, anonKey } = configSupabase();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(cookiesParaGuardar) {
        try {
          cookiesParaGuardar.forEach(({ name, value, options }) =>
            almacen.set(name, value, options),
          );
        } catch {
          // Un server component no puede escribir cookies. No pasa nada:
          // proxy.ts ya refresca la sesión en cada pedido.
        }
      },
    },
  });
}
