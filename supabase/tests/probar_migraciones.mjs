// Prueba las migraciones en un Postgres en memoria (PGlite), sin tocar Supabase.
// Uso: npm run db:test
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const db = new PGlite({ extensions: { pgcrypto } })
let fallos = 0
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fallos++ }
const q = async (s, p) => (await db.query(s, p)).rows
const uno = async (s, p) => (await q(s, p))[0]
const falla = async (s, m) => { try { await db.exec(s); ok(false, m + ' (no lanzó error)') } catch (e) { ok(true, m + ' -> ' + e.message) } }
const seccion = (t) => console.log(`\n--- ${t}`)

// Simulación mínima de Supabase: roles y esquema auth
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create schema extensions;
  create table auth.users (
    instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text,
    encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz, confirmation_token text, email_change text,
    email_change_token_new text, recovery_token text);
  create table auth.identities (
    id uuid primary key, user_id uuid references auth.users(id), provider_id text, identity_data jsonb,
    provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`)
for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).sort()) {
  await db.exec(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8')); console.log('migración aplicada:', f)
}
await db.exec(fs.readFileSync(path.join(ROOT, 'seed.sql'), 'utf8'))
ok(true, 'seed.sql de ejemplo se aplica')
await db.exec(`delete from asesores`)

// Asesores de prueba: 3 generales, 1 CePre, 1 especialista, 1 inactivo y el admin
await db.exec(`
  insert into asesores (nombre, telefono, email, rol, carreras, activo) values
    ('Admin',     '51900000000', 'admin@test.pe', 'admin',  '{}',                  true),
    ('General A', '51900000001', 'a@test.pe',     'asesor', '{}',                  true),
    ('General B', '51900000002', 'b@test.pe',     'asesor', '{}',                  true),
    ('General C', '51900000003', 'c@test.pe',     'asesor', '{}',                  true),
    ('Judith',    '51900000099', 'j@test.pe',     'asesor', '{CEPRE}',             true),
    ('Enfermera', '51900000050', 'e@test.pe',     'asesor', '{Enfermería}',        true),
    ('Inactivo',  '51900000077', 'x@test.pe',     'asesor', '{}',                  false);
`)
const asesor = async (nombre) => (await uno(`select * from asesores where nombre=$1`, [nombre]))
const procesar = async (args) => {
  const keys = Object.keys(args)
  const sql = `select procesar_lead(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) r`
  return (await uno(sql, Object.values(args))).r
}

seccion('registrar_lead (todo el que escribe es lead)')
await q(`select registrar_lead('51911111111','hola')`)
await q(`select registrar_lead('51911111111','quiero info')`)
const l1 = await uno(`select * from leads where telefono='51911111111'`)
ok((await uno(`select count(*)::int c from leads`)).c === 1, 'teléfono único: un solo lead tras 2 mensajes')
ok(l1.total_mensajes === 2, 'total_mensajes = 2')

seccion('vinculación de cuentas del panel')
await db.exec(`insert into auth.users (email) values ('ADMIN@test.pe'), ('a@test.pe'), ('b@test.pe'), ('j@test.pe')`)
ok((await uno(`select count(*)::int c from asesores where user_id is not null`)).c === 4, 'usuarios vinculados por email (sin distinguir mayúsculas)')

seccion('procesar_lead: rotación de asesores generales')
const rot = []
for (let i = 0; i < 6; i++) {
  const r = await procesar({ p_telefono: `5192000000${i}`, p_dni: `4000000${i}`, p_nombre: `Lead ${i}`, p_carrera: 'Ingeniería de Sistemas', p_notificar: true })
  rot.push(r.asesor_nombre)
}
console.log('      rotación:', rot.join(' | '))
ok(rot.join() === 'General A,General B,General C,General A,General B,General C', 'rotación cíclica entre los 3 generales (sin admin, CePre, especialista ni inactivo)')
const l0 = await uno(`select * from leads where telefono='51920000000'`)
ok(l0.estado === 'lead_asignado' && l0.fecha_interesado && l0.fecha_asignado && l0.notificacion_estado === 'pendiente', 'lead nuevo: asignado, con fechas y notificación pendiente')

seccion('CePre y especialistas')
const cep = await procesar({ p_telefono: '51930000001', p_nombre: 'Postulante CePre', p_modalidad: 'CePre Presencial', p_programa: 'cepre', p_notificar: true })
ok(cep.asesor_nombre === 'Judith', 'lead de CePre -> Judith')
const enf = await procesar({ p_telefono: '51930000002', p_nombre: 'Postulante Enf', p_carrera: 'Enfermería' })
ok(enf.asesor_nombre === 'Enfermera', 'carrera con especialista -> especialista')

seccion('duplicados e idempotencia')
const dup = await procesar({ p_telefono: '51920000000', p_dni: '40000000', p_nombre: 'Lead 0', p_notificar: true })
ok(dup.status === 'duplicate' && dup.asesor_nombre === 'General A' && dup.notificar === false, 'reintento del mismo lead: duplicate, mismo asesor, sin notificar')
const dupDni = await procesar({ p_telefono: '51988888888', p_dni: '40000001', p_nombre: 'Otro número', p_notificar: true })
ok(dupDni.status === 'duplicate' && dupDni.asesor_nombre === 'General B', 'mismo DNI desde otro número: duplicate, sin nuevo lead')
ok((await q(`select 1 from leads where telefono='51988888888'`)).length === 0, 'no se creó lead para el otro número')
ok((await uno(`select duplicados_ignorados d from leads where dni='40000001'`)).d === 1, 'duplicados_ignorados se incrementa')
const cuentaAntes = (await uno(`select count(*)::int c from leads`)).c
const conc = await Promise.all([1, 2, 3].map(() => procesar({ p_telefono: '51940000000', p_dni: '47000000', p_nombre: 'Concurrente', p_notificar: true })))
ok(conc.filter(r => r.status === 'success').length === 1 && (await uno(`select count(*)::int c from leads`)).c === cuentaAntes + 1, 'envíos repetidos seguidos: un solo lead y una sola notificación')
await falla(`insert into leads (telefono, dni) values ('51900001234', '40000000')`, 'índice único de DNI')
await falla(`insert into leads (telefono, dni) values ('51900001235', '123')`, 'DNI con formato inválido')

seccion('lead que primero escribió al bot y luego deja sus datos')
const conv = await procesar({ p_telefono: '51911111111', p_dni: '45555555', p_nombre: 'Ana Bot', p_carrera: 'Psicología', p_notificar: true })
const lConv = await uno(`select * from leads where telefono='51911111111'`)
ok(conv.status === 'success' && lConv.id === l1.id && lConv.dni === '45555555' && lConv.estado === 'lead_asignado', 'se completa el mismo lead (no se duplica)')

seccion('modo sombra: asesor fijo, sin notificar')
const gc = await asesor('General C')
const sombra = await procesar({ p_telefono: '51950000000', p_nombre: 'Sombra', p_asesor_id: gc.id, p_notificar: false })
const lS = await uno(`select * from leads where telefono='51950000000'`)
ok(sombra.asesor_nombre === 'General C' && lS.notificacion_estado === 'omitida', 'asigna el asesor que eligió el Apps Script y marca la notificación como omitida')
const sinAsignar = await procesar({ p_telefono: '51950000001', p_nombre: 'Sin asesor', p_asignar: false })
ok(sinAsignar.asesor_id === null && (await uno(`select estado from leads where telefono='51950000001'`)).estado === 'lead_interesado', 'sin asesor fijo en sombra: queda lead_interesado')

seccion('notificaciones')
await q(`select marcar_notificacion($1, false, 'timeout')`, [l0.id])
await q(`select marcar_notificacion($1, true)`, [l0.id])
const lN = await uno(`select * from leads where id=$1`, [l0.id])
ok(lN.notificacion_estado === 'notificado' && lN.notificacion_intentos === 2 && lN.notificacion_error === null, 'intentos y estado de notificación')

seccion('RLS como asesor (General A)')
const ga = await asesor('General A')
const gb = await asesor('General B')
const uid = async email => (await uno(`select id from auth.users where lower(email)=lower($1)`, [email])).id
const comoUsuario = async email => { await db.exec(`reset role`); const u = await uid(email); await db.exec(`set request.jwt.claim.sub = '${u}'`); await db.exec(`set role authenticated`) }
const reset = async () => { await db.exec(`reset role; set request.jwt.claim.sub = ''`) }
const totalA = (await uno(`select count(*)::int c from leads where asesor_id=$1`, [ga.id])).c
const ajeno = (await uno(`select id from leads where asesor_id<>$1 limit 1`, [ga.id])).id

await comoUsuario('a@test.pe')
const visibles = await q(`select asesor_id from leads`)
ok(visibles.length === totalA && visibles.every(v => v.asesor_id === ga.id), `asesor ve solo sus leads (${visibles.length})`)
ok((await q(`select * from asesores`)).length === 1, 'asesor solo ve su propio perfil')
const mio = (await uno(`select id from leads limit 1`)).id
await q(`update leads set estado='lead_contactado' where id=$1`, [mio])
ok((await uno(`select autor_id from lead_interacciones where lead_id=$1 and tipo='cambio_estado' order by id desc limit 1`, [mio])).autor_id === ga.id, 'cambio de estado firmado por el asesor')
ok((await q(`update leads set estado='lead_perdido' where id=$1 returning id`, [ajeno])).length === 0, 'asesor no puede modificar leads ajenos')
await falla(`update leads set asesor_id=null where id='${mio}'`, 'asesor no puede reasignar leads')
await falla(`select set_config('crm.asignacion_sistema','on',false); update leads set asesor_id=null where id='${mio}'`, 'asesor no puede saltarse la regla con set_config')
await db.exec(`reset crm.asignacion_sistema`)
await q(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id) values ($1,'nota_asesor','Llamar el lunes',$2)`, [mio, ga.id])
ok(true, 'asesor agrega nota a su lead')
await falla(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id) values ('${mio}','sistema','x','${ga.id}')`, 'asesor no puede falsificar eventos del sistema')
await falla(`select registrar_lead('51911111112')`, 'panel no puede ejecutar registrar_lead')
await falla(`select procesar_lead('51911111112')`, 'panel no puede ejecutar procesar_lead')
await falla(`select marcar_notificacion('${mio}', true)`, 'panel no puede ejecutar marcar_notificacion')
ok((await uno(`select total_leads from vista_embudo_conversion`)).total_leads === totalA, 'vistas respetan RLS')

seccion('registro manual desde el panel')
const man = (await uno(`select registrar_lead_manual(p_nombre => 'Manual A', p_telefono => '951 000 111', p_dni => '48000000', p_asesor_id => $1, p_observacion => 'Vino a la oficina') r`, [gb.id])).r
ok(man.status === 'success' && man.asesor_id === ga.id, 'asesor registra lead manual: queda para sí mismo aunque pida otro asesor')
const lMan = (await q(`select * from leads where dni='48000000'`))[0]
ok(lMan?.telefono === '51951000111' && lMan?.origen === 'manual' && lMan?.notificacion_estado === 'omitida', 'celular de 9 dígitos -> 51..., fuente manual, sin notificar')
const manDup = (await uno(`select registrar_lead_manual(p_nombre => 'X', p_telefono => '51920000001') r`)).r
ok(manDup.status === 'duplicate' && !manDup.asesor_nombre, 'lead de otro asesor: duplicate sin revelar datos')
await reset()

seccion('RLS como admin')
const totalGlobal = (await uno(`select count(*)::int c from leads`)).c
await comoUsuario('admin@test.pe')
ok((await uno(`select count(*)::int c from leads`)).c === totalGlobal, `admin ve todos los leads (${totalGlobal})`)
await q(`update leads set asesor_id=$2 where id=$1`, [ajeno, gb.id]); ok(true, 'admin puede reasignar leads')
const manAdm = (await uno(`select registrar_lead_manual(p_nombre => 'Manual Admin', p_telefono => '51960000000', p_asesor_id => $1) r`, [gc.id])).r
ok(manAdm.asesor_nombre === 'General C', 'admin registra lead manual con el asesor elegido')
console.table(await q(`select asesor, leads_asignados, leads_sin_contactar, leads_contactados from vista_leads_por_asesor`))
console.table(await q(`select * from vista_embudo_conversion`))

seccion('usuarios del panel (sin correo)')
await reset()
const jud = await asesor('Enfermera')
const nuevoId = (await uno(`select crear_usuario_panel($1, 'Maria.Quispe', '70123456') id`, [jud.id])).id
const u = await uno(`select * from auth.users where id=$1`, [nuevoId])
ok(u.email === 'maria.quispe@crm.local' && u.encrypted_password !== '70123456', 'admin crea usuario: email interno y contraseña cifrada')
ok((await uno(`select extensions.crypt('70123456', $1) = $1 ok`, [u.encrypted_password])).ok, 'la contraseña verifica con bcrypt')
ok((await uno(`select usuario from asesores where id=$1`, [jud.id])).usuario === 'maria.quispe', 'asesor queda vinculado con su usuario')
ok((await q(`select 1 from auth.identities where user_id=$1 and provider='email'`, [nuevoId])).length === 1, 'identidad de Auth creada')
await falla(`select crear_usuario_panel('${jud.id}', 'otro.usuario', '12345678')`, 'no se crea un segundo usuario para el mismo asesor')
await falla(`select crear_usuario_panel('${gc.id}', 'Mal Usuario', '12345678')`, 'usuario con espacios no válido')
await falla(`select crear_usuario_panel('${gc.id}', 'general.c', '123')`, 'contraseña muy corta')
await q(`select restablecer_clave_usuario($1, 'nueva123')`, [jud.id])
ok((await uno(`select extensions.crypt('nueva123', encrypted_password) = encrypted_password ok from auth.users where id=$1`, [nuevoId])).ok, 'admin restablece contraseña')
ok((await uno(`select raw_user_meta_data->>'debe_cambiar_clave' d from auth.users where id=$1`, [nuevoId])).d === 'true', 'al restablecer queda marcado el cambio de contraseña obligatorio')
await falla(`insert into asesores (nombre, rol) values ('Sin tel', 'asesor')`, 'asesor sin teléfono no permitido')
await db.exec(`insert into asesores (nombre, rol) values ('Admin sin tel', 'admin')`); ok(true, 'admin sin teléfono permitido')
await comoUsuario('a@test.pe')
await falla(`select crear_usuario_panel('${gc.id}', 'general.c', '12345678')`, 'un asesor no puede crear usuarios')
await falla(`select restablecer_clave_usuario('${jud.id}', 'hack1234')`, 'un asesor no puede restablecer contraseñas')
await reset()

seccion('resumen del dashboard')
const totalLeads = (await uno(`select count(*)::int c from leads`)).c
const matriculadosReales = (await uno(`select count(*)::int c from leads where estado='lead_matriculado'`)).c
await comoUsuario('admin@test.pe')
const rAdmin = (await uno(`select resumen_dashboard() r`)).r
ok(rAdmin.total === totalLeads, `admin: total del dashboard = total de leads (${rAdmin.total})`)
ok(rAdmin.por_estado.reduce((s, e) => s + e.total, 0) === totalLeads, 'la suma por estado cuadra con el total')
ok(rAdmin.por_carrera.reduce((s, e) => s + e.total, 0) === totalLeads, 'la suma por carrera cuadra con el total')
ok(rAdmin.por_carrera.some((c) => c.carrera === 'CePre'), 'los leads de CePre se agrupan como "CePre"')
ok(rAdmin.matriculados === matriculadosReales, 'matriculados cuadra')
ok(rAdmin.por_periodo.length >= 1 && rAdmin.por_periodo.reduce((s, p) => s + p.total, 0) === totalLeads, 'la serie por día cuadra con el total')
const rFiltro = (await uno(`select resumen_dashboard(p_asesor_id => $1) r`, [ga.id])).r
const rVacio = (await uno(`select resumen_dashboard(p_convocatoria => 'no-existe') r`)).r
ok(rVacio.total === 0 && rVacio.por_estado.length === 0, 'filtro sin resultados devuelve ceros y listas vacías')
const rFuturo = (await uno(`select resumen_dashboard(current_date + 1, current_date + 200) r`)).r
ok(rFuturo.total === 0 && rFuturo.unidad_periodo === 'semana', 'rango largo se agrupa por semana')
await comoUsuario('a@test.pe')
const rAsesor = (await uno(`select resumen_dashboard() r`)).r
ok(rAsesor.total === rFiltro.total && rAsesor.total < totalLeads, `asesor: solo sus números (${rAsesor.total} de ${totalLeads})`)
ok(rAsesor.por_asesor.length === 1 && rAsesor.por_asesor[0].asesor === 'General A', 'asesor: en "por asesor" solo aparece él')
await reset()

seccion('chat de WhatsApp')
await reset()
const leadChat = (await uno(`select id, asesor_id, fecha_asignado from leads where asesor_id = $1 limit 1`, [ga.id]))
ok((await uno(`select sin_responder from leads where id=$1`, [leadChat.id])).sin_responder === false, 'lead asignado sin mensajes: no está "sin responder"')
await q(`insert into lead_interacciones (lead_id, tipo, contenido, created_at) values ($1, 'mensaje_lead', 'Hola, ¿cuánto cuesta la matrícula?', now() + interval '1 minute')`, [leadChat.id])
let lc = await uno(`select * from leads where id=$1`, [leadChat.id])
ok(lc.sin_responder === true && lc.ultimo_mensaje_texto === 'Hola, ¿cuánto cuesta la matrícula?', 'mensaje del lead tras asignarse: queda "sin responder" con vista previa')
await q(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id, estado_envio, created_at) values ($1, 'mensaje_asesor', 'Hola, te escribo por la matrícula', $2, 'error', now() + interval '2 minutes')`, [leadChat.id, ga.id])
ok((await uno(`select sin_responder from leads where id=$1`, [leadChat.id])).sin_responder === true, 'mensaje del asesor que falló no cuenta como respuesta')
await q(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id, estado_envio, created_at) values ($1, 'mensaje_asesor', 'Hola, te escribo por la matrícula', $2, 'enviado', now() + interval '3 minutes')`, [leadChat.id, ga.id])
lc = await uno(`select * from leads where id=$1`, [leadChat.id])
ok(lc.sin_responder === false && lc.ultimo_mensaje_texto === 'Hola, te escribo por la matrícula', 'respuesta enviada: deja de estar "sin responder"')
const sinAsesor = (await uno(`select id from leads where asesor_id is null limit 1`)).id
await q(`select registrar_lead(telefono, 'pregunta al bot') from leads where id=$1`, [sinAsesor])
ok((await uno(`select sin_responder s, ultimo_mensaje_texto t from leads where id=$1`, [sinAsesor])).t === 'pregunta al bot', 'mensajes al bot (sin asesor) se guardan pero no cuentan como "sin responder"')
await comoUsuario('a@test.pe')
await falla(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id, estado_envio) values ('${leadChat.id}', 'mensaje_asesor', 'falso', '${ga.id}', 'enviado')`, 'el asesor no puede insertar "mensajes enviados" directo (solo la función de envío)')
await reset()

