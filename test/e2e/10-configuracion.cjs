// Sprint 7: Configuración (tarifas, importar desde Excel, unidades, choferes, empresa).
const c = require("./comun.cjs");

const DUENO = "aaaaaaaa-0000-4000-8000-000000000001";
const CORDOBA = c.sql("select id from public.tarifas where origen = 'Buenos Aires' and destino = 'Córdoba'");
// Viaje programado de 3 autos en Mosquito 1, para probar que no se achica la unidad
c.sql(`select set_config('request.jwt.claim.sub', '${DUENO}', false);
  select public.crear_viaje(gen_random_uuid(), public.hoy_ar() + 5, null, 'Buenos Aires', 'Rosario', null, 'ARS',
    (select id from public.unidades where nombre = 'Mosquito 1'), null, null,
    (select jsonb_agg(jsonb_build_object('cliente_id', (select id from public.clientes where nombre like 'Juan Pérez%'), 'vehiculo', jsonb_build_object('marca', 'M' || g, 'modelo', 'X'), 'precio_centavos', 1)) from generate_series(1, 3) g));`);
const viaje3 = c.sql("select max(numero) from public.viajes");

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(page, "dueno@demo.com");
  const guardar = (texto) => page.locator(`main form button[type=submit]:has-text('${texto}')`);

  await Promise.all([page.waitForURL(/\/configuracion$/), page.click("nav[aria-label='Secciones (computadora)'] a:has-text('Configuración')")]);
  const tIndice = await c.texto(page);
  c.ok(["Tarifas", "Unidades", "Choferes", "Empresa"].every((t) => tIndice.includes(t)), "Configuración: tarifas, unidades, choferes y empresa");

  // Tarifas
  await page.goto(`${c.APP}/configuracion/tarifas/nueva`);
  await page.fill("input[name=origen]", "Buenos Aires");
  await page.fill("input[name=destino]", "Bahía Blanca");
  await page.fill("input[name=km]", "650");
  await page.fill("input[name=precio]", "1.200.000");
  await Promise.all([page.waitForURL(/guardada=1/), guardar("Guardar tarifa").click()]);
  c.ok((await c.texto(page)).includes("Buenos Aires → Bahía Blanca 650 km $ 1.200.000"), "Nueva tarifa guardada y en la lista");
  await page.goto(`${c.APP}/viajes/nuevo`);
  await page.click("text=Ver todas las rutas");
  c.ok((await c.texto(page)).includes("Buenos Aires → Bahía Blanca"), "La tarifa nueva aparece en Nuevo viaje");

  await page.goto(`${c.APP}/configuracion/tarifas/nueva`);
  await page.fill("input[name=origen]", " buenos aires");
  await page.fill("input[name=destino]", "BAHIA BLANCA");
  await page.fill("input[name=km]", "650");
  await page.fill("input[name=precio]", "1");
  await guardar("Guardar tarifa").click();
  await page.waitForSelector("main form [role=alert]");
  c.ok((await page.locator("main form [role=alert]").innerText()).includes("Ya hay una tarifa de"), "Una ruta repetida (sin tildes ni mayúsculas) se rechaza");

  const antes = c.sql(`select sum(precio_centavos) from public.items_viaje where viaje_id in (select id from public.viajes where tarifa_id = '${CORDOBA}')`);
  await page.goto(`${c.APP}/configuracion/tarifas/${CORDOBA}`);
  await page.fill("input[name=precio]", "1.000.000");
  await Promise.all([page.waitForURL(/guardada=1/), guardar("Guardar tarifa").click()]);
  c.ok(c.sql(`select precio_base_centavos from public.tarifas where id = '${CORDOBA}'`) === "100000000" &&
    c.sql(`select sum(precio_centavos) from public.items_viaje where viaje_id in (select id from public.viajes where tarifa_id = '${CORDOBA}')`) === antes,
    "Cambiar el precio no toca los viajes ya cargados");

  // Importar desde Excel
  const plantilla = await page.request.get(`${c.APP}/configuracion/tarifas/plantilla`);
  const bytes = Buffer.from(await plantilla.body());
  c.ok(plantilla.headers()["content-type"].startsWith("text/csv") && bytes[0] === 0xef, "Se baja la planilla de ejemplo (CSV para Excel)");
  await page.goto(`${c.APP}/configuracion/tarifas/importar`);
  await page.click("summary:has-text('O pegá las filas acá')");
  await page.fill("textarea[aria-label='Filas de tarifas']", "Origen;Destino;Km;Precio\nBuenos Aires;Rosario;300;700.000\nRosario;Santa Fe;0;100");
  const tErr = await c.texto(page);
  c.ok(tErr.includes("Fila 3: Los km tienen que ser un número mayor que cero.") && (await guardar("Importar").isDisabled()), "Importar: marca la fila con problemas y no deja confirmar");
  await page.fill("textarea[aria-label='Filas de tarifas']", "Origen;Destino;Km;Precio\nBuenos Aires;Rosario;300;700.000\nRosario;Santa Fe;170;400.000");
  c.ok((await page.locator("section[aria-label='Vista previa'] tbody tr").count()) === 2, "Importar: vista previa con 2 tarifas");
  await page.screenshot({ path: `${c.CAPTURAS}/k1-importar.png`, fullPage: true });
  await Promise.all([page.waitForURL(/creadas=/), guardar("Importar 2 tarifas").click()]);
  c.ok((await c.texto(page)).includes("Importación lista: 1 tarifa nueva y 1 actualizada"), "Importar: crea la nueva y actualiza la existente");

  // Unidades
  const mosquito1 = c.sql("select id from public.unidades where nombre = 'Mosquito 1'");
  await page.goto(`${c.APP}/configuracion/unidades/${mosquito1}`);
  await page.fill("input[name=capacidad]", "2");
  await guardar("Guardar unidad").click();
  await page.waitForSelector("main form [role=alert]");
  c.ok((await page.locator("main form [role=alert]").innerText()).includes(`El viaje #${viaje3} lleva 3 autos`), "No se achica una unidad por debajo de un viaje programado");
  await page.uncheck("input[name=activa]");
  c.ok((await c.texto(page)).includes("viajes por delante") || (await c.texto(page)).includes("viaje por delante"), "Al desactivarla avisa los viajes que tiene por delante");

  // Choferes
  const choferA = c.sql("select id from public.choferes where nombre = 'Chofer A'");
  await page.goto(`${c.APP}/configuracion/choferes/${choferA}`);
  await page.uncheck("input[name=activo]");
  c.ok((await c.texto(page)).includes("Deja de ser el chofer habitual de su unidad"), "Al desactivar un chofer avisa que deja de ser habitual");
  await Promise.all([page.waitForURL(/guardado=1/), guardar("Guardar chofer").click()]);
  c.ok(c.sql(`select count(*) from public.unidades where chofer_habitual_id = '${choferA}'`) === "0", "El chofer desactivado ya no es habitual de ninguna unidad");

  // Empresa: días para vencer con vista previa
  await page.goto(`${c.APP}/configuracion/empresa`);
  await page.fill("input[name=dias]", "30");
  await page.waitForSelector("section[aria-label='Qué cambia']");
  const tPrevia = await page.locator("section[aria-label='Qué cambia']").innerText();
  c.ok(tPrevia.includes("Si pasás de 7 a 30 días"), "Cambiar los días para vencer muestra qué cambia antes de guardar");
  await page.screenshot({ path: `${c.CAPTURAS}/k2-empresa.png`, fullPage: true });
  await Promise.all([page.waitForURL(/guardada=1/), guardar("Guardar").click()]);
  await page.goto(`${c.APP}/`);
  c.ok((await c.texto(page)).includes(`Vencido ${c.plata(c.vencido())}`) && c.sql("select dias_vencimiento from public.empresas where id = '00000000-0000-4000-8000-000000000001'") === "30",
    "Con 30 días, Inicio recalcula lo vencido");

  // Celular
  const cel = await c.nuevaPagina(navegador);
  await c.entrar(cel, "dueno@demo.com");
  await cel.goto(`${c.APP}/mas`);
  await Promise.all([cel.waitForURL(/\/configuracion$/), cel.click("main a:has-text('Configuración')")]);
  await cel.goto(`${c.APP}/configuracion/tarifas`);
  await c.texto(cel);
  c.ok(await c.sinScrollHorizontal(cel), "Tarifas sin scroll horizontal a 375 px");
  await cel.screenshot({ path: `${c.CAPTURAS}/k3-tarifas-celular.png`, fullPage: true });

  // Otra empresa
  const otra = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}/configuracion/tarifas/${CORDOBA}`);
  c.ok((await c.texto(otra)).includes("No encontramos lo que buscabas"), "Otra empresa no abre una tarifa de Rovirosa");

  for (const p of [page, cel, otra]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
