"use strict";

const Groq = require("groq-sdk");

let _client = null;

function getClient() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _client;
}

// Modelos activos en Groq — en orden de preferencia
const MODELS = [
  "llama-3.3-70b-versatile",  // mejor calidad — principal
  "llama3-70b-8192",          // fallback estable
  "llama-3.1-8b-instant",     // fallback rápido
  "gemma2-9b-it",             // último recurso
];

const MAX_TOKENS  = 550;
const TEMPERATURE = 0.72;
const MAX_RETRIES = 2;

async function chat(systemPrompt, history) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
    const model = MODELS[modelIdx];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const completion = await getClient().chat.completions.create({
          model,
          max_tokens:  MAX_TOKENS,
          temperature: TEMPERATURE,
          messages,
        });

        const text = completion.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("Respuesta vacía del modelo");

        if (modelIdx > 0) console.log(`[groq] ✅ Usó fallback: ${model}`);
        console.log(`[groq] ✅ ${text.length} chars — modelo: ${model}`);
        return text;

      } catch (err) {
        const isRateLimit    = err?.status === 429 || err?.message?.includes("rate_limit");
        const isServerErr    = err?.status >= 500;
        const isDecommission = err?.message?.includes("decommissioned");
        const isPrematureClose = err?.message?.includes("Premature close");

        console.warn(`[groq] ⚠️  ${model} intento ${attempt}: ${err.message?.slice(0, 80)}`);

        // Modelo dado de baja o cierre prematuro → saltar al siguiente modelo directo
        if (isDecommission || isPrematureClose) break;

        // Rate limit o error servidor → esperar y reintentar
        if ((isRateLimit || isServerErr) && attempt < MAX_RETRIES) {
          await sleep(1500 * attempt);
          continue;
        }

        break;
      }
    }
  }

  console.error("[groq] ❌ Todos los modelos fallaron");
  return "Disculpá, tuvimos un problema técnico momentáneo. Intentá de nuevo en unos segundos o escribinos y te respondemos a la brevedad 🙏";
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { chat };
