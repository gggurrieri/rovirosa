import { describe, expect, it } from "vitest";
import { MAX_COMPROBANTE, rutaComprobante, validarComprobante } from "./comprobante";

describe("validarComprobante", () => {
  it.each(["image/png", "image/jpeg", "image/webp", "image/heic", "application/pdf"])("acepta %s", (tipo) => {
    expect(validarComprobante({ tipo, tamano: 300_000 })).toBeNull();
  });

  it("acepta justo 5 MB y rechaza más", () => {
    expect(validarComprobante({ tipo: "image/png", tamano: MAX_COMPROBANTE })).toBeNull();
    expect(validarComprobante({ tipo: "image/png", tamano: MAX_COMPROBANTE + 1 })).toBe(
      "El comprobante pesa más de 5 MB. Mandá una captura en vez de una foto, o achicala.",
    );
  });

  it("rechaza archivos vacíos y tipos no permitidos", () => {
    expect(validarComprobante({ tipo: "image/png", tamano: 0 })).toBe("El archivo está vacío.");
    expect(validarComprobante({ tipo: "application/zip", tamano: 10 })).toBe(
      "El comprobante tiene que ser una imagen (captura o foto) o un PDF.",
    );
    expect(validarComprobante({ tipo: "", tamano: 10 })).toBe(
      "El comprobante tiene que ser una imagen (captura o foto) o un PDF.",
    );
  });
});

describe("rutaComprobante", () => {
  it("guarda cada comprobante en la carpeta de su empresa y su pago", () => {
    expect(rutaComprobante("emp", "pago", "image/jpeg")).toBe("emp/pago/comprobante.jpg");
    expect(rutaComprobante("emp", "pago", "application/pdf")).toBe("emp/pago/comprobante.pdf");
  });
});
