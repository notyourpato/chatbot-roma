"use strict";
require("dotenv").config();

const express = require("express");
const { handleMessage    } = require("./handler");
const { sendText         } = require("./whatsapp");
const { isOpen, closedMsg } = require("./schedule");
const { boot             } = require("./knowledge");

const app = express();
app.use(express.json({ limit: "5mb" }));

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "";
const PORT         = process.env.PORT || 3000;

// ── Arrancar base de conocimiento en background ───────────────────────────────
boot().catch(e => console.error("[boot]", e.message));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/",       (_req, res) => res.json({ ok: true, service: "Chatbot Postventa Grupo Roma v4" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// ── Verificación webhook Meta ─────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"]         === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    console.log("[webhook] ✅ Verificado por Meta");
    return res.status(200).send(req.query["hub.challenge"]);
  }
  console.warn("[webhook] ⚠️  Verify token inválido");
  res.sendStatus(403);
});

// ── Recepción de mensajes ─────────────────────────────────────────────────────
app.post("/webhook", (req, res) => {
  // Responder 200 inmediatamente — Meta cancela si tarda más de 5s
  res.sendStatus(200);
  processWebhook(req.body).catch(e => console.error("[webhook]", e.message));
});

async function processWebhook(body) {
  if (body?.object !== "whatsapp_business_account") return;

  const changes = body?.entry?.[0]?.changes ?? [];

  for (const change of changes) {
    const value = change?.value;
    if (!value?.messages?.length) continue;

    for (const msg of value.messages) {
      const from = msg.from;
      const name = value.contacts?.find(c => c.wa_id === from)?.profile?.name || "Cliente";

      // Ignorar mensajes que no sean de texto (audio, imagen, etc.)
      if (msg.type !== "text") {
        await sendText(from,
          "Hola 👋 Por ahora solo proceso mensajes de texto. Escribime tu consulta y te respondo enseguida."
        );
        continue;
      }

      const texto = msg.text?.body?.trim();
      if (!texto) continue;

      console.log(`[📩] ${name} (${from}): ${texto.slice(0, 80)}`);

      // Fuera de horario
      if (!isOpen()) {
        await sendText(from, closedMsg(name));
        continue;
      }

      // Generar y enviar respuesta
      try {
        const respuesta = await handleMessage(from, texto, name);
        await sendText(from, respuesta);
      } catch (err) {
        console.error(`[handler] ❌ ${err.message}`);
        await sendText(from,
          "Disculpá, tuvimos un problema técnico. Intentá de nuevo en un momento o escribinos directamente. 🙏"
        );
      }
    }
  }
}

app.listen(PORT, () => {
  console.log(`\n🚀 Chatbot Postventa Grupo Roma v4`);
  console.log(`   Puerto: ${PORT}`);
  console.log(`   Webhook: GET/POST /webhook\n`);
});