seccion('pausa del bot y estado atendido')
const pausa = async (id) => (await uno(`select bot_pausado_hasta p, extract(epoch from bot_pausado_hasta - now())/3600 as horas from leads where id=$1`, [id]))
const lp = (await uno(`select id from leads where estado='lead_asignado' limit 1`)).id
await q(`update leads set estado='lead_contactado' where id=$1`, [lp])
let pz = await pausa(lp)
ok(pz.p && Math.round(pz.horas) === 5, 'pasar a contactado pausa el bot 5 horas')
await q(`update leads set bot_pausado_hasta = now() + interval '1 hour' where id=$1`, [lp])
await q(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id, estado_envio) values ($1, 'mensaje_asesor', 'hola', $2, 'enviado')`, [lp, ga.id])
pz = await pausa(lp)
ok(Math.round(pz.horas) === 5, 'cada mensaje enviado por el asesor renueva la pausa a 5 horas')
await q(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id, estado_envio) values ($1, 'mensaje_asesor', 'x', $2, 'error')`, [lp, ga.id])
ok(Math.round((await pausa(lp)).horas) === 5, 'un mensaje que falló no cambia la pausa')
await q(`update leads set estado='lead_atendido' where id=$1`, [lp])
ok((await pausa(lp)).p === null, 'marcar atendido devuelve el lead al bot')
await q(`update leads set estado='lead_contactado' where id=$1`, [lp])
await q(`update leads set estado='lead_matriculado' where id=$1`, [lp])
ok((await pausa(lp)).p === null, 'marcar matriculado devuelve el lead al bot')
await comoUsuario('admin@test.pe')
await q(`update leads set estado='lead_atendido' where id=$1`, [lp])
const rA = (await uno(`select resumen_dashboard() r`)).r
ok(rA.por_estado.some((e) => e.estado === 'lead_atendido'), 'el dashboard cuenta los leads atendidos')
ok(rA.contactados >= 1, '"atendido" cuenta como contactado o más en el embudo')
await reset()

