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
    ('Admin',     '51900000000', 'admin@test.pe', 'admin',  '{}',                  false),
    ('General A', '51900000001', 'a@test.pe',     'asesor', '{}',                  true),
    ('General B', '51900000002', 'b@test.pe',     'asesor', '{}',                  true),
    ('General C', '51900000003', 'c@test.pe',     'asesor', '{}',                  true),
    ('Judith',    '51900000099', 'j@test.pe',     'asesor', '{CEPRE}',             true),
    ('Enfermera', '51900000050', 'e@test.pe',     'asesor', '{Enfermería}',        true),
    ('Inactivo',  '51900000077', 'x@test.pe',     'asesor', '{}',                  false);
  update asesores set superadmin = true where rol = 'admin';
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

seccion('tiempo de primera respuesta')
await reset()
const pr = await procesar({ p_telefono: '51966600001', p_nombre: 'Primer contacto', p_carrera: 'Derecho' })
await q(`update leads set fecha_asignado = now() - interval '90 minutes' where id = $1`, [pr.lead_id])
await q(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id, estado_envio) values ($1, 'mensaje_asesor', 'hola', $2, 'enviado')`, [pr.lead_id, pr.asesor_id])
const lpr = await uno(`select primer_contacto_asesor_at p, extract(epoch from primer_contacto_asesor_at - fecha_asignado)/60 m from leads where id = $1`, [pr.lead_id])
ok(lpr.p && Math.round(lpr.m) === 90, 'el primer mensaje del asesor registra el primer contacto (90 min después de asignado)')
await q(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id, estado_envio, created_at) values ($1, 'mensaje_asesor', 'otro', $2, 'enviado', now() + interval '1 hour')`, [pr.lead_id, pr.asesor_id])
ok(Math.round((await uno(`select extract(epoch from primer_contacto_asesor_at - fecha_asignado)/60 m from leads where id = $1`, [pr.lead_id])).m) === 90, 'los mensajes siguientes no cambian el primer contacto')
const pr2 = await procesar({ p_telefono: '51966600002', p_nombre: 'Por teléfono', p_carrera: 'Derecho' })
await q(`update leads set estado = 'lead_contactado' where id = $1`, [pr2.lead_id])
ok((await uno(`select primer_contacto_asesor_at p from leads where id = $1`, [pr2.lead_id])).p !== null, 'pasar a contactado (llamada) también cuenta como primer contacto')
await comoUsuario('admin@test.pe')
const rPR = (await uno(`select resumen_dashboard() r`)).r
ok(typeof Number(rPR.primera_respuesta_min) === 'number' && rPR.con_primer_contacto >= 2 && rPR.por_asesor.some((a) => a.primera_respuesta_min !== null), 'el dashboard calcula la mediana total y por asesor')
await reset()

seccion('mensajes sin duplicar (webhook + bloque /registrar)')
await reset()
await q(`select registrar_lead('51955500001', 'hola, ¿costos?')`)
await q(`select registrar_lead('51955500001', 'hola, ¿costos?')`)
await q(`select registrar_lead('51955500001', 'otro mensaje')`)
const dupMsg = await uno(`select count(*)::int n, (select total_mensajes from leads where telefono='51955500001') t from lead_interacciones i join leads l on l.id = i.lead_id where l.telefono='51955500001' and i.tipo='mensaje_lead'`)
ok(dupMsg.n === 2 && dupMsg.t === 2, 'el mismo texto en menos de 1 minuto se guarda una sola vez')

seccion('reasignación automática y origen del lead')
await reset()
const ra = await procesar({ p_telefono: '51944400001', p_nombre: 'Sin contactar', p_carrera: 'Derecho' })
const rb = await procesar({ p_telefono: '51944400002', p_nombre: 'Contactado a tiempo', p_carrera: 'Derecho' })
await q(`update leads set fecha_asignado = now() - interval '5 hours' where id in ($1, $2)`, [ra.lead_id, rb.lead_id])
await q(`insert into lead_interacciones (lead_id, tipo, contenido, autor_id, estado_envio) values ($1, 'mensaje_asesor', 'hola', $2, 'enviado')`, [rb.lead_id, rb.asesor_id])
const cambios = (await uno(`select reasignar_sin_contacto(4, 2, false) r`)).r
const lra = await uno(`select asesor_id, reasignaciones, fecha_asignado > now() - interval '1 minute' reciente from leads where id = $1`, [ra.lead_id])
ok(cambios.some((c) => c.lead_id === ra.lead_id) && lra.asesor_id !== ra.asesor_id && lra.reasignaciones === 1 && lra.reciente, 'lead sin contactar en 4 h pasa a otro asesor (y reinicia su tiempo)')
ok(!cambios.some((c) => c.lead_id === rb.lead_id), 'lead ya contactado no se reasigna')
ok((await q(`select 1 from lead_interacciones where lead_id = $1 and contenido like 'Reasignado automáticamente%'`, [ra.lead_id])).length === 1, 'la reasignación queda en el historial')
await q(`update leads set fecha_asignado = now() - interval '5 hours' where id = $1`, [ra.lead_id])
await uno(`select reasignar_sin_contacto(4, 2, false) r`)
await q(`update leads set fecha_asignado = now() - interval '5 hours' where id = $1`, [ra.lead_id])
const tercera = (await uno(`select reasignar_sin_contacto(4, 2, false) r`)).r
ok(!tercera.some((c) => c.lead_id === ra.lead_id) && (await uno(`select reasignaciones from leads where id = $1`, [ra.lead_id])).reasignaciones === 2, 'como máximo 2 reasignaciones por lead')
await q(`update leads set origen_campana = 'TikTok' where id = $1`, [rb.lead_id])
await comoUsuario('admin@test.pe')
const rO = (await uno(`select resumen_dashboard() r`)).r
ok(rO.por_origen.some((o) => o.origen === 'TikTok') && rO.reasignados >= 1, 'el dashboard muestra leads por origen y reasignados')

