'use client'

import { Fragment, useActionState, useState, type ReactNode } from 'react'
import { registrarseEnActividad, type ResultadoRegistro } from './acciones'
import { SelectorLugar } from '@/components/SelectorLugar'
import { modoDe, type CampoFormulario, type FormularioActividad, type PreguntaActividad } from '@/lib/formulario-actividad'

const GRADOS = ['5.° de secundaria', '4.° de secundaria', '3.° de secundaria o menos', 'Ya terminé el colegio', 'Universitario / traslado', 'Otro']

const SEDES = [['Juliaca', 'Juliaca (filial Juliaca)'], ['Lima', 'Lima (campus Lima)'], ['Tarapoto', 'Tarapoto (filial Tarapoto)']] as const

type Enviar =(previo: ResultadoRegistro, formData: FormData) => Promise<ResultadoRegistro>

/**
 * Formulario público del QR. Por defecto registra en una actividad (feria, colegio); con `enviar`
 * y `asesor` sirve para el QR de un asesor (atención presencial).
 */
export function FormularioRegistro({ codigo, carreras, carrerasModalidad, colegio, enviar, asesor, formulario }: {
  codigo: string; carreras: string[]; colegio: string | null; enviar?: Enviar; asesor?: string
  /** Carreras semipresenciales y a distancia (sede Lima): se muestran si el alumno elige esa modalidad de estudio */
  carrerasModalidad?: { semipresencial: string[]; distancia: string[] }
  /** Campos y preguntas propias de la actividad (sin él, el formulario de siempre) */
  formulario?: FormularioActividad
}) {
  const f = formulario ?? { campos: {}, preguntas: [] }
  const pide = (c: CampoFormulario) => modoDe(f, c) !== 'oculto'
  const exige = (c: CampoFormulario) => modoDe(f, c) === 'obligatorio'
  // En la inscripción, los campos se nombran como en la ficha de inscripción
  const ins = f.tipo === 'inscripcion'
  // Preguntas que van justo antes o después de un dato (ej. la dirección, junto al domicilio). Si ese dato no se pide, van al final
  const junto = (c: CampoFormulario) => pide(c) && f.preguntas.filter((p) => p.junto === c).map(pregunta)
  const antes = (c: CampoFormulario) => pide(c) && f.preguntas.filter((p) => p.antes === c && !p.junto).map(pregunta)
  // Modalidad de estudio (Presencial / Semipresencial / A distancia): cambia las carreras de la lista
  const pModalidad = f.preguntas.find((p) => p.tipo === 'opcion' && p.opciones?.some((o) => /distancia/i.test(o)) && p.opciones.some((o) => /semi/i.test(o)))
  const [modalidad, setModalidad] = useState('')
  const semi = /semi/i.test(modalidad)
  const distancia = !semi && /distancia/i.test(modalidad)
  const listaCarreras = carrerasModalidad && semi ? carrerasModalidad.semipresencial : carrerasModalidad && distancia ? carrerasModalidad.distancia : carreras
  function pregunta(p: PreguntaActividad) {
    return <Pregunta key={p.id} p={p} campo={campo} alCambiar={p.id === pModalidad?.id ? setModalidad : undefined} />
  }
  // Sede a la que postula (solo en la inscripción): Lima o Tarapoto piden solo datos básicos y la carrera escrita
  const [sede, setSede] = useState('')
  const otraSede = ins && (sede === 'Lima' || sede === 'Tarapoto')
  const ubicada = (p: PreguntaActividad) => (p.junto && pide(p.junto)) || (!p.junto && p.antes && pide(p.antes))
  const [r, accion, enviando] = useActionState<ResultadoRegistro, FormData>(enviar ?? registrarseEnActividad.bind(null, codigo), {})

  if (r.ok) {
    return (
      <div className="space-y-4 py-4 text-center">
        <p className="text-5xl" aria-hidden>🎉</p>
        <h2 className="text-xl font-semibold text-slate-900">¡Listo{r.nombre ? `, ${r.nombre}` : ''}!</h2>
        {r.enlaceWhatsApp ? (
          <>
            <p className="text-sm text-slate-600">
              {asesor
                ? <>Tus datos ya quedaron registrados. Último paso: toca el botón y <b>envía el mensaje</b> para abrir tu chat con Admisión de la Universidad Peruana Unión; <b>{asesor}</b> te sigue atendiendo.</>
                : <>Último paso: toca el botón y <b>envía el mensaje</b>. Genesys, nuestra asesora virtual, te responde al instante con la información de <b>{r.tema}</b>.</>}
            </p>
            <a href={r.enlaceWhatsApp} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-4 text-base font-bold text-white shadow-sm transition hover:brightness-105">
              <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6 fill-current"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg>
              Escríbenos por WhatsApp
            </a>
            <p className="text-xs text-slate-500">Se abrirá WhatsApp con tu mensaje ya escrito. Tu asesor(a) también te contactará.</p>
          </>
        ) : (
          <p className="text-sm text-slate-600">Recibimos tus datos. Tu asesor(a) de admisión te contactará pronto con la información que necesitas.</p>
        )}
      </div>
    )
  }

  const campo = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 focus:border-[#003865] focus:ring-2 focus:ring-[#003865]/20 focus:outline-none'
  // En la inscripción, cada dato abre su sección, como en la ficha de inscripción
  const seccion = (titulo: string) => ins && <h2 className="border-b border-slate-200 pt-3 pb-1 text-base font-semibold text-[#003865]">{titulo}</h2>
  const datos: Record<'carrera' | 'dni' | 'colegio' | 'procedencia', ReactNode> = {
    carrera: pide('carrera') && (
      <>
        {seccion('Datos de admisión')}
        {antes('carrera')}
        <label className="block text-sm font-medium text-slate-700">{ins ? 'Carrera profesional' : 'Carrera que te interesa'}{exige('carrera') && ' *'}
          {/* key: al cambiar de modalidad se borra la carrera elegida (puede no existir en la otra) */}
          <select key={semi ? 'semi' : distancia ? 'distancia' : 'presencial'} name="carrera" defaultValue="" required={exige('carrera')} className={campo}>
            <option value="">{exige('carrera') ? 'Elige una opción' : 'Aún no lo decido'}</option>
            {!semi && !distancia && <option value="CEPRE">CEPRE (preuniversitario)</option>}
            {listaCarreras.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {carrerasModalidad && (semi || distancia) && <span className="mt-1 block text-xs font-normal text-slate-500">{semi ? 'Carreras semipresenciales' : 'Carreras a distancia · sede Lima'}</span>}
        </label>
        {junto('carrera')}
      </>
    ),
    dni: (pide('dni') || pide('grado')) && (
      <>
        {antes('dni')}
        {antes('grado')}
        <div className={`grid gap-3 ${pide('dni') && pide('grado') ? 'grid-cols-2' : ''}`}>
          {pide('dni') && (
            <label className="block text-sm font-medium text-slate-700">{ins ? 'Número de DNI' : 'DNI'}{exige('dni') && ' *'}
              <input name="dni" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} title="8 dígitos" required={exige('dni')} placeholder={exige('dni') ? '8 dígitos' : 'Opcional'} className={campo} />
            </label>
          )}
          {pide('grado') && (
            <label className="block text-sm font-medium text-slate-700">Grado{exige('grado') && ' *'}
              <select name="grado" defaultValue="" required={exige('grado')} className={campo}>
                <option value="">—</option>
                {GRADOS.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
          )}
        </div>
        {junto('dni')}
        {junto('grado')}
      </>
    ),
    colegio: pide('colegio') && (
      <>
        {seccion('Centro de estudios de procedencia')}
        {antes('colegio')}
        <label className="block text-sm font-medium text-slate-700">{ins ? 'Nombre del centro de procedencia educativa' : 'Colegio'}{exige('colegio') && ' *'}
          <input name="colegio" maxLength={120} defaultValue={colegio ?? ''} required={exige('colegio')} placeholder="Nombre de tu colegio" className={campo} />
        </label>
        {junto('colegio')}
      </>
    ),
    procedencia: pide('procedencia') && (
      <>
        {seccion('Dirección de domicilio')}
        {antes('procedencia')}
        <SelectorLugar
          nombre="ubigeo" obligatorio={exige('procedencia')} claseCampo={campo}
          etiqueta={ins ? 'Domicilio' : '¿De dónde eres?'}
        />
        {junto('procedencia')}
      </>
    ),
  }
  // Inscripción: el orden de la ficha de inscripción; formulario corto: lo más rápido de llenar primero
  const orden = ins ? (['dni', 'procedencia', 'carrera', 'colegio'] as const) : (['carrera', 'dni', 'colegio', 'procedencia'] as const)
  return (
    <form action={accion} className="space-y-4">
      {/* Inscripción: primero la sede. Juliaca llena la ficha completa; Lima o Tarapoto, solo datos básicos y la carrera */}
      {ins && (
        <label className="block text-sm font-medium text-slate-700">¿A qué sede deseas postular? *
          <select name="sede" value={sede} onChange={(e) => setSede(e.target.value)} required className={campo}>
            <option value="">Elige una sede</option>
            {SEDES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      )}
      {ins && !sede ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Elige la sede para continuar con tu inscripción.</p>
      ) : (
        <>
          {seccion('Datos personales')}
          <label className="block text-sm font-medium text-slate-700">Nombres y apellidos *
            <input name="nombre" required minLength={3} maxLength={120} autoComplete="name" className={campo} />
          </label>
          <label className="block text-sm font-medium text-slate-700">{ins ? 'Número actual del postulante (WhatsApp)' : 'Celular (WhatsApp)'} *
            <input name="celular" required inputMode="tel" autoComplete="tel" placeholder="987 654 321" className={campo} />
          </label>
          {otraSede ? (
            <>
              {pide('dni') && (
                <label className="block text-sm font-medium text-slate-700">Número de DNI{exige('dni') && ' *'}
                  <input name="dni" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} title="8 dígitos" required={exige('dni')} placeholder={exige('dni') ? '8 dígitos' : 'Opcional'} className={campo} />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">Carrera a la que deseas postular *
                <input name="carrera" required minLength={3} maxLength={150} placeholder="Escribe el nombre de la carrera" className={campo} />
                <span className="mt-1 block text-xs font-normal text-slate-500">Sede {sede}: te contactaremos para orientarte en tu postulación.</span>
              </label>
            </>
          ) : (
            <>
              {orden.map((c) => <Fragment key={c}>{datos[c]}</Fragment>)}
              {f.preguntas.filter((p) => !ubicada(p)).map(pregunta)}
            </>
          )}
        </>
      )}
      {/* Campo trampa para bots (oculto para las personas) */}
      <input name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <label className="flex items-start gap-3 text-sm text-slate-600">
        <input type="checkbox" name="acepto" required className="mt-1 h-5 w-5 shrink-0 accent-[#003865]" />
        Acepto que la Universidad Peruana Unión me contacte por WhatsApp o llamada para darme información de admisión.
      </label>
      {r.error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{r.error}</p>}
      <button disabled={enviando} className="w-full rounded-xl bg-[#003865] px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60">
        {enviando ? 'Enviando…' : asesor ? 'Enviar mis datos' : ins ? 'Enviar mi inscripción' : 'Quiero recibir información'}
      </button>
    </form>
  )
}

/** Pregunta propia de la actividad. Se envía como "p_<id>" (varias opciones: "pv_<id>", una por casilla). */
function Pregunta({ p, campo, alCambiar }: { p: PreguntaActividad; campo: string; alCambiar?: (valor: string) => void }) {
  const titulo = <>{p.texto}{p.obligatoria && ' *'}</>
  if (p.tipo === 'texto') {
    return (
      <label className="block text-sm font-medium text-slate-700">{titulo}
        <textarea name={`p_${p.id}`} rows={2} maxLength={500} required={p.obligatoria} className={campo} />
      </label>
    )
  }
  // Lugar (ej. de nacimiento, del colegio): departamento → provincia (→ distrito) en listas; se envía como "pl_<id>"
  if (p.tipo === 'lugar') {
    return <SelectorLugar nombre={`pl_${p.id}`} etiqueta={p.texto} hasta={p.hasta ?? 'distrito'} obligatorio={p.obligatoria} claseCampo={campo} />
  }
  if (p.tipo === 'fecha' || p.tipo === 'correo' || p.tipo === 'numero') {
    return (
      <label className="block text-sm font-medium text-slate-700">{titulo}
        <input
          name={`p_${p.id}`} required={p.obligatoria}
          {...(p.tipo === 'fecha'
            ? { type: 'date', max: new Date().toISOString().slice(0, 10) }
            : p.tipo === 'correo'
              ? { type: 'email', maxLength: 120, autoComplete: 'email', placeholder: 'tucorreo@gmail.com' }
              : { type: 'tel', inputMode: 'tel' as const, maxLength: 20, pattern: '[0-9 +]{6,20}', title: 'Solo números', placeholder: '987 654 321' })}
          className={campo}
        />
      </label>
    )
  }
  const opciones = p.tipo === 'si_no' ? ['Sí', 'No'] : (p.opciones ?? [])
  const varias = p.tipo === 'varias'
  // Una sola opción (incluido Sí / No): lista desplegable
  if (!varias) {
    return (
      <label className="block text-sm font-medium text-slate-700">{titulo}
        <select name={`p_${p.id}`} defaultValue="" required={p.obligatoria} onChange={alCambiar && ((e) => alCambiar(e.target.value))} className={campo}>
          <option value="">Elige una opción</option>
          {opciones.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    )
  }
  // Varias opciones: casillas (una lista desplegable no permite marcar varias en el celular)
  return (
    <fieldset className="text-sm">
      <legend className="font-medium text-slate-700">{titulo}<span className="font-normal text-slate-500"> (puedes marcar varias)</span></legend>
      <div className={`mt-2 grid gap-2 ${opciones.every((o) => o.length <= 12) ? 'grid-cols-2' : ''}`}>
        {opciones.map((o) => (
          <label key={o} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-800 has-checked:border-[#003865] has-checked:bg-[#003865]/5">
            <input type="checkbox" name={`pv_${p.id}`} value={o} className="h-5 w-5 shrink-0 accent-[#003865]" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
