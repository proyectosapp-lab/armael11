-- ══════════════════════════════════════════════════════════════════════════
-- CONTADOR DE CAMPAÑA  —  pegar entero en Supabase → SQL Editor → Run.
--
-- Se puede correr las veces que haga falta: no borra nada y no pisa datos.
--
-- QUÉ GUARDA. Una fila por código de campaña, día e hito, con un número:
--
--     codigo | dia        | hito   | cuenta
--     ig1    | 2026-09-19 | llego  |    143
--     ig1    | 2026-09-19 | simulo |     38
--
-- Y NADA MÁS. No hay identificador de persona, no hay IP, no hay hora. El
-- "este teléfono ya lo conté" vive en el navegador y nunca sale de ahí. Eso
-- significa que no se puede reconstruir el recorrido de nadie, y está bien:
-- la pregunta es "de cien que entraron, cuántos jugaron", y para eso
-- alcanzan dos números.
--
-- LO QUE ESTO NO ES. No tiene defensa contra alguien que llame a la función
-- mil veces a mano desde una consola. Es un contador de vanidad: el daño
-- posible es un número equivocado en una tabla que mira una sola persona.
-- Ponerle autenticación costaría más de lo que vale.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists campana_hito (
  codigo  text not null,
  dia     date not null,
  hito    text not null,
  cuenta  integer not null default 0,
  primary key (codigo, dia, hito)
);

-- La tabla no se lee ni se escribe directo desde el navegador: todo pasa por
-- la función de abajo. Con RLS prendida y sin políticas, la clave `anon` no
-- puede tocarla ni para leer.
alter table campana_hito enable row level security;

-- ─── la función ───────────────────────────────────────────────────────────
-- `security definer` porque corre con permisos de la tabla aunque quien la
-- llame no los tenga. Es el mismo patrón de `anotar_aviso`.
--
-- Valida y se calla. Un código inventado no tira error: devuelve sin hacer
-- nada. Un error acá le aparecería en la consola a un visitante que no tiene
-- idea de qué es esto, y no arregla nada.
--
-- El día se calcula en hora argentina y no en UTC: un partido del domingo a
-- la noche cae en UTC del lunes, y una tabla donde el domingo termina a las
-- nueve de la noche es una tabla que se lee mal.
create or replace function sumar_hito(p_codigo text, p_hito text)
  returns void
  language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if p_codigo is null or p_codigo !~ '^[a-z0-9_-]{1,24}$' then return; end if;
  if p_hito   is null or p_hito   !~ '^[a-z]{1,16}$'      then return; end if;

  insert into campana_hito (codigo, dia, hito, cuenta)
  values (p_codigo, d, p_hito, 1)
  on conflict (codigo, dia, hito)
  do update set cuenta = campana_hito.cuenta + 1;
end; $$;

revoke all on function sumar_hito(text, text) from public;
grant execute on function sumar_hito(text, text) to anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════════
-- PARA MIRAR EL LUNES. Se pega esto solo y se aprieta Run.
--
-- La columna que importa es `de_cada_100_simularon`. El costo por visita lo
-- dice Meta; esto dice si esas visitas sirvieron para algo.
-- ══════════════════════════════════════════════════════════════════════════

-- select codigo,
--        sum(cuenta) filter (where hito = 'llego')   as llegaron,
--        sum(cuenta) filter (where hito = 'simulo')  as simularon,
--        sum(cuenta) filter (where hito = 'instalo') as instalaron,
--        sum(cuenta) filter (where hito = 'cuenta')  as cuentas,
--        round(100.0 * sum(cuenta) filter (where hito = 'simulo')
--                    / nullif(sum(cuenta) filter (where hito = 'llego'), 0), 1)
--          as de_cada_100_simularon
--   from campana_hito
--  group by codigo
--  order by llegaron desc;

-- Y día por día, para ver si el anuncio se gasta con los días:
--
-- select dia, hito, cuenta from campana_hito
--  where codigo = 'ig1' order by dia, hito;
