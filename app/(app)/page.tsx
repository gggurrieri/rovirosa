import Link from "next/link";
import { BotonAccionRapida } from "@/components/BotonAccionRapida";
import { Montos } from "@/components/Montos";
import { obtenerItemsSaldo } from "@/lib/datos";
import { obtenerResultados, obtenerViajesHoy } from "@/lib/datos-hoy";
import { formatearFecha, hoyEnArgentina } from "@/lib/formato";
import {
  clasificarViajesHoy,
  esMesFuturo,
  type Mes,
  mesAnterior,
  mesATexto,
  mesDe,
  mesDesdeTexto,
  mesSiguiente,
  nombreMes,
  puedeEmpezar,
  type ViajeHoy,
} from "@/lib/hoy";
import { resumenCobros, type Montos as TipoMontos } from "@/lib/tablero";
import { NOMBRE_ESTADO, type EstadoViaje } from "@/lib/viajes";

const tieneMonto = (m: TipoMontos) =>
  Object.values(m).some((v) => (v ?? 0) > 0);

export default async function Inicio({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const hoy = hoyEnArgentina();
  const pedido = mesDesdeTexto(sp.mes);
  const mes: Mes = pedido && !esMesFuturo(pedido, hoy) ? pedido : mesDe(hoy);
  const mesTexto = pedido ? mesATexto(mes) : null;

  const [resultados, items, viajes] = await Promise.all([
    obtenerResultados(mes),
    obtenerItemsSaldo(),
    obtenerViajesHoy(hoy),
  ]);
  const { porCobrar, vencido } = resumenCobros(items);
  const { atrasados, enCurso, proximos } = clasificarViajesHoy(viajes, hoy);
  const siguiente = mesSiguiente(mes);
  const mesVacio =
    resultados.viajes === 0 &&
    !tieneMonto(resultados.facturado) &&
    !tieneMonto(resultados.cobrado);

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      <div className="empty:hidden lg:col-span-2">
        <AvisoAccion sp={sp} mes={mesTexto} />
      </div>

      {/* Columna izquierda (en la computadora): cómo va el negocio */}
      <div className="flex flex-col gap-5">
        {/* Ahora: lo que se debe hoy */}
        <section className="grid grid-cols-2 gap-3">
          <Link
            href="/cobros"
            className="rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50"
          >
            <p className="text-sm font-medium text-slate-600">Por cobrar</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              <Montos montos={porCobrar} />
            </p>
          </Link>
          <Link
            href="/cobros"
            className={`rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50 ${tieneMonto(vencido) ? "border-l-4 border-red-600" : ""}`}
          >
            <p className="text-sm font-medium text-slate-600">Vencido</p>
            <p
              className={`mt-1 text-xl font-bold tabular-nums ${tieneMonto(vencido) ? "text-red-700" : ""}`}
            >
              <Montos montos={vencido} />
            </p>
          </Link>
        </section>

        {/* Resultados del mes */}
        <section
          className="rounded-2xl bg-white p-4 shadow-sm"
          aria-label="Resultados del mes"
        >
          <div className="flex items-center justify-between">
            <Link
              href={`/?mes=${mesATexto(mesAnterior(mes))}`}
              aria-label="Mes anterior"
              className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-sky-700 active:bg-slate-100"
            >
              ‹
            </Link>
            <h2 className="text-lg font-semibold">{nombreMes(mes)}</h2>
            {esMesFuturo(siguiente, hoy) ? (
              <span className="h-11 w-11" />
            ) : (
              <Link
                href={`/?mes=${mesATexto(siguiente)}`}
                aria-label="Mes siguiente"
                className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-sky-700 active:bg-slate-100"
              >
                ›
              </Link>
            )}
          </div>
          {mesVacio ? (
            <p className="py-4 text-center text-base text-slate-500">
              Sin viajes este mes.
            </p>
          ) : (
            <dl className="mt-2 divide-y divide-slate-100 text-base">
              <Fila
                titulo="Facturado"
                valor={<Montos montos={resultados.facturado} />}
              />
              <Fila
                titulo="Cobrado"
                valor={<Montos montos={resultados.cobrado} />}
              />
              <Fila
                titulo="Recuperado"
                ayuda="Cobrado de autos que ya estaban vencidos"
                valor={<Montos montos={resultados.recuperado} />}
                destacado={tieneMonto(resultados.recuperado)}
              />
              <Fila titulo="Viajes" valor={resultados.viajes} />
            </dl>
          )}
        </section>
      </div>

      {/* Columna derecha (en la computadora): los viajes del día */}
      <div className="flex flex-col gap-5">
        {atrasados.length > 0 && (
          <ListaViajes
            titulo={`Atrasados (${atrasados.length})`}
            tono="alerta"
            viajes={atrasados}
            hoy={hoy}
            mes={mesTexto}
          />
        )}
        <ListaViajes
          titulo={`En curso (${enCurso.length})`}
          vacio="Ningún viaje en la ruta."
          viajes={enCurso}
          hoy={hoy}
          mes={mesTexto}
        />
        <ListaViajes
          titulo={`Próximos 7 días (${proximos.length})`}
          vacio="Sin viajes programados."
          viajes={proximos}
          hoy={hoy}
          mes={mesTexto}
        />
      </div>
    </div>
  );
}