seccion('campañas')
await q(`insert into campanas (nombre, origen, inicio, fin) values ('TikTok hoy', 'TikTok', current_date - 1, current_date + 1), ('Todo hoy', null, current_date - 1, current_date + 1), ('Pasada', null, '2020-01-01', '2020-01-31')`)
const rc = (await uno(`select resumen_campanas() r`)).r
const porNombre = Object.fromEntries(rc.map((c) => [c.nombre, c]))
ok(porNombre['TikTok hoy'].total === 1, 'campaña con origen cuenta solo leads de ese origen')
ok(porNombre['Todo hoy'].total >= 2 && porNombre['Pasada'].total === 0, 'campaña sin origen cuenta por fechas')
await falla(`insert into campanas (nombre, inicio, fin) values ('Al revés', '2026-02-01', '2026-01-01')`, 'fin no puede ser antes del inicio')
await comoUsuario('a@test.pe')
await falla(`insert into campanas (nombre, inicio, fin) values ('Asesor', current_date, current_date)`, 'un asesor no crea campañas')
ok((await q(`select * from campanas`)).length === 3, 'el asesor ve las campañas')
await reset()

seccion('aviso al asignar desde el panel')
// En PGlite no hay pg_net: se reemplaza llamar_genesys por una versión que anota las llamadas
await db.exec(`
  create table llamadas_genesys (accion text, cuerpo jsonb);
  create or replace function public.llamar_genesys(p_accion text, p_cuerpo jsonb default '{}'::jsonb)
  returns void language sql security definer set search_path = '' as
  $f$ insert into public.llamadas_genesys values (p_accion, p_cuerpo) $f$;
`)
const llamadas = async () => (await q(`select accion, cuerpo from llamadas_genesys`))
const otroAsesor = (await uno(`select id from asesores where rol = 'asesor' and activo and id <> $1 limit 1`, [ga.id])).id
const [aa1, aa2, aa3] = (await q(`select id from leads where asesor_id = $1 order by id limit 3`, [ga.id])).map((r) => r.id)
await comoUsuario('admin@test.pe')
await q(`update leads set asesor_id = $1 where id = $2`, [otroAsesor, aa1])
let ll = await llamadas()
ok(ll.length === 1 && ll[0].accion === 'notificar' && ll[0].cuerpo.lead_ids.length === 1 && ll[0].cuerpo.lead_ids[0] === aa1 && !!ll[0].cuerpo.asignado_por,
  'el admin reasigna desde el panel -> se avisa al asesor nuevo')
await q(`update leads set asesor_id = $1 where id in ($2, $3)`, [otroAsesor, aa2, aa3])
ll = await llamadas()
ok(ll.length === 2 && ll[1].cuerpo.lead_ids.length === 2, 'asignación masiva -> una sola llamada con todos los leads')
await q(`update leads set resumen = 'otra consulta' where id = $1`, [aa1])
await q(`update leads set asesor_id = $1 where id = $2`, [otroAsesor, aa1])
ok((await llamadas()).length === 2, 'sin cambio de asesor no se avisa')
await comoUsuario('a@test.pe')
await uno(`select registrar_lead_manual('Lead propio', '51955500001') r`)
ok((await llamadas()).length === 3, 'el asesor que registra un lead para sí mismo también recibe el aviso')
await comoUsuario('admin@test.pe')
await uno(`select registrar_lead_manual(p_nombre => 'Lead para otro', p_telefono => '51955500002', p_asesor_id => $1) r`, [otroAsesor])
ll = await llamadas()
ok(ll.length === 4 && ll[3].cuerpo.lead_ids.length === 1, 'el admin registra un lead para otro asesor -> se avisa')
await reset()
await q(`update leads set asesor_id = $1 where id = $2`, [ga.id, aa1])
ok((await llamadas()).length === 4, 'los cambios del bot o del cron (sin usuario del panel) no disparan este aviso (los avisan ellos)')

