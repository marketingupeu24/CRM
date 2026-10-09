-- =====================================================================
--  Enlaces y QR por medio (TikTok, Facebook, flyers, afiches…).
--  Cada enlace es https://crm-admision.vercel.app/e/<codigo>: cuenta la visita y
--  abre WhatsApp con un mensaje listo que termina en "(Cód. O-<codigo>)".
--  Cuando ese mensaje llega, el lead queda con su origen ("Nos conoció por"),
--  si no tenía uno, y con el enlace por el que llegó.
-- =====================================================================

create table if not exists public.enlaces_origen (
  id         bigint generated always as identity primary key,
  nombre     text not null check (length(trim(nombre)) between 2 and 80),   -- "Flyer feria Juliaca"
  origen     text not null check (length(trim(origen)) between 2 and 60),   -- valor de "Nos conoció por"
  codigo     text not null unique check (codigo ~ '^[A-Z0-9]{3,10}$'),
  mensaje    text not null default 'Hola, quiero información de Admisión de la Universidad Peruana Unión',
  visitas    integer not null default 0,
  activo     boolean not null default true,
  creado_por uuid references public.asesores (id) on delete set null default public.mi_asesor_id(),
  created_at timestamptz not null default now()
);
create index if not exists enlaces_origen_creado_por_idx on public.enlaces_origen (creado_por);

alter table public.leads add column if not exists enlace_origen_id bigint references public.enlaces_origen (id) on delete set null;
create index if not exists leads_enlace_origen_idx on public.leads (enlace_origen_id);

alter table public.enlaces_origen enable row level security;
revoke all on public.enlaces_origen from anon;
drop policy if exists "enlaces: ver con campañas" on public.enlaces_origen;
create policy "enlaces: ver con campañas" on public.enlaces_origen for select to authenticated
  using ((select public.tiene_permiso('campanas')) or (select public.tiene_permiso('gestionar_campanas')));
drop policy if exists "enlaces: editar con crear campañas" on public.enlaces_origen;
create policy "enlaces: editar con crear campañas" on public.enlaces_origen for all to authenticated
  using ((select public.tiene_permiso('gestionar_campanas'))) with check ((select public.tiene_permiso('gestionar_campanas')));

/** Página pública /e/<codigo>: cuenta la visita y devuelve el número de Genesys y el mensaje listo. */
create or replace function public.visitar_enlace(p_codigo text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_e public.enlaces_origen;
begin
  update public.enlaces_origen set visitas = visitas + 1
  where codigo = upper(trim(p_codigo)) and activo
  returning * into v_e;
  if v_e.id is null then return null; end if;
  return jsonb_build_object(
    'mensaje', v_e.mensaje || ' (Cód. O-' || v_e.codigo || ')',
    'whatsapp', (select valor from public.ajustes where clave = 'whatsapp_genesys')
  );
end $$;
revoke execute on function public.visitar_enlace(text) from public;
grant execute on function public.visitar_enlace(text) to anon, authenticated;

/** El mensaje del lead trae "(Cód. O-XXXX)": se guarda el enlace y, si no tenía, el origen. */
create or replace function public.aplicar_enlace_origen(p_lead_id uuid, p_mensaje text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_codigo text := upper(substring(coalesce(p_mensaje, '') from '(?i)c[oó]d\.?\s*o-([a-z0-9]{3,10})'));
  v_e      public.enlaces_origen;
begin
  if v_codigo is null then return false; end if;
  select * into v_e from public.enlaces_origen where codigo = v_codigo;
  if v_e.id is null then return false; end if;
  update public.leads
  set enlace_origen_id = coalesce(enlace_origen_id, v_e.id),
      origen_campana   = coalesce(origen_campana, v_e.origen)
  where id = p_lead_id and enlace_origen_id is null;
  if found then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (p_lead_id, 'sistema', '📣 Llegó por el enlace o QR "' || v_e.nombre || '" (' || v_e.origen || ')');
  end if;
  return true;
end $$;
revoke execute on function public.aplicar_enlace_origen(uuid, text) from public, anon, authenticated;
grant execute on function public.aplicar_enlace_origen(uuid, text) to service_role;

/** Resultados de cada enlace: visitas, leads, registrados, contactados, inscritos y matriculados. */
create or replace function public.resultados_enlaces()
returns table (id bigint, leads int, registrados int, contactados int, inscritos int, matriculados int)
language sql stable security definer set search_path = ''
as $$
  select e.id,
         count(l.id)::int,
         count(l.id) filter (where l.dni is not null)::int,
         count(l.id) filter (where l.primer_contacto_asesor_at is not null or l.estado in ('lead_contactado', 'lead_atendido', 'lead_inscrito', 'lead_matriculado'))::int,
         count(l.id) filter (where l.estado in ('lead_inscrito', 'lead_matriculado'))::int,
         count(l.id) filter (where l.estado = 'lead_matriculado')::int
  from public.enlaces_origen e
  left join public.leads l on l.enlace_origen_id = e.id and l.eliminado_at is null
  where public.tiene_permiso('campanas') or public.tiene_permiso('gestionar_campanas')
  group by e.id
$$;
revoke execute on function public.resultados_enlaces() from public, anon;
grant execute on function public.resultados_enlaces() to authenticated;
