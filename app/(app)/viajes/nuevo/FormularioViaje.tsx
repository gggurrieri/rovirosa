"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { OpcionesViaje, Vehiculo } from "@/lib/datos-viajes";
import { formatearPlata, type Moneda } from "@/lib/formato";
import { type AutoBorrador, armarViaje, avisosDisponibilidad, clientesParecidos } from "@/lib/viajes";
import { crearViaje, type EstadoFormulario } from "../actions";

type AutoUI = AutoBorrador & { key: number; busqueda: string; modoNuevo: boolean; precioEditado: boolean };

const estadoInicial: EstadoFormulario = { error: null };
const RUTAS_FRECUENTES = 4;
const sinSimbolo = (centavos: number, moneda: Moneda) => formatearPlata(centavos, moneda).replace(/^(US)?\$ /, "");
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const campo =
  "h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200";
const chip = (activo: boolean) =>
  `min-h-12 rounded-xl border px-3 py-2 text-left text-base font-medium ${
    activo ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-300 bg-white text-slate-800"
  }`;

let siguienteClave = 1;
const autoVacio = (precio: string): AutoUI => ({
  key: siguienteClave++,
  cliente_id: null,
  cliente_nuevo: null,
  vehiculo_id: null,
  marca: "",
  modelo: "",
  precio,
  busqueda: "",
  modoNuevo: false,
  precioEditado: false,
});

