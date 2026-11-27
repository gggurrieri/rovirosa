// Supabase simulado SOLO para pruebas: auth mínima, un traductor chico de PostgREST
// y Storage. Cada consulta corre como rol "authenticated" con el usuario del token,
// así RLS y las políticas de Storage de las migraciones reales deciden qué se ve.
// Conexión a Postgres con las variables estándar (PGHOST, PGPORT, PGUSER, PGPASSWORD);
// base PGDATABASE (por defecto "rovirosa_e2e"). Puerto: SIMULADO_PUERTO (54321).
import http from "node:http";
import pg from "pg";

pg.types.setTypeParser(1082, (v) => v); // date como texto, igual que PostgREST
const pool = new pg.Pool({ database: process.env.PGDATABASE ?? "rovirosa_e2e", max: 20 });
const PUERTO = Number(process.env.SIMULADO_PUERTO ?? 54321);
const PASSWORD = "demo1234";
const RELACIONES = { empresas: "empresa_id", unidades: "unidad_id", choferes: "chofer_id" };
const OPS = { eq: "=", neq: "<>", gte: ">=", lte: "<=", gt: ">", lt: "<" };
const archivos = new Map(); // "bucket/ruta" → { tipo, datos }
const claves = new Map(); // email → contraseña de los usuarios que se registran en la prueba

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const leerB64 = (t) => JSON.parse(Buffer.from(t, "base64url").toString());
function token(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: "s1" })}.${Buffer.from("firma-simulada").toString("base64url")}`;
}
function leerToken(req) {
  const t = (req.headers.authorization ?? "").replace("Bearer ", "");
  try { return leerB64(t.split(".")[1]); } catch { return null; }
}
const usuario = (u) => ({ id: u.id, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });

async function bytes(req) { const partes = []; for await (const c of req) partes.push(c); return Buffer.concat(partes); }
async function cuerpo(req) { const b = await bytes(req); return b.length ? JSON.parse(b.toString()) : {}; }

function traducir(tabla, params) {
  const cols = [];
  for (const parte of (params.get("select") ?? "*").match(/[a-z_]+\([^)]*\)|[a-z_*]+/g)) {
    const emb = /^([a-z_]+)\(([^)]*)\)$/.exec(parte);
    if (emb) {
      const [, rel, sub] = emb;
      cols.push(`(select row_to_json(e) from (select ${sub} from public.${rel} x where x.id = t.${RELACIONES[rel]}) e) as ${rel}`);
    } else cols.push(parte === "*" ? "t.*" : `t.${parte}`);
  }
  const where = [], valores = [];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    const [op, ...resto] = v.split(".");
    const valor = resto.join(".");
    if (op === "is") { where.push(`t.${k} is ${valor === "null" ? "null" : "not null"}`); continue; }
    if (op === "in") {
      valores.push(valor.slice(1, -1).split(",").map((x) => x.replaceAll('"', "")));
      where.push(`t.${k}::text = any($${valores.length})`);
      continue;
    }
    valores.push(valor);
    where.push(`t.${k} ${OPS[op]} $${valores.length}`);
  }
  const order = params.get("order")?.split(",").map((o) => { const [c, d] = o.split("."); return `t.${c} ${d === "desc" ? "desc" : "asc"}`; }).join(", ");
  const limit = params.get("limit") ? ` limit ${Number(params.get("limit"))}` : "";
  const sql = `select ${cols.join(", ")} from public.${tabla} t${where.length ? " where " + where.join(" and ") : ""}${order ? " order by " + order : ""}${limit}`;
  return { sql, valores };
}

async function comoUsuario(sub, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [sub ?? ""]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
async function storage(req, url, enviar) {
  const sub = leerToken(req)?.sub;
  const firma = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(url.pathname);
  const objeto = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);

  if (firma && req.method === "GET") {
    // Descarga con link firmado: sin sesión, solo vale el token y su vencimiento.
    const [, bucket, ruta] = firma.map(decodeURIComponent);
    let t;
    try { t = leerB64(url.searchParams.get("token") ?? ""); } catch { t = null; }
    if (!t || t.bucket !== bucket || t.ruta !== ruta || t.exp < Date.now() / 1000) {
      return enviar(400, { statusCode: "400", error: "InvalidJWT", message: "jwt expired" });
    }
    const archivo = archivos.get(`${bucket}/${ruta}`);
    if (!archivo) return enviar(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    return enviar(200, archivo.datos, { "content-type": archivo.tipo }, true);
  }

  if (firma && req.method === "POST") {
    const [, bucket, ruta] = firma.map(decodeURIComponent);
    const { expiresIn } = await cuerpo(req);
    const visibles = await comoUsuario(sub, async (c) =>
      (await c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, ruta])).rowCount);
    if (!visibles) return enviar(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const t = b64({ bucket, ruta, exp: Math.floor(Date.now() / 1000) + Number(expiresIn) });
    return enviar(200, { signedURL: `/object/sign/${bucket}/${ruta}?token=${t}` });
  }

  if (objeto && req.method === "POST") {
    const [, bucket, ruta] = objeto.map(decodeURIComponent);
    const tipo = req.headers["content-type"] ?? "application/octet-stream";
    const datos = await bytes(req);
    const { rows: [b] } = await pool.query("select file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]);
    if (!b) return enviar(400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
    if (b.file_size_limit && datos.length > Number(b.file_size_limit)) {
      return enviar(400, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
    }
    if (b.allowed_mime_types && !b.allowed_mime_types.includes(tipo)) {
      return enviar(400, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${tipo} is not supported` });
    }
    try {
      await comoUsuario(sub, (c) => c.query("insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3)",
        [bucket, ruta, { mimetype: tipo, size: datos.length }]));
    } catch (e) {
      if (e.code === "23505") return enviar(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
      if (e.code === "42501") return enviar(400, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      throw e;
    }
    archivos.set(`${bucket}/${ruta}`, { tipo, datos });
    console.log(`SUBIDA ${bucket}/${ruta} (${datos.length} bytes) sub=${sub?.slice(-4)}`);
    return enviar(200, { Key: `${bucket}/${ruta}`, Id: ruta });
  }

  return enviar(404, { message: "Storage: ruta no simulada " + url.pathname });
}