seccion('papelera')
await q(`select registrar_lead('51966600001', 'soy de prueba')`)
const prueba = (await uno(`select id, asesor_id from leads where telefono = '51966600001'`)).id
await comoUsuario('admin@test.pe')
ok((await uno(`select eliminar_leads(array[$1]::uuid[]) n`, [prueba])).n === 1, 'el admin envía un lead a la papelera')
ok((await q(`select 1 from leads where id = $1`, [prueba])).length === 0, 'el lead eliminado ya no se ve en el panel')
ok((await q(`select 1 from lead_interacciones where lead_id = $1`, [prueba])).length === 0, 'su conversación tampoco se ve')
const pap = (await uno(`select papelera() r`)).r
ok(pap.leads.some((l) => l.id === prueba && l.eliminado_por === 'Admin'), 'la papelera lo muestra con quién lo eliminó')
await reset()
await q(`select registrar_lead('51966600001', 'volví a escribir')`)
ok((await uno(`select eliminado_at is not null e from leads where id = $1`, [prueba])).e, 'si vuelve a escribir sigue en la papelera')
await comoUsuario('admin@test.pe')
ok((await uno(`select papelera() r`)).r.leads.find((l) => l.id === prueba).escribio_despues, 'la papelera avisa que escribió después')
ok((await uno(`select restaurar_leads(array[$1]::uuid[]) n`, [prueba])).n === 1 && (await q(`select 1 from leads where id = $1`, [prueba])).length === 1, 'restaurar lo devuelve al panel')
await uno(`select eliminar_leads(array[$1]::uuid[]) n`, [prueba])
await uno(`select registrar_lead_manual('Prueba registrada', '966600001') r`)
ok((await q(`select 1 from leads where id = $1`, [prueba])).length === 1, 'registrarlo a mano de nuevo lo saca de la papelera')
ok((await uno(`select borrar_leads_definitivo(array[$1]::uuid[]) n`, [prueba])).n === 0, 'no se borra para siempre un lead que no está en la papelera')
await uno(`select eliminar_leads(array[$1]::uuid[]) n`, [prueba])
ok((await uno(`select borrar_leads_definitivo(array[$1]::uuid[]) n`, [prueba])).n === 1, 'borrar para siempre desde la papelera')
await reset()
ok((await q(`select 1 from leads where id = $1`, [prueba])).length === 0 && (await q(`select 1 from lead_interacciones where lead_id = $1`, [prueba])).length === 0, 'el lead y su conversación desaparecen de la base')
await comoUsuario('a@test.pe')
await falla(`select eliminar_leads(array[gen_random_uuid()])`, 'un asesor no puede usar la papelera')
await falla(`select papelera()`, 'un asesor no puede ver la papelera')
// Usuarios
await comoUsuario('admin@test.pe')
await falla(`select eliminar_asesor('${ga.id}')`, 'no se elimina un asesor con leads abiertos')
const otroP = (await uno(`select id from asesores where rol = 'asesor' and activo and id <> $1 and eliminado_at is null limit 1`, [ga.id])).id
await q(`update leads set asesor_id = $1 where asesor_id = $2`, [otroP, ga.id])
await uno(`select eliminar_asesor('${ga.id}') r`)
ok((await uno(`select papelera() r`)).r.asesores.some((a) => a.id === ga.id), 'asesor sin leads abiertos va a la papelera')
await falla(`select eliminar_asesor((select mi_asesor_id()))`, 'el admin no puede eliminarse a sí mismo')
await comoUsuario('a@test.pe')
ok((await uno(`select mi_asesor_id() id`)).id === null && (await q(`select 1 from leads`)).length === 0, 'un usuario en la papelera no puede usar el panel')
await comoUsuario('admin@test.pe')
await uno(`select restaurar_asesor('${ga.id}') r`)
const gaRest = await uno(`select eliminado_at, activo from asesores where id = $1`, [ga.id])
ok(gaRest.eliminado_at === null && gaRest.activo === false, 'restaurar un usuario lo deja inactivo (no recibe leads hasta activarlo)')
await q(`insert into asesores (nombre, telefono, rol) values ('Usuario prueba', '51900077711', 'asesor')`)
const up = (await uno(`select id from asesores where nombre = 'Usuario prueba'`)).id
await falla(`select borrar_asesor_definitivo('${up}')`, 'borrar para siempre exige pasar antes por la papelera')
await uno(`select eliminar_asesor('${up}') r`)
await uno(`select borrar_asesor_definitivo('${up}') r`)
ok((await q(`select 1 from asesores where id = $1`, [up])).length === 0, 'usuario borrado para siempre')
await q(`update asesores set activo = true where id = $1`, [ga.id])
await reset()

seccion('super admin y módulos')
{
const usrB = await asesor('General B')
const adminRow = await asesor('Admin')
const permisosDe = async (lista) => {
  await comoUsuario('admin@test.pe')
  await uno(`select guardar_permisos($1, $2::text[]) r`, [usrB.id, lista])
  await comoUsuario('b@test.pe')
}
await permisosDe(['leads'])
const propiosB = (await q(`select asesor_id from leads`))
ok(propiosB.every((l) => l.asesor_id === usrB.id), 'sin "ver_todos" el usuario solo ve sus leads')
await permisosDe(['leads', 'ver_todos'])
await reset()
const totalLeads = (await uno(`select count(*)::int c from leads where eliminado_at is null`)).c
await comoUsuario('b@test.pe')
ok((await q(`select 1 from leads`)).length === totalLeads, 'con "ver_todos" ve los leads de todo el equipo')
await falla(`select guardar_permisos('${usrB.id}', '{usuarios}')`, 'solo el super admin asigna permisos')
ok((await q(`update asesores set permisos = '{usuarios}' where id = $1 returning id`, [usrB.id])).length === 0, 'sin "usuarios" no puede editarse los permisos')
await falla(`select registrar_lead_manual('Sin permiso', '51977700001')`, 'sin "registrar" no registra leads')
await falla(`select papelera()`, 'sin "papelera" no ve la papelera')
await permisosDe(['leads', 'registrar', 'papelera', 'usuarios', 'asignar', 'ver_todos'])
await falla(`update asesores set permisos = '{usuarios,respuestas}' where id = '${usrB.id}'`, 'con "usuarios" tampoco se da permisos a sí mismo')
await falla(`update asesores set superadmin = true where id = '${usrB.id}'`, 'ni se hace super admin')
ok((await uno(`select registrar_lead_manual('Con permiso', '51977700002') r`)).r.status === 'success', 'con "registrar" sí registra')
ok(!!(await uno(`select papelera() r`)).r, 'con "papelera" ve la papelera')
const usrC = await asesor('General C')
ok((await q(`update asesores set telefono = '51900000033' where id = $1 returning id`, [usrC.id])).length === 1, 'con "usuarios" edita a un asesor')
ok((await q(`update asesores set telefono = '51900000010' where id = $1 returning id`, [adminRow.id])).length === 0, 'pero no puede tocar al super admin')
await falla(`select restablecer_clave_usuario('${adminRow.id}', 'otra-clave', false)`, 'ni cambiarle la contraseña al super admin')
const leadDeC = (await uno(`select id from leads where asesor_id = $1 and eliminado_at is null limit 1`, [usrC.id])).id
ok((await q(`update leads set asesor_id = $1 where id = $2 returning id`, [usrB.id, leadDeC])).length === 1, 'con "asignar" reasigna leads')
await comoUsuario('admin@test.pe')
await falla(`select guardar_permisos('${adminRow.id}', '{}', false)`, 'debe quedar al menos un super admin')
await uno(`select guardar_permisos($1, '{pendientes,chats,leads,kanban,registrar,dashboard,campanas,exportar}'::text[]) r`, [usrB.id])
await falla(`select guardar_permisos('${usrB.id}', '{inventado}')`, 'solo se aceptan módulos conocidos')
await reset()

}

