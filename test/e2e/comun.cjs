// Ayudas compartidas por las pruebas de punta a punta.
const { chromium } = require("playwright");
const { spawnSync } = require("node:child_process");

const APP = process.env.APP_URL ?? "http://localhost:3100";
const CAPTURAS = process.env.CAPTURAS ?? require("node:os").tmpdir();

/** Consulta a la base de pruebas como superusuario (para calcular lo esperado). */
function sql(consulta) {
  const r = spawnSync("psql", ["-Atc", consulta], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql: ${r.stderr}`);
  return r.stdout.trim();
}

const hoyAR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
function dias(n) {
  const d = new Date(`${hoyAR}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const plata = (c) => `$ ${new Intl.NumberFormat("es-AR", { useGrouping: "always" }).format(c / 100)}`;
const porCobrar = () => Number(sql("select coalesce(sum(saldo_centavos) filter (where estado_cobro <> 'cancelado'),0) from v_items_saldo"));
const vencido = () => Number(sql("select coalesce(sum(saldo_centavos) filter (where vencido),0) from v_items_saldo"));

let fallas = 0;
function ok(condicion, mensaje) {
  console.log(`${condicion ? "✅" : "❌"} ${mensaje}`);
  if (!condicion) fallas++;
}

async function abrirNavegador() {
  return chromium.launch();
}

async function nuevaPagina(navegador, { ancho = 375 } = {}) {
  const movil = ancho < 768;
  const ctx = await navegador.newContext({
    viewport: { width: ancho, height: movil ? 812 : 900 },
    deviceScaleFactor: 2,
    isMobile: movil,
    hasTouch: movil,
    locale: "es-AR",
  });
  const page = await ctx.newPage();
  page.errores = [];
  page.on("pageerror", (e) => page.errores.push(e.message));
  return page;
}

async function entrar(page, email, password = "demo1234") {
  await page.goto(`${APP}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  // Espera a que el login termine: o sale de /login, o aparece el mensaje de error.
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }),
    // Solo el error del formulario: Next.js tiene su propio role=alert para anunciar páginas.
    page.waitForSelector("form [role=alert]", { timeout: 15000 }),
  ]);
}

/** Texto visible de la pantalla, esperando a que no quede ningún "Cargando". */
async function texto(page) {
  await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 15000 });
  return (await page.locator("main").innerText()).replace(/\s+/g, " ");
}

const sinScrollHorizontal = async (page) =>
  (await page.evaluate(() => document.documentElement.scrollWidth)) <= page.viewportSize().width;

function terminar() {
  console.log(fallas === 0 ? "TODO OK" : `${fallas} FALLA(S)`);
  process.exit(fallas ? 1 : 0);
}

module.exports = { APP, CAPTURAS, sql, hoyAR, dias, plata, porCobrar, vencido, ok, abrirNavegador, nuevaPagina, entrar, texto, sinScrollHorizontal, terminar };
