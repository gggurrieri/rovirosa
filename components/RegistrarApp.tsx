"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    eventoInstalar?: Event & { prompt: () => Promise<void> };
  }
}

/** Registra el service worker (página "Sin conexión") y guarda el aviso de "Instalar app" de Android. */
export function RegistrarApp() {
  useEffect(() => {
    const guardar = (e: Event) => {
      e.preventDefault(); // lo mostramos nosotros, desde Más → Instalá la app
      window.eventoInstalar = e as Window["eventoInstalar"];
      window.dispatchEvent(new Event("tracker:instalable"));
    };
    window.addEventListener("beforeinstallprompt", guardar);
    // Solo con https (o en la compu de desarrollo): es lo que exige el navegador.
    const seguro = location.protocol === "https:" || location.hostname === "localhost";
    if ("serviceWorker" in navigator && seguro) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => window.removeEventListener("beforeinstallprompt", guardar);
  }, []);
  return null;
}
