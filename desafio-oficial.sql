-- ══════════════════════════════════════════════════════════════════════════
-- EL DESAFÍO OFICIAL (17/10/2026)
--
-- Un desafío armado por Mano a mano (apodo `manoamano`) al que se suma
-- cualquiera con el código, sin tener que armar nada. Se publica en
-- Instagram y la app lo muestra arriba de todo en Desafíos.
--
--   · desafio.oficial: marca el desafío. El que está vigente se anuncia en
--     ajuste 'desafio_oficial' = código (la app lo lee como lee 'cobra').
--   · unirse_desafio: el tope de 50 jugadores no corre para el oficial.
--   · ver_desafio: en el oficial la tabla trae los 20 primeros más uno
--     mismo, y las elecciones de esos; `total` dice cuántos juegan.
--
-- Ya está aplicado en la base. Se puede correr de nuevo sin problema.
-- ══════════════════════════════════════════════════════════════════════════

alter table desafio add column if not exists oficial boolean not null default false;

create or replace function unirse_desafio(p_codigo text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare yo uuid := auth.uid(); d uuid; es_oficial boolean;
begin
  if yo is null then raise exception 'hay que entrar primero'; end if;
  if not exists (select 1 from perfil where id = yo) then raise exception 'falta el apodo'; end if;
  select id, oficial into d, es_oficial from desafio where codigo = upper(trim(p_codigo));
  if d is null then raise exception 'ese desafío no existe'; end if;
  if not es_oficial and (select count(*) from desafio_jugador where desafio = d) >= 50 then raise exception 'el desafío está lleno (50)'; end if;
  insert into desafio_jugador (desafio, perfil) values (d, yo) on conflict do nothing;
  return d;
end; $$;
revoke all on function unirse_desafio(text) from public, anon;
grant execute on function unirse_desafio(text) to authenticated;

create or replace function ver_desafio(p_codigo text) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare yo uuid := auth.uid(); d desafio%rowtype; salida jsonb; visibles uuid[];
begin
  select * into d from desafio where codigo = upper(trim(p_codigo));
  if d.id is null then return null; end if;
  /* en el oficial puede haber cientos: se muestran los 20 de arriba y uno mismo. Mano a mano (el creador) no juega. */
  if d.oficial then
    select array_agg(perfil) into visibles from (
      (select perfil from desafio_jugador where desafio = d.id and perfil is distinct from d.creador order by puntos desc, unido limit 20)
      union select yo where yo is not null and exists (select 1 from desafio_jugador where desafio = d.id and perfil = yo)) v;
  else
    select array_agg(perfil) into visibles from desafio_jugador where desafio = d.id;
  end if;
  visibles := coalesce(visibles, '{}');
  select jsonb_build_object(
    'codigo', d.codigo, 'nombre', d.nombre, 'estado', d.estado, 'creado', d.creado, 'oficial', d.oficial,
    'creador', (select usuario from perfil where id = d.creador),
    'total', (select count(*) from desafio_jugador where desafio = d.id and (not d.oficial or perfil is distinct from d.creador)),
    'soy', (yo is not null and exists (select 1 from desafio_jugador where desafio = d.id and perfil = yo)),
    'partidos', (select coalesce(jsonb_agg(jsonb_build_object(
        'deporte', p.deporte, 'partido', p.partido, 'empieza', p.empieza, 'local', p.local, 'visita', p.visita,
        'rotulo', p.rotulo, 'opciones', p.opciones, 'resultado', p.resultado,
        'empezo', p.empieza <= now(),
        'modelo', case when p.empieza <= now() then p.modelo else null end,
        'modelo_p', case when p.empieza <= now() then p.modelo_p else null end,
        'mia', (select e.eleccion from desafio_eleccion e where e.desafio = d.id and e.deporte = p.deporte and e.partido = p.partido and e.perfil = yo),
        'elecciones', case when p.empieza <= now() then
          (select coalesce(jsonb_object_agg(pe.usuario, e.eleccion), '{}'::jsonb)
             from desafio_eleccion e join perfil pe on pe.id = e.perfil
            where e.desafio = d.id and e.deporte = p.deporte and e.partido = p.partido and e.perfil = any (visibles))
          else null end
      ) order by p.empieza, p.deporte, p.partido), '[]'::jsonb) from desafio_partido p where p.desafio = d.id),
    'jugadores', (select coalesce(jsonb_agg(jsonb_build_object(
        'apodo', pe.usuario, 'puntos', j.puntos, 'creador', j.perfil = d.creador, 'yo', j.perfil = yo,
        'elegidos', (select count(*) from desafio_eleccion e where e.desafio = d.id and e.perfil = j.perfil)
      ) order by j.puntos desc, j.unido), '[]'::jsonb)
      from desafio_jugador j join perfil pe on pe.id = j.perfil where j.desafio = d.id and j.perfil = any (visibles)),
    'modelo_puntos', (select count(*) from desafio_partido p where p.desafio = d.id and p.resultado is not null and p.modelo = p.resultado),
    'modelo_juega', (select count(*) from desafio_partido p where p.desafio = d.id and p.modelo is not null)
  ) into salida;
  return salida;
end; $$;
revoke all on function ver_desafio(text) from public;
grant execute on function ver_desafio(text) to anon, authenticated;

/* Para marcar uno nuevo como el oficial (lo corre Claude o se pega a mano):
     update desafio set oficial = true where codigo = 'XXXXXX';
     insert into ajuste (clave, valor) values ('desafio_oficial', 'XXXXXX')
       on conflict (clave) do update set valor = excluded.valor, cambiado = now();       */
