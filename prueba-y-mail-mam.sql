-- ══════════════════════════════════════════════════════════════════════════
-- PRUEBA DE 7 DÍAS Y MAIL DEL DESAFÍO (27/10/2026)
-- Ya aplicado en Supabase desde la sesión. Queda acá como copia.
--
-- 1. La prueba gratis de Mano a mano (web): quien tiene cuenta toca "7 días gratis" y la app le da
--    fútbol, tenis y NBA por los días que diga el ajuste prueba_mam_dias (hoy 7). Una vez por cuenta.
--    En las tiendas la prueba la define la tienda (oferta introductoria en App Store Connect y Play).
-- 2. El mail del desafío: tablas mail_baja y mail_enviado, y las tres funciones que usa la Edge
--    Function mail-desafio (funcion-mail-desafio.ts). Un mail por desafío por persona; la baja es para siempre.
-- 3. El reloj: pg_cron llama a mail-desafio cada hora entre las 10 y las 20 (hora argentina). La
--    función no manda dos veces el mismo desafío, así que llamar de más no duele.
-- ══════════════════════════════════════════════════════════════════════════

-- ── ajustes ──
insert into ajuste (clave, valor) values ('prueba_mam_dias', '7'), ('prueba_sacavos_dias', '7'), ('prueba_quinteto_dias', '7')
  on conflict (clave) do update set valor = excluded.valor;

-- ── la prueba ──
CREATE OR REPLACE FUNCTION public.estado_prueba_mam()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare quien uuid := auth.uid(); usada timestamptz; h timestamptz; dias int;
begin
  select greatest(coalesce(nullif(valor, '')::int, 7), 1) into dias from ajuste where clave = 'prueba_mam_dias';
  if quien is null then return jsonb_build_object('dias', coalesce(dias, 7), 'puede', false, 'motivo', 'sin cuenta'); end if;
  select p.desde, p.hasta into usada, h from prueba p where p.perfil = quien and p.producto = 'mam';
  if usada is not null then return jsonb_build_object('dias', coalesce(dias, 7), 'puede', false, 'usada', usada, 'hasta', h, 'activa', h > now()); end if;
  -- quien ya tiene un plan pago vigente no necesita la prueba
  if exists (select 1 from perfil where id = quien and plan not in ('gratis', 'prueba') and premium_hasta > now())
     or exists (select 1 from pase where perfil = quien and hasta > now()) then
    return jsonb_build_object('dias', coalesce(dias, 7), 'puede', false, 'motivo', 'con plan');
  end if;
  return jsonb_build_object('dias', coalesce(dias, 7), 'puede', true);
end $function$;

CREATE OR REPLACE FUNCTION public.empezar_prueba_mam()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare quien uuid := auth.uid(); est jsonb; dias int; h timestamptz;
begin
  if quien is null then raise exception 'Primero elige un apodo.'; end if;
  if not exists (select 1 from perfil where id = quien) then raise exception 'Primero elige un apodo.'; end if;
  est := estado_prueba_mam();
  if not (est->>'puede')::boolean then
    if est ? 'usada' then raise exception 'La prueba gratis ya se usó en esta cuenta.'; end if;
    raise exception 'Ya tienes un plan activo.';
  end if;
  dias := (est->>'dias')::int; h := now() + make_interval(days => dias);
  insert into prueba (perfil, producto, desde, hasta) values (quien, 'mam', now(), h) on conflict (perfil, producto) do nothing;
  -- fútbol: lo que lee Armá el 11
  update perfil set premium_hasta = h, plan = case when plan is null or plan = 'gratis' then 'prueba' else plan end
   where id = quien and (premium_hasta is null or premium_hasta < h);
  -- tenis y NBA: lo que leen sus webs; si ya tenían una prueba vencida, se extiende hasta h
  insert into prueba (perfil, producto, desde, hasta) values (quien, 'sacavos', now(), h), (quien, 'quinteto', now(), h)
    on conflict (perfil, producto) do update set hasta = greatest(prueba.hasta, excluded.hasta);
  return jsonb_build_object('hasta', h, 'dias', dias);
end $function$;

CREATE OR REPLACE FUNCTION public.mis_pases_mam()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'futbol', (select case when plan <> 'gratis' and premium_hasta > now() then premium_hasta end from perfil where id = auth.uid()),
    'tenis',  greatest((select hasta from pase where perfil = auth.uid() and producto = 'sacavos' and hasta > now()),
                       (select hasta from prueba where perfil = auth.uid() and producto = 'sacavos' and hasta > now())),
    'nba',    greatest((select hasta from pase where perfil = auth.uid() and producto = 'quinteto' and hasta > now()),
                       (select hasta from prueba where perfil = auth.uid() and producto = 'quinteto' and hasta > now())),
    'prueba', (select jsonb_build_object('desde', desde, 'hasta', hasta) from prueba where perfil = auth.uid() and producto = 'mam')
  );
$function$;
-- Sin sesión devuelven "sin cuenta" o cortan con error: no hace falta esconderlas de anon.
grant execute on function public.estado_prueba_mam(), public.empezar_prueba_mam(), public.mis_pases_mam() to anon, authenticated;

-- ── el mail ──
create table if not exists public.mail_baja (
  perfil uuid primary key references public.perfil(id) on delete cascade,
  cuando timestamptz not null default now()
);
create table if not exists public.mail_enviado (
  perfil uuid not null references public.perfil(id) on delete cascade,
  tipo   text not null,
  clave  text not null,
  cuando timestamptz not null default now(),
  primary key (perfil, tipo, clave)
);
alter table public.mail_baja enable row level security;
alter table public.mail_enviado enable row level security;

CREATE OR REPLACE FUNCTION public.mail_destinatarios(p_tipo text, p_clave text)
 RETURNS TABLE(id uuid, email text, usuario text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select u.id, u.email::text, p.usuario
    from auth.users u join public.perfil p on p.id = u.id
   where u.email is not null and u.email_confirmed_at is not null
     and coalesce(u.is_anonymous, false) = false
     and not exists (select 1 from public.mail_baja b where b.perfil = u.id)
     and not exists (select 1 from public.mail_enviado e where e.perfil = u.id and e.tipo = p_tipo and e.clave = p_clave)
   order by u.created_at;
$function$;
CREATE OR REPLACE FUNCTION public.mail_marcar(p_perfil uuid, p_tipo text, p_clave text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.mail_enviado (perfil, tipo, clave) values (p_perfil, p_tipo, p_clave) on conflict do nothing;
$function$;
CREATE OR REPLACE FUNCTION public.mail_dar_baja(p_perfil uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.mail_baja (perfil) values (p_perfil) on conflict do nothing;
$function$;
-- Solo la service role (la Edge Function) las llama: nada de anon ni authenticated.
revoke all on function public.mail_destinatarios(text, text) from public, anon, authenticated;
revoke all on function public.mail_marcar(uuid, text, text) from public, anon, authenticated;
revoke all on function public.mail_dar_baja(uuid) from public, anon, authenticated;

-- ── el reloj (pg_cron): cada hora de 10 a 20, hora argentina (13 a 23 UTC) ──
-- La frase secreta (RESOLVER_CLAVE) no va en este archivo: el job la toma del job resolver-desafios, que ya la tiene.
select cron.schedule('mail-desafio', '37 13-23 * * *', $$
  select net.http_post(
    url := 'https://wbqxmoerzofzierurxfb.supabase.co/functions/v1/mail-desafio',
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' || (select substring(command from 'Bearer ([^"]+)') from cron.job where jobname = 'resolver-desafios') || '"}')::jsonb,
    body := '{}'::jsonb);
$$);
