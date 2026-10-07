-- Nota de las carreras a distancia sin la frase repetida
update public.genesys_fichas
set campos = jsonb_set(campos, '{notas}', to_jsonb(replace(campos->>'notas', ' Mismo enfoque que la carrera presencial.', '')))
where parte = 'carreras' and campos->>'notas' like '%Mismo enfoque que la carrera presencial.%';
