"use strict";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";

const MODEL       = "llama-3.3-70b-versatile";
const MAX_TOKENS  = 550;
const TEMPERATURE = 0.72;
const MAX_RETRIES = 3;
const TIMEOUT_MS  = 30000;

function getKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY no configurada");
  return key;
}

async function chat(systemPrompt, history) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model:       MODEL,
          max_tokens:  MAX_TOKENS,
          temperature: TEMPERATURE,
          messages,
          stream:      false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Respuesta vacía");

      console.log(`[groq] OK intento ${attempt} - ${text.length} chars`);
      return text;

    } catch (err) {
      clearTimeout(timer);
      const msg = err?.message || "";
      console.warn(`[groq] intento ${attempt}: ${msg.slice(0, 150)}`);
      if (attempt < MAX_RETRIES) {
        await sleep(1500 * attempt);
        continue;
      }
    }
  }

  console.error("[groq] Sin respuesta");
  return "Disculpa, tuvimos un problema tecnico momentaneo. Intenta de nuevo en unos segundos.";
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { chat };
