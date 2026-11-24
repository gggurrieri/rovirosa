import { Montos } from "@/components/Montos";
import { TarjetaResumen } from "@/components/TarjetaResumen";
import { contarViajesProximos, obtenerItemsSaldo } from "@/lib/datos";
import { resumenCobros } from "@/lib/tablero";

export default async function Inicio() {
  const [items, viajesProximos] = await Promise.all([obtenerItemsSaldo(), contarViajesProximos(7)]);
  const { porCobrar, vencido } = resumenCobros(items);
  const hayVencido = Object.values(vencido).some((centavos) => centavos > 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Inicio</h1>
      <TarjetaResumen titulo="Por cobrar" valor={<Montos montos={porCobrar} />} />
      <TarjetaResumen
        titulo="Vencido"
        valor={<Montos montos={vencido} />}
        tono={hayVencido ? "alerta" : "normal"}
        detalle={hayVencido ? "Entregados hace más de los días acordados sin cobrar todo" : "Nada vencido"}
      />
      <TarjetaResumen
        titulo="Viajes de los próximos 7 días"
        valor={viajesProximos}
        detalle={viajesProximos === 0 ? "Sin viajes programados" : undefined}
      />
    </div>
  );
}
