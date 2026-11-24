-- =============================================================================
-- Rovirosa · Esquema de la fase 1 (viajes y cobros)
-- Multi-empresa desde el día 1: toda tabla tiene empresa_id y Row Level Security.
-- Reglas de la casa:
--   * La plata se guarda en CENTAVOS como bigint (nunca float).
--   * Nada se borra: no hay políticas de DELETE. Los pagos se anulan con motivo.
--   * El precio y el cobro van por ítem (auto), no por viaje.
-- Las tablas de la fase 2 (gastos, custodia, mantenimiento, ubicaciones)
-- van en una migración posterior.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Empresas y perfiles
-- -----------------------------------------------------------------------------
create table public.empresas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  cuit              text,
  dias_vencimiento  int  not null default 7 check (dias_vencimiento >= 0),
  creado_en         timestamptz not null default now()
);

create table public.perfiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  empresa_id  uuid not null references public.empresas (id),
  nombre      text not null,
  rol         text not null check (rol in ('dueno', 'administrativo', 'chofer')),
  creado_en   timestamptz not null default now()
);

-- Empresa y rol del usuario logueado. SECURITY DEFINER para que las
-- políticas puedan leer perfiles sin entrar en recursión de RLS.
create or replace function public.mi_empresa()
returns uuid
language sql stable security definer set search_path = public
as $$ select empresa_id from public.perfiles where user_id = auth.uid() $$;

create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = public
as $$ select rol from public.perfiles where user_id = auth.uid() $$;

create or replace function public.puedo_editar()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.mi_rol() in ('dueno', 'administrativo'), false) $$;

-- -----------------------------------------------------------------------------
-- Maestros: clientes, vehículos, choferes, unidades, tarifas
-- -----------------------------------------------------------------------------
create table public.clientes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.mi_empresa() references public.empresas (id),
  nombre      text not null,
  tipo        text not null default 'particular'
              check (tipo in ('concesionaria', 'particular', 'coleccionista', 'otro')),
  cuit        text,
  whatsapp    text,
  email       text,
  ciudad      text,
  notas       text,
  creado_en   timestamptz not null default now()
);

create table public.vehiculos (
  id                        uuid primary key default gen_random_uuid(),
  empresa_id                uuid not null default public.mi_empresa() references public.empresas (id),
  cliente_id                uuid not null references public.clientes (id),
  marca                     text not null,
  modelo                    text not null,
  anio                      int check (anio between 1890 and 2100),
  dominio                   text,
  vin                       text,
  valor_declarado_centavos  bigint check (valor_declarado_centavos >= 0),
  moneda_valor              char(3) not null default 'USD' check (moneda_valor in ('ARS', 'USD')),
  creado_en                 timestamptz not null default now()
);

create table public.choferes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.mi_empresa() references public.empresas (id),
  nombre      text not null,
  telefono    text,
  user_id     uuid references auth.users (id),  -- se usa en la fase 2 (app del chofer)
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table public.unidades (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null default public.mi_empresa() references public.empresas (id),
  nombre                text not null,
  patente               text,
  tipo                  text not null check (tipo in ('mosquito', 'camioneta_carro', 'otro')),
  capacidad_autos       int  not null check (capacidad_autos > 0),
  chofer_habitual_id    uuid references public.choferes (id),
  km_actuales           int  check (km_actuales >= 0),
  intervalo_service_km  int  check (intervalo_service_km > 0),
  activa                boolean not null default true,
  creado_en             timestamptz not null default now()
);

create table public.tarifas (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null default public.mi_empresa() references public.empresas (id),
  origen                text not null,
  destino               text not null,
  km                    int  not null check (km > 0),
  precio_base_centavos  bigint not null check (precio_base_centavos >= 0),  -- por auto
  moneda                char(3) not null default 'ARS' check (moneda in ('ARS', 'USD')),
  activa                boolean not null default true,
  creado_en             timestamptz not null default now(),
  unique (empresa_id, origen, destino)
);

-- Litros esperados por tarifa y unidad (lo que Rodrigo ya sabe de memoria).
create table public.tarifas_consumo (
  tarifa_id          uuid not null references public.tarifas (id),
  unidad_id          uuid not null references public.unidades (id),
  empresa_id         uuid not null default public.mi_empresa() references public.empresas (id),
  litros_esperados   numeric(8, 1) not null check (litros_esperados >= 0),
  primary key (tarifa_id, unidad_id)
);

