"use client";

import { useEffect, useRef, useState } from "react";
import { TIPOS_COMPROBANTE, validarComprobante } from "@/lib/comprobante";

const LADO_MAXIMO = 1600;

/** Achica una imagen a ~1600 px en el dispositivo, para que suba rápido con mala señal. */
async function achicar(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    if (escala === 1 && archivo.size < 800_000) return archivo;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext("2d")?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
    return blob ? new File([blob], "comprobante.jpg", { type: "image/jpeg" }) : archivo;
  } catch {
    return archivo; // si el navegador no puede leerla (p. ej. HEIC en Chrome), se sube como está
  }
}

/**
 * Zona para el comprobante: elegir archivo (en el iPhone abre Fototeca / Archivos),
 * pegar con Ctrl+V o arrastrar. El archivo final queda en el <input name="comprobante">
 * para que viaje con el formulario.
 */
export function ZonaComprobante() {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  async function recibir(original: File | undefined | null) {
    if (!original) return;
    const listo = await achicar(original);
    const problema = validarComprobante({ tipo: listo.type, tamano: listo.size });
    if (problema) {
      setError(problema);
      quitar(); // que no viaje con el formulario un archivo rechazado
      return;
    }
    const transferencia = new DataTransfer();
    transferencia.items.add(listo);
    if (entrada.current) entrada.current.files = transferencia.files;
    setError(null);
    setArchivo(listo);
    setVista((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return listo.type.startsWith("image/") ? URL.createObjectURL(listo) : null;
    });
  }

  function quitar() {
    if (entrada.current) entrada.current.value = "";
    if (vista) URL.revokeObjectURL(vista);
    setArchivo(null);
    setVista(null);
  }

  // Pegar (Ctrl+V) en cualquier parte de la pantalla: lo que no es imagen se ignora.
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      const imagen = [...(e.clipboardData?.files ?? [])].find((f) => TIPOS_COMPROBANTE.includes(f.type));
      if (imagen) {
        e.preventDefault();
        void recibir(imagen);
      }
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-slate-700">Comprobante (opcional)</h2>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void recibir(e.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-4 text-center lg:min-h-64 lg:justify-center ${
          arrastrando ? "border-sky-600 bg-sky-50" : "border-slate-300 bg-white"
        }`}
      >
        {archivo ? (
          <>
            {vista ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), no pasa por el optimizador
              <img src={vista} alt="Vista previa del comprobante" className="max-h-64 rounded-lg object-contain lg:max-h-[60vh]" />
            ) : (
              <p className="text-base font-medium">📄 {archivo.name}</p>
            )}
            <button type="button" onClick={quitar} className="text-sm font-medium text-red-700">
              Quitar comprobante
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">Pegá la captura (Ctrl+V), arrastrala acá o</p>
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              className="h-12 rounded-xl bg-slate-100 px-5 text-base font-medium text-slate-800 active:bg-slate-200"
            >
              📎 Adjuntar comprobante
            </button>
          </>
        )}
        <input
          ref={entrada}
          type="file"
          name="comprobante"
          accept="image/*,application/pdf"
          aria-label="Archivo del comprobante"
          className="sr-only"
          onChange={(e) => void recibir(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p role="alert" className="text-base text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
