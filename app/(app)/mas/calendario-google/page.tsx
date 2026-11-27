import type { Metadata } from "next";
import Link from "next/link";
import { obtenerSesion } from "@/lib/datos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { urlBase } from "@/lib/url-base";
import { CopiarLink, RegenerarLink } from "./BotonesLink";

export const metadata: Metadata = { title: "Calendario en Google · Rovirosa" };

export default async function CalendarioGoogle({ searchParams }: PageProps<"/mas/calendario-google">) {
  const { perfil } = await obtenerSesion();
  const volver = (
    <Link href="/mas" className="text-base font-medium text-sky-700">
      ← Más
    </Link>
  );
  if (perfil?.rol !== "dueno" && perfil?.rol !== "administrativo") {
    return (
      <div className="flex flex-col gap-5 lg:max-w-3xl">
        {volver}
        <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">El calendario lo ven el dueño y el administrativo.</p>
      </div>
    );
  }

  const { nuevo } = await searchParams;
  const supabase = await crearClienteServidor();
  const { data: token, error } = await supabase.rpc("token_calendario");
  const link = token ? `${await urlBase()}/ics/${token}.ics` : null;

  return (
    <div className="flex flex-col gap-5 lg:max-w-3xl">
      {volver}
      <div>
        <h1 className="text-2xl font-bold">Calendario en Google</h1>
        <p className="mt-1 text-base text-slate-600">
          Todos los viajes y bloqueos de las unidades en tu calendario del celular. Se actualiza solo.
        </p>
      </div>

      {nuevo && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-base text-emerald-900">
          Link nuevo listo. El anterior ya no anda: agregá este en tus calendarios.
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Tu link</h2>
        {link ? <CopiarLink link={link} /> : <p className="text-base text-red-700">{error ? "No se pudo obtener el link. Probá de nuevo." : ""}</p>}
        <p className="text-sm text-slate-600">
          🔒 Es personal: quien lo tenga ve fechas, rutas, unidades y choferes (nunca precios ni clientes). No lo compartas.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Cómo agregarlo</h2>
        <Paso titulo="Google Calendar (en la computadora)">
          Abrí calendar.google.com → a la izquierda, en <b>Otros calendarios</b>, tocá <b>+</b> → <b>Desde URL</b> → pegá el link → <b>Agregar calendario</b>. Después aparece solo en
          el celular, en la app de Google Calendar.
        </Paso>
        <Paso titulo="iPhone">
          <b>Ajustes</b> → <b>Calendario</b> → <b>Cuentas</b> → <b>Agregar cuenta</b> → <b>Otra</b> → <b>Agregar calendario suscrito</b> → pegá el link.
        </Paso>
        <Paso titulo="Outlook">
          <b>Agregar calendario</b> → <b>Suscribirse desde la web</b> → pegá el link.
        </Paso>
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⏱️ Google actualiza los calendarios suscritos cada varias horas (no al instante). Para ver un viaje enseguida, usá <b>📅 Agregar a Google Calendar</b> en el
          detalle del viaje.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">¿Se compartió el link sin querer?</h2>
        <p className="text-base text-slate-600">Generá uno nuevo: el anterior deja de andar y hay que volver a agregarlo.</p>
        <RegenerarLink />
      </section>
    </div>
  );
}

function Paso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold">{titulo}</h3>
      <p className="mt-1 text-base text-slate-700">{children}</p>
    </div>
  );
}
