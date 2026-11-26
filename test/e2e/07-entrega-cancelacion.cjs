// Sprint 5b: entrega por auto, cancelar con anticipo (seña o a favor) y usar el saldo a favor.
const c = require("./comun.cjs");

const DUENO = "aaaaaaaa-0000-4000-8000-000000000001";
const JUAN = "(select id from public.clientes where nombre like 'Juan Pérez%')";
// Viaje de Juan en Mosquito 1 con autos de $ 1.000.000 (marcas A1, A2, ...).
const viaje = (id, autos, salida) =>
  `select public.crear_viaje('${id}', '${salida}', null, 'Buenos Aires', 'Rosario', null, 'ARS',
     (select id from public.unidades where nombre = 'Mosquito 1'), null, null,
     (select jsonb_agg(jsonb_build_object('cliente_id', ${JUAN}, 'vehiculo', jsonb_build_object('marca', 'A' || n, 'modelo', 'Test'), 'precio_centavos', 100000000))
      from generate_series(1, ${autos}) n));`;
const auto = (v, n) => `(select i.id from public.items_viaje i join public.vehiculos x on x.id = i.vehiculo_id where i.viaje_id = '${v}' and x.marca = 'A${n}')`;
const pagar = (pago, monto, v, n) =>
  `select public.registrar_pago('${pago}', ${JUAN}, public.hoy_ar(), ${monto}, 'ARS',
     p_aplicaciones => jsonb_build_array(jsonb_build_object('item_id', ${auto(v, n)}, 'monto_centavos', ${monto})));`;

const EN_RUTA = "88888888-0000-4000-8000-000000000001";
const SENA = "88888888-0000-4000-8000-000000000002";
const FAVOR = "88888888-0000-4000-8000-000000000003";
const DESTINO = "88888888-0000-4000-8000-000000000004";
const QUITAR = "88888888-0000-4000-8000-000000000005";
c.sql(`select set_config('request.jwt.claim.sub', '${DUENO}', false);
  ${viaje(EN_RUTA, 3, c.dias(-5))}
  select public.cambiar_estado_viaje('${EN_RUTA}', 'programado', 'en_viaje');
  ${viaje(SENA, 2, c.dias(3))} ${pagar("99999999-0000-4000-8000-000000000002", 30000000, SENA, 1)}
  ${viaje(FAVOR, 1, c.dias(4))} ${pagar("99999999-0000-4000-8000-000000000003", 30000000, FAVOR, 1)}
  ${viaje(DESTINO, 1, c.dias(10))}
  ${viaje(QUITAR, 2, c.dias(6))} ${pagar("99999999-0000-4000-8000-000000000005", 10000000, QUITAR, 1)}`);
const fecha = (iso) => iso.split("-").reverse().join("/");
const entrega = (n) => c.sql(`select coalesce(fecha_entrega::text, '') from public.items_viaje where id = ${auto(EN_RUTA, n)}`);
const estado = (v) => c.sql(`select estado from public.viajes where id = '${v}'`);

