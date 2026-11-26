"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { OpcionesViaje } from "@/lib/datos-viajes";
import {
  armarCambios,
  borradorDesde,
  camposEditables,
  type CampoViaje,
  precioPideMotivo,
  puedeCambiarAutos,
  puedeCambiarPrecios,
  type ViajeOriginal,
} from "@/lib/edicion";
import { formatearPlata } from "@/lib/formato";
import { avisosDisponibilidad } from "@/lib/viajes";
import { editarViaje, type EstadoFormulario } from "../../actions";
import { type AutoUI, autoVacio, TarjetaAuto } from "../../nuevo/FormularioViaje";

const estadoInicial: EstadoFormulario = { error: null };

const campo =
  "h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200 disabled:bg-slate-100 disabled:text-slate-500";
const chip = (activo: boolean) =>
  `min-h-12 rounded-xl border px-3 py-2 text-base font-medium disabled:opacity-60 ${
    activo ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-300 bg-white text-slate-800"
  }`;

const AYUDA: Partial<Record<ViajeOriginal["estado"], string>> = {
  en_retiro: "El viaje ya está en retiro: podés cambiar el chofer, las notas y los precios.",
  en_viaje: "El viaje ya salió: podés cambiar el chofer, las notas y los precios.",
  entregado: "El viaje ya se entregó: podés cambiar las notas y los precios. Un cambio de precio pide motivo.",
  cerrado: "El viaje está cerrado: podés cambiar las notas y los precios. Un cambio de precio pide motivo.",
  cancelado: "El viaje está cancelado: solo podés cambiar las notas.",
};

