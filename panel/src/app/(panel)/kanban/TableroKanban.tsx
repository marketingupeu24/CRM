'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition } from 'react'
import {
  DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { ETIQUETAS_ESTADO, type LeadEstado } from '@crm/db'
import { COLOR_ESTADO, haceCuanto } from '@/lib/formato'
import { cambiarEstado } from '../leads/acciones'

export interface TarjetaLead {
  id: string
  nombre: string | null
  telefono: string
  carrera_interes: string | null
  modalidad: string | null
  programa: string
  estado: LeadEstado
  updated_at: string
  asesor: string | null
}

function Tarjeta({ lead, mostrarAsesor, ahora }: { lead: TarjetaLead; mostrarAsesor: boolean; ahora: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  const estilo = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined

  return (
    <div
      ref={setNodeRef} style={estilo} {...listeners} {...attributes}
      className={`cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing ${
        isDragging ? 'z-50 opacity-80 shadow-lg ring-2 ring-marca-600' : ''
      }`}
    >
      <Link
        href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-marca-700 hover:underline"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {lead.nombre ?? 'Sin nombre'}
      </Link>
      <p className="mt-0.5 text-xs text-slate-500">{lead.telefono}</p>
      <p className="mt-1 truncate text-xs text-slate-600">
        {lead.programa === 'cepre' ? 'CePre · ' : ''}{lead.carrera_interes ?? lead.modalidad ?? 'Sin carrera'}
      </p>
      <div className="mt-2 flex justify-between gap-2 text-xs text-slate-400">
        <span className="truncate">{mostrarAsesor ? (lead.asesor ?? 'Sin asesor') : ''}</span>
        <span className="whitespace-nowrap">{haceCuanto(lead.updated_at, ahora)}</span>
      </div>
    </div>
  )
}

function Columna(
  { estado, leads, mostrarAsesor, ahora }: { estado: LeadEstado; leads: TarjetaLead[]; mostrarAsesor: boolean; ahora: number },
) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl p-2 transition-colors ${isOver ? 'bg-marca-100' : 'bg-slate-100'}`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${COLOR_ESTADO[estado]}`}>
          {ETIQUETAS_ESTADO[estado]}
        </span>
        <span className="text-xs font-medium text-slate-500">{leads.length}</span>
      </div>
      <div className="flex min-h-24 flex-col gap-2 overflow-y-auto">
        {leads.map((l) => <Tarjeta key={l.id} lead={l} mostrarAsesor={mostrarAsesor} ahora={ahora} />)}
      </div>
    </div>
  )
}

export function TableroKanban(
  { leads, estados, mostrarAsesor, ahora }: { leads: TarjetaLead[]; estados: readonly LeadEstado[]; mostrarAsesor: boolean; ahora: number },
) {
  const [error, setError] = useState<string | null>(null)
  const [, iniciar] = useTransition()
  // Mueve la tarjeta al instante; si el servidor falla, vuelve a su columna
  const [optimistas, mover] = useOptimistic(
    leads,
    (actuales, { id, estado }: { id: string; estado: LeadEstado }) =>
      actuales.map((l) => (l.id === id ? { ...l, estado, updated_at: new Date().toISOString() } : l)),
  )
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function alSoltar({ active, over }: DragEndEvent) {
    if (!over) return
    const lead = optimistas.find((l) => l.id === active.id)
    const estado = over.id as LeadEstado
    if (!lead || lead.estado === estado) return

    setError(null)
    iniciar(async () => {
      mover({ id: lead.id, estado })
      const r = await cambiarEstado(lead.id, estado)
      if (r.error) setError(`${lead.nombre ?? 'Lead'}: ${r.error}`)
    })
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {/* Auto-scroll solo muy cerca del borde, para no pasarse de columna al soltar */}
      <DndContext sensors={sensores} onDragEnd={alSoltar} autoScroll={{ threshold: { x: 0.08, y: 0.1 } }}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {estados.map((estado) => (
            <Columna
              key={estado} estado={estado} mostrarAsesor={mostrarAsesor} ahora={ahora}
              leads={optimistas.filter((l) => l.estado === estado)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
