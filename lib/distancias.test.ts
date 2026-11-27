import { describe, expect, it, vi } from "vitest";
import { calcularDistancia, filtrarPropios, linkGoogleMaps, sugerirLugares } from "./distancias";

const lugar = (label: string, lon: number, lat: number) => ({ features: [{ geometry: { coordinates: [lon, lat] }, properties: { label } }] });
const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

function servidor(respuestas: Record<string, Response | (() => Response)>) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const clave = u.pathname.startsWith("/pelias") ? `geo:${u.searchParams.get("text")}` : `ruta:${init?.body}`;
    const r = respuestas[clave] ?? respuestas[u.pathname.startsWith("/pelias") ? "geo:*" : "ruta:*"];
    if (!r) throw new Error(`sin respuesta para ${clave}`);
    return typeof r === "function" ? r() : r;
  });
}

const config = { clave: "k", url: "https://ors.test" };

describe("calcularDistancia", () => {
  it("busca los dos lugares, pide la ruta en camión y redondea los km", async () => {
    const f = servidor({
      "geo:Buenos Aires": json(200, lugar("Buenos Aires, CABA, Argentina", -58.38, -34.6)),
      "geo:Bariloche": json(200, lugar("San Carlos de Bariloche, RN, Argentina", -71.31, -41.13)),
      "ruta:*": json(200, { routes: [{ summary: { distance: 1579612.4 } }] }),
    });
    const r = await calcularDistancia("Buenos Aires", "Bariloche", { ...config, fetch: f });
    expect(r).toEqual({ ok: true, km: 1580, origen: "Buenos Aires, CABA, Argentina", destino: "San Carlos de Bariloche, RN, Argentina" });
    const [urlRuta, initRuta] = f.mock.calls[2];
    expect(String(urlRuta)).toBe("https://ors.test/openrouteservice/v2/directions/driving-hgv");
    expect(JSON.parse(String(initRuta?.body))).toMatchObject({ coordinates: [[-58.38, -34.6], [-71.31, -41.13]], radiuses: [-1, -1] });
    expect((initRuta?.headers as Record<string, string>).Authorization).toBe("k");
    const geo = new URL(String(f.mock.calls[0][0]));
    expect(geo.pathname).toBe("/pelias/v1/search");
    expect(geo.searchParams.get("boundary.country")).toBe("AR,CL,UY,PY,BO,BR");
    // Nunca provincias ni partidos enteros: su centro puede quedar lejos de la ciudad y de una ruta
    expect(geo.searchParams.get("layers")).not.toMatch(/region|county/);
  });

  it("avisa qué lugar no encontró", async () => {
    const f = servidor({ "geo:Buenos Aires": json(200, lugar("Buenos Aires", -58, -34)), "geo:Xyzzy": json(200, { features: [] }) });
    expect(await calcularDistancia("Buenos Aires", "Xyzzy", { ...config, fetch: f })).toEqual({
      ok: false, error: 'No encontré "Xyzzy". Probá con ciudad y provincia, por ejemplo "Bariloche, Río Negro".',
    });
  });

  it("sin camino por ruta, cupo agotado o servicio caído: mensajes claros", async () => {
    const geo = { "geo:*": () => json(200, lugar("X", -58, -34)) };
    const sinRuta = await calcularDistancia("A", "B", { ...config, fetch: servidor({ ...geo, "ruta:*": json(404, { error: { code: 2009 } }) }) });
    expect(sinRuta).toEqual({ ok: false, error: "No encontré un camino por ruta entre esos lugares." });
    const cupo = await calcularDistancia("A", "B", { ...config, fetch: servidor({ "geo:*": json(429, {}) }) });
    expect(cupo.ok === false && cupo.error).toMatch(/cupo de consultas de hoy/);
    const caido = await calcularDistancia("A", "B", { ...config, fetch: vi.fn(async () => { throw new Error("ECONNREFUSED"); }) });
    expect(caido.ok === false && caido.error).toMatch(/No se pudo calcular ahora/);
  });

  it("valida antes de consultar", async () => {
    const f = vi.fn();
    expect(await calcularDistancia(" ", "B", { ...config, fetch: f })).toEqual({ ok: false, error: "Completá origen y destino." });
    expect(await calcularDistancia("A", "B", { ...config, clave: "", fetch: f })).toEqual({ ok: false, error: "El cálculo automático no está configurado." });
    expect(f).not.toHaveBeenCalled();
  });
});

