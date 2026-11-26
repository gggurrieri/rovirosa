// Sprint 5a: editar un viaje (con historial y bloqueo optimista) y alta de usuarios por invitación.
const c = require("./comun.cjs");

const DUENO = "aaaaaaaa-0000-4000-8000-000000000001";
// Viaje programado de prueba: Audi (con $ 600.000 cobrados) y BMW, en Mosquito 1.
const VIAJE = "55555555-0000-4000-8000-000000000001";
c.sql(`select set_config('request.jwt.claim.sub', '${DUENO}', false);
  select public.crear_viaje('${VIAJE}', public.hoy_ar() + 5, null, 'Buenos Aires', 'Rosario', null, 'ARS',
    (select id from public.unidades where nombre = 'Mosquito 1'), null, null,
    jsonb_build_array(
      jsonb_build_object('cliente_id', (select id from public.clientes where nombre like 'Juan Pérez%'), 'vehiculo', jsonb_build_object('marca', 'Audi', 'modelo', 'R8'), 'precio_centavos', 100000000),
      jsonb_build_object('cliente_id', (select id from public.clientes where nombre like 'Juan Pérez%'), 'vehiculo', jsonb_build_object('marca', 'BMW', 'modelo', 'M3'), 'precio_centavos', 90000000)));
  select public.registrar_pago(gen_random_uuid(), (select id from public.clientes where nombre like 'Juan Pérez%'), public.hoy_ar(), 60000000, 'ARS',
    p_aplicaciones => jsonb_build_array(jsonb_build_object('item_id',
      (select i.id from public.items_viaje i join public.vehiculos v on v.id = i.vehiculo_id where i.viaje_id = '${VIAJE}' and v.marca = 'Audi'), 'monto_centavos', 60000000)));`);
const numero = c.sql(`select numero from public.viajes where id = '${VIAJE}'`);
const entregado = c.sql("select id from public.viajes where numero = 2"); // entregado, un solo auto
const fecha = (iso) => iso.split("-").reverse().join("/");