seccion('base de conocimiento y revisión del bot')
{
  ok((await uno(`select count(*)::int c from conocimiento where categoria = 'reglas' and activo`)).c >= 4, 'trae las reglas recomendadas para Genesys')
  ok((await uno(`select count(*)::int c from conocimiento where not activo`)).c >= 4, 'las secciones por completar no entran al texto del bot')
  await q(`select registrar_lead('51988800001', 'cuánto cuesta la pensión de enfermería')`)
  const lid = (await uno(`select id from leads where telefono = '51988800001'`)).id
  await q(`insert into lead_interacciones (lead_id, tipo, contenido) values ($1, 'respuesta_bot', 'Lamentablemente, no tengo información sobre la pensión'), ($1, 'respuesta_bot', 'La carrera de Enfermería dura 5 años')`, [lid])
  await comoUsuario('a@test.pe')
  await falla(`select * from preguntas_sin_respuesta()`, 'sin el módulo "conocimiento" no ve la revisión del bot')
  ok((await q(`select 1 from conocimiento`)).length > 0, 'todos los usuarios del panel leen la base de conocimiento')
  await falla(`insert into conocimiento (categoria, titulo, contenido) values ('otros', 'x', 'y')`, 'sin el módulo no la edita')
  await comoUsuario('admin@test.pe')
  const ps = await q(`select * from preguntas_sin_respuesta()`)
  const p1 = ps.find((p) => p.lead_id === lid)
  ok(!!p1 && p1.pregunta.includes('pensión') && ps.filter((p) => p.lead_id === lid).length === 1, 'detecta "no tengo información" con la pregunta del lead (y no las respuestas normales)')
  await q(`insert into revision_bot (interaccion_id) values ($1)`, [p1.interaccion_id])
  ok((await q(`select revisada from preguntas_sin_respuesta() where interaccion_id = $1`, [p1.interaccion_id]))[0].revisada, 'se puede marcar como revisada')
  await q(`insert into conocimiento (categoria, titulo, contenido) values ('costos', 'Pensión Enfermería', 'S/ 000 (prueba)')`)
  ok((await uno(`select updated_por is not null p from conocimiento where titulo = 'Pensión Enfermería'`)).p, 'guarda quién actualizó cada dato')
  await reset()
}

seccion('proformas')
{
  const gaP = await asesor('General A')
  ok((await uno(`select 'costos' = any (permisos) c from asesores where id = $1`, [gaP.id])).c, 'los asesores reciben el módulo Proformas')
  const lid = null
  const idB = (await asesor('General B')).id
  await comoUsuario('a@test.pe')
  const pf = await uno(`insert into proformas (numero, lead_id, carrera, campus, modalidad, beneficio, pago, total, inicial, cuota, cuotas)
    values ('PF-JUL-1', $1, 'Enfermería', 'JUL', 'PRES', 'PROMO', 'cuotas', 4590, 1597.5, 997.5, 4) returning id, asesor_id`, [lid])
  ok(pf.asesor_id === gaP.id, 'la proforma queda a nombre de quien la genera')
  ok((await q(`select 1 from proformas where id = $1`, [pf.id])).length === 1, 'el asesor ve sus proformas')
  await falla(`insert into proformas (numero, carrera, campus, modalidad, beneficio, pago, total, inicial, cuota, cuotas, asesor_id)
    values ('x', 'x', 'JUL', 'PRES', 'PROMO', 'cuotas', 1, 1, 1, 1, '${idB}')`, 'no puede generar proformas a nombre de otro')
  await comoUsuario('b@test.pe')
  ok((await q(`select 1 from proformas where id = $1`, [pf.id])).length === 0, 'otro asesor no ve proformas ajenas')
  await reset()
}

