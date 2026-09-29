-- Borra los leads de demostración y reinicia la rotación de asesores
delete from public.leads where resumen = 'DEMO';
update public.asesores set ultimo_lead_asignado = null;
