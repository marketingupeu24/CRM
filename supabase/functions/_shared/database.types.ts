
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "asesores": {
                  Row: {
                    "activo": boolean,"carreras": (string)[],"created_at": string,"email": string | null,"id": string,"nombre": string,"rol": Database["public"]['Enums']["asesor_rol"],"telefono": string | null,"ultimo_lead_asignado": string | null,"user_id": string | null,"usuario": string | null
                  }
                  Insert: {
                    "activo"?: boolean,"carreras"?: (string)[],"created_at"?: string,"email"?: string | null,"id"?: string,"nombre": string,"rol"?: Database["public"]['Enums']["asesor_rol"],"telefono"?: string | null,"ultimo_lead_asignado"?: string | null,"user_id"?: string | null,"usuario"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"carreras"?: (string)[],"created_at"?: string,"email"?: string | null,"id"?: string,"nombre"?: string,"rol"?: Database["public"]['Enums']["asesor_rol"],"telefono"?: string | null,"ultimo_lead_asignado"?: string | null,"user_id"?: string | null,"usuario"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"lead_interacciones": {
                  Row: {
                    "autor_id": string | null,"contenido": string | null,"created_at": string,"error_envio": string | null,"estado_envio": string | null,"id": number,"lead_id": string,"tipo": Database["public"]['Enums']["interaccion_tipo"]
                  }
                  Insert: {
                    "autor_id"?: string | null,"contenido"?: string | null,"created_at"?: string,"error_envio"?: string | null,"estado_envio"?: string | null,"id"?: never,"lead_id": string,"tipo": Database["public"]['Enums']["interaccion_tipo"]
                  }
                  Update: {
                    "autor_id"?: string | null,"contenido"?: string | null,"created_at"?: string,"error_envio"?: string | null,"estado_envio"?: string | null,"id"?: never,"lead_id"?: string,"tipo"?: Database["public"]['Enums']["interaccion_tipo"]
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
                    "asesor_id": string | null,"bot_pausado_hasta": string | null,"carrera_interes": string | null,"convocatoria": string | null,"created_at": string,"dni": string | null,"duplicados_ignorados": number,"estado": Database["public"]['Enums']["lead_estado"],"fecha_asignado": string | null,"fecha_interesado": string | null,"fecha_notificacion": string | null,"fecha_postulacion": string | null,"id": string,"modalidad": string | null,"motivo_no_interes": string | null,"nombre": string | null,"notificacion_error": string | null,"notificacion_estado": string | null,"notificacion_intentos": number,"origen": string,"primer_contacto": string,"programa": string,"reconsultas": number,"recordatorio_enviado": string | null,"resumen": string | null,"sede": string | null,"sin_responder": boolean | null,"telefono": string,"total_mensajes": number,"ultima_respuesta_at": string | null,"ultimo_aviso_mensaje_at": string | null,"ultimo_contacto": string,"ultimo_mensaje_at": string | null,"ultimo_mensaje_lead_at": string | null,"ultimo_mensaje_texto": string | null,"ultimo_registro_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "asesor_id"?: string | null,"bot_pausado_hasta"?: string | null,"carrera_interes"?: string | null,"convocatoria"?: string | null,"created_at"?: string,"dni"?: string | null,"duplicados_ignorados"?: number,"estado"?: Database["public"]['Enums']["lead_estado"],"fecha_asignado"?: string | null,"fecha_interesado"?: string | null,"fecha_notificacion"?: string | null,"fecha_postulacion"?: string | null,"id"?: string,"modalidad"?: string | null,"motivo_no_interes"?: string | null,"nombre"?: string | null,"notificacion_error"?: string | null,"notificacion_estado"?: string | null,"notificacion_intentos"?: number,"origen"?: string,"primer_contacto"?: string,"programa"?: string,"reconsultas"?: number,"recordatorio_enviado"?: string | null,"resumen"?: string | null,"sede"?: string | null,"sin_responder"?: never,"telefono": string,"total_mensajes"?: number,"ultima_respuesta_at"?: string | null,"ultimo_aviso_mensaje_at"?: string | null,"ultimo_contacto"?: string,"ultimo_mensaje_at"?: string | null,"ultimo_mensaje_lead_at"?: string | null,"ultimo_mensaje_texto"?: string | null,"ultimo_registro_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "asesor_id"?: string | null,"bot_pausado_hasta"?: string | null,"carrera_interes"?: string | null,"convocatoria"?: string | null,"created_at"?: string,"dni"?: string | null,"duplicados_ignorados"?: number,"estado"?: Database["public"]['Enums']["lead_estado"],"fecha_asignado"?: string | null,"fecha_interesado"?: string | null,"fecha_notificacion"?: string | null,"fecha_postulacion"?: string | null,"id"?: string,"modalidad"?: string | null,"motivo_no_interes"?: string | null,"nombre"?: string | null,"notificacion_error"?: string | null,"notificacion_estado"?: string | null,"notificacion_intentos"?: number,"origen"?: string,"primer_contacto"?: string,"programa"?: string,"reconsultas"?: number,"recordatorio_enviado"?: string | null,"resumen"?: string | null,"sede"?: string | null,"sin_responder"?: never,"telefono"?: string,"total_mensajes"?: number,"ultima_respuesta_at"?: string | null,"ultimo_aviso_mensaje_at"?: string | null,"ultimo_contacto"?: string,"ultimo_mensaje_at"?: string | null,"ultimo_mensaje_lead_at"?: string | null,"ultimo_mensaje_texto"?: string | null,"ultimo_registro_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
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
            "asignar_asesor_lead":
{ Args: { "p_lead_id": string }; Returns: {
              "activo": boolean,
"carreras": (string)[],
"created_at": string,
"email": string | null,
"id": string,
"nombre": string,
"rol": Database["public"]['Enums']["asesor_rol"],
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
"crear_usuario_panel":
{ Args: { "p_asesor_id": string,"p_clave": string,"p_debe_cambiar"?: boolean,"p_usuario": string }; Returns: string
                           },
"email_de_usuario":
{ Args: { "p_usuario": string }; Returns: string
                           },
"es_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"marcar_notificacion":
{ Args: { "p_error"?: string,"p_lead_id": string,"p_ok": boolean }; Returns: undefined
                           },
"mi_asesor_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"procesar_lead":
{ Args: { "p_asesor_id"?: string,"p_asignar"?: boolean,"p_carrera"?: string,"p_consulta"?: string,"p_convocatoria"?: string,"p_dni"?: string,"p_modalidad"?: string,"p_nombre"?: string,"p_notificar"?: boolean,"p_origen"?: string,"p_programa"?: string,"p_telefono"?: string }; Returns: Json
                           },
"registrar_lead":
{ Args: { "p_mensaje"?: string,"p_telefono": string }; Returns: {
              "asesor_id": string | null,
"bot_pausado_hasta": string | null,
"carrera_interes": string | null,
"convocatoria": string | null,
"created_at": string,
"dni": string | null,
"duplicados_ignorados": number,
"estado": Database["public"]['Enums']["lead_estado"],
"fecha_asignado": string | null,
"fecha_interesado": string | null,
"fecha_notificacion": string | null,
"fecha_postulacion": string | null,
"id": string,
"modalidad": string | null,
"motivo_no_interes": string | null,
"nombre": string | null,
"notificacion_error": string | null,
"notificacion_estado": string | null,
"notificacion_intentos": number,
"origen": string,
"primer_contacto": string,
"programa": string,
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
"registrar_lead_manual":
{ Args: { "p_asesor_id"?: string,"p_carrera"?: string,"p_convocatoria"?: string,"p_dni"?: string,"p_modalidad"?: string,"p_nombre": string,"p_observacion"?: string,"p_programa"?: string,"p_telefono"?: string }; Returns: Json
                           },
"restablecer_clave_usuario":
{ Args: { "p_asesor_id": string,"p_clave": string,"p_debe_cambiar"?: boolean }; Returns: undefined
                           },
"resumen_dashboard":
{ Args: { "p_asesor_id"?: string,"p_convocatoria"?: string,"p_desde"?: string,"p_hasta"?: string }; Returns: Json
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

