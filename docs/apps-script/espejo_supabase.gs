/*************** ESPEJO EN SUPABASE (modo sombra) ***************/
/**
 * Pega este bloque al final de tu Apps Script de admisión.
 *
 * Cada lead que el Apps Script registra (bot, Google Form, formulario web o manual)
 * se copia a Supabase con el MISMO asesor que eligió el Apps Script.
 * Supabase no vuelve a notificar: el aviso por WhatsApp lo sigue haciendo el Apps Script.
 *
 * Configuración (Extensiones > Apps Script > Configuración del proyecto > Propiedades del script):
 *   SUPABASE_GENESYS_URL   = https://itmwdnttrfbbehoipzzp.supabase.co/functions/v1/genesys
 *   SUPABASE_GENESYS_TOKEN = el mismo valor del secreto GENESYS_BOT_TOKEN de Supabase
 *
 * Si Supabase falla, el Apps Script sigue funcionando igual: el error solo queda en el registro.
 */
function enviarLeadASupabase(datos, telefonoAsesor, fuente) {
  try {
    const props = PropertiesService.getScriptProperties();
    const url = limpiarCredencial(props.getProperty('SUPABASE_GENESYS_URL'));
    const token = limpiarCredencial(props.getProperty('SUPABASE_GENESYS_TOKEN'));
    if (!url || !token) return;

    const payload = Object.assign({}, datos, {
      fuente: fuente,
      telefono_asesor: normalizarTelefono(telefonoAsesor)
    });

    const response = UrlFetchApp.fetch(url.replace(/\/+$/, '') + '/webhook', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-genesys-token': token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() >= 300) {
      Logger.log('Supabase respondió ' + response.getResponseCode() + ': ' +
        response.getContentText().substring(0, 500));
    }
  } catch (err) {
    Logger.log('Error enviando lead a Supabase: ' + err.message);
  }
}

/*
 * DÓNDE LLAMARLO (4 lugares del Apps Script):
 *
 * 1) doPost — justo antes de "return respuestaJSON(crearRespuestaWebhook(decision));":
 *
 *      if (decision && (decision.status === 'success' || decision.status === 'duplicate')) {
 *        enviarLeadASupabase(data, decision.telefonoAsesor, 'whatsapp_genesys');
 *      }
 *
 *    Nota: "data" se declara dentro del try. Muévelo arriba:  let data = null;  y dentro
 *    del try cambia "const data = parsearBodyPost(e);" por "data = parsearBodyPost(e);".
 *
 * 2) procesarEntradaFormulario — después de la línea
 *    "sheetDestino.getRange(filaAEditar, COL_BASE.INTENTOS_NOTIFICACION).setValue(1);":
 *
 *      enviarLeadASupabase({ Nombres: nombres, DNI: dni, Celular: celular, Carrera: carrera,
 *                            NombreHoja: CONFIG.HOJA_BASE_DEFAULT }, asesorElegido.telf, 'google_form');
 *
 * 3) procesarFormularioWeb — antes de "sincronizarHojaAsesorSeguro(ss, asesor.hoja);":
 *
 *      enviarLeadASupabase({ Nombres: lead.nombres, DNI: dniFinal, Celular: lead.celular,
 *                            Consulta: lead.interes, NombreHoja: datos.convocatoria }, asesor.telf, 'web');
 *
 * 4) registrarManual — antes de "sincronizarHojaAsesorSeguro(ss, datosAsesor.hoja);":
 *
 *      enviarLeadASupabase({ Nombres: nombres, DNI: dni, Celular: celular, Consulta: interes,
 *                            NombreHoja: convocatoria }, datosAsesor.telf, 'manual');
 */
