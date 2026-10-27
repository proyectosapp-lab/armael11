-- ══════════════════════════════════════════════════════════════════════════
-- RACHA DEL MODELO Y HITOS DE LA APP (27/10/2026)
-- Ya aplicado en Supabase desde la sesión. Queda acá como copia.
--
-- 1. modelo_racha(): lo que la app muestra arriba del desafío ("17 de 23, arriba de todos las dos veces"). Mira los
--    últimos 2 desafíos oficiales terminados: partidos con resultado, aciertos del modelo, y en cuántos el modelo
--    terminó con la máxima puntuación. La app solo lo muestra cuando `arriba` > 0.
-- 2. control_mam_datos(): suma los hitos de la app (mam-app / mam-web): abrió, desafío, eligió, guardó, cuenta, planes.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.modelo_racha()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with ult as (
    select d.id from desafio d
     where d.oficial and d.estado = 'terminado'
       and exists (select 1 from desafio_partido p where p.desafio = d.id and p.resultado is not null)
     order by d.creado desc limit 2
  ),
  por as (
    select u.id,
      (select count(*) from desafio_partido p where p.desafio = u.id and p.resultado is not null and p.resultado <> 0) as jugados,
      (select count(*) from desafio_partido p where p.desafio = u.id and p.resultado is not null and p.resultado <> 0 and p.modelo = p.resultado) as modelo,
      (select coalesce(max(j.puntos), 0) from desafio_jugador j where j.desafio = u.id
         and exists (select 1 from desafio_eleccion e where e.desafio = u.id and e.perfil = j.perfil)) as mejor_humano
    from ult u
  )
  select jsonb_build_object(
    'desafios', count(*),
    'jugados',  coalesce(sum(jugados), 0),
    'modelo',   coalesce(sum(modelo), 0),
    'arriba',   count(*) filter (where modelo >= mejor_humano and modelo > 0)
  ) from por;
$$;
revoke all on function public.modelo_racha() from public;
grant execute on function public.modelo_racha() to anon, authenticated;

-- los hitos de la app en el control corto
create or replace function public.control_mam_datos()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  salida jsonb;
begin
  with periodos(nombre, desde) as (
    values ('hoy', hoy), ('d7', hoy - 6), ('d30', hoy - 29)
  ),
  por as (
    select p.nombre,
      (select count(*) from perfil
        where (creado at time zone 'America/Argentina/Buenos_Aires')::date >= p.desde)                        as cuentas,
      (select count(*) from desafio
        where (creado at time zone 'America/Argentina/Buenos_Aires')::date >= p.desde)                        as desafios,
      (select count(*) from desafio_jugador j join desafio d on d.id = j.desafio
        where j.perfil is distinct from d.creador
          and (j.unido at time zone 'America/Argentina/Buenos_Aires')::date >= p.desde)                       as amigos,
      (select count(distinct perfil) from pago
        where acreditado and (recibido at time zone 'America/Argentina/Buenos_Aires')::date >= p.desde)       as pagaron,
      (select coalesce(sum(cuenta), 0) from campana_hito
        where codigo in ('uso-app', 'sv-uso-app') and hito = 'abrio' and dia >= p.desde)                      as app,
      (select coalesce(sum(cuenta), 0) from campana_hito
        where codigo in ('uso-web', 'sv-uso-web') and hito = 'abrio' and dia >= p.desde)                      as web,
      (select coalesce(sum(cuenta), 0) from campana_hito
        where codigo in ('uso-app', 'sv-uso-app') and hito = 'instalo' and dia >= p.desde)                    as instalaron,
      -- 27/10: Mano a mano (la app y armael11.com/app), por paso
      (select coalesce(sum(cuenta), 0) from campana_hito where codigo in ('mam-app', 'mam-web') and hito = 'abrio'   and dia >= p.desde) as mam_abrio,
      (select coalesce(sum(cuenta), 0) from campana_hito where codigo in ('mam-app', 'mam-web') and hito = 'desafio' and dia >= p.desde) as mam_desafio,
      (select coalesce(sum(cuenta), 0) from campana_hito where codigo in ('mam-app', 'mam-web') and hito = 'eligio'  and dia >= p.desde) as mam_eligio,
      (select coalesce(sum(cuenta), 0) from campana_hito where codigo in ('mam-app', 'mam-web') and hito = 'guardo'  and dia >= p.desde) as mam_guardo,
      (select coalesce(sum(cuenta), 0) from campana_hito where codigo in ('mam-app', 'mam-web') and hito = 'cuenta'  and dia >= p.desde) as mam_cuenta,
      (select coalesce(sum(cuenta), 0) from campana_hito where codigo in ('mam-app', 'mam-web') and hito = 'planes'  and dia >= p.desde) as mam_planes
    from periodos p
  )
  select jsonb_build_object(
    'hoy', hoy,
    'periodos', (select jsonb_object_agg(nombre, to_jsonb(por) - 'nombre') from por),
    'ahora', jsonb_build_object(
      'cuentas', (select count(*) from perfil),
      'futbol',  (select count(*) from perfil where plan <> 'gratis' and premium_hasta > now()),
      'tenis',   (select count(*) from pase where producto = 'sacavos'  and hasta > now()),
      'nba',     (select count(*) from pase where producto = 'quinteto' and hasta > now()),
      'cobra',   jsonb_build_object(
                   'futbol', (select valor from ajuste where clave = 'cobra'),
                   'tenis',  (select valor from ajuste where clave = 'cobra_sacavos'),
                   'nba',    (select valor from ajuste where clave = 'cobra_quinteto'))
    ),
    'desafios', coalesce((
      select jsonb_agg(x order by x.creado desc) from (
        select d.nombre, d.estado, d.creado,
               (select count(*) from desafio_jugador j where j.desafio = d.id) as jugadores,
               (select count(*) from desafio_partido q where q.desafio = d.id) as partidos
          from desafio d order by d.creado desc limit 6) x), '[]'::jsonb),
    'campanas', coalesce((
      select jsonb_agg(c order by c.llego desc) from (
        select codigo,
               coalesce(sum(cuenta) filter (where hito = 'llego'), 0)  as llego,
               coalesce(sum(cuenta) filter (where hito = 'simulo'), 0) as simulo,
               coalesce(sum(cuenta) filter (where hito = 'eligio'), 0) as eligio,
               coalesce(sum(cuenta) filter (where hito = 'guardo'), 0) as guardo,
               coalesce(sum(cuenta) filter (where hito = 'cuenta'), 0) as cuenta
          from campana_hito
         where dia >= hoy - 6
           and codigo not in ('uso-app', 'uso-web', 'sv-uso-app', 'sv-uso-web', 'mam-app', 'mam-web')
           and codigo not like 'prueba%' and codigo not like 'sv-prueba%'
         group by codigo
        having coalesce(sum(cuenta) filter (where hito = 'llego'), 0) > 0
         order by 2 desc limit 6) c), '[]'::jsonb)
  ) into salida;
  return salida;
end; $function$;
