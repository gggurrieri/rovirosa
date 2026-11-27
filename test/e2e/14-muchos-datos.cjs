// Pantallas con datos "pesados": nombres larguísimos, 40 viajes en el mes y montos de cientos de
// millones. Nada se puede salir de la pantalla ni a 375 px (Rodrigo) ni a 1280 px (administrativo).
const c = require("./comun.cjs");

const DUENO = "aaaaaaaa-0000-4000-8000-000000000001";
const LARGO = "Concesionaria Automotores Internacionales del Gran Buenos Aires Norte y Oeste Sociedad Anónima";
const CIUDAD = "San Fernando del Valle de Catamarca";
const viajes = Array.from({ length: 40 }, (_, i) => `select public.crear_viaje(gen_random_uuid(), public.hoy_ar() + ${(i % 20) - 5}, public.hoy_ar() + ${(i % 20) - 3},
  '${CIUDAD}', 'Villa General Belgrano (Calamuchita)', null, '${i % 3 ? "ARS" : "USD"}',
  (select id from public.unidades where capacidad_autos >= 2 order by nombre offset ${i % 2} limit 1), null, ${i === 0 ? `'${"Notas muy largas sin espacios: ".concat("x".repeat(180))}'` : "null"},
  jsonb_build_array(
    jsonb_build_object('cliente_id', (select id from public.clientes where nombre = '${LARGO}'), 'vehiculo', jsonb_build_object('marca', 'Mercedes-Benz', 'modelo', 'AMG GT Black Series Coupé edición limitada'), 'precio_centavos', ${i % 3 ? 99999999900 : 25000000}),
    jsonb_build_object('cliente_id', (select id from public.clientes where nombre = '${LARGO}'), 'vehiculo', jsonb_build_object('marca', 'Porsche', 'modelo', '911 GT3 RS'), 'precio_centavos', 123456789)));`).join("\n");
c.sql(`select set_config('request.jwt.claim.sub', '${DUENO}', false);
  insert into public.clientes (empresa_id, nombre) values ('00000000-0000-4000-8000-000000000001', '${LARGO}');
  ${viajes}`);
const VIAJE = c.sql("select id from public.viajes where notas like 'Notas muy largas%'");
const CLIENTE = c.sql(`select id from public.clientes where nombre = '${LARGO}'`);

const PANTALLAS = ["/", "/viajes", `/viajes/${VIAJE}`, `/viajes/${VIAJE}/editar`, "/cobros", "/cobros/nuevo", "/metricas", "/calendario",
  "/calendario?vista=mes", "/clientes", `/clientes/${CLIENTE}`, "/configuracion/tarifas", "/mas"];

(async () => {
  const navegador = await c.abrirNavegador();
  const paginas = [];
  for (const ancho of [375, 1280]) {
    const page = await c.nuevaPagina(navegador, { ancho });
    paginas.push(page);
    await c.entrar(page, "dueno@demo.com");
    for (const ruta of PANTALLAS) {
      await page.goto(`${c.APP}${ruta}`);
      await c.texto(page);
      const nombre = ruta.replace(/[^a-z]+/gi, "-").replace(/-[0-9a-f-]{20,}/, "-id").slice(0, 40) || "inicio";
      await page.screenshot({ path: `${c.CAPTURAS}/m-${ancho}${nombre}.png`, fullPage: true });
      c.ok(await c.sinScrollHorizontal(page), `${ruta.replace(/[0-9a-f-]{36}/, ":id")} sin scroll horizontal a ${ancho} px`);
    }
  }
  for (const p of paginas) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
