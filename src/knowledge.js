"use strict";

/**
 * knowledge.js — Motor de autoconocimiento del bot
 *
 * Lee y combina automáticamente TODAS las fuentes disponibles:
 *   1. TXT de WhatsApp (knowledge/chats/)
 *   2. TXT/MD de ChatGPT exportados (knowledge/chatgpt/)
 *   3. Excel de avances de obra (knowledge/excel/)
 *   4. GitHub repo (opcional, configurable)
 *   5. Dashboard web (opcional, configurable)
 *
 * Solo hay que tirar los archivos en las carpetas — el bot los lee solo.
 * Cada fuente tiene un límite de chars para no saturar el contexto del modelo.
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");

// ── Rutas ─────────────────────────────────────────────────────────────────────
const ROOT      = path.join(__dirname, "..");
const DIR_WA    = path.join(ROOT, "knowledge", "chats");
const DIR_GPT   = path.join(ROOT, "knowledge", "chatgpt");
const DIR_EXCEL = path.join(ROOT, "knowledge", "excel");

// ── Límites por fuente (chars) ────────────────────────────────────────────────
const LIM_WA    = 7000;
const LIM_GPT   = 6000;
const LIM_EXCEL = 2500;
const LIM_GH    = 2000;

// ── Estado ────────────────────────────────────────────────────────────────────
let _context   = "";   // contexto unificado cacheado
let _booted    = false;

// ── API pública ───────────────────────────────────────────────────────────────

/** Devuelve el contexto unificado (cacheado). */
function getContext() { return _context; }

/**
 * Carga todas las fuentes al arrancar el servidor.
 * Las síncronas (archivos) se cargan de inmediato.
 * Las async (GitHub) cargan en background sin bloquear.
 */
async function boot() {
  if (_booted) return;
  _booted = true;

  console.log("\n[knowledge] ══ Cargando base de conocimiento ══");

  // Fuentes síncronas — disponibles de inmediato
  const wa    = leerChatsWA();
  const gpt   = leerArchivosGPT();
  const excel = leerExcel();

  _context = armar(wa, gpt, excel, "");
  console.log(`[knowledge] ✅ Contexto inicial listo (${_context.length} chars)`);

  // GitHub en background — no bloquea el primer mensaje
  cargarGithub().then(gh => {
    if (gh) {
      _context = armar(wa, gpt, excel, gh);
      console.log(`[knowledge] ✅ GitHub cargado. Contexto total: ${_context.length} chars`);
    }
  }).catch(() => {});
}

// ── Construcción del contexto ─────────────────────────────────────────────────

function armar(wa, gpt, excel, gh) {
  const partes = [];
  if (wa)    partes.push(`### Conversaciones reales de postventa (WhatsApp)\n${recortar(wa, LIM_WA)}`);
  if (gpt)   partes.push(`### Conversaciones y documentos exportados (ChatGPT/PDFs)\n${recortar(gpt, LIM_GPT)}`);
  if (excel) partes.push(`### Avances de obra — Excel\n${recortar(excel, LIM_EXCEL)}`);
  if (gh)    partes.push(`### Repositorio del sistema (GitHub)\n${recortar(gh, LIM_GH)}`);
  return partes.join("\n\n---\n\n");
}

// ── Fuente 1: Chats de WhatsApp (.txt) ───────────────────────────────────────

function leerChatsWA() {
  asegurarDir(DIR_WA);
  const archivos = leerDir(DIR_WA, [".txt"]);
  if (!archivos.length) { console.warn("[knowledge] ⚠️  Sin TXTs en knowledge/chats/"); return ""; }

  console.log(`[knowledge] 📱 ${archivos.length} chat(s) de WhatsApp`);
  return archivos
    .map(f => parsearWA(fs.readFileSync(path.join(DIR_WA, f), "utf-8"), f))
    .filter(Boolean)
    .join("\n\n");
}

