import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';

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
      const text = message.text.body.toLowerCase().trim();

      if (text === 'saldos') {
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = '1lkgBZBWmJ_8PJL-YiD9-2bOBvKZcfyy8dUex6KSCw04';
        
        const sheetYacdary = 'Jackdari.';
        const sheetRemesas = 'RemesasTopCaja';
        const sheetMarisela = 'Marisela.';
        
        // Agregamos las celdas C5 para validar los turnos
        const ranges = [
          `${sheetYacdary}!F21`, 
          `${sheetYacdary}!J21`, 
          `${sheetYacdary}!N22`,
          `${sheetRemesas}!F26`, 
          `${sheetRemesas}!N26`,
          `${sheetMarisela}!F22`, 
          `${sheetMarisela}!J22`, 
          `${sheetMarisela}!N22`,
          `${sheetMarisela}!C5`, // Índice 8: Turno Marisela
          `${sheetYacdary}!C5`   // Índice 9: Turno Yacdary
        ];

        const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
        const valueRanges = response.data.valueRanges;

        // Saldos Yacdary
        const vzlaYacdary = valueRanges[0]?.values?.[0]?.[0] || '0.00';
        const mercantilYacdary = valueRanges[1]?.values?.[0]?.[0] || '0.00';
        const banescoYacdary = valueRanges[2]?.values?.[0]?.[0] || '0.00';

        // Saldos RemesasTop
        const vzlaRemesas = valueRanges[3]?.values?.[0]?.[0] || '0.00';
        const mercantilRemesas = valueRanges[4]?.values?.[0]?.[0] || '0.00';

        // Saldos Marisela
        const vzlaMarisela = valueRanges[5]?.values?.[0]?.[0] || '0.00';
        const mercantilMarisela = valueRanges[6]?.values?.[0]?.[0] || '0.00';
        const banescoMarisela = valueRanges[7]?.values?.[0]?.[0] || '0.00';

        // Turnos (Convertimos a mayúsculas para evitar errores si escriben "Si", "si", "SI")
        const turnoMarisela = valueRanges[8]?.values?.[0]?.[0]?.toUpperCase() || 'NO';
        const turnoYacdary = valueRanges[9]?.values?.[0]?.[0]?.toUpperCase() || 'NO';

        // --- LÓGICA DE TURNOS ---
        let activeName = '';
        let activeVzla = '';
        let activeMercantil = '';
        let activeBanesco = '';

        // Si Marisela tiene "NO", asumimos que es el turno de Yacdary (o si Yacdary tiene "SI" explícitamente)
        if (turnoMarisela === 'SI') {
          activeName = 'Marisela';
          activeVzla = vzlaMarisela;
          activeMercantil = mercantilMarisela;
          activeBanesco = banescoMarisela;
        } else {
          // Por descarte, si Marisela es "NO", le toca a Yacdary
          activeName = 'Yacdary';
          activeVzla = vzlaYacdary;
          activeMercantil = mercantilYacdary;
          activeBanesco = banescoYacdary;
        }

        const replyText = 
`*${activeName}*
*BDV:* ${activeVzla} Bs
*Mercantil:* ${activeMercantil} Bs
*Banesco:* ${activeBanesco} Bs

*RemesasTop*
*BDV:* ${vzlaRemesas} Bs
*Mercantil:* ${mercantilRemesas} Bs`;

        await sendWhatsAppMessage(from, replyText);
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error:', error);
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
