'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { ORIGENES } from '@crm/db'
import { registrarLeadManual, type ResultadoRegistro } from '../acciones'

interface Props {
  esAdmin: boolean
  asesores: { id: string; nombre: string }[]
  convocatorias: string[]
}

export function FormularioNuevoLead({ esAdmin, asesores, convocatorias }: Props) {
  const [resultado, accion, enviando] = useActionState<ResultadoRegistro, FormData>(registrarLeadManual, {})
  const [programa, setPrograma] = useState('pregrado')

  return (
    <form action={accion} className="tarjeta grid gap-4 p-6 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Nombre completo *
        <input name="nombre" required maxLength={120} className="campo mt-1" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Celular (WhatsApp) *
        <input name="telefono" required inputMode="tel" placeholder="951301920" className="campo mt-1" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        DNI
        <input name="dni" inputMode="numeric" maxLength={12} className="campo mt-1" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Programa
        <select name="programa" value={programa} onChange={(e) => setPrograma(e.target.value)} className="campo mt-1">
          <option value="pregrado">Pregrado</option>
          <option value="cepre">CePre</option>
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        {programa === 'cepre' ? 'Modalidad CePre' : 'Carrera de interés'}
        <input name={programa === 'cepre' ? 'modalidad' : 'carrera'} className="campo mt-1" />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Convocatoria
        <input name="convocatoria" list="convocatorias" placeholder="2026-2" className="campo mt-1" />
        <datalist id="convocatorias">
          {convocatorias.map((c) => <option key={c} value={c} />)}
        </datalist>
      </label>
      <label className="text-sm font-medium text-slate-700">
        ¿Cómo nos conoció?
        <select name="origen_campana" defaultValue="" className="campo mt-1">
          <option value="">Sin dato</option>
          {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      {esAdmin ? (
        <label className="text-sm font-medium text-slate-700">
          Asesor
          <select name="asesor_id" defaultValue="" className="campo mt-1">
            <option value="">Asignar por turnos</option>
            {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
      ) : (
        <p className="self-end text-sm text-slate-500">El lead quedará asignado a ti.</p>
      )}
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        Observación
        <textarea name="observacion" rows={3} maxLength={2000} className="campo mt-1" />
      </label>

      {resultado.error && (
        <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
          {resultado.error}
          {resultado.duplicado && resultado.leadId && (
            <> <Link href={`/leads/${resultado.leadId}`} className="font-medium underline">Ver lead</Link></>
          )}
        </div>
      )}

      <div className="flex gap-2 sm:col-span-2">
        <button className="boton" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar lead'}</button>
        <Link href="/leads" className="boton-secundario">Cancelar</Link>
      </div>
    </form>
  )
}
