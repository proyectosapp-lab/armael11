-- ══════════════════════════════════════════════════════════════════════════
-- PANEL DE CONTROL  —  pegar entero en Supabase → SQL Editor → Run.
--
-- ANTES DE APRETAR RUN: cambiá la clave de la línea que dice CAMBIAR ACÁ.
-- Poné una larga, de las que no se adivinan. Puede ser la misma que usás
-- para el backtest o una distinta, como prefieras.
--
-- LA CLAVE NO SE GUARDA EN NINGÚN ARCHIVO DEL PROYECTO NI EN EL SITIO. Lo
-- único que queda en la base es su huella bcrypt, que no se puede dar vuelta.
-- Se puede correr las veces que haga falta: correrlo de nuevo con otra clave
-- la cambia, y no toca ningún dato.
--
-- ─── QUÉ CONTESTA ─────────────────────────────────────────────────────────
-- Un solo JSON con todo lo que mira la pantalla de control:
--   uso        uso diario, separando la app instalada del navegador
--   campanas   el embudo de cada código de campaña
--   cuentas    cuántas hay, cuántas nuevas, y cómo se reparten por plan
--   pagos      lo cobrado en el período, por día
--   avisos     cuántos teléfonos están suscriptos al once del DT
--
-- ─── LO QUE NO PUEDE CONTESTAR, Y NO ES UN OLVIDO ─────────────────────────
-- Las instalaciones de Google Play y de la App Store NO están acá. Esas
-- viven en las consolas de las tiendas y no hay forma de leerlas sin la API
-- de cada una. Lo que esta base sabe es cuántos teléfonos ABRIERON la app
-- instalada, que para la discusión con Google es el número que importa:
-- instalar y no volver a entrar no cuenta como prueba.
-- ══════════════════════════════════════════════════════════════════════════

-- bcrypt. Supabase ya lo tiene; el `if not exists` es para que correr esto
-- dos veces no falle. Según la instalación queda en `public` o en
-- `extensions`, y por eso las funciones de abajo miran en los dos lados.
create extension if not exists pgcrypto;

create table if not exists panel_clave (
  id     int primary key default 1 check (id = 1),
  huella text not null,
  puesta timestamptz not null default now()
);
alter table panel_clave enable row level security;
-- Sin una sola política: ni para leer. La clave `anon` no la ve ni de
-- casualidad, y las funciones de abajo son `security definer`.

-- ─── ACÁ. CAMBIAR ESTO Y NADA MÁS ─────────────────────────────────────────
insert into panel_clave (id, huella)
values (1, crypt('@Totito22', gen_salt('bf')))
on conflict (id) do update
  set huella = excluded.huella, puesta = now();

-- ══════════════════════════════════════════════════════════════════════════
-- LA FUNCIÓN
--
-- `security definer` porque lee tablas que el navegador no puede tocar.
-- Devuelve JSON y no filas: son cinco cosas de forma distinta y hacer cinco
-- pedidos desde la pantalla sería cinco veces la misma verificación de clave.
--
-- bcrypt tarda a propósito —unos 100 ms— así que probar claves a mano es
-- lentísimo. Aun así hay un freno de forma: una clave corta ni se compara.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function panel_de_control(p_clave text, p_dias int default 14)
  returns jsonb
  language plpgsql security definer set search_path = public, extensions as $$
declare
  h      text;
  dias   int := least(greatest(coalesce(p_dias, 14), 1), 120);
  desde  date := ((now() at time zone 'America/Argentina/Buenos_Aires')::date) - dias + 1;
  hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  salida jsonb;