seccion('el lead vuelve a consultar')
await reset()
const tel = '51977700001'
const p1 = await procesar({ p_telefono: tel, p_dni: '77700001', p_nombre: 'Vuelve', p_carrera: 'Derecho', p_consulta: 'Costos', p_notificar: true })
const reintento = await procesar({ p_telefono: tel, p_dni: '77700001', p_nombre: 'Vuelve', p_carrera: 'Derecho', p_notificar: true })
ok(reintento.status === 'duplicate' && reintento.notificar === false, 'reintento de BuilderBot (< 2 min): se ignora sin avisar')
const atras = async () => q(`update leads set ultimo_registro_at = now() - interval '1 day' where telefono = $1`, [tel])
await atras()
await q(`update leads set estado = 'lead_perdido' where telefono = $1`, [tel])
const r2 = await procesar({ p_telefono: tel, p_nombre: 'Vuelve Otra Vez', p_carrera: 'Psicología', p_consulta: 'Becas', p_convocatoria: '2026-2', p_notificar: true })
let lv = await uno(`select * from leads where telefono = $1`, [tel])
ok(r2.status === 'updated' && r2.notificar === true && r2.asesor_id === p1.asesor_id && !r2.reasignado, 'nueva consulta: mismo asesor y se le avisa')
ok(lv.carrera_interes === 'Psicología' && lv.resumen === 'Becas' && lv.nombre === 'Vuelve Otra Vez' && lv.convocatoria === '2026-2', 'los datos nuevos reemplazan a los anteriores')
ok(lv.estado === 'lead_asignado' && lv.sin_responder === true && lv.reconsultas === 1, 'caso cerrado se reabre como asignado y queda "sin responder"')
ok(lv.ultimo_mensaje_texto.startsWith('Nueva consulta: Becas'), 'la bandeja muestra "Nueva consulta"')
ok((await q(`select 1 from lead_interacciones where lead_id = $1 and contenido like 'Nueva consulta: Becas%'`, [lv.id])).length === 1, 'la consulta queda en el historial')
await atras()
const r3 = await procesar({ p_telefono: tel, p_nombre: 'Vuelve Otra Vez', p_modalidad: 'CePre Virtual', p_programa: 'cepre', p_notificar: true })
ok(r3.reasignado === true && r3.asesor_nombre === 'Judith', 'si cambia a CePre, pasa al asesor de CePre')
await atras()
await q(`update asesores set activo = false where nombre = 'Judith'`)
await q(`update asesores set carreras = '{}' where nombre = 'Inactivo'`)
const r4 = await procesar({ p_telefono: tel, p_carrera: 'Derecho', p_programa: 'pregrado', p_notificar: true })
ok(r4.reasignado === true && r4.asesor_nombre !== 'Judith', `asesor inactivo o cambio de programa: se reasigna por turnos (${r4.asesor_nombre})`)
await q(`update asesores set activo = true where nombre = 'Judith'`)
await atras()
const dueno = (await uno(`select asesor_id from leads where telefono = $1`, [tel])).asesor_id
// Un asesor con cuenta que NO es el dueño del lead (General A o General B)
const otro = (await uno(`select email from asesores where email in ('a@test.pe', 'b@test.pe') and id <> $1 limit 1`, [dueno])).email
await comoUsuario(otro)
const manAjeno = (await uno(`select registrar_lead_manual(p_nombre => 'Robo', p_telefono => '${tel}', p_carrera => 'Medicina') r`)).r
await reset()
const lr = await uno(`select * from leads where telefono = $1`, [tel])
ok(manAjeno.status === 'duplicate' && lr.asesor_id === dueno && lr.carrera_interes === 'Derecho', `registro manual de otro asesor (${otro}): no toma ni modifica el lead`)

