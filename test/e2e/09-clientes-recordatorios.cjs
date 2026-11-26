// Sprint 6: clientes, recordatorio de cobro por WhatsApp y datos para cobrar.
const c = require("./comun.cjs");

const NORTE = c.sql("select id from public.clientes where nombre like 'Concesionaria Norte%'");
const JUAN = c.sql("select id from public.clientes where nombre like 'Juan Pérez%'");
c.sql(`update public.clientes set whatsapp = null where id = '${JUAN}'`);
// Un auto del viaje #12 (en viaje) ya entregado, para la grilla
c.sql(`update public.items_viaje set fecha_entrega = public.hoy_ar() where id = (select id from public.items_viaje where viaje_id = (select id from public.viajes where numero = 12) order by id limit 1)`);

/** Intercepta el link de WhatsApp: no sale a internet, se guarda la dirección para revisarla. */
async function capturarWhatsApp(page) {
  const abiertos = [];
  await page.context().route("https://wa.me/**", (ruta) => {
    abiertos.push(ruta.request().url());
    return ruta.fulfill({ status: 200, contentType: "text/html", body: "<p>WhatsApp</p>" });
  });
  return abiertos;
}

(async () => {
  const navegador = await c.abrirNavegador();

  // Datos para cobrar (dueño, computadora)
  const page = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(page, "dueno@demo.com");
  await page.goto(`${c.APP}/mas`);
  await Promise.all([page.waitForURL(/datos-cobro$/), page.click("a:has-text('Datos para cobrar')")]);
  await page.fill("textarea[name=datos_cobro]", "Alias: rovirosa.cobros\nTitular: Rodrigo");
  c.ok((await page.locator("section[aria-label='Vista previa']").innerText()).includes("Podés transferir a:\nAlias: rovirosa.cobros"), "La vista previa muestra el mensaje con los datos para transferir");
  await Promise.all([page.waitForURL(/guardado=1/), page.click("button:has-text('Guardar')")]);
  c.ok(c.sql("select datos_cobro from public.empresas where id = '00000000-0000-4000-8000-000000000001'").startsWith("Alias: rovirosa.cobros"), "Se guardan los datos para cobrar");

  // Para reclamar en Inicio (Rodrigo, celular): Recordar abre WhatsApp con el mensaje listo
  const cel = await c.nuevaPagina(navegador);
  const abiertos = await capturarWhatsApp(cel);
  await c.entrar(cel, "dueno@demo.com");
  const tInicio = await c.texto(cel);
  c.ok(tInicio.includes("Para reclamar") && tInicio.includes("Concesionaria Norte (ficticia) $ 2.700.000"), "Inicio: \"Para reclamar\" con Concesionaria Norte y sus $ 2.700.000 vencidos");
  await Promise.all([cel.waitForURL(/wa\.me/), cel.locator("section[aria-label='Para reclamar'] li:has-text('Concesionaria Norte') button:has-text('Recordar por WhatsApp')").click()]);
  const url = new URL(abiertos[0]);
  const texto = url.searchParams.get("text") ?? "";
  c.ok(url.pathname === "/5491100000000", `Abre WhatsApp con el número del cliente (${url.pathname})`);
  c.ok(texto.startsWith("Hola Concesionaria Norte, te escribo de Rovirosa (demo). Te recuerdo el saldo de $ 2.700.000") && texto.includes("Alias: rovirosa.cobros"),
    "El mensaje lleva el saludo, el saldo en formato argentino y los datos para transferir");
  c.ok(c.sql(`select count(*) from public.recordatorios where cliente_id = '${NORTE}'`) === "1", "El recordatorio queda registrado");
  await cel.goto(`${c.APP}/`);
  await c.texto(cel);
  c.ok(await c.sinScrollHorizontal(cel), "Inicio con \"Para reclamar\" sin scroll horizontal a 375 px");
  await cel.screenshot({ path: `${c.CAPTURAS}/c1-reclamar-celular.png`, fullPage: true });

  // Cliente sin WhatsApp: no se registra nada y se ofrece cargarlo
  await cel.goto(`${c.APP}/cobros`);
  await cel.locator(`li:has(a[href='/clientes/${JUAN}']) button:has-text('Recordar por WhatsApp')`).click();
  await cel.waitForSelector("form [role=alert]");
  c.ok((await cel.locator("form [role=alert]").first().innerText()).includes("Falta el WhatsApp del cliente") &&
    c.sql(`select count(*) from public.recordatorios where cliente_id = '${JUAN}'`) === "0", "Sin WhatsApp: avisa, ofrece cargarlo y no registra nada");

  // Lista y ficha de clientes (computadora)
  c.sql("insert into public.clientes (empresa_id, nombre) values ('00000000-0000-4000-8000-000000000001', 'juan perez')");
  await page.goto(`${c.APP}/`);
  await Promise.all([page.waitForURL(/\/clientes$/), page.click("nav[aria-label='Secciones (computadora)'] a:has-text('Clientes')")]);
  const tLista = await c.texto(page);
  c.ok(tLista.includes("Clientes (7)") && (await page.locator("li:has-text('Posible duplicado')").count()) === 2, "Lista de clientes, con aviso de posible duplicado");
  c.ok((await page.locator("li:has-text('Concesionaria Norte')").innerText()).includes("Último recordatorio: hoy"), "La lista muestra el último recordatorio");
  await page.click("a:has-text('Con deuda')");
  await page.waitForURL(/ver=deudores/);
  c.ok((await c.texto(page)).includes(`Clientes (${c.sql("select count(*) from v_clientes where saldo_ars > 0 or saldo_usd > 0")})`), "Filtro \"Con deuda\"");
  await page.screenshot({ path: `${c.CAPTURAS}/c2-clientes.png`, fullPage: true });

  await Promise.all([page.waitForURL(/\/clientes\/[0-9a-f-]{36}$/), page.click("a:has-text('Concesionaria Norte')")]);
  const tFicha = await c.texto(page);
  c.ok(tFicha.includes("Debe $ 2.700.000") && tFicha.includes("Vencido $ 2.700.000") && tFicha.includes("Recordatorios"), "Ficha: deuda, vencido y recordatorios");
  c.ok(await c.sinScrollHorizontal(page), "Ficha sin scroll horizontal a 1280 px");
  await page.screenshot({ path: `${c.CAPTURAS}/c3-ficha.png`, fullPage: true });
  await page.fill("input[name=whatsapp]", "123");
  await page.click("form#contacto button:has-text('Guardar')");
  await page.waitForSelector("form#contacto [role=alert]");
  c.ok((await page.locator("form#contacto [role=alert]").innerText()).includes("Revisá el WhatsApp"), "Un WhatsApp inválido no se guarda");
  await page.fill("input[name=whatsapp]", "11 5555-1234");
  await Promise.all([page.waitForURL(/guardado=1/), page.click("form#contacto button:has-text('Guardar')")]);
  c.ok(c.sql(`select whatsapp from public.clientes where id = '${NORTE}'`) === "5491155551234", "El WhatsApp se guarda en formato internacional");

  // Grilla: avance de entregas
  await page.goto(`${c.APP}/viajes?q=12`);
  c.ok((await c.texto(page)).includes("1/2 entregados"), "La grilla muestra \"1/2 entregados\" en el viaje en curso");

  // Otra empresa
  const otra = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}/clientes/${NORTE}`);
  c.ok((await c.texto(otra)).includes("No encontramos lo que buscabas"), "Otra empresa no abre la ficha de un cliente de Rovirosa");

  for (const p of [page, cel, otra]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
