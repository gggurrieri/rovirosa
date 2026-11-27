import { describe, expect, it } from "vitest";
import { plataformaInstalacion } from "./instalar";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A146M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("plataformaInstalacion", () => {
  it("si ya está instalada no muestra instrucciones", () => expect(plataformaInstalacion(IPHONE, true)).toBe("instalada"));
  it("reconoce iPhone, Android y computadora", () => {
    expect(plataformaInstalacion(IPHONE, false)).toBe("iphone");
    expect(plataformaInstalacion(ANDROID, false)).toBe("android");
    expect(plataformaInstalacion(PC, false)).toBe("otro");
  });
});