seccion('pendientes (tareas)')
await reset()
const gaT = await asesor('General A'); const gbT = await asesor('General B')
const leadA = (await uno(`select id from leads where asesor_id = $1 limit 1`, [gaT.id])).id
const leadB = (await uno(`select id from leads where asesor_id = $1 limit 1`, [gbT.id])).id
await comoUsuario('a@test.pe')
await q(`insert into tareas (lead_id, asesor_id, titulo, vence_at, creada_por) values ($1, $2, 'Llamar el lunes', now() + interval '1 day', $2)`, [leadA, gaT.id])
ok((await q(`select * from tareas`)).length === 1, 'el asesor crea una tarea sobre su lead y la ve')
await falla(`insert into tareas (lead_id, asesor_id, titulo, vence_at, creada_por) values ('${leadB}', '${gaT.id}', 'x', now(), '${gaT.id}')`, 'no puede crear tareas sobre leads ajenos')
await falla(`insert into tareas (lead_id, asesor_id, titulo, vence_at, creada_por) values ('${leadA}', '${gbT.id}', 'x', now(), '${gaT.id}')`, 'no puede asignar tareas a otro asesor')
await comoUsuario('b@test.pe')
ok((await q(`select * from tareas`)).length === 0, 'otro asesor no ve las tareas ajenas')
await comoUsuario('admin@test.pe')
await q(`update leads set asesor_id = $2 where id = $1`, [leadA, gbT.id])
await reset()
ok((await uno(`select asesor_id from tareas where lead_id = $1`, [leadA])).asesor_id === gbT.id, 'al reasignar el lead, la tarea pendiente pasa al nuevo asesor')

