// =====================================================================
//  flujos_leads.js - Flujos de Genesys para captar y calificar leads
//  Adapta los textos y carreras a los de tu universidad.
// =====================================================================
import { addKeyword, EVENTS } from '@builderbot/bot'
import {
  registrarLead, actualizarLead, obtenerLead,
  marcarLeadNoInteresado, confirmarLeadInteresado,
} from './leads.js'

const CARRERAS = [
  'Ingeniería de Sistemas', 'Ingeniería Civil', 'Administración',
  'Contabilidad', 'Enfermería', 'Psicología', 'Nutrición',
]

// ---------------------------------------------------------------------
// 1. Bienvenida: todo el que escribe queda registrado como lead
// ---------------------------------------------------------------------
export const flujoBienvenida = addKeyword(EVENTS.WELCOME)
  .addAction(async (ctx, { endFlow, flowDynamic, gotoFlow }) => {
    const lead = await registrarLead(ctx.from, ctx.body)

    // Si el lead ya tiene asesor, el bot no interviene
    if (lead?.estado && !['lead_nuevo', 'lead_en_conversacion', 'lead_no_interesado'].includes(lead.estado)) {
      return endFlow()
    }

    if (lead?.estado === 'lead_nuevo') {
      await actualizarLead(ctx.from, { estado: 'lead_en_conversacion' })
    }

    // Aquí va tu lógica actual de Genesys para responder preguntas.
    // Cuando detectes interés (ej. pregunta por inscripción, costos, examen), llama:
    // return gotoFlow(flujoCalificarLead)
  })

// ---------------------------------------------------------------------
// 2. Calificación del lead: datos mínimos + confirmación
// ---------------------------------------------------------------------
export const flujoCalificarLead = addKeyword(EVENTS.ACTION)
  .addAnswer('¡Genial! Para ayudarte mejor, ¿cuál es tu nombre completo?', { capture: true },
    async (ctx, { state }) => {
      await state.update({ nombre: ctx.body.trim() })
      await actualizarLead(ctx.from, { nombre: ctx.body.trim() })
    })
  .addAnswer(
    ['¿Qué carrera te interesa?', ...CARRERAS.map((c, i) => `${i + 1}. ${c}`)].join('\n'),
    { capture: true },
    async (ctx, { state, fallBack }) => {
      const n = parseInt(ctx.body, 10)
      const carrera = CARRERAS[n - 1] ?? CARRERAS.find(c => c.toLowerCase().includes(ctx.body.toLowerCase().trim()))
      if (!carrera) return fallBack('No encontré esa carrera 😅 Escribe el número de la lista.')
      await state.update({ carrera })
      await actualizarLead(ctx.from, { carrera_interes: carrera })
    })
  .addAnswer('¿En qué modalidad te gustaría estudiar? (presencial / semipresencial / virtual)', { capture: true },
    async (ctx) => {
      await actualizarLead(ctx.from, { modalidad: ctx.body.trim().toLowerCase() })
    })
  .addAnswer('¿Quieres que un asesor de admisión te contacte para ayudarte con tu inscripción? (sí / no)', { capture: true },
    async (ctx, { state, provider, flowDynamic, endFlow, blacklist }) => {
      const respuesta = ctx.body.trim().toLowerCase()

      // Lead no interesado: queda guardado para el registro
      if (!/^(s[ií]|si|claro|ok|dale)/.test(respuesta)) {
        await marcarLeadNoInteresado(ctx.from, 'No quiso contacto de asesor')
        return endFlow('¡Entendido! Tus consultas quedan registradas. Escríbeme cuando quieras 😊')
      }

      // Lead interesado: se asigna asesor automáticamente
      const resultado = await confirmarLeadInteresado(ctx.from)
      const { nombre, carrera } = state.getMyState()

      if (!resultado?.asesor) {
        return endFlow('¡Gracias! Registramos tu interés y un asesor te escribirá pronto.')
      }

      const { asesor } = resultado
      await provider.sendMessage(
        asesor.telefono,
        `🔔 *Nuevo lead asignado*\n👤 ${nombre}\n🎓 ${carrera}\n📱 wa.me/${ctx.from}`,
        {}
      )

      // El lead pasa al asesor: Genesys deja de responderle
      blacklist.add(ctx.from)

      await flowDynamic(`¡Listo, ${nombre}! Un asesor de ${carrera} te escribirá en breve 🙌`)
    })
