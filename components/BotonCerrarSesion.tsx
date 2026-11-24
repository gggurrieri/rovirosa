import { cerrarSesion } from "@/app/login/actions";

export function BotonCerrarSesion() {
  return (
    <form action={cerrarSesion}>
      <button
        type="submit"
        className="h-14 w-full rounded-xl border border-slate-300 bg-white text-lg font-semibold text-slate-800 active:bg-slate-100"
      >
        Cerrar sesión
      </button>
    </form>
  );
}