const consultasORS = {};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const enviar = (status, data, headers = {}, crudo = false) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(data === undefined ? "" : crudo ? data : JSON.stringify(data));
  };
  try {
    // OpenRouteService simulado (Calcular km de una tarifa): dos lugares conocidos y una ruta fija.
    if (url.pathname === "/ors/_contador") return enviar(200, consultasORS); // para las pruebas
    if (url.pathname.startsWith("/ors/")) {
      if (req.headers.authorization !== "clave-ors-prueba") return enviar(403, { error: "Access to this API has been disallowed" });
      consultasORS[url.pathname] = (consultasORS[url.pathname] ?? 0) + 1;
      const lugares = { "buenos aires": ["Buenos Aires, CABA, Argentina", -58.38, -34.6], bariloche: ["San Carlos de Bariloche, RN, Argentina", -71.31, -41.13] };
      const feature = (l) => ({ geometry: { coordinates: [l[1], l[2]] }, properties: { label: l[0] } });
      if (url.pathname === "/ors/pelias/v1/search") {
        const l = lugares[(url.searchParams.get("text") ?? "").trim().toLowerCase()];
        return enviar(200, { features: l ? [feature(l)] : [] });
      }
      if (url.pathname === "/ors/pelias/v1/autocomplete") {
        const t = (url.searchParams.get("text") ?? "").trim().toLowerCase();
        const extra = { barilari: ["Barilari, BA, Argentina", -60.2, -35.1] };
        return enviar(200, { features: Object.entries({ ...lugares, ...extra }).filter(([k]) => k.startsWith(t)).map(([, l]) => feature(l)) });
      }
      if (url.pathname === "/ors/openrouteservice/v2/directions/driving-hgv") {
        await cuerpo(req);
        return enviar(200, { routes: [{ summary: { distance: 1579612.4 } }] });
      }
      return enviar(404, {});
    }
    if (url.pathname === "/auth/v1/signup") {
      // Como Supabase con "Confirm email" activado: crea el usuario sin confirmar y no da sesión.
      const { email, password } = await cuerpo(req);
      if (!password || password.length < 6) return enviar(422, { code: "weak_password", error_code: "weak_password", msg: "Password should be at least 6 characters" });
      const { rows: [existente] } = await pool.query("select id, email from auth.users where email = $1", [email]);
      if (existente) return enviar(200, { ...usuario(existente), identities: [] }); // Supabase no revela si existe
      const { rows: [nuevo] } = await pool.query(
        "insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), $1, null) returning id, email", [email]);
      claves.set(email, password);
      console.log(`REGISTRO ${email}`);
      return enviar(200, { ...usuario(nuevo), identities: [{ id: nuevo.id }], confirmation_sent_at: new Date().toISOString() });
    }
    if (url.pathname === "/auth/v1/token") {
      const { email, password } = await cuerpo(req);
      const { rows } = await pool.query("select id, email, email_confirmed_at from auth.users where email = $1", [email]);
      if (!rows[0] || password !== (claves.get(email) ?? PASSWORD)) return enviar(400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
      if (!rows[0].email_confirmed_at) return enviar(400, { code: "email_not_confirmed", error_code: "email_not_confirmed", msg: "Email not confirmed" });
      const access_token = token(rows[0]);
      return enviar(200, { access_token, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r1", user: usuario(rows[0]) });
    }
    if (url.pathname === "/auth/v1/user") {
      const c = leerToken(req);
      if (!c) return enviar(401, { code: "bad_jwt", msg: "invalid" });
      return enviar(200, usuario({ id: c.sub, email: c.email }));
    }
    if (url.pathname === "/auth/v1/logout") return enviar(204);
    if (url.pathname.startsWith("/storage/v1/")) return await storage(req, url, enviar);

    const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
    if (rpc) {
      const sub = leerToken(req)?.sub;
      const args = await cuerpo(req);
      const claves = Object.keys(args);
      const valores = claves.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      const sql = `select public.${rpc[1]}(${claves.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
      const filas = await comoUsuario(sub, async (c) => (await c.query(sql, valores)).rows);
      return enviar(200, filas[0].r);
    }

    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (m) {
      const sub = leerToken(req)?.sub;
      const { sql, valores } = traducir(m[1], url.searchParams);
      const filas = await comoUsuario(sub, async (c) => (await c.query(sql, valores)).rows);
      const rango = { "content-range": `0-${Math.max(filas.length - 1, 0)}/${filas.length}` };
      if (req.method === "HEAD") return enviar(200, undefined, rango);
      if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
        return filas.length === 1 ? enviar(200, filas[0]) : enviar(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      }
      return enviar(200, filas, rango);
    }
    enviar(404, { msg: "no simulado: " + url.pathname });
  } catch (e) {
    console.error("ERROR", e.code, e.message);
    enviar(400, { message: e.message, code: e.code ?? "XX000" });
  }
}).listen(PUERTO, () => console.log(`Supabase simulado en :${PUERTO} (base ${pool.options.database})`));
