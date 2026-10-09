
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "actividades": {
                  Row: {
                    "activa": boolean,"asignacion": string,"bienvenida": boolean,"codigo": string,"created_at": string,"fecha": string | null,"id": number,"lugar": string | null,"nombre": string,"responsable_id": string | null,"tipo": string
                  }
                  Insert: {
                    "activa"?: boolean,"asignacion"?: string,"bienvenida"?: boolean,"codigo"?: string,"created_at"?: string,"fecha"?: string | null,"id"?: never,"lugar"?: string | null,"nombre": string,"responsable_id"?: string | null,"tipo"?: string
                  }
                  Update: {
                    "activa"?: boolean,"asignacion"?: string,"bienvenida"?: boolean,"codigo"?: string,"created_at"?: string,"fecha"?: string | null,"id"?: never,"lugar"?: string | null,"nombre"?: string,"responsable_id"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "actividades_responsable_id_fkey"
      columns: ["responsable_id"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "actividades_responsable_id_fkey"
      columns: ["responsable_id"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"ajustes": {
                  Row: {
                    "clave": string,"updated_at": string,"valor": string | null
                  }
                  Insert: {
                    "clave": string,"updated_at"?: string,"valor"?: string | null
                  }
                  Update: {
                    "clave"?: string,"updated_at"?: string,"valor"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"alertas_sistema": {
                  Row: {
                    "avisado_at": string | null,"clave": string,"conteo": number,"detalle": string | null,"primera_at": string,"ultima_at": string
                  }
                  Insert: {
                    "avisado_at"?: string | null,"clave": string,"conteo"?: number,"detalle"?: string | null,"primera_at"?: string,"ultima_at"?: string
                  }
                  Update: {
                    "avisado_at"?: string | null,"clave"?: string,"conteo"?: number,"detalle"?: string | null,"primera_at"?: string,"ultima_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"asesores": {
                  Row: {
                    "activo": boolean,"activo_antes": boolean | null,"ausencia_activa": boolean,"ausente_desde": string | null,"ausente_hasta": string | null,"ausente_motivo": string | null,"ausente_reemplazo": string | null,"carreras": (string)[],"codigo_qr": string,"created_at": string,"eliminado_at": string | null,"email": string | null,"en_blacklist": boolean,"id": string,"nombre": string,"permisos": (string)[],"rol": Database["public"]['Enums']["asesor_rol"],"superadmin": boolean,"telefono": string | null,"ultimo_lead_asignado": string | null,"user_id": string | null,"usuario": string | null
                  }
                  Insert: {
                    "activo"?: boolean,"activo_antes"?: boolean | null,"ausencia_activa"?: boolean,"ausente_desde"?: string | null,"ausente_hasta"?: string | null,"ausente_motivo"?: string | null,"ausente_reemplazo"?: string | null,"carreras"?: (string)[],"codigo_qr"?: string,"created_at"?: string,"eliminado_at"?: string | null,"email"?: string | null,"en_blacklist"?: boolean,"id"?: string,"nombre": string,"permisos"?: (string)[],"rol"?: Database["public"]['Enums']["asesor_rol"],"superadmin"?: boolean,"telefono"?: string | null,"ultimo_lead_asignado"?: string | null,"user_id"?: string | null,"usuario"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"activo_antes"?: boolean | null,"ausencia_activa"?: boolean,"ausente_desde"?: string | null,"ausente_hasta"?: string | null,"ausente_motivo"?: string | null,"ausente_reemplazo"?: string | null,"carreras"?: (string)[],"codigo_qr"?: string,"created_at"?: string,"eliminado_at"?: string | null,"email"?: string | null,"en_blacklist"?: boolean,"id"?: string,"nombre"?: string,"permisos"?: (string)[],"rol"?: Database["public"]['Enums']["asesor_rol"],"superadmin"?: boolean,"telefono"?: string | null,"ultimo_lead_asignado"?: string | null,"user_id"?: string | null,"usuario"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "asesores_ausente_reemplazo_fkey"
      columns: ["ausente_reemplazo"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asesores_ausente_reemplazo_fkey"
      columns: ["ausente_reemplazo"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"avisos_pendientes": {
                  Row: {
                    "actividad": string | null,"creado_por": string | null,"created_at": string,"lead_id": string
                  }
                  Insert: {
                    "actividad"?: string | null,"creado_por"?: string | null,"created_at"?: string,"lead_id": string
                  }
                  Update: {
                    "actividad"?: string | null,"creado_por"?: string | null,"created_at"?: string,"lead_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "avisos_pendientes_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "avisos_pendientes_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    },{
      foreignKeyName: "avisos_pendientes_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: true
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"campanas": {
                  Row: {
                    "activa": boolean,"created_at": string,"fin": string,"id": number,"inicio": string,"nombre": string,"origen": string | null
                  }
                  Insert: {
                    "activa"?: boolean,"created_at"?: string,"fin": string,"id"?: never,"inicio": string,"nombre": string,"origen"?: string | null
                  }
                  Update: {
                    "activa"?: boolean,"created_at"?: string,"fin"?: string,"id"?: never,"inicio"?: string,"nombre"?: string,"origen"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"conocimiento": {
                  Row: {
                    "activo": boolean,"categoria": string,"contenido": string,"id": number,"orden": number,"titulo": string,"updated_at": string,"updated_por": string | null
                  }
                  Insert: {
                    "activo"?: boolean,"categoria": string,"contenido": string,"id"?: never,"orden"?: number,"titulo": string,"updated_at"?: string,"updated_por"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"categoria"?: string,"contenido"?: string,"id"?: never,"orden"?: number,"titulo"?: string,"updated_at"?: string,"updated_por"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conocimiento_updated_por_fkey"
      columns: ["updated_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conocimiento_updated_por_fkey"
      columns: ["updated_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"feriados": {
                  Row: {
                    "fecha": string,"nombre": string
                  }
                  Insert: {
                    "fecha": string,"nombre": string
                  }
                  Update: {
                    "fecha"?: string,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"flujos_bot": {
                  Row: {
                    "actualizado_por": string | null,"created_at": string,"disparador": string,"id": number,"nombre": string,"notas": string,"orden": number,"palabras": (string)[],"prompt": string,"prompt_mejorado": string,"updated_at": string
                  }
                  Insert: {
                    "actualizado_por"?: string | null,"created_at"?: string,"disparador"?: string,"id"?: never,"nombre": string,"notas"?: string,"orden"?: number,"palabras"?: (string)[],"prompt"?: string,"prompt_mejorado"?: string,"updated_at"?: string
                  }
                  Update: {
                    "actualizado_por"?: string | null,"created_at"?: string,"disparador"?: string,"id"?: never,"nombre"?: string,"notas"?: string,"orden"?: number,"palabras"?: (string)[],"prompt"?: string,"prompt_mejorado"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flujos_bot_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "flujos_bot_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"genesys_fichas": {
                  Row: {
                    "activo": boolean,"actualizado_por": string | null,"campos": NonNullable<Json>,"created_at": string,"id": number,"orden": number,"parte": string,"titulo": string,"updated_at": string
                  }
                  Insert: {
                    "activo"?: boolean,"actualizado_por"?: string | null,"campos"?: NonNullable<Json>,"created_at"?: string,"id"?: never,"orden"?: number,"parte": string,"titulo": string,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_por"?: string | null,"campos"?: NonNullable<Json>,"created_at"?: string,"id"?: never,"orden"?: number,"parte"?: string,"titulo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "genesys_fichas_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "genesys_fichas_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"genesys_pruebas": {
                  Row: {
                    "activo": boolean,"created_at": string,"debe_incluir": (string)[],"id": number,"no_debe_incluir": (string)[],"orden": number,"pregunta": string,"probado_at": string | null,"ultima_respuesta": string | null,"ultimo_detalle": string | null,"ultimo_resultado": boolean | null
                  }
                  Insert: {
                    "activo"?: boolean,"created_at"?: string,"debe_incluir"?: (string)[],"id"?: never,"no_debe_incluir"?: (string)[],"orden"?: number,"pregunta": string,"probado_at"?: string | null,"ultima_respuesta"?: string | null,"ultimo_detalle"?: string | null,"ultimo_resultado"?: boolean | null
                  }
                  Update: {
                    "activo"?: boolean,"created_at"?: string,"debe_incluir"?: (string)[],"id"?: never,"no_debe_incluir"?: (string)[],"orden"?: number,"pregunta"?: string,"probado_at"?: string | null,"ultima_respuesta"?: string | null,"ultimo_detalle"?: string | null,"ultimo_resultado"?: boolean | null
                  }
                  Relationships: [
                    
                  ]
                },"genesys_versiones": {
                  Row: {
                    "caracteres": number,"creado_por": string | null,"created_at": string,"id": number,"nota": string,"texto": string
                  }
                  Insert: {
                    "caracteres": number,"creado_por"?: string | null,"created_at"?: string,"id"?: never,"nota"?: string,"texto": string
                  }
                  Update: {
                    "caracteres"?: number,"creado_por"?: string | null,"created_at"?: string,"id"?: never,"nota"?: string,"texto"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "genesys_versiones_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "genesys_versiones_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"lead_alias": {
                  Row: {
                    "alias": string,"created_at": string,"lead_id": string
                  }
                  Insert: {
                    "alias": string,"created_at"?: string,"lead_id": string
                  }
                  Update: {
                    "alias"?: string,"created_at"?: string,"lead_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_alias_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_apoyo": {
                  Row: {
                    "asesor_id": string,"created_at": string,"lead_id": string,"motivo": string | null
                  }
                  Insert: {
                    "asesor_id": string,"created_at"?: string,"lead_id": string,"motivo"?: string | null
                  }
                  Update: {
                    "asesor_id"?: string,"created_at"?: string,"lead_id"?: string,"motivo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_apoyo_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_apoyo_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    },{
      foreignKeyName: "lead_apoyo_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_interacciones": {
                  Row: {
                    "adjunto_url": string | null,"autor_id": string | null,"contenido": string | null,"created_at": string,"error_envio": string | null,"estado_envio": string | null,"id": number,"lead_id": string,"tipo": Database["public"]['Enums']["interaccion_tipo"]
                  }
                  Insert: {
                    "adjunto_url"?: string | null,"autor_id"?: string | null,"contenido"?: string | null,"created_at"?: string,"error_envio"?: string | null,"estado_envio"?: string | null,"id"?: never,"lead_id": string,"tipo": Database["public"]['Enums']["interaccion_tipo"]
                  }
                  Update: {
                    "adjunto_url"?: string | null,"autor_id"?: string | null,"contenido"?: string | null,"created_at"?: string,"error_envio"?: string | null,"estado_envio"?: string | null,"id"?: never,"lead_id"?: string,"tipo"?: Database["public"]['Enums']["interaccion_tipo"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_interacciones_autor_id_fkey"
      columns: ["autor_id"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_interacciones_autor_id_fkey"
      columns: ["autor_id"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    },{
      foreignKeyName: "lead_interacciones_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "actividad_id": number | null,"anuncio": Json | null,"asesor_id": string | null,"aviso_horario_para": string | null,"bot_pausado_hasta": string | null,"canal_entrada": string | null,"carrera_interes": string | null,"colegio": string | null,"convocatoria": string | null,"created_at": string,"dni": string | null,"duplicados_ignorados": number,"eliminado_at": string | null,"eliminado_por": string | null,"en_blacklist": boolean,"estado": Database["public"]['Enums']["lead_estado"],"fecha_asignado": string | null,"fecha_interesado": string | null,"fecha_notificacion": string | null,"fecha_postulacion": string | null,"grado": string | null,"id": string,"modalidad": string | null,"motivo_no_interes": string | null,"no_recordatorios": boolean,"nombre": string | null,"notificacion_error": string | null,"notificacion_estado": string | null,"notificacion_intentos": number,"origen": string,"origen_campana": string | null,"primer_contacto": string,"primer_contacto_asesor_at": string | null,"programa": string,"puntaje": number,"puntaje_motivos": (string)[],"reasignaciones": number,"reconsultas": number,"recordatorio_enviado": string | null,"registrado_por": string | null,"resumen": string | null,"sede": string | null,"sin_responder": boolean | null,"telefono": string,"total_mensajes": number,"ultima_respuesta_at": string | null,"ultimo_aviso_mensaje_at": string | null,"ultimo_contacto": string,"ultimo_mensaje_at": string | null,"ultimo_mensaje_lead_at": string | null,"ultimo_mensaje_texto": string | null,"ultimo_registro_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "actividad_id"?: number | null,"anuncio"?: Json | null,"asesor_id"?: string | null,"aviso_horario_para"?: string | null,"bot_pausado_hasta"?: string | null,"canal_entrada"?: string | null,"carrera_interes"?: string | null,"colegio"?: string | null,"convocatoria"?: string | null,"created_at"?: string,"dni"?: string | null,"duplicados_ignorados"?: number,"eliminado_at"?: string | null,"eliminado_por"?: string | null,"en_blacklist"?: boolean,"estado"?: Database["public"]['Enums']["lead_estado"],"fecha_asignado"?: string | null,"fecha_interesado"?: string | null,"fecha_notificacion"?: string | null,"fecha_postulacion"?: string | null,"grado"?: string | null,"id"?: string,"modalidad"?: string | null,"motivo_no_interes"?: string | null,"no_recordatorios"?: boolean,"nombre"?: string | null,"notificacion_error"?: string | null,"notificacion_estado"?: string | null,"notificacion_intentos"?: number,"origen"?: string,"origen_campana"?: string | null,"primer_contacto"?: string,"primer_contacto_asesor_at"?: string | null,"programa"?: string,"puntaje"?: number,"puntaje_motivos"?: (string)[],"reasignaciones"?: number,"reconsultas"?: number,"recordatorio_enviado"?: string | null,"registrado_por"?: string | null,"resumen"?: string | null,"sede"?: string | null,"sin_responder"?: never,"telefono": string,"total_mensajes"?: number,"ultima_respuesta_at"?: string | null,"ultimo_aviso_mensaje_at"?: string | null,"ultimo_contacto"?: string,"ultimo_mensaje_at"?: string | null,"ultimo_mensaje_lead_at"?: string | null,"ultimo_mensaje_texto"?: string | null,"ultimo_registro_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "actividad_id"?: number | null,"anuncio"?: Json | null,"asesor_id"?: string | null,"aviso_horario_para"?: string | null,"bot_pausado_hasta"?: string | null,"canal_entrada"?: string | null,"carrera_interes"?: string | null,"colegio"?: string | null,"convocatoria"?: string | null,"created_at"?: string,"dni"?: string | null,"duplicados_ignorados"?: number,"eliminado_at"?: string | null,"eliminado_por"?: string | null,"en_blacklist"?: boolean,"estado"?: Database["public"]['Enums']["lead_estado"],"fecha_asignado"?: string | null,"fecha_interesado"?: string | null,"fecha_notificacion"?: string | null,"fecha_postulacion"?: string | null,"grado"?: string | null,"id"?: string,"modalidad"?: string | null,"motivo_no_interes"?: string | null,"no_recordatorios"?: boolean,"nombre"?: string | null,"notificacion_error"?: string | null,"notificacion_estado"?: string | null,"notificacion_intentos"?: number,"origen"?: string,"origen_campana"?: string | null,"primer_contacto"?: string,"primer_contacto_asesor_at"?: string | null,"programa"?: string,"puntaje"?: number,"puntaje_motivos"?: (string)[],"reasignaciones"?: number,"reconsultas"?: number,"recordatorio_enviado"?: string | null,"registrado_por"?: string | null,"resumen"?: string | null,"sede"?: string | null,"sin_responder"?: never,"telefono"?: string,"total_mensajes"?: number,"ultima_respuesta_at"?: string | null,"ultimo_aviso_mensaje_at"?: string | null,"ultimo_contacto"?: string,"ultimo_mensaje_at"?: string | null,"ultimo_mensaje_lead_at"?: string | null,"ultimo_mensaje_texto"?: string | null,"ultimo_registro_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_actividad_id_fkey"
      columns: ["actividad_id"]
isOneToOne: false
      referencedRelation: "actividades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    },{
      foreignKeyName: "leads_eliminado_por_fkey"
      columns: ["eliminado_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_eliminado_por_fkey"
      columns: ["eliminado_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    },{
      foreignKeyName: "leads_registrado_por_fkey"
      columns: ["registrado_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_registrado_por_fkey"
      columns: ["registrado_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"prerregistros": {
                  Row: {
                    "asesor_id": string,"carrera": string | null,"codigo": string,"colegio": string | null,"created_at": string,"dni": string | null,"grado": string | null,"id": string,"lead_id": string | null,"nombre": string,"usado_at": string | null
                  }
                  Insert: {
                    "asesor_id"?: string,"carrera"?: string | null,"codigo"?: string,"colegio"?: string | null,"created_at"?: string,"dni"?: string | null,"grado"?: string | null,"id"?: string,"lead_id"?: string | null,"nombre": string,"usado_at"?: string | null
                  }
                  Update: {
                    "asesor_id"?: string,"carrera"?: string | null,"codigo"?: string,"colegio"?: string | null,"created_at"?: string,"dni"?: string | null,"grado"?: string | null,"id"?: string,"lead_id"?: string | null,"nombre"?: string,"usado_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "prerregistros_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prerregistros_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    },{
      foreignKeyName: "prerregistros_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"proformas": {
                  Row: {
                    "ahorro": number,"archivo_url": string | null,"asesor_id": string | null,"beneficio": string,"campus": string,"carrera": string,"created_at": string,"cuota": number,"cuotas": number,"datos": NonNullable<Json>,"enviada_at": string | null,"id": number,"inicial": number,"lead_id": string | null,"modalidad": string,"numero": string,"pago": string,"total": number
                  }
                  Insert: {
                    "ahorro"?: number,"archivo_url"?: string | null,"asesor_id"?: string | null,"beneficio": string,"campus": string,"carrera": string,"created_at"?: string,"cuota": number,"cuotas": number,"datos"?: NonNullable<Json>,"enviada_at"?: string | null,"id"?: never,"inicial": number,"lead_id"?: string | null,"modalidad": string,"numero": string,"pago": string,"total": number
                  }
                  Update: {
                    "ahorro"?: number,"archivo_url"?: string | null,"asesor_id"?: string | null,"beneficio"?: string,"campus"?: string,"carrera"?: string,"created_at"?: string,"cuota"?: number,"cuotas"?: number,"datos"?: NonNullable<Json>,"enviada_at"?: string | null,"id"?: never,"inicial"?: number,"lead_id"?: string | null,"modalidad"?: string,"numero"?: string,"pago"?: string,"total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "proformas_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proformas_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    },{
      foreignKeyName: "proformas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"push_suscripciones": {
                  Row: {
                    "asesor_id": string,"auth": string,"created_at": string,"dispositivo": string | null,"endpoint": string,"id": number,"p256dh": string,"ultimo_envio_at": string | null
                  }
                  Insert: {
                    "asesor_id": string,"auth": string,"created_at"?: string,"dispositivo"?: string | null,"endpoint": string,"id"?: never,"p256dh": string,"ultimo_envio_at"?: string | null
                  }
                  Update: {
                    "asesor_id"?: string,"auth"?: string,"created_at"?: string,"dispositivo"?: string | null,"endpoint"?: string,"id"?: never,"p256dh"?: string,"ultimo_envio_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_suscripciones_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_suscripciones_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"recordatorios_alumnos": {
                  Row: {
                    "activo": boolean,"carreras": (string)[],"completado_at": string | null,"creado_por": string | null,"created_at": string,"desde_hora": string,"enviar_el": string,"excluir_carreras": (string)[],"id": number,"mensaje": string,"solo_registrados": boolean,"titulo": string
                  }
                  Insert: {
                    "activo"?: boolean,"carreras"?: (string)[],"completado_at"?: string | null,"creado_por"?: string | null,"created_at"?: string,"desde_hora"?: string,"enviar_el": string,"excluir_carreras"?: (string)[],"id"?: never,"mensaje": string,"solo_registrados"?: boolean,"titulo": string
                  }
                  Update: {
                    "activo"?: boolean,"carreras"?: (string)[],"completado_at"?: string | null,"creado_por"?: string | null,"created_at"?: string,"desde_hora"?: string,"enviar_el"?: string,"excluir_carreras"?: (string)[],"id"?: never,"mensaje"?: string,"solo_registrados"?: boolean,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recordatorios_alumnos_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recordatorios_alumnos_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"recordatorios_envios": {
                  Row: {
                    "enviado_at": string | null,"error": string | null,"lead_id": string,"recordatorio_id": number,"reservado_at": string
                  }
                  Insert: {
                    "enviado_at"?: string | null,"error"?: string | null,"lead_id": string,"recordatorio_id": number,"reservado_at"?: string
                  }
                  Update: {
                    "enviado_at"?: string | null,"error"?: string | null,"lead_id"?: string,"recordatorio_id"?: number,"reservado_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recordatorios_envios_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recordatorios_envios_recordatorio_id_fkey"
      columns: ["recordatorio_id"]
isOneToOne: false
      referencedRelation: "recordatorios_alumnos"
      referencedColumns: ["id"]
    }
                  ]
                },"respuestas_rapidas": {
                  Row: {
                    "activa": boolean,"contenido": string,"created_at": string,"id": number,"orden": number,"titulo": string
                  }
                  Insert: {
                    "activa"?: boolean,"contenido": string,"created_at"?: string,"id"?: never,"orden"?: number,"titulo": string
                  }
                  Update: {
                    "activa"?: boolean,"contenido"?: string,"created_at"?: string,"id"?: never,"orden"?: number,"titulo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"revision_bot": {
                  Row: {
                    "interaccion_id": number,"revisada_at": string,"revisada_por": string | null
                  }
                  Insert: {
                    "interaccion_id": number,"revisada_at"?: string,"revisada_por"?: string | null
                  }
                  Update: {
                    "interaccion_id"?: number,"revisada_at"?: string,"revisada_por"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "revision_bot_interaccion_id_fkey"
      columns: ["interaccion_id"]
isOneToOne: true
      referencedRelation: "lead_interacciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "revision_bot_revisada_por_fkey"
      columns: ["revisada_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "revision_bot_revisada_por_fkey"
      columns: ["revisada_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    }
                  ]
                },"tareas": {
                  Row: {
                    "asesor_id": string,"completada_at": string | null,"creada_por": string | null,"created_at": string,"id": number,"lead_id": string,"recordatorio_enviado_at": string | null,"titulo": string,"vence_at": string
                  }
                  Insert: {
                    "asesor_id": string,"completada_at"?: string | null,"creada_por"?: string | null,"created_at"?: string,"id"?: never,"lead_id": string,"recordatorio_enviado_at"?: string | null,"titulo": string,"vence_at": string
                  }
                  Update: {
                    "asesor_id"?: string,"completada_at"?: string | null,"creada_por"?: string | null,"created_at"?: string,"id"?: never,"lead_id"?: string,"recordatorio_enviado_at"?: string | null,"titulo"?: string,"vence_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tareas_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tareas_asesor_id_fkey"
      columns: ["asesor_id"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    },{
      foreignKeyName: "tareas_creada_por_fkey"
      columns: ["creada_por"]
isOneToOne: false
      referencedRelation: "asesores"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tareas_creada_por_fkey"
      columns: ["creada_por"]
isOneToOne: false
      referencedRelation: "vista_leads_por_asesor"
      referencedColumns: ["asesor_id"]
    },{
      foreignKeyName: "tareas_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_eventos": {
                  Row: {
                    "id": number,"payload": NonNullable<Json>,"procesado": string | null,"recibido_at": string
                  }
                  Insert: {
                    "id"?: never,"payload": NonNullable<Json>,"procesado"?: string | null,"recibido_at"?: string
                  }
                  Update: {
                    "id"?: never,"payload"?: NonNullable<Json>,"procesado"?: string | null,"recibido_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "vista_embudo_conversion": {
                  Row: {
                    "leads_interesados": number | null,"leads_matriculados": number | null,"tasa_global": number | null,"tasa_interes": number | null,"tasa_matricula": number | null,"total_leads": number | null
                  }
                  Relationships: [
                    
                  ]
                },"vista_leads_por_asesor": {
                  Row: {
                    "asesor": string | null,"asesor_id": string | null,"leads_asignados": number | null,"leads_contactados": number | null,"leads_inscritos": number | null,"leads_matriculados": number | null,"leads_perdidos": number | null,"leads_sin_contactar": number | null
                  }
                  Relationships: [
                    
                  ]
                },"vista_leads_por_carrera": {
                  Row: {
                    "carrera": string | null,"leads_interesados": number | null,"leads_matriculados": number | null,"leads_no_interesados": number | null,"total_leads": number | null
                  }
                  Relationships: [
                    
                  ]
                },"vista_leads_por_dia": {
                  Row: {
                    "dia": string | null,"total_leads": number | null
                  }
                  Relationships: [
                    
                  ]
                },"vista_leads_por_estado": {
                  Row: {
                    "estado": Database["public"]['Enums']["lead_estado"] | null,"total_leads": number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "actividad_publica":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"actualizar_puntajes":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"aplicar_ausencias":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"asignar_asesor_lead":
{ Args: { "p_lead_id": string }; Returns: {
              "activo": boolean,
"activo_antes": boolean | null,
"ausencia_activa": boolean,
"ausente_desde": string | null,
"ausente_hasta": string | null,
"ausente_motivo": string | null,
"ausente_reemplazo": string | null,
"carreras": (string)[],
"codigo_qr": string,
"created_at": string,
"eliminado_at": string | null,
"email": string | null,
"en_blacklist": boolean,
"id": string,
"nombre": string,
"permisos": (string)[],
"rol": Database["public"]['Enums']["asesor_rol"],
"superadmin": boolean,
"telefono": string | null,
"ultimo_lead_asignado": string | null,
"user_id": string | null,
"usuario": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "asesores"
        isOneToOne: true
        isSetofReturn: false
      } },
"asignar_lead_qr_asesor":
{ Args: { "p_codigo": string,"p_lead_id": string }; Returns: Json
                           },
"avisar_visita":
{ Args: { "p_atendio": string,"p_como": string,"p_lead_id": string }; Returns: undefined
                           },
"avisar_visita_registro":
{ Args: { "p_dni"?: string,"p_telefono"?: string }; Returns: boolean
                           },
"baja_recordatorios":
{ Args: { "p_lead_id": string,"p_texto": string }; Returns: boolean
                           },
"borrar_asesor_definitivo":
{ Args: { "p_id": string }; Returns: undefined
                           },
"borrar_leads_definitivo":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"calcular_puntaje":
{ Args: { "p_lead_id": string }; Returns: {
              "motivos": (string)[],"puntaje": number
            }[]
                           },
"canal_entrada_texto":
{ Args: { "p_app": string,"p_fuente": string }; Returns: string
                           },
"crear_usuario_panel":
{ Args: { "p_asesor_id": string,"p_clave": string,"p_debe_cambiar"?: boolean,"p_usuario": string }; Returns: string
                           },
"destinatarios_recordatorio":
{ Args: { "p_id": number }; Returns: {
              "actividad_id": number | null,
"anuncio": Json | null,
"asesor_id": string | null,
"aviso_horario_para": string | null,
"bot_pausado_hasta": string | null,
"canal_entrada": string | null,
"carrera_interes": string | null,
"colegio": string | null,
"convocatoria": string | null,
"created_at": string,
"dni": string | null,
"duplicados_ignorados": number,
"eliminado_at": string | null,
"eliminado_por": string | null,
"en_blacklist": boolean,
"estado": Database["public"]['Enums']["lead_estado"],
"fecha_asignado": string | null,
"fecha_interesado": string | null,
"fecha_notificacion": string | null,
"fecha_postulacion": string | null,
"grado": string | null,
"id": string,
"modalidad": string | null,
"motivo_no_interes": string | null,
"no_recordatorios": boolean,
"nombre": string | null,
"notificacion_error": string | null,
"notificacion_estado": string | null,
"notificacion_intentos": number,
"origen": string,
"origen_campana": string | null,
"primer_contacto": string,
"primer_contacto_asesor_at": string | null,
"programa": string,
"puntaje": number,
"puntaje_motivos": (string)[],
"reasignaciones": number,
"reconsultas": number,
"recordatorio_enviado": string | null,
"registrado_por": string | null,
"resumen": string | null,
"sede": string | null,
"sin_responder": boolean | null,
"telefono": string,
"total_mensajes": number,
"ultima_respuesta_at": string | null,
"ultimo_aviso_mensaje_at": string | null,
"ultimo_contacto": string,
"ultimo_mensaje_at": string | null,
"ultimo_mensaje_lead_at": string | null,
"ultimo_mensaje_texto": string | null,
"ultimo_registro_at": string | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "leads"
        isOneToOne: false
        isSetofReturn: true
      } },
"eliminar_actividad":
{ Args: { "p_id": number }; Returns: undefined
                           },
"eliminar_asesor":
{ Args: { "p_id": string }; Returns: undefined
                           },
"eliminar_leads":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"email_de_usuario":
{ Args: { "p_usuario": string }; Returns: string
                           },
"embudo_por_origen":
{ Args: { "p_asesor_id"?: string,"p_convocatoria"?: string,"p_desde"?: string,"p_hasta"?: string,"p_por"?: string }; Returns: {
              "contactados": number,"escribieron": number,"grupo": string,"inscritos": number,"matriculados": number,"registrados": number
            }[]
                           },
"en_horario_atencion":
{ Args: { "p_momento"?: string }; Returns: boolean
                           },
"enviar_avisos_pendientes":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"es_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"es_apoyo":
{ Args: { "p_lead_id": string }; Returns: boolean
                           },
"es_superadmin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"franjas_atencion":
{ Args: { "p_dia": string }; Returns: {
              "fin": string,"inicio": string
            }[]
                           },
"guardar_origen_contacto":
{ Args: { "p_anuncio": Json,"p_app": string,"p_fuente": string,"p_lead_id": string }; Returns: undefined
                           },
"guardar_permisos":
{ Args: { "p_asesor_id": string,"p_permisos": (string)[],"p_superadmin"?: boolean }; Returns: undefined
                           },
"horas_habiles":
{ Args: { "p_desde": string,"p_hasta"?: string }; Returns: number
                           },
"importar_leads":
{ Args: { "p_actividad_id"?: number,"p_asesor_id"?: string,"p_aviso_diferido"?: boolean,"p_filas": Json,"p_origen"?: string,"p_repartir"?: boolean }; Returns: {
              "estado": string,"fila": number,"lead_id": string,"mensaje": string
            }[]
                           },
"lead_apoyo_ficha":
{ Args: { "p_lead_id": string }; Returns: Json
                           },
"lead_de_contacto":
{ Args: { "p_contacto": string }; Returns: string
                           },
"lead_existente":
{ Args: { "p_dni"?: string,"p_telefono"?: string }; Returns: Json
                           },
"limpiar_webhook_eventos":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"llamar_genesys":
{ Args: { "p_accion": string,"p_cuerpo"?: Json }; Returns: undefined
                           },
"marcar_notificacion":
{ Args: { "p_error"?: string,"p_lead_id": string,"p_ok": boolean }; Returns: undefined
                           },
"marcar_recordatorio":
{ Args: { "p_error"?: string,"p_lead_id": string,"p_ok": boolean,"p_recordatorio_id": number }; Returns: undefined
                           },
"mi_asesor_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"mis_leads_apoyo":
{ Args: Record<PropertyKey, never>; Returns: {
              "asesor": string,"cubriendo": boolean,"desde": string,"id": string,"motivo": string,"nombre": string,"telefono": string,"ultimo_contacto": string
            }[]
                           },
"papelera":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"posibles_reemplazos":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"nombre": string
            }[]
                           },
"preguntas_sin_respuesta":
{ Args: { "p_dias"?: number }; Returns: {
              "interaccion_id": number,"lead_id": string,"lead_nombre": string,"lead_telefono": string,"pregunta": string,"respondida_at": string,"respuesta": string,"revisada": boolean
            }[]
                           },
"prerregistro_publico":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"procesar_lead":
{ Args: { "p_asesor_id"?: string,"p_asignar"?: boolean,"p_carrera"?: string,"p_consulta"?: string,"p_convocatoria"?: string,"p_dni"?: string,"p_modalidad"?: string,"p_nombre"?: string,"p_notificar"?: boolean,"p_origen"?: string,"p_programa"?: string,"p_telefono"?: string }; Returns: Json
                           },
"programar_ausencia":
{ Args: { "p_asesor_id": string,"p_desde": string,"p_hasta": string,"p_motivo"?: string,"p_reemplazo"?: string }; Returns: Json
                           },
"proxima_atencion":
{ Args: { "p_momento"?: string }; Returns: string
                           },
"puede_gestionar_usuario":
{ Args: { "p_asesor_id": string }; Returns: boolean
                           },
"puede_programar_ausencia":
{ Args: { "p_asesor_id": string }; Returns: boolean
                           },
"qr_asesor_publico":
{ Args: { "p_codigo": string }; Returns: Json
                           },
"reasignar_sin_contacto":
{ Args: { "p_horas"?: number,"p_maximo"?: number,"p_solo_horario"?: boolean }; Returns: Json
                           },
"registrar_contacto_externo":
{ Args: { "p_lead_id": string,"p_medio": string,"p_nota"?: string,"p_resultado": string,"p_volver_at"?: string }; Returns: undefined
                           },
"registrar_error":
{ Args: { "p_clave": string,"p_detalle": string }; Returns: boolean
                           },
"registrar_lead":
{ Args: { "p_es_lid"?: boolean,"p_mensaje"?: string,"p_telefono": string }; Returns: {
              "actividad_id": number | null,
"anuncio": Json | null,
"asesor_id": string | null,
"aviso_horario_para": string | null,
"bot_pausado_hasta": string | null,
"canal_entrada": string | null,
"carrera_interes": string | null,
"colegio": string | null,
"convocatoria": string | null,
"created_at": string,
"dni": string | null,
"duplicados_ignorados": number,
"eliminado_at": string | null,
"eliminado_por": string | null,
"en_blacklist": boolean,
"estado": Database["public"]['Enums']["lead_estado"],
"fecha_asignado": string | null,
"fecha_interesado": string | null,
"fecha_notificacion": string | null,
"fecha_postulacion": string | null,
"grado": string | null,
"id": string,
"modalidad": string | null,
"motivo_no_interes": string | null,
"no_recordatorios": boolean,
"nombre": string | null,
"notificacion_error": string | null,
"notificacion_estado": string | null,
"notificacion_intentos": number,
"origen": string,
"origen_campana": string | null,
"primer_contacto": string,
"primer_contacto_asesor_at": string | null,
"programa": string,
"puntaje": number,
"puntaje_motivos": (string)[],
"reasignaciones": number,
"reconsultas": number,
"recordatorio_enviado": string | null,
"registrado_por": string | null,
"resumen": string | null,
"sede": string | null,
"sin_responder": boolean | null,
"telefono": string,
"total_mensajes": number,
"ultima_respuesta_at": string | null,
"ultimo_aviso_mensaje_at": string | null,
"ultimo_contacto": string,
"ultimo_mensaje_at": string | null,
"ultimo_mensaje_lead_at": string | null,
"ultimo_mensaje_texto": string | null,
"ultimo_registro_at": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "leads"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_lead_actividad":
{ Args: { "p_carrera"?: string,"p_codigo": string,"p_colegio"?: string,"p_dni"?: string,"p_grado"?: string,"p_nombre": string,"p_telefono": string }; Returns: Json
                           },
"registrar_lead_asesor":
{ Args: { "p_carrera"?: string,"p_codigo": string,"p_colegio"?: string,"p_dni"?: string,"p_grado"?: string,"p_nombre": string,"p_telefono": string }; Returns: Json
                           },
"registrar_lead_manual":
{ Args: { "p_asesor_id"?: string,"p_carrera"?: string,"p_convocatoria"?: string,"p_dni"?: string,"p_modalidad"?: string,"p_nombre": string,"p_observacion"?: string,"p_programa"?: string,"p_telefono"?: string }; Returns: Json
                           },
"registrar_push":
{ Args: { "p_auth": string,"p_dispositivo"?: string,"p_endpoint": string,"p_p256dh": string }; Returns: undefined
                           },
"reservar_aviso_horario":
{ Args: { "p_lead_id": string }; Returns: string
                           },
"reservar_recordatorios":
{ Args: { "p_limite"?: number }; Returns: {
              "asesor": string,"carrera": string,"lead_id": string,"mensaje": string,"nombre": string,"recordatorio_id": number,"telefono": string,"titulo": string
            }[]
                           },
"restablecer_clave_usuario":
{ Args: { "p_asesor_id": string,"p_clave": string,"p_debe_cambiar"?: boolean }; Returns: undefined
                           },
"restaurar_asesor":
{ Args: { "p_id": string }; Returns: undefined
                           },
"restaurar_leads":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"resumen_actividades":
{ Args: Record<PropertyKey, never>; Returns: {
              "actividad_id": number,"contactados": number,"matriculados": number,"registrados": number
            }[]
                           },
"resumen_campanas":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"resumen_dashboard":
{ Args: { "p_asesor_id"?: string,"p_convocatoria"?: string,"p_desde"?: string,"p_hasta"?: string }; Returns: Json
                           },
"resumen_recordatorio":
{ Args: { "p_id": number }; Returns: Json
                           },
"solicitar_sync_bot":
{ Args: { "p_lead_id"?: string }; Returns: undefined
                           },
"terminar_ausencia":
{ Args: { "p_asesor_id": string }; Returns: undefined
                           },
"tiene_permiso":
{ Args: { "p_modulo": string }; Returns: boolean
                           },
"ultimo_cierre":
{ Args: { "p_momento"?: string }; Returns: string
                           },
"usar_prerregistro":
{ Args: { "p_codigo": string,"p_lead_id": string }; Returns: Json
                           }
          }
          Enums: {
            "asesor_rol": "asesor"|"admin","interaccion_tipo": "mensaje_lead"|"respuesta_bot"|"cambio_estado"|"nota_asesor"|"sistema"|"mensaje_asesor"|"llamada","lead_estado": "lead_nuevo"|"lead_en_conversacion"|"lead_no_interesado"|"lead_interesado"|"lead_asignado"|"lead_contactado"|"lead_atendido"|"lead_inscrito"|"lead_matriculado"|"lead_perdido"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "asesor_rol": ["asesor", "admin"],"interaccion_tipo": ["mensaje_lead", "respuesta_bot", "cambio_estado", "nota_asesor", "sistema", "mensaje_asesor", "llamada"],"lead_estado": ["lead_nuevo", "lead_en_conversacion", "lead_no_interesado", "lead_interesado", "lead_asignado", "lead_contactado", "lead_atendido", "lead_inscrito", "lead_matriculado", "lead_perdido"]
          }
        }
} as const

