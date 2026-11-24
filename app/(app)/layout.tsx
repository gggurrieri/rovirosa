import { BarraInferior } from "@/components/BarraInferior";
import { obtenerSesion, puedeVerOperacion } from "@/lib/datos";
import { SinAcceso } from "./SinAcceso";

export default async function LayoutAutenticado({ children }: LayoutProps<"/">) {
  const { email, perfil } = await obtenerSesion();

  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 bg-sky-700 px-4 pt-[env(safe-area-inset-top)] text-white shadow">
        <p className="mx-auto flex h-14 max-w-md items-center truncate text-lg font-semibold">
          {perfil?.empresa || "Rovirosa"}
        </p>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-5">
        {puedeVerOperacion(perfil) ? children : <SinAcceso email={email} conPerfil={perfil !== null} />}
      </main>
      <BarraInferior />
    </div>
  );
}
