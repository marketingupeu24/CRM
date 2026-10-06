-- =====================================================================
--  Genesys exigía "un número de DNI" a quien tiene carnet de extranjería y
--  pedía aclaraciones. Cualquier documento sirve para el registro.
-- =====================================================================
update public.conocimiento
set contenido = contenido || E'\n- Documento: acepta DNI (8 dígitos), carnet de extranjería (9 dígitos) o pasaporte. Regístralo tal cual en el campo DNI, sin pedir un DNI peruano ni aclaraciones. Si no tiene documento a la mano, registra igual con su nombre y carrera.',
    updated_at = now()
where titulo = 'Registro de datos' and contenido not like '%carnet de extranjería%';
