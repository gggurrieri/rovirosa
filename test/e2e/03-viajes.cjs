// Sprint 3: cargar viajes y seguir su estado.
const c = require("./comun.cjs");

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador);
  await c.entrar(page, "dueno@demo.com");
  const guardar = () => Promise.all([page.waitForURL(/\/viajes\/[0-9a-f-]{36}\?creado=1/), page.click("button[type=submit]")]);
  const idDeLaUrl = () => page.url().match(/viajes\/([0-9a-f-]{36})/)[1];

  // Viaje simple: rutas frecuentes, precio de la tarifa y chofer habitual
  const autoRuiz = c.sql("select marca || ' ' || modelo from vehiculos v join clientes c on c.id = v.cliente_id where c.nombre like 'Colección Ruiz%' order by v.id limit 1");
  await page.goto(`${c.APP}/viajes`);
  await page.click("text=Nuevo viaje");
  await page.waitForURL(/viajes\/nuevo/);
  const rutas = await page.locator("section:has(h2:text('Ruta')) button").allInnerTexts();
  c.ok(rutas[0].startsWith("Buenos Aires → Rosario") && rutas.includes("Ver todas las rutas (8)") && rutas.length === 6,
    `Las 4 rutas más usadas primero (${rutas[0].split("\n")[0]}) y "Ver todas las rutas (8)"`);
  await page.click("button:has-text('Buenos Aires → Córdoba')");
  await page.fill("input[type=date]", c.dias(2));
  await page.click("button:has-text('Mosquito 1')");
  c.ok((await page.locator("select").inputValue()) === c.sql("select id from choferes where nombre = 'Chofer A'"), "Mosquito 1 preselecciona a Chofer A");
  await page.fill("input[aria-label='Cliente del auto 1']", "juan");
  await page.click("button:has-text('Juan Pérez')");
  await page.fill("input[aria-label='Marca del auto 1']", "Ford");
  await page.fill("input[aria-label='Modelo del auto 1']", "Mustang");
  c.ok((await page.inputValue("input[aria-label='Precio del auto 1']")) === "950.000", "Precio de la tarifa: 950.000");
  await page.click("text=+ Agregar otro auto");
  await page.fill("input[aria-label='Cliente del auto 2']", "ruiz");
  await page.click("button:has-text('Colección Ruiz')");
  await page.click(`button:has-text('${autoRuiz}')`);
  c.ok(await c.sinScrollHorizontal(page), "Nuevo viaje sin scroll horizontal a 375 px");
  const resumen = await page.locator("button[type=submit]").innerText();
  c.ok(resumen.includes("2 autos") && resumen.includes("$ 1.900.000"), `Resumen en el botón: "${resumen}"`);
  await guardar();
  let t = await c.texto(page);
  c.ok(t.includes("Viaje #13 guardado") && t.includes("Programado"), "Viaje #13 guardado como Programado");
  const viaje13 = idDeLaUrl();
  await page.goto(`${c.APP}/`);
  t = await c.texto(page);
  c.ok(t.includes("Por cobrar $ 10.600.000"), `Tablero: ${t.match(/Por cobrar \$ [\d.]+/)?.[0]}`);
  c.ok(t.includes("Próximos 7 días (1)"), "Inicio: Próximos 7 días (1)");

  // Doble envío y viaje con fecha pasada
  const antes = Number(c.sql("select count(*) from viajes"));
  await page.goto(`${c.APP}/viajes/nuevo`);
  await page.click("button:has-text('Buenos Aires → Rosario')");
  await page.click("button:has-text('Mosquito 2')");
  c.ok((await page.locator("select").inputValue()) === c.sql("select id from choferes where nombre = 'Chofer B'"), "Mosquito 2 preselecciona a Chofer B");
  await page.fill("input[type=date]", c.dias(-12));
  await page.fill("input[aria-label='Cliente del auto 1']", "juan");
  await page.click("button:has-text('Juan Pérez')");
  await page.click("button:has-text('Ford Mustang')");
  let envio = null;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/viajes/nuevo")) envio ??= { url: r.url(), headers: r.headers(), body: r.postDataBuffer() };
  });
  await guardar();
  const repetido = await page.request.post(envio.url, { headers: envio.headers, data: envio.body, maxRedirects: 0 });
  const cuerpo = await repetido.text();
  c.ok(Number(c.sql("select count(*) from viajes")) === antes + 1, "Doble envío: un solo viaje");
  c.ok(/creado=1/.test(cuerpo + JSON.stringify(repetido.headers())), "El reintento se toma como éxito");
  c.ok((await c.texto(page)).includes("Ford Mustang"), "Reusa el auto que el cliente ya trajo");
  const viajePasado = idDeLaUrl();

  // Estados: entregado hace 10 días → vencido; deshacer
  const vencidoAntes = c.vencido();
  await page.click("text=Marcar en retiro");
  await page.waitForURL(/estado=en_retiro/);
  c.ok((await c.texto(page)).includes("Estado actualizado: En retiro."), "Confirma el cambio de estado");
  await page.click("text=Marcar en viaje");
  await page.waitForURL(/estado=en_viaje/);
  await page.fill("input[name=fecha_entrega]", c.dias(-10));
  await page.click("text=Marcar entregado");
  await page.waitForURL(/estado=entregado/);
  t = await c.texto(page);
  c.ok(t.includes("Vencido") && t.includes(`Entregado el ${c.dias(-10).split("-").reverse().join("/")}`), "El auto aparece Vencido con su fecha de entrega");
  c.ok(c.vencido() === vencidoAntes + 65_000_000, `Vencido sube ${c.plata(65_000_000)}`);
  await page.goto(`${c.APP}/`);
  c.ok((await c.texto(page)).includes(`Vencido ${c.plata(c.vencido())}`), "Inicio muestra el vencido nuevo");
  await page.goto(`${c.APP}/viajes/${viajePasado}`);
  await page.click("text=Deshacer: volver a En viaje");
  await page.waitForURL(/estado=en_viaje/);
  c.ok(c.vencido() === vencidoAntes && !(await c.texto(page)).includes("Entregado el"), "Deshacer: deja de estar vencido");

  // Ruta sin tarifa, cliente nuevo y capacidad de la Camioneta
  await page.goto(`${c.APP}/viajes/nuevo`);
  await page.click("text=Otra ruta…");
  await page.fill("input[aria-label=Origen]", "Rosario");
  await page.fill("input[aria-label=Destino]", "Tandil");
  await page.click("button:has-text('Camioneta')");
  await page.click("text=+ Cliente nuevo");
  await page.fill("input[aria-label='Nombre del cliente nuevo (auto 1)']", "juan perez");
  c.ok((await c.texto(page)).includes("¿Es Juan Pérez (ficticio)? Usar ese cliente"), "Avisa si el cliente nuevo se parece a uno existente");
  await page.fill("input[aria-label='Nombre del cliente nuevo (auto 1)']", "Ana Nueva");
  await page.fill("input[aria-label='WhatsApp del cliente nuevo (auto 1)']", "11 5555-0000");
  await page.fill("input[aria-label='Marca del auto 1']", "BMW");
  await page.fill("input[aria-label='Modelo del auto 1']", "M3");
  await page.fill("input[aria-label='Precio del auto 1']", "500000");
  c.ok(await page.locator("button:has-text('Camioneta está completo')").isDisabled(), "Camioneta: no deja agregar un segundo auto");
  await guardar();
  const viajeAna = idDeLaUrl();
  await page.goto(`${c.APP}/cobros`);
  c.ok((await c.texto(page)).includes("Ana Nueva $ 500.000"), "El cliente nuevo aparece en Quién me debe");

  // Avisos de unidad ocupada o bloqueada, y precio $ 0
  await page.goto(`${c.APP}/viajes/nuevo`);
  await page.click("button:has-text('Buenos Aires → Córdoba')");
  await page.fill("input[type=date]", c.dias(2));
  await page.click("button:has-text('Mosquito 1')");
  t = await c.texto(page);
  c.ok(t.includes("Mosquito 1 ya tiene el viaje #13") && t.includes("Podés guardar igual"), "Avisa que Mosquito 1 ya tiene el viaje #13");
  await page.click("button:has-text('Mosquito 2')");
  c.ok((await c.texto(page)).includes("Mosquito 2 está en service"), "Avisa que Mosquito 2 está en service");
  await page.fill("input[aria-label='Cliente del auto 1']", "juan");
  await page.click("button:has-text('Juan Pérez')");
  await page.click("button:has-text('Ford Mustang')");
  await page.fill("input[aria-label='Precio del auto 1']", "0");
  c.ok(await page.locator("button[type=submit]").isDisabled(), "Con precio $ 0 no guarda sin confirmar");
  await page.click("text=Confirmo que hay un auto a $ 0");
  c.ok(await page.locator("button[type=submit]").isEnabled(), "Confirmando, se puede guardar");

  // Cancelar un viaje sin pagos
  const antesCancelar = c.porCobrar();
  await page.goto(`${c.APP}/viajes/${viajeAna}`);
  await page.click("text=Cancelar viaje");
  await Promise.all([page.waitForURL(/estado=cancelado/), page.click("text=Sí, cancelar")]);
  c.ok(c.porCobrar() === antesCancelar - 50_000_000 && (await c.texto(page)).includes("Cancelado"), "Cancelar saca el viaje de lo por cobrar");
  await page.goto(`${c.APP}/viajes/${c.sql("select id from viajes where numero = 1")}`);
  c.ok(!(await c.texto(page)).includes("Cancelar viaje"), "Un viaje ya entregado no ofrece cancelar");
  c.ok(page.errores.length === 0, `Sin errores de JavaScript ${page.errores.join(" ")}`);

  // Otra empresa
  const otra = await c.nuevaPagina(navegador);
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}/viajes`);
  c.ok((await c.texto(otra)).includes("Todavía no hay viajes cargados"), "Otra empresa no ve viajes de Rovirosa");
  await otra.goto(`${c.APP}/viajes/${viaje13}`);
  c.ok((await c.texto(otra)).includes("No encontramos lo que buscabas"), "Otra empresa no abre un viaje de Rovirosa con el link");
  await otra.goto(`${c.APP}/viajes/nuevo`);
  t = await c.texto(otra);
  c.ok(!t.includes("Mosquito") && !t.includes("Córdoba"), "Otra empresa no ve unidades ni tarifas de Rovirosa");

  await navegador.close();
  c.terminar();
})();
