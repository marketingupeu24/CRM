-- =====================================================================
--  Respuestas rápidas personales y para todos.
--  - asesor_id null  = "para todos" (las administra quien tiene el permiso respuestas).
--  - asesor_id = X   = personal de X (con sus propios enlaces, su número, etc.).
--  - Cada asesor crea y edita sus personales, y elige cuáles usa en el chat
--    (respuestas_ocultas: las que decidió no usar; por defecto usa todas).
--  - Quien tiene el permiso respuestas (el super admin) ve todas y decide cuáles
--    son para todos y cuáles personales.
--  Las que ya existen quedan "para todos": nadie deja de verlas.
-- =====================================================================

alter table public.respuestas_rapidas
  add column if not exists asesor_id uuid references public.asesores(id) on delete cascade;
create index if not exists idx_respuestas_rapidas_asesor on public.respuestas_rapidas (asesor_id);
comment on column public.respuestas_rapidas.asesor_id is 'Null: para todos. Con valor: respuesta personal de ese asesor.';

drop policy if exists "respuestas: todos los usuarios del panel las ven" on public.respuestas_rapidas;
drop policy if exists "respuestas: solo admin crea" on public.respuestas_rapidas;
drop policy if exists "respuestas: solo admin edita" on public.respuestas_rapidas;
drop policy if exists "respuestas: solo admin elimina" on public.respuestas_rapidas;

create policy "respuestas: para todos, las mías o todas con permiso"
on public.respuestas_rapidas for select to authenticated
using (
  (asesor_id is null and (select public.mi_asesor_id()) is not null)
  or asesor_id = (select public.mi_asesor_id())
  or (select public.tiene_permiso('respuestas'))
);

create policy "respuestas: crear las mías o cualquiera con permiso"
on public.respuestas_rapidas for insert to authenticated
with check (asesor_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('respuestas')));

create policy "respuestas: editar las mías o cualquiera con permiso"
on public.respuestas_rapidas for update to authenticated
using (asesor_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('respuestas')))
with check (asesor_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('respuestas')));

create policy "respuestas: eliminar las mías o cualquiera con permiso"
on public.respuestas_rapidas for delete to authenticated
using (asesor_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('respuestas')));

-- Las que cada asesor decidió no usar en su chat
create table if not exists public.respuestas_ocultas (
  asesor_id    uuid   not null references public.asesores(id) on delete cascade,
  respuesta_id bigint not null references public.respuestas_rapidas(id) on delete cascade,
  primary key (asesor_id, respuesta_id)
);
create index if not exists idx_respuestas_ocultas_respuesta on public.respuestas_ocultas (respuesta_id);
alter table public.respuestas_ocultas enable row level security;
revoke all on public.respuestas_ocultas from anon;
grant select, insert, delete on public.respuestas_ocultas to authenticated;

create policy "respuestas ocultas: cada uno las suyas"
on public.respuestas_ocultas for all to authenticated
using (asesor_id = (select public.mi_asesor_id()))
with check (asesor_id = (select public.mi_asesor_id()));
