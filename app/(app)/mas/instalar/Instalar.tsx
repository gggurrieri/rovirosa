"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { type Plataforma, plataformaInstalacion } from "@/lib/instalar";

const nada = () => () => {};

export function Instalar() {
  // En el servidor no se sabe qué celular es: "otro" hasta que carga en el navegador.
  const plataforma = useSyncExternalStore<Plataforma>(nada, () => plataformaInstalacion(navigator.userAgent, estaInstalada()), () => "otro");
  const [disponible, setDisponible] = useState(false);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    const actualizar = () => setDisponible(Boolean(window.eventoInstalar));
    actualizar();
    window.addEventListener("tracker:instalable", actualizar);
    const lista = () => setInstalada(true);
    window.addEventListener("appinstalled", lista);
    return () => {
      window.removeEventListener("tracker:instalable", actualizar);
      window.removeEventListener("appinstalled", lista);
    };
  }, []);

  async function instalar() {
    const e = window.eventoInstalar;
    if (!e) return;
    await e.prompt();
    window.eventoInstalar = undefined;
    setDisponible(false);
  }

  if (plataforma === "instalada" || instalada) {
    return <Caja>✅ Ya la tenés instalada. Abrila desde el ícono de Tracker.</Caja>;
  }
  if (disponible) {
    return (
      <Caja>
        <button
          type="button"
          onClick={instalar}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 lg:w-auto lg:px-8"
        >
          📲 Instalar Tracker
        </button>
      </Caja>
    );
  }
  if (plataforma === "iphone") {
    return (
      <Caja>
        <ol className="flex list-decimal flex-col gap-3 pl-6 text-lg">
          <li>
            Abrí esta página en <b>Safari</b>.
          </li>
          <li>
            Tocá el botón <b>Compartir</b> <IconoCompartir /> (abajo en el medio).
          </li>
          <li>
            Bajá y tocá <b>Agregar a inicio</b>.
          </li>
          <li>
            Tocá <b>Agregar</b> arriba a la derecha.
          </li>
        </ol>
      </Caja>
    );
  }
  return (
    <Caja>
      <ol className="flex list-decimal flex-col gap-3 pl-6 text-lg">
        <li>
          Abrí esta página en <b>Chrome</b>.
        </li>
        <li>
          Tocá el menú <b>⋮</b> (arriba a la derecha).
        </li>
        <li>
          Tocá <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.
        </li>
      </ol>
    </Caja>
  );
}

function Caja({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl bg-white p-5 text-base shadow-sm">{children}</section>;
}

function IconoCompartir() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-6 w-6 align-text-bottom text-sky-700" fill="none" stroke="currentColor" strokeWidth="2" role="img" aria-label="(cuadrado con flecha hacia arriba)">
      <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function estaInstalada() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
