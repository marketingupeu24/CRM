-- =====================================================================
--  Archivos que envían los leads por WhatsApp (documentos, notas de voz,
--  imágenes, videos). BuilderBot los guarda solo unos días: Genesys los copia
--  al bucket privado "adjuntos" (carpeta = id del lead) y el chat los muestra.
--  Privado: los ve solo quien puede ver el lead (enlaces firmados).
-- =====================================================================

-- Solo si existe Storage (en las pruebas locales no hay)
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('adjuntos', 'adjuntos', false, 16777216)
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

    execute $p$ drop policy if exists "adjuntos: quien ve el lead" on storage.objects $p$;
    execute $p$ create policy "adjuntos: quien ve el lead" on storage.objects for select to authenticated
      using (bucket_id = 'adjuntos'
             and exists (select 1 from public.leads l where l.id::text = (storage.foldername(name))[1])) $p$;
  end if;
end $do$;

-- Los que llegaron antes se guardaron como código ("_event_document__…"): texto legible
update public.lead_interacciones
set contenido = case
  when contenido like '\_event\_document\_\_%' then '📎 Documento (el archivo ya no está disponible)'
  when contenido like '\_event\_voice\_note\_\_%' then '🎤 Nota de voz (el audio ya no está disponible)'
  when contenido like '\_event\_media\_\_%' then '🖼️ Imagen o video (ya no está disponible)'
  when contenido like '\_event\_location\_\_%' then '📍 Ubicación'
  else '📎 Archivo (ya no está disponible)'
end
where contenido like '\_event\_%';

update public.leads
set ultimo_mensaje_texto = case
  when ultimo_mensaje_texto like '\_event\_document\_\_%' then '📎 Documento'
  when ultimo_mensaje_texto like '\_event\_voice\_note\_\_%' then '🎤 Nota de voz'
  when ultimo_mensaje_texto like '\_event\_media\_\_%' then '🖼️ Imagen o video'
  when ultimo_mensaje_texto like '\_event\_location\_\_%' then '📍 Ubicación'
  else '📎 Archivo'
end
where ultimo_mensaje_texto like '\_event\_%';
