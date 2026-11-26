// Sprint 4a: Inicio "Hoy" de Rodrigo y comprobante de transferencia.
const c = require("./comun.cjs");

const DUENO = "aaaaaaaa-0000-4000-8000-000000000001";
/** Crea un viaje como el dueño (con RLS y las reglas de la base) y devuelve su número. */
function crearViaje(fechaSalida, destino) {
  return Number(c.sql(`set role authenticated; set request.jwt.claim.sub = '${DUENO}';
    select (public.crear_viaje(gen_random_uuid(), '${fechaSalida}', null, 'Buenos Aires', '${destino}', null, 'ARS',
      (select id from public.unidades where nombre = 'Camioneta'), null, null,
      jsonb_build_array(jsonb_build_object('cliente_id', (select id from public.clientes where nombre like 'Juan Pérez%'),
        'vehiculo', jsonb_build_object('marca', 'Fiat', 'modelo', '600'), 'precio_centavos', 100000)))) ->> 'numero'`)
    .split("\n")
    .pop()); // psql imprime "SET" por cada configuración: el número es la última línea
}
const cobradoDelMes = () =>
  Number(c.sql("select coalesce(sum(monto_centavos), 0) from pagos where anulado_en is null and date_trunc('month', fecha) = date_trunc('month', public.hoy_ar())"));

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador);
  await c.entrar(page, "dueno@demo.com");

  // Criterio 1: resultados de noviembre con los datos del seed
  await page.goto(`${c.APP}/?mes=2026-11`);
  let t = await c.texto(page);
  c.ok(t.includes("Noviembre 2026") && t.includes("Facturado $ 22.250.000") && t.includes("Cobrado $ 13.550.000") && t.includes("Viajes 12"),
    "Noviembre: $ 22.250.000 facturado, $ 13.550.000 cobrado, 12 viajes");
  c.ok(/Recuperado Cobrado de autos que ya estaban vencidos \$ 0/.test(t), "Noviembre: $ 0 recuperado");
  c.ok(await c.sinScrollHorizontal(page), "Inicio sin scroll horizontal a 375 px");
  await page.screenshot({ path: `${c.CAPTURAS}/h1-resultados.png`, fullPage: true });

  // Criterio 6 y H5: mes sin movimientos, y no se navega al futuro
  await page.click("[aria-label='Mes anterior']");
  await page.waitForURL(/mes=2026-10/);
  c.ok((await c.texto(page)).includes("Octubre 2026 › Sin viajes este mes."), "Octubre: \"Sin viajes este mes\"");
  await page.goto(`${c.APP}/`);
  await c.texto(page);
  c.ok((await page.locator("[aria-label='Mes siguiente']").count()) === 0, "En el mes actual no hay flecha al mes siguiente");

  // Criterios 2 y 7: pago de Concesionaria Norte (vencida) con comprobante pegado (Ctrl+V)
  const cobradoAntes = cobradoDelMes();
  await page.goto(`${c.APP}/cobros`);
  await page.click("text=Concesionaria Norte");
  await page.waitForURL(/cobros\/nuevo\?cliente=/);
  await page.fill("#monto", "2.000.000");
  await page.evaluate(async () => {
    const lienzo = Object.assign(document.createElement("canvas"), { width: 200, height: 120 });
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#0369a1";
    ctx.fillRect(0, 0, 200, 120);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/png"));
    const datos = new DataTransfer();
    datos.items.add(new File([blob], "captura.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: datos, bubbles: true }));
  });
  await page.waitForSelector("img[alt='Vista previa del comprobante']");
  c.ok(true, "Pegar con Ctrl+V muestra la vista previa del comprobante");
  c.ok(await c.sinScrollHorizontal(page), "Registrar pago con comprobante sin scroll horizontal a 375 px");
  await page.screenshot({ path: `${c.CAPTURAS}/h2-comprobante.png`, fullPage: true });
  await Promise.all([page.waitForURL(/cobros\?registrado=/), page.click("button[type=submit]")]);
  const pagoNorte = c.sql("select id from pagos where monto_centavos = 200000000");
  const ruta = c.sql(`select comprobante_path from pagos where id = '${pagoNorte}'`);
  c.ok(ruta === `00000000-0000-4000-8000-000000000001/${pagoNorte}/comprobante.png`, `El pago guardó su comprobante en la carpeta de la empresa (${ruta})`);
  c.ok(c.sql(`select count(*) from storage.objects where name = '${ruta}'`) === "1", "El archivo está en Storage");
  await page.goto(`${c.APP}/`);
  t = await c.texto(page);
  c.ok(/Recuperado Cobrado de autos que ya estaban vencidos \$ 2\.000\.000/.test(t), "Recuperado del mes: $ 2.000.000");
  c.ok(t.includes(`Cobrado ${c.plata(cobradoAntes + 200_000_000)}`), "Cobrado del mes sube $ 2.000.000");

  // Criterio 9: ver el comprobante con un link que vence a los 5 minutos
  await page.goto(`${c.APP}/cobros`);
  await c.texto(page);
  const verLink = page.locator(`a[href='/cobros/pagos/${pagoNorte}/comprobante']`);
  c.ok((await verLink.count()) === 1, "Últimos pagos: \"Ver comprobante\" en el pago de Concesionaria Norte");
  const redireccion = await page.request.get(`${c.APP}/cobros/pagos/${pagoNorte}/comprobante`, { maxRedirects: 0 });
  const destino = redireccion.headers()["location"] ?? "";
  const tokenFirmado = new URL(destino).searchParams.get("token") ?? "";
  const vence = JSON.parse(Buffer.from(tokenFirmado, "base64url").toString()).exp - Date.now() / 1000;
  c.ok(redireccion.status() >= 300 && redireccion.status() < 400 && Math.abs(vence - 300) < 30, `Redirige a un link firmado que vence en ${Math.round(vence)} s`);
  const archivo = await page.request.get(destino);
  c.ok(archivo.status() === 200 && archivo.headers()["content-type"] === "image/png", "El link abre la imagen");
  const vencido = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(tokenFirmado, "base64url").toString()), exp: Math.floor(Date.now() / 1000) - 1 })).toString("base64url");
  const conLinkVencido = await page.request.get(destino.replace(tokenFirmado, vencido));
  c.ok(conLinkVencido.status() === 400, "Un link vencido ya no abre el comprobante");

  // Criterios 8, 10 y 11: agregar el comprobante después, con archivo; validaciones
  const pagoSinComprobante = c.sql("select id from pagos where comprobante_path is null and anulado_en is null order by fecha desc, id limit 1");
  await page.goto(`${c.APP}/cobros/pagos/${pagoSinComprobante}/adjuntar`);
  await page.setInputFiles("input[name=comprobante]", { name: "enorme.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(6 * 1024 * 1024, 1) });
  c.ok((await c.texto(page)).includes("El comprobante pesa más de 5 MB"), "Más de 5 MB: mensaje claro y no se adjunta");
  await page.setInputFiles("input[name=comprobante]", { name: "cosas.zip", mimeType: "application/zip", buffer: Buffer.from("PK") });
  c.ok((await c.texto(page)).includes("tiene que ser una imagen (captura o foto) o un PDF"), "Tipo no permitido: mensaje claro");
  await page.setInputFiles("input[name=comprobante]", { name: "transferencia.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  c.ok((await c.texto(page)).includes("📄 transferencia.pdf"), "Adjuntar un PDF desde archivo lo muestra listo para guardar");
  await Promise.all([page.waitForURL(/cobros\?comprobante=/), page.click("button[type=submit]")]);
  c.ok((await c.texto(page)).includes("Comprobante agregado al pago."), "Comprobante agregado a un pago ya cargado");
  c.ok(c.sql(`select comprobante_path from pagos where id = '${pagoSinComprobante}'`).endsWith("/comprobante.pdf"), "El pago quedó con su PDF");

  // Criterios 3, 4 y 5: atrasados, "Empezó el viaje", Deshacer y "Terminó"
  const numeroHoy = crearViaje(c.hoyAR, "Tandil");
  const numeroAtrasado = crearViaje(c.dias(-1), "Pinamar");
  await page.goto(`${c.APP}/`);
  t = await c.texto(page);
  c.ok(t.includes("Atrasados (1)") && t.includes(`#${numeroAtrasado}`) && t.includes("debía salir y no empezó"), `Atrasados: #${numeroAtrasado} debía salir ayer`);
  await page.screenshot({ path: `${c.CAPTURAS}/h3-hoy.png`, fullPage: true });
  const tarjeta = () => page.locator("li", { hasText: `#${numeroHoy} · hoy` });
  await Promise.all([page.waitForURL(/hecho=/), tarjeta().getByRole("button", { name: "Empezó el viaje" }).click()]);
  t = await c.texto(page);
  c.ok(t.includes(`Viaje #${numeroHoy}: en viaje.`) && c.sql(`select estado from viajes where numero = ${numeroHoy}`) === "en_viaje", "Empezó el viaje: pasa a En viaje con aviso");
  await Promise.all([page.waitForURL(/hacia=programado/), page.getByRole("button", { name: "Deshacer" }).click()]);
  c.ok(c.sql(`select estado from viajes where numero = ${numeroHoy}`) === "programado", "Deshacer lo devuelve a Programado");
  await c.texto(page);
  await Promise.all([page.waitForURL(/hacia=en_viaje/), tarjeta().getByRole("button", { name: "Empezó el viaje" }).click()]);
  await c.texto(page);
  await Promise.all([page.waitForURL(/hacia=entregado/), tarjeta().getByRole("button", { name: "Terminó: entregado" }).click()]);
  t = await c.texto(page);
  c.ok(t.includes(`Viaje #${numeroHoy}: entregado.`) && c.sql(`select distinct fecha_entrega from items_viaje i join viajes v on v.id = i.viaje_id where v.numero = ${numeroHoy}`) === c.hoyAR,
    "Terminó: entregado con la fecha de hoy");
  c.ok((await tarjeta().count()) === 0, "Ya no aparece en En curso ni en Próximos");
  c.ok(page.errores.length === 0, `Sin errores de JavaScript ${page.errores.join(" ")}`);

  // Criterio 12: otra empresa no ve el comprobante, ni con el link directo
  const otra = await c.nuevaPagina(navegador);
  await c.entrar(otra, "otra@demo.com");
  const ajeno = await otra.request.get(`${c.APP}/cobros/pagos/${pagoNorte}/comprobante`, { maxRedirects: 0 });
  c.ok(ajeno.status() === 404, `Otra empresa no abre el comprobante de Rovirosa (HTTP ${ajeno.status()})`);
  t = await c.texto(await (async () => { await otra.goto(`${c.APP}/`); return otra; })());
  c.ok(t.includes("Sin viajes este mes.") && t.includes("Por cobrar $ 0"), "Otra empresa no ve resultados de Rovirosa");

  await navegador.close();
  c.terminar();
})();
