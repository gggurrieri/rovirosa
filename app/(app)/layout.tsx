import { BarraInferior } from "@/components/BarraInferior";
import { MenuLateral } from "@/components/MenuLateral";
import { obtenerSesion, puedeVerOperacion } from "@/lib/datos";
import { SinAcceso } from "./SinAcceso";

/**
 * Dos puestos, una sola web: en el celular, encabezado arriba y barra abajo;
 * desde 1024 px, menú lateral y contenido ancho.
 */
export default async function LayoutAutenticado({ children }: LayoutProps<"/">) {
  const { email, perfil, acceso } = await obtenerSesion();
  const empresa = perfil?.empresa || "Rovirosa";

  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-60">
      <header className="sticky top-0 z-10 bg-sky-700 px-4 pt-[env(safe-area-inset-top)] text-white shadow lg:hidden">
        <p className="mx-auto flex h-14 max-w-md items-center truncate text-lg font-semibold">{empresa}</p>
      </header>
      <MenuLateral empresa={empresa} />
      <main className="mx-auto w-full max-w-md px-4 py-5 lg:max-w-6xl lg:px-8 lg:py-8">
        {puedeVerOperacion(perfil) ? children : <SinAcceso email={email} conPerfil={perfil !== null} acceso={acceso} />}
      </main>
      <BarraInferior />
    </div>
  );
}
