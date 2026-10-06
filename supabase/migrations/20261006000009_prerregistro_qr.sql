-- =====================================================================
--  Registro presencial con QR por persona.
--  El asesor escribe los datos de quien atiende (nombre, DNI, carrera…) y el
--  panel muestra un QR solo para esa persona. Al escanearlo y enviar el
--  mensaje ("… (Cód. P-XXXXXXXX)"), el lead queda con esos datos, con el
--  celular real que da WhatsApp y como lead de ese asesor (ya contactado).
--  - prerregistros: datos que escribió el asesor, a la espera del mensaje.
--  - prerregistro_publico(codigo): para el enlace /w/<codigo> (sin sesión).
--  - usar_prerregistro(lead, codigo): lo usa Genesys al recibir el mensaje.
-- =====================================================================

create table if not exists public.prerregistros (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  asesor_id   uuid not null default public.mi_asesor_id() references public.asesores (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) between 3 and 120),
  dni         text check (dni ~ '^[0-9]{8,12}$'),
  carrera     text check (length(carrera) <= 120),
  colegio     text check (length(colegio) <= 120),
  grado       text check (length(grado) <= 40),
  created_at  timestamptz not null default now(),
  usado_at    timestamptz,
  lead_id     uuid references public.leads (id) on delete set null
);
create index if not exists prerregistros_asesor_idx on public.prerregistros (asesor_id, created_at desc);

alter table public.prerregistros enable row level security;
revoke all on public.prerregistros from anon;
grant select, insert, delete on public.prerregistros to authenticated;

create policy "prerregistros: el asesor ve los suyos (o todos con ver_todos)"
on public.prerregistros for select to authenticated
using (asesor_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('ver_todos')));

create policy "prerregistros: el asesor crea los suyos"
on public.prerregistros for insert to authenticated
with check (asesor_id = (select public.mi_asesor_id()) and (select public.tiene_permiso('qr_asesor')));

create policy "prerregistros: el asesor borra los suyos sin usar"
on public.prerregistros for delete to authenticated
using (asesor_id = (select public.mi_asesor_id()) and usado_at is null);

-- Realtime: el panel ve al instante cuando la persona envió el mensaje
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.prerregistros';
  end if;
exception when duplicate_object then null;
end $do$;

-- ---------------------------------------------------------------------
-- Enlace público del QR por persona
-- ---------------------------------------------------------------------
create or replace function public.prerregistro_publico(p_codigo text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'codigo', p.codigo,
    'persona', (regexp_split_to_array(trim(p.nombre), '\s+'))[1],
    'asesor', array_to_string((regexp_split_to_array(trim(a.nombre), '\s+'))[1:2], ' '),
    'whatsapp', (select valor from public.ajustes where clave = 'whatsapp_genesys')
  )
  from public.prerregistros p join public.asesores a on a.id = p.asesor_id
  where p.codigo = upper(trim(p_codigo)) and p.created_at > now() - interval '7 days' and a.eliminado_at is null
$$;
revoke execute on function public.prerregistro_publico(text) from public;
grant execute on function public.prerregistro_publico(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Genesys: el mensaje trae el código de un prerregistro
-- ---------------------------------------------------------------------
create or replace function public.usar_prerregistro(p_lead_id uuid, p_codigo text)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_pre     public.prerregistros;
  v_lead    public.leads;
  v_asesor  public.asesores;
  v_dni     text;
  v_nuevo   boolean;
begin
  select * into v_pre from public.prerregistros
  where codigo = upper(trim(p_codigo)) and created_at > now() - interval '7 days' for update;
  if v_pre.id is null then
    return jsonb_build_object('usado', false, 'motivo', 'código desconocido o vencido');
  end if;
  -- Ya se usó con este mismo lead (reintento del mensaje): nada que hacer
  if v_pre.usado_at is not null and v_pre.lead_id = p_lead_id then
    return jsonb_build_object('usado', false, 'motivo', 'ya registrado');
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null then
    return jsonb_build_object('usado', false, 'motivo', 'lead desconocido');
  end if;
  select * into v_asesor from public.asesores where id = v_pre.asesor_id;

  -- DNI: solo si nadie más lo tiene
  v_dni := case when v_pre.dni is not null
                 and not exists (select 1 from public.leads where dni = v_pre.dni and id <> v_lead.id)
            then v_pre.dni end;
  v_nuevo := v_lead.asesor_id is null;

  perform set_config('crm.asignacion_sistema', 'on', true);
  update public.leads
  set nombre          = v_pre.nombre,
      dni             = coalesce(v_dni, dni),
      carrera_interes = coalesce(v_pre.carrera, carrera_interes),
      programa        = case when coalesce(v_pre.carrera, '') ~* 'cepre' then 'cepre' else programa end,
      colegio         = coalesce(v_pre.colegio, colegio),
      grado           = coalesce(v_pre.grado, grado),
      -- Si ya era de otro asesor, se respeta; si no, es del asesor que lo atendió
      asesor_id       = coalesce(asesor_id, v_asesor.id),
      registrado_por  = case when asesor_id is null then v_asesor.id else registrado_por end,
      estado          = case when asesor_id is null
                              and estado in ('lead_nuevo', 'lead_en_conversacion', 'lead_interesado', 'lead_no_interesado', 'lead_perdido', 'lead_asignado')
                             then 'lead_contactado'::public.lead_estado else estado end,
      origen          = case when asesor_id is null then 'manual' else origen end,
      origen_campana  = coalesce(origen_campana, 'Presencial (QR del asesor)'),
      eliminado_at    = null,
      eliminado_por   = null
  where id = v_lead.id;
  if v_nuevo then
    update public.asesores set ultimo_lead_asignado = now() where id = v_asesor.id;
  end if;
  update public.prerregistros set usado_at = now(), lead_id = v_lead.id where id = v_pre.id;

  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead.id, 'sistema',
          'Registro presencial con ' || v_asesor.nombre || ': ' || v_pre.nombre
          || coalesce(' · ' || v_pre.carrera, '')
          || case when v_pre.dni is not null and v_dni is null then ' (el DNI ' || v_pre.dni || ' ya lo tiene otro lead)' else '' end
          || case when not v_nuevo and v_lead.asesor_id <> v_asesor.id then ' — ya era lead de otro asesor: no se cambió' else '' end);

  return jsonb_build_object(
    'usado', true, 'asignado', v_nuevo, 'asesor_nombre', v_asesor.nombre, 'asesor_telefono', v_asesor.telefono,
    'persona', v_pre.nombre
  );
end $$;
revoke execute on function public.usar_prerregistro(uuid, text) from public, anon, authenticated;
grant execute on function public.usar_prerregistro(uuid, text) to service_role;