seccion('actividades con QR')
{
  const resp = await asesor('General C')
  await comoUsuario('admin@test.pe')
  const act = await uno(`insert into actividades (nombre, tipo, lugar, responsable_id) values ('Feria Juliaca 2026', 'feria', 'Plaza de Armas', $1) returning id, codigo`, [resp.id])
  ok(/^[0-9a-f]{8}$/.test(act.codigo), 'la actividad recibe un código para el QR')
  await reset()
  await db.exec(`set request.jwt.claim.sub = ''; set role anon`)
  ok((await uno(`select actividad_publica($1) r`, [act.codigo])).r.nombre === 'Feria Juliaca 2026', 'el formulario público ve el nombre de la actividad')
  const r1 = (await uno(`select registrar_lead_actividad($1, 'Rosa Mamani Quispe', '955 111 222', '71234567', 'IES San Martín', '5to de secundaria', 'Enfermería') r`, [act.codigo])).r
  ok(r1.ok, 'un alumno se registra desde el celular sin iniciar sesión')
  await falla(`select registrar_lead_actividad('${act.codigo}', 'Juan Pérez', '123', '71234599', null, null, null)`, 'valida el celular')
  ok((await uno(`select registrar_lead_actividad('${act.codigo}', 'Juan Pérez Sin Dni', '955111299', null, null, null, null) r`)).r.ok, 'el DNI es opcional (se identifica por el celular)')
  await uno(`select registrar_lead_actividad('${act.codigo}', 'Juan Pérez Sin Dni', '955111299', null, null, null, 'Derecho') r`)
  await falla(`select registrar_lead_actividad('${act.codigo}', 'Juan Pérez', '955111298', '123', null, null, null)`, 'si pone DNI, debe tener 8 dígitos')
  await falla(`select registrar_lead_actividad('noexiste', 'Juan Pérez', '955111223', null, null, null, null)`, 'código inválido no registra')
  await reset()
  ok((await uno(`select count(*)::int c from leads where telefono = '51955111299'`)).c === 1, 'sin DNI, registrarse dos veces con el mismo celular no duplica')
  const lr = await uno(`select l.*, (select count(*)::int from leads where telefono = '51955111222') n from leads l where telefono = '51955111222'`)
  ok(lr.origen === 'actividad' && lr.actividad_id === act.id && lr.colegio === 'IES San Martín' && lr.grado === '5to de secundaria', 'el lead guarda actividad, colegio y grado')
  ok(lr.asesor_id === resp.id && lr.estado === 'lead_asignado', 'se asigna al responsable de la actividad')
  ok(lr.origen_campana === 'Feria / colegio' && lr.carrera_interes === 'Enfermería', 'queda con origen "Feria / colegio" y su carrera')
  const ll = (await q(`select cuerpo from llamadas_genesys where accion = 'notificar' order by ctid desc limit 1`))[0]
  ok(ll && !ll.cuerpo.bienvenida && ll.cuerpo.asignado_por === 'QR: Feria Juliaca 2026', 'avisa al asesor y no le escribe al alumno (él inicia el chat)')
  await db.exec(`set request.jwt.claim.sub = ''; set role anon`)
  await uno(`select registrar_lead_actividad($1, 'Rosa Mamani Quispe', '955111222', '71234567', null, null, 'CEPRE') r`, [act.codigo])
  await reset()
  ok((await uno(`select count(*)::int c, max(programa) p from leads where telefono = '51955111222'`)).c === 1, 'si se registra dos veces no se duplica')
  // Quien estaba en la papelera y se registra con el QR vuelve al panel
  await q(`update leads set eliminado_at = now() where telefono = '51955111222'`)
  await db.exec(`set request.jwt.claim.sub = ''; set role anon`)
  await uno(`select registrar_lead_actividad($1, 'Rosa Mamani Quispe', '955111222', '71234567', null, null, null) r`, [act.codigo])
  await reset()
  const rest = await uno(`select eliminado_at, (select count(*)::int from lead_interacciones i where i.lead_id = l.id and i.contenido like 'Restaurado de la papelera%') n from leads l where telefono = '51955111222'`)
  ok(rest.eliminado_at === null && rest.n === 1, 'si estaba en la papelera, registrarse con el QR lo devuelve al panel')
  // Escribe por WhatsApp desde otro celular con su DNI (mensaje que arma el formulario): no se duplica
  await q(`select registrar_lead('51966600999', 'Hola, soy Rosa (DNI 71234567). Me registré en Feria Juliaca 2026 y quiero información del CEPRE')`)
  const unido = await uno(`select (select count(*)::int from leads where dni = '71234567') n, (select telefono from leads where dni = '71234567') tel, (select count(*)::int from leads where telefono = '51966600999') nuevos`)
  ok(unido.n === 1 && unido.tel === '51966600999' && unido.nuevos === 1, 'si escribe desde otro celular con su DNI, se une a su lead (sin duplicar)')
  // WhatsApp oculta el número (@lid): la referencia del mensaje lo une a su registro sin tocar su celular
  await db.exec(`set request.jwt.claim.sub = ''; set role anon`)
  const conRef = (await uno(`select registrar_lead_actividad($1, 'Luis Condori Apaza', '955111333', null, null, null, 'Psicología') r`, [act.codigo])).r
  await reset()
  ok(/^[0-9a-f]{6}$/.test(conRef.ref ?? ''), 'el registro por QR devuelve la referencia para el mensaje')
  await q(`select registrar_lead('103027675517051', $1, true)`, [`Hola, soy Luis. Me registré en Feria Juliaca 2026 y quiero información de Psicología. (Ref. ${conRef.ref})`])
  await q(`select registrar_lead('103027675517051', 'y cuánto cuesta?', true)`)
  const lid = await uno(`select l.telefono, (select count(*)::int from leads where telefono = '103027675517051') sueltos,
    (select count(*)::int from lead_interacciones i where i.lead_id = l.id and i.tipo = 'mensaje_lead') msjs,
    (select lead_de_contacto('103027675517051')) = l.id por_alias
    from leads l where nombre = 'Luis Condori Apaza'`)
  ok(lid.telefono === '51955111333' && lid.sueltos === 0 && lid.msjs === 2 && lid.por_alias, 'un LID con la referencia se une al lead del QR (conserva su celular, guarda el chat)')
  // Ya había un lead sin datos de ese LID: se fusiona con el registrado al llegar la referencia
  await db.exec(`set request.jwt.claim.sub = ''; set role anon`)
  const otraRef = (await uno(`select registrar_lead_actividad($1, 'Ana Ticona Mamani', '955111444', null, null, null, null) r`, [act.codigo])).r
  await reset()
  await q(`select registrar_lead('64085240614950', 'hola', true)`)
  await q(`select registrar_lead('64085240614950', $1, true)`, [`Hola, soy Ana. Me registré en Feria Juliaca 2026. (Ref. ${otraRef.ref})`])
  const fus = await uno(`select (select count(*)::int from leads where telefono = '64085240614950') sueltos,
    (select count(*)::int from lead_interacciones i join leads l on l.id = i.lead_id where l.nombre = 'Ana Ticona Mamani' and i.tipo = 'mensaje_lead') msjs`)
  ok(fus.sueltos === 0 && fus.msjs === 2, 'el lead sin datos de un LID se fusiona con su registro del QR')
  await q(`update actividades set activa = false where id = $1`, [act.id])
  await db.exec(`set request.jwt.claim.sub = ''; set role anon`)
  await falla(`select registrar_lead_actividad('${act.codigo}', 'Otra Persona', '955111299', null, null, null, null)`, 'una actividad cerrada ya no recibe registros')
  await falla(`select * from actividades`, 'anon no puede listar actividades')
  await reset()
  await comoUsuario('a@test.pe')
  ok((await q(`update actividades set nombre = 'x' where id = $1 returning id`, [act.id])).length === 0, 'un asesor no edita actividades ajenas')
  ok((await q(`select * from resumen_actividades() where actividad_id = $1`, [act.id]))[0].registrados === 4, 'resumen de registrados por actividad')
  await reset()
}

