-- Contacto por fuera del CRM (llamada o WhatsApp personal del asesor): queda en el historial del lead.
-- (Va sola: un valor nuevo de un enum no se puede usar en la misma transacción en que se crea.)
alter type public.interaccion_tipo add value if not exists 'llamada';
