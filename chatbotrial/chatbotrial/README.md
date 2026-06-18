# Bot Postventa Grupo Roma v4

WhatsApp Business API + Groq (Llama 3.3) + autoconocimiento desde archivos

---

## Estructura

```
chatbot-gruporoma/
├── src/
│   ├── server.js      ← Webhook principal
│   ├── handler.js     ← Manejo de conversaciones y prompt
│   ├── groq.js        ← IA con retry y fallback de modelos
│   ├── whatsapp.js    ← Envío de mensajes
│   ├── schedule.js    ← Horario de atención
│   └── knowledge.js   ← Autoconocimiento desde archivos
├── knowledge/
│   ├── chats/         ← TXT exportados de WhatsApp ← PONER ACÁ
│   ├── chatgpt/       ← TXT/MD de ChatGPT o PDFs convertidos ← PONER ACÁ
│   └── excel/         ← Excel de avances de obra ← PONER ACÁ
├── .env.example
├── render.yaml
└── package.json
```

---

## Cómo agregar conocimiento

Solo copiar archivos a las carpetas correspondientes y hacer push. El bot los lee solo al arrancar.

| Carpeta | Qué va ahí |
|---------|------------|
| `knowledge/chats/` | TXT exportados de WhatsApp (Ajustes → Chats → Exportar chat) |
| `knowledge/chatgpt/` | TXT o MD exportados con la extensión de Chrome, o PDFs convertidos a TXT |
| `knowledge/excel/` | Archivo .xlsx o .csv con avances de obra |

---

## Setup en 4 pasos

### 1. Clonar y configurar

```bash
git clone https://github.com/TU_USUARIO/chatbot-gruporoma
cd chatbot-gruporoma
npm install
cp .env.example .env
```

Completar el `.env` con las credenciales reales.

### 2. Deploy en Render

- render.com → New → Web Service → conectar el repo
- El `render.yaml` ya está configurado — solo agregar las variables de entorno
- Render genera la URL: `https://chatbot-gruporoma.onrender.com`

### 3. Configurar Meta for Developers

- developers.facebook.com → Mis Apps → Crear app → Business
- Agregar producto WhatsApp → registrar el número argentino
- Webhook: `https://chatbot-gruporoma.onrender.com/webhook`
- Verify Token: el que pusiste en `WEBHOOK_VERIFY_TOKEN`
- Suscribirse al campo: `messages`

### 4. Token permanente (no vence)

- business.facebook.com → Configuración → Usuarios del sistema
- Crear usuario → Agregar activos → tu app → `whatsapp_business_messaging`
- Generar token sin vencimiento → pegar en Render

---

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número en Meta for Developers |
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso (permanente) |
| `WEBHOOK_VERIFY_TOKEN` | String secreto para verificar el webhook |
| `GROQ_API_KEY` | API key de console.groq.com |
| `GITHUB_REPO_URL` | (opcional) URL del repo para leer como conocimiento |
| `GITHUB_TOKEN` | (opcional) Solo si el repo es privado |
| `HORA_INICIO` | Hora de inicio de atención (default: 9) |
| `HORA_FIN` | Hora de fin de atención (default: 18) |

---

## Costos

Todo gratis para volumen normal de postventa:

- Groq: 14.400 req/día gratis
- WhatsApp Business API: 1.000 conversaciones/mes gratis  
- Render: plan free incluido

---

## Tip para Render plan free

El servidor "duerme" tras 15 min sin tráfico — el primer mensaje puede tardar ~30s en despertar. Para evitarlo, configurar un ping gratuito en uptimerobot.com cada 10 minutos a `https://tu-app.onrender.com/health`.
