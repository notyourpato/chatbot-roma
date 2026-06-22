"use strict";

/**
 * llm.js → renombrado groq.js para no cambiar imports existentes
 *
 * Soporta dos modos según variables de entorno:
 *   1. OLLAMA_URL configurada → usa Ollama local (recomendado, sin límites)
 *   2. Sin OLLAMA_URL         → usa Groq API como fallback
 */

const https = require("https");
const http  = require("http");

// ── Configuración ─────────────────────────────────────────────────────────────
const OLLAMA_URL   = () => process.env.OLLAMA_URL;   // ej: https://abc123.ngrok-free.app
const OLLAMA_MODEL = () => process.env.OLLAMA_MODEL || "llama3.2";
const GROQ_KEY     = () => process.env.GROQ_API_KEY;
const GROQ_MODEL   = "meta-llama/llama-4-scout-17b-16e-instruct";
const MAX_TOKENS   = 550;
const TEMPERATURE  = 0.72;
const TIMEOUT_MS   = 60000; // 60s — modelos locales pueden tardar más al arrancar

/**
 * Genera una respuesta. Usa Ollama si está configurado, Groq como fallback.
 */
async function chat(systemPrompt, history) {
  if (OLLAMA_URL()) {
    try {
      return await chatOllama(systemPrompt, history);
    } catch (err) {
      console.warn(`[llm] ⚠️  Ollama falló: ${err.message.slice(0, 80)}. Intentando Groq...`);
      // Fallback a Groq si Ollama no responde
    }
  }

  if (GROQ_KEY()) {
    return await chatGroq(systemPrompt, history);
  }

  throw new Error("Sin proveedor de IA configurado. Configurá OLLAMA_URL o GROQ_API_KEY.");
}

// ── Ollama ────────────────────────────────────────────────────────────────────

async function chatOllama(systemPrompt, history) {
  const url    = OLLAMA_URL().replace(/\/$/, "");
  const model  = OLLAMA_MODEL();

  // Ollama usa el formato de OpenAI — compatible directo
  const body = JSON.stringify({
    model,
    messages: [
      { role: "system",    content: systemPrompt },
      ...history,
    ],
    stream: false,
    options: {
      temperature:  TEMPERATURE,
      num_predict:  MAX_TOKENS,
    },
  });

  console.log(`[llm] 🤖 Ollama (${model}) @ ${url}`);

  const data = await httpPost(`${url}/api/chat`, body, {
    "Content-Type": "application/json",
  });

  const parsed = JSON.parse(data);
  const text   = parsed?.message?.content?.trim();

  if (!text) throw new Error("Ollama devolvió respuesta vacía");

  console.log(`[llm] ✅ Ollama OK — ${text.length} chars`);
  return text;
}

// ── Groq (fallback) ───────────────────────────────────────────────────────────

async function chatGroq(systemPrompt, history) {
  let Groq;
  try { Groq = require("groq-sdk"); } catch {
    throw new Error("groq-sdk no instalado y Ollama no disponible");
  }

  const client = new Groq({ apiKey: GROQ_KEY(), timeout: 30000 });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model:       GROQ_MODEL,
        max_tokens:  MAX_TOKENS,
        temperature: TEMPERATURE,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
        ],
      });

      const text = completion.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Respuesta vacía");

      console.log(`[llm] ✅ Groq OK intento ${attempt} — ${text.length} chars`);
      return text;

    } catch (err) {
      console.warn(`[llm] ⚠️  Groq intento ${attempt}: ${err.message?.slice(0, 80)}`);
      if (attempt < 3) await sleep(1500 * attempt);
    }
  }

  throw new Error("Groq no respondió después de 3 intentos");
}

// ── HTTP helper nativo ────────────────────────────────────────────────────────

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const lib     = parsed.protocol === "https:" ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
      },
    };

    const req = lib.request(options, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`));
        }
        resolve(data);
      });
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Timeout después de ${TIMEOUT_MS / 1000}s`));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { chat };
