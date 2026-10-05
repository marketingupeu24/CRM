-- =====================================================================
--  Proformas de costos (Admisión 2027-1) enviadas desde el CRM.
--  - Módulo "costos" (Proformas): lo reciben los asesores por defecto.
--  - proformas: cada proforma generada (resumen + datos del cálculo).
--  - Storage "proformas": imagen/PDF público con nombre impredecible, para
--    adjuntarlo por WhatsApp (BuilderBot descarga el archivo desde la URL).
--  - lead_interacciones.adjunto_url: archivo enviado junto al mensaje.
-- =====================================================================

alter table public.asesores drop constraint if exists asesores_permisos_validos;
alter table public.asesores add constraint asesores_permisos_validos check (permisos <@ array[
  'pendientes', 'chats', 'leads', 'kanban', 'registrar', 'costos',
  'dashboard', 'campanas', 'exportar',
  'ver_todos', 'asignar', 'editar_celular', 'papelera',
  'usuarios', 'respuestas', 'gestionar_campanas',
  'conocimiento'
]::text[]);
alter table public.asesores alter column permisos
  set default '{pendientes,chats,leads,kanban,registrar,costos,dashboard,campanas,exportar}';
-- Quien ya trabaja con leads recibe Proformas
update public.asesores set permisos = array_append(permisos, 'costos')
where 'leads' = any (permisos) and not ('costos' = any (permisos));

alter table public.lead_interacciones add column if not exists adjunto_url text;

create table public.proformas (
  id          bigint generated always as identity primary key,
  numero      text not null,
  lead_id     uuid references public.leads (id) on delete set null,
  asesor_id   uuid references public.asesores (id) on delete set null default public.mi_asesor_id(),
  carrera     text not null,
  campus      text not null,
  modalidad   text not null,
  beneficio   text not null,
  pago        text not null check (pago in ('cuotas', 'contado')),
  total       numeric(10, 2) not null,
  inicial     numeric(10, 2) not null,
  cuota       numeric(10, 2) not null,
  cuotas      int not null,
  ahorro      numeric(10, 2) not null default 0,
  datos       jsonb not null default '{}'::jsonb,
  archivo_url text,
  enviada_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index proformas_lead_idx on public.proformas (lead_id, created_at desc);

alter table public.proformas enable row level security;
revoke all on public.proformas from anon;
grant select, insert, update on public.proformas to authenticated;

create policy "proformas: ver las propias, las de sus leads o todas con ver_todos"
on public.proformas for select to authenticated
using (
  asesor_id = (select public.mi_asesor_id())
  or (select public.tiene_permiso('ver_todos'))
  or exists (select 1 from public.leads l where l.id = lead_id and l.asesor_id = (select public.mi_asesor_id()))
);

create policy "proformas: crear con el módulo"
on public.proformas for insert to authenticated
with check ((select public.tiene_permiso('costos')) and asesor_id = (select public.mi_asesor_id()));

create policy "proformas: marcar enviada la propia"
on public.proformas for update to authenticated
using (asesor_id = (select public.mi_asesor_id()))
with check (asesor_id = (select public.mi_asesor_id()));

-- Archivos de las proformas (lectura pública por URL; solo suben usuarios con el módulo)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('proformas', 'proformas', true, 5242880, array['image/png', 'image/jpeg', 'application/pdf'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute $p$ drop policy if exists "proformas: subir con el módulo" on storage.objects $p$;
    execute $p$ create policy "proformas: subir con el módulo" on storage.objects for insert to authenticated
      with check (bucket_id = 'proformas' and (select public.tiene_permiso('costos'))) $p$;
  end if;
end $$;

-- La sección de pensiones de la base de conocimiento ahora sale del tarifario de Proformas
update public.conocimiento
set contenido = 'Los montos por carrera (créditos, costo del crédito, matrícula, cuotas y descuentos) están en la sección "Tarifario 2027-1", que el CRM genera automáticamente desde Proformas. Indica siempre que son referenciales y sujetos a variación, y ofrece que su asesor(a) le envíe la proforma detallada.',
    activo = true
where categoria = 'costos' and titulo = 'Pensiones por carrera' and not activo;
