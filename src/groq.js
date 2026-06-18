"use strict";

const Groq = require("groq-sdk");

let _client = null;

function getClient() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 20000 });
  return _client;
}

// Solo modelos activos confirmados en Groq (junio 2026)
const MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

const MAX_TOKENS  = 550;
const TEMPERATURE = 0.72;
const MAX_RETRIES = 3; // más reintentos para el Premature close

async function chat(systemPrompt, history) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const completion = await getClient().chat.completions.create({
          model,
          max_tokens:  MAX_TOKENS,
          temperature: TEMPERATURE,
          messages,
        });

        const text = completion.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("Respuesta vacía");

        console.log(`[groq] ✅ OK con ${model} (intento ${attempt}) — ${text.length} chars`);
        return text;

      } catch (err) {
        const msg = err?.message || "";
        console.warn(`[groq] ⚠️  ${model} intento ${attempt}: ${msg.slice(0, 100)}`);

        // Modelo dado de baja → saltar al siguiente sin reintentar
        if (msg.includes("decommissioned")) break;

        // Premature close o error de red → esperar y reintentar
        if (msg.includes("Premature close") || msg.includes("fetch") || err?.status >= 500) {
          if (attempt < MAX_RETRIES) {
            await sleep(1000 * attempt);
            continue;
          }
          break;
        }

        // Rate limit → esperar más
        if (err?.status === 429) {
          await sleep(2000 * attempt);
          continue;
        }

        // Otro error → siguiente modelo
        break;
      }
    }
  }

  console.error("[groq] ❌ Sin respuesta de ningún modelo");
  return "Disculpá, tuvimos un problema técnico momentáneo. Intentá de nuevo en unos segundos 🙏";
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { chat };
