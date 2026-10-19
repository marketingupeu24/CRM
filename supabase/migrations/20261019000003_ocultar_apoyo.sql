-- "Atendidos como apoyo": cada asesor puede quitar de su vista los leads que ya no necesita ver.
-- No se borra el apoyo (queda el registro de que lo atendió); solo se oculta de su lista.

alter table public.lead_apoyo add column if not exists oculto_at timestamptz;

create or replace function public.ocultar_apoyo(p_lead_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.lead_apoyo set oculto_at = now()
  where lead_id = p_lead_id and asesor_id = public.mi_asesor_id() and oculto_at is null;
$$;

revoke all on function public.ocultar_apoyo(uuid) from public, anon;
grant execute on function public.ocultar_apoyo(uuid) to authenticated;

create or replace function public.mis_leads_apoyo()
returns table(id uuid, nombre text, telefono text, asesor text, motivo text, desde timestamptz, ultimo_contacto timestamptz, cubriendo boolean)
language sql
stable
security definer
set search_path = ''
as $$
  (select l.id, l.nombre, l.telefono, a.nombre, ap.motivo, ap.created_at, l.ultimo_contacto, false
   from public.lead_apoyo ap
   join public.leads l on l.id = ap.lead_id and l.eliminado_at is null
   left join public.asesores a on a.id = l.asesor_id
   where ap.asesor_id = public.mi_asesor_id() and ap.oculto_at is null
   order by ap.created_at desc
   limit 50)
  union all
  (select l.id, l.nombre, l.telefono, a.nombre,
          'lo cubres hasta ' || to_char(a.ausente_hasta at time zone 'America/Lima', 'DD/MM HH24:MI'),
          a.ausente_desde, l.ultimo_contacto, true
   from public.asesores a
   join public.leads l on l.asesor_id = a.id and l.eliminado_at is null
   where a.ausencia_activa and a.ausente_reemplazo = public.mi_asesor_id()
     and l.estado not in ('lead_perdido', 'lead_no_interesado', 'lead_matriculado')
   order by l.sin_responder desc, l.ultimo_contacto desc nulls last
   limit 200)
$$;
