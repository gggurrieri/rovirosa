"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { armarAplicaciones, ordenarPorAntiguedad, parsearPlata, validarAplicaciones } from "@/lib/cobros";
import type { ItemPendienteDetalle } from "@/lib/datos-cobros";
import { formatearFecha, formatearPlata, type Moneda } from "@/lib/formato";
import { type EstadoFormulario, registrarPago } from "../actions";

type ClienteOpcion = { id: string; nombre: string; deuda: number };

const MEDIOS = [
  { valor: "transferencia", texto: "Transferencia" },
  { valor: "efectivo", texto: "Efectivo" },
  { valor: "cheque", texto: "Cheque" },
  { valor: "otro", texto: "Otro" },
] as const;

const estadoInicial: EstadoFormulario = { error: null };

/** 140000000 → "1.400.000" (para precargar un campo editable). */
const sinSimbolo = (centavos: number, moneda: Moneda) => formatearPlata(centavos, moneda).replace(/^(US)?\$ /, "");

const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function FormularioPago({
  id,
  hoy,
  clientes,
  pendientes,
  clienteInicial,
}: {
  id: string;
  hoy: string;
  clientes: ClienteOpcion[];
  pendientes: ItemPendienteDetalle[];
  clienteInicial: string | null;
}) {
  const [estado, accion, enviando] = useActionState(registrarPago, estadoInicial);
  const [clienteId, setClienteId] = useState<string | null>(clienteInicial);
  const [busqueda, setBusqueda] = useState("");
  const [montoTexto, setMontoTexto] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [manualesTexto, setManualesTexto] = useState<Record<string, string>>({});

  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const items = useMemo(
    () => ordenarPorAntiguedad(pendientes.filter((i) => i.cliente_id === clienteId && i.moneda === moneda)),
    [pendientes, clienteId, moneda],
  );
  const deuda = items.reduce((suma, i) => suma + i.saldo_centavos, 0);

  const monto = montoTexto.trim() === "" ? null : parsearPlata(montoTexto);
  const centavos = monto?.ok ? monto.centavos : 0;

  const manuales: Record<string, number> = {};
  let errorManual: string | null = null;
  for (const [itemId, texto] of Object.entries(manualesTexto)) {
    const valor = texto.trim() === "" ? { ok: true as const, centavos: 0 } : parsearPlata(texto);
    if (valor.ok) manuales[itemId] = valor.centavos;
    else errorManual = valor.error;
  }

  const sugerencia = armarAplicaciones(items, centavos, moneda, { excluidos, manuales });
  const aplicadoPorItem = new Map(sugerencia.aplicaciones.map((a) => [a.item_id, a.monto_centavos]));
  const errorAplicacion = errorManual ?? (centavos > 0 ? validarAplicaciones(items, centavos, moneda, sugerencia.aplicaciones) : null);
  const puedeGuardar = cliente !== null && monto?.ok === true && errorAplicacion === null && !enviando;

  function elegirCliente(nuevo: string | null) {
    setClienteId(nuevo);
    setBusqueda("");
    setExcluidos([]);
    setManualesTexto({});
  }

  function cambiarMoneda(nueva: Moneda) {
    setMoneda(nueva);
    setExcluidos([]);
    setManualesTexto({});
  }

  function alternarItem(itemId: string) {
    setExcluidos((actual) => (actual.includes(itemId) ? actual.filter((x) => x !== itemId) : [...actual, itemId]));
    setManualesTexto((actual) => {
      const resto = { ...actual };
      delete resto[itemId];
      return resto;
    });
  }

  const opciones = clientes
    .filter((c) => busqueda.trim() === "" || normalizar(c.nombre).includes(normalizar(busqueda)))
    .slice(0, 8);

  return (
    <form action={accion} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="cliente_id" value={clienteId ?? ""} />
      <input type="hidden" name="moneda" value={moneda} />
      <input type="hidden" name="aplicaciones" value={JSON.stringify(sugerencia.aplicaciones)} />

      {/* 1. Cliente */}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-slate-700">¿Quién pagó?</h2>
        {cliente ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
            <p className="text-lg font-semibold">{cliente.nombre}</p>
            <button type="button" onClick={() => elegirCliente(null)} className="text-base font-medium text-sky-700">
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscá por nombre"
              aria-label="Buscar cliente"
              className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-lg outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200"
            />
            <ul className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm">
              {opciones.map((c) => (
                <li key={c.id} className="border-b border-slate-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => elegirCliente(c.id)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50"
                  >
                    <span className="text-base font-medium">{c.nombre}</span>
                    {c.deuda > 0 && (
                      <span className="shrink-0 text-sm text-red-700 tabular-nums">debe {formatearPlata(c.deuda)}</span>
                    )}
                  </button>
                </li>
              ))}
              {opciones.length === 0 && <li className="px-4 py-3 text-base text-slate-500">No hay clientes con ese nombre.</li>}
            </ul>
          </>
        )}
      </section>

      {/* 2. Monto */}
      <section className="flex flex-col gap-2">
        <label htmlFor="monto" className="text-base font-semibold text-slate-700">
          ¿Cuánto pagó?
        </label>
        <div className="flex gap-2">
          <input
            id="monto"
            name="monto"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={montoTexto}
            onChange={(e) => {
              setMontoTexto(e.target.value);
              setManualesTexto({});
            }}
            className="h-14 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-2xl font-semibold tabular-nums outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200"
          />
          <div className="flex shrink-0 overflow-hidden rounded-xl border border-slate-300 bg-white" role="radiogroup" aria-label="Moneda">
            {(["ARS", "USD"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={moneda === m}
                onClick={() => cambiarMoneda(m)}
                className={`w-14 text-base font-semibold ${moneda === m ? "bg-sky-700 text-white" : "text-slate-600"}`}
              >
                {m === "ARS" ? "$" : "US$"}
              </button>
            ))}
          </div>
        </div>
        {monto && !monto.ok && <p className="text-base text-red-700">{monto.error}</p>}
        {cliente && deuda > 0 && (
          <button
            type="button"
            onClick={() => {
              setMontoTexto(sinSimbolo(deuda, moneda));
              setExcluidos([]);
              setManualesTexto({});
            }}
            className="self-start rounded-full bg-sky-50 px-4 py-2 text-base font-medium text-sky-800 active:bg-sky-100"
          >
            Pagó todo: {formatearPlata(deuda, moneda)}
          </button>
        )}
      </section>

      {/* 3. Sugerencia */}
      {cliente && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-slate-700">Se aplica a</h2>
          {items.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-base text-slate-600 shadow-sm">
              No debe nada en {moneda === "ARS" ? "pesos" : "dólares"}: todo el pago queda a favor.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const incluido = !excluidos.includes(item.item_id);
                const aplicado = aplicadoPorItem.get(item.item_id) ?? 0;
                return (
                  <li key={item.item_id} className={`rounded-xl bg-white p-4 shadow-sm ${incluido ? "" : "opacity-60"}`}>
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={incluido}
                        onChange={() => alternarItem(item.item_id)}
                        className="mt-1 h-6 w-6 shrink-0 accent-sky-700"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-base font-semibold">
                          Viaje #{item.viaje_numero} · {item.origen} → {item.destino}
                        </span>
                        <span className="text-sm text-slate-500">
                          {item.vehiculo ? `${item.vehiculo} · ` : ""}
                          {item.fecha_entrega ? `entregado ${formatearFecha(item.fecha_entrega)}` : "sin entregar"}
                        </span>
                        <span className="text-sm text-slate-700">Debe {formatearPlata(item.saldo_centavos, moneda)}</span>
                      </span>
                    </label>
                    {incluido && centavos > 0 && (
                      <div className="mt-3 flex items-center justify-between gap-3 pl-9">
                        <span className="text-sm text-slate-600">Aplicar</span>
                        <input
                          inputMode="decimal"
                          aria-label={`Monto para el viaje ${item.viaje_numero}`}
                          value={manualesTexto[item.item_id] ?? sinSimbolo(aplicado, moneda)}
                          onChange={(e) => setManualesTexto((actual) => ({ ...actual, [item.item_id]: e.target.value }))}
                          className="h-12 w-36 rounded-lg border border-slate-300 px-3 text-right text-lg tabular-nums outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {centavos > 0 && (
            <div className="rounded-xl bg-slate-200/60 p-4 text-base">
              <p className="flex justify-between gap-3">
                <span>Se aplica</span>
                <strong className="tabular-nums">{formatearPlata(sugerencia.aplicado, moneda)}</strong>
              </p>
              {sugerencia.saldoAFavor > 0 && (
                <p className="mt-1 flex justify-between gap-3 text-amber-800">
                  <span>Queda a favor del cliente</span>
                  <strong className="tabular-nums">{formatearPlata(sugerencia.saldoAFavor, moneda)}</strong>
                </p>
              )}
            </div>
          )}
          {errorAplicacion && <p role="alert" className="text-base text-red-700">{errorAplicacion}</p>}
        </section>
      )}

      {/* 4. Detalles (con valores por defecto) */}
      <section className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-semibold text-slate-700">Medio</legend>
          <div className="grid grid-cols-2 gap-2">
            {MEDIOS.map((m) => (
              <label key={m.valor} className="has-[:checked]:border-sky-700 has-[:checked]:bg-sky-50 flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white text-base font-medium">
                <input type="radio" name="medio" value={m.valor} defaultChecked={m.valor === "transferencia"} className="sr-only" />
                {m.texto}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2">
          <span className="text-base font-semibold text-slate-700">Fecha</span>
          <input
            type="date"
            name="fecha"
            defaultValue={hoy}
            max={hoy}
            required
            className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-lg"
          />
        </label>
        <details className="rounded-xl bg-white p-4 shadow-sm">
          <summary className="text-base font-medium text-slate-700">Más datos (opcional)</summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">Titular de la cuenta</span>
              <input name="titular" maxLength={120} className="h-12 rounded-lg border border-slate-300 px-3 text-base" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">Notas</span>
              <textarea name="notas" maxLength={500} rows={2} className="rounded-lg border border-slate-300 px-3 py-2 text-base" />
            </label>
          </div>
        </details>
      </section>

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
          {enviando ? "Guardando…" : centavos > 0 ? `Registrar pago de ${formatearPlata(centavos, moneda)}` : "Registrar pago"}
        </button>
        <Link href="/cobros" className="text-center text-base font-medium text-slate-600">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
