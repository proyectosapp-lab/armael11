/* ==========================================================================
   TSTE - el esquema completo. Se pega entero en el editor SQL de Supabase.
   Se puede correr mas de una vez sin romper nada.

   LA REGLA QUE ORDENA TODO ESTO:

       el telefono escribe el EQUIPO, y solo antes del cierre.
       los PUNTOS los escribe el servidor.

   Y no es una promesa: esta puesta aca abajo, en las politicas. Aunque
   alguien abra la consola del navegador y mande el pedido a mano, la base
   le dice que no. Un juego donde el que sabe programar puede escribirse sus
   propios puntos no es un juego.

   Lo que NO se guarda, y es a proposito: nombres reales, clubes, escudos.
   La pantalla del torneo pago muestra usuarios y puntajes. Nada mas.

   NOTA SOBRE EL FORMATO: todos los comentarios de este archivo van entre
   barra-asterisco, y no con dos guiones. Los dos guiones son el comentario
   normal de SQL, pero hay editores de texto que los "corrigen" solos y los
   convierten en una raya larga al abrir el archivo. Cuando eso pasa, la
   primera linea deja de ser un comentario y Postgres corta con un error de
   sintaxis en la linea 1. Ya nos paso una vez.
   ========================================================================== */

/* ==========================================================================
   1. QUIEN SOS

   Un usuario y nada mas. El mail lo guarda Supabase en su propia tabla de
   cuentas; nosotros ni lo copiamos. Contrasenas no hay: se entra con un link
   que llega por mail, asi que no hay ninguna que podamos perder.
   ========================================================================== */

create table if not exists perfil (
  id       uuid primary key references auth.users on delete cascade,
  usuario  text unique not null check (usuario ~ '^[a-z0-9_]{3,16}$'),
  creado   timestamptz not null default now()
);
alter table perfil enable row level security;

drop policy if exists "los usuarios son publicos" on perfil;
create policy "los usuarios son publicos"
  on perfil for select using (true);

drop policy if exists "cada uno crea el suyo" on perfil;
create policy "cada uno crea el suyo"
  on perfil for insert with check (auth.uid() = id);

drop policy if exists "y edita solo el suyo" on perfil;
create policy "y edita solo el suyo"
  on perfil for update using (auth.uid() = id) with check (auth.uid() = id);


/* ==========================================================================
   2. LA FECHA Y SU CIERRE

   El cierre vive aca, en la base, y no en la app. Si viviera en la app, el
   cierre seria una sugerencia: bastaria con mandar el pedido por afuera.
   Nadie mas que el servidor puede escribir en esta tabla: no hay politica
   de insert ni de update, y sin politica, no se puede.
   ========================================================================== */

create table if not exists fechas (
  numero     int primary key,
  torneo     text not null default 'Clausura 2026',
  cierra     timestamptz not null,
  publicada  boolean not null default false
);
alter table fechas enable row level security;

drop policy if exists "las fechas son publicas" on fechas;
create policy "las fechas son publicas"
  on fechas for select using (true);


/* ==========================================================================
   3. TU EQUIPO

   Once titulares, cuatro suplentes (arquero, defensa, medio, ataque),
   capitan y vice. Los jugadores son ids de la API.

   Las validaciones de aca son las que no se pueden discutir: cuantos son.
   Las otras -presupuesto, maximo tres por club, formacion legal- dependen de
   los precios de esa fecha y las revisa el servidor cuando calcula. Poner
   media validacion en la base y media en la app es la peor de las opciones:
   da la sensacion de estar cubierto sin estarlo.
   ========================================================================== */

create table if not exists equipo (
  perfil     uuid not null references perfil(id) on delete cascade,
  fecha      int  not null references fechas(numero),
  titulares  int[] not null check (array_length(titulares, 1) = 11),
  suplentes  int[] not null check (array_length(suplentes, 1) = 4),
  capitan    int not null,
  vice       int not null,
  gasto      numeric(5,2) not null,
  guardado   timestamptz not null default now(),
  primary key (perfil, fecha)
);
alter table equipo enable row level security;