function parsearWA(raw, filename) {
  const titulo = filename.replace(/^Chat_de_WhatsApp_con_/i, "").replace(/\.txt$/i, "").replace(/_/g, " ");
  const RE     = /^\d{1,2}\/\d{1,2}\/\d{4},?\s\d{1,2}:\d{2}(?::\d{2})?\s[-–]\s(.+)$/;
  const lineas = raw.split(/\r?\n/);
  const intercambios = [];
  let quien = null, texto = "";

  function flush() {
    if (!quien || !texto.trim()) return;
    if (
      quien.includes("cifrados") || quien.startsWith("Los mensajes") ||
      texto.trim() === "<Multimedia omitido>" || texto.includes("Más información")
    ) return;
    const rol = quien.toLowerCase().includes("postventa grupo roma") ? "Postventa" : "Cliente";
    intercambios.push(`${rol}: ${texto.trim()}`);
    quien = null; texto = "";
  }

  for (const linea of lineas) {
    const m = linea.match(RE);
    if (m) {
      flush();
      const resto = m[1];
      const idx   = resto.indexOf(": ");
      if (idx === -1) { quien = resto; texto = ""; }
      else            { quien = resto.slice(0, idx).trim(); texto = resto.slice(idx + 2).trim(); }
    } else if (linea.trim() && quien) {
      texto += "\n" + linea.trim();
    }
  }
  flush();

  return intercambios.length
    ? `=== ${titulo} ===\n${intercambios.join("\n")}`
    : null;
}

// ── Fuente 2: Archivos de ChatGPT / PDFs convertidos (.txt, .md) ─────────────

function leerArchivosGPT() {
  asegurarDir(DIR_GPT);
  const archivos = leerDir(DIR_GPT, [".txt", ".md", ".json"]);
  if (!archivos.length) { console.warn("[knowledge] ⚠️  Sin archivos en knowledge/chatgpt/"); return ""; }

  console.log(`[knowledge] 🤖 ${archivos.length} archivo(s) en chatgpt/`);

  const KEYWORDS = [
    "lote","barrio","posesión","posesion","obra","escritura","naranjo","vitta","cepe",
    "campo madero","origenes","orígenes","clos","electricidad","agua","gas","vialidad",
    "mensura","grupo roma","postventa","cliente","propietario","epe","litoral gas",
    "cooperativa","convenio","hídrico","hidrico","alumbrado","clesape",
  ];

  const bloques = [];

  for (const archivo of archivos) {
    const filePath = path.join(DIR_GPT, archivo);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");

      if (archivo.endsWith(".json")) {
        // Export oficial de OpenAI
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const texto = parsearJSONoficial(parsed, KEYWORDS);
          if (texto) bloques.push(texto);
        }
      } else {
        // TXT o MD — limpiar y filtrar por relevancia
        const limpio = limpiarTexto(raw, archivo);
        if (limpio && esRelevante(limpio, KEYWORDS)) {
          const titulo = archivo.replace(/\.(txt|md)$/i, "").replace(/[_-]/g, " ").slice(0, 60);
          bloques.push(`=== ${titulo} ===\n${limpio.slice(0, 4000)}`);
        } else if (limpio) {
          // Incluir igual aunque no tenga keywords — puede ser útil
          const titulo = archivo.replace(/\.(txt|md)$/i, "").replace(/[_-]/g, " ").slice(0, 60);
          bloques.push(`=== ${titulo} ===\n${limpio.slice(0, 2000)}`);
        }
      }
      console.log(`[knowledge]  ✓ ${archivo}`);
    } catch (err) {
      console.error(`[knowledge] ❌ ${archivo}:`, err.message);
    }
  }

  return bloques.join("\n\n");
}

function parsearJSONoficial(convs, keywords) {
  return convs
    .map(conv => {
      const titulo = conv.title || "Sin título";
      const msgs   = [];
      Object.values(conv.mapping || {})
        .sort((a, b) => (a?.message?.create_time || 0) - (b?.message?.create_time || 0))
        .forEach(node => {
          const msg = node?.message;
          if (!msg || !msg.role || msg.role === "system") return;
          let text = "";
          const c  = msg.content;
          if (typeof c === "string")  text = c;
          else if (c?.parts)          text = c.parts.filter(p => typeof p === "string").join(" ");
          else if (Array.isArray(c))  text = c.map(p => p?.text || "").join(" ");
          text = text.trim().slice(0, 500);
          if (text.length < 5) return;
          msgs.push(`${msg.role === "user" ? "Usuario" : "ChatGPT"}: ${text}`);
        });
      return msgs.length ? { titulo, texto: msgs.join("\n") } : null;
    })
    .filter(Boolean)
    .map(c => `=== ${c.titulo} ===\n${c.texto}`)
    .join("\n\n");
}

