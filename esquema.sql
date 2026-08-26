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