/* El equipo de los demas recien se ve cuando la fecha cerro. Antes, no: si
   tu amigo puede ver tu equipo el viernes, el juego se termina el viernes. */
drop policy if exists "el mio siempre, el de los demas cuando cierra" on equipo;
create policy "el mio siempre, el de los demas cuando cierra"
  on equipo for select using (
    auth.uid() = perfil
    or exists (select 1 from fechas f where f.numero = equipo.fecha and now() >= f.cierra)
  );

drop policy if exists "guardo el mio, antes del cierre" on equipo;
create policy "guardo el mio, antes del cierre"
  on equipo for insert with check (
    auth.uid() = perfil
    and exists (select 1 from fechas f where f.numero = equipo.fecha and now() < f.cierra)
  );

drop policy if exists "y lo cambio hasta el cierre" on equipo;
create policy "y lo cambio hasta el cierre"
  on equipo for update
  using (
    auth.uid() = perfil
    and exists (select 1 from fechas f where f.numero = equipo.fecha and now() < f.cierra)
  )
  with check (
    auth.uid() = perfil
    and exists (select 1 from fechas f where f.numero = equipo.fecha and now() < f.cierra)
  );

/* Borrar no se puede. Un equipo que se puede borrar despues de ver los
   resultados es un equipo que nunca existio. */


/* ==========================================================================
   4. LOS PUNTOS

   Los escribe la corrida de GitHub Actions con la clave de servidor, que es
   la unica que se saltea todo esto. Desde el navegador solo se leen.

   `detalle` guarda la cuenta abierta: que sumo cada jugador y por que, quien
   entro por suplencia, quien fue el mas valioso. Sin eso, "te dieron 47" es
   un numero que hay que creer. Con eso, es un numero que se revisa.
   ========================================================================== */

create table if not exists puntaje (
  perfil     uuid not null references perfil(id) on delete cascade,
  fecha      int  not null references fechas(numero),
  puntos     numeric(6,2) not null,
  detalle    jsonb not null default '{}'::jsonb,
  calculado  timestamptz not null default now(),
  primary key (perfil, fecha)
);
alter table puntaje enable row level security;

drop policy if exists "los puntajes son publicos" on puntaje;
create policy "los puntajes son publicos"
  on puntaje for select using (true);
/* (sin politicas de escritura: solo la clave de servidor puede escribir) */


/* ==========================================================================
   5. LAS LIGAS DE AMIGOS
   ========================================================================== */

create table if not exists liga (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null check (char_length(nombre) between 3 and 40),
  codigo  text unique not null,
  dueno   uuid not null references perfil(id) on delete cascade,
  paga    boolean not null default false,
  creada  timestamptz not null default now()
);
alter table liga enable row level security;

create table if not exists liga_miembro (
  liga    uuid not null references liga(id) on delete cascade,
  perfil  uuid not null references perfil(id) on delete cascade,
  entro   timestamptz not null default now(),
  primary key (liga, perfil)
);
alter table liga_miembro enable row level security;

/* Preguntar "soy miembro?" desde la politica de la propia tabla de miembros
   se muerde la cola y Postgres corta con un error de recursion. La salida es
   una funcion que corre con permisos propios y no vuelve a pasar por las
   politicas. Es un rodeo conocido, no un truco. */
create or replace function es_miembro(l uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from liga_miembro where liga = l and perfil = auth.uid());
$$;

drop policy if exists "veo las ligas donde estoy" on liga;
create policy "veo las ligas donde estoy"
  on liga for select using (es_miembro(id));

drop policy if exists "cualquiera crea una liga" on liga;
create policy "cualquiera crea una liga"
  on liga for insert with check (auth.uid() = dueno);

drop policy if exists "veo a los de mis ligas" on liga_miembro;
create policy "veo a los de mis ligas"
  on liga_miembro for select using (es_miembro(liga));

