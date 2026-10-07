-- =====================================================================
--  Asesor de apoyo: cuando un lead de otro asesor viene en persona y lo
--  atiende otro (escanea su QR, llena su formulario o intenta registrarlo),
--  quien lo atendió queda como "apoyo" de ese lead.
--  - El lead SIGUE siendo del primer asesor (estado, datos, tareas, reasignación).
--  - El apoyo ve la ficha y la conversación, le escribe por el chat y deja notas.
--  - El lead no aparece en sus listas ni cuenta en sus números: se abre desde
--    "Atendidos como apoyo" (página de leads) o el enlace del aviso.
-- =====================================================================

create table if not exists public.lead_apoyo (
  lead_id    uuid not null references public.leads (id) on delete cascade,
  asesor_id  uuid not null references public.asesores (id) on delete cascade,
  motivo     text,
  created_at timestamptz not null default now(),
  primary key (lead_id, asesor_id)
);
create index if not exists lead_apoyo_asesor_idx on public.lead_apoyo (asesor_id, created_at desc);
alter table public.lead_apoyo enable row level security;
revoke insert, update, delete on public.lead_apoyo from anon, authenticated;
drop policy if exists "apoyo: el propio o admin" on public.lead_apoyo;
create policy "apoyo: el propio o admin" on public.lead_apoyo for select to authenticated
  using (asesor_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('ver_todos')));

/** ¿Soy asesor de apoyo de este lead? */
create or replace function public.es_apoyo(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.lead_apoyo where lead_id = p_lead_id and asesor_id = public.mi_asesor_id())
$$;
revoke execute on function public.es_apoyo(uuid) from public, anon;
grant execute on function public.es_apoyo(uuid) to authenticated;

-- Historial y chat: también el apoyo
drop policy if exists "interacciones: ver el historial de los leads visibles" on public.lead_interacciones;
create policy "interacciones: ver el historial de los leads visibles" on public.lead_interacciones for select to authenticated
  using (
    exists (select 1 from public.leads l
            where l.id = lead_interacciones.lead_id
              and (l.asesor_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('ver_todos'))))
    or public.es_apoyo(lead_id)
  );

drop policy if exists "interacciones: el asesor agrega notas a sus leads" on public.lead_interacciones;
create policy "interacciones: el asesor agrega notas a sus leads" on public.lead_interacciones for insert to authenticated
  with check (
    tipo = 'nota_asesor' and autor_id = (select public.mi_asesor_id())
    and (exists (select 1 from public.leads l
                 where l.id = lead_interacciones.lead_id
                   and (l.asesor_id = (select public.mi_asesor_id()) or (select public.tiene_permiso('ver_todos'))))
         or public.es_apoyo(lead_id))
  );

-- Archivos que envió el lead (bucket privado "adjuntos", carpeta = id del lead)
-- (solo si existe Storage: en las pruebas locales no hay)
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute $p$ drop policy if exists "adjuntos: quien ve el lead" on storage.objects $p$;
    execute $p$ create policy "adjuntos: quien ve el lead" on storage.objects for select to authenticated
      using (bucket_id = 'adjuntos'
             and (exists (select 1 from public.leads l where l.id::text = (storage.foldername(name))[1])
                  or exists (select 1 from public.lead_apoyo a
                             where a.lead_id::text = (storage.foldername(name))[1] and a.asesor_id = public.mi_asesor_id()))) $p$;
  end if;
end $do$;

/** Ficha de un lead para su asesor de apoyo (null si no lo es). Incluye asesor y actividad como la consulta normal. */
create or replace function public.lead_apoyo_ficha(p_lead_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select to_jsonb(l)
         || jsonb_build_object(
              'asesor', (select jsonb_build_object('id', a.id, 'nombre', a.nombre, 'telefono', a.telefono) from public.asesores a where a.id = l.asesor_id),
              'actividad', (select jsonb_build_object('id', ac.id, 'nombre', ac.nombre) from public.actividades ac where ac.id = l.actividad_id))
  from public.leads l
  where l.id = p_lead_id and l.eliminado_at is null and public.es_apoyo(l.id)
$$;
revoke execute on function public.lead_apoyo_ficha(uuid) from public, anon;
grant execute on function public.lead_apoyo_ficha(uuid) to authenticated;

/** Leads que atendí como apoyo (los más recientes primero). */
create or replace function public.mis_leads_apoyo()
returns table (id uuid, nombre text, telefono text, asesor text, motivo text, desde timestamptz, ultimo_contacto timestamptz)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.nombre, l.telefono, a.nombre, ap.motivo, ap.created_at, l.ultimo_contacto
  from public.lead_apoyo ap
  join public.leads l on l.id = ap.lead_id and l.eliminado_at is null
  left join public.asesores a on a.id = l.asesor_id
  where ap.asesor_id = public.mi_asesor_id()
  order by ap.created_at desc
  limit 50
$$;
revoke execute on function public.mis_leads_apoyo() from public, anon;
grant execute on function public.mis_leads_apoyo() to authenticated;

-- La visita deja a quien atendió como apoyo y avisa a los dos
create or replace function public.avisar_visita(p_lead_id uuid, p_atendio uuid, p_como text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead    public.leads;
  v_atendio public.asesores;
  v_dueno   public.asesores;
begin
  select * into v_lead from public.leads where id = p_lead_id;
  if v_lead.id is null or v_lead.asesor_id is null or v_lead.asesor_id = p_atendio then return; end if;
  select * into v_atendio from public.asesores where id = p_atendio;
  select * into v_dueno from public.asesores where id = v_lead.asesor_id;
  insert into public.lead_apoyo (lead_id, asesor_id, motivo) values (v_lead.id, p_atendio, p_como)
  on conflict (lead_id, asesor_id) do nothing;
  -- El formulario y luego su mensaje de WhatsApp son la misma visita: un solo aviso
  if exists (select 1 from public.lead_interacciones
             where lead_id = v_lead.id and tipo = 'sistema' and contenido like '🏢 Vino en persona%'
               and created_at > now() - interval '30 minutes') then
    return;
  end if;
  insert into public.lead_interacciones (lead_id, tipo, contenido)
  values (v_lead.id, 'sistema', '🏢 Vino en persona y lo atendió ' || coalesce(v_atendio.nombre, 'otro asesor')
          || ' (' || p_como || '). Sigue siendo lead de ' || coalesce(v_dueno.nombre, 'su asesor')
          || '; ' || coalesce(split_part(v_atendio.nombre, ' ', 1), 'quien lo atendió') || ' queda de apoyo (ve el chat y puede escribirle)');
  perform public.llamar_genesys('visita', jsonb_build_object(
    'lead_id', v_lead.id, 'atendio', coalesce(v_atendio.nombre, 'otro asesor'), 'atendio_id', p_atendio, 'como', p_como
  ));
end $$;
revoke execute on function public.avisar_visita(uuid, uuid, text) from public, anon, authenticated;
