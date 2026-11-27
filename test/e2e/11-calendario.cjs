// Sprint 8: calendario por unidad (2 semanas y mes), choques, bloqueos y "¿Quién está libre?".
const c = require("./comun.cjs");

const DUENO = "aaaaaaaa-0000-4000-8000-000000000001";
const viaje = (id, salida, llegada) => `select public.crear_viaje('${id}', '${salida}', ${llegada ? `'${llegada}'` : "null"}, 'Buenos Aires', 'Córdoba', null, 'ARS',
  (select id from public.unidades where nombre = 'Mosquito 1'), null, null,
  jsonb_build_array(jsonb_build_object('cliente_id', (select id from public.clientes where nombre like 'Juan Pérez%'), 'vehiculo', jsonb_build_object('marca', 'X', 'modelo', 'Y'), 'precio_centavos', 1)));`;
c.sql(`select set_config('request.jwt.claim.sub', '${DUENO}', false);
  ${viaje("77777777-2222-4000-8000-000000000001", c.dias(2), c.dias(4))}
  ${viaje("77777777-2222-4000-8000-000000000002", c.dias(4), null)}`);
const n1 = c.sql("select numero from public.viajes where id = '77777777-2222-4000-8000-000000000001'");
const n2 = c.sql("select numero from public.viajes where id = '77777777-2222-4000-8000-000000000002'");
const CAMIONETA = c.sql("select id from public.unidades where nombre = 'Camioneta'");
const fecha = (iso) => iso.split("-").reverse().join("/");
const corta = (iso) => fecha(iso).slice(0, 5);

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(page, "dueno@demo.com");

  await Promise.all([page.waitForURL(/\/calendario$/), page.click("nav[aria-label='Secciones (computadora)'] a:has-text('Calendario')")]);
  await c.texto(page);
  c.ok((await page.locator("[role=group][aria-label^='Agenda de']").count()) === 3, "Calendario: una fila por unidad");
  const barra = page.locator(`[aria-label='Agenda de Mosquito 1'] a[aria-label^='#${n1} ']`);
  const dia = await page.locator("[aria-label='Agenda de Mosquito 1'] a[aria-label^='Nuevo viaje']").first().boundingBox();
  const caja = await barra.boundingBox();
  c.ok(Math.abs(caja.width - 3 * dia.width) < 8, `El viaje #${n1} de 3 días ocupa 3 columnas`);
  c.ok((await page.locator(`a[aria-label^='#${n2} '][aria-label*='sin llegada estimada']`).count()) === 1, `El viaje #${n2} sin llegada muestra el aviso`);
  const tChoques = await page.locator("section[aria-label='Choques']").innerText();
  c.ok(tChoques.includes(`Mosquito 1: #${n1} y #${n2} (${corta(c.dias(4))})`), "Marca el choque de dos viajes en la misma unidad el mismo día");
  c.ok((await page.locator("[aria-label='Agenda de Mosquito 2'] a[aria-label^='Service']").count()) === 1, "El service de Mosquito 2 se ve como bloqueo");
  c.ok(await c.sinScrollHorizontal(page), "Calendario sin scroll horizontal a 1280 px");
  await page.screenshot({ path: `${c.CAPTURAS}/q1-calendario.png`, fullPage: true });

  await Promise.all([page.waitForURL(/vista=mes/), page.click("nav[aria-label=Vista] a:has-text('Mes completo')")]);
  const [anio, mes] = c.hoyAR.split("-").map(Number);
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  c.ok((await page.locator("[aria-label='Agenda de Camioneta'] a[aria-label^='Nuevo viaje']").count()) === diasDelMes, `Mes completo: ${diasDelMes} días`);
  await page.screenshot({ path: `${c.CAPTURAS}/q2-mes.png`, fullPage: true });
  await page.click("nav[aria-label=Vista] a:has-text('2 semanas')");
  await page.waitForURL(/vista=2s/);

  // Día libre → Nuevo viaje precargado
  await Promise.all([page.waitForURL(/\/viajes\/nuevo\?unidad=/), page.click(`a[aria-label='Nuevo viaje Camioneta ${fecha(c.dias(5))}']`)]);
  c.ok(page.url().includes(`unidad=${CAMIONETA}`) && (await page.inputValue("input[type=date]")) === c.dias(5), "Tocar un día libre abre Nuevo viaje con la unidad y la fecha");
  c.ok((await page.getByRole("button", { name: "Camioneta 1 auto" }).getAttribute("class")).includes("border-sky-700"), "La unidad ya viene elegida");

  // Bloquear con choque, y anular
  await page.goto(`${c.APP}/calendario/bloquear?desde=${c.dias(2)}`);
  await page.selectOption("select[name=que]", { label: "Mosquito 1" });
  await page.selectOption("select[name=motivo]", "vtv");
  await page.fill("input[name=hasta]", c.dias(2));
  await Promise.all([page.waitForURL(/bloqueo=1/), page.click("button:has-text('Guardar bloqueo')")]);
  c.ok((await c.texto(page)).includes(`choca con el viaje #${n1}`), "Un bloqueo encima de un viaje se guarda y avisa el choque");
  await Promise.all([page.waitForURL(/\/calendario\/bloqueos\//), page.click("[aria-label='Agenda de Mosquito 1'] a[aria-label^='VTV']")]);
  await page.fill("input[name=motivo]", "Se pasó la VTV");
  await Promise.all([page.waitForURL(/anulado=1/), page.click("button:has-text('Anular bloqueo')")]);
  c.ok((await page.locator("[aria-label='Agenda de Mosquito 1'] a[aria-label^='VTV']").count()) === 0 &&
    c.sql("select anulado_motivo from public.bloqueos_disponibilidad where motivo = 'vtv'") === "Se pasó la VTV", "Anular un bloqueo lo saca del calendario sin borrarlo");

  // Celular: ¿Quién está libre?
  const cel = await c.nuevaPagina(navegador);
  await c.entrar(cel, "dueno@demo.com");
  await Promise.all([cel.waitForURL(/\/calendario$/), cel.click("main a:has-text('¿Quién está libre?')")]);
  await Promise.all([cel.waitForURL(/dia=/), cel.click("nav[aria-label=Día] a:has-text('Mañana')")]);
  const tMan = await c.texto(cel);
  c.ok(tMan.includes(`Mosquito 2 Service hasta el ${corta(c.dias(3))}`) && tMan.includes("Camioneta Libre"), "Mañana: Mosquito 2 en service y la Camioneta libre");
  c.ok(await c.sinScrollHorizontal(cel), "¿Quién está libre? sin scroll horizontal a 375 px");
  await cel.screenshot({ path: `${c.CAPTURAS}/q3-libre-celular.png`, fullPage: true });
  await cel.goto(`${c.APP}/calendario?dia=${c.dias(3)}`);
  c.ok((await c.texto(cel)).includes(`En viaje #${n1} · Buenos Aires → Córdoba (vuelve el ${corta(c.dias(4))})`), "En viaje: dice a dónde va y cuándo vuelve");
  await cel.goto(`${c.APP}/calendario?dia=${c.dias(4)}`);
  c.ok((await c.texto(cel)).includes(`Choque: #${n1} y #${n2}`), "El choque también se ve en el celular");

  // Otra empresa
  const otra = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}/calendario`);
  await c.texto(otra);
  c.ok((await otra.locator("[role=group][aria-label^='Agenda de']").count()) === 0, "Otra empresa no ve las unidades ni la agenda de Rovirosa");
  const bloqueo = c.sql("select id from public.bloqueos_disponibilidad where motivo = 'service' limit 1");
  await otra.goto(`${c.APP}/calendario/bloqueos/${bloqueo}`);
  c.ok((await c.texto(otra)).includes("No encontramos lo que buscabas"), "Otra empresa no abre un bloqueo de Rovirosa");

  for (const p of [page, cel, otra]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
