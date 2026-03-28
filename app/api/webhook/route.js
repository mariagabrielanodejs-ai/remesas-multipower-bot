import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const processedMessages = new Set();

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Error de validación', { status: 403 });
}

export async function POST(req) {
  try {
    const body = await req.json();

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contactName = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || 'equipo';
    
    if (message?.type === 'text') {
      const messageId = message.id;

      if (processedMessages.has(messageId)) {
        return NextResponse.json({ status: 'ok_duplicate_ignored' });
      }

      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 60000);

      const from = message.from; 
      
      if (!process.env.GOOGLE_API_KEY) {
        throw new Error("Falta configurar GOOGLE_API_KEY en Vercel.");
      }

      const sheets = google.sheets({ 
        version: 'v4', 
        auth: process.env.GOOGLE_API_KEY 
      });
      
      const spreadsheetId = '1lkgBZBWmJ_8PJL-YiD9-2bOBvKZcfyy8dUex6KSCw04';
      
      const sheetYacdary = 'Jackdari.';
      const sheetRemesas = 'RemesasTopCaja';
      const sheetMarisela = 'Marisela.';
      
      const ranges = [
        `${sheetYacdary}!F21`,  // 0: BDV Yacdary
        `${sheetYacdary}!J21`,  // 1: Mercantil Yacdary
        `${sheetYacdary}!N22`,  // 2: Banesco Yacdary
        `${sheetRemesas}!F26`,  // 3: BDV Remesas
        `${sheetRemesas}!N26`,  // 4: Mercantil Remesas
        `${sheetMarisela}!F22`,  // 5: BDV Marisela
        `${sheetMarisela}!J22`,  // 6: Mercantil Marisela
        `${sheetMarisela}!N22`,  // 7: Banesco Marisela
        `${sheetMarisela}!C5`,   // 8: Turno Marisela
        `${sheetYacdary}!C5`,    // 9: Turno Yacdary
        `${sheetYacdary}!R21`,   // 10: Provincial Yacdary
        `${sheetMarisela}!R21`   // 11: Provincial Marisela
      ];

      const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
      const valueRanges = response.data.valueRanges;

      // Saldos Yacdary
      const vzlaYacdary = valueRanges[0]?.values?.[0]?.[0] || '0.00';
      const mercantilYacdary = valueRanges[1]?.values?.[0]?.[0] || '0.00';
      const banescoYacdary = valueRanges[2]?.values?.[0]?.[0] || '0.00';
      const provincialYacdary = valueRanges[10]?.values?.[0]?.[0] || '0.00';

      // Saldos RemesasTop
      const vzlaRemesas = valueRanges[3]?.values?.[0]?.[0] || '0.00';
      const mercantilRemesas = valueRanges[4]?.values?.[0]?.[0] || '0.00';

      // Saldos Marisela
      const vzlaMarisela = valueRanges[5]?.values?.[0]?.[0] || '0.00';
      const mercantilMarisela = valueRanges[6]?.values?.[0]?.[0] || '0.00';
      const banescoMarisela = valueRanges[7]?.values?.[0]?.[0] || '0.00';
      const provincialMarisela = valueRanges[11]?.values?.[0]?.[0] || '0.00';

      // Turnos
      const turnoMarisela = valueRanges[8]?.values?.[0]?.[0]?.toUpperCase() || 'NO';
      
      // --- LÓGICA DE TURNOS ---
      let activeName = '';
      let activeVzla = '';
      let activeMercantil = '';
      let activeBanesco = '';
      let activeProvincial = '';

      if (turnoMarisela === 'SI') {
        activeName = 'Marisela';
        activeVzla = vzlaMarisela;
        activeMercantil = mercantilMarisela;
        activeBanesco = banescoMarisela;
        activeProvincial = provincialMarisela;
      } else {
        activeName = 'Yacdary';
        activeVzla = vzlaYacdary;
        activeMercantil = mercantilYacdary;
        activeBanesco = banescoYacdary;
        activeProvincial = provincialYacdary;
      }

      // Validar si Provincial es mayor a 0 (ignorando puntos y comas del formato moneda)
      const cleanProvincial = activeProvincial.replace(/[^\d]/g, '');
      const isProvincialMayorACero = parseInt(cleanProvincial, 10) > 0;
      
      // Armar el mensaje dinámicamente
      let mensajeLineas = [
        `*${activeName}*`,
        `*BDV:* ${activeVzla} Bs`,
        `*Mercantil:* ${activeMercantil} Bs`,
        `*Banesco:* ${activeBanesco} Bs`
      ];

      if (isProvincialMayorACero) {
        mensajeLineas.push(`*Provincial:* ${activeProvincial} Bs`);
      }

      // Unir la primera parte y agregar RemesasTop
      const replyText = mensajeLineas.join('\n') + `\n\n*RemesasTop*\n*BDV:* ${vzlaRemesas} Bs\n*Mercantil:* ${mercantilRemesas} Bs`;

      await sendWhatsAppMessage(from, replyText);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error procesando el mensaje:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
  
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: text },
    }),
  });
}