-- -----------------------------------------------------------------------------
-- Viajes e ítems (un ítem = un auto de un cliente dentro de un viaje)
-- -----------------------------------------------------------------------------
create table public.viajes (
  id                      uuid primary key default gen_random_uuid(),
  empresa_id              uuid not null default public.mi_empresa() references public.empresas (id),
  numero                  bigint generated always as identity,
  fecha_salida            date not null,
  fecha_llegada_estimada  date,
  unidad_id               uuid references public.unidades (id),
  chofer_id               uuid references public.choferes (id),
  origen                  text not null,
  destino                 text not null,
  tarifa_id               uuid references public.tarifas (id),
  estado                  text not null default 'programado'
                          check (estado in ('programado', 'en_retiro', 'en_viaje', 'entregado',
                                            'cerrado', 'reprogramado', 'cancelado')),
  km_salida               int check (km_salida >= 0),
  km_regreso              int check (km_regreso >= 0),
  vuelve_vacio            boolean not null default false,
  notas                   text,
  creado_por              uuid default auth.uid(),
  creado_en               timestamptz not null default now(),
  check (fecha_llegada_estimada is null or fecha_llegada_estimada >= fecha_salida),
  check (km_regreso is null or km_salida is null or km_regreso >= km_salida)
);

create table public.items_viaje (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null default public.mi_empresa() references public.empresas (id),
  viaje_id           uuid not null references public.viajes (id),
  cliente_id         uuid not null references public.clientes (id),
  vehiculo_id        uuid references public.vehiculos (id),
  precio_centavos    bigint not null check (precio_centavos >= 0),
  moneda             char(3) not null default 'ARS' check (moneda in ('ARS', 'USD')),
  fecha_deseada      date,
  flexibilidad_dias  int not null default 0 check (flexibilidad_dias >= 0),
  retiro_direccion   text,
  retiro_contacto    text,
  entrega_direccion  text,
  entrega_contacto   text,
  fecha_entrega      date,  -- se completa al entregar; desde acá cuentan los días de vencimiento
  cancelado          boolean not null default false,
  notas              text,
  creado_en          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Pagos y su aplicación a ítems (un pago puede cubrir varios ítems,
-- y un ítem puede cobrarse en varios pagos). Lo no aplicado es saldo a favor.
-- -----------------------------------------------------------------------------
create table public.pagos (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null default public.mi_empresa() references public.empresas (id),
  cliente_id        uuid not null references public.clientes (id),  -- quien paga (puede no ser el dueño del auto)
  fecha             date not null default current_date,
  monto_centavos    bigint not null check (monto_centavos > 0),
  moneda            char(3) not null default 'ARS' check (moneda in ('ARS', 'USD')),
  titular           text,   -- titular de la cuenta que transfirió
  medio             text not null default 'transferencia'
                    check (medio in ('transferencia', 'efectivo', 'cheque', 'otro')),
  comprobante_path  text,   -- ruta en Supabase Storage
  notas             text,
  anulado_en        timestamptz,
  anulado_por       uuid,
  anulado_motivo    text,
  creado_por        uuid default auth.uid(),
  creado_en         timestamptz not null default now(),
  check (anulado_en is null or (anulado_motivo is not null and length(trim(anulado_motivo)) > 0))
);

create table public.aplicaciones_pago (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null default public.mi_empresa() references public.empresas (id),
  pago_id         uuid not null references public.pagos (id),
  item_id         uuid not null references public.items_viaje (id),
  monto_centavos  bigint not null check (monto_centavos > 0),
  creado_en       timestamptz not null default now(),
  unique (pago_id, item_id)
);

-- -----------------------------------------------------------------------------
-- Bloqueos de disponibilidad (service, VTV, franco, taller) para el calendario
-- -----------------------------------------------------------------------------
create table public.bloqueos_disponibilidad (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null default public.mi_empresa() references public.empresas (id),
  unidad_id   uuid references public.unidades (id),
  chofer_id   uuid references public.choferes (id),
  desde       date not null,
  hasta       date not null,
  motivo      text not null check (motivo in ('service', 'vtv', 'taller', 'franco', 'vacaciones', 'otro')),
  notas       text,
  creado_en   timestamptz not null default now(),
  check (unidad_id is not null or chofer_id is not null),
  check (hasta >= desde)
);

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------
create index on public.perfiles (empresa_id);
create index on public.clientes (empresa_id);
create index on public.vehiculos (empresa_id, cliente_id);
create index on public.choferes (empresa_id);
create index on public.unidades (empresa_id);
create index on public.tarifas (empresa_id);
create index on public.viajes (empresa_id, fecha_salida);
create index on public.viajes (unidad_id, fecha_salida);
create index on public.items_viaje (empresa_id, viaje_id);
create index on public.items_viaje (cliente_id);
create index on public.pagos (empresa_id, cliente_id);
create index on public.aplicaciones_pago (item_id);
create index on public.aplicaciones_pago (pago_id);
create index on public.bloqueos_disponibilidad (empresa_id, desde, hasta);

-- -----------------------------------------------------------------------------
-- Reglas de cobro (triggers)
-- -----------------------------------------------------------------------------
-- Una aplicación no puede: usar un pago anulado, mezclar monedas, cruzar empresas,
-- aplicar más de lo que tiene el pago, ni cobrar más que el precio del ítem.
create or replace function public.validar_aplicacion()
returns trigger
language plpgsql
as $$
declare
  v_pago  public.pagos%rowtype;
  v_item  public.items_viaje%rowtype;
  v_aplicado_pago  bigint;
  v_cobrado_item   bigint;
begin
  select * into v_pago from public.pagos where id = new.pago_id for update;
  select * into v_item from public.items_viaje where id = new.item_id for update;

  if v_pago.anulado_en is not null then
    raise exception 'El pago está anulado';
  end if;
  if v_pago.empresa_id <> v_item.empresa_id or new.empresa_id <> v_pago.empresa_id then
    raise exception 'El pago y el ítem son de empresas distintas';
  end if;
  if v_pago.moneda <> v_item.moneda then
    raise exception 'El pago está en % y el ítem en %', v_pago.moneda, v_item.moneda;
  end if;

  select coalesce(sum(a.monto_centavos), 0) into v_aplicado_pago
  from public.aplicaciones_pago a
  where a.pago_id = new.pago_id and a.id <> new.id;

  if v_aplicado_pago + new.monto_centavos > v_pago.monto_centavos then
    raise exception 'Se aplicaría más que el monto del pago';
  end if;

  select coalesce(sum(a.monto_centavos), 0) into v_cobrado_item
  from public.aplicaciones_pago a
  join public.pagos p on p.id = a.pago_id and p.anulado_en is null
  where a.item_id = new.item_id and a.id <> new.id;

  if v_cobrado_item + new.monto_centavos > v_item.precio_centavos then
    raise exception 'Se cobraría más que el precio del ítem';
  end if;

  return new;
end;
$$;

create trigger trg_validar_aplicacion
before insert or update on public.aplicaciones_pago
for each row execute function public.validar_aplicacion();

-- Un pago solo se puede anular (no editar el monto ni "desanular").
create or replace function public.proteger_pago()
returns trigger
language plpgsql
as $$
begin
  if old.anulado_en is not null then
    raise exception 'Un pago anulado no se puede modificar';
  end if;
  if new.monto_centavos <> old.monto_centavos or new.moneda <> old.moneda
     or new.cliente_id <> old.cliente_id or new.empresa_id <> old.empresa_id then
    raise exception 'Monto, moneda y cliente de un pago no se editan: anulalo y cargalo de nuevo';
  end if;
  if new.anulado_en is not null then
    new.anulado_por := coalesce(new.anulado_por, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_proteger_pago
before update on public.pagos
for each row execute function public.proteger_pago();

-- -----------------------------------------------------------------------------
-- Auditoría: quién cambió qué y cuándo
-- -----------------------------------------------------------------------------
create table public.auditoria (
  id           bigint generated always as identity primary key,
  empresa_id   uuid,
  tabla        text not null,
  registro_id  uuid,
  accion       text not null,
  antes        jsonb,
  despues      jsonb,
  usuario      uuid default auth.uid(),
  en           timestamptz not null default now()
);

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.auditoria (empresa_id, tabla, registro_id, accion, antes, despues)
  values (
    coalesce(new.empresa_id, old.empresa_id),
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_aud_viajes      after insert or update on public.viajes            for each row execute function public.registrar_auditoria();
create trigger trg_aud_items       after insert or update on public.items_viaje       for each row execute function public.registrar_auditoria();
create trigger trg_aud_pagos       after insert or update on public.pagos             for each row execute function public.registrar_auditoria();
create trigger trg_aud_aplicacion  after insert or update on public.aplicaciones_pago for each row execute function public.registrar_auditoria();
create trigger trg_aud_tarifas     after insert or update on public.tarifas           for each row execute function public.registrar_auditoria();

-- -----------------------------------------------------------------------------
-- Vista de saldos por ítem (respeta RLS por security_invoker)
-- -----------------------------------------------------------------------------
create or replace view public.v_items_saldo
with (security_invoker = true)
as
select
  i.id,
  i.empresa_id,
  i.viaje_id,
  v.numero          as viaje_numero,
  v.fecha_salida,
  v.origen,
  v.destino,
  v.estado          as estado_viaje,
  i.cliente_id,
  c.nombre          as cliente_nombre,
  i.vehiculo_id,
  i.moneda,
  i.precio_centavos,
  coalesce(cob.cobrado, 0)                       as cobrado_centavos,
  i.precio_centavos - coalesce(cob.cobrado, 0)   as saldo_centavos,
  case
    when i.cancelado then 'cancelado'
    when coalesce(cob.cobrado, 0) >= i.precio_centavos then 'pagado'
    when coalesce(cob.cobrado, 0) > 0 then 'parcial'
    else 'pendiente'
  end                                            as estado_cobro,
  i.fecha_entrega,
  (
    not i.cancelado
    and i.fecha_entrega is not null
    and i.precio_centavos - coalesce(cob.cobrado, 0) > 0
    and current_date > i.fecha_entrega + e.dias_vencimiento
  )                                              as vencido
from public.items_viaje i
join public.viajes   v on v.id = i.viaje_id
join public.clientes c on c.id = i.cliente_id
join public.empresas e on e.id = i.empresa_id
left join (
  select a.item_id, sum(a.monto_centavos) as cobrado
  from public.aplicaciones_pago a
  join public.pagos p on p.id = a.pago_id and p.anulado_en is null
  group by a.item_id
) cob on cob.item_id = i.id;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Fase 1: solo dueño y administrativo usan la app. Los choferes no ven nada
-- todavía; sus políticas (sin precios ni cobros) llegan en la fase 2.
-- No hay políticas de DELETE en ninguna tabla: nada se borra.
-- -----------------------------------------------------------------------------
alter table public.empresas                enable row level security;
alter table public.perfiles                enable row level security;
alter table public.clientes                enable row level security;
alter table public.vehiculos               enable row level security;
alter table public.choferes                enable row level security;
alter table public.unidades                enable row level security;
alter table public.tarifas                 enable row level security;
alter table public.tarifas_consumo         enable row level security;
alter table public.viajes                  enable row level security;
alter table public.items_viaje             enable row level security;
alter table public.pagos                   enable row level security;
alter table public.aplicaciones_pago       enable row level security;
alter table public.bloqueos_disponibilidad enable row level security;
alter table public.auditoria               enable row level security;

create policy empresa_select on public.empresas for select to authenticated
  using (id = public.mi_empresa());
create policy empresa_update on public.empresas for update to authenticated
  using (id = public.mi_empresa() and public.mi_rol() = 'dueno')
  with check (id = public.mi_empresa());

create policy perfiles_select on public.perfiles for select to authenticated
  using (empresa_id = public.mi_empresa());

create policy auditoria_select on public.auditoria for select to authenticated
  using (empresa_id = public.mi_empresa() and public.mi_rol() = 'dueno');

-- Mismas tres políticas para cada tabla operativa.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes', 'vehiculos', 'choferes', 'unidades', 'tarifas', 'tarifas_consumo',
    'viajes', 'items_viaje', 'pagos', 'aplicaciones_pago', 'bloqueos_disponibilidad'
  ]
  loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (empresa_id = public.mi_empresa() and public.puedo_editar())', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check (empresa_id = public.mi_empresa() and public.puedo_editar())', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using (empresa_id = public.mi_empresa() and public.puedo_editar())
         with check (empresa_id = public.mi_empresa())', t);
  end loop;
end;
$$;
