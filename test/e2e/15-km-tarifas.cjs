// Calcular km de una tarifa (OpenRouteService simulado) y link a Google Maps.
const c = require("./comun.cjs");

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador);
  await c.entrar(page, "dueno@demo.com");
  await page.goto(`${c.APP}/configuracion/tarifas/nueva`);

  const boton = page.getByRole("button", { name: "📍 Calcular km" });
  c.ok(await boton.isDisabled(), "Sin origen y destino, Calcular km está apagado");
  await page.fill("input[name=origen]", "Buenos Aires");
  await page.fill("input[name=destino]", "Bariloche");
  const maps = new URL(await page.locator("a:has-text('Ver en Google Maps')").getAttribute("href"));
  c.ok(maps.hostname === "www.google.com" && maps.searchParams.get("destination") === "Bariloche", "Link a Google Maps con la ruta");

  await boton.click();
  await page.waitForSelector("text=por ruta en camión");
  c.ok((await page.inputValue("input[name=km]")) === "1580", "Calcular km completa 1580 km");
  const t = await c.texto(page);
  c.ok(t.includes("San Carlos de Bariloche, RN, Argentina") && t.includes("OpenStreetMap"), "Muestra qué lugares encontró y la atribución");
  c.ok(await c.sinScrollHorizontal(page), "Nueva tarifa sin scroll horizontal a 375 px");
  await page.screenshot({ path: `${c.CAPTURAS}/t1-calcular-km.png`, fullPage: true });

  // Cambiar el destino borra el resultado anterior; un lugar que no existe avisa y no toca los km
  await page.fill("input[name=destino]", "Lugar Inexistente");
  c.ok((await page.locator("text=por ruta en camión").count()) === 0, "Al cambiar el destino se borra el cálculo anterior");
  await boton.click();
  await page.waitForSelector("[role=alert]:has-text('No encontré')");
  c.ok((await page.inputValue("input[name=km]")) === "1580", "Si no encuentra el lugar, avisa y deja los km como estaban");

  // Guardar con los km calculados
  await page.fill("input[name=destino]", "Bariloche");
  await boton.click();
  await page.waitForSelector("text=por ruta en camión");
  await page.fill("input[name=precio]", "1.900.000");
  await Promise.all([page.waitForURL(/\/configuracion\/tarifas(\?|$)/), page.click("button:has-text('Guardar tarifa')")]);
  c.ok(c.sql("select km from public.tarifas where destino = 'Bariloche'") === "1580", "La tarifa se guarda con los km calculados");

  // Sugerencias mientras se escribe: lugares propios al instante y de OpenRouteService al dejar de tipear
  const consultas = async () => (await (await fetch("http://127.0.0.1:54321/ors/_contador")).json());
  await page.goto(`${c.APP}/configuracion/tarifas/nueva`);
  await page.fill("input[name=origen]", "Bue");
  await page.waitForSelector("[role=option]:has-text('Ya usado en tus tarifas')");
  await page.click("[role=option]:has-text('Buenos Aires')");
  c.ok((await page.inputValue("input[name=origen]")) === "Buenos Aires", "Sugiere un lugar ya usado en otras tarifas y lo completa");
  const antes = await consultas();
  // Un texto que ninguna otra prueba busca: el servidor guarda lo ya buscado y no lo vuelve a pedir
  await page.locator("input[name=destino]").pressSequentially("Barilo", { delay: 60 });
  await page.waitForSelector("[role=option]:has-text('San Carlos de Bariloche')");
  const despues = await consultas();
  c.ok((despues["/ors/pelias/v1/autocomplete"] ?? 0) - (antes["/ors/pelias/v1/autocomplete"] ?? 0) === 1, "Escribir 6 letras seguidas hace UNA sola consulta (espera a que se deje de tipear)");
  await page.screenshot({ path: `${c.CAPTURAS}/t2-sugerencias.png`, fullPage: true });
  // Primero va "Bariloche" (ya usado en la tarifa guardada arriba); después las del servicio
  c.ok((await page.locator("[role=option]").first().innerText()).startsWith("Bariloche"), "Los lugares propios aparecen primero");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  c.ok((await page.inputValue("input[name=destino]")) === "San Carlos de Bariloche, RN, Argentina" && page.url().endsWith("/nueva"),
    "Con flechas y Enter se elige la sugerencia (sin guardar el formulario)");
  c.ok((await page.locator("[role=listbox]").count()) === 0, "Al elegir, la lista se cierra");
  const busquedas = (await consultas())["/ors/pelias/v1/search"] ?? 0;
  await page.click("button:has-text('Calcular km')");
  await page.waitForSelector("text=por ruta en camión");
  c.ok(((await consultas())["/ors/pelias/v1/search"] ?? 0) === busquedas + 1 && (await page.inputValue("input[name=km]")) === "1580",
    "Calcular km reusa la ubicación elegida: solo busca el lugar escrito a mano");
  await page.fill("input[name=destino]", "Ba");
  await page.waitForTimeout(700);
  c.ok(((await consultas())["/ors/pelias/v1/autocomplete"] ?? 0) === (despues["/ors/pelias/v1/autocomplete"] ?? 0), "Con menos de 3 letras no consulta");
  c.ok(await c.sinScrollHorizontal(page), "Con sugerencias, sin scroll horizontal a 375 px");

  // A 1280 px también entra
  const pc = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(pc, "dueno@demo.com");
  await pc.goto(`${c.APP}/configuracion/tarifas/nueva`);
  c.ok(await c.sinScrollHorizontal(pc), "Nueva tarifa sin scroll horizontal a 1280 px");

  for (const p of [page, pc]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
