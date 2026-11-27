// Adopción: el primer uso del día queda anotado (una sola vez) y el dueño lo ve en Más → Usuarios.
const c = require("./comun.cjs");
const DUENO = "aaaaaaaa-0000-4000-8000-000000000001";

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador);
  await c.entrar(page, "dueno@demo.com");
  for (const ruta of ["/", "/viajes", "/cobros", "/metricas"]) {
    await page.goto(`${c.APP}${ruta}`);
    await c.texto(page);
  }
  c.ok(c.sql(`select count(*) from public.accesos where user_id = '${DUENO}' and dia = public.hoy_ar()`) === "1", "Usar varias pantallas en el día anota UN solo día de uso");
  c.ok(c.sql("select count(*) from public.accesos") === "1", "Solo se anota quien usó la app");

  // Mismo usuario en otro navegador el mismo día: sigue siendo un día
  const otro = await c.nuevaPagina(navegador);
  await c.entrar(otro, "dueno@demo.com");
  await otro.goto(`${c.APP}/viajes`);
  await c.texto(otro);
  c.ok(c.sql(`select count(*) from public.accesos where user_id = '${DUENO}'`) === "1", "Entrar desde otro celular el mismo día no duplica");

  await page.goto(`${c.APP}/mas/usuarios`);
  const t = await c.texto(page);
  c.ok(t.includes("Usó la app 1 de los últimos 7 días · último ingreso hoy"), "Más → Usuarios muestra cuántos días usó la app cada uno");
  c.ok(t.includes("Todavía no usó la app"), "Y quién todavía no la usó");
  c.ok(await c.sinScrollHorizontal(page), "Usuarios sin scroll horizontal a 375 px");
  await page.screenshot({ path: `${c.CAPTURAS}/v1-adopcion.png`, fullPage: true });

  for (const p of [page, otro]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
