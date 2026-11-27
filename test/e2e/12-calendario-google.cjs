// Calendario en Google: link de suscripción (iCal) y botón "Agregar a Google Calendar".
const c = require("./comun.cjs");

const pedir = (url) => fetch(url, { redirect: "manual" }); // sin cookies, como Google

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await c.entrar(page, "dueno@demo.com");

  await page.goto(`${c.APP}/mas`);
  await Promise.all([page.waitForURL(/\/mas\/calendario-google$/), page.click("main a:has-text('Calendario en Google')")]);
  await c.texto(page);
  const link = await page.inputValue("#link-calendario");
  c.ok(/\/ics\/[0-9a-f]{64}\.ics$/.test(link), "Muestra un link de calendario personal");
  await page.click("button:has-text('Copiar link')");
  await page.waitForSelector("button:has-text('Copiado')");
  c.ok((await page.evaluate(() => navigator.clipboard.readText())) === link, "Copiar link lo deja en el portapapeles");
  c.ok(await c.sinScrollHorizontal(page), "Calendario en Google sin scroll horizontal a 375 px");
  await page.screenshot({ path: `${c.CAPTURAS}/r1-calendario-google.png`, fullPage: true });

  // El link anda sin sesión y no muestra plata ni clientes
  const r = await pedir(link);
  const ics = await r.text();
  const n = c.sql("select numero from public.viajes where estado <> 'cancelado' and fecha_salida >= public.hoy_ar() - 20 order by fecha_salida desc limit 1");
  c.ok(r.status === 200 && r.headers.get("content-type").startsWith("text/calendar") && ics.startsWith("BEGIN:VCALENDAR"), "El link devuelve un calendario sin iniciar sesión");
  c.ok(ics.includes(`SUMMARY:#${n} `), `Trae el viaje #${n}`);
  const clientes = c.sql("select string_agg(nombre, '|') from public.clientes").split("|");
  const plano = ics.replace(/\r\n /g, "");
  c.ok(!clientes.some((x) => plano.includes(x)) && !/\$|precio|saldo/i.test(plano), "Sin nombres de clientes ni montos");
  c.ok((await pedir(`${c.APP}/ics/${"0".repeat(64)}.ics`)).status === 404, "Un link inventado da 404");

  // Generar uno nuevo: el viejo deja de andar
  page.once("dialog", (d) => d.accept());
  await Promise.all([page.waitForURL(/nuevo=1/), page.click("button:has-text('Generar un link nuevo')")]);
  const nuevo = await page.inputValue("#link-calendario");
  c.ok(nuevo !== link && (await pedir(link)).status === 404 && (await pedir(nuevo)).status === 200, "Generar un link nuevo corta el anterior");

  // Botón en el detalle del viaje
  const id = c.sql(`select id from public.viajes where numero = ${n}`);
  await page.goto(`${c.APP}/viajes/${id}`);
  const href = await page.locator("a:has-text('Agregar a Google Calendar')").getAttribute("href");
  const salida = c.sql(`select to_char(fecha_salida, 'YYYYMMDD') from public.viajes where id = '${id}'`);
  c.ok(href.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE") && new URL(href).searchParams.get("dates").startsWith(`${salida}/`),
    "El viaje tiene el botón Agregar a Google Calendar con sus fechas");
  c.ok(!clientes.some((x) => decodeURIComponent(href).includes(x)), "El evento de Google no lleva el cliente");

  // Otra empresa: su link no trae viajes de Rovirosa
  const otra = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}/mas/calendario-google`);
  const linkOtra = await otra.inputValue("#link-calendario");
  const icsOtra = await (await pedir(linkOtra)).text();
  c.ok(linkOtra !== nuevo && !icsOtra.includes("BEGIN:VEVENT"), "El link de otra empresa no trae viajes de Rovirosa");

  for (const p of [page, otra]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
