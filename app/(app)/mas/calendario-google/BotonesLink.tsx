"use client";

import { useActionState, useState } from "react";
import { type EstadoRegenerar, regenerarLink } from "./actions";

export function CopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Sin permiso de portapapeles: queda seleccionado para copiarlo a mano.
      (document.getElementById("link-calendario") as HTMLInputElement | null)?.select();
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }
  return (
    <div className="flex flex-col gap-2 lg:flex-row">
      <input
        id="link-calendario"
        readOnly
        value={link}
        aria-label="Link del calendario"
        onFocus={(e) => e.currentTarget.select()}
        className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 font-mono text-sm text-slate-700"
      />
      <button
        type="button"
        onClick={copiar}
        className="flex h-12 items-center justify-center rounded-xl bg-sky-700 px-6 text-base font-semibold text-white active:bg-sky-800"
      >
        {copiado ? "✓ Copiado" : "📋 Copiar link"}
      </button>
    </div>
  );
}

export function RegenerarLink() {
  const [estado, accion, enviando] = useActionState<EstadoRegenerar, FormData>(regenerarLink, { error: null });
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm("El link actual va a dejar de andar en todos los calendarios donde lo agregaste. ¿Generar uno nuevo?")) e.preventDefault();
      }}
      className="flex flex-col gap-1"
    >
      <button
        type="submit"
        disabled={enviando}
        className="flex h-12 items-center justify-center rounded-xl border border-slate-300 px-6 text-base font-medium text-slate-800 active:bg-slate-50 disabled:opacity-60 lg:self-start"
      >
        {enviando ? "Generando…" : "🔄 Generar un link nuevo"}
      </button>
      {estado.error && (
        <p role="alert" className="text-sm text-red-700">
          {estado.error}
        </p>
      )}
    </form>
  );
}
