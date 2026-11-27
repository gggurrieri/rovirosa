import { headers } from "next/headers";

/** "https://dominio" de la app, tal como lo ve quien hizo el pedido (Netlify pasa x-forwarded-*). */
export async function urlBase(): Promise<string> {
  const encabezados = await headers();
  const host = encabezados.get("x-forwarded-host") ?? encabezados.get("host") ?? "";
  const protocolo = encabezados.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}