seccion('importar varios alumnos')
{
  await comoUsuario('admin@test.pe')
  const llamadasAntes = (await uno(`select count(*)::int c from llamadas_genesys`)).c
  const filas = Array.from({ length: 9 }, (_, i) => ({ nombre: `Importado Número ${i + 1}`, celular: `95870000${i + 1}`, colegio: 'IE Importación' }))
  filas.push({ nombre: 'Sin Celular', celular: '12' }, { nombre: '', celular: '958700099' }, { nombre: 'Con Dni Malo', celular: '958700098', dni: '12' })
  const res = await q(`select * from importar_leads($1::jsonb)`, [JSON.stringify(filas)])
  ok(res.filter((r) => r.estado === 'nuevo').length === 9, 'importa 9 alumnos nuevos')
  ok(res.filter((r) => r.estado === 'error').length === 3, 'marca como error las filas sin nombre, con celular o DNI no válidos (y sigue con el resto)')
  await reset()
  const reparto = await q(`select asesor_id, count(*)::int n from leads where telefono like '5195870000%' group by asesor_id`)
  const ns = reparto.map((r) => r.n)
  ok(reparto.length >= 3 && Math.max(...ns) - Math.min(...ns) <= 1, `se reparten por igual entre los asesores (${ns.join(' / ')})`)
  ok((await uno(`select count(*)::int c from leads where telefono like '5195870000%' and colegio = 'IE Importación'`)).c === 9, 'guarda el colegio de cada alumno')
  const nuevasLlamadas = await q(`select cuerpo from llamadas_genesys offset $1`, [llamadasAntes])
  ok(nuevasLlamadas.length === 1 && nuevasLlamadas[0].cuerpo.lead_ids.length === 9, 'un solo aviso al final con todos los leads (no uno por fila)')
  await comoUsuario('admin@test.pe')
  const otraVez = await q(`select * from importar_leads($1::jsonb)`, [JSON.stringify(filas.slice(0, 3))])
  ok(otraVez.every((r) => r.estado === 'actualizado'), 'si se importan de nuevo, se actualizan (sin duplicar)')
  await reset()
  ok((await uno(`select count(*)::int c from leads where telefono like '5195870000%'`)).c === 9, 'siguen siendo 9 leads')
  const usrB = await asesor('General B')
  const ajeno = (await uno(`select telefono from leads where telefono like '5195870000%' and asesor_id <> $1 limit 1`, [usrB.id])).telefono
  await q(`update asesores set permisos = array_append(permisos, 'registrar') where id = $1 and not ('registrar' = any(permisos))`, [usrB.id])
  await comoUsuario('b@test.pe')
  const deB = await q(`select * from importar_leads($1::jsonb)`, [JSON.stringify([{ nombre: 'Alumno De Bruno', celular: '958711111' }, { nombre: 'Ya Es De Otro', celular: ajeno.slice(2) }])])
  ok(deB[0].estado === 'nuevo' && deB[1].estado === 'omitido', 'un asesor importa para sí mismo y no toma leads de otros asesores')
  await reset()
  ok((await uno(`select asesor_id from leads where telefono = '51958711111'`)).asesor_id === usrB.id, 'lo importado por un asesor queda a su nombre')
}

