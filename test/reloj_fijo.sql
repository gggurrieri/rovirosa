-- Reloj fijo para las pruebas SQL. Varias pruebas comparan contra montos del seed
-- (por ejemplo, "$ 2.700.000 vencido"), y lo vencido depende de la fecha de hoy: sin
-- esto, las pruebas cambian de resultado solas cuando pasan los días. "Hoy" queda
-- fijo en el 25/11/2026, la fecha para la que se armó el seed.
-- Solo para pruebas: NUNCA correr esto en Supabase.
create or replace function public.hoy_ar()
returns date
language sql stable
as $$ select date '2026-11-25' $$;
