// Km por ruta entre dos lugares, con OpenRouteService de HeiGIT (datos de OpenStreetMap): plan gratis
// con clave propia, 2.000 rutas por día. Se usa SOLO desde el servidor (la clave no viaja al
// celular) y solo con nombres de lugares: ningún dato de clientes.
// Perfil "camión" (driving-hgv): es lo que hacen los mosquitos.

export type ResultadoDistancia =
  | { ok: true; km: number; origen: string; destino: string }
  | { ok: false; error: string };

type Config = { clave: string; url: string; fetch?: typeof fetch };
export type Coordenadas = [number, number]; // [longitud, latitud]
export type Lugar = { nombre: string; coordenadas: Coordenadas };
/** Ubicaciones ya elegidas de las sugerencias: así "Calcular km" no vuelve a buscarlas. */
export type Conocidos = { origen?: Coordenadas | null; destino?: Coordenadas | null };

const PAISES = "AR,CL,UY,PY,BO,BR"; // Argentina y limítrofes
const ESPERA_MS = 8000;

class ErrorServicio extends Error {}

export async function calcularDistancia(origen: string, destino: string, config: Config, conocidos: Conocidos = {}): Promise<ResultadoDistancia> {
  const o = origen.trim();
  const d = destino.trim();
  if (!o || !d) return { ok: false, error: "Completá origen y destino." };
  if (!config.clave) return { ok: false, error: "El cálculo automático no está configurado." };
  const f = config.fetch ?? fetch;

  try {
    const ubicar = (texto: string, c?: Coordenadas | null) =>
      c && coordenadasValidas(c) ? Promise.resolve<Lugar>({ nombre: texto, coordenadas: c }) : buscarLugar(texto, config, f);
    const [desde, hasta] = await Promise.all([ubicar(o, conocidos.origen), ubicar(d, conocidos.destino)]);
    for (const [texto, lugar] of [[o, desde], [d, hasta]] as const) {
      if (!lugar) return { ok: false, error: `No encontré "${texto}". Probá con ciudad y provincia, por ejemplo "Bariloche, Río Negro".` };
    }
    const r = await pedir(f, `${config.url}/openrouteservice/v2/directions/driving-hgv`, {
      method: "POST",
      headers: { Authorization: config.clave, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ coordinates: [desde!.coordenadas, hasta!.coordenadas], instructions: false }),
    });
    if (r.status === 404 || r.status === 400) return { ok: false, error: "No encontré un camino por ruta entre esos lugares." };
    revisar(r);
    const metros = (await r.json())?.routes?.[0]?.summary?.distance;
    if (typeof metros !== "number" || metros <= 0) return { ok: false, error: "No encontré un camino por ruta entre esos lugares." };
    return { ok: true, km: Math.max(1, Math.round(metros / 1000)), origen: desde!.nombre, destino: hasta!.nombre };
  } catch (e) {
    if (e instanceof ErrorServicio) return { ok: false, error: e.message };
    return { ok: false, error: "No se pudo calcular ahora. Probá en un rato o mirá los km en Google Maps." };
  }
}

async function buscarLugar(texto: string, config: Config, f: typeof fetch): Promise<Lugar | null> {
  const q = new URLSearchParams({ text: texto, size: "1", "boundary.country": PAISES, layers: "locality,localadmin,county,region,venue,address" });
  const r = await pedir(f, `${config.url}/pelias/v1/search?${q}`, { headers: { Authorization: config.clave, Accept: "application/json" } });
  revisar(r);
  return aLugares(await r.json(), texto)[0] ?? null;
}

function aLugares(json: unknown, texto: string): Lugar[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  return features.flatMap((x) => {
    const lugar = x as { geometry?: { coordinates?: unknown }; properties?: { label?: unknown } };
    const c = lugar.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return [];
    const coordenadas: Coordenadas = [Number(c[0]), Number(c[1])];
    return coordenadasValidas(coordenadas) ? [{ nombre: String(lugar.properties?.label ?? texto), coordenadas }] : [];
  });
}

export const coordenadasValidas = (c: unknown): c is Coordenadas =>
  Array.isArray(c) && c.length === 2 && c.every((n) => typeof n === "number" && Number.isFinite(n)) &&
  Math.abs(c[0] as number) <= 180 && Math.abs(c[1] as number) <= 90;

export const MINIMO_SUGERENCIAS = 3;

/**
 * Sugerencias mientras se escribe (hasta 5 lugares de Argentina y limítrofes). Nunca falla:
 * sin clave, sin cupo o con el servicio caído devuelve [] y se sigue escribiendo a mano.
 */
export async function sugerirLugares(texto: string, config: Config): Promise<Lugar[]> {
  const t = texto.trim();
  if (t.length < MINIMO_SUGERENCIAS || !config.clave) return [];
  try {
    const q = new URLSearchParams({ text: t, size: "5", "boundary.country": PAISES, layers: "locality,localadmin,county,region" });
    const r = await pedir(config.fetch ?? fetch, `${config.url}/pelias/v1/autocomplete?${q}`, {
      headers: { Authorization: config.clave, Accept: "application/json" },
    });
    if (!r.ok) return [];
    const vistos = new Set<string>();
    return aLugares(await r.json(), t).filter((l) => !vistos.has(l.nombre) && vistos.add(l.nombre)).slice(0, 5);
  } catch {
    return [];
  }
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Lugares ya usados en las tarifas de la empresa que coinciden con lo escrito (sin consultar a nadie). */
export function filtrarPropios(propios: string[], texto: string, maximo = 3): string[] {
  const t = sinTildes(texto);
  if (!t) return [];
  const unicos = new Map<string, string>();
  for (const p of propios) if (!unicos.has(sinTildes(p))) unicos.set(sinTildes(p), p.trim());
  return [...unicos.values()]
    .filter((p) => sinTildes(p).includes(t) && sinTildes(p) !== t)
    .sort((a, b) => Number(!sinTildes(b).startsWith(t)) - Number(!sinTildes(a).startsWith(t)) || a.localeCompare(b, "es"))
    .slice(0, maximo);
}

function pedir(f: typeof fetch, url: string, init: RequestInit) {
  return f(url, { ...init, signal: AbortSignal.timeout(ESPERA_MS), cache: "no-store" });
}

function revisar(r: Response) {
  if (r.status === 429) throw new ErrorServicio("Se terminó el cupo de consultas de hoy. Mañana vuelve a andar; mientras, mirá los km en Google Maps.");
  if (r.status === 401 || r.status === 403) throw new ErrorServicio("La clave de OpenRouteService no es válida. Revisala en Netlify (ORS_API_KEY).");
  if (!r.ok) throw new ErrorServicio("No se pudo calcular ahora. Probá en un rato o mirá los km en Google Maps.");
}

/** Abre Google Maps con la ruta armada, para comparar o cargar los km a mano. */
export function linkGoogleMaps(origen: string, destino: string): string {
  const q = new URLSearchParams({ api: "1", origin: origen.trim(), destination: destino.trim(), travelmode: "driving" });
  return `https://www.google.com/maps/dir/?${q}`;
}
