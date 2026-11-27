// Km por ruta entre dos lugares, con OpenRouteService de HeiGIT (datos de OpenStreetMap): plan gratis
// con clave propia, 2.000 rutas por día. Se usa SOLO desde el servidor (la clave no viaja al
// celular) y solo con nombres de lugares: ningún dato de clientes.
// Perfil "camión" (driving-hgv): es lo que hacen los mosquitos.

export type ResultadoDistancia =
  | { ok: true; km: number; origen: string; destino: string }
  | { ok: false; error: string };

type Config = { clave: string; url: string; fetch?: typeof fetch };

const PAISES = "AR,CL,UY,PY,BO,BR"; // Argentina y limítrofes
const ESPERA_MS = 8000;

class ErrorServicio extends Error {}

export async function calcularDistancia(origen: string, destino: string, config: Config): Promise<ResultadoDistancia> {
  const o = origen.trim();
  const d = destino.trim();
  if (!o || !d) return { ok: false, error: "Completá origen y destino." };
  if (!config.clave) return { ok: false, error: "El cálculo automático no está configurado." };
  const f = config.fetch ?? fetch;

  try {
    const [desde, hasta] = await Promise.all([buscarLugar(o, config, f), buscarLugar(d, config, f)]);
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

async function buscarLugar(texto: string, config: Config, f: typeof fetch) {
  const q = new URLSearchParams({ text: texto, size: "1", "boundary.country": PAISES, layers: "locality,localadmin,county,region,venue,address" });
  const r = await pedir(f, `${config.url}/pelias/v1/search?${q}`, { headers: { Authorization: config.clave, Accept: "application/json" } });
  revisar(r);
  const lugar = (await r.json())?.features?.[0];
  const coordenadas = lugar?.geometry?.coordinates;
  if (!Array.isArray(coordenadas) || coordenadas.length < 2) return null;
  return { nombre: String(lugar.properties?.label ?? texto), coordenadas: [Number(coordenadas[0]), Number(coordenadas[1])] };
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
