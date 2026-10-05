
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
                },"asesores": {
                  Row: {
                    "activo": boolean,"carreras": (string)[],"created_at": string,"eliminado_at": string | null,"email": string | null,"en_blacklist": boolean,"id": string,"nombre": string,"permisos": (string)[],"rol": Database["public"]['Enums']["asesor_rol"],"superadmin": boolean,"telefono": string | null,"ultimo_lead_asignado": string | null,"user_id": string | null,"usuario": string | null
                  }
                  Insert: {
                    "activo"?: boolean,"carreras"?: (string)[],"created_at"?: string,"eliminado_at"?: string | null,"email"?: string | null,"en_blacklist"?: boolean,"id"?: string,"nombre": string,"permisos"?: (string)[],"rol"?: Database["public"]['Enums']["asesor_rol"],"superadmin"?: boolean,"telefono"?: string | null,"ultimo_lead_asignado"?: string | null,"user_id"?: string | null,"usuario"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"carreras"?: (string)[],"created_at"?: string,"eliminado_at"?: string | null,"email"?: string | null,"en_blacklist"?: boolean,"id"?: string,"nombre"?: string,"permisos"?: (string)[],"rol"?: Database["public"]['Enums']["asesor_rol"],"superadmin"?: boolean,"telefono"?: string | null,"ultimo_lead_asignado"?: string | null,"user_id"?: string | null,"usuario"?: string | null
                  }
                  Relationships: [
                    
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
                    "actividad_id": number | null,"asesor_id": string | null,"bot_pausado_hasta": string | null,"carrera_interes": string | null,"colegio": string | null,"convocatoria": string | null,"created_at": string,"dni": string | null,"duplicados_ignorados": number,"eliminado_at": string | null,"eliminado_por": string | null,"en_blacklist": boolean,"estado": Database["public"]['Enums']["lead_estado"],"fecha_asignado": string | null,"fecha_interesado": string | null,"fecha_notificacion": string | null,"fecha_postulacion": string | null,"grado": string | null,"id": string,"modalidad": string | null,"motivo_no_interes": string | null,"nombre": string | null,"notificacion_error": string | null,"notificacion_estado": string | null,"notificacion_intentos": number,"origen": string,"origen_campana": string | null,"primer_contacto": string,"primer_contacto_asesor_at": string | null,"programa": string,"reasignaciones": number,"reconsultas": number,"recordatorio_enviado": string | null,"resumen": string | null,"sede": string | null,"sin_responder": boolean | null,"telefono": string,"total_mensajes": number,"ultima_respuesta_at": string | null,"ultimo_aviso_mensaje_at": string | null,"ultimo_contacto": string,"ultimo_mensaje_at": string | null,"ultimo_mensaje_lead_at": string | null,"ultimo_mensaje_texto": string | null,"ultimo_registro_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "actividad_id"?: number | null,"asesor_id"?: string | null,"bot_pausado_hasta"?: string | null,"carrera_interes"?: string | null,"colegio"?: string | null,"convocatoria"?: string | null,"created_at"?: string,"dni"?: string | null,"duplicados_ignorados"?: number,"eliminado_at"?: string | null,"eliminado_por"?: string | null,"en_blacklist"?: boolean,"estado"?: Database["public"]['Enums']["lead_estado"],"fecha_asignado"?: string | null,"fecha_interesado"?: string | null,"fecha_notificacion"?: string | null,"fecha_postulacion"?: string | null,"grado"?: string | null,"id"?: string,"modalidad"?: string | null,"motivo_no_interes"?: string | null,"nombre"?: string | null,"notificacion_error"?: string | null,"notificacion_estado"?: string | null,"notificacion_intentos"?: number,"origen"?: string,"origen_campana"?: string | null,"primer_contacto"?: string,"primer_contacto_asesor_at"?: string | null,"programa"?: string,"reasignaciones"?: number,"reconsultas"?: number,"recordatorio_enviado"?: string | null,"resumen"?: string | null,"sede"?: string | null,"sin_responder"?: never,"telefono": string,"total_mensajes"?: number,"ultima_respuesta_at"?: string | null,"ultimo_aviso_mensaje_at"?: string | null,"ultimo_contacto"?: string,"ultimo_mensaje_at"?: string | null,"ultimo_mensaje_lead_at"?: string | null,"ultimo_mensaje_texto"?: string | null,"ultimo_registro_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "actividad_id"?: number | null,"asesor_id"?: string | null,"bot_pausado_hasta"?: string | null,"carrera_interes"?: string | null,"colegio"?: string | null,"convocatoria"?: string | null,"created_at"?: string,"dni"?: string | null,"duplicados_ignorados"?: number,"eliminado_at"?: string | null,"eliminado_por"?: string | null,"en_blacklist"?: boolean,"estado"?: Database["public"]['Enums']["lead_estado"],"fecha_asignado"?: string | null,"fecha_interesado"?: string | null,"fecha_notificacion"?: string | null,"fecha_postulacion"?: string | null,"grado"?: string | null,"id"?: string,"modalidad"?: string | null,"motivo_no_interes"?: string | null,"nombre"?: string | null,"notificacion_error"?: string | null,"notificacion_estado"?: string | null,"notificacion_intentos"?: number,"origen"?: string,"origen_campana"?: string | null,"primer_contacto"?: string,"primer_contacto_asesor_at"?: string | null,"programa"?: string,"reasignaciones"?: number,"reconsultas"?: number,"recordatorio_enviado"?: string | null,"resumen"?: string | null,"sede"?: string | null,"sin_responder"?: never,"telefono"?: string,"total_mensajes"?: number,"ultima_respuesta_at"?: string | null,"ultimo_aviso_mensaje_at"?: string | null,"ultimo_contacto"?: string,"ultimo_mensaje_at"?: string | null,"ultimo_mensaje_lead_at"?: string | null,"ultimo_mensaje_texto"?: string | null,"ultimo_registro_at"?: string | null,"updated_at"?: string
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
                    "asesor_id": string,"completada_at": string | null,"creada_por": string | null,"created_at": string,"id": number,"lead_id": string,"titulo": string,"vence_at": string
                  }
                  Insert: {
                    "asesor_id": string,"completada_at"?: string | null,"creada_por"?: string | null,"created_at"?: string,"id"?: never,"lead_id": string,"titulo": string,"vence_at": string
                  }
                  Update: {
                    "asesor_id"?: string,"completada_at"?: string | null,"creada_por"?: string | null,"created_at"?: string,"id"?: never,"lead_id"?: string,"titulo"?: string,"vence_at"?: string
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
"asignar_asesor_lead":
{ Args: { "p_lead_id": string }; Returns: {
              "activo": boolean,
"carreras": (string)[],
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
"borrar_asesor_definitivo":
{ Args: { "p_id": string }; Returns: undefined
                           },
"borrar_leads_definitivo":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"crear_usuario_panel":
{ Args: { "p_asesor_id": string,"p_clave": string,"p_debe_cambiar"?: boolean,"p_usuario": string }; Returns: string
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
"es_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"es_superadmin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"guardar_permisos":
{ Args: { "p_asesor_id": string,"p_permisos": (string)[],"p_superadmin"?: boolean }; Returns: undefined
                           },
"importar_leads":
{ Args: { "p_actividad_id"?: number,"p_asesor_id"?: string,"p_filas": Json,"p_origen"?: string }; Returns: {
              "estado": string,"fila": number,"lead_id": string,"mensaje": string
            }[]
                           },
"llamar_genesys":
{ Args: { "p_accion": string,"p_cuerpo"?: Json }; Returns: undefined
                           },
"marcar_notificacion":
{ Args: { "p_error"?: string,"p_lead_id": string,"p_ok": boolean }; Returns: undefined
                           },
"mi_asesor_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"papelera":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"preguntas_sin_respuesta":
{ Args: { "p_dias"?: number }; Returns: {
              "interaccion_id": number,"lead_id": string,"lead_nombre": string,"lead_telefono": string,"pregunta": string,"respondida_at": string,"respuesta": string,"revisada": boolean
            }[]
                           },
"procesar_lead":
{ Args: { "p_asesor_id"?: string,"p_asignar"?: boolean,"p_carrera"?: string,"p_consulta"?: string,"p_convocatoria"?: string,"p_dni"?: string,"p_modalidad"?: string,"p_nombre"?: string,"p_notificar"?: boolean,"p_origen"?: string,"p_programa"?: string,"p_telefono"?: string }; Returns: Json
                           },
"puede_gestionar_usuario":
{ Args: { "p_asesor_id": string }; Returns: boolean
                           },
"reasignar_sin_contacto":
{ Args: { "p_horas"?: number,"p_maximo"?: number,"p_solo_horario"?: boolean }; Returns: Json
                           },
"registrar_lead":
{ Args: { "p_mensaje"?: string,"p_telefono": string }; Returns: {
              "actividad_id": number | null,
"asesor_id": string | null,
"bot_pausado_hasta": string | null,
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
"nombre": string | null,
"notificacion_error": string | null,
"notificacion_estado": string | null,
"notificacion_intentos": number,
"origen": string,
"origen_campana": string | null,
"primer_contacto": string,
"primer_contacto_asesor_at": string | null,
"programa": string,
"reasignaciones": number,
"reconsultas": number,
"recordatorio_enviado": string | null,
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
"registrar_lead_manual":
{ Args: { "p_asesor_id"?: string,"p_carrera"?: string,"p_convocatoria"?: string,"p_dni"?: string,"p_modalidad"?: string,"p_nombre": string,"p_observacion"?: string,"p_programa"?: string,"p_telefono"?: string }; Returns: Json
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
"solicitar_sync_bot":
{ Args: { "p_lead_id"?: string }; Returns: undefined
                           },
"tiene_permiso":
{ Args: { "p_modulo": string }; Returns: boolean
                           }
          }
          Enums: {
            "asesor_rol": "asesor"|"admin","interaccion_tipo": "mensaje_lead"|"respuesta_bot"|"cambio_estado"|"nota_asesor"|"sistema"|"mensaje_asesor","lead_estado": "lead_nuevo"|"lead_en_conversacion"|"lead_no_interesado"|"lead_interesado"|"lead_asignado"|"lead_contactado"|"lead_atendido"|"lead_inscrito"|"lead_matriculado"|"lead_perdido"
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
            "asesor_rol": ["asesor", "admin"],"interaccion_tipo": ["mensaje_lead", "respuesta_bot", "cambio_estado", "nota_asesor", "sistema", "mensaje_asesor"],"lead_estado": ["lead_nuevo", "lead_en_conversacion", "lead_no_interesado", "lead_interesado", "lead_asignado", "lead_contactado", "lead_atendido", "lead_inscrito", "lead_matriculado", "lead_perdido"]
          }
        }
} as const

