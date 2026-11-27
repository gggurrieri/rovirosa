// "Se entrega en" por auto: viajes que dejan autos en varias ciudades.
const c = require("./comun.cjs");

const DUENO = "aaaaaaaa-0000-4000-8000-000000000001";
const VIAJE = "66666666-1111-4000-8000-000000000001";
c.sql(`select set_config('request.jwt.claim.sub', '${DUENO}', false);
  select public.crear_viaje('${VIAJE}', public.hoy_ar() + 5, null, 'José C. Paz', 'Bariloche · Mendoza', null, 'ARS',
    (select id from public.unidades where nombre = 'Mosquito 1'), null, null,
    jsonb_build_array(
      jsonb_build_object('cliente_id', (select id from public.clientes where nombre like 'Juan Pérez%'), 'vehiculo', jsonb_build_object('marca', 'Audi', 'modelo', 'R8'), 'precio_centavos', 100000000, 'entrega', 'Bariloche'),
      jsonb_build_object('cliente_id', (select id from public.clientes where nombre like 'Juan Pérez%'), 'vehiculo', jsonb_build_object('marca', 'BMW', 'modelo', 'M3'), 'precio_centavos', 90000000)));`);
const bmw = c.sql(`select i.id from public.items_viaje i join public.vehiculos v on v.id = i.vehiculo_id where i.viaje_id = '${VIAJE}' and v.marca = 'BMW'`);

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador);
  await c.entrar(page, "dueno@demo.com");

  await page.goto(`${c.APP}/viajes/${VIAJE}`);
  const t = await c.texto(page);
  c.ok(t.includes("📍 Se entrega en Bariloche") && (t.match(/Se entrega en/g) ?? []).length === 1, "El detalle muestra dónde se entrega cada auto (solo si se cargó)");

  // Editar: cargarle Mendoza al BMW
  await page.goto(`${c.APP}/viajes/${VIAJE}/editar`);
  c.ok((await page.locator("input[aria-label^='Se entrega en, auto Audi R8']").inputValue()) === "Bariloche", "Editar arranca con lo guardado");
  await page.locator("input[aria-label^='Se entrega en, auto BMW M3']").fill("Mendoza");
  const guardar = page.locator("main form button[type=submit]");
  c.ok((await guardar.innerText()).includes("Guardar 1 cambio"), "Cambiar dónde se entrega cuenta como un cambio");
  await Promise.all([page.waitForURL(/editado=1/), guardar.click()]);
  c.ok((await c.texto(page)).includes("📍 Se entrega en Mendoza") && c.sql(`select entrega_direccion from public.items_viaje where id = '${bmw}'`) === "Mendoza",
    "Se guarda y se ve en el detalle");
  c.ok(await c.sinScrollHorizontal(page), "Detalle sin scroll horizontal a 375 px");
  await page.screenshot({ path: `${c.CAPTURAS}/u1-entrega-por-auto.png`, fullPage: true });

  // Nuevo viaje: el campo está en cada auto
  await page.goto(`${c.APP}/viajes/nuevo`);
  c.ok((await page.locator("input[aria-label='Se entrega en, auto 1']").count()) === 1, "Nuevo viaje tiene 'Se entrega en' por auto");
  // "Otra ruta": origen y destino con sugerencias (lugares ya usados y del mapa)
  await page.click("button:has-text('Otra ruta')");
  await page.fill("input[aria-label=Origen]", "Bue");
  await page.waitForSelector("[role=option]:has-text('Ya usado en tus tarifas')");
  await page.click("[role=option]:has-text('Buenos Aires')");
  c.ok((await page.inputValue("input[aria-label=Origen]")) === "Buenos Aires", "Nuevo viaje: el origen sugiere lugares ya usados");
  await page.locator("input[aria-label=Destino]").pressSequentially("Bari", { delay: 50 });
  await page.waitForSelector("[role=option]:has-text('San Carlos de Bariloche')");
  await page.click("[role=option]:has-text('San Carlos de Bariloche')");
  c.ok((await page.inputValue("input[aria-label=Destino]")) === "San Carlos de Bariloche, RN, Argentina", "Nuevo viaje: el destino sugiere ciudades del mapa");
  c.ok(await c.sinScrollHorizontal(page), "Nuevo viaje sin scroll horizontal a 375 px");

  // Con el teclado abierto (un campo con foco) la barra de abajo no tapa el formulario
  const barra = page.locator("[data-barra-inferior]");
  await page.locator("input[aria-label='Se entrega en, auto 1']").focus();
  await barra.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
  c.ok(!(await barra.isVisible()), "Mientras se escribe, la barra de abajo se oculta (no tapa Guardar)");
  await page.locator("input[aria-label='Se entrega en, auto 1']").blur();
  c.ok(!(await barra.isVisible()), "Justo al salir del campo la barra sigue oculta un instante (el toque no cae sobre ella)");
  await barra.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  c.ok(await barra.isVisible(), "Al dejar de escribir, la barra vuelve");

  c.ok(page.errores.length === 0, `Sin errores de JavaScript ${page.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
