-- =====================================================================
--  Imágenes y PDF enviados por el asesor desde el chat del CRM.
--  Bucket público "chat-envios" (BuilderBot descarga el archivo desde su URL
--  para mandarlo por WhatsApp; los nombres son aleatorios). Carpeta = id del
--  lead: solo sube quien puede ver ese lead. Máximo 10 MB.
-- =====================================================================
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chat-envios', 'chat-envios', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute $p$ drop policy if exists "chat-envios: sube quien ve el lead" on storage.objects $p$;
    execute $p$ create policy "chat-envios: sube quien ve el lead" on storage.objects for insert to authenticated
      with check (bucket_id = 'chat-envios'
                  and exists (select 1 from public.leads l where l.id::text = (storage.foldername(name))[1])) $p$;
  end if;
end $do$;
