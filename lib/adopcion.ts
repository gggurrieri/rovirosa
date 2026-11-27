// Adopción: qué días usa la app cada persona (un registro por día, ver migración accesos).
import { formatearFecha, sumarDias } from "./formato";

export type Uso = { dias7: number; dias30: number; ultimo: string | null };

/** Por usuario: cuántos días distintos usó la app en los últimos 7 y 30 días (hoy incluido). */
export function resumirUso(filas: { user_id: string; dia: string }[], hoy: string): Record<string, Uso> {
  const desde7 = sumarDias(hoy, -6);
  const desde30 = sumarDias(hoy, -29);
  const r: Record<string, Uso> = {};
  for (const { user_id, dia } of filas) {
    const u = (r[user_id] ??= { dias7: 0, dias30: 0, ultimo: null });
    if (dia >= desde7 && dia <= hoy) u.dias7++;
    if (dia >= desde30 && dia <= hoy) u.dias30++;
    if (!u.ultimo || dia > u.ultimo) u.ultimo = dia;
  }
  return r;
}

export function textoUso(u: Uso | undefined, hoy: string): string {
  if (!u?.ultimo) return "Todavía no usó la app";
  const ultimo = u.ultimo === hoy ? "hoy" : u.ultimo === sumarDias(hoy, -1) ? "ayer" : formatearFecha(u.ultimo);
  const semana = u.dias7 === 0 ? "No usó la app en la última semana" : `Usó la app ${u.dias7} de los últimos 7 días`;
  return `${semana} · último ingreso ${ultimo}`;
}
