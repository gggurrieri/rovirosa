// App instalable (PWA): manifiesto, íconos, service worker, "Sin conexión" e "Instalá la app".
const c = require("./comun.cjs");

const pedir = (ruta) => fetch(`${c.APP}${ruta}`, { redirect: "manual" }); // sin sesión

(async () => {
  // Lo que el celular baja ANTES de iniciar sesión: tiene que andar sin redirigir al login
  const m = await pedir("/manifest.webmanifest");
  const manifiesto = await m.json();
  c.ok(m.status === 200 && manifiesto.name === "Tracker" && manifiesto.display === "standalone" && manifiesto.start_url === "/", "Manifiesto: Tracker, pantalla completa, abre en Inicio");
  const iconos = await Promise.all(manifiesto.icons.map((i) => pedir(i.src)));
  c.ok(iconos.every((r) => r.status === 200 && r.headers.get("content-type") === "image/png") && manifiesto.icons.some((i) => i.purpose === "maskable"),
    "Los íconos del manifiesto existen (incluido el de Android que se recorta)");
  c.ok((await pedir("/apple-icon.png")).status === 200 && (await pedir("/icon.svg")).status === 200, "Ícono para iPhone y para la pestaña del navegador");
  const sw = await pedir("/sw.js");
  c.ok(sw.status === 200 && (await sw.text()).includes("sin-conexion"), "El service worker se baja sin sesión");
  const sc = await pedir("/sin-conexion");
  c.ok(sc.status === 200 && (await sc.text()).includes("Sin conexión"), "La página Sin conexión se baja sin sesión (no redirige al login)");

  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador);
  await c.entrar(page, "dueno@demo.com");
  // Next.js pone el título cuando termina de cargar la pantalla: esperarlo (hasta 10 s).
  await page.waitForFunction(() => document.title !== "", null, { timeout: 10000 }).catch(() => {});
  const titulo = await page.title();
  c.ok(titulo.includes("Tracker") && !titulo.includes("Rovirosa"), `El título dice Tracker (${titulo})`);
  c.ok(await page.evaluate(() => !!document.querySelector("link[rel=manifest]") && !!document.querySelector("meta[name=apple-mobile-web-app-title][content=Tracker]") || !!document.querySelector("meta[name=apple-mobile-web-app-capable]")),
    "La página enlaza el manifiesto y los datos para iPhone");

  // Con sesión, /sin-conexion tampoco redirige (si no, el celular guardaría otra pantalla)
  const r = await page.goto(`${c.APP}/sin-conexion`);
  c.ok(r.status() === 200 && page.url().endsWith("/sin-conexion"), "Con sesión, Sin conexión no redirige a Inicio");

  // Service worker activo → sin señal muestra "Sin conexión" en vez del error del navegador
  await page.goto(`${c.APP}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // la primera carga no pasa por el service worker recién instalado
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.context().setOffline(true);
  await page.goto(`${c.APP}/viajes`).catch(() => {});
  c.ok((await page.textContent("h1")) === "Sin conexión", "Sin señal, se ve la página Sin conexión");
  c.ok(!(await page.innerText("body")).includes("$"), "La página Sin conexión no muestra montos ni datos");
  await page.screenshot({ path: `${c.CAPTURAS}/s1-sin-conexion.png`, fullPage: true });
  await page.context().setOffline(false);

  // Más → Instalá la app (en una compu: instrucciones de Chrome)
  await page.goto(`${c.APP}/mas`);
  await Promise.all([page.waitForURL(/\/mas\/instalar$/), page.click("main a:has-text('Instalá la app')")]);
  const t = await c.texto(page);
  c.ok(t.includes("Instalar app") || t.includes("Instalar Tracker"), "Instalá la app explica cómo instalarla");
  c.ok(await c.sinScrollHorizontal(page), "Instalá la app sin scroll horizontal a 375 px");

  // En un iPhone: los pasos de Safari
  const iphone = await navegador.newContext({ ...require("playwright").devices["iPhone 13"] });
  const pi = await iphone.newPage();
  pi.errores = [];
  pi.on("pageerror", (e) => pi.errores.push(e.message));
  await c.entrar(pi, "dueno@demo.com");
  await pi.goto(`${c.APP}/mas/instalar`);
  await pi.waitForSelector("text=Agregar a inicio");
  c.ok((await c.texto(pi)).includes("Safari"), "En iPhone: Compartir → Agregar a inicio, en Safari");
  await pi.screenshot({ path: `${c.CAPTURAS}/s2-instalar-iphone.png`, fullPage: true });

  for (const p of [page, pi]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
