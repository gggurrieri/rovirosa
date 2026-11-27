import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { obtenerSesion } from "@/lib/datos";
import { textoUso } from "@/lib/adopcion";
import { obtenerUso, obtenerUsuarios } from "@/lib/datos-usuarios";
import { hoyEnArgentina } from "@/lib/formato";
import { estadoInvitacion, linkWhatsApp, mensajeInvitacion, NOMBRE_ROL, textoVence } from "@/lib/usuarios";
import { anularInvitacion, cambiarActivo } from "./actions";
import { BotonAccion } from "./BotonAccion";
import { FormularioInvitar } from "./FormularioInvitar";

export const metadata: Metadata = { title: "Usuarios · Tracker" };

const HECHO: Record<string, string> = {
  anulada: "Invitación anulada.",
  desactivado: "Usuario desactivado: ya no ve los datos de la empresa.",
  reactivado: "Usuario reactivado.",
};

export default async function Usuarios({ searchParams }: PageProps<"/mas/usuarios">) {
  const { perfil, userId } = await obtenerSesion();
  if (perfil?.rol !== "dueno") {
    return (
      <div className="flex flex-col gap-4 lg:max-w-xl">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <p className="rounded-2xl bg-white p-5 text-base text-slate-600 shadow-sm">Solo el dueño de la empresa gestiona los usuarios.</p>
      </div>
    );
  }

  const { invitada, hecho } = await searchParams;
  const hoy = hoyEnArgentina();
  const [{ usuarios, invitaciones }, uso] = await Promise.all([obtenerUsuarios(), obtenerUso(hoy)]);
  const encabezados = await headers();
  const host = encabezados.get("x-forwarded-host") ?? encabezados.get("host") ?? "";
  const protocolo = encabezados.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const urlRegistro = `${protocolo}://${host}/registro`;
  const nueva = invitaciones.find((i) => i.id === invitada);

  return (
    <div className="flex flex-col gap-5 lg:max-w-3xl">
      <Link href="/mas" className="text-base font-medium text-sky-700">
        ← Más
      </Link>
      <h1 className="text-2xl font-bold">Usuarios</h1>

      {typeof hecho === "string" && HECHO[hecho] && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-900">
          ✅ {HECHO[hecho]}
        </p>
      )}

      {nueva && (
        <section role="status" className="flex flex-col gap-3 rounded-2xl bg-emerald-50 p-5 text-emerald-950">
          <p className="text-base font-semibold">✅ Invitación creada para {nueva.nombre}.</p>
          <p className="text-base">
            Mandale el link para que cree su usuario con el email <strong className="break-all">{nueva.email}</strong>:
          </p>
          <a
            href={linkWhatsApp(mensajeInvitacion({ nombre: nueva.nombre, email: nueva.email, empresa: perfil.empresa, url: urlRegistro }))}
            target="_blank"
            rel="noreferrer"
            className="flex h-14 items-center justify-center rounded-xl bg-emerald-700 text-lg font-semibold text-white active:bg-emerald-800"
          >
            Enviar por WhatsApp
          </a>
          <p className="text-sm break-all">O copiá este link: {urlRegistro}</p>
        </section>
      )}

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">En la empresa ({usuarios.length})</h2>
            <ul className="flex flex-col gap-3">
              {usuarios.map((u) => (
                <li key={u.user_id} className={`flex items-start justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ${u.activo ? "" : "opacity-70"}`}>
                  <div className="min-w-0">
                    <p className="text-base font-semibold break-words">
                      {u.nombre}
                      {u.user_id === userId && <span className="font-normal text-slate-500"> (vos)</span>}
                    </p>
                    <p className="text-sm break-all text-slate-500">{u.email ?? "sin email"}</p>
                    <p className="text-sm text-slate-700">
                      {NOMBRE_ROL[u.rol]}
                      {!u.activo && <span className="ml-2 font-medium text-red-700">· Desactivado</span>}
                    </p>
                    {u.activo && (
                      <p className={`mt-1 text-sm ${(uso[u.user_id]?.dias7 ?? 0) === 0 ? "font-medium text-amber-800" : "text-slate-600"}`}>
                        {textoUso(uso[u.user_id], hoy)}
                      </p>
                    )}
                  </div>
                  {u.user_id !== userId && u.rol !== "chofer" && (
                    <BotonAccion
                      accion={cambiarActivo}
                      campos={{ user_id: u.user_id, activo: String(!u.activo) }}
                      texto={u.activo ? "Desactivar" : "Reactivar"}
                      confirmar={u.activo ? `¿Desactivar a ${u.nombre}? Deja de ver los datos al instante.` : `¿Reactivar a ${u.nombre}?`}
                      peligro={u.activo}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>

          {invitaciones.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Invitaciones pendientes ({invitaciones.length})</h2>
              <ul className="flex flex-col gap-3">
                {invitaciones.map((i) => {
                  const vencida = estadoInvitacion(i) === "vencida";
                  return (
                    <li key={i.id} className="flex items-start justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
                      <div className="min-w-0">
                        <p className="text-base font-semibold break-words">{i.nombre}</p>
                        <p className="text-sm break-all text-slate-500">{i.email}</p>
                        <p className={`text-sm ${vencida ? "font-medium text-red-700" : "text-slate-700"}`}>
                          {NOMBRE_ROL[i.rol]} · {vencida ? "Vencida: invitalo de nuevo" : textoVence(i.vence_en)}
                        </p>
                      </div>
                      <BotonAccion
                        accion={anularInvitacion}
                        campos={{ id: i.id }}
                        texto="Anular"
                        confirmar={`¿Anular la invitación de ${i.nombre}?`}
                        peligro
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <FormularioInvitar />
      </div>
    </div>
  );
}
