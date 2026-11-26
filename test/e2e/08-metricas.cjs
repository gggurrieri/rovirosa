// Métricas de cobranza con gráficos, con la historia de demo de 5 meses cargada.
const c = require("./comun.cjs");
const { spawnSync } = require("node:child_process");

const r = spawnSync("psql", ["-q", "-v", "ON_ERROR_STOP=1", "-f", "supabase/demo/historia_6_meses.sql"], { encoding: "utf8" });
if (r.status !== 0) throw new Error(`No se pudo cargar la historia de demo: ${r.stderr}`);

(async () => {
  const navegador = await c.abrirNavegador();

  // Computadora
  const page = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(page, "dueno@demo.com");
  await page.goto(`${c.APP}/`);
  await Promise.all([page.waitForURL(/\/metricas$/), page.click("a:has-text('Ver métricas con gráficos')")]);
  const t = await c.texto(page);
  c.ok(t.includes(`Por cobrar ${c.plata(c.porCobrar())}`) && t.includes(`Vencido ${c.plata(c.vencido())}`), "Resumen: por cobrar y vencido iguales a los de Inicio");
  for (const titulo of ["Recuperado por mes", "Facturado y cobrado por mes", "Antigüedad de la deuda", "Días de cobro por mes", "Quién debe más"]) {
    c.ok((await page.locator(`section[aria-label='${titulo}']`).count()) === 1, `Gráfico: ${titulo}`);
  }
  c.ok((await page.locator("section[aria-label='Facturado y cobrado por mes'] [title*='Facturado']").count()) === 6, "Facturado y cobrado: una barra por mes con su tooltip");
  await page.locator("section[aria-label='Recuperado por mes'] summary").click();
  c.ok((await page.locator("section[aria-label='Recuperado por mes'] tbody tr").count()) === 6, "\"Ver los números\" abre la tabla de los 6 meses");
  const columnas = await page.locator("section[aria-label='Recuperado por mes']").boundingBox();
  const lineas = await page.locator("section[aria-label='Facturado y cobrado por mes']").boundingBox();
  c.ok(lineas.x > columnas.x + columnas.width / 2, "En la computadora, gráficos en dos columnas");
  c.ok(await c.sinScrollHorizontal(page), "Métricas sin scroll horizontal a 1280 px");
  await page.screenshot({ path: `${c.CAPTURAS}/m1-metricas.png`, fullPage: true });
  const primero = page.locator("section[aria-label='Quién debe más'] a").first();
  await Promise.all([page.waitForURL(/\/cobros\/nuevo\?cliente=/), primero.click()]);
  c.ok(true, "Tocar un cliente lleva a registrar su pago");

  // Celular
  const cel = await c.nuevaPagina(navegador);
  await c.entrar(cel, "dueno@demo.com");
  await Promise.all([cel.waitForURL(/\/metricas$/), cel.click("nav[aria-label=Secciones] a:has-text('Métricas')")]);
  await c.texto(cel);
  c.ok(await c.sinScrollHorizontal(cel), "Métricas sin scroll horizontal a 375 px (barra inferior con 5 secciones)");
  await cel.screenshot({ path: `${c.CAPTURAS}/m2-metricas-celular.png`, fullPage: true });

  // Otra empresa
  const otra = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}/metricas`);
  c.ok((await c.texto(otra)).includes("Todavía no hay viajes ni pagos para mostrar"), "Otra empresa no ve las métricas de Rovirosa");

  for (const p of [page, cel, otra]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
