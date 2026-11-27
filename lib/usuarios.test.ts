import { describe, expect, it } from "vitest";
import { estadoInvitacion, linkWhatsApp, mensajeInvitacion, textoVence } from "./usuarios";

const ahora = new Date("2026-11-26T12:00:00Z");
const base = { vence_en: "2026-12-03T12:00:00Z", aceptada_en: null, anulada_en: null };

describe("estadoInvitacion", () => {
  it("pendiente, vencida, aceptada o anulada", () => {
    expect(estadoInvitacion(base, ahora)).toBe("pendiente");
    expect(estadoInvitacion({ ...base, vence_en: "2026-11-26T11:59:00Z" }, ahora)).toBe("vencida");
    expect(estadoInvitacion({ ...base, aceptada_en: "2026-11-27T00:00:00Z" }, ahora)).toBe("aceptada");
    expect(estadoInvitacion({ ...base, anulada_en: "2026-11-27T00:00:00Z" }, ahora)).toBe("anulada");
  });
});

describe("textoVence", () => {
  it("en días, o 'hoy' en las últimas 24 horas", () => {
    expect(textoVence(base.vence_en, ahora)).toBe("Vence en 7 días");
    expect(textoVence("2026-11-27T18:00:00Z", ahora)).toBe("Vence en 1 día");
    expect(textoVence("2026-11-26T20:00:00Z", ahora)).toBe("Vence hoy");
  });
});

describe("invitación por WhatsApp", () => {
  it("arma el mensaje con el email y el link de registro", () => {
    const texto = mensajeInvitacion({ nombre: "Laura", email: "laura@demo.com", empresa: "Rovirosa", url: "https://rovirosa-demo.netlify.app/registro" });
    expect(texto).toBe(
      "Hola Laura, te invité a usar Tracker, el sistema de Rovirosa. Creá tu usuario con el email laura@demo.com en https://rovirosa-demo.netlify.app/registro (la invitación vence en 7 días).",
    );
  });

  it("el link de WhatsApp codifica el texto (sin número: elegís el contacto)", () => {
    expect(linkWhatsApp("Hola & chau")).toBe("https://wa.me/?text=Hola%20%26%20chau");
  });
});