(async () => {
  const navegador = await c.abrirNavegador();
  const page = await c.nuevaPagina(navegador, { ancho: 1280 });
  page.on("dialog", (d) => d.accept());
  await c.entrar(page, "dueno@demo.com");
  const guardar = () => page.locator("main form button[type=submit]");

  // Criterio 1 y 2: editar la fecha de un viaje programado
  await page.goto(`${c.APP}/viajes/${VIAJE}`);
  await c.texto(page);
  await Promise.all([page.waitForURL(/\/editar$/), page.click("a:has-text('Editar viaje')")]);
  c.ok((await page.inputValue("input[name=origen]")) === "Buenos Aires" && (await page.inputValue("input[name=fecha_salida]")) === c.dias(5),
    "Editar abre el formulario con los datos del viaje");
  c.ok((await guardar().innerText()).includes("Sin cambios") && (await guardar().isDisabled()), "Sin tocar nada no deja guardar");
  await page.fill("input[name=fecha_salida]", c.dias(7));
  c.ok((await guardar().innerText()).includes("Guardar 1 cambio"), "El botón cuenta los cambios");
  await page.screenshot({ path: `${c.CAPTURAS}/f1-editar.png`, fullPage: true });
  await Promise.all([page.waitForURL(/editado=1/), guardar().click()]);
  const t2 = await c.texto(page);
  c.ok(t2.includes(`Viaje #${numero} actualizado (1 cambio)`) && t2.includes(fecha(c.dias(7))), "Se guarda la fecha nueva y avisa");
  await page.goto(`${c.APP}/viajes?q=${numero}`);
  c.ok((await c.texto(page)).includes(fecha(c.dias(7))), "La grilla muestra la fecha nueva");

  // Criterio 3: el precio no baja de lo cobrado
  await page.goto(`${c.APP}/viajes/${VIAJE}/editar`);
  await page.fill("input[aria-label^='Precio del Audi']", "500.000");
  const t3 = await c.texto(page);
  c.ok(t3.includes("Ya se cobraron $ 600.000 del Audi R8") && (await guardar().isDisabled()), "Bajar el precio por debajo de lo cobrado avisa y no deja guardar");
  c.ok((await page.locator("button:has-text('Quitar')").count()) === 1 && t3.includes("Tiene pagos"), "Solo se puede quitar el auto sin pagos");

  // Criterio 5: dos pestañas editando el mismo viaje
  const otraPestana = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otraPestana, "dueno@demo.com");
  await otraPestana.goto(`${c.APP}/viajes/${VIAJE}/editar`);
  await page.goto(`${c.APP}/viajes/${VIAJE}/editar`);
  await page.fill("input[aria-label^='Precio del BMW']", "950.000");
  await Promise.all([page.waitForURL(/editado=1/), guardar().click()]);
  await otraPestana.fill("textarea[name=notas]", "Esto no se tiene que guardar");
  await otraPestana.locator("main form button[type=submit]").click();
  await otraPestana.waitForSelector("form [role=alert]");
  c.ok((await otraPestana.locator("form [role=alert]").innerText()).includes("El viaje cambió mientras lo editabas"),
    "La segunda pestaña ve \"El viaje cambió mientras lo editabas\"");
  c.ok(c.sql(`select coalesce(notas, '') from public.viajes where id = '${VIAJE}'`) === "" &&
    c.sql(`select precio_centavos from public.items_viaje i join public.vehiculos v on v.id = i.vehiculo_id where viaje_id = '${VIAJE}' and v.marca = 'BMW'`) === "95000000",
    "No pisó el cambio de la primera pestaña");

  // Criterio 4 y 6: viaje entregado, precio con motivo, historial
  await page.goto(`${c.APP}/viajes/${entregado}/editar`);
  await c.texto(page);
  c.ok((await page.isDisabled("input[name=fecha_salida]")) && (await page.isDisabled("input[name=origen]")) && !(await page.isDisabled("textarea[name=notas]")),
    "Entregado: fecha y ruta bloqueadas, notas editables");
  const precioEntregado = page.locator("input[aria-label^='Precio del']").first();
  await precioEntregado.fill("700.000");
  c.ok((await c.texto(page)).includes("Escribí el motivo del cambio de precio") && (await guardar().isDisabled()), "Entregado: el precio pide motivo");
  await page.fill("input[name=motivo]", "Se sumó un peaje");
  await Promise.all([page.waitForURL(/editado=1/), guardar().click()]);
  await page.click("summary:has-text('Historial de cambios')");
  const t6 = await c.texto(page);
  c.ok(t6.includes("Precio del Mercedes-Benz AMG GT (Juan Pérez (ficticio)): $ 650.000 → $ 700.000") && t6.includes("Motivo: Se sumó un peaje") && t6.includes("Gabi"),
    "El historial muestra el cambio de precio con antes, después, quién y motivo");
  await page.goto(`${c.APP}/viajes/${VIAJE}`);
  await page.click("summary:has-text('Historial de cambios')");
  const tHist = await c.texto(page);
  c.ok(tHist.includes(`Salida: ${fecha(c.dias(5))} → ${fecha(c.dias(7))}`) && tHist.includes("Creó el viaje"), "Historial del viaje: creación y cambio de fecha");
  await page.screenshot({ path: `${c.CAPTURAS}/f2-historial.png`, fullPage: true });

  // Celular: editar sin scroll horizontal
  const movil = await c.nuevaPagina(navegador);
  await c.entrar(movil, "dueno@demo.com");
  await movil.goto(`${c.APP}/viajes/${VIAJE}/editar`);
  await c.texto(movil);
  c.ok(await c.sinScrollHorizontal(movil), "Editar viaje sin scroll horizontal a 375 px");
  await movil.screenshot({ path: `${c.CAPTURAS}/f3-editar-celular.png`, fullPage: true });

  // Criterio 7: otra empresa
  const otra = await c.nuevaPagina(navegador, { ancho: 1280 });
  await c.entrar(otra, "otra@demo.com");
  await otra.goto(`${c.APP}/viajes/${VIAJE}/editar`);
  c.ok((await c.texto(otra)).includes("No encontramos lo que buscabas"), "Otra empresa no abre la edición de un viaje de Rovirosa");

  // -------------------------------------------------------------------------
  // Usuarios
  // -------------------------------------------------------------------------
  await page.goto(`${c.APP}/mas`);
  await Promise.all([page.waitForURL(/\/mas\/usuarios$/), page.click("a:has-text('Usuarios')")]);
  await page.fill("input[name=nombre]", "Laura Admin");
  await page.fill("input[name=email]", "Admin@Demo.com");
  await page.check("input[name=rol][value=administrativo]");
  await Promise.all([page.waitForURL(/invitada=/), page.click("button:has-text('Invitar')")]);
  const tInv = await c.texto(page);
  const wa = await page.locator("a:has-text('Enviar por WhatsApp')").getAttribute("href");
  c.ok(tInv.includes("Invitación creada para Laura Admin") && tInv.includes("Invitaciones pendientes (1)") && tInv.includes("Vence en"),
    "El dueño invita y la ve como pendiente");
  c.ok(wa.startsWith("https://wa.me/?text=") && decodeURIComponent(wa).includes("admin@demo.com") && decodeURIComponent(wa).includes("/registro"),
    "El link de WhatsApp lleva el email y el link de registro");
  c.ok((await page.locator("li:has-text('(vos)') button:has-text('Desactivar')").count()) === 0, "El dueño no tiene botón para desactivarse");
  await page.screenshot({ path: `${c.CAPTURAS}/f4-usuarios.png`, fullPage: true });

  // Registro del invitado
  const nueva = await c.nuevaPagina(navegador);
  await nueva.goto(`${c.APP}/login`);
  await Promise.all([nueva.waitForURL(/\/registro$/), nueva.click("a:has-text('Creá tu usuario')")]);
  await nueva.fill("input[name=email]", "admin@demo.com");
  await nueva.fill("input[name=password]", "clave-segura-1");
  await nueva.click("button:has-text('Crear mi usuario')");
  await nueva.waitForSelector("text=Revisá tu email");
  c.ok(await c.sinScrollHorizontal(nueva), "Registro sin scroll horizontal a 375 px");
  await c.entrar(nueva, "admin@demo.com", "clave-segura-1");
  c.ok((await nueva.locator("form [role=alert]").innerText()).includes("Tu email todavía no está confirmado"), "Sin confirmar el email no entra");
  c.sql("update auth.users set email_confirmed_at = now() where email = 'admin@demo.com'");
  await nueva.goto(`${c.APP}/auth/confirmar`);
  c.ok((await nueva.locator("main").innerText()).includes("Tu email quedó confirmado"), "El link del mail lleva al ingreso con el aviso de confirmado");
  await c.entrar(nueva, "admin@demo.com", "clave-segura-1");
  const tAdmin = await c.texto(nueva);
  c.ok(tAdmin.includes("Por cobrar") && c.sql("select rol from public.perfiles p join auth.users u on u.id = p.user_id where u.email = 'admin@demo.com'") === "administrativo",
    "Al primer ingreso entra como administrativo de Rovirosa");
  await nueva.goto(`${c.APP}/mas`);
  c.ok(!(await c.texto(nueva)).includes("Usuarios"), "El administrativo no ve la sección Usuarios");
  await nueva.goto(`${c.APP}/mas/usuarios`);
  c.ok((await c.texto(nueva)).includes("Solo el dueño de la empresa gestiona los usuarios"), "Ni entrando con el link");
  await page.reload();
  c.ok(!(await c.texto(page)).includes("Invitaciones pendientes"), "La invitación aceptada ya no figura como pendiente");

  // Registrado sin invitación
  const colado = await c.nuevaPagina(navegador);
  await colado.goto(`${c.APP}/registro`);
  await colado.fill("input[name=email]", "colado@demo.com");
  await colado.fill("input[name=password]", "otra-clave-1");
  await colado.click("button:has-text('Crear mi usuario')");
  await colado.waitForSelector("text=Revisá tu email");
  c.sql("update auth.users set email_confirmed_at = now() where email = 'colado@demo.com'");
  await c.entrar(colado, "colado@demo.com", "otra-clave-1");
  c.ok((await c.texto(colado)).includes("Tu usuario no tiene una empresa asignada"), "Registrado sin invitación: no ve datos");

  // Anular una invitación
  await page.fill("input[name=nombre]", "Se arrepintió");
  await page.fill("input[name=email]", "nadie@demo.com");
  await Promise.all([page.waitForURL(/invitada=/), page.click("button:has-text('Invitar')")]);
  await Promise.all([page.waitForURL(/hecho=anulada/), page.click("li:has-text('nadie@demo.com') button:has-text('Anular')")]);
  const tAnul = await c.texto(page);
  c.ok(tAnul.includes("Invitación anulada") && !tAnul.includes("nadie@demo.com"), "Anular saca la invitación de pendientes");

  // Desactivar y reactivar
  await Promise.all([page.waitForURL(/hecho=desactivado/), page.click("li:has-text('Laura Admin') button:has-text('Desactivar')")]);
  await nueva.goto(`${c.APP}/viajes`);
  c.ok((await c.texto(nueva)).includes("Tu usuario está desactivado"), "Desactivado: en su siguiente acción deja de ver datos");
  await Promise.all([page.waitForURL(/hecho=reactivado/), page.click("li:has-text('Laura Admin') button:has-text('Reactivar')")]);
  await nueva.goto(`${c.APP}/viajes`);
  c.ok((await c.texto(nueva)).includes(`Viajes (${12 + 1})`), "Reactivado: vuelve a ver los viajes");

  // Otra empresa no ve los usuarios de Rovirosa
  await otra.goto(`${c.APP}/mas/usuarios`);
  const tOtra = await c.texto(otra);
  c.ok(!tOtra.includes("Laura Admin") && !tOtra.includes("Gabi") && tOtra.includes("En la empresa (1)"), "Otra empresa no ve los usuarios de Rovirosa");

  const movilUsuarios = await c.nuevaPagina(navegador);
  await c.entrar(movilUsuarios, "dueno@demo.com");
  await movilUsuarios.goto(`${c.APP}/mas/usuarios`);
  await c.texto(movilUsuarios);
  c.ok(await c.sinScrollHorizontal(movilUsuarios), "Usuarios sin scroll horizontal a 375 px");
  await movilUsuarios.screenshot({ path: `${c.CAPTURAS}/f5-usuarios-celular.png`, fullPage: true });

  for (const p of [page, otraPestana, movil, otra, nueva, colado]) c.ok(p.errores.length === 0, `Sin errores de JavaScript ${p.errores.join(" ")}`);
  await navegador.close();
  c.terminar();
})();