(async () => {
  const navegador = await c.abrirNavegador();

  // ---------------------------------------------------------------------------
  // Entrega por auto (Rodrigo, celular)
  // ---------------------------------------------------------------------------
  const cel = await c.nuevaPagina(navegador);
  await c.entrar(cel, "dueno@demo.com");
  await cel.goto(`${c.APP}/viajes/${EN_RUTA}`);
  c.ok((await c.texto(cel)).includes("0 de 3 entregados"), "Viaje en ruta: \"0 de 3 entregados\"");
  await cel.fill("input[aria-label='Fecha de entrega del A1 Test']", c.dias(-2));
  await Promise.all([cel.waitForURL(/entregado=1/), cel.click("button[aria-label='Entregado: A1 Test']")]);
  const t1 = await c.texto(cel);
  c.ok(t1.includes("Auto entregado (1 de 3 entregados)") && entrega(1) === c.dias(-2) && estado(EN_RUTA) === "en_viaje",
    "Entregar un auto con su fecha deja el viaje En viaje (1 de 3)");
  c.ok(t1.includes(`Entregado el ${fecha(c.dias(-2))}`), "El auto muestra su fecha de entrega");
  c.ok(await c.sinScrollHorizontal(cel), "Entrega por auto sin scroll horizontal a 375 px");
  await cel.screenshot({ path: `${c.CAPTURAS}/g1-entrega-celular.png`, fullPage: true });

  await cel.goto(`${c.APP}/`);
  c.ok((await c.texto(cel)).includes("1 de 3 entregados"), "Inicio muestra \"1 de 3 entregados\"");

  await cel.goto(`${c.APP}/viajes/${EN_RUTA}`);
  c.ok((await c.texto(cel)).includes("¿Cuándo se entregaron los autos que faltan?"), "\"Marcar entregado\" aclara que completa los que faltan");
  await cel.fill("input[name=fecha_entrega]", c.hoyAR);
  await Promise.all([cel.waitForURL(/estado=entregado/), cel.click("text=Marcar entregado")]);
  c.ok(estado(EN_RUTA) === "entregado" && entrega(1) === c.dias(-2) && entrega(2) === c.hoyAR && entrega(3) === c.hoyAR,
    "Marcar entregado respeta la fecha del auto ya entregado y completa el resto con hoy");

  await Promise.all([cel.waitForURL(/entrega_deshecha=1/), cel.locator("li:has-text('A2 Test') button:has-text('Deshacer entrega')").click()]);
  c.ok(estado(EN_RUTA) === "en_viaje" && entrega(2) === "" && (await c.texto(cel)).includes("2 de 3 entregados"),
    "Deshacer la entrega de un auto vuelve el viaje a En viaje");
  await Promise.all([cel.waitForURL(/estado=entregado/), cel.click("button[aria-label='Entregado: A2 Test']")]);
  c.ok(estado(EN_RUTA) === "entregado", "Al entregar el último auto, el viaje pasa a Entregado solo");

  // ---------------------------------------------------------------------------
  // Cancelar con anticipo (computadora)
  // ---------------------------------------------------------------------------
  const page = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(page, "dueno@demo.com");
  const antes = c.porCobrar();
  await page.goto(`${c.APP}/viajes/${SENA}`);
  await page.click("button:has-text('Cancelar viaje')");
  const confirmar = page.locator("button:has-text('Sí, cancelar')");
  const tCan = await c.texto(page);
  c.ok(tCan.includes("Ya se cobró parte del viaje") && tCan.includes("Los $ 300.000 quedan como seña") && tCan.includes("quedan a favor de Juan Pérez (ficticio)"),
    "Con pagos, pregunta qué pasa con lo cobrado y explica cada opción");
  c.ok(await confirmar.isDisabled(), "No deja cancelar sin elegir");
  await page.check("input[name=opcion] >> nth=0");
  c.ok(await confirmar.isDisabled(), "Ni sin motivo");
  await page.fill("input[name=motivo]", "El cliente desistió");
  await page.screenshot({ path: `${c.CAPTURAS}/g2-cancelar.png`, fullPage: true });
  await Promise.all([page.waitForURL(/estado=cancelado/), confirmar.click()]);
  const tSena = await c.texto(page);
  c.ok(tSena.includes("Seña retenida: $ 300.000") && estado(SENA) === "cancelado" && c.porCobrar() === antes - 170_000_000,
    "Seña: el viaje queda cancelado, se retienen $ 300.000 y salen $ 1.700.000 de por cobrar");

  await page.goto(`${c.APP}/viajes/${FAVOR}`);
  await page.click("button:has-text('Cancelar viaje')");
  await page.check("input[name=opcion] >> nth=1");
  await page.fill("input[name=motivo]", "Se pasa para enero");
  await Promise.all([page.waitForURL(/estado=cancelado/), page.click("button:has-text('Sí, cancelar')")]);
  c.ok(c.sql("select a_favor_centavos from v_pagos where id = '99999999-0000-4000-8000-000000000003'") === "30000000",
    "A favor: el pago queda con $ 300.000 a favor del cliente");

  // Usar el saldo a favor
  await page.goto(`${c.APP}/cobros`);
  const tCob = await c.texto(page);
  c.ok(tCob.includes("(desaplicado: queda a favor)"), "Últimos pagos muestra la aplicación desaplicada");
  await Promise.all([page.waitForURL(/\/cobros\/usar/), page.locator("li:has-text('Juan Pérez') a:has-text('Usar saldo a favor')").click()]);
  const tUsar = await c.texto(page);
  c.ok(tUsar.includes("Usar saldo a favor") && tUsar.includes("Juan Pérez"), "Usar saldo a favor abre la pantalla del cliente");
  const aplicar = page.locator("button:has-text('Aplicar $')");
  c.ok((await aplicar.innerText()).includes("Aplicar $ 300.000"), "Sugiere aplicar los $ 300.000 del más viejo al más nuevo");
  await page.screenshot({ path: `${c.CAPTURAS}/g3-usar-saldo.png`, fullPage: true });
  await Promise.all([page.waitForURL(/usado=1/), aplicar.click()]);
  c.ok((await c.texto(page)).includes("Saldo a favor aplicado") && c.sql("select a_favor_centavos from v_pagos where id = '99999999-0000-4000-8000-000000000003'") === "0",
    "Se aplica y el pago ya no tiene saldo a favor");

  // Editar viaje: quitar un auto con pagos
  await page.goto(`${c.APP}/viajes/${QUITAR}/editar`);
  await page.locator("div:has(> div > div > p:text('A1 Test (Juan Pérez (ficticio))')) button:has-text('Quitar')").click();
  const tQ = await c.texto(page);
  c.ok(tQ.includes("Ya se cobró $ 100.000. ¿Qué pasa con esa plata?"), "Quitar un auto con pagos pregunta qué pasa con lo cobrado");
  const guardar = page.locator("main form button[type=submit]");
  c.ok(await guardar.isDisabled(), "No deja guardar sin elegir");
  await page.check("input[name^='anticipo-'] >> nth=1");
  await page.fill("input[name=motivo]", "Ese auto no viaja");
  await Promise.all([page.waitForURL(/editado=1/), guardar.click()]);
  c.ok(c.sql(`select cancelado from public.items_viaje where id = ${auto(QUITAR, 1)}`) === "t" &&
    c.sql("select a_favor_centavos from v_pagos where id = '99999999-0000-4000-8000-000000000005'") === "10000000",
    "Se quita el auto y lo cobrado queda a favor");

  // Otra empresa
  const otra = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}/cobros/usar?cliente=${c.sql(JUAN.slice(1, -1))}`);
  c.ok((await c.texto(otra)).includes("Ese cliente no tiene saldo a favor"), "Otra empresa no ve ni usa saldos de Rovirosa");

  for (const p of [cel, page, otra]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
