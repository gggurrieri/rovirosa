// Qué instrucciones mostrar en "Instalá la app".
export type Plataforma = "instalada" | "iphone" | "android" | "otro";

export function plataformaInstalacion(userAgent: string, instalada: boolean): Plataforma {
  if (instalada) return "instalada";
  // iPadOS se presenta como Mac: se reconoce por "Macintosh" + pantalla táctil, que acá no se ve; alcanza con iPhone/iPad.
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iphone";
  if (/Android/i.test(userAgent)) return "android";
  return "otro";
}
