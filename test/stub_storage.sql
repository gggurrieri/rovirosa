-- Simula lo mínimo de Supabase Storage para probar las migraciones en un Postgres común.
-- Correr después de stub_supabase.sql y antes de las migraciones.
create schema if not exists storage;

create table if not exists storage.buckets (
  id                  text primary key,
  name                text not null,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[]
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text not null,
  owner       uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  metadata    jsonb,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

-- Igual que en Supabase: las carpetas de una ruta, sin el nombre del archivo.
create or replace function storage.foldername(name text)
returns text[]
language sql immutable
as $$ select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1] $$;

grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
