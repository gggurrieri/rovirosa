// Configuración de OpenRouteService (solo servidor: la clave nunca llega al navegador).
export const configORS = () => ({
  clave: process.env.ORS_API_KEY ?? "",
  url: process.env.ORS_URL ?? "https://api.heigit.org", // api.openrouteservice.org se dio de baja en 2026
});

export const hayCalculoAutomatico = () => Boolean(process.env.ORS_API_KEY);
