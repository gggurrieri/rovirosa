import type { Metadata } from "next";
import Link from "next/link";
import { BarrasHorizontales } from "@/components/graficos/BarrasHorizontales";
import { Columnas } from "@/components/graficos/Columnas";
import { Linea } from "@/components/graficos/Linea";
import { obtenerMetricas } from "@/lib/datos-metricas";
import { formatearPlata } from "@/lib/formato";
import { formatearPlataCorta, NOMBRE_TRAMO, nombreMes } from "@/lib/metricas";

export const metadata: Metadata = { title: "Métricas · Rovirosa" };

// Paleta validada (ver la skill de visualización): azul y naranja se distinguen
// también con daltonismo. El naranja tiene poco contraste sobre blanco: por eso
// cada gráfico lleva valores escritos y su tabla.
const AZUL = "#257de0";
const NARANJA = "#f47230";
// Antigüedad: un solo tono, de claro (reciente) a oscuro (viejo).
const RAMPA = ["#84b9f3", "#519ced", "#2370cd", "#1757ac", "#0e3d7e"];

const ars = (m: { ARS?: number }) => m.ARS ?? 0;
const largo = (n: number) => formatearPlata(n);
const corto = (n: number) => formatearPlataCorta(n);

export default async function Metricas() {
  const m = await obtenerMetricas(6);
  const meses = m.meses.map((x) => nombreMes(x.mes));
  const actual = m.meses[m.meses.length - 1];
  const sinDatos = m.meses.every((x) => ars(x.facturado) === 0 && ars(x.cobrado) === 0) && ars(m.por_cobrar) === 0;
  const hayUsd = [m.por_cobrar, ...m.meses.map((x) => x.facturado)].some((x) => (x.USD ?? 0) > 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Métricas</h1>
        <p className="text-base text-slate-600">Cobranza de los últimos 6 meses, en pesos.</p>
      </div>

      {sinDatos ? (
        <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">
          Todavía no hay viajes ni pagos para mostrar. Las métricas se arman solas a medida que cargás viajes y cobros.
        </p>
      ) : (
        <>
          <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile titulo={`Recuperado en ${nombreMes(actual.mes, true).split(" ")[0]}`} valor={largo(ars(actual.recuperado))} nota="Cobrado de autos que ya estaban vencidos" destacado />
            <Tile titulo="Por cobrar" valor={largo(ars(m.por_cobrar))} />
            <Tile titulo="Vencido" valor={largo(ars(m.vencido))} nota={`Más de ${m.dias_vencimiento} días desde la entrega`} />
            <Tile
              titulo="Días de cobro"
              valor={m.dias_cobro_90 === null ? "—" : `${m.dias_cobro_90} ${m.dias_cobro_90 === 1 ? "día" : "días"}`}
              nota="Promedio de los últimos 90 días, desde la entrega"
            />
          </section>
          {hayUsd && (
            <p className="text-sm text-slate-600">
              Además hay {formatearPlata(m.por_cobrar.USD ?? 0, "USD")} por cobrar en dólares (los gráficos muestran solo pesos).
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <Tarjeta titulo="Recuperado por mes" ayuda="Plata que entró de autos que ya estaban vencidos: lo que se rescató.">
              <Columnas
                categorias={meses}
                series={[{ nombre: "Recuperado", color: AZUL, valores: m.meses.map((x) => ars(x.recuperado)) }]}
                formatoEje={corto}
                formatoValor={largo}
                etiqueta="Recuperado por mes, últimos 6 meses"
              />
              <Tabla columnas={["Mes", "Recuperado"]} filas={m.meses.map((x) => [nombreMes(x.mes, true), largo(ars(x.recuperado))])} />
            </Tarjeta>

            <Tarjeta titulo="Facturado y cobrado por mes" ayuda="Facturado: viajes que salieron ese mes. Cobrado: pagos que entraron ese mes.">
              <Columnas
                categorias={meses}
                series={[
                  { nombre: "Facturado", color: AZUL, valores: m.meses.map((x) => ars(x.facturado)) },
                  { nombre: "Cobrado", color: NARANJA, valores: m.meses.map((x) => ars(x.cobrado)) },
                ]}
                formatoEje={corto}
                formatoValor={largo}
                etiqueta="Facturado y cobrado por mes, últimos 6 meses"
              />
              <Tabla
                columnas={["Mes", "Facturado", "Cobrado"]}
                filas={m.meses.map((x) => [nombreMes(x.mes, true), largo(ars(x.facturado)), largo(ars(x.cobrado))])}
              />
            </Tarjeta>

            <Tarjeta titulo="Antigüedad de la deuda" ayuda={`Lo que se debe, según cuántos días pasaron desde la entrega. Vence a los ${m.dias_vencimiento} días.`}>
              <BarrasHorizontales
                etiqueta="Deuda por antigüedad"
                formato={largo}
                filas={m.antiguedad.map((t, i) => ({
                  clave: t.tramo,
                  etiqueta: NOMBRE_TRAMO[t.tramo],
                  detalle: `${t.autos} ${t.autos === 1 ? "auto" : "autos"}`,
                  valor: ars(t.montos),
                  color: RAMPA[i],
                }))}
              />
            </Tarjeta>

            <Tarjeta titulo="Días de cobro por mes" ayuda="Cuánto tardaron en pagar, en promedio, los autos que se terminaron de cobrar cada mes. Menos es mejor.">
              <Linea
                categorias={meses}
                valores={m.meses.map((x) => x.dias_cobro)}
                color={AZUL}
                formato={(n) => `${n} ${n === 1 ? "día" : "días"}`}
                etiqueta="Días promedio de cobro por mes"
              />
              <Tabla
                columnas={["Mes", "Días promedio", "Autos cobrados"]}
                filas={m.meses.map((x) => [nombreMes(x.mes, true), x.dias_cobro === null ? "—" : String(x.dias_cobro), String(x.autos_cobrados)])}
              />
            </Tarjeta>

            <Tarjeta titulo="Quién debe más" ayuda="Los 5 clientes con más saldo. Tocá uno para registrar su pago.">
              {m.top_clientes.length === 0 ? (
                <p className="text-base text-slate-600">Nadie te debe. 🎉</p>
              ) : (
                <BarrasHorizontales
                  etiqueta="Clientes con más deuda"
                  formato={largo}
                  filas={m.top_clientes.map((c) => ({
                    clave: c.cliente_id,
                    etiqueta: c.nombre,
                    detalle: ars(c.vencido) > 0 ? `Vencido: ${largo(ars(c.vencido))}` : "Sin vencido",
                    valor: ars(c.saldo),
                    color: AZUL,
                    href: `/cobros/nuevo?cliente=${c.cliente_id}`,
                  }))}
                />
              )}
            </Tarjeta>
          </div>
        </>
      )}
      <Link href="/" className="text-base font-medium text-sky-700 lg:hidden">
        ← Inicio
      </Link>
    </div>
  );
}

function Tile({ titulo, valor, nota, destacado = false }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ${destacado ? "col-span-2 bg-sky-700 text-white lg:col-span-1" : "bg-white"}`}>
      <p className={`text-sm font-medium ${destacado ? "text-sky-100" : "text-slate-600"}`}>{titulo}</p>
      <p className={`mt-1 font-bold tabular-nums ${destacado ? "text-3xl" : "text-xl"}`}>{valor}</p>
      {nota && <p className={`mt-1 text-xs ${destacado ? "text-sky-100" : "text-slate-500"}`}>{nota}</p>}
    </div>
  );
}

function Tarjeta({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm lg:p-5">
      <div>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="text-sm text-slate-500">{ayuda}</p>
      </div>
      {children}
    </section>
  );
}

function Tabla({ columnas, filas }: { columnas: string[]; filas: string[][] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer py-1 font-medium text-sky-700">Ver los números</summary>
      <table className="mt-2 w-full text-left tabular-nums">
        <thead className="text-slate-500">
          <tr>
            {columnas.map((c, i) => (
              <th key={c} scope="col" className={`py-1 font-medium ${i > 0 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f[0]} className="border-t border-slate-100">
              {f.map((v, i) => (
                <td key={i} className={`py-1 ${i > 0 ? "text-right" : "capitalize"}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
