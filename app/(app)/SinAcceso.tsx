import { BotonCerrarSesion } from "@/components/BotonCerrarSesion";
import type { Acceso } from "@/lib/datos";

const TITULO: Record<Acceso, string> = {
  activo: "Todavía no tenés acceso a esta sección",
  desactivado: "Tu usuario está desactivado",
  sin_invitacion: "Tu usuario no tiene una empresa asignada",
  sin_confirmar: "Tu email todavía no está confirmado",
};

/** Usuario logueado sin perfil, desactivado, o con un rol que todavía no ve viajes ni cobros. */
export function SinAcceso({ email, conPerfil, acceso }: { email: string; conPerfil: boolean; acceso: Acceso }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h1 className="text-xl font-semibold">{TITULO[conPerfil ? "activo" : acceso]}</h1>
      <p className="mt-2 text-base text-slate-600">
        Entraste como <strong className="break-all">{email}</strong>.{" "}
        {acceso === "sin_invitacion"
          ? "Pedile al dueño de la empresa que te invite con este mismo email."
          : acceso === "sin_confirmar"
            ? "Abrí el mail de confirmación que te mandamos y tocá el link."
            : "Pedile al dueño de la empresa que te dé acceso."}
      </p>
      <div className="mt-5">
        <BotonCerrarSesion />
      </div>
    </section>
  );
}
