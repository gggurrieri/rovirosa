// Ensayo general de la demo para Rodrigo (guion de 10 minutos), en el celular y con la historia
// de demo cargada. Cuenta toques, mide qué se ve sin hacer scroll y guarda una captura de cada
// momento (lo que ve Rodrigo en la pantalla, no la página entera).
const c = require("./comun.cjs");
const { spawnSync } = require("node:child_process");

const r = spawnSync("psql", ["-q", "-v", "ON_ERROR_STOP=1", "-f", "supabase/demo/historia_6_meses.sql"], { encoding: "utf8" });
if (r.status !== 0) throw new Error(`No se pudo cargar la historia de demo: ${r.stderr}`);

const ALTO = 812; // iPhone de 375 × 812
const informe = [];
let toques = 0;
const tocar = async (page, selector) => {
  toques++;
  await page.locator(selector).first().click();
};
// Cuánto hay que bajar para ver el elemento entero (0 = se ve al abrir la pantalla)
const scrollPara = async (page, selector) => {
  const caja = await page.locator(selector).first().boundingBox();
  return Math.max(0, Math.round(caja.y + caja.height - (ALTO - 64))); // 64 px de la barra de abajo
};

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador);
  // WhatsApp no se abre en la prueba: se guarda el link que armó la app
  let linkWhatsApp = null;
  await page.context().route("https://wa.me/**", (ruta) => {
    linkWhatsApp = ruta.request().url();
    return ruta.fulfill({ status: 200, contentType: "text/html", body: "<p>WhatsApp</p>" });
  });
  await c.entrar(page, "dueno@demo.com");

  // 1:00 · Inicio: lo que te deben y lo vencido, sin buscar
  await page.goto(`${c.APP}/`);
  await c.texto(page);
  const sPorCobrar = await scrollPara(page, "main a:has-text('Por cobrar')");
  c.ok(sPorCobrar === 0, "1:00 Inicio: 'Por cobrar' y 'Vencido' se ven al abrir, sin bajar");
  // Cada monto en un solo renglón (el "$" no queda separado del número), también con una letra
  // ancha (DejaVu Sans, la de la CI; parecida a un Android con letra grande)
  const renglones = (tarjeta) =>
    page.locator(`main a:has-text('${tarjeta}') p >> nth=1`).evaluate((p) => p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight));
  for (const letra of ["la del sistema", "una letra ancha"]) {
    if (letra === "una letra ancha") await page.addStyleTag({ content: 'body, body * { font-family: "DejaVu Sans", Verdana, sans-serif !important; }' });
    for (const tarjeta of ["Por cobrar", "Vencido"]) {
      const alto = await renglones(tarjeta);
      c.ok(alto < 1.5, `1:00 Inicio: el monto de '${tarjeta}' entra en un renglón con ${letra} (${alto.toFixed(1)})`);
    }
  }
  await page.screenshot({ path: `${c.CAPTURAS}/ensayo-1-inicio.png` });
  informe.push(`Inicio: Por cobrar y Vencido a la vista (bajar ${sPorCobrar} px)`);

  // 2:30 · Para reclamar → Recordar por WhatsApp
  const sReclamar = await scrollPara(page, "section[aria-label='Para reclamar'] li");
  informe.push(`Para reclamar: el primer cliente aparece bajando ${sReclamar} px`);
  await page.locator("section[aria-label='Para reclamar']").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${c.CAPTURAS}/ensayo-2-reclamar.png` });
  const antes = toques;
  await tocar(page, "section[aria-label='Para reclamar'] button:has-text('Recordar por WhatsApp')");
  await page.waitForURL(/wa\.me|WhatsApp/, { timeout: 10000 }).catch(() => {});
  const texto = linkWhatsApp ? decodeURIComponent(new URL(linkWhatsApp).searchParams.get("text") ?? "") : "";
  c.ok(toques - antes === 1 && /\$ [\d.]+/.test(texto) && texto.includes("→"), "2:30 Recordar: 1 toque abre WhatsApp con el monto y el recorrido de cada auto");
  informe.push(`Recordatorio: ${toques - antes} toque; mensaje de ${texto.length} letras`);

  // 4:00 · Viaje en curso: 'Terminó: entregado' desde Inicio
  await page.goto(`${c.APP}/`);
  await c.texto(page);
  const boton = "main button:has-text('Terminó: entregado')";
  const hayEnCurso = (await page.locator(boton).count()) > 0;
  c.ok(hayEnCurso, "4:00 Inicio muestra el viaje en curso con su botón 'Terminó: entregado'");
  if (hayEnCurso) {
    const sBoton = await scrollPara(page, boton);
    c.ok(sBoton === 0, `4:00 Inicio: 'Terminó: entregado' se ve al abrir, sin bajar (${sBoton} px)`);
    informe.push(`Viaje en curso: el botón aparece bajando ${sBoton} px`);
    await page.locator(boton).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${c.CAPTURAS}/ensayo-3-en-curso.png` });
    const t0 = toques;
    await tocar(page, boton);
    await page.waitForSelector("text=Deshacer", { timeout: 10000 });
    c.ok(toques - t0 === 1, "4:00 Terminar un viaje: 1 toque, con Deshacer por si fue sin querer");
    // Se deshace para no cambiar la historia de la demo
    await page.locator("button:has-text('Deshacer')").first().click();
    await page.waitForLoadState("networkidle");
  }

  // 6:30 · ¿Quién está libre?
  await page.goto(`${c.APP}/`);
  await c.texto(page);
  const t1 = toques;
  await Promise.all([page.waitForURL(/\/calendario/), tocar(page, "main a:has-text('¿Quién está libre?')")]);
  await c.texto(page);
  c.ok(toques - t1 === 1 && (await page.locator("main").innerText()).includes("Mosquito"), "6:30 ¿Quién está libre?: 1 toque y se ven las unidades");
  await page.screenshot({ path: `${c.CAPTURAS}/ensayo-4-libre.png` });

  // 7:30 · Métricas → Recuperado
  const t2 = toques;
  await Promise.all([page.waitForURL(/\/metricas/), tocar(page, "nav[aria-label=Secciones] a:has-text('Métricas')")]);
  await c.texto(page);
  const sRecuperado = await scrollPara(page, "main :text('Recuperado en')");
  c.ok(toques - t2 === 1 && sRecuperado === 0, "7:30 Métricas: 1 toque y 'Recuperado' se ve sin bajar");
  await page.screenshot({ path: `${c.CAPTURAS}/ensayo-5-metricas.png` });

  // 8:30 · Lo del administrativo, en la computadora
  const pc = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(pc, "dueno@demo.com");
  await pc.goto(`${c.APP}/viajes`);
  c.ok((await c.texto(pc)).includes("Buenos Aires"), "8:30 Computadora: la grilla de viajes carga");
  await pc.goto(`${c.APP}/cobros/nuevo`);
  await c.texto(pc);
  c.ok(await c.sinScrollHorizontal(pc), "8:30 Computadora: Registrar pago se ve completo");
  await pc.screenshot({ path: `${c.CAPTURAS}/ensayo-6-compu.png` });

  informe.push(`Toques de Rodrigo en todo el guion: ${toques}`);
  console.log("\nINFORME DEL ENSAYO\n- " + informe.join("\n- "));
  for (const p of [page, pc]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