seccion('respuestas rápidas')
await comoUsuario('a@test.pe')
ok((await q(`select * from respuestas_rapidas`)).length >= 4, 'el asesor ve las respuestas rápidas iniciales')
await falla(`insert into respuestas_rapidas (titulo, contenido) values ('x', 'y')`, 'el asesor no puede crear respuestas rápidas')
await comoUsuario('admin@test.pe')
await q(`insert into respuestas_rapidas (titulo, contenido) values ('Costos', 'La pensión es...')`)
ok(true, 'el admin crea respuestas rápidas')
await reset()

seccion('motivos de pérdida')
await q(`update leads set estado = 'lead_perdido', motivo_no_interes = 'Otro: se mudó' where id = $1`, [leadB])
await comoUsuario('admin@test.pe')
const rM = (await uno(`select resumen_dashboard() r`)).r
ok(rM.por_motivo.some((m) => m.motivo === 'Otro'), '"Otro: detalle" se agrupa como "Otro" en el dashboard')
await reset()

seccion('anon')
await db.exec(`reset role; set request.jwt.claim.sub = ''; set role anon`)
await falla(`select * from tareas`, 'anon no puede ver tareas')
await falla(`select * from respuestas_rapidas`, 'anon no puede ver respuestas rápidas')
await falla(`select resumen_dashboard()`, 'anon no puede ver el dashboard')
await falla(`select * from leads`, 'anon no puede leer leads')
await falla(`select * from vista_leads_por_estado`, 'anon no puede leer las vistas')
await falla(`select registrar_lead_manual('x','51999999999')`, 'anon no puede registrar leads')

console.log(fallos ? `\n${fallos} PRUEBA(S) FALLARON` : '\nTODAS LAS PRUEBAS PASARON')
process.exit(fallos ? 1 : 0)
