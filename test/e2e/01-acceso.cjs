// Sprint 1: login, datos visibles por empresa y pantallas base.
const c = require("./comun.cjs");

(async () => {
  const navegador = await c.abrirNavegador();

  const fallido = await c.nuevaPagina(navegador);
  await fallido.goto(`${c.APP}/viajes`);
  c.ok(new URL(fallido.url()).pathname === "/login", "Sin sesión, /viajes redirige a /login");
  await c.entrar(fallido, "dueno@demo.com", "mala");
  c.ok((await c.texto(fallido)).includes("El email o la contraseña no son correctos."), "Contraseña incorrecta: mensaje claro");

  const dueno = await c.nuevaPagina(navegador);
  await c.entrar(dueno, "dueno@demo.com");
  let t = await c.texto(dueno);
  c.ok(t.includes(`Por cobrar ${c.plata(c.porCobrar())}`) && t.includes("Por cobrar $ 8.700.000"), "Inicio: $ 8.700.000 por cobrar");
  c.ok(t.includes(`Vencido ${c.plata(c.vencido())}`), `Inicio: vencido ${c.plata(c.vencido())} (calculado a la fecha de hoy)`);
  await dueno.goto(`${c.APP}/viajes`);
  await c.texto(dueno);
  c.ok((await dueno.locator("main li").count()) === 12, "Viajes: los 12 viajes del seed");
  c.ok(await c.sinScrollHorizontal(dueno), "Viajes sin scroll horizontal a 375 px");
  await dueno.goto(`${c.APP}/mas`);
  await Promise.all([dueno.waitForURL(/\/login/), dueno.click("text=Cerrar sesión")]);
  await dueno.goto(`${c.APP}/viajes`);
  c.ok(new URL(dueno.url()).pathname === "/login", "Cerrar sesión: vuelve a pedir login");

  const otra = await c.nuevaPagina(navegador);
  await c.entrar(otra, "otra@demo.com");
  t = await c.texto(otra);
  c.ok(t.includes("Por cobrar $ 0"), "Otra empresa: $ 0 por cobrar");
  await otra.goto(`${c.APP}/viajes`);
  c.ok((await c.texto(otra)).includes("Todavía no hay viajes cargados"), "Otra empresa: no ve viajes de Rovirosa");

  const sinPerfil = await c.nuevaPagina(navegador);
  await c.entrar(sinPerfil, "sinperfil@demo.com");
  c.ok((await c.texto(sinPerfil)).includes("Tu usuario no tiene una empresa asignada"), "Sin perfil: aviso en vez de datos");

  const chofer = await c.nuevaPagina(navegador);
  await c.entrar(chofer, "chofer@demo.com");
  c.ok((await c.texto(chofer)).includes("Todavía no tenés acceso a esta sección"), "Chofer: aviso en vez de datos");

  for (const p of [fallido, dueno, otra, sinPerfil, chofer]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
