-- ══════════════════════════════════════════════════════════════════════════
-- CONTROL DE MANO A MANO — el corto (15/10/2026)
--
-- Lo que lee armael11.com/control-mam.html. Usa la MISMA clave que el panel
-- grande (la tabla panel_clave): no hay clave nueva que cuidar.
--
-- Dos funciones:
--   control_mam_datos()      arma los números. Nadie de afuera la puede llamar.
--   control_mam(p_clave)     pide la clave y devuelve lo de arriba.
--
-- Se puede correr las veces que haga falta: no toca ningún dato.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function control_mam_datos()
  returns jsonb
  language plpgsql security definer set search_path = public, extensions as $$
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
        where codigo in ('uso-app', 'sv-uso-app') and hito = 'instalo' and dia >= p.desde)                    as instalaron
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
    /* los últimos desafíos, para ver de un vistazo si se juegan */
    'desafios', coalesce((
      select jsonb_agg(x order by x.creado desc) from (
        select d.nombre, d.estado, d.creado,
               (select count(*) from desafio_jugador j where j.desafio = d.id) as jugadores,
               (select count(*) from desafio_partido q where q.desafio = d.id) as partidos
          from desafio d order by d.creado desc limit 6) x), '[]'::jsonb),
    /* campañas de los últimos 7 días: llegadas y cuántos simularon (sin los contadores de uso ni las pruebas) */
    'campanas', coalesce((
      select jsonb_agg(c order by c.llego desc) from (
        select codigo,
               coalesce(sum(cuenta) filter (where hito = 'llego'), 0)  as llego,
               coalesce(sum(cuenta) filter (where hito = 'simulo'), 0) as simulo
          from campana_hito
         where dia >= hoy - 6
           and codigo not in ('uso-app', 'uso-web', 'sv-uso-app', 'sv-uso-web')
           and codigo not like 'prueba%' and codigo not like 'sv-prueba%'
         group by codigo
        having coalesce(sum(cuenta) filter (where hito = 'llego'), 0) > 0
         order by 2 desc limit 6) c), '[]'::jsonb)
  ) into salida;
  return salida;
end; $$;

revoke all on function control_mam_datos() from public, anon, authenticated;

create or replace function control_mam(p_clave text)
  returns jsonb
  language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if p_clave is null or length(p_clave) < 8 or length(p_clave) > 200 then raise exception 'clave invalida'; end if;
  select huella into h from panel_clave where id = 1;
  if h is null or crypt(p_clave, h) <> h then raise exception 'clave invalida'; end if;
  return control_mam_datos();
end; $$;

revoke all on function control_mam(text) from public;
grant execute on function control_mam(text) to anon, authenticated;
