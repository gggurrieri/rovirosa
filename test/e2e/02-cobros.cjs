// Sprint 2: registrar y anular cobros con sugerencia automática.
const c = require("./comun.cjs");

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador);
  await c.entrar(page, "dueno@demo.com");

  // Quién me debe: primero los que tienen vencidos
  await page.goto(`${c.APP}/cobros`);
  await c.texto(page);
  const primera = await page.locator("section:has(h2:text('Quién me debe')) li").first().innerText();
  c.ok(primera.includes("Vencido"), `Primero un cliente con vencidos: ${primera.split("\n")[0]}`);
  c.ok(await c.sinScrollHorizontal(page), "Cobros sin scroll horizontal a 375 px");

  // Pago de $ 2.000.000 de Concesionaria Norte desde su tarjeta: sugerencia #3 completo y #4 parcial
  const vencidoAntes = c.vencido();
  await page.click("text=Concesionaria Norte");
  await page.waitForURL(/cobros\/nuevo\?cliente=/);
  await page.fill("#monto", "2.000.000");
  const sugeridos = await page
    .locator("input[aria-label^='Monto para el viaje']")
    .evaluateAll((els) => els.map((e) => `${e.getAttribute("aria-label").replace("Monto para el viaje ", "#")}=${e.value}`));
  c.ok(sugeridos.join(",") === "#3=1.400.000,#4=600.000", `Sugerencia: ${sugeridos.join(", ")}`);
  c.ok(await c.sinScrollHorizontal(page), "Formulario sin scroll horizontal a 375 px");
  await Promise.all([page.waitForURL(/cobros\?registrado=/), page.click("button[type=submit]")]);
  c.ok((await c.texto(page)).includes("Pago registrado"), "Aviso de pago registrado");
  await page.goto(`${c.APP}/`);
  let t = await c.texto(page);
  c.ok(t.includes("Por cobrar $ 6.700.000") && t.includes(`Vencido ${c.plata(vencidoAntes - 200_000_000)}`),
    `Tablero: ${t.match(/Por cobrar \$ [\d.]+/)?.[0]} · ${t.match(/Vencido \$ [\d.]+/)?.[0]}`);

  // Pago de más de Juan Pérez, buscando el cliente
  await page.goto(`${c.APP}/cobros/nuevo`);
  await page.fill("input[type=search]", "juan");
  await page.click("button:has-text('Juan Pérez')");
  await page.fill("#monto", "1000000");
  c.ok((await c.texto(page)).includes("Queda a favor del cliente $ 50.000"), "Muestra $ 50.000 a favor antes de confirmar");
  await Promise.all([page.waitForURL(/cobros\?registrado=/), page.click("button[type=submit]")]);
  c.ok((await c.texto(page)).includes("Juan Pérez (ficticio) $ 1.000.000 #9: $ 950.000 A favor: $ 50.000"), "Últimos pagos: Juan Pérez con $ 50.000 a favor");

  // Ajuste manual y no cobrar de más (Autos del Sur debe $ 3.200.000)
  await page.goto(`${c.APP}/cobros/nuevo`);
  await page.click("button:has-text('Autos del Sur')");
  await page.fill("#monto", "1.000.000");
  const campo = page.locator("input[aria-label='Monto para el viaje 7']");
  await campo.fill("4.000.000");
  c.ok((await c.texto(page)).includes("Al viaje #7 le aplicaste $ 4.000.000, pero debe $ 3.200.000."), "Avisa si se aplica más que la deuda del auto");
  c.ok(await page.locator("button[type=submit]").isDisabled(), "No deja confirmar con un error");
  await campo.fill("300.000");
  t = await c.texto(page);
  c.ok(t.includes("Se aplica $ 300.000") && t.includes("Queda a favor del cliente $ 700.000"), "Monto manual: aplica $ 300.000 y deja $ 700.000 a favor");
  await page.locator("input[type=checkbox]").first().uncheck();
  t = await c.texto(page);
  c.ok(t.includes("Se aplica $ 0") && t.includes("Queda a favor del cliente $ 1.000.000"), "Destildar el auto deja todo a favor");

  // Doble envío del mismo formulario (Equipo Rally Andino)
  const antes = Number(c.sql("select count(*) from pagos"));
  await page.goto(`${c.APP}/cobros/nuevo`);
  await page.click("button:has-text('Equipo Rally Andino')");
  await page.fill("#monto", "650.000");
  let envio = null;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/cobros/nuevo")) envio ??= { url: r.url(), headers: r.headers(), body: r.postDataBuffer() };
  });
  await Promise.all([page.waitForURL(/cobros\?registrado=/), page.click("button[type=submit]")]);
  const repetido = await page.request.post(envio.url, { headers: envio.headers, data: envio.body, maxRedirects: 0 });
  const respuesta = await repetido.text();
  c.ok(!respuesta.includes("ya no tiene saldo") && /registrado=/.test(respuesta + JSON.stringify(repetido.headers())), "El reintento se toma como éxito");
  c.ok(Number(c.sql("select count(*) from pagos")) === antes + 1, "Doble envío: se guardó un solo pago");

  // Anular el pago de Concesionaria Norte
  const pagoNorte = c.sql("select id from pagos where monto_centavos = 200000000");
  // Lo vencido antes de anular depende de la fecha (los pagos de arriba pueden caer en autos
  // vencidos o no): se toma de la base. Anular tiene que devolver exactamente los $ 2.000.000.
  const vencidoAntesDeAnular = c.vencido();
  await page.goto(`${c.APP}/cobros/pagos/${pagoNorte}/anular`);
  await page.click("button[type=submit]");
  await page.waitForTimeout(300);
  c.ok(page.url().includes("/anular"), "Sin motivo no anula (el navegador pide completarlo)");
  await page.fill("textarea[name=motivo]", "Lo cargué con el monto equivocado");
  await Promise.all([page.waitForURL(/cobros\?anulado=/), page.click("button[type=submit]")]);
  t = await c.texto(page);
  c.ok(t.includes("Pago anulado") && t.includes("Anulado: Lo cargué con el monto equivocado"), "Pago anulado visible con su motivo");
  await page.goto(`${c.APP}/`);
  t = await c.texto(page);
  c.ok(t.includes("Por cobrar $ 7.100.000") && c.vencido() === vencidoAntesDeAnular + 200_000_000 && t.includes(`Vencido ${c.plata(c.vencido())}`),
    "Tras anular, el vencido vuelve ($ 2.000.000 más) y queda $ 7.100.000 por cobrar");
  await page.goto(`${c.APP}/cobros/pagos/${pagoNorte}/anular`);
  c.ok((await c.texto(page)).includes("Este pago ya está anulado"), "No ofrece anular dos veces");
  c.ok(page.errores.length === 0, `Sin errores de JavaScript ${page.errores.join(" ")}`);

  // Otra empresa
  const otra = await c.nuevaPagina(navegador);
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}/cobros`);
  t = await c.texto(otra);
  c.ok(t.includes("Nadie te debe nada") && t.includes("Todavía no hay pagos cargados"), "Otra empresa no ve deudas ni pagos de Rovirosa");
  await otra.goto(`${c.APP}/cobros/pagos/${pagoNorte}/anular`);
  t = await c.texto(otra);
  c.ok(t.includes("No encontramos lo que buscabas") && !t.includes("Concesionaria"), "Otra empresa no ve un pago de Rovirosa aunque tenga el link");
  await otra.goto(`${c.APP}/cualquier-cosa`);
  c.ok((await otra.locator("body").innerText()).includes("No encontramos"), "Página inexistente en español");

  await navegador.close();
  c.terminar();
})();