seccion('registro rápido de fichas')
{
  await comoUsuario('admin@test.pe')
  const antes = (await uno(`select count(*)::int c from llamadas_genesys`)).c
  for (let i = 1; i <= 4; i++) {
    const r = await uno(`select * from importar_leads($1::jsonb, null, null, null, true)`, [JSON.stringify([{ nombre: `Ficha Papel ${i}`, celular: `95990000${i}` }])])
    if (i === 1) ok(r.estado === 'nuevo', 'registra una ficha sin DNI (no es obligatorio)')
  }
  ok((await uno(`select count(*)::int c from llamadas_genesys`)).c === antes, 'con aviso diferido no se avisa ficha por ficha')
  const ex = (await uno(`select lead_existente('959900001', null) r`)).r
  ok(ex && ex.por === 'celular' && ex.nombre === 'Ficha Papel 1', 'avisa al instante si el celular ya existe')
  ok((await uno(`select lead_existente('959999999', null) r`)).r === null, 'un celular nuevo no aparece como existente')
  await reset()
  ok((await uno(`select count(*)::int c from avisos_pendientes`)).c === 4, 'los avisos quedan juntados')
  await q(`update avisos_pendientes set created_at = now() - interval '5 minutes'`)
  ok((await uno(`select enviar_avisos_pendientes() n`)).n === 4, 'el resumen sale después de unos minutos')
  const env = await q(`select cuerpo from llamadas_genesys offset $1`, [antes])
  ok(env.length === 1 && env[0].cuerpo.lead_ids.length === 4, 'un solo aviso con las 4 fichas')
  ok((await uno(`select count(*)::int c from avisos_pendientes`)).c === 0, 'la cola queda vacía')
}

seccion('repartir leads y eliminar actividades')
{
  const usrB = await asesor('General B')
  await comoUsuario('b@test.pe')
  const sinModulo = (await uno(`select * from importar_leads($1::jsonb, null, null, null, false, true)`, [JSON.stringify([{ nombre: 'Reparto Sin Modulo', celular: '957100001' }])]))
  await reset()
  ok((await uno(`select asesor_id from leads where telefono = '51957100001'`)).asesor_id === usrB.id && sinModulo.estado === 'nuevo', 'sin el módulo "repartir", el asesor registra a su nombre aunque pida repartir')
  await q(`update asesores set permisos = array_append(permisos, 'repartir') where id = $1`, [usrB.id])
  await comoUsuario('b@test.pe')
  await q(`select * from importar_leads($1::jsonb, null, null, null, false, true)`, [JSON.stringify([1, 2, 3, 4].map((n) => ({ nombre: `Reparto Con Modulo ${n}`, celular: `95710010${n}` })))])
  await reset()
  const asesoresReparto = await q(`select distinct asesor_id from leads where telefono like '5195710010%'`)
  ok(asesoresReparto.length >= 2, 'con el módulo "repartir", se reparten entre varios asesores')
  await comoUsuario('b@test.pe')
  await q(`select * from importar_leads($1::jsonb)`, [JSON.stringify([{ nombre: 'Por Defecto Mio', celular: '957100099' }])])
  await reset()
  ok((await uno(`select asesor_id from leads where telefono = '51957100099'`)).asesor_id === usrB.id, 'por defecto, a nombre de quien registra')
  // El lead que subió el asesor es suyo: la reasignación automática (4 h sin contacto) no se lo quita
  await q(`update leads set fecha_asignado = now() - interval '6 hours', primer_contacto_asesor_at = null, estado = 'lead_asignado', reasignaciones = 0
           where telefono in ('51957100099', '51957100101', '51957100102', '51957100103', '51957100104')`)
  await uno(`select reasignar_sin_contacto(4, 2, false) r`)
  const propio = await uno(`select asesor_id, registrado_por from leads where telefono = '51957100099'`)
  ok(propio.asesor_id === usrB.id && propio.registrado_por === usrB.id, 'el lead que subió el asesor para sí no se reasigna')
  const repartidos = await q(`select asesor_id, registrado_por, reasignaciones from leads where telefono like '5195710010%' and asesor_id <> registrado_por`)
  ok(repartidos.length > 0 && repartidos.every((r) => r.reasignaciones === 1), 'los que repartió a otros asesores siguen la regla normal (se reasignan)')
  // Tampoco cambia de dueño si vuelve a llegar por otro camino
  const usrA = await asesor('General A')
  const actA = await uno(`insert into actividades (nombre, asignacion, responsable_id) values ('Feria de General A', 'responsable', $1) returning id, codigo`, [usrA.id])
  await db.exec(`set request.jwt.claim.sub = ''; set role anon`)
  await uno(`select registrar_lead_actividad($1, 'Por Defecto Mio', '957100099', null, null, null, null) r`, [actA.codigo])
  await reset()
  ok((await uno(`select asesor_id from leads where telefono = '51957100099'`)).asesor_id === usrB.id, 'si se registra con el QR de otro asesor, sigue con quien lo subió')
  await q(`update asesores set activo = false where id = $1`, [usrB.id])
  await uno(`select procesar_lead(p_telefono => '51957100099', p_nombre => 'Por Defecto Mio', p_carrera => 'CEPRE', p_programa => 'cepre') r`)
  ok((await uno(`select asesor_id from leads where telefono = '51957100099'`)).asesor_id === usrB.id, 'aunque su asesor no reciba leads o cambie a CEPRE, sigue con quien lo subió')
  await q(`update asesores set activo = true where id = $1`, [usrB.id])
  await q(`delete from actividades where id = $1`, [actA.id])

  await comoUsuario('admin@test.pe')
  const vacia = (await uno(`insert into actividades (nombre) values ('Actividad vacía') returning id`)).id
  const conAlumnos = (await uno(`select id from actividades where nombre = 'Feria Juliaca 2026'`)).id
  await comoUsuario('a@test.pe')
  await falla(`select eliminar_actividad(${vacia})`, 'solo el super admin elimina actividades')
  await comoUsuario('admin@test.pe')
  await falla(`select eliminar_actividad(${conAlumnos})`, 'no se elimina una actividad con alumnos registrados')
  await uno(`select eliminar_actividad(${vacia}) r`)
  ok((await q(`select 1 from actividades where id = $1`, [vacia])).length === 0, 'el super admin elimina una actividad sin registrados')
  await reset()
}

