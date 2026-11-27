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

  // A 1280 px también entra
  const pc = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(pc, "dueno@demo.com");
  await pc.goto(`${c.APP}/configuracion/tarifas/nueva`);
  c.ok(await c.sinScrollHorizontal(pc), "Nueva tarifa sin scroll horizontal a 1280 px");

  for (const p of [page, pc]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
