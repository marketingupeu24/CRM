-- Historial de movimientos de leads entre asesores: de quién a quién, por qué y cuánto lo tuvo.
-- Sirve para ver quiénes no contactan a tiempo (los leads que les salen) y adónde van.
-- Lo llena un trigger en cada cambio de asesor (automático, reparto o a mano desde el panel).

create table public.movimientos_lead (
  id            bigint generated always as identity primary key,
  lead_id       uuid not null references public.leads(id) on delete cascade,
  de_asesor_id  uuid references public.asesores(id) on delete set null,
  a_asesor_id   uuid references public.asesores(id) on delete set null,
  -- Nombres al momento del movimiento (por si luego se renombra o elimina al asesor)
  de_nombre     text,
  a_nombre      text,
  motivo        text not null,
  -- Quién lo cambió (null = el sistema)
  por_asesor_id uuid references public.asesores(id) on delete set null,
  -- Desde cuándo lo tenía el asesor anterior
  tuvo_desde    timestamptz,
  created_at    timestamptz not null default now()
);
create index movimientos_lead_fecha_idx on public.movimientos_lead (created_at desc);
create index movimientos_lead_de_idx on public.movimientos_lead (de_asesor_id, created_at desc);
create index movimientos_lead_a_idx on public.movimientos_lead (a_asesor_id, created_at desc);
create index movimientos_lead_lead_idx on public.movimientos_lead (lead_id);

alter table public.movimientos_lead enable row level security;
-- Con "Dashboard de todo el equipo" o "Ver leads de todo el equipo" ve todo; el asesor, solo lo que le salió o le llegó
create policy "movimientos: ver" on public.movimientos_lead for select to authenticated
  using (public.tiene_permiso('dashboard_todos') or public.tiene_permiso('ver_todos')
         or de_asesor_id = public.mi_asesor_id() or a_asesor_id = public.mi_asesor_id());
revoke all on public.movimientos_lead from anon;
grant select on public.movimientos_lead to authenticated;

create or replace function public.fn_leads_movimiento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.asesor_id is not null and new.asesor_id is distinct from old.asesor_id then
    insert into public.movimientos_lead (lead_id, de_asesor_id, a_asesor_id, de_nombre, a_nombre, motivo, por_asesor_id, tuvo_desde)
    values (new.id, old.asesor_id, new.asesor_id,
            (select nombre from public.asesores where id = old.asesor_id),
            (select nombre from public.asesores where id = new.asesor_id),
            coalesce(nullif(current_setting('crm.motivo_movimiento', true), ''),
                     case when public.mi_asesor_id() is not null then 'Cambio manual' else 'Automático' end),
            public.mi_asesor_id(), old.fecha_asignado);
  end if;
  return null;
end $function$;

create trigger trg_leads_movimiento after update of asesor_id on public.leads
  for each row execute function public.fn_leads_movimiento();

-- La reasignación automática deja su motivo
CREATE OR REPLACE FUNCTION public.reasignar_sin_contacto(p_horas integer DEFAULT 4, p_maximo integer DEFAULT 2, p_solo_horario boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lead      public.leads;
  v_anterior  public.asesores;
  v_nuevo     public.asesores;
  v_cambios   jsonb := '[]'::jsonb;
begin
  -- Solo en horario de atención (fuera de él nadie puede responder: no se rota)
  if p_solo_horario and not public.en_horario_atencion() then
    return v_cambios;
  end if;

  perform set_config('crm.asignacion_sistema', 'on', true);
  perform set_config('crm.motivo_movimiento', 'No contactado en ' || p_horas || ' h hábiles', true);

  for v_lead in
    select * from public.leads
    where estado = 'lead_asignado'
      and eliminado_at is null
      and asesor_id is not null
      and primer_contacto_asesor_at is null
      -- Plazo en horas HÁBILES: un lead del sábado no se quita el lunes a las 8:00
      and public.horas_habiles(fecha_asignado, now()) >= p_horas
      and reasignaciones < p_maximo
      -- Postula a otra sede: no se pasa a otro asesor de Juliaca
      and coalesce(sede, '') !~* '(lima|tarapoto)'
    order by fecha_asignado
    for update skip locked
  loop
    select * into v_anterior from public.asesores where id = v_lead.asesor_id;

    -- Mismo reparto que asignar_asesor_lead, sin el asesor actual
    select * into v_nuevo from public.asesores
    where activo and id <> v_lead.asesor_id
      and case when v_lead.programa = 'cepre' then 'CEPRE' = any (carreras)
               else v_lead.carrera_interes = any (carreras) end
    order by ultimo_lead_asignado nulls first, created_at, nombre
    limit 1 for update skip locked;

    if v_nuevo.id is null then
      select * into v_nuevo from public.asesores
      where activo and id <> v_lead.asesor_id and carreras = '{}'
      order by ultimo_lead_asignado nulls first, created_at, nombre
      limit 1 for update skip locked;
    end if;

    continue when v_nuevo.id is null;   -- no hay a quién pasarlo

    -- clock_timestamp(): avanza dentro de la tanda, así el siguiente lead va al siguiente asesor
    update public.asesores set ultimo_lead_asignado = clock_timestamp() where id = v_nuevo.id;
    update public.leads
    set asesor_id = v_nuevo.id,
        fecha_asignado = now(),
        reasignaciones = reasignaciones + 1,
        notificacion_estado = 'pendiente'
    where id = v_lead.id;

    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'sistema',
            format('Reasignado automáticamente de %s a %s: no fue contactado en %s h hábiles', v_anterior.nombre, v_nuevo.nombre, p_horas));

    v_cambios := v_cambios || jsonb_build_object(
      'lead_id', v_lead.id, 'asesor_anterior', v_anterior.nombre,
      'asesor_nuevo', v_nuevo.nombre, 'asesor_telefono', v_nuevo.telefono);
  end loop;

  return v_cambios;
end $function$;;

-- Historial anterior, desde las notas del sistema
insert into public.movimientos_lead (lead_id, de_asesor_id, a_asesor_id, de_nombre, a_nombre, motivo, created_at)
select i.lead_id, a1.id, a2.id, x.de, x.a,
       case when i.contenido like 'Redistribuido%' then 'Reparto parejo (29/10)'
            else 'No contactado en ' || coalesce(substring(i.contenido from 'en (\d+) h'), '4') || ' h hábiles' end,
       i.created_at
from public.lead_interacciones i
cross join lateral (select substring(i.contenido from '^(?:Reasignado automáticamente|Redistribuido por igual) de (.+?) a (?:.+?)(?::| \()') de,
                           substring(i.contenido from '^(?:Reasignado automáticamente|Redistribuido por igual) de .+? a (.+?)(?::| \()') a) x
left join lateral (select id from public.asesores where nombre = x.de order by eliminado_at nulls first limit 1) a1 on true
left join lateral (select id from public.asesores where nombre = x.a order by eliminado_at nulls first limit 1) a2 on true
where i.contenido ~ '^(Reasignado automáticamente|Redistribuido por igual) de '
union all
select i.lead_id, null, a2.id, null, x.a, 'Devuelto (caída de WhatsApp 21–22/10)', i.created_at
from public.lead_interacciones i
cross join lateral (select substring(i.contenido from '^Devuelto a (.+?):') a) x
left join lateral (select id from public.asesores where nombre = x.a order by eliminado_at nulls first limit 1) a2 on true
where i.contenido like 'Devuelto a %';