seccion('quién recibe leads (interruptor, no el rol)')
{
  await reset()
  await q(`update asesores set activo = (nombre in ('Admin', 'General A'))`)
  const ids = []
  for (let i = 0; i < 4; i++) ids.push((await uno(`select (procesar_lead(p_telefono => $1, p_nombre => 'Reparto ' || $2)) r`, [`5194443300${i}`, String(i)])).r)
  const reparto = await q(`select a.nombre, count(*)::int n from leads l join asesores a on a.id = l.asesor_id where l.telefono like '5194443300%' group by a.nombre order by a.nombre`)
  ok(reparto.length === 2 && reparto.every((x) => x.n === 2) && reparto[0].nombre === 'Admin', 'un administrador activado entra al reparto y un asesor desactivado no: ' + JSON.stringify(reparto))
  await q(`update asesores set activo = (nombre <> 'Inactivo' and rol = 'asesor')`)
}

seccion('QR personal del asesor (presencial)')
{
  await reset()
  const gc = await asesor('General C')
  ok(/^[0-9A-F]{6}$/.test(gc.codigo_qr), 'cada asesor tiene su código de QR')
  ok(gc.permisos.includes('qr_asesor'), 'todos tienen el módulo "Mi QR"')
  await q(`update ajustes set valor = '51951301933' where clave = 'whatsapp_genesys'`)
  await db.exec(`set request.jwt.claim.sub = ''; set role anon`)
  const pub = (await uno(`select qr_asesor_publico($1) r`, [gc.codigo_qr.toLowerCase()])).r
  await reset()
  ok(pub.nombre === 'General C' && pub.whatsapp === '51951301933', 'el enlace público del QR obtiene el asesor y el número (sin sesión)')
  // Escribe por primera vez con el mensaje del QR
  const nuevo = (await uno(`select (registrar_lead('51933377701', $1)).id`, [`Hola 👋 Me atendió General C en Admisión UPeU y quiero más información. (Cód. A-${gc.codigo_qr})`])).id
  const r1 = (await uno(`select asignar_lead_qr_asesor($1, $2) r`, [nuevo, gc.codigo_qr])).r
  const l1 = await uno(`select asesor_id, registrado_por, estado from leads where id = $1`, [nuevo])
  ok(r1.asignado && l1.asesor_id === gc.id && l1.registrado_por === gc.id && l1.estado === 'lead_contactado', 'al escribir con el QR queda como lead de ese asesor, ya contactado (lo atiende en persona)')
  const r2 = (await uno(`select asignar_lead_qr_asesor($1, $2) r`, [nuevo, (await asesor('General A')).codigo_qr])).r
  ok(!r2.asignado && (await uno(`select asesor_id from leads where id = $1`, [nuevo])).asesor_id === gc.id, 'si ya tiene asesor, el QR de otro no lo cambia')
  ok(!(await uno(`select asignar_lead_qr_asesor($1, 'ZZZZZZ') r`, [nuevo])).r.asignado, 'un código desconocido no hace nada')
  await falla(`set role authenticated; select asignar_lead_qr_asesor('${nuevo}', '${gc.codigo_qr}')`, 'el panel no puede usar la asignación por QR (solo Genesys)')
  await reset()
}

seccion('anon')
await db.exec(`reset role; set request.jwt.claim.sub = ''; set role anon`)
await falla(`select * from tareas`, 'anon no puede ver tareas')
await falla(`select * from respuestas_rapidas`, 'anon no puede ver respuestas rápidas')
await falla(`select resumen_dashboard()`, 'anon no puede ver el dashboard')
await falla(`select * from campanas`, 'anon no puede ver campañas')
await falla(`select * from leads`, 'anon no puede leer leads')
await falla(`select * from vista_leads_por_estado`, 'anon no puede leer las vistas')
await falla(`select registrar_lead_manual('x','51999999999')`, 'anon no puede registrar leads')

console.log(fallos ? `\n${fallos} PRUEBA(S) FALLARON` : '\nTODAS LAS PRUEBAS PASARON')
process.exit(fallos ? 1 : 0)