begin
  if p_clave is null or length(p_clave) < 8 or length(p_clave) > 200 then
    raise exception 'clave invalida';
  end if;
  select huella into h from panel_clave where id = 1;
  if h is null then
    raise exception 'todavia no hay clave: corré panel-de-control.sql';
  end if;
  if crypt(p_clave, h) <> h then
    raise exception 'clave invalida';
  end if;

  select jsonb_build_object(
    'hoy', hoy,
    'desde', desde,
    'dias', dias,

    /* ── EL USO DE TODOS LOS DÍAS ───────────────────────────────────────
       `uso-app` y `uso-web` son códigos del mismo contador de campaña. Se
       separan acá porque la versión de Play es un TWA —el sitio adentro de
       una ventana— y para cualquier medición de sitio son indistinguibles.
       Esa distinción es justo la que Google pedía.                      */
    'uso', coalesce((
      select jsonb_agg(f order by f.dia)
        from (
          select dia,
                 sum(cuenta) filter (where codigo = 'uso-app' and hito = 'abrio')  as app_abrio,
                 sum(cuenta) filter (where codigo = 'uso-app' and hito = 'simulo') as app_simulo,
                 sum(cuenta) filter (where codigo = 'uso-web' and hito = 'abrio')  as web_abrio,
                 sum(cuenta) filter (where codigo = 'uso-web' and hito = 'simulo') as web_simulo
            from campana_hito
           where codigo in ('uso-app', 'uso-web') and dia >= desde
           group by dia
        ) f), '[]'::jsonb),

    /* ── LAS CAMPAÑAS ───────────────────────────────────────────────────
       Los códigos de uso quedan afuera: no son campañas, son el uso de
       todos. Mezclarlos inflaría el embudo con gente que nunca vio un
       anuncio.                                                          */
    'campanas', coalesce((
      select jsonb_agg(f order by f.llegaron desc nulls last)
        from (
          select codigo,
                 sum(cuenta) filter (where hito = 'llego')   as llegaron,
                 sum(cuenta) filter (where hito = 'simulo')  as simularon,
                 sum(cuenta) filter (where hito = 'instalo') as instalaron,
                 sum(cuenta) filter (where hito = 'cuenta')  as cuentas,
                 min(dia) as primer_dia, max(dia) as ultimo_dia
            from campana_hito
           where codigo not in ('uso-app', 'uso-web') and dia >= desde
           group by codigo
        ) f), '[]'::jsonb),

    'cuentas', jsonb_build_object(
      'total',  (select count(*) from perfil),
      'nuevas', (select count(*) from perfil
                  where (creado at time zone 'America/Argentina/Buenos_Aires')::date >= desde),
      'por_plan', coalesce((
        select jsonb_agg(f order by f.cuantas desc)
          from (select plan, count(*) as cuantas from perfil group by plan) f), '[]'::jsonb),
      'por_dia', coalesce((
        select jsonb_agg(f order by f.dia)
          from (select (creado at time zone 'America/Argentina/Buenos_Aires')::date as dia,
                       count(*) as cuantas
                  from perfil
                 where (creado at time zone 'America/Argentina/Buenos_Aires')::date >= desde
                 group by 1) f), '[]'::jsonb)
    ),

    /* Solo los acreditados. Un pago "pendiente" de Mercado Pago todavía no
       es plata, y mostrarlo como si lo fuera es la clase de número que se
       mira una vez y no se vuelve a creer. */
    'pagos', jsonb_build_object(
      'total',   (select count(*) from pago where acreditado),
      'en_rango',(select count(*) from pago where acreditado
                    and (recibido at time zone 'America/Argentina/Buenos_Aires')::date >= desde),
      'por_dia', coalesce((
        select jsonb_agg(f order by f.dia)
          from (select (recibido at time zone 'America/Argentina/Buenos_Aires')::date as dia,
                       count(*) as cuantos, sum(monto) as monto, max(moneda) as moneda
                  from pago
                 where acreditado
                   and (recibido at time zone 'America/Argentina/Buenos_Aires')::date >= desde
                 group by 1) f), '[]'::jsonb)
    ),

    'avisos', jsonb_build_object(
      'total', (select count(*) from aviso),
      'nuevos',(select count(*) from aviso
                  where (creado at time zone 'America/Argentina/Buenos_Aires')::date >= desde),
      'por_club', coalesce((
        select jsonb_agg(f order by f.cuantos desc)
          from (select club, count(*) as cuantos from aviso group by club limit 12) f), '[]'::jsonb)
    )
  ) into salida;

  return salida;
end; $$;

revoke all on function panel_de_control(text, int) from public;
grant execute on function panel_de_control(text, int) to anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- PARA PROBAR DESDE ACÁ MISMO, sin abrir la pantalla:
--
--   select panel_de_control('la-clave-que-pusiste-arriba', 14);
--
-- Si contesta `clave invalida`, la de arriba y la de acá no son la misma.
-- ══════════════════════════════════════════════════════════════════════════