export function FormularioEdicion({
  viajeId,
  numero,
  version,
  original,
  opciones,
}: {
  viajeId: string;
  numero: number;
  version: string;
  original: ViajeOriginal;
  opciones: Omit<OpcionesViaje, "tarifas">;
}) {
  const [estado, accion, enviando] = useActionState(editarViaje, estadoInicial);
  const { unidades, choferes, clientes, vehiculos } = opciones;
  const inicial = borradorDesde(original);
  const editables = camposEditables(original.estado);
  const puede = (c: CampoViaje) => editables.includes(c);
  const moneda = original.autos[0]?.moneda ?? "ARS";

  const [origen, setOrigen] = useState(inicial.origen);
  const [destino, setDestino] = useState(inicial.destino);
  const [fechaSalida, setFechaSalida] = useState(inicial.fecha_salida);
  const [fechaLlegada, setFechaLlegada] = useState(inicial.fecha_llegada);
  const [unidadId, setUnidadId] = useState(inicial.unidad_id);
  const [choferId, setChoferId] = useState(inicial.chofer_id);
  const [notas, setNotas] = useState(inicial.notas);
  const [precios, setPrecios] = useState(inicial.precios);
  const [quitar, setQuitar] = useState<string[]>([]);
  const [agregar, setAgregar] = useState<AutoUI[]>([]);
  const [motivo, setMotivo] = useState("");
  const [confirmarCero, setConfirmarCero] = useState(false);

  const unidad = unidades.find((u) => u.id === unidadId) ?? null;
  const chofer = choferes.find((c) => c.id === choferId) ?? null;
  const borrador = {
    origen,
    destino,
    fecha_salida: fechaSalida,
    fecha_llegada: fechaLlegada,
    unidad_id: unidadId,
    chofer_id: choferId,
    notas,
    precios,
    quitar,
    agregar: agregar.map(({ cliente_id, cliente_nuevo, vehiculo_id, marca, modelo, precio }) => ({
      cliente_id,
      cliente_nuevo,
      vehiculo_id,
      marca,
      modelo,
      precio,
    })),
    motivo,
  };
  const armado = armarCambios(original, {
    ...borrador,
    capacidad: unidad?.capacidad_autos ?? null,
    unidad_nombre: unidad?.nombre ?? "",
  });
  // Se mira el texto tipeado, no el resultado de armarCambios: si falta el motivo,
  // armarCambios da error y el campo para escribirlo tiene que aparecer igual.
  const cambioPrecio = Object.entries(precios).some(([id, texto]) => texto.trim() !== inicial.precios[id]);
  const pideMotivo = precioPideMotivo(original.estado);
  const cambiaAgenda = fechaSalida !== inicial.fecha_salida || fechaLlegada !== inicial.fecha_llegada || unidadId !== inicial.unidad_id || choferId !== inicial.chofer_id;
  const avisos =
    unidadId && cambiaAgenda
      ? avisosDisponibilidad(
          {
            unidad_id: unidadId,
            unidad_nombre: unidad?.nombre ?? "",
            chofer_id: choferId,
            chofer_nombre: chofer?.nombre ?? "",
            desde: fechaSalida,
            hasta: fechaLlegada || fechaSalida,
          },
          opciones.agenda.filter((v) => v.numero !== numero),
          opciones.bloqueos,
        )
      : [];
  const activos = original.autos.length - quitar.length + agregar.length;
  const lleno = unidad !== null && activos >= unidad.capacidad_autos;
  const necesitaConfirmar = armado.ok && armado.autosEnCero > 0;
  const cantidad = armado.ok ? armado.cantidad : 0;
  const puedeGuardar = armado.ok && cantidad > 0 && (!necesitaConfirmar || confirmarCero) && !enviando;

  const cambiarAuto = (key: number, cambios: Partial<AutoUI>) =>
    setAgregar((lista) => lista.map((a) => (a.key === key ? { ...a, ...cambios } : a)));

  return (
    <form action={accion} className="flex flex-col gap-6">
      <input type="hidden" name="edicion" value={JSON.stringify({ viaje_id: viajeId, version, confirmarCero, ...borrador })} />

      {AYUDA[original.estado] && (
        <p className="rounded-xl bg-sky-50 px-4 py-3 text-base text-sky-900">{AYUDA[original.estado]}</p>
      )}

      {/* Ruta y fechas */}
      <section className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Origen</span>
          <input name="origen" value={origen} disabled={!puede("origen")} onChange={(e) => setOrigen(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Destino</span>
          <input name="destino" value={destino} disabled={!puede("destino")} onChange={(e) => setDestino(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Salida</span>
          <input name="fecha_salida" type="date" value={fechaSalida} disabled={!puede("fecha_salida")} onChange={(e) => setFechaSalida(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">Llegada estimada</span>
          <input name="fecha_llegada" type="date" value={fechaLlegada} min={fechaSalida} disabled={!puede("fecha_llegada")} onChange={(e) => setFechaLlegada(e.target.value)} className={campo} />
        </label>
      </section>

      {/* Unidad y chofer */}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-slate-700">Unidad</h2>
        <div className="grid grid-cols-3 gap-2">
          {unidades.map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={!puede("unidad_id")}
              onClick={() => setUnidadId(u.id)}
              aria-pressed={unidadId === u.id}
              className={`${chip(unidadId === u.id)} text-center`}
            >
              {u.nombre}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3">
          <span className="shrink-0 text-base text-slate-700">Chofer</span>
          <select name="chofer" value={choferId ?? ""} disabled={!puede("chofer_id")} onChange={(e) => setChoferId(e.target.value || null)} className={campo}>
            <option value="">Sin asignar</option>
            {choferes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {avisos.map((aviso) => (
          <p key={aviso} role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">
            ⚠️ {aviso} Podés guardar igual.
          </p>
        ))}
      </section>

      {/* Autos */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-700">Autos</h2>
        {original.autos.map((a) => {
          const seQuita = quitar.includes(a.item_id);
          return (
            <div key={a.item_id} className={`flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ${seQuita ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold break-words">{a.nombre}</p>
                  {a.cobrado_centavos > 0 && (
                    <p className="text-sm text-slate-500">Cobrado {formatearPlata(a.cobrado_centavos, a.moneda)}</p>
                  )}
                </div>
                {puedeCambiarAutos(original.estado) &&
                  (seQuita ? (
                    <button type="button" onClick={() => setQuitar((l) => l.filter((x) => x !== a.item_id))} className="shrink-0 text-sm font-medium text-sky-700">
                      Deshacer
                    </button>
                  ) : a.cobrado_centavos === 0 ? (
                    <button type="button" onClick={() => setQuitar((l) => [...l, a.item_id])} className="shrink-0 text-sm font-medium text-red-700">
                      Quitar
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-500">Tiene pagos</span>
                  ))}
              </div>
              {seQuita ? (
                <p className="text-sm font-medium text-red-700">Se quita al guardar.</p>
              ) : (
                <label className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-base text-slate-700">Precio ({a.moneda === "ARS" ? "$" : "US$"})</span>
                  <input
                    aria-label={`Precio del ${a.nombre}`}
                    inputMode="decimal"
                    value={precios[a.item_id] ?? ""}
                    disabled={!puedeCambiarPrecios(original.estado)}
                    onChange={(e) => setPrecios((p) => ({ ...p, [a.item_id]: e.target.value }))}
                    className={`${campo} max-w-40 text-right text-lg tabular-nums`}
                  />
                </label>
              )}
            </div>
          );
        })}
        {agregar.map((a, i) => (
          <TarjetaAuto
            key={a.key}
            numero={original.autos.length + i + 1}
            auto={a}
            otros={agregar.filter((x) => x.key !== a.key)}
            clientes={clientes}
            vehiculos={vehiculos}
            moneda={moneda}
            onCambiar={(cambios) => cambiarAuto(a.key, cambios)}
            onQuitar={() => setAgregar((lista) => lista.filter((x) => x.key !== a.key))}
          />
        ))}
        {puedeCambiarAutos(original.estado) && (
          <button
            type="button"
            disabled={lleno}
            onClick={() => setAgregar((lista) => [...lista, autoVacio("")])}
            className="h-12 rounded-xl border-2 border-dashed border-slate-300 text-base font-medium text-sky-700 disabled:text-slate-400"
          >
            {lleno ? `${unidad?.nombre} está completo (${unidad?.capacidad_autos})` : "+ Agregar otro auto"}
          </button>
        )}
      </section>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-600">Notas (direcciones, contactos, horarios)</span>
        <textarea name="notas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} rows={3} className="rounded-lg border border-slate-300 px-3 py-2 text-base" />
      </label>

      {(cambioPrecio || motivo !== "") && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600">
            Motivo del cambio {pideMotivo ? "(obligatorio)" : "(opcional)"}
          </span>
          <input name="motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se sumó un peaje" className={campo} />
        </label>
      )}

      {!armado.ok && <p className="text-base text-slate-600">Revisá: {armado.error}</p>}
      {necesitaConfirmar && (
        <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-base text-amber-900">
          <input type="checkbox" checked={confirmarCero} onChange={(e) => setConfirmarCero(e.target.checked)} className="mt-1 h-5 w-5 accent-amber-700" />
          Confirmo que {armado.autosEnCero === 1 ? "hay un auto" : `hay ${armado.autosEnCero} autos`} a $ 0.
        </label>
      )}
      {estado.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-base text-red-800">
          {estado.error}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={!puedeGuardar}
          className="h-14 rounded-xl bg-sky-700 text-lg font-semibold text-white active:bg-sky-800 disabled:bg-slate-300 disabled:text-slate-600"
        >
          {enviando ? "Guardando…" : cantidad === 0 ? "Sin cambios" : `Guardar ${cantidad} ${cantidad === 1 ? "cambio" : "cambios"}`}
        </button>
        <Link href={`/viajes/${viajeId}`} className="text-center text-base font-medium text-slate-600">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
