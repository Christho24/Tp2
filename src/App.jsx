
import React, { useMemo, useRef, useState } from 'react'
import { Download, Bell, Search, User2, Stethoscope, Syringe, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import * as XLSX from 'xlsx'

const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
// Shifts (incluye 12h diferenciadas)
const shifts = ['Mañana','Tarde','Noche','12h Día','12h Noche','24h']

const roles = { DOCTOR:'Doctor', NURSE:'Enfermero/a' }
const roleIcon = (role) => (role === roles.DOCTOR ? <Stethoscope className="h-4 w-4" /> : <Syringe className="h-4 w-4" />)
const roleColor = (role) => (role === roles.DOCTOR ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700')

const seedPeople = [
  { id:'D1', name:'Dr. Roberto Gómez', role:roles.DOCTOR, stars:5, contract:'Contrato', hours:36 },
  { id:'D2', name:'Dra. Laura Fernández', role:roles.DOCTOR, stars:4, contract:'Contrato', hours:36 },
  { id:'D3', name:'Dr. Jorge Castro', role:roles.DOCTOR, stars:3, contract:'Honorarios', hours:24 },
  { id:'D4', name:'Dra. Claudia Silva', role:roles.DOCTOR, stars:2, contract:'Contrato', hours:24 },
  { id:'D5', name:'Dr. Manuel Rojas', role:roles.DOCTOR, stars:5, contract:'Contrato', hours:44 },
  { id:'D6', name:'Dra. Andrea Soto', role:roles.DOCTOR, stars:4, contract:'Honorarios', hours:30 },
  { id:'E1', name:'Ana Pérez', role:roles.NURSE, stars:4, contract:'Contrato', hours:40 },
  { id:'E2', name:'Carlos Soto', role:roles.NURSE, stars:3, contract:'Contrato', hours:36 },
  { id:'E3', name:'Luisa Morales', role:roles.NURSE, stars:2, contract:'Honorarios', hours:28 },
  { id:'E4', name:'Javier Ríos', role:roles.NURSE, stars:1, contract:'Contrato', hours:30 },
  { id:'E5', name:'Sofía Castro', role:roles.NURSE, stars:5, contract:'Contrato', hours:44 },
  { id:'E6', name:'Miguel Ángel', role:roles.NURSE, stars:4, contract:'Contrato', hours:40 },
  { id:'E7', name:'Valentina Gómez', role:roles.NURSE, stars:3, contract:'Contrato', hours:36 },
  { id:'E8', name:'Diego Fernández', role:roles.NURSE, stars:2, contract:'Contrato', hours:32 },
  { id:'E9', name:'Camila Díaz', role:roles.NURSE, stars:5, contract:'Contrato', hours:44 },
  { id:'E10', name:'Benjamín Núñez', role:roles.NURSE, stars:3, contract:'Honorarios', hours:28 },
]

const makeEmptyWeek = () => {
  const base = {}
  days.forEach((d)=>{
    base[d] = {}
    shifts.forEach((s)=>{
      base[d][s] = { assigned: [] }
    })
  })
  return base
}

export default function App(){
  const [people] = useState(seedPeople)
  const [week, setWeek] = useState(makeEmptyWeek)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  // Estado para asociados al horario
  const [asociados, setAsociados] = useState([])

  const dragPersonRef = useRef(null)

  const filteredPeople = useMemo(()=>{
    const term = search.toLowerCase()
    return people.filter((p)=>{
      const byRole = roleFilter === 'all' || (roleFilter === 'doctor' ? p.role === roles.DOCTOR : p.role === roles.NURSE)
      return byRole && (p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term))
    })
  }, [people, search, roleFilter])

  const alreadyAssigned = useMemo(()=>{
    const map = new Map()
    days.forEach((d)=>shifts.forEach((s)=>{
      week[d][s].assigned.forEach((id)=>{
        if(!map.has(id)) map.set(id, [])
        map.get(id).push({ day:d, shift:s })
      })
    }))
    return map
  }, [week])

  const isConsecutiveShift = (prevShift, nextShift) => {
    const order = ['Mañana','Tarde','Noche']
    const i1 = order.indexOf(prevShift), i2 = order.indexOf(nextShift)
    if(i1 === -1 || i2 === -1) return false
    return Math.abs(i1-i2) === 1
  }

  // Reglas solicitadas:
  // - 12h (Día/Noche) exclusivo del día y bloquea TODOS los turnos del día siguiente.
  // - 24h exclusivo del día y bloquea TODOS los turnos de los próximos 3 días.
  // - Si hizo Noche el día anterior, NO puede Mañana hoy.
  // - 24h NO puede si ayer fue Noche.
  const canAssign = (person, day, shift) => {
    const current = alreadyAssigned.get(person.id) || []
    const dayIdx = days.indexOf(day)
    const prevDay = days[dayIdx-1]
    const nextDay = days[dayIdx+1]
    const next2Day = days[dayIdx+2]
    const next3Day = days[dayIdx+3]

    // 1) Exclusividades del mismo día
    for(const a of current){
      if(a.day === day){
        // no puede repetir mismo bloque ni mezclar con otros si es 12h/24h
        if(a.shift === shift) return false
        if(shift.includes('12h') || shift === '24h') return false
        if(a.shift.includes('12h') || a.shift === '24h') return false
        // regla estándar de consecutivos (M-T, T-N)
        if(isConsecutiveShift(a.shift, shift)) return false
      }
    }

    // 2) Reglas inter-día
    if(prevDay && shift === 'Mañana'){
      const prevNight = current.some((a)=> a.day===prevDay && a.shift==='Noche')
      if(prevNight) return false
    }
    if(prevDay && shift === '24h'){
      const prevNight = current.some((a)=> a.day===prevDay && a.shift==='Noche')
      if(prevNight) return false
    }

    // Si ayer tuvo 12h Día o 12h Noche -> hoy NO puede ningún turno
    if(prevDay){
      const prev12 = current.some((a)=> a.day===prevDay && (a.shift==='12h Día' || a.shift==='12h Noche'))
      if(prev12) return false
    }

    // Si tuvo 24h en los 3 días anteriores -> hoy NO puede (bloqueo 3 días)
    const blockedBy24h = current.some((a)=>{
      const dIdx = days.indexOf(a.day)
      return a.shift === '24h' && (dayIdx - dIdx) >= 1 && (dayIdx - dIdx) <= 3
    })
    if(blockedBy24h) return false

    return true
  }

  const assignPerson = (personId, day, shift) => {
    const person = people.find((p)=>p.id===personId)
    if(!person) return
    if(!canAssign(person, day, shift)){
      toast.warning('No se puede asignar: restricciones de 12h/24h, descanso o consecutivos.')
      return
    }
    setWeek((w)=>{
      const next = structuredClone(w)
      next[day][shift].assigned.push(personId)
      if (person.role === roles.DOCTOR || person.role === roles.NURSE) {
        // console.log(`Grilla actualizada: ${person.role} asignado/a (${person.name}) a ${day} - ${shift}`)
      }
      return next
    })
    // Actualizar asociados
    setTimeout(()=>{
      setAsociados((prev)=>{
        // Recalcular todos los asignados únicos actuales
        const asignados = new Set()
        days.forEach((d)=>shifts.forEach((s)=>{
          week[d][s].assigned.forEach((id)=>{
            const p = people.find((x)=>x.id===id)
            if(p && (p.role === roles.DOCTOR || p.role === roles.NURSE)) asignados.add(id)
          })
        }))
        asignados.add(personId)
        return Array.from(asignados).map(id=>people.find(p=>p.id===id)).filter(Boolean)
      })
    }, 0)
  }

  const removePerson = (personId, day, shift) => {
    const person = people.find((p)=>p.id===personId)
    setWeek((w)=>{
      const next = structuredClone(w)
      next[day][shift].assigned = next[day][shift].assigned.filter((x)=>x!==personId)
      if (person && (person.role === roles.DOCTOR || person.role === roles.NURSE)) {
        // console.log(`Grilla actualizada: ${person.role} removido/a (${person.name}) de ${day} - ${shift}`)
      }
      return next
    })
    // Actualizar asociados
    setTimeout(()=>{
      setAsociados(()=>{
        // Recalcular todos los asignados únicos actuales
        const asignados = new Set()
        days.forEach((d)=>shifts.forEach((s)=>{
          week[d][s].assigned.forEach((id)=>{
            const p = people.find((x)=>x.id===id)
            if(p && (p.role === roles.DOCTOR || p.role === roles.NURSE)) asignados.add(id)
          })
        }))
        // No agregamos personId porque fue removido
        return Array.from(asignados).map(id=>people.find(p=>p.id===id)).filter(Boolean)
      })
    }, 0)
  }

  const onDragStartFromPool = (p) => (e) => {
    dragPersonRef.current = { id: p.id }
    e.dataTransfer.setData('text/plain', p.id)
  }
  const onDragStartFromCell = (p, day, shift) => (e) => {
    dragPersonRef.current = { id: p.id, fromCell: {day, shift} }
    e.dataTransfer.setData('text/plain', p.id)
  }
  const onAllowDrop = (e)=> e.preventDefault()
  const onDropToCell = (day, shift) => (e) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    const dragging = dragPersonRef.current
    if(!id || !dragging) return
    if(dragging.fromCell){
      const { day:d0, shift:s0 } = dragging.fromCell
      setWeek((w)=>{
        const next = structuredClone(w)
        next[d0][s0].assigned = next[d0][s0].assigned.filter((x)=>x!==id)
        return next
      })
    }
    setTimeout(()=>assignPerson(id, day, shift), 0)
    dragPersonRef.current = null
  }

  const exportExcel = () => {
    const rows = []
    days.forEach((d)=>{
      shifts.forEach((s)=>{
        const cell = week[d][s]
        const assigned = cell.assigned.map((id)=> people.find((p)=>p.id===id)?.name || id).join(', ')
        rows.push({ Día:d, Turno:s, Asignados: assigned })
      })
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Horario')
    XLSX.writeFile(wb, 'horario_semana.xlsx')
    toast.success('¡Horario subido a la app!')
  }

  const COL_WIDTH = 260

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster richColors position="top-right" />
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <svg className="h-8 w-8 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </motion.div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Creación de Horario <span className="text-sky-600">HUAP</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportExcel} className="rounded-2xl shadow-sm px-3 py-2 bg-sky-600 text-white flex items-center gap-2"><Download className="h-4 w-4"/>Exportar Excel</button>
            <button onClick={()=>toast.message('Se notificará a los usuarios',{ description:'El horario quedará disponible en la app.'})} className="rounded-2xl px-3 py-2 border flex items-center gap-2"><Bell className="h-4 w-4"/>Avisar publicación</button>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-3 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Sidebar */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="rounded-2xl shadow-sm border bg-white">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500"/>
                <input className="w-full border rounded-md px-2 py-1" placeholder="Buscar por nombre o ID…" value={search} onChange={(e)=>setSearch(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 text-sm">
                <button onClick={()=>setRoleFilter('all')} className={`py-1 border ${roleFilter==='all'?'bg-slate-100 font-semibold':''}`}>Todos</button>
                <button onClick={()=>setRoleFilter('doctor')} className={`py-1 border -ml-px ${roleFilter==='doctor'?'bg-slate-100 font-semibold':''}`}>Doctores</button>
                <button onClick={()=>setRoleFilter('nurse')} className={`py-1 border -ml-px ${roleFilter==='nurse'?'bg-slate-100 font-semibold':''}`}>Enfermería</button>
              </div>
              <div className="max-h-[62vh] overflow-y-auto pr-1 space-y-2">
                {filteredPeople.map((p)=>(
                  <div key={p.id} draggable onDragStart={onDragStartFromPool(p)} className="bg-white border border-slate-200 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User2 className="h-5 w-5 text-slate-500"/>
                        <div>
                          <p className="font-semibold text-slate-800 leading-tight">{p.name}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className={`px-1.5 py-0.5 rounded ${roleColor(p.role)} flex items-center gap-1`}>{roleIcon(p.role)} {p.role}</span>
                            <span>★ {p.stars}</span>
                            <span>{p.contract}</span>
                            <span>{p.hours} h/sem</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded border bg-slate-50">{p.id}</span>
                    </div>
                  </div>
                ))}
                {filteredPeople.length===0 && <div className="text-center text-sm text-slate-500 py-8">Sin resultados</div>}
              </div>
              <div className="text-xs text-slate-500 flex items-start gap-2 pt-2">
                <AlertTriangle className="h-4 w-4 mt-0.5"/> Arrastra desde este panel hacia la grilla.
              </div>
              {/* Lista de asociados al horario */}
              <div className="mt-6">
                <h3 className="font-semibold text-slate-700 mb-2 text-sm">Asociados al horario</h3>
                {asociados.length === 0 ? (
                  <div className="text-xs text-slate-500">No hay asociados asignados aún.</div>
                ) : (
                  <ul className="space-y-1">
                    {asociados.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-xs bg-slate-100 rounded px-2 py-1">
                        <span className={`rounded px-1 ${roleColor(p.role)}`}>{p.role === roles.DOCTOR ? 'Dr' : 'Enf'}</span>
                        <span className="font-medium text-slate-800">{p.name}</span>
                        <span className="text-slate-500">({p.id})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Grilla horizontal */}
        <div className="lg:col-span-8 xl:col-span-9 overflow-x-auto">
          <div className="grid grid-flow-col auto-cols-[260px] gap-4 pr-4">
            {days.map((day)=>(
              <div key={day} className="rounded-2xl shadow-sm overflow-hidden border bg-white shrink-0" style={{ width: COL_WIDTH }}>
                <div className="bg-white border-b p-3 text-center font-semibold">{day}</div>
                <div className="p-2 space-y-2">
                  {shifts.map((shift)=>(
                    <div key={shift} onDragOver={onAllowDrop} onDrop={onDropToCell(day, shift)} className="bg-slate-100 rounded-xl p-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-semibold text-slate-700">{shift}</div>
                      </div>
                      <div className="space-y-1">
                        {week[day][shift].assigned.length===0 && <div className="text-xs text-slate-500 text-center py-3">Arrastra personal aquí</div>}
                        {week[day][shift].assigned.map((id)=>{
                          const p = people.find((x)=>x.id===id)
                          if(!p) return null
                          return (
                            <div key={id} draggable onDragStart={onDragStartFromCell(p, day, shift)} className="bg-white rounded-lg px-2 py-1 border border-slate-200 flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className={`rounded px-1 text-xs ${roleColor(p.role)}`}>{p.role===roles.DOCTOR ? 'Dr' : 'Enf'}</span>
                                <span className="font-medium text-slate-800">{p.name}</span>
                                <span className="text-xs text-slate-500">★ {p.stars}</span>
                              </div>
                              <button className="text-slate-600 hover:underline text-xs" onClick={()=>removePerson(id, day, shift)}>Quitar</button>
                            </div>
                          )
                        })}
                      </div>
                      {/* Resumen de roles asignados */}
                      <div className="mt-1 text-xs text-slate-600 flex gap-2">
                        {(() => {
                          const assigned = week[day][shift].assigned.map(id => people.find(p => p.id === id)).filter(Boolean);
                          const countDoctor = assigned.filter(p => p.role === roles.DOCTOR).length;
                          const countNurse = assigned.filter(p => p.role === roles.NURSE).length;
                          return (
                            <>
                              <span>Dr: {countDoctor}</span>
                              <span>Enf: {countNurse}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