drop policy if exists "me sumo yo, a nadie mas" on liga_miembro;
create policy "me sumo yo, a nadie mas"
  on liga_miembro for insert with check (auth.uid() = perfil);

drop policy if exists "y me puedo ir" on liga_miembro;
create policy "y me puedo ir"
  on liga_miembro for delete using (auth.uid() = perfil);

/* Entrar con el codigo. Tiene que ser una funcion y no un select porque para
   entrar hay que encontrar la liga, y para encontrarla habria que poder
   leerla, y solo se pueden leer las ligas donde uno ya esta. La funcion
   rompe el circulo: recibe el codigo, entra, y no deja mirar nada mas. */
create or replace function entrar_a_liga(cod text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  if auth.uid() is null then raise exception 'hay que entrar primero'; end if;
  select id into l from liga where codigo = upper(trim(cod));
  if l is null then raise exception 'ese codigo no existe'; end if;
  insert into liga_miembro (liga, perfil) values (l, auth.uid())
    on conflict do nothing;
  return l;
end; $$;


/* ==========================================================================
   6. UNA MANO PARA LAS TABLAS

   La tabla de una liga es un join de tres cosas y se pide muchas veces. Va
   como funcion para que el telefono pida una sola cosa y no arme el join.
   ========================================================================== */

create or replace function tabla_liga(l uuid, f int default null)
  returns table (usuario text, puntos numeric)
  language sql security definer stable set search_path = public as $$
  select p.usuario, coalesce(sum(pt.puntos), 0)::numeric
    from liga_miembro m
    join perfil p  on p.id = m.perfil
    left join puntaje pt on pt.perfil = m.perfil and (f is null or pt.fecha = f)
   where m.liga = l and es_miembro(l)
   group by p.usuario
   order by 2 desc, 1;
$$;


/* ==========================================================================
   7. BORRAR LA PROPIA CUENTA

   Google Play lo exige para toda app que deje crear una cuenta: se tiene que
   poder borrar DESDE ADENTRO de la app y tambien desde una direccion web,
   sin instalar nada. Sin eso no se publica.

   Pero no es un tramite: es lo minimo decente. Alguien que entrego su mail
   tiene que poder retirarlo sin escribirle a nadie y sin esperar respuesta.

   POR QUE UNA FUNCION Y NO UN DELETE. El telefono no puede borrar la fila de
   `auth.users`: esa tabla no la maneja el usuario, la maneja Supabase. Una
   funcion `security definer` corre con permisos propios y hace lo que el
   telefono no puede - pero SOLO sobre `auth.uid()`, que es quien pidio, y
   nunca sobre otro. Ese es todo el poder que tiene y no hay forma de
   pedirle mas: no recibe ningun parametro.

   Lo demas se va solo: `perfil` referencia a `auth.users` con
   `on delete cascade`, y de `perfil` cuelgan el equipo, los puntajes y las
   membresias de liga. Borrar el usuario borra el rastro entero.

   LO QUE NO SE BORRA, y esta bien que no: las ligas que la persona CREO. Si
   se fueran con ella, el dia que alguien se va desaparece el torneo de doce
   amigos que no tienen nada que ver. La liga queda; la persona se va de la
   tabla como cualquier otro miembro. Por eso `liga.dueno` NO cascadea aca.
   ========================================================================== */

/* La liga sobrevive al que la creo. Antes `dueno` apuntaba a `perfil` con
   cascade y borrarse se llevaba puesto el torneo de todos. */
alter table liga drop constraint if exists liga_dueno_fkey;
alter table liga alter column dueno drop not null;
alter table liga add constraint liga_dueno_fkey
  foreign key (dueno) references perfil(id) on delete set null;

create or replace function borrar_mi_cuenta() returns void
  language plpgsql security definer set search_path = public, auth as $$
declare yo uuid := auth.uid();
begin
  if yo is null then raise exception 'hay que entrar primero'; end if;
  /* Se borra el usuario y el resto cae por cascada. */
  delete from auth.users where id = yo;
end; $$;

revoke all on function borrar_mi_cuenta() from public;
grant execute on function borrar_mi_cuenta() to authenticated;


/* ==========================================================================
   8. EL PREMIUM

   Lo que se compra: simular sin espera, las ligas del mundo y sin avisos.

   ES UNA FECHA, NO UN SI/NO. Un booleano se prende y no se apaga nunca:
   quedaria gente premium para siempre por una compra de un mes. Guardar
   HASTA CUANDO es la unica forma de que se venza solo, sin que nadie tenga
   que acordarse de apagarlo.

   Y LO ESCRIBE EL SERVIDOR, COMO LOS PUNTAJES. Acá hay una trampa que la
   RLS sola no tapa: las politicas son por FILA, no por columna, y la de
   `perfil` ya deja que cada uno modifique la suya -la necesita para elegir
   su nombre de usuario-. Con eso solo, cualquiera podria mandar un update
   poniendose premium hasta el 2099 desde la consola del navegador.

   La defensa correcta es un permiso por COLUMNA: se le saca el update de
   `premium_hasta` a los usuarios. Postgres lo soporta y es exacto: pueden
   seguir cambiando su usuario y no pueden tocar el vencimiento.
   ========================================================================== */

alter table perfil add column if not exists premium_hasta timestamptz;

/* El update de la columna se le saca a todos y no se le da a nadie: solo la
   clave de servicio, que no pasa por estos permisos, puede escribirla. */
revoke update (premium_hasta) on perfil from authenticated, anon;

/* Los pagos, para poder responder "esto ya lo cobre" y no acreditar dos
   veces. Mercado Pago puede mandar el mismo aviso varias veces: es normal y
   hay que aguantarlo, no evitarlo.

   El id del pago es la clave primaria, y ahi esta toda la defensa contra el
   duplicado: el segundo aviso choca y no hace nada. */
create table if not exists pago (
  id         text primary key,          /* el id que da Mercado Pago */
  perfil     uuid references perfil(id) on delete set null,
  monto      numeric(10,2),
  moneda     text,
  estado     text not null,
  meses      int  not null default 1,
  crudo      jsonb not null default '{}'::jsonb,
  recibido   timestamptz not null default now(),
  /* No alcanza con "existe la fila". Un pago avisa varias veces y CAMBIA de
     estado en el camino: primero llega "pendiente" y despues "aprobado". Si
     la defensa fuera "si la fila ya esta, no hago nada", el que paga con
     efectivo nunca cobraria su premium: el primer aviso lo deja anotado y el
     segundo, el bueno, rebota. Lo que hay que anotar no es si lo vimos, sino
     si ya lo cobramos. */
  acreditado boolean not null default false
);
alter table pago add column if not exists acreditado boolean not null default false;
alter table pago enable row level security;
/* Sin ninguna politica: la tabla de pagos no se lee ni se escribe desde
   ningun telefono. Solo la clave de servicio. */

create index if not exists pago_perfil_idx on pago (perfil, recibido desc);

/* Acreditar. La escribe el servidor cuando Mercado Pago confirma, y suma
   sobre lo que quedaba: el que renueva antes de vencer no pierde los dias
   que le sobraban. */
create or replace function acreditar_premium(p uuid, meses int)
  returns timestamptz
  language plpgsql security definer set search_path = public as $$
declare desde timestamptz;
begin
  select greatest(coalesce(premium_hasta, now()), now()) into desde
    from perfil where id = p;
  if desde is null then raise exception 'ese perfil no existe'; end if;
  update perfil set premium_hasta = desde + (meses || ' months')::interval
    where id = p;
  return (select premium_hasta from perfil where id = p);
end; $$;

revoke all on function acreditar_premium(uuid, int) from public, anon, authenticated;


/* ==========================================================================
   9. ANOTAR EL PAGO Y ACREDITARLO, EN UN SOLO MOVIMIENTO

   POR QUE ESTO NO ESTA EN LA FUNCION QUE HABLA CON MERCADO PAGO. Porque
   "fijarse si ya lo cobre" y "cobrarlo" tienen que pasar juntos o no pasar.
   Si fueran dos pedidos separados, dos avisos que llegan en el mismo segundo
   podrian leer los dos "todavia no" y acreditar los dos: un mes pago, dos
   meses entregados. Adentro de una funcion es una sola operacion y el
   segundo espera al primero.

   Los tres casos que tiene que aguantar, que son los que pasan de verdad:

     el mismo aviso dos veces     el segundo update no encuentra nada que
                                  acreditar y devuelve null: no pasa nada.
     pendiente y despues aprobado la fila se actualiza y recien ahi se
                                  acredita. Es el pago en efectivo.
     aprobado y despues devuelto  queda anotado el estado nuevo. El premium
                                  ya entregado NO se saca solo: sacarlo es
                                  una decision, y se toma mirando.

   Devuelve la fecha hasta cuando quedo el premium, o null si no habia nada
   que acreditar. Ese null es la respuesta a "esto ya lo cobre".
   ========================================================================== */
create or replace function registrar_pago(
    p_id text, p_perfil uuid, p_meses int, p_estado text,
    p_monto numeric, p_moneda text, p_crudo jsonb)
  returns timestamptz
  language plpgsql security definer set search_path = public as $$
declare falta boolean;
begin
  insert into pago (id, perfil, monto, moneda, estado, meses, crudo)
       values (p_id, p_perfil, p_monto, p_moneda, p_estado, greatest(p_meses, 1), p_crudo)
  on conflict (id) do update
     set estado = excluded.estado,
         crudo  = excluded.crudo,
         perfil = coalesce(pago.perfil, excluded.perfil);

  /* El candado. `for update` deja la fila tomada hasta el final: el aviso
     repetido que llegue mientras tanto espera aca y despues lee `acreditado`
     ya en true. */
  select (not acreditado) into falta from pago where id = p_id for update;

  /* Sin perfil no hay a quien acreditarle. Pasa si alguien paga por un link
     suelto, sin pasar por la app: queda anotado el pago y se resuelve a
     mano, que es mejor que reventar y que Mercado Pago siga reintentando. */
  if p_perfil is null or p_estado <> 'approved' or not falta then return null; end if;

  update pago set acreditado = true where id = p_id;
  return acreditar_premium(p_perfil, greatest(p_meses, 1));
end; $$;

/* Como la de acreditar: no se la puede llamar desde ningun telefono. La
   llama la funcion del webhook, que corre con la clave de servicio. */
revoke all on function registrar_pago(text, uuid, int, text, numeric, text, jsonb)
  from public, anon, authenticated;


/* ==========================================================================
   10. LAS FASES: DE UN GRUPO DE AMIGOS A UN TORNEO DE VERDAD

   El problema que resuelve. Un torneo de amigos se muere solo: doce
   personas juegan cinco fechas, gana uno, y no queda nada por hacer. El que
   gano no tiene contra quien seguir y los otros once ya saben que no
   ganan. La quinta fecha la juega la mitad.

   La idea es vieja y funciona: el grupo de amigos es la FASE
   CLASIFICATORIA. El que gana su grupo pasa a una zona donde compite
   contra ganadores de OTROS grupos, que no conoce. Y el que quedo afuera
   sigue jugando su liga igual, porque la liga no se termina.

   ─── LAS TRES DECISIONES ────────────────────────────────────────────────

   1. UNA FASE ES UN RANGO DE FECHAS, no una duracion en dias. El fantasy
      ya esta organizado por fechas y todo el mundo entiende "de la 8 a la
      12". Un torneo que se mide en dias tendria que explicar que pasa
      cuando se posterga una fecha; medido en fechas, no pasa nada.

   2. LOS EMPATES NO SE ROMPEN: PASAN LOS DOS. Cualquier desempate que
      inventemos -el mejor puntaje de una fecha, quien se anoto antes, el
      orden alfabetico- es una regla arbitraria que le saca el lugar a
      alguien que hizo exactamente los mismos puntos. Que una zona tenga
      once en vez de diez no le molesta a nadie; que a uno lo eliminen por
      una regla que no sabia que existia, si.

   3. LAS ZONAS SE ARMAN EN SERPENTINA, no cortando la lista. Si se cortara
      por puntaje, los diez mejores clasificados quedarian todos juntos en
      la zona A y los diez peores en la ultima: nueve de los diez mejores
      quedarian afuera en la ronda siguiente y la ultima zona la ganaria
      alguien que hizo la mitad de puntos. La serpentina reparte:
      1-2-3-4, 4-3-2-1, 1-2-3-4... y las zonas quedan parejas.

   Todo esto lo escribe el SERVIDOR, como los puntos. Ninguna de estas
   tablas tiene politica de escritura.
   ========================================================================== */

create table if not exists fase (
  id      uuid primary key default gen_random_uuid(),
  numero  int  not null unique,        /* 1 es la clasificatoria */
  nombre  text not null,
  desde   int  not null,               /* primera fecha del fantasy que cuenta */
  hasta   int  not null,               /* ultima */
  cerrada boolean not null default false,
  creada  timestamptz not null default now(),
  check (hasta >= desde)
);
alter table fase enable row level security;

/* El calendario es publico: saber que la fase 2 va de la 13 a la 17 no le
   dice nada de nadie, y sin eso la pantalla no puede explicar que esta
   pasando. */
drop policy if exists "el calendario se ve" on fase;
create policy "el calendario se ve" on fase for select using (true);

create table if not exists zona (
  id     uuid primary key default gen_random_uuid(),
  fase   uuid not null references fase(id) on delete cascade,
  nombre text not null,
  creada timestamptz not null default now()
);
alter table zona enable row level security;

create table if not exists zona_miembro (
  zona    uuid not null references zona(id) on delete cascade,
  perfil  uuid not null references perfil(id) on delete cascade,
  /* De donde salio: el NOMBRE del torneo que gano, no su id. Es lo que
     hace que la zona no sea una lista de desconocidos -"este gano Los
     Pibes del Barrio"- y no expone ninguna liga a la que no pertenezcas. */
  viene_de text,
  entro   timestamptz not null default now(),
  primary key (zona, perfil)
);
alter table zona_miembro enable row level security;

/* El mismo rodeo que con las ligas, por la misma razon: preguntar "estoy en
   esta zona?" desde la politica de la tabla de miembros se muerde la cola. */
create or replace function es_de_zona(z uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from zona_miembro where zona = z and perfil = auth.uid());
$$;

drop policy if exists "veo las zonas donde estoy" on zona;
create policy "veo las zonas donde estoy" on zona for select using (es_de_zona(id));

/* zona_miembro NO se lee desde ningun telefono: adentro hay uuids de perfil
   y no hacen falta para nada. La pantalla pide la tabla, que devuelve
   usuarios y puntos. Es la misma regla del torneo pago: usuarios y
   puntajes, nada mas. */

create or replace function tabla_zona(z uuid, f int default null)
  returns table (usuario text, puntos numeric, viene_de text)
  language sql security definer stable set search_path = public as $$
  select p.usuario, coalesce(sum(pt.puntos), 0)::numeric, m.viene_de
    from zona_miembro m
    join perfil p on p.id = m.perfil
    join zona  z2 on z2.id = m.zona
    join fase  fa on fa.id = z2.fase
    left join puntaje pt on pt.perfil = m.perfil
         and pt.fecha between fa.desde and fa.hasta
         and (f is null or pt.fecha = f)
   where m.zona = z and es_de_zona(z)
   group by p.usuario, m.viene_de
   order by 2 desc, 1;
$$;
