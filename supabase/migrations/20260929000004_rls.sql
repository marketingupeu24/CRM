-- =====================================================================
--  Migración 4: seguridad (RLS)
--  - El bot usa la service_role key (solo en el servidor), que ignora RLS.
--  - El panel usa la publishable/anon key + sesión del asesor:
--      * asesor: ve y edita solo sus leads.
--      * admin:  ve y edita todos los leads y administra asesores.
--  - Usuarios no autenticados (anon) no ven nada.
-- =====================================================================

alter table public.asesores           enable row level security;
alter table public.leads              enable row level security;
alter table public.lead_interacciones enable row level security;

-- Defensa extra: anon no tiene permisos sobre las tablas del CRM
revoke all on public.asesores, public.leads, public.lead_interacciones from anon;
revoke all on public.vista_leads_por_estado, public.vista_leads_por_carrera,
              public.vista_leads_por_asesor, public.vista_embudo_conversion,
              public.vista_leads_por_dia from anon;

grant select, insert, update, delete on public.asesores, public.leads to authenticated;
grant select, insert, update, delete on public.lead_interacciones to authenticated;
grant select on public.vista_leads_por_estado, public.vista_leads_por_carrera,
               public.vista_leads_por_asesor, public.vista_embudo_conversion,
               public.vista_leads_por_dia to authenticated;

-- ---------------------------------------------------------------------
-- asesores
-- ---------------------------------------------------------------------
create policy "asesores: ver el propio perfil o admin ve todos"
on public.asesores for select to authenticated
using (user_id = (select auth.uid()) or (select public.es_admin()));

create policy "asesores: solo admin crea"
on public.asesores for insert to authenticated
with check ((select public.es_admin()));

create policy "asesores: solo admin edita"
on public.asesores for update to authenticated
using ((select public.es_admin()))
with check ((select public.es_admin()));

create policy "asesores: solo admin elimina"
on public.asesores for delete to authenticated
using ((select public.es_admin()));

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------
create policy "leads: asesor ve los suyos, admin ve todos"
on public.leads for select to authenticated
using (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()));

-- La reasignación (cambiar asesor_id) la bloquea el trigger fn_leads_before_update
create policy "leads: asesor edita los suyos, admin edita todos"
on public.leads for update to authenticated
using (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()))
with check (asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()));

create policy "leads: solo admin crea"
on public.leads for insert to authenticated
with check ((select public.es_admin()));

create policy "leads: solo admin elimina"
on public.leads for delete to authenticated
using ((select public.es_admin()));

-- ---------------------------------------------------------------------
-- lead_interacciones (historial)
-- ---------------------------------------------------------------------
create policy "interacciones: ver el historial de los leads visibles"
on public.lead_interacciones for select to authenticated
using (
  exists (
    select 1 from public.leads l
    where l.id = lead_id
      and (l.asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()))
  )
);

-- Desde el panel solo se crean notas del asesor, firmadas por él mismo
create policy "interacciones: el asesor agrega notas a sus leads"
on public.lead_interacciones for insert to authenticated
with check (
  tipo = 'nota_asesor'
  and autor_id = (select public.mi_asesor_id())
  and exists (
    select 1 from public.leads l
    where l.id = lead_id
      and (l.asesor_id = (select public.mi_asesor_id()) or (select public.es_admin()))
  )
);

-- El autor puede borrar su propia nota; el admin puede borrar cualquier nota
create policy "interacciones: borrar notas propias o admin"
on public.lead_interacciones for delete to authenticated
using (
  tipo = 'nota_asesor'
  and (autor_id = (select public.mi_asesor_id()) or (select public.es_admin()))
);
