// Sprint 4b: el puesto de la computadora (1280 px) y la grilla de viajes.
const c = require("./comun.cjs");

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(page, "dueno@demo.com");

  const filas = () => page.locator("main table tbody tr");
  const totales = async () => (await page.locator("section[aria-label=Totales]").innerText()).replace(/\s+/g, " ");
  const aplicar = async (url) => Promise.all([page.waitForURL(url), page.getByRole("button", { name: "Aplicar" }).click()]);
  const numeros = async () => (await page.locator("table tbody tr td:first-child").allInnerTexts()).map((n) => n.trim());
  const caja = async (sel) => page.locator(sel).first().boundingBox();

  // Estructura: menú lateral, sin barra inferior, Inicio en dos columnas
  await page.goto(`${c.APP}/`);
  await c.texto(page);
  c.ok(await page.locator("nav[aria-label='Secciones (computadora)']").isVisible(), "Menú lateral visible a 1280 px");
  c.ok(!(await page.locator("nav[aria-label=Secciones]").isVisible()), "Sin barra inferior a 1280 px");
  const resultados = await caja("section[aria-label='Resultados del mes']");
  const enCurso = await caja("h2:text-matches('^En curso')");
  c.ok(enCurso.x > resultados.x + resultados.width / 2, "Inicio en dos columnas: resultados a la izquierda, viajes a la derecha");
  c.ok(await c.sinScrollHorizontal(page), "Inicio sin scroll horizontal a 1280 px");
  await page.screenshot({ path: `${c.CAPTURAS}/e1-inicio.png` });

  // Cobros en dos columnas y Registrar pago con el comprobante a la derecha
  await page.goto(`${c.APP}/cobros`);
  await c.texto(page);
  const deben = await caja("h2:text('Quién me debe')");
  const pagos = await caja("h2:text('Últimos pagos')");
  c.ok(pagos.x > deben.x + 200 && Math.abs(pagos.y - deben.y) < 10, "Cobros en dos columnas");
  await page.goto(`${c.APP}/cobros/nuevo`);
  await page.click("button:has-text('Concesionaria Norte')");
  await page.fill("#monto", "2.000.000");
  await page.evaluate(async () => {
    const lienzo = Object.assign(document.createElement("canvas"), { width: 300, height: 200 });
    lienzo.getContext("2d").fillRect(0, 0, 300, 200);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/png"));
    const datos = new DataTransfer();
    datos.items.add(new File([blob], "captura.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: datos, bubbles: true }));
  });
  await page.waitForSelector("img[alt='Vista previa del comprobante']");
  const monto = await caja("#monto");
  const vista = await caja("img[alt='Vista previa del comprobante']");
  c.ok(vista.x > monto.x + monto.width, "Registrar pago: comprobante pegado (Ctrl+V) y a la derecha del formulario");
  await page.screenshot({ path: `${c.CAPTURAS}/e2-registrar-pago.png` });

  // Criterio 1: grilla sin filtros
  await page.goto(`${c.APP}/viajes`);
  await c.texto(page);
  c.ok((await filas().count()) === 12, "Grilla: 12 viajes");
  c.ok((await totales()).includes("12 viajes Facturado $ 22.250.000 Saldo $ 8.700.000"), "Totales: $ 22.250.000 facturado y $ 8.700.000 de saldo");
  // La tabla no debe cortar las columnas de plata (se desplazaría dentro de su recuadro
  // sin que la página tenga scroll: por eso se mide contra el recuadro, no contra la página).
  const recuadro = await caja("main table");
  const contenedor = await page.locator("main table").first().evaluate((t) => t.parentElement.getBoundingClientRect().right);
  const saldoCol = await caja("th:has-text('Saldo')");
  c.ok(saldoCol.x + saldoCol.width <= contenedor + 1 && recuadro.x + recuadro.width <= contenedor + 1,
    "A 1280 px se ven completas Facturado y Saldo, sin cortar la tabla");
  c.ok(await c.sinScrollHorizontal(page), "Grilla sin scroll horizontal a 1280 px");
  await page.screenshot({ path: `${c.CAPTURAS}/e3-grilla.png`, fullPage: true });

  // Criterio 2: unidad
  await page.selectOption("select[name=unidad]", { label: "Mosquito 2" });
  await aplicar(/unidad=/);
  await c.texto(page);
  c.ok((await filas().count()) === 4 && (await totales()).includes("Facturado $ 11.700.000"), "Mosquito 2: 4 viajes, $ 11.700.000");

  // Criterio 3: cliente (solo sus autos)
  await page.goto(`${c.APP}/viajes`);
  await page.selectOption("select[name=cliente]", { label: "Concesionaria Norte (ficticia)" });
  await aplicar(/cliente=/);
  await c.texto(page);
  const t3 = await totales();
  c.ok((await numeros()).join(",") === "4,3,1" && t3.includes("Facturado $ 3.650.000") && t3.includes("autos de Concesionaria Norte"),
    `Concesionaria Norte: viajes #4, #3 y #1 y $ 3.650.000 de sus autos (${(await numeros()).join(",")})`);

  // Criterio 4: cobro con saldo
  await page.goto(`${c.APP}/viajes`);
  await page.selectOption("select[name=cobro]", "con_saldo");
  await aplicar(/cobro=con_saldo/);
  await c.texto(page);
  c.ok((await filas().count()) === 6 && (await totales()).includes("Saldo $ 8.700.000"), "Con saldo: 6 viajes, $ 8.700.000");

  // Criterio 7: orden por saldo
  await Promise.all([page.waitForURL(/orden=saldo/), page.click("th a:has-text('Saldo')")]);
  await c.texto(page);
  c.ok((await numeros())[0] === "7" && (await page.locator("th[aria-sort=descending]").innerText()).includes("Saldo"), "Orden por saldo: primero el #7");

  // Criterio 8: abrir un viaje y volver conserva filtros y orden
  const conFiltros = page.url();
  await Promise.all([page.waitForURL(/\/viajes\/[0-9a-f-]{36}$/), filas().first().click()]);
  c.ok((await c.texto(page)).includes("#7"), "Clic en la fila abre el viaje #7");
  await page.goBack();
  await page.waitForURL(conFiltros);
  await c.texto(page);
  c.ok((await filas().count()) === 6 && (await numeros())[0] === "7", "\"Atrás\" vuelve con los filtros y el orden");
  const otraPestana = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otraPestana, "dueno@demo.com");
  await otraPestana.goto(conFiltros);
  await c.texto(otraPestana);
  c.ok((await otraPestana.locator("table tbody tr").count()) === 6, "Un link copiado abre la misma vista filtrada");

  // Criterio 9: exportar lo filtrado
  const exportar = page.locator("a:has-text('Exportar a Excel')");
  const href = await exportar.getAttribute("href");
  c.ok(href === `/viajes/exportar?${new URL(conFiltros).search.slice(1)}`, "Exportar usa los mismos filtros que la grilla");
  const archivo = await page.request.get(`${c.APP}${href}`);
  const csv = await archivo.text();
  const bytes = Buffer.from(await archivo.body());
  const lineas = csv.replace(/^﻿/, "").split("\r\n");
  c.ok(archivo.headers()["content-type"].startsWith("text/csv") && /attachment; filename="viajes-\d{4}-\d{2}-\d{2}\.csv"/.test(archivo.headers()["content-disposition"]),
    "Se descarga como archivo viajes-AAAA-MM-DD.csv");
  c.ok(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, "El CSV empieza con la marca UTF-8 (acentos bien en Excel)");
  c.ok(lineas.length === 7 && lineas[1].startsWith("7;") && lineas[1].includes(";3200000;"), "CSV: encabezado + 6 viajes, primero el #7 con 3200000 (número que Excel suma)");
  c.ok(csv.includes("Córdoba"), "CSV con tildes");

  // Criterio 5 y 6: texto y fechas (invertidas)
  await page.goto(`${c.APP}/viajes?q=rosario`);
  await c.texto(page);
  c.ok((await filas().count()) === 3, "Texto \"rosario\": 3 viajes");
  await page.goto(`${c.APP}/viajes?desde=2026-11-10&hasta=2026-11-01`);
  const t6 = await c.texto(page);
  c.ok((await filas().count()) === 5 && t6.includes("Las fechas estaban al revés"), "Salida del 01/11 al 10/11: 5 viajes, avisando que las fechas estaban al revés");

  // Sin resultados
  await page.goto(`${c.APP}/viajes?q=zzzz`);
  const t0 = await c.texto(page);
  c.ok(t0.includes("No hay viajes con esos filtros") && t0.includes("No hay viajes para exportar"), "Sin resultados: mensaje, Limpiar filtros y sin exportar");
  c.ok(page.errores.length === 0, `Sin errores de JavaScript ${page.errores.join(" ")}`);

  // Celular: los mismos filtros, plegados
  const movil = await c.nuevaPagina(navegador);
  await c.entrar(movil, "dueno@demo.com");
  await movil.goto(`${c.APP}/viajes`);
  await c.texto(movil);
  c.ok(!(await movil.locator("select[name=unidad]").isVisible()), "Celular: filtros plegados");
  await movil.click("button:has-text('Filtrar')");
  await movil.selectOption("select[name=unidad]", { label: "Mosquito 2" });
  await Promise.all([movil.waitForURL(/unidad=/), movil.getByRole("button", { name: "Aplicar" }).click()]);
  await c.texto(movil);
  c.ok((await movil.locator("main ul li").count()) === 4 && (await movil.locator("button:has-text('Filtrar (1 filtro)')").count()) === 1,
    "Celular: filtrar por Mosquito 2 deja 4 tarjetas y dice \"Filtrar (1 filtro)\"");
  c.ok(await c.sinScrollHorizontal(movil), "Viajes con filtros sin scroll horizontal a 375 px");
  await movil.screenshot({ path: `${c.CAPTURAS}/e4-filtros-celular.png`, fullPage: true });

  // Criterio 13: otra empresa
  const otra = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}${conFiltros.replace(c.APP, "")}`);
  c.ok((await c.texto(otra)).includes("No hay viajes con esos filtros"), "Otra empresa: con el link filtrado de Rovirosa no ve nada");
  const ajeno = await otra.request.get(`${c.APP}/viajes/exportar`);
  const csvAjeno = await ajeno.text();
  c.ok(ajeno.headers()["content-type"].startsWith("text/csv") && csvAjeno === `﻿${lineas[0]}`,
    "Otra empresa: la exportación es un CSV con solo el encabezado");

  await navegador.close();
  c.terminar();
})();
