"use strict";

const https = require("https");

const PHONE_ID = () => process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN    = () => process.env.WHATSAPP_ACCESS_TOKEN;
const API_VER  = "v20.0";

/**
 * Envía un mensaje de texto por WhatsApp Business API.
 * Si el texto supera 4000 chars lo divide en partes.
 */
async function sendText(to, text) {
  if (!text?.trim()) return;

  const partes = dividirMensaje(text.trim(), 3800);

  for (let i = 0; i < partes.length; i++) {
    try {
      await enviarUno(to, partes[i]);
      // Pequeña pausa entre partes para que lleguen en orden
      if (partes.length > 1 && i < partes.length - 1) await sleep(400);
    } catch (err) {
      console.error(`[wa] ❌ Error enviando a ${to}:`, err.message);
    }
  }
}

function enviarUno(to, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type:    "individual",
      to,
      type:  "text",
      text:  { preview_url: false, body: text },
    });

    const options = {
      hostname: "graph.facebook.com",
      path:     `/${API_VER}/${PHONE_ID()}/messages`,
      method:   "POST",
      headers:  {
        "Authorization":  `Bearer ${TOKEN()}`,
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          const parsed = safeJson(data);
          const msg    = parsed?.error?.message || `HTTP ${res.statusCode}`;
          return reject(new Error(msg));
        }
        console.log(`[wa] ✅ Enviado a ${to}`);
        resolve();
      });
    });

    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

// Divide texto largo en partes respetando saltos de línea
function dividirMensaje(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const partes = [];
  const lineas = text.split("\n");
  let actual   = "";

  for (const linea of lineas) {
    const candidato = actual ? actual + "\n" + linea : linea;
    if (candidato.length > maxLen) {
      if (actual) partes.push(actual.trim());
      actual = linea;
    } else {
      actual = candidato;
    }
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes.length ? partes : [text.slice(0, maxLen)];
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { sendText };
