import { BotonCerrarSesion } from "@/components/BotonCerrarSesion";

/** Usuario logueado sin perfil, o con un rol que todavía no ve viajes ni cobros. */
export function SinAcceso({ email, conPerfil }: { email: string; conPerfil: boolean }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h1 className="text-xl font-semibold">
        {conPerfil ? "Todavía no tenés acceso a esta sección" : "Tu usuario no tiene una empresa asignada"}
      </h1>
      <p className="mt-2 text-base text-slate-600">
        Entraste como <strong className="break-all">{email}</strong>. Pedile al administrador que te
        dé acceso.
      </p>
      <div className="mt-5">
        <BotonCerrarSesion />
      </div>
    </section>
  );
}
