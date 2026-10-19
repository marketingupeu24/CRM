-- Los leads de apoyo (y los que cubres por ausencia) salen en Chats con una etiqueta: la función
-- devuelve también los datos del último mensaje para la bandeja. Cambia el tipo de retorno: se recrea.

drop function if exists public.mis_leads_apoyo();

create function public.mis_leads_apoyo()
returns table(id uuid, nombre text, telefono text, asesor text, motivo text, desde timestamptz, ultimo_contacto timestamptz, cubriendo boolean,
              ultimo_mensaje_texto text, ultimo_mensaje_at timestamptz, ultimo_mensaje_lead_at timestamptz, sin_responder boolean)
language sql
stable
security definer
set search_path = ''
as $$
  (select l.id, l.nombre, l.telefono, a.nombre, ap.motivo, ap.created_at, l.ultimo_contacto, false,
          l.ultimo_mensaje_texto, l.ultimo_mensaje_at, l.ultimo_mensaje_lead_at, l.sin_responder
   from public.lead_apoyo ap
   join public.leads l on l.id = ap.lead_id and l.eliminado_at is null
   left join public.asesores a on a.id = l.asesor_id
   where ap.asesor_id = public.mi_asesor_id() and ap.oculto_at is null
   order by ap.created_at desc
   limit 50)
  union all
  (select l.id, l.nombre, l.telefono, a.nombre,
          'lo cubres hasta ' || to_char(a.ausente_hasta at time zone 'America/Lima', 'DD/MM HH24:MI'),
          a.ausente_desde, l.ultimo_contacto, true,
          l.ultimo_mensaje_texto, l.ultimo_mensaje_at, l.ultimo_mensaje_lead_at, l.sin_responder
   from public.asesores a
   join public.leads l on l.asesor_id = a.id and l.eliminado_at is null
   where a.ausencia_activa and a.ausente_reemplazo = public.mi_asesor_id()
     and l.estado not in ('lead_perdido', 'lead_no_interesado', 'lead_matriculado')
   order by l.sin_responder desc, l.ultimo_contacto desc nulls last
   limit 200)
$$;

revoke all on function public.mis_leads_apoyo() from public, anon;
grant execute on function public.mis_leads_apoyo() to authenticated;
