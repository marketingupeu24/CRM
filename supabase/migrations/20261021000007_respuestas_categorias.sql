-- Respuestas rápidas organizadas por tema (como las carpetas de respuestas guardadas de los helpdesks):
-- saludo y seguimiento, carreras, modalidades de admisión, examen, CEPRE, costos y otros.

alter table public.respuestas_rapidas add column if not exists categoria text not null default 'otros';
alter table public.respuestas_rapidas drop constraint if exists respuestas_rapidas_categoria_check;
alter table public.respuestas_rapidas add constraint respuestas_rapidas_categoria_check
  check (categoria in ('saludo', 'carreras', 'modalidades', 'examen', 'cepre', 'costos', 'otros'));

-- Clasificación de las que ya existen (por su título)
update public.respuestas_rapidas set categoria = case
  when titulo ~* '^carrera' then 'carreras'
  when titulo ~* '^modalidad' then 'modalidades'
  when titulo ~* 'cepre' then 'cepre'
  when titulo ~* 'examen|simulacro|proceso de admisi|inscripci' then 'examen'
  when titulo ~* 'costo|precio|pensi|pago|cuota|proforma|beca|descuento' then 'costos'
  when titulo ~* '^(saludo|despedida|seguimiento|recomendaci)|llamar' then 'saludo'
  else 'otros'
end
where categoria = 'otros';