it("linkGoogleMaps arma la ruta en Google Maps", () => {
  const u = new URL(linkGoogleMaps("Buenos Aires", "Bariloche, Río Negro"));
  expect(u.origin + u.pathname).toBe("https://www.google.com/maps/dir/");
  expect(u.searchParams.get("api")).toBe("1");
  expect(u.searchParams.get("origin")).toBe("Buenos Aires");
  expect(u.searchParams.get("destination")).toBe("Bariloche, Río Negro");
  expect(u.searchParams.get("travelmode")).toBe("driving");
});

describe("Calcular km con lugares elegidos de las sugerencias", () => {
  it("no vuelve a buscar los lugares que ya tienen ubicación", async () => {
    const f = servidor({ "ruta:*": json(200, { routes: [{ summary: { distance: 400000 } }] }) });
    const r = await calcularDistancia("Rosario, Santa Fe", "Córdoba, Córdoba", { ...config, fetch: f }, { origen: [-60.64, -32.95], destino: [-64.18, -31.42] });
    expect(r).toEqual({ ok: true, km: 400, origen: "Rosario, Santa Fe", destino: "Córdoba, Córdoba" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("ignora ubicaciones inválidas y busca el lugar", async () => {
    const f = servidor({ "geo:*": () => json(200, lugar("Rosario, SF, Argentina", -60.6, -32.9)), "ruta:*": json(200, { routes: [{ summary: { distance: 1000 } }] }) });
    await calcularDistancia("Rosario", "Rosario", { ...config, fetch: f }, { origen: [999, 0] as [number, number] });
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe("sugerirLugares", () => {
  it("devuelve hasta 5 lugares sin repetir", async () => {
    const f = vi.fn(async (url: RequestInfo | URL) => {
      expect(new URL(String(url)).pathname).toBe("/pelias/v1/autocomplete");
      expect(new URL(String(url)).searchParams.get("layers")).toBe("locality,localadmin");
      return json(200, { features: [lugar("San Carlos de Bariloche, RN, Argentina", -71.3, -41.1), lugar("San Carlos de Bariloche, RN, Argentina", -71.3, -41.1), lugar("Barilari, BA, Argentina", -60, -35)].map((x) => x.features[0]) });
    });
    expect(await sugerirLugares("Bari", { ...config, fetch: f })).toEqual([
      { nombre: "San Carlos de Bariloche, RN, Argentina", coordenadas: [-71.3, -41.1] },
      { nombre: "Barilari, BA, Argentina", coordenadas: [-60, -35] },
    ]);
  });
  it("con menos de 3 letras, sin clave, sin cupo o caído: lista vacía, sin romper", async () => {
    const f = vi.fn(async () => json(429, {}));
    expect(await sugerirLugares("Ba", { ...config, fetch: f })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    expect(await sugerirLugares("Bari", { ...config, clave: "", fetch: f })).toEqual([]);
    expect(await sugerirLugares("Bari", { ...config, fetch: f })).toEqual([]);
    expect(await sugerirLugares("Bari", { ...config, fetch: vi.fn(async () => { throw new Error("x"); }) })).toEqual([]);
  });
});

describe("filtrarPropios", () => {
  const propios = ["Buenos Aires", "buenos aires ", "Córdoba", "Bariloche", "Mar del Plata", "Rosario"];
  it("sin tildes ni mayúsculas, primero los que empiezan igual, sin repetir", () => {
    expect(filtrarPropios(propios, "cor")).toEqual(["Córdoba"]);
    expect(filtrarPropios(propios, "ar")).toEqual(["Bariloche", "Mar del Plata", "Rosario"]);
    expect(filtrarPropios(propios, "bue")).toEqual(["Buenos Aires"]);
  });
  it("no sugiere lo que ya está escrito completo", () => {
    expect(filtrarPropios(propios, "Rosario")).toEqual([]);
    expect(filtrarPropios(propios, "  ")).toEqual([]);
  });
});
