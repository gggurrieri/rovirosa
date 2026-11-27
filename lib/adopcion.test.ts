import { describe, expect, it } from "vitest";
import { resumirUso, textoUso } from "./adopcion";

const hoy = "2026-11-27";
const filas = [
  ...["2026-11-27", "2026-11-26", "2026-11-24", "2026-11-21", "2026-11-10"].map((dia) => ({ user_id: "rodrigo", dia })),
  { user_id: "admin", dia: "2026-10-01" },
];

describe("resumirUso", () => {
  it("cuenta días distintos en los últimos 7 y 30 días (hoy incluido) y el último ingreso", () => {
    const r = resumirUso(filas, hoy);
    expect(r.rodrigo).toEqual({ dias7: 4, dias30: 5, ultimo: "2026-11-27" });
    expect(r.admin).toEqual({ dias7: 0, dias30: 0, ultimo: "2026-10-01" });
    expect(r.nadie).toBeUndefined();
  });
  it("el día de hace 7 días ya no entra en la semana", () => {
    expect(resumirUso([{ user_id: "x", dia: "2026-11-20" }, { user_id: "x", dia: "2026-11-21" }], hoy).x.dias7).toBe(1);
  });
});

describe("textoUso", () => {
  it("en palabras", () => {
    expect(textoUso({ dias7: 4, dias30: 5, ultimo: "2026-11-27" }, hoy)).toBe("Usó la app 4 de los últimos 7 días · último ingreso hoy");
    expect(textoUso({ dias7: 1, dias30: 1, ultimo: "2026-11-26" }, hoy)).toBe("Usó la app 1 de los últimos 7 días · último ingreso ayer");
    expect(textoUso({ dias7: 0, dias30: 0, ultimo: "2026-10-01" }, hoy)).toBe("No usó la app en la última semana · último ingreso 01/10/2026");
    expect(textoUso(undefined, hoy)).toBe("Todavía no usó la app");
  });
});