export function FormularioViaje({ id, hoy, opciones }: { id: string; hoy: string; opciones: OpcionesViaje }) {
  const [estado, accion, enviando] = useActionState(crearViaje, estadoInicial);
  const { tarifas, unidades, choferes, clientes, vehiculos } = opciones;

  const [tarifaId, setTarifaId] = useState<string | null>(null);
  const [otraRuta, setOtraRuta] = useState(false);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [fechaSalida, setFechaSalida] = useState(hoy);
  const [fechaLlegada, setFechaLlegada] = useState("");
  const [unidadId, setUnidadId] = useState<string | null>(null);
  const [choferId, setChoferId] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [autos, setAutos] = useState<AutoUI[]>(() => [autoVacio("")]);
  const [confirmarCero, setConfirmarCero] = useState(false);
  const [todasLasRutas, setTodasLasRutas] = useState(false);

  const tarifa = tarifas.find((t) => t.id === tarifaId) ?? null;
  const unidad = unidades.find((u) => u.id === unidadId) ?? null;
  const chofer = choferes.find((c) => c.id === choferId) ?? null;
  const precioTarifa = tarifa ? sinSimbolo(tarifa.precio_base_centavos, tarifa.moneda) : "";

  const borrador = {
    origen,
    destino,
    tarifa_id: tarifaId,
    moneda,
    fecha_salida: fechaSalida,
    fecha_llegada: fechaLlegada || null,
    unidad_id: unidadId,
    unidad_nombre: unidad?.nombre ?? "",
    capacidad: unidad?.capacidad_autos ?? null,
    chofer_id: choferId,
    notas,
    autos: autos.map(({ cliente_id, cliente_nuevo, vehiculo_id, marca, modelo, precio }) => ({
      cliente_id,
      cliente_nuevo,
      vehiculo_id,
      marca,
      modelo,
      precio,
    })),
  };
  const armado = armarViaje(borrador);
  const avisos = unidadId
    ? avisosDisponibilidad(
        {
          unidad_id: unidadId,
          unidad_nombre: unidad?.nombre ?? "",
          chofer_id: choferId,
          chofer_nombre: chofer?.nombre ?? "",
          desde: fechaSalida,
          hasta: fechaLlegada || fechaSalida,
        },
        opciones.agenda,
        opciones.bloqueos,
      )
    : [];
  const lleno = unidad !== null && autos.length >= unidad.capacidad_autos;
  const necesitaConfirmar = armado.ok && armado.autosEnCero > 0;
  const puedeGuardar = armado.ok && (!necesitaConfirmar || confirmarCero) && !enviando;

  function elegirTarifa(t: (typeof tarifas)[number]) {
    setTarifaId(t.id);
    setOtraRuta(false);
    setOrigen(t.origen);
    setDestino(t.destino);
    setMoneda(t.moneda);
    const precio = sinSimbolo(t.precio_base_centavos, t.moneda);
    setAutos((lista) => lista.map((a) => (a.precioEditado ? a : { ...a, precio })));
  }

  function elegirOtraRuta() {
    setTarifaId(null);
    setOtraRuta(true);
    setOrigen("");
    setDestino("");
    setAutos((lista) => lista.map((a) => (a.precioEditado ? a : { ...a, precio: "" })));
  }

  function elegirUnidad(nueva: string) {
    setUnidadId(nueva);
    setChoferId(unidades.find((u) => u.id === nueva)?.chofer_habitual_id ?? null);
  }

  const cambiarAuto = (key: number, cambios: Partial<AutoUI>) =>
    setAutos((lista) => lista.map((a) => (a.key === key ? { ...a, ...cambios } : a)));

  return (
    <form action={accion} className="flex flex-col gap-6">
      <input type="hidden" name="viaje" value={JSON.stringify({ id, confirmarCero, ...borrador })} />

      {/* 1. Ruta */}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-slate-700">Ruta</h2>
        <div className="grid grid-cols-1 gap-2">
          {(todasLasRutas ? tarifas : tarifas.slice(0, RUTAS_FRECUENTES)).map((t) => (
            <button key={t.id} type="button" onClick={() => elegirTarifa(t)} className={chip(tarifaId === t.id)}>
              <span className="flex items-center justify-between gap-2">
                <span>
                  {t.origen} → {t.destino}
                </span>
                <span className="shrink-0 text-sm text-slate-500 tabular-nums">{formatearPlata(t.precio_base_centavos, t.moneda)}</span>
              </span>
            </button>
          ))}
          {!todasLasRutas && tarifas.length > RUTAS_FRECUENTES && (
            <button type="button" onClick={() => setTodasLasRutas(true)} className="min-h-12 text-left text-base font-medium text-sky-700">
              Ver todas las rutas ({tarifas.length})
            </button>
          )}
          <button type="button" onClick={elegirOtraRuta} className={chip(otraRuta)}>
            Otra ruta…
          </button>
        </div>
        {otraRuta && (
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Origen" placeholder="Origen" value={origen} onChange={(e) => setOrigen(e.target.value)} className={campo} />
            <input aria-label="Destino" placeholder="Destino" value={destino} onChange={(e) => setDestino(e.target.value)} className={campo} />
            <div className="col-span-2 flex gap-2" role="radiogroup" aria-label="Moneda">
              {(["ARS", "USD"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={moneda === m} onClick={() => setMoneda(m)} className={`${chip(moneda === m)} flex-1 text-center`}>
                  {m === "ARS" ? "Pesos" : "Dólares"}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2. Fecha */}
      <label className="flex flex-col gap-2">
        <span className="text-base font-semibold text-slate-700">Fecha de salida</span>
        <input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} className={`${campo} h-14 text-lg`} />
      </label>

      {/* 3. Unidad y chofer */}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-slate-700">Unidad</h2>
        <div className="grid grid-cols-3 gap-2">
          {unidades.map((u) => (
            <button key={u.id} type="button" onClick={() => elegirUnidad(u.id)} className={`${chip(unidadId === u.id)} text-center`}>
              <span className="block">{u.nombre}</span>
              <span className="block text-xs font-normal text-slate-500">
                {u.capacidad_autos} {u.capacidad_autos === 1 ? "auto" : "autos"}
              </span>
            </button>
          ))}
        </div>
        {unidad && (
          <label className="flex items-center gap-3">
            <span className="shrink-0 text-base text-slate-700">Chofer</span>
            <select value={choferId ?? ""} onChange={(e) => setChoferId(e.target.value || null)} className={campo}>
              <option value="">Sin asignar</option>
              {choferes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.id === unidad.chofer_habitual_id ? " (habitual)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {avisos.map((aviso) => (
          <p key={aviso} role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">
            ⚠️ {aviso} Podés guardar igual.
          </p>
        ))}
      </section>

      {/* 4. Autos */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-700">Autos</h2>
        {autos.map((a, i) => (
          <TarjetaAuto
            key={a.key}
            numero={i + 1}
            auto={a}
            otros={autos.filter((x) => x.key !== a.key)}
            clientes={clientes}
            vehiculos={vehiculos}
            moneda={moneda}
            onCambiar={(cambios) => cambiarAuto(a.key, cambios)}
            onQuitar={autos.length > 1 ? () => setAutos((lista) => lista.filter((x) => x.key !== a.key)) : null}
          />
        ))}
        <button
          type="button"
          disabled={lleno}
          onClick={() => setAutos((lista) => [...lista, autoVacio(precioTarifa)])}
          className="h-12 rounded-xl border-2 border-dashed border-slate-300 text-base font-medium text-sky-700 disabled:text-slate-400"
        >
          {lleno ? `${unidad?.nombre} está completo (${unidad?.capacidad_autos})` : "+ Agregar otro auto"}
        </button>
      </section>

      {/* 5. Más datos */}
      <details className="rounded-xl bg-white p-4 shadow-sm">
        <summary className="text-base font-medium text-slate-700">Más datos (opcional)</summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">Llegada estimada</span>
            <input type="date" value={fechaLlegada} min={fechaSalida} onChange={(e) => setFechaLlegada(e.target.value)} className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">Notas (direcciones, contactos, horarios)</span>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} rows={3} className="rounded-lg border border-slate-300 px-3 py-2 text-base" />
          </label>
        </div>
      </details>

      {/* 6. Resumen y guardar */}
      {!armado.ok && <p className="text-base text-slate-600">Falta: {armado.error}</p>}
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
          {enviando
            ? "Guardando…"
            : armado.ok
              ? `Guardar viaje · ${autos.length} ${autos.length === 1 ? "auto" : "autos"} · ${formatearPlata(armado.total, moneda)}`
              : "Guardar viaje"}
        </button>
        <Link href="/viajes" className="text-center text-base font-medium text-slate-600">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function TarjetaAuto({
  numero,
  auto,
  otros,
  clientes,
  vehiculos,
  moneda,
  onCambiar,
  onQuitar,
}: {
  numero: number;
  auto: AutoUI;
  otros: AutoUI[];
  clientes: { id: string; nombre: string }[];
  vehiculos: Vehiculo[];
  moneda: Moneda;
  onCambiar: (cambios: Partial<AutoUI>) => void;
  onQuitar: (() => void) | null;
}) {
  const cliente = clientes.find((c) => c.id === auto.cliente_id) ?? null;
  const autosDelCliente = vehiculos.filter((v) => v.cliente_id === auto.cliente_id);
  const sinCliente = !auto.cliente_id && !auto.modoNuevo;

  // Atajos: clientes ya elegidos en otros autos de este viaje (incluidos los nuevos).
  const atajos = new Map<string, Partial<AutoUI>>();
  for (const o of otros) {
    if (o.cliente_id) {
      const c = clientes.find((x) => x.id === o.cliente_id);
      if (c) atajos.set(c.nombre, { cliente_id: c.id, cliente_nuevo: null, modoNuevo: false });
    } else if (o.cliente_nuevo?.nombre.trim()) {
      atajos.set(`${o.cliente_nuevo.nombre.trim()} (nuevo)`, { cliente_id: null, cliente_nuevo: { ...o.cliente_nuevo }, modoNuevo: true });
    }
  }

  const resultados =
    auto.busqueda.trim() === ""
      ? []
      : clientes.filter((c) => normalizar(c.nombre).includes(normalizar(auto.busqueda.trim()))).slice(0, 6);
  const parecidos = auto.modoNuevo && auto.cliente_nuevo ? clientesParecidos(auto.cliente_nuevo.nombre, clientes).slice(0, 3) : [];

  const elegirCliente = (id: string) =>
    onCambiar({ cliente_id: id, cliente_nuevo: null, modoNuevo: false, busqueda: "", vehiculo_id: null });

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold">Auto {numero}</p>
        {onQuitar && (
          <button type="button" onClick={onQuitar} className="text-sm font-medium text-red-700">
            Quitar
          </button>
        )}
      </div>

      {/* Cliente */}
      {cliente ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-base font-medium">{cliente.nombre}</span>
          <button type="button" onClick={() => onCambiar({ cliente_id: null, vehiculo_id: null })} className="text-sm font-medium text-sky-700">
            Cambiar
          </button>
        </div>
      ) : auto.modoNuevo ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-600">Cliente nuevo</p>
          <input
            aria-label={`Nombre del cliente nuevo (auto ${numero})`}
            placeholder="Nombre"
            value={auto.cliente_nuevo?.nombre ?? ""}
            onChange={(e) => onCambiar({ cliente_nuevo: { nombre: e.target.value, whatsapp: auto.cliente_nuevo?.whatsapp ?? "" } })}
            className={campo}
          />
          <input
            aria-label={`WhatsApp del cliente nuevo (auto ${numero})`}
            placeholder="WhatsApp (opcional)"
            inputMode="tel"
            value={auto.cliente_nuevo?.whatsapp ?? ""}
            onChange={(e) => onCambiar({ cliente_nuevo: { nombre: auto.cliente_nuevo?.nombre ?? "", whatsapp: e.target.value } })}
            className={campo}
          />
          {parecidos.map((c) => (
            <button key={c.id} type="button" onClick={() => elegirCliente(c.id)} className="rounded-lg bg-amber-50 px-3 py-2 text-left text-base text-amber-900">
              ¿Es <strong>{c.nombre}</strong>? Usar ese cliente
            </button>
          ))}
          <button type="button" onClick={() => onCambiar({ modoNuevo: false, cliente_nuevo: null })} className="self-start text-sm font-medium text-sky-700">
            Buscar un cliente existente
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {atajos.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {[...atajos].map(([nombre, cambios]) => (
                <button key={nombre} type="button" onClick={() => onCambiar({ ...cambios, busqueda: "", vehiculo_id: null })} className="rounded-full bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800">
                  {nombre}
                </button>
              ))}
            </div>
          )}
          <input
            type="search"
            aria-label={`Cliente del auto ${numero}`}
            placeholder="Buscá el cliente"
            value={auto.busqueda}
            onChange={(e) => onCambiar({ busqueda: e.target.value })}
            className={campo}
          />
          {resultados.map((c) => (
            <button key={c.id} type="button" onClick={() => elegirCliente(c.id)} className="min-h-12 rounded-lg px-3 py-2 text-left text-base active:bg-slate-50">
              {c.nombre}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onCambiar({ modoNuevo: true, cliente_nuevo: { nombre: auto.busqueda.trim(), whatsapp: "" }, busqueda: "" })}
            className="self-start rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800"
          >
            + Cliente nuevo
          </button>
        </div>
      )}

      {/* Vehículo */}
      {!sinCliente && (
        <div className="flex flex-col gap-2">
          {autosDelCliente.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {autosDelCliente.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onCambiar({ vehiculo_id: auto.vehiculo_id === v.id ? null : v.id })}
                  className={`rounded-full border px-3 py-2 text-sm font-medium ${auto.vehiculo_id === v.id ? "border-sky-700 bg-sky-50 text-sky-900" : "border-slate-300 text-slate-700"}`}
                >
                  {v.marca} {v.modelo}
                </button>
              ))}
            </div>
          )}
          {!auto.vehiculo_id && (
            <div className="grid grid-cols-2 gap-2">
              <input aria-label={`Marca del auto ${numero}`} placeholder="Marca" value={auto.marca} onChange={(e) => onCambiar({ marca: e.target.value })} className={campo} />
              <input aria-label={`Modelo del auto ${numero}`} placeholder="Modelo" value={auto.modelo} onChange={(e) => onCambiar({ modelo: e.target.value })} className={campo} />
            </div>
          )}
        </div>
      )}

      {/* Precio */}
      <label className="flex items-center justify-between gap-3">
        <span className="text-base text-slate-700">Precio ({moneda === "ARS" ? "$" : "US$"})</span>
        <input
          aria-label={`Precio del auto ${numero}`}
          inputMode="decimal"
          placeholder="0"
          value={auto.precio}
          onChange={(e) => onCambiar({ precio: e.target.value, precioEditado: true })}
          className={`${campo} w-40 text-right text-lg tabular-nums`}
        />
      </label>
    </div>
  );
}
