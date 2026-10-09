-- =====================================================================
--  Puntaje de interés del lead (0 a 100): para atender primero a los más
--  interesados. Se calcula con lo que hizo el alumno y se actualiza cada
--  10 minutos (cron). puntaje_motivos explica de dónde sale el número.
--   +15 carrera o programa definido      +15 registrado (dio su documento)
--   +20 preguntó costos                  +15 preguntó por inscripción/examen/requisitos
--   +10 volvió a escribir otro día       +15 vino en persona (QR, feria, oficina)
--   +10 respondió al asesor              +10 se le envió una proforma
--   -15 no escribe hace más de 14 días
--   Inscrito o matriculado = 100 · Perdido o no interesado = 0
-- =====================================================================

alter table public.leads
  add column if not exists puntaje         smallint not null default 0,
  add column if not exists puntaje_motivos text[]   not null default '{}';
create index if not exists leads_puntaje_idx on public.leads (puntaje desc) where eliminado_at is null;

create or replace function public.calcular_puntaje(p_lead_id uuid)
returns table (puntaje smallint, motivos text[])
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lead    public.leads;
  v_m       text[] := '{}';
  v_p       int := 0;
  v_textos  text;
  v_dias    int;
  v_primero timestamptz;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if v_lead.id is null then return; end if;
  if v_lead.estado in ('lead_inscrito', 'lead_matriculado') then
    return query select 100::smallint, array['Ya se inscribió']; return;
  end if;
  if v_lead.estado in ('lead_perdido', 'lead_no_interesado') then
    return query select 0::smallint, array['Perdido o no interesado']; return;
  end if;

  select string_agg(contenido, ' '), count(distinct (created_at at time zone 'America/Lima')::date)
    into v_textos, v_dias
  from public.lead_interacciones where lead_id = v_lead.id and tipo = 'mensaje_lead';

  if coalesce(v_lead.carrera_interes, v_lead.modalidad) is not null or v_lead.programa = 'cepre' then
    v_p := v_p + 15; v_m := array_append(v_m, 'Carrera definida');
  end if;
  if v_lead.dni is not null then
    v_p := v_p + 15; v_m := array_append(v_m, 'Registrado');
  end if;
  if coalesce(v_textos, '') ~* '(cost|precio|cu[aá]nto|pensi[oó]n|mensual|cuota|pago|inversi[oó]n)' then
    v_p := v_p + 20; v_m := array_append(v_m, 'Preguntó costos');
  end if;
  if coalesce(v_textos, '') ~* '(inscri|examen|requisit|postul|matr[ií]cul|vacante)' then
    v_p := v_p + 15; v_m := array_append(v_m, 'Preguntó por inscripción');
  end if;
  if coalesce(v_dias, 0) >= 2 then
    v_p := v_p + 10; v_m := array_append(v_m, 'Volvió a escribir');
  end if;
  if v_lead.actividad_id is not null or coalesce(v_lead.origen_campana, '') ilike 'presencial%'
     or exists (select 1 from public.lead_apoyo a where a.lead_id = v_lead.id)
     or exists (select 1 from public.lead_interacciones i where i.lead_id = v_lead.id and i.tipo = 'sistema' and i.contenido like '🏢 Vino en persona%') then
    v_p := v_p + 15; v_m := array_append(v_m, 'Vino en persona');
  end if;
  select min(created_at) into v_primero from public.lead_interacciones
  where lead_id = v_lead.id and (tipo = 'mensaje_asesor' or tipo = 'llamada');
  if exists (select 1 from public.lead_interacciones i where i.lead_id = v_lead.id and i.tipo = 'mensaje_lead' and i.created_at > v_primero)
     or exists (select 1 from public.lead_interacciones i where i.lead_id = v_lead.id and i.tipo = 'llamada' and i.contenido ~ '· (contestó|respondió)') then
    v_p := v_p + 10; v_m := array_append(v_m, 'Respondió al asesor');
  end if;
  if exists (select 1 from public.proformas f where f.lead_id = v_lead.id) then
    v_p := v_p + 10; v_m := array_append(v_m, 'Recibió proforma');
  end if;
  if coalesce(v_lead.ultimo_mensaje_lead_at, v_lead.created_at) < now() - interval '14 days' then
    v_p := v_p - 15; v_m := array_append(v_m, 'No escribe hace más de 14 días');
  end if;

  return query select greatest(0, least(100, v_p))::smallint, v_m;
end $$;
revoke execute on function public.calcular_puntaje(uuid) from public, anon, authenticated;

-- La actualización del puntaje no debe tocar nada más del lead (updated_at, fecha de asignación):
-- con la marca crm.solo_puntaje el trigger de antes de actualizar no hace nada.
create or replace function public.fn_leads_before_update()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if coalesce(current_setting('crm.solo_puntaje', true), '') = 'on' then
    return new;
  end if;

  if auth.uid() is not null
     and not public.tiene_permiso('asignar')
     and coalesce(current_setting('crm.asignacion_sistema', true), '') <> 'on'
     and new.asesor_id is distinct from old.asesor_id then
    raise exception 'Solo un administrador puede reasignar leads';
  end if;

  new.updated_at := now();

  if new.estado is distinct from old.estado then
    if new.estado = 'lead_interesado' and new.fecha_interesado is null then
      new.fecha_interesado := now();
    end if;
    if new.estado = 'lead_asignado' and new.fecha_asignado is null then
      new.fecha_asignado := now();
    end if;
  end if;

  if new.asesor_id is not null and new.fecha_asignado is null then
    new.fecha_asignado := now();
  end if;

  return new;
end $function$;

create or replace function public.actualizar_puntajes()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  -- Sin disparar avisos ni cambios de estado: solo cambian puntaje y motivos
  perform set_config('crm.solo_puntaje', 'on', true);
  with nuevos as (
    select l.id, c.puntaje, c.motivos
    from public.leads l cross join lateral public.calcular_puntaje(l.id) c
    where l.eliminado_at is null
  )
  update public.leads l set puntaje = n.puntaje, puntaje_motivos = n.motivos
  from nuevos n
  where l.id = n.id and (l.puntaje is distinct from n.puntaje or l.puntaje_motivos is distinct from n.motivos);
  get diagnostics v_n = row_count;
  perform set_config('crm.solo_puntaje', '', true);
  return v_n;
end $$;
revoke execute on function public.actualizar_puntajes() from public, anon, authenticated;

select public.actualizar_puntajes();

do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'actualizar-puntajes';
    perform cron.schedule('actualizar-puntajes', '*/10 * * * *', $c$select public.actualizar_puntajes()$c$);
  end if;
end $do$;
