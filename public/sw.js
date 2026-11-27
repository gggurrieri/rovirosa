// Service worker de Tracker. Hace UNA sola cosa: si no hay señal, mostrar la página
// "Sin conexión" en vez del error del navegador. No guarda viajes, cobros ni nada con
// datos: con plata de por medio, mostrar números viejos como si fueran de hoy es peor.
const CACHE = "tracker-v1";
const PAGINA = "/sin-conexion";
const ARCHIVOS = [PAGINA, "/iconos/icono-192.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const url of ARCHIVOS) {
        const r = await fetch(url, { cache: "reload", credentials: "omit" });
        // Nunca guardar una redirección (podría ser una pantalla con datos).
        if (r.ok && !r.redirected) await cache.put(url, r);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) if (nombre !== CACHE) await caches.delete(nombre);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.mode !== "navigate") return; // todo lo demás va directo a la red
  evento.respondWith(
    fetch(evento.request).catch(async () => (await caches.match(PAGINA)) ?? Response.error()),
  );
});