function Fila({
  titulo,
  valor,
  ayuda,
  destacado,
}: {
  titulo: string;
  valor: React.ReactNode;
  ayuda?: string;
  destacado?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt>
        <span className="font-medium text-slate-700">{titulo}</span>
        {ayuda && <span className="block text-xs text-slate-500">{ayuda}</span>}
      </dt>
      <dd
        className={`text-right font-semibold tabular-nums ${destacado ? "text-emerald-700" : ""}`}
      >
        {valor}
      </dd>
    </div>
  );
}

function ListaViajes({
  titulo,
  viajes,
  hoy,
  mes,
  vacio,
  tono,
}: {
  titulo: string;
  viajes: ViajeHoy[];
  hoy: string;
  mes: string | null;
  vacio?: string;
  tono?: "alerta";
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2
        className={`text-lg font-semibold ${tono === "alerta" ? "text-amber-800" : ""}`}
      >
        {tono === "alerta" && "⚠️ "}
        {titulo}
      </h2>
      {viajes.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-base text-slate-500 shadow-sm">
          {vacio}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {viajes.map((v) => (
            <li
              key={v.id}
              className={`rounded-2xl bg-white p-4 shadow-sm ${tono === "alerta" ? "border-l-4 border-amber-500" : ""}`}
            >
              <Link href={`/viajes/${v.id}`} className="block">
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">
                    #{v.numero}
                  </span>{" "}
                  ·{" "}
                  {v.fecha_salida === hoy
                    ? "hoy"
                    : formatearFecha(v.fecha_salida)}
                  {tono === "alerta" && " · debía salir y no empezó"}
                </p>
                <p className="mt-1 text-lg font-semibold break-words">
                  {v.origen} → {v.destino}
                </p>
                <p className="text-sm text-slate-600">
                  {[
                    v.unidad,
                    v.chofer,
                    `${v.autos} ${v.autos === 1 ? "auto" : "autos"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
              <div className="mt-3">
                <Accion viaje={v} hoy={hoy} mes={mes} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Accion({
  viaje,
  hoy,
  mes,
}: {
  viaje: ViajeHoy;
  hoy: string;
  mes: string | null;
}) {
  const comun = {
    viajeId: viaje.id,
    numero: viaje.numero,
    desde: viaje.estado,
    mes,
  };
  if (viaje.estado === "en_viaje")
    return (
      <BotonAccionRapida
        {...comun}
        hacia="entregado"
        texto="Terminó: entregado"
      />
    );
  if (viaje.estado === "en_retiro")
    return (
      <BotonAccionRapida {...comun} hacia="en_viaje" texto="Salió: en viaje" />
    );
  if (puedeEmpezar(viaje, hoy))
    return (
      <BotonAccionRapida {...comun} hacia="en_viaje" texto="Empezó el viaje" />
    );
  return (
    <p className="text-sm text-slate-500">
      Sale el {formatearFecha(viaje.fecha_salida)}
    </p>
  );
}

/** Confirmación de la última acción, con Deshacer para un toque equivocado. */
function AvisoAccion({
  sp,
  mes,
}: {
  sp: Record<string, string | string[] | undefined>;
  mes: string | null;
}) {
  const { hecho, n, desde, hacia } = sp;
  if (
    typeof hecho !== "string" ||
    typeof desde !== "string" ||
    typeof hacia !== "string" ||
    !(hacia in NOMBRE_ESTADO)
  ) {
    return null;
  }
  const numero = Number(n);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-base text-emerald-900"
    >
      <span>
        ✅ Viaje #{numero}: {NOMBRE_ESTADO[hacia as EstadoViaje].toLowerCase()}.
      </span>
      <BotonAccionRapida
        viajeId={hecho}
        numero={numero}
        desde={hacia}
        hacia={desde}
        mes={mes}
        texto="Deshacer"
        variante="link"
      />
    </div>
  );
}
