-- ══════════════════════════════════════════════════════════════════════════
-- PANEL DE CONTROL — con Sacá vos adentro (26/9/2026)
--
-- Se pega ENTERO en Supabase → SQL Editor → Run, DESPUÉS de haber pegado
-- esquema-sacavos.sql (usa la tabla `pase` y el ajuste `cobra_sacavos`).
--
-- NO toca la clave del panel: solo reemplaza la función. La clave sigue
-- siendo la que pusiste en panel-de-control.sql.
--
-- Qué cambia:
--   · Un bloque nuevo, 'sacavos': uso de todos los días (web / app de
--     iPhone), campañas (sacavos.com/?c=ig1), cuentas creadas desde Sacá
--     vos, pases activos y pagos por medio (Mercado Pago, App Store, Play).
--   · Armá el 11 deja de contar lo de Sacá vos: sus campañas excluyen los
--     códigos "sv-…" y sus pagos excluyen los del pase de tenis. Antes de
--     esto, un pago de Sacá vos habría aparecido como plata de fútbol.
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
           where codigo not in ('uso-app', 'uso-web') and codigo not like 'sv-%' and dia >= desde
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
      'total',   (select count(*) from pago p where acreditado and not (p.id like 'apple:com.sacavos.%' or p.id like 'play:com.sacavos.%' or coalesce(p.crudo->>'referencia','') like '%:sacavos')),
      'en_rango',(select count(*) from pago p where acreditado and not (p.id like 'apple:com.sacavos.%' or p.id like 'play:com.sacavos.%' or coalesce(p.crudo->>'referencia','') like '%:sacavos')
                    and (recibido at time zone 'America/Argentina/Buenos_Aires')::date >= desde),
      'por_dia', coalesce((
        select jsonb_agg(f order by f.dia)
          from (select (recibido at time zone 'America/Argentina/Buenos_Aires')::date as dia,
                       count(*) as cuantos, sum(monto) as monto, max(moneda) as moneda
                  from pago p
                 where acreditado and not (p.id like 'apple:com.sacavos.%' or p.id like 'play:com.sacavos.%' or coalesce(p.crudo->>'referencia','') like '%:sacavos')
                   and (recibido at time zone 'America/Argentina/Buenos_Aires')::date >= desde
                 group by 1) f), '[]'::jsonb)
    ),

    /* ── SACÁ VOS ────────────────────────────────────────────────────────
       La app de tenis cuenta en la misma tabla con códigos que empiezan con
       "sv-" (sacavos-campana.js): `sv-uso-web` / `sv-uso-app` para el uso de
       todos los días y `sv-<código>` para sus campañas (llego, simulo,
       cuenta, pase). La cuenta es la misma que Armá el 11, así que no hay
       "cuentas de Sacá vos": están las creadas DESDE Sacá vos (usuario
       sv_…) y los pases. Los pagos se reconocen por el id (Apple/Play) o
       por la referencia de Mercado Pago, que termina en ":sacavos". */
    'sacavos', jsonb_build_object(
      'uso', coalesce((
        select jsonb_agg(f order by f.dia)
          from (
            select dia,
                   sum(cuenta) filter (where codigo = 'sv-uso-app' and hito = 'abrio')  as app_abrio,
                   sum(cuenta) filter (where codigo = 'sv-uso-app' and hito = 'simulo') as app_simulo,
                   sum(cuenta) filter (where codigo = 'sv-uso-web' and hito = 'abrio')  as web_abrio,
                   sum(cuenta) filter (where codigo = 'sv-uso-web' and hito = 'simulo') as web_simulo
              from campana_hito
             where codigo in ('sv-uso-app', 'sv-uso-web') and dia >= desde
             group by dia
          ) f), '[]'::jsonb),
      'campanas', coalesce((
        select jsonb_agg(f order by f.llegaron desc nulls last)
          from (
            select substr(codigo, 4) as codigo,
                   sum(cuenta) filter (where hito = 'llego')  as llegaron,
                   sum(cuenta) filter (where hito = 'simulo') as simularon,
                   sum(cuenta) filter (where hito = 'cuenta') as cuentas,
                   sum(cuenta) filter (where hito = 'pase')   as pases,
                   min(dia) as primer_dia, max(dia) as ultimo_dia
              from campana_hito
             where codigo like 'sv-%' and codigo not in ('sv-uso-app', 'sv-uso-web') and dia >= desde
             group by codigo
          ) f), '[]'::jsonb),
      'cuentas_desde_sv', (select count(*) from perfil where usuario like 'sv\_%'),
      'cuentas_nuevas',   (select count(*) from perfil where usuario like 'sv\_%'
                             and (creado at time zone 'America/Argentina/Buenos_Aires')::date >= desde),
      'pases_activos',    (select count(*) from pase where producto = 'sacavos' and hasta > now()),
      'pases_total',      (select count(*) from pase where producto = 'sacavos'),
      'cobra',            (select valor from ajuste where clave = 'cobra_sacavos'),
      'pagos', jsonb_build_object(
        'total',    (select count(*) from pago p where acreditado and (p.id like 'apple:com.sacavos.%' or p.id like 'play:com.sacavos.%' or coalesce(p.crudo->>'referencia','') like '%:sacavos')),
        'en_rango', (select count(*) from pago p where acreditado and (p.id like 'apple:com.sacavos.%' or p.id like 'play:com.sacavos.%' or coalesce(p.crudo->>'referencia','') like '%:sacavos')
                       and (recibido at time zone 'America/Argentina/Buenos_Aires')::date >= desde),
        'por_medio', coalesce((
          select jsonb_agg(f order by f.cuantos desc)
            from (select case when p.id like 'apple:%' then 'App Store'
                              when p.id like 'play:%'  then 'Google Play'
                              else 'Mercado Pago' end as medio,
                         count(*) as cuantos, sum(monto) as monto, max(moneda) as moneda
                    from pago p
                   where acreditado and (p.id like 'apple:com.sacavos.%' or p.id like 'play:com.sacavos.%' or coalesce(p.crudo->>'referencia','') like '%:sacavos')
                     and (recibido at time zone 'America/Argentina/Buenos_Aires')::date >= desde
                   group by 1) f), '[]'::jsonb),
        'por_dia', coalesce((
          select jsonb_agg(f order by f.dia)
            from (select (recibido at time zone 'America/Argentina/Buenos_Aires')::date as dia,
                         count(*) as cuantos, sum(monto) as monto, max(moneda) as moneda
                    from pago p
                   where acreditado and (p.id like 'apple:com.sacavos.%' or p.id like 'play:com.sacavos.%' or coalesce(p.crudo->>'referencia','') like '%:sacavos')
                     and (recibido at time zone 'America/Argentina/Buenos_Aires')::date >= desde
                   group by 1) f), '[]'::jsonb)
      )
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

-- Para probar: select panel_de_control('tu-clave', 14) -> 'sacavos';
