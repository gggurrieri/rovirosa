import { describe, expect, it, vi } from "vitest";
import { calcularDistancia, linkGoogleMaps } from "./distancias";

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
    expect(JSON.parse(String(initRuta?.body)).coordinates).toEqual([[-58.38, -34.6], [-71.31, -41.13]]);
    expect((initRuta?.headers as Record<string, string>).Authorization).toBe("k");
    const geo = new URL(String(f.mock.calls[0][0]));
    expect(geo.pathname).toBe("/pelias/v1/search");
    expect(geo.searchParams.get("boundary.country")).toBe("AR,CL,UY,PY,BO,BR");
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
