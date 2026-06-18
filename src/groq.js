"use strict";

const Groq = require("groq-sdk");

let _client = null;

function getClient() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY no configurada");
  if (!_client) _client = new Groq({ apiKey: key, timeout: 30000 });
  return _client;
}

const MODEL      = "meta-llama/llama-4-scout-17b-16e-instruct";
const MAX_TOKENS  = 550;
const TEMPERATURE = 0.72;
const MAX_RETRIES = 3;

async function chat(systemPrompt, history) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await getClient().chat.completions.create({
        model:       MODEL,
        max_tokens:  MAX_TOKENS,
        temperature: TEMPERATURE,
        messages,
      });

      const text = completion.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Respuesta vacía");

      console.log(`[groq] ✅ OK intento ${attempt} — ${text.length} chars`);
      return text;

    } catch (err) {
      const msg = err?.message || "";
      console.warn(`[groq] ⚠️  intento ${attempt}: ${msg.slice(0, 120)}`);

      if (attempt < MAX_RETRIES) {
        await sleep(1500 * attempt);
        continue;
      }
    }
  }

  console.error("[groq] ❌ Sin respuesta");
  return "Disculpá, tuvimos un problema técnico momentáneo. Intentá de nuevo en unos segundos 🙏";
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { chat };
