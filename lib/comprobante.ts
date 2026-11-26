// Reglas del comprobante de transferencia (imagen o PDF).

export const MAX_COMPROBANTE = 5 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export const TIPOS_COMPROBANTE = Object.keys(EXTENSION);

export function validarComprobante({ tipo, tamano }: { tipo: string; tamano: number }): string | null {
  if (!(tipo in EXTENSION)) return "El comprobante tiene que ser una imagen (captura o foto) o un PDF.";
  if (tamano <= 0) return "El archivo está vacío.";
  if (tamano > MAX_COMPROBANTE) {
    return "El comprobante pesa más de 5 MB. Mandá una captura en vez de una foto, o achicala.";
  }
  return null;
}

/** Cada comprobante va en la carpeta de su empresa y su pago: así lo protege la política de Storage. */
export function rutaComprobante(empresaId: string, pagoId: string, tipo: string) {
  return `${empresaId}/${pagoId}/comprobante.${EXTENSION[tipo] ?? "bin"}`;
}