function limpiarTexto(raw, filename) {
  // Normalizar saltos de línea y limpiar Markdown básico
  return raw
    .replace(/```[\s\S]*?```/g, "[código]")
    .replace(/\*\*(You|Usuario)\*\*:/gi,       "Usuario:")
    .replace(/\*\*(ChatGPT|Assistant)\*\*:/gi, "ChatGPT:")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*/g,     "")
    .replace(/\n{3,}/g,   "\n\n")
    .trim();
}

function esRelevante(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

// ── Fuente 3: Excel de avances (.xlsx, .xls, .csv) ──────────────────────────

function leerExcel() {
  asegurarDir(DIR_EXCEL);
  const archivos = leerDir(DIR_EXCEL, [".xlsx", ".xls", ".csv"]);
  if (!archivos.length) { console.warn("[knowledge] ⚠️  Sin Excel en knowledge/excel/"); return ""; }

  console.log(`[knowledge] 📊 ${archivos.length} archivo(s) de Excel`);

  let XLSX;
  try { XLSX = require("xlsx"); } catch {
    console.warn("[knowledge] ⚠️  Módulo xlsx no instalado. Saltando Excel.");
    return "";
  }

  const bloques = [];
  for (const archivo of archivos) {
    try {
      const wb   = XLSX.readFile(path.join(DIR_EXCEL, archivo), { cellDates: true });
      const rows = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const data  = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
        for (const row of data) {
          const entry = Object.entries(row)
            .filter(([, v]) => v !== "" && v !== null)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");
          if (entry.trim()) rows.push(entry);
        }
      }
      if (rows.length) bloques.push(`=== ${archivo} ===\n${rows.join("\n")}`);
      console.log(`[knowledge]  ✓ ${archivo} (${rows.length} filas)`);
    } catch (err) {
      console.error(`[knowledge] ❌ ${archivo}:`, err.message);
    }
  }

  return bloques.join("\n\n");
}

// ── Fuente 4: GitHub repo (async, en background) ─────────────────────────────

async function cargarGithub() {
  const repoUrl = process.env.GITHUB_REPO_URL;
  if (!repoUrl) return "";

  const token = process.env.GITHUB_TOKEN || "";
  const clean = repoUrl.replace(/https?:\/\/github\.com\//, "").replace(/\.git$/, "").trim();
  const parts = clean.split("/");
  if (parts.length < 2) return "";

  const [owner, repo] = parts;
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

  try {
    console.log(`[knowledge] 📦 GitHub: ${owner}/${repo}`);

    // README
    const readmeData = await ghGet(`${apiBase}/readme`, token);
    const readme     = readmeData?.content
      ? Buffer.from(readmeData.content, "base64").toString("utf-8").slice(0, 2000)
      : "";

    // Árbol de archivos
    const treeData = await ghGet(`${apiBase}/git/trees/HEAD?recursive=1`, token);
    const tree     = (treeData?.tree || [])
      .filter(f => f.type === "blob" && !f.path.includes("node_modules"))
      .map(f => f.path)
      .slice(0, 60)
      .join("\n");

    return `=== GitHub: ${owner}/${repo} ===\n\n## README\n${readme}\n\n## Estructura\n${tree}`;
  } catch (err) {
    console.warn("[knowledge] ⚠️  GitHub no disponible:", err.message);
    return "";
  }
}

function ghGet(url, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent":           "chatbot-gruporoma/4.0",
      "Accept":               "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    https.get(url, { headers }, res => {
      let body = "";
      res.on("data", d => (body += d));
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    }).on("error", reject);
  });
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function asegurarDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function leerDir(dir, exts) {
  return fs.readdirSync(dir)
    .filter(f => exts.some(e => f.toLowerCase().endsWith(e)))
    .sort();
}

function recortar(text, max) {
  if (!text || text.length <= max) return text;
  const sliced = text.slice(-max);
  const nl     = sliced.indexOf("\n");
  return nl !== -1 ? sliced.slice(nl + 1) : sliced;
}

module.exports = { boot, getContext };
