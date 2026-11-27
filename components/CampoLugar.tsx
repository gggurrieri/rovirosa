"use client";

import { useEffect, useId, useRef, useState } from "react";
import { type Coordenadas, filtrarPropios, type Lugar, MINIMO_SUGERENCIAS } from "@/lib/distancias";
import { sugerir } from "@/app/(app)/acciones-lugares";

type Opcion = { nombre: string; coordenadas: Coordenadas | null; propio: boolean };

const ESPERA_TIPEO_MS = 500; // consulta recién cuando se deja de escribir medio segundo
const memoria = new Map<string, Lugar[]>(); // lo ya buscado en esta pestaña no se vuelve a pedir

/**
 * Origen o Destino con sugerencias mientras se escribe: primero los lugares ya usados en otras
 * tarifas (al instante), después los de OpenRouteService. Elegir uno guarda su ubicación, así
 * "Calcular km" no lo vuelve a buscar. Escribir a mano sigue funcionando igual.
 */
export function CampoLugar({
  nombre,
  etiqueta,
  mostrarEtiqueta = true,
  valor,
  propios,
  conServicio,
  deshabilitado = false,
  clase,
  onEscribir,
  onElegir,
}: {
  nombre?: string;
  etiqueta: string;
  /** false: sin título arriba (la etiqueta queda como placeholder y para lectores de pantalla). */
  mostrarEtiqueta?: boolean;
  valor: string;
  propios: string[];
  conServicio: boolean;
  deshabilitado?: boolean;
  /** Clases del input (cada formulario tiene su estilo). */
  clase: string;
  onEscribir: (texto: string) => void;
  onElegir: (texto: string, coordenadas: Coordenadas | null) => void;
}) {
  const id = useId();
  // Las sugerencias se guardan por texto buscado: si el texto cambió, no se muestran las viejas.
  const [respuesta, setRespuesta] = useState<{ clave: string; lugares: Lugar[] }>({ clave: "", lugares: [] });
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const escrito = useRef(false); // solo se busca cuando la persona escribe (no al cargar ni al elegir)

  const texto = valor.trim();
  const clave = texto.toLowerCase();
  const buscar = conServicio && texto.length >= MINIMO_SUGERENCIAS;
  const remotos = !buscar ? [] : (memoria.get(clave) ?? (respuesta.clave === clave ? respuesta.lugares : []));

  useEffect(() => {
    if (!escrito.current || !buscar || memoria.has(clave)) return;
    let vigente = true;
    const espera = setTimeout(async () => {
      const lugares = await sugerir(texto).catch(() => []);
      memoria.set(clave, lugares);
      if (vigente) setRespuesta({ clave, lugares }); // descarta respuestas de textos viejos
    }, ESPERA_TIPEO_MS);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto, clave, buscar]);

  const opciones: Opcion[] = [
    ...filtrarPropios(propios, valor).map((nombre) => ({ nombre, coordenadas: null, propio: true })),
    ...remotos.filter((r) => r.nombre !== valor.trim()).map((r) => ({ ...r, propio: false })),
  ].slice(0, 7);
  const visible = abierto && opciones.length > 0;

  function elegir(o: Opcion) {
    escrito.current = false;
    onElegir(o.nombre, o.coordenadas);
    setAbierto(false);
    setActivo(-1);
  }

  return (
    <label className="relative flex flex-col gap-1">
      {mostrarEtiqueta && <span className="text-sm text-slate-600">{etiqueta}</span>}
      <input
        name={nombre}
        aria-label={mostrarEtiqueta ? undefined : etiqueta}
        placeholder={mostrarEtiqueta ? undefined : etiqueta}
        disabled={deshabilitado}
        required
        maxLength={80}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={visible && activo >= 0 ? `${id}-${activo}` : undefined}
        value={valor}
        onChange={(e) => {
          escrito.current = true;
          onEscribir(e.target.value);
          setAbierto(true);
          setActivo(-1);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAbierto(false);
          if (!visible) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const paso = e.key === "ArrowDown" ? 1 : -1;
            setActivo((a) => (a + paso + opciones.length) % opciones.length);
          } else if (e.key === "Enter" && activo >= 0) {
            e.preventDefault(); // elegir, no guardar el formulario
            elegir(opciones[activo]);
          }
        }}
        className={clase}
      />
      {visible && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          aria-label={`Sugerencias para ${etiqueta}`}
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {opciones.map((o, i) => (
            <li
              key={`${o.propio}-${o.nombre}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === activo}
              // mousedown (no click): elige antes de que el campo pierda el foco y cierre la lista
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(o);
              }}
              className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5 text-base ${i === activo ? "bg-sky-50" : "active:bg-slate-50"}`}
            >
              <span className="break-words">{o.nombre}</span>
              {o.propio && <span className="text-xs text-slate-500">Ya usado en tus tarifas</span>}
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
