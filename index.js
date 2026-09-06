// ==========================================
// ZAZABOT - FULL INDEX.JS
// WhatsApp Bot - Baileys
// ==========================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  downloadContentFromMessage
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode";
import sharp from "sharp";
import fs from "fs";
import http from "http";

// ==========================================
// CONFIG
// ==========================================

const BOT_NAME = "ZazaBot";

const OWNER_NUMBER = (
  process.env.OWNER_NUMBER || "6289630747010"
).replace(/\D/g, "");

const PREFIX = process.env.PREFIX || ".";

const PORT = Number(
  process.env.PORT || 8080
);

const DB_FILE = "./database.json";

const SESSION_DIR = "./session";

let sock = null;

let qrImage = "";

let connectionStatus = "STARTING";

let reconnectTimer = null;

let publicMode = true;

const startedAt = Date.now();

// ==========================================
// DATABASE
// ==========================================

function defaultDB() {
  return {
    settings: {
      owner: OWNER_NUMBER,
      public: true
    },

    users: {},

    groups: {},

    banned: [],

    orders: {},

    premium: {},

    stats: {
      messages: 0,
      commands: 0
    }
  };
}

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const data = defaultDB();

      fs.writeFileSync(
        DB_FILE,
        JSON.stringify(data, null, 2)
      );

      return data;
    }

    const data = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    const base = defaultDB();

    return {
      ...base,
      ...data,

      settings: {
        ...base.settings,
        ...(data.settings || {})
      },

      stats: {
        ...base.stats,
        ...(data.stats || {})
      }
    };
  } catch (error) {
    console.error(
      "DATABASE LOAD ERROR:",
      error.message
    );

    return defaultDB();
  }
}

let db = loadDB();

publicMode =
  db.settings.public !== false;

function saveDB() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.error(
      "DATABASE SAVE ERROR:",
      error.message
    );
  }
}

// ==========================================
// BASIC HELPERS
// ==========================================

function jidNumber(jid = "") {
  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function userJid(number = "") {
  const n = String(number)
    .replace(/\D/g, "");

  return n
    ? `${n}@s.whatsapp.net`
    : "";
}

function isGroup(jid = "") {
  return String(jid)
    .endsWith("@g.us");
}

function getSender(message) {
  return (
    message?.key?.participant ||
    message?.key?.remoteJid ||
    ""
  );
}

function getChat(message) {
  return (
    message?.key?.remoteJid ||
    ""
  );
}

function isOwner(jid = "") {
  const number = jidNumber(jid);

  const owners = [
    OWNER_NUMBER,
    jidNumber(
      db?.settings?.owner || ""
    )
  ].filter(Boolean);

  return owners.includes(number);
}

function isBanned(jid = "") {
  return db.banned.includes(
    jidNumber(jid)
  );
}

function getUser(jid) {
  const number = jidNumber(jid);

  if (!number) return null;

  if (!db.users[number]) {
    db.users[number] = {
      id: number,
      name: "",
      balance: 0,
      limit: 20,
      points: 0,
      premium: false,
      premiumUntil: 0,
      warn: 0,
      afk: null,
      createdAt: Date.now()
    };
  }

  return db.users[number];
}

function getGroup(jid) {
  if (!db.groups[jid]) {
    db.groups[jid] = {
      welcome: false,
      goodbye: false,

      antilink: false,
      antilinkKick: true,

      antibadword: false,
      antibadwordKick: true,

      antibot: false,
      antidelete: false,
      antimentionsw: false,
      antiviewonce: false,

      antiwame: false,
      antiwameKick: true,

      antiluar: false,

      badwords: [],

      warnings: {},

      lists: {},

      points: {},

      reminders: []
    };
  }

  return db.groups[jid];
}

function isPremium(jid) {
  const user = getUser(jid);

  if (!user) return false;

  if (
    user.premiumUntil &&
    user.premiumUntil > Date.now()
  ) {
    return true;
  }

  if (
    user.premiumUntil &&
    user.premiumUntil <= Date.now()
  ) {
    user.premium = false;
    user.premiumUntil = 0;

    saveDB();
  }

  return Boolean(user.premium);
}

function formatRupiah(amount = 0) {
  return (
    "Rp" +
    Number(amount || 0)
      .toLocaleString("id-ID")
  );
}

function formatRuntime(ms) {
  let seconds =
    Math.floor(ms / 1000);

  const days =
    Math.floor(seconds / 86400);

  seconds %= 86400;

  const hours =
    Math.floor(seconds / 3600);

  seconds %= 3600;

  const minutes =
    Math.floor(seconds / 60);

  seconds %= 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function randomId(prefix = "ORD") {
  return (
    `${prefix}-` +
    `${Date.now()}-` +
    `${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`
  );
}

function cleanText(text = "") {
  return String(text).trim();
}

function extractUrl(text = "") {
  const match =
    String(text).match(
      /https?:\/\/[^\s]+/i
    );

  return match
    ? match[0]
    : null;
}

function parseDuration(text = "") {
  const match =
    String(text).match(
      /(\d+)\s*(d|day|hari|h|m|menit|month|bulan)/i
    );

  if (!match) return null;

  const number =
    Number(match[1]);

  const unit =
    match[2].toLowerCase();

  if (
    ["d", "day", "hari"]
      .includes(unit)
  ) {
    return (
      number *
      24 *
      60 *
      60 *
      1000
    );
  }

  if (
    ["m", "menit"]
      .includes(unit)
  ) {
    return (
      number *
      60 *
      1000
    );
  }

  if (
    ["month", "bulan"]
      .includes(unit)
  ) {
    return (
      number *
      30 *
      24 *
      60 *
      60 *
      1000
    );
  }

  return null;
}

// ==========================================
// MESSAGE HELPERS
// ==========================================

function getMessageText(message) {
  if (!message) return "";

  return (
    message.conversation ||

    message.extendedTextMessage
      ?.text ||

    message.imageMessage
      ?.caption ||

    message.videoMessage
      ?.caption ||

    message.documentMessage
      ?.caption ||

    message.buttonsResponseMessage
      ?.selectedButtonId ||

    message.listResponseMessage
      ?.singleSelectReply
      ?.selectedRowId ||

    message.templateButtonReplyMessage
      ?.selectedId ||

    ""
  );
}

function getQuotedMessage(message) {
  return (
    message
      ?.extendedTextMessage
      ?.contextInfo
      ?.quotedMessage ||
    null
  );
}

function getQuotedParticipant(message) {
  return (
    message
      ?.extendedTextMessage
      ?.contextInfo
      ?.participant ||
    null
  );
}

async function sendText(
  jid,
  text,
  options = {}
) {
  if (!sock) return;

  return sock.sendMessage(
    jid,
    {
      text: String(text),
      ...options
    }
  );
}

async function react(
  jid,
  key,
  emoji = "✅"
) {
  try {
    await sock.sendMessage(
      jid,
      {
        react: {
          text: emoji,
          key
        }
      }
    );
  } catch {}
}

async function downloadMedia(
  message,
  type
) {
  const stream =
    await downloadContentFromMessage(
      message,
      type
    );

  const chunks = [];

  for await (
    const chunk of stream
  ) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function getImageBuffer(
  message,
  quoted = false
) {
  let target = message;

  if (quoted) {
    target =
      getQuotedMessage(message);
  }

  if (
    !target?.imageMessage
  ) {
    return null;
  }

  return downloadMedia(
    target.imageMessage,
    "image"
  );
}
// ==========================================
// STORE DATA
// ==========================================

const PRODUCTS = {
  spotify: [
    {
      name: "Spotify Premium",
      duration: "1 Bulan",
      price: 8000
    },
    {
      name: "Spotify Premium",
      duration: "2 Bulan",
      price: 10000
    }
  ],

  netflix: [
    {
      name: "Netflix Premium",
      duration: "1 Bulan",
      price: 8000
    },
    {
      name: "Netflix Premium",
      duration: "2 Bulan",
      price: 10000
    }
  ],

  hoki: [
    {
      name: "Waktu Hoki-Hokian",
      duration: "Paket",
      price: 15000
    }
  ],

  ebook: [
    {
      name: "E-book Belajar Bahasa Inggris",
      duration: "Paket",
      price: 7000
    },
    {
      name: "E-book The Psychology of Money",
      duration: "Paket",
      price: 7000
    }
  ]
};

function productList() {
  let result =
    "🛍️ *ZAZA STORE*\n\n";

  for (
    const [category, products]
    of Object.entries(PRODUCTS)
  ) {
    result +=
      `📦 *${category.toUpperCase()}*\n`;

    for (const product of products) {
      result +=
        `• ${product.name}\n` +
        `  └ ${product.duration} — ` +
        `${formatRupiah(product.price)}\n`;
    }

    result += "\n";
  }

  result +=
    "💳 *Pembayaran*\n" +
    "QRIS / DANA / BANK\n\n" +
    `📌 Ketik ${PREFIX}order ` +
    `nama produk untuk membuat order.`;

  return result;
}

function findProduct(query = "") {
  const search =
    query.toLowerCase().trim();

  if (!search) return null;

  for (
    const [category, products]
    of Object.entries(PRODUCTS)
  ) {
    for (const product of products) {
      const combined =
        `${category} ` +
        `${product.name} ` +
        `${product.duration}`
          .toLowerCase();

      if (
        combined.includes(search) ||
        search.includes(
          category.toLowerCase()
        )
      ) {
        return {
          category,
          ...product
        };
      }
    }
  }

  return null;
}

// ==========================================
// MENU
// ==========================================

function menuText(sender) {
  const status =
    isPremium(sender)
      ? "💎 Premium"
      : "🆓 Free";

  return `
╭━━━〔 🤖 ZAZABOT 〕━━━╮
┃ 👤 Status : ${status}
┃ ⚡ Prefix : ${PREFIX}
┃ 📡 Mode   : ${publicMode ? "Public" : "Self"}
╰━━━━━━━━━━━━━━━━━━━━━━╯

👑 *OWNER*
${PREFIX}owner
${PREFIX}setowner
${PREFIX}public
${PREFIX}self
${PREFIX}bc
${PREFIX}ban
${PREFIX}unban
${PREFIX}listban
${PREFIX}addbalance
${PREFIX}addlimit
${PREFIX}restart

📚 *GENERAL*
${PREFIX}menu
${PREFIX}help
${PREFIX}ping
${PREFIX}runtime
${PREFIX}speed
${PREFIX}botinfo
${PREFIX}profile
${PREFIX}rules
${PREFIX}donate

🤖 *AI*
${PREFIX}ai
${PREFIX}openai
${PREFIX}ask
${PREFIX}translate
${PREFIX}bard
${PREFIX}nexara
${PREFIX}aiimage

🎮 *GAME*
${PREFIX}akinator
${PREFIX}asahotak
${PREFIX}caklontong
${PREFIX}family100
${PREFIX}math
${PREFIX}truth
${PREFIX}dare
${PREFIX}tebak
${PREFIX}tebakkata
${PREFIX}tebakgambar
${PREFIX}susunkata
${PREFIX}stopgame

🎨 *STICKER*
${PREFIX}sticker
${PREFIX}s
${PREFIX}brat
${PREFIX}attp
${PREFIX}ttp
${PREFIX}toimg

🔎 *SEARCH*
${PREFIX}google
${PREFIX}googleimage
${PREFIX}wikipedia
${PREFIX}ytsearch
${PREFIX}lirik

📥 *DOWNLOAD*
${PREFIX}tiktok
${PREFIX}tiktoknowm
${PREFIX}tiktokwm
${PREFIX}igdl
${PREFIX}igreel
${PREFIX}instagram
${PREFIX}facebook
${PREFIX}ytmp3
${PREFIX}ytmp4

👥 *GROUP*
${PREFIX}absen
${PREFIX}add
${PREFIX}kick
${PREFIX}promote
${PREFIX}demote
${PREFIX}tagall
${PREFIX}hidetag
${PREFIX}groupinfo
${PREFIX}cekidgroup
${PREFIX}linkgroup
${PREFIX}setname
${PREFIX}setdesc
${PREFIX}welcome
${PREFIX}welcomeoff
${PREFIX}goodbye
${PREFIX}goodbyeoff

🛡️ *SECURITY*
${PREFIX}antilink
${PREFIX}antilinkoff
${PREFIX}antilinknokick
${PREFIX}antibadword
${PREFIX}antibadwordnokick
${PREFIX}antibot
${PREFIX}antidelete
${PREFIX}antimentionsw
${PREFIX}antiviewonce
${PREFIX}antiwame
${PREFIX}antiwamenokick
${PREFIX}antiluar

⚠️ *WARN*
${PREFIX}warn
${PREFIX}unwarn
${PREFIX}cekwarn
${PREFIX}listwarn
${PREFIX}resetwarn
${PREFIX}tagadmin
${PREFIX}listadmin

📝 *LIST & REMINDER*
${PREFIX}addlist
${PREFIX}updatelist
${PREFIX}uplist
${PREFIX}addpoin
${PREFIX}addreminder
${PREFIX}addalarm
${PREFIX}addbadword
${PREFIX}afk

📅 *SCHEDULE*
${PREFIX}createschedulecall
${PREFIX}cekabsen
${PREFIX}cekpoint
${PREFIX}cekschedule

🛒 *ZAZA STORE*
${PREFIX}produk
${PREFIX}pricelist
${PREFIX}saldo
${PREFIX}balance
${PREFIX}topup
${PREFIX}order
${PREFIX}buy
${PREFIX}beli
${PREFIX}cekorder
${PREFIX}orderstatus
${PREFIX}premium
${PREFIX}cekpremium

🧰 *TOOLS*
${PREFIX}qr
${PREFIX}shortlink
${PREFIX}ss
${PREFIX}tourl
${PREFIX}removebg
${PREFIX}ocr

ℹ️ *INFO*
${PREFIX}ceksewa
${PREFIX}ceksewabyid
${PREFIX}cekowner
${PREFIX}dbinfo

━━━━━━━━━━━━━━━━━━━━━━
💙 *ZAZA STORE*
`.trim();
}

// ==========================================
// COMMAND PERMISSION HELPERS
// ==========================================

function needOwner(sender, reply) {
  if (!isOwner(sender)) {
    reply(
      "❌ Perintah ini khusus owner."
    );

    return false;
  }

  return true;
}

function needGroup(chat, reply) {
  if (!isGroup(chat)) {
    reply(
      "❌ Perintah ini hanya bisa digunakan di grup."
    );

    return false;
  }

  return true;
}

async function getGroupMetadata(chat) {
  try {
    return await sock.groupMetadata(chat);
  } catch {
    return null;
  }
}

async function isBotAdmin(chat) {
  const metadata =
    await getGroupMetadata(chat);

  if (!metadata) return false;

  const botNumber =
    jidNumber(sock.user?.id || "");

  const participant =
    metadata.participants.find(
      p => jidNumber(p.id) === botNumber
    );

  return (
    participant?.admin === "admin" ||
    participant?.admin === "superadmin"
  );
}

async function isAdmin(
  chat,
  sender
) {
  const metadata =
    await getGroupMetadata(chat);

  if (!metadata) return false;

  const participant =
    metadata.participants.find(
      p =>
        jidNumber(p.id) ===
        jidNumber(sender)
    );

  return (
    participant?.admin === "admin" ||
    participant?.admin === "superadmin"
  );
}

async function needAdmin(
  chat,
  sender,
  reply
) {
  if (
    !await isAdmin(
      chat,
      sender
    )
  ) {
    reply(
      "❌ Perintah ini khusus admin grup."
    );

    return false;
  }

  return true;
}

async function needBotAdmin(
  chat,
  reply
) {
  if (
    !await isBotAdmin(chat)
  ) {
    reply(
      "❌ Jadikan bot sebagai admin terlebih dahulu."
    );

    return false;
  }

  return true;
}

// ==========================================
// TARGET USER
// ==========================================

function targetFromMessage(
  message,
  args = []
) {
  const mentioned =
    message
      ?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid || [];

  if (mentioned.length) {
    return mentioned[0];
  }

  const quoted =
    getQuotedParticipant(
      message?.message
    );

  if (quoted) {
    return quoted;
  }

  const number =
    String(args[0] || "")
      .replace(/\D/g, "");

  if (number) {
    return userJid(number);
  }

  return null;
}

// ==========================================
// GAME DATA
// ==========================================

const riddles = [
  [
    "Aku punya gigi tetapi tidak bisa makan. Aku apa?",
    "sisir"
  ],
  [
    "Semakin diisi semakin ringan. Aku apa?",
    "balon"
  ],
  [
    "Aku punya kaki tetapi tidak bisa berjalan.",
    "meja"
  ],
  [
    "Aku selalu mengikuti kamu tetapi tidak pernah mendahului.",
    "bayangan"
  ],
  [
    "Aku punya wajah dan dua tangan tetapi tidak punya kaki.",
    "jam"
  ]
];

const wordGames = [
  [
    "KOMPUTER",
    "komputer"
  ],
  [
    "WHATSAPP",
    "whatsapp"
  ],
  [
    "INTERNET",
    "internet"
  ],
  [
    "INDONESIA",
    "indonesia"
  ],
  [
    "TEKNOLOGI",
    "teknologi"
  ]
];

const gameSessions =
  new Map();

function startGame(
  chat,
  question,
  answer,
  type = "game"
) {
  gameSessions.set(
    chat,
    {
      type,
      question,
      answer:
        String(answer)
          .toLowerCase(),
      startedAt:
        Date.now()
    }
  );
}

function stopGame(chat) {
  gameSessions.delete(chat);
}

// ==========================================
// STICKER HELPERS
// ==========================================

async function makeStaticSticker(
  buffer
) {
  return sharp(buffer)
    .resize(512, 512, {
      fit: "contain",
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    })
    .webp()
    .toBuffer();
}

async function textSticker(
  text,
  background = "#ffffff",
  foreground = "#111111"
) {
  const safe =
    String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .slice(0, 100);

  const svg = `
  <svg
    width="512"
    height="512"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      width="512"
      height="512"
      rx="60"
      fill="${background}"
    />

    <text
      x="256"
      y="256"
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="Arial"
      font-size="42"
      font-weight="bold"
      fill="${foreground}"
    >
      ${safe}
    </text>
  </svg>
  `;

  return sharp(
    Buffer.from(svg)
  )
    .webp()
    .toBuffer();
}

// ==========================================
// QR
// ==========================================

async function sendQR(
  chat,
  text
) {
  const buffer =
    await QRCode.toBuffer(
      text,
      {
        width: 700,
        margin: 2
      }
    );

  return sock.sendMessage(
    chat,
    {
      image: buffer,
      caption:
        "✅ QR berhasil dibuat."
    }
  );
}

// ==========================================
// SEARCH HELPERS
// ==========================================

function googleSearch(
  query
) {
  return (
    "https://www.google.com/search?q=" +
    encodeURIComponent(query)
  );
}

function googleImageSearch(
  query
) {
  return (
    "https://www.google.com/search?tbm=isch&q=" +
    encodeURIComponent(query)
  );
}

function youtubeSearch(
  query
) {
  return (
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(query)
  );
}

function wikipediaSearch(
  query
) {
  return (
    "https://id.wikipedia.org/w/index.php?search=" +
    encodeURIComponent(query)
  );
}

function lyricSearch(
  query
) {
  return (
    "https://www.google.com/search?q=" +
    encodeURIComponent(
      `${query} lyrics`
    )
  );
}

async function tinyUrl(url) {
  const response =
    await fetch(
      "https://tinyurl.com/api-create.php?url=" +
      encodeURIComponent(url)
    );

  if (!response.ok) {
    throw new Error(
      "Shortlink gagal"
    );
  }

  return response.text();
}

// ==========================================
// AI
// ==========================================

async function openAI(
  prompt
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return (
      "⚠️ OPENAI_API_KEY belum dipasang " +
      "di environment hosting."
    );
  }

  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "Authorization":
            `Bearer ${apiKey}`
        },

        body: JSON.stringify({
          model:
            process.env.OPENAI_MODEL ||
            "gpt-4.1-mini",

          input: prompt
        })
      }
    );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      errorText.slice(0, 500)
    );
  }

  const data =
    await response.json();

  if (data.output_text) {
    return data.output_text;
  }

  const texts = [];

  for (
    const item of
    data.output || []
  ) {
    for (
      const content of
      item.content || []
    ) {
      if (content.text) {
        texts.push(
          content.text
        );
      }
    }
  }

  return (
    text s.join("\n") ||
    "AI tidak memberikan jawaban."
  );
    }
// ==========================================
// COMMAND HANDLER
// ==========================================

async function handleCommand(
  message,
  command,
  args,
  text
) {
  const chat =
    getChat(message);

  const sender =
    getSender(message);

  const reply = (
    content,
    options = {}
  ) => {
    return sendText(
      chat,
      content,
      options
    );
  };

  const user =
    getUser(sender);

  db.stats.commands++;

  // ========================================
  // GENERAL
  // ========================================

  if (
    command === "menu" ||
    command === "help"
  ) {
    return reply(
      menuText(sender)
    );
  }

  if (command === "ping") {
    const start =
      Date.now();

    await reply(
      "🏓 Pong..."
    );

    return reply(
      `⚡ Response: ${
        Date.now() - start
      } ms`
    );
  }

  if (command === "speed") {
    return reply(
      `⚡ Speed: ${
        Date.now() - startedAt
      } ms sejak bot start.`
    );
  }

  if (command === "runtime") {
    return reply(
      `⏱️ Runtime: ${
        formatRuntime(
          Date.now() - startedAt
        )
      }`
    );
  }

  if (command === "botinfo") {
    return reply(
      `🤖 *${BOT_NAME}*\n\n` +
      `📡 Status: ${connectionStatus}\n` +
      `🔓 Mode: ${
        publicMode
          ? "Public"
          : "Self"
      }\n` +
      `👤 Users: ${
        Object.keys(
          db.users
        ).length
      }\n` +
      `👥 Groups: ${
        Object.keys(
          db.groups
        ).length
      }\n` +
      `📦 Orders: ${
        Object.keys(
          db.orders
        ).length
      }\n` +
      `💬 Messages: ${
        db.stats.messages
      }\n` +
      `⚡ Commands: ${
        db.stats.commands
      }`
    );
  }

  if (command === "profile") {
    return reply(
      `👤 *PROFILE*\n\n` +
      `📱 Nomor: ${jidNumber(sender)}\n` +
      `💰 Saldo: ${formatRupiah(
        user.balance
      )}\n` +
      `⚡ Limit: ${user.limit}\n` +
      `⭐ Poin: ${
        user.points || 0
      }\n` +
      `💎 Premium: ${
        isPremium(sender)
          ? "Ya"
          : "Tidak"
      }\n` +
      `⚠️ Warn: ${
        user.warn || 0
      }`
    );
  }

  if (command === "rules") {
    return reply(
      `📜 *RULES ZAZABOT*\n\n` +
      `1. Jangan spam bot.\n` +
      `2. Jangan kirim konten ilegal.\n` +
      `3. Jangan menyalahgunakan fitur bot.\n` +
      `4. Hormati admin grup.\n` +
      `5. Gunakan bot dengan bijak.\n` +
      `6. Transaksi Zaza Store sesuai ketentuan.`
    );
  }

  if (command === "donate") {
    return reply(
      `💙 *DONATE ${BOT_NAME}*\n\n` +
      `Terima kasih telah mendukung ZazaBot.\n\n` +
      `💳 Pembayaran:\n` +
      `QRIS / DANA / BANK\n\n` +
      `👑 Owner:\n` +
      `wa.me/${OWNER_NUMBER}`
    );
  }

  // ========================================
  // OWNER
  // ========================================

  if (command === "owner") {
    return reply(
      `👑 *OWNER ZAZABOT*\n\n` +
      `📱 wa.me/${OWNER_NUMBER}`
    );
  }

  if (command === "cekowner") {
    return reply(
      `👑 Owner tersimpan:\n` +
      `${db.settings.owner ||
        OWNER_NUMBER}`
    );
  }

  if (command === "setowner") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    const target =
      targetFromMessage(
        message,
        args
      );

    if (!target) {
      return reply(
        `Contoh:\n${PREFIX}setowner 628xxxx`
      );
    }

    db.settings.owner =
      jidNumber(target);

    saveDB();

    return reply(
      `✅ Owner berhasil diubah.\n\n` +
      `👑 Owner baru:\n` +
      `${db.settings.owner}`
    );
  }

  if (command === "public") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    publicMode = true;

    db.settings.public =
      true;

    saveDB();

    return reply(
      "✅ Bot sekarang dalam mode PUBLIC."
    );
  }

  if (command === "self") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    publicMode = false;

    db.settings.public =
      false;

    saveDB();

    return reply(
      "🔒 Bot sekarang dalam mode SELF.\n" +
      "Hanya owner yang dapat menggunakan command."
    );
  }

  if (command === "ban") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    const target =
      targetFromMessage(
        message,
        args
      );

    if (!target) {
      return reply(
        `Contoh:\n${PREFIX}ban 628xxxx`
      );
    }

    const number =
      jidNumber(target);

    if (
      !db.banned.includes(
        number
      )
    ) {
      db.banned.push(
        number
      );
    }

    saveDB();

    return reply(
      `🚫 Nomor ${number} berhasil dibanned.`
    );
  }

  if (command === "unban") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    const target =
      targetFromMessage(
        message,
        args
      );

    if (!target) {
      return reply(
        `Contoh:\n${PREFIX}unban 628xxxx`
      );
    }

    const number =
      jidNumber(target);

    db.banned =
      db.banned.filter(
        item =>
          item !== number
      );

    saveDB();

    return reply(
      `✅ Nomor ${number} berhasil di-unban.`
    );
  }

  if (command === "listban") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    if (!db.banned.length) {
      return reply(
        "✅ Tidak ada nomor yang dibanned."
      );
    }

    return reply(
      `🚫 *LIST BANNED*\n\n` +
      db.banned
        .map(
          (number, index) =>
            `${index + 1}. ${number}`
        )
        .join("\n")
    );
  }

  if (command === "addbalance") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    const target =
      targetFromMessage(
        message,
        args
      );

    const amount =
      Number(
        args.find(
          item =>
            /^\d+$/.test(item)
        ) || 0
      );

    if (
      !target ||
      !amount
    ) {
      return reply(
        `Contoh:\n${PREFIX}addbalance 628xxxx 10000`
      );
    }

    const targetUser =
      getUser(target);

    targetUser.balance +=
      amount;

    saveDB();

    return reply(
      `✅ Saldo berhasil ditambahkan.\n\n` +
      `👤 ${jidNumber(target)}\n` +
      `💰 +${formatRupiah(amount)}\n` +
      `💳 Total: ${formatRupiah(
        targetUser.balance
      )}`
    );
  }

  if (command === "addlimit") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    const target =
      targetFromMessage(
        message,
        args
      );

    const amount =
      Number(
        args.find(
          item =>
            /^\d+$/.test(item)
        ) || 0
      );

    if (
      !target ||
      !amount
    ) {
      return reply(
        `Contoh:\n${PREFIX}addlimit 628xxxx 10`
      );
    }

    const targetUser =
      getUser(target);

    targetUser.limit +=
      amount;

    saveDB();

    return reply(
      `✅ Limit berhasil ditambahkan.\n\n` +
      `👤 ${jidNumber(target)}\n` +
      `⚡ +${amount}\n` +
      `📊 Total: ${targetUser.limit}`
    );
  }

  if (command === "bc") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    const broadcast =
      args.join(" ").trim();

    if (!broadcast) {
      return reply(
        `Contoh:\n${PREFIX}bc Halo semua`
      );
    }

    let sent = 0;

    for (
      const number
      of Object.keys(db.users)
    ) {
      try {
        await sendText(
          userJid(number),
          `📢 *BROADCAST ZAZABOT*\n\n${broadcast}`
        );

        sent++;
      } catch {}
    }

    return reply(
      `✅ Broadcast selesai.\n` +
      `📨 Terkirim: ${sent} user`
    );
  }

  if (command === "restart") {
    if (
      !needOwner(
        sender,
        reply
      )
    ) return;

    await reply(
      "♻️ Bot akan melakukan restart..."
    );

    setTimeout(
      () => process.exit(0),
      1000
    );

    return;
  }

  // ========================================
  // ZAZA STORE
  // ========================================

  if (
    command === "produk" ||
    command === "pricelist"
  ) {
    return reply(
      productList()
    );
  }

  if (
    command === "saldo" ||
    command === "balance"
  ) {
    return reply(
      `💰 *SALDO KAMU*\n\n` +
      `${formatRupiah(
        user.balance
      )}`
    );
  }

  if (command === "topup") {
    return reply(
      `💳 *TOP UP SALDO*\n\n` +
      `Silakan hubungi owner untuk instruksi pembayaran.\n\n` +
      `👑 Owner:\n` +
      `wa.me/${OWNER_NUMBER}`
    );
  }

  if (
    command === "order" ||
    command === "buy" ||
    command === "beli"
  ) {
    const query =
      args.join(" ").trim();

    if (!query) {
      return reply(
        `🛒 *CARA ORDER*\n\n` +
        `Contoh:\n` +
        `${PREFIX}order spotify 1 bulan\n\n` +
        productList()
      );
    }

    const product =
      findProduct(query);

    if (!product) {
      return reply(
        "❌ Produk tidak ditemukan.\n\n" +
        `Ketik ${PREFIX}produk untuk melihat produk.`
      );
    }

    if (
      user.balance <
      product.price
    ) {
      return reply(
        `❌ *SALDO TIDAK CUKUP*\n\n` +
        `📦 Produk: ${product.name}\n` +
        `⏱️ Durasi: ${product.duration}\n` +
        `💰 Harga: ${formatRupiah(
          product.price
        )}\n` +
        `💳 Saldo: ${formatRupiah(
          user.balance
        )}`
      );
    }

    user.balance -=
      product.price;

    const orderId =
      randomId("ORD");

    db.orders[orderId] = {
      id: orderId,

      user:
        jidNumber(sender),

      product: product,

      status:
        "paid",

      createdAt:
        Date.now()
    };

    saveDB();

    return reply(
      `✅ *ORDER BERHASIL*\n\n` +
      `🆔 ID: ${orderId}\n` +
      `📦 Produk: ${product.name}\n` +
      `⏱️ Durasi: ${product.duration}\n` +
      `💰 Harga: ${formatRupiah(
        product.price
      )}\n` +
      `📌 Status: PAID\n\n` +
      `⏳ Silakan tunggu proses dari owner.`
    );
  }

  if (
    command === "cekorder" ||
    command === "orderstatus"
  ) {
    const id =
      args[0];

    if (id) {
      const order =
        db.orders[id];

      if (!order) {
        return reply(
          "❌ Order tidak ditemukan."
        );
      }

      return reply(
        `📦 *DETAIL ORDER*\n\n` +
        `🆔 ID: ${order.id}\n` +
        `📦 Produk: ${order.product.name}\n` +
        `⏱️ Durasi: ${order.product.duration}\n` +
        `💰 Harga: ${formatRupiah(
          order.product.price
        )}\n` +
        `📌 Status: ${order.status}`
      );
    }

    const orders =
      Object.values(
        db.orders
      )
      .filter(
        order =>
          order.user ===
          jidNumber(sender)
      )
      .slice(-10);

    if (!orders.length) {
      return reply(
        "📦 Kamu belum memiliki order."
      );
    }

    return reply(
      `📦 *ORDER KAMU*\n\n` +
      orders
        .map(
          order =>
            `🆔 ${order.id}\n` +
            `📦 ${order.product.name}\n` +
            `💰 ${formatRupiah(
              order.product.price
            )}\n` +
            `📌 ${order.status}`
        )
        .join("\n\n")
    );
  }

  if (command === "premium") {
    const duration =
      parseDuration(
        args.join(" ")
      ) ||
      30 *
      24 *
      60 *
      60 *
      1000;

    const price =
      15000;

    if (
      user.balance <
      price
    ) {
      return reply(
        `❌ Saldo tidak cukup.\n\n` +
        `💎 Harga Premium: ${formatRupiah(
          price
        )}\n` +
        `💰 Saldo kamu: ${formatRupiah(
          user.balance
        )}`
      );
    }

    user.balance -=
      price;

    user.premium =
      true;

    user.premiumUntil =
      Math.max(
        Date.now(),
        user.premiumUntil || 0
      ) + duration;

    saveDB();

    return reply(
      `💎 *PREMIUM AKTIF*\n\n` +
      `📅 Berlaku sampai:\n` +
      `${new Date(
        user.premiumUntil
      ).toLocaleString(
        "id-ID"
      )}`
    );
  }

  if (
    command === "cekpremium"
  ) {
    if (
      isPremium(sender)
    ) {
      return reply(
        `💎 *PREMIUM AKTIF*\n\n` +
        `📅 Sampai:\n` +
        `${new Date(
          user.premiumUntil
        ).toLocaleString(
          "id-ID"
        )}`
      );
    }

    return reply(
      "❌ Kamu belum memiliki Premium."
    );
  }

  // ========================================
  // AI
  // ========================================

  if (
    [
      "ai",
      "openai",
      "ask",
      "bard",
      "nexara"
    ].includes(command)
  ) {
    const prompt =
      args.join(" ").trim();

    if (!prompt) {
      return reply(
        `Contoh:\n${PREFIX}${command} jelaskan AI`
      );
    }

    try {
      const answer =
        await openAI(prompt);

      return reply(
        `🤖 *AI ZAZABOT*\n\n${answer}`
      );
    } catch (error) {
      return reply(
        `❌ AI Error:\n${error.message}`
      );
    }
  }

  if (command === "translate") {
    const data =
      args.join(" ")
        .split("|");

    const language =
      (
        data[0] ||
        "en"
      ).trim();

    const source =
      data
        .slice(1)
        .join("|")
        .trim();

    if (!source) {
      return reply(
        `Contoh:\n${PREFIX}translate en | saya suka belajar`
      );
    }

    try {
      const url =
        "https://translate.googleapis.com/" +
        "translate_a/single" +
        "?client=gtx" +
        "&sl=auto" +
        `&tl=${encodeURIComponent(
          language
        )}` +
        "&dt=t" +
        `&q=${encodeURIComponent(
          source
        )}`;

      const response =
        await fetch(url);

      const data =
        await response.json();

      const result =
        (data[0] || [])
          .map(
            item => item[0]
          )
          .join("");

      return reply(
        `🌐 *TRANSLATE*\n\n${result}`
      );
    } catch {
      return reply(
        "❌ Translate gagal."
      );
    }
  }

  if (command === "aiimage") {
    return reply(
      `🖼️ *AI IMAGE*\n\n` +
      `Fitur ini membutuhkan API image generation.\n` +
      `Tambahkan provider/API terlebih dahulu.`
    );
}
    // ========================================
  // SEARCH
  // ========================================

  if (command === "google") {
    const query =
      args.join(" ").trim();

    if (!query) {
      return reply(
        `Contoh:\n${PREFIX}google Zaza Store`
      );
    }

    return reply(
      `🔎 *GOOGLE SEARCH*\n\n` +
      googleSearch(query)
    );
  }

  if (command === "googleimage") {
    const query =
      args.join(" ").trim();

    if (!query) {
      return reply(
        `Contoh:\n${PREFIX}googleimage kucing`
      );
    }

    return reply(
      `🖼️ *GOOGLE IMAGE*\n\n` +
      googleImageSearch(query)
    );
  }

  if (command === "wikipedia") {
    const query =
      args.join(" ").trim();

    if (!query) {
      return reply(
        `Contoh:\n${PREFIX}wikipedia Indonesia`
      );
    }

    return reply(
      `📚 *WIKIPEDIA*\n\n` +
      wikipediaSearch(query)
    );
  }

  if (command === "ytsearch") {
    const query =
      args.join(" ").trim();

    if (!query) {
      return reply(
        `Contoh:\n${PREFIX}ytsearch lagu Indonesia`
      );
    }

    return reply(
      `▶️ *YOUTUBE SEARCH*\n\n` +
      youtubeSearch(query)
    );
  }

  if (command === "lirik") {
    const query =
      args.join(" ").trim();

    if (!query) {
      return reply(
        `Contoh:\n${PREFIX}lirik judul lagu`
      );
    }

    return reply(
      `🎵 *PENCARIAN LIRIK*\n\n` +
      lyricSearch(query)
    );
  }

  // ========================================
  // DOWNLOAD
  // ========================================

  if (
    [
      "tiktok",
      "tiktoknowm",
      "tiktokwm",
      "igdl",
      "igreel",
      "instagram",
      "facebook",
      "ytmp3",
      "ytmp4"
    ].includes(command)
  ) {
    const url =
      extractUrl(
        args.join(" ")
      );

    if (!url) {
      return reply(
        `Contoh:\n${PREFIX}${command} https://contoh.com/video`
      );
    }

    return reply(
      `🔗 *LINK DITERIMA*\n\n` +
      `${url}\n\n` +
      `⚠️ Downloader otomatis belum terhubung ke provider/API downloader.\n\n` +
      `Untuk mengirim file video/audio secara otomatis, ` +
      `fitur ini perlu dihubungkan ke API downloader.`
    );
  }

  // ========================================
  // STICKER
  // ========================================

  if (
    command === "sticker" ||
    command === "s"
  ) {
    const image =
      await getImageBuffer(
        message,
        false
      ) ||
      await getImageBuffer(
        message,
        true
      );

    if (!image) {
      return reply(
        `🖼️ Kirim atau reply gambar dengan caption:\n` +
        `${PREFIX}sticker`
      );
    }

    try {
      const sticker =
        await makeStaticSticker(
          image
        );

      return sock.sendMessage(
        chat,
        {
          sticker
        }
      );
    } catch (error) {
      return reply(
        `❌ Gagal membuat sticker:\n${error.message}`
      );
    }
  }

  if (command === "toimg") {
    const quoted =
      getQuotedMessage(
        message
      );

    if (
      !quoted?.stickerMessage
    ) {
      return reply(
        `Reply sticker dengan:\n${PREFIX}toimg`
      );
    }

    try {
      const buffer =
        await downloadMedia(
          quoted.stickerMessage,
          "sticker"
        );

      const image =
        await sharp(buffer)
          .png()
          .toBuffer();

      return sock.sendMessage(
        chat,
        {
          image,
          caption:
            "✅ Sticker berhasil diubah menjadi gambar."
        }
      );
    } catch (error) {
      return reply(
        `❌ Sticker tidak dapat dikonversi.\n${error.message}`
      );
    }
  }

  if (
    [
      "brat",
      "ttp",
      "attp"
    ].includes(command)
  ) {
    const content =
      args.join(" ").trim();

    if (!content) {
      return reply(
        `Contoh:\n${PREFIX}${command} Zaza Store`
      );
    }

    try {
      let background =
        "#ffffff";

      let foreground =
        "#111111";

      if (
        command === "brat"
      ) {
        background =
          "#ffffff";
      }

      if (
        command === "ttp"
      ) {
        background =
          "#87ceeb";
      }

      if (
        command === "attp"
      ) {
        background =
          "#87ceeb";
      }

      const sticker =
        await textSticker(
          content,
          background,
          foreground
        );

      return sock.sendMessage(
        chat,
        {
          sticker
        }
      );
    } catch (error) {
      return reply(
        `❌ Gagal membuat sticker:\n${error.message}`
      );
    }
  }

  // ========================================
  // TOOLS
  // ========================================

  if (command === "qr") {
    const content =
      args.join(" ").trim();

    if (!content) {
      return reply(
        `Contoh:\n${PREFIX}qr Zaza Store`
      );
    }

    try {
      return await sendQR(
        chat,
        content
      );
    } catch {
      return reply(
        "❌ QR gagal dibuat."
      );
    }
  }

  if (command === "shortlink") {
    const url =
      extractUrl(
        args.join(" ")
      );

    if (!url) {
      return reply(
        `Contoh:\n${PREFIX}shortlink https://google.com`
      );
    }

    try {
      const short =
        await tinyUrl(url);

      return reply(
        `🔗 *SHORTLINK*\n\n${short}`
      );
    } catch {
      return reply(
        "❌ Shortlink gagal dibuat."
      );
    }
  }

  if (command === "ss") {
    const url =
      extractUrl(
        args.join(" ")
      );

    if (!url) {
      return reply(
        `Contoh:\n${PREFIX}ss https://example.com`
      );
    }

    return reply(
      `🌐 URL:\n${url}\n\n` +
      `⚠️ Screenshot website membutuhkan screenshot API/provider.`
    );
  }

  if (command === "tourl") {
    return reply(
      `⚠️ ${PREFIX}tourl membutuhkan layanan upload file/provider agar media dapat diubah menjadi URL.`
    );
  }

  if (command === "removebg") {
    return reply(
      `⚠️ ${PREFIX}removebg membutuhkan API Remove Background.`
    );
  }

  if (command === "ocr") {
    return reply(
      `⚠️ ${PREFIX}ocr membutuhkan OCR provider/API.`
    );
  }

  // ========================================
  // GROUP COMMAND CHECK
  // ========================================

  const groupCommands = [
    "absen",
    "add",
    "kick",
    "promote",
    "demote",
    "tagall",
    "hidetag",
    "groupinfo",
    "cekidgroup",
    "linkgroup",
    "setname",
    "setdesc",
    "welcome",
    "welcomeoff",
    "goodbye",
    "goodbyeoff",

    "antilink",
    "antilinkoff",
    "antilinknokick",

    "antibadword",
    "antibadwordnokick",

    "antibot",
    "antidelete",
    "antimentionsw",
    "antiviewonce",

    "antiwame",
    "antiwamenokick",
    "antiluar",

    "warn",
    "unwarn",
    "cekwarn",
    "listwarn",
    "resetwarn",

    "tagadmin",
    "listadmin"
  ];

  if (
    groupCommands.includes(
      command
    )
  ) {
    if (
      !needGroup(
        chat,
        reply
      )
    ) {
      return;
    }
  }

  // ========================================
  // GROUP INFO
  // ========================================

  if (
    command === "groupinfo"
  ) {
    const metadata =
      await getGroupMetadata(
        chat
      );

    if (!metadata) {
      return reply(
        "❌ Gagal mengambil informasi grup."
      );
    }

    return reply(
      `👥 *GROUP INFO*\n\n` +
      `📛 Nama: ${metadata.subject}\n` +
      `🆔 ID: ${chat}\n` +
      `👤 Member: ${metadata.participants.length}\n` +
      `📅 Dibuat: ${
        metadata.creation
          ? new Date(
              metadata.creation * 1000
            ).toLocaleString(
              "id-ID"
            )
          : "-"
      }`
    );
  }

  if (
    command === "cekidgroup"
  ) {
    return reply(
      `🆔 *ID GROUP*\n\n${chat}`
    );
  }

  if (
    command === "linkgroup"
  ) {
    if (
      !await needBotAdmin(
        chat,
        reply
      )
    ) {
      return;
    }

    try {
      const code =
        await sock.groupInviteCode(
          chat
        );

      return reply(
        `🔗 *LINK GROUP*\n\n` +
        `https://chat.whatsapp.com/${code}`
      );
    } catch {
      return reply(
        "❌ Gagal mengambil link grup."
      );
    }
  }

  // ========================================
  // ADMIN LIST
  // ========================================

  if (
    command === "listadmin"
  ) {
    const metadata =
      await getGroupMetadata(
        chat
      );

    if (!metadata) {
      return reply(
        "❌ Gagal mengambil data admin."
      );
    }

    const admins =
      metadata.participants.filter(
        participant =>
          participant.admin ===
            "admin" ||
          participant.admin ===
            "superadmin"
      );

    if (!admins.length) {
      return reply(
        "❌ Admin tidak ditemukan."
      );
    }

    const mentions =
      admins.map(
        participant =>
          participant.id
      );

    const text =
      admins
        .map(
          (participant, index) =>
            `${index + 1}. @${jidNumber(
              participant.id
            )}`
        )
        .join("\n");

    return reply(
      `👮 *LIST ADMIN*\n\n${text}`,
      {
        mentions
      }
    );
  }

  if (
    command === "tagadmin"
  ) {
    const metadata =
      await getGroupMetadata(
        chat
      );

    if (!metadata) {
      return reply(
        "❌ Gagal mengambil data admin."
      );
    }

    const admins =
      metadata.participants.filter(
        participant =>
          participant.admin ===
            "admin" ||
          participant.admin ===
            "superadmin"
      );

    const mentions =
      admins.map(
        participant =>
          participant.id
      );

    return reply(
      `📢 *ADMIN GROUP*\n\n` +
      admins
        .map(
          participant =>
            `@${jidNumber(
              participant.id
            )}`
        )
        .join(" "),
      {
        mentions
      }
    );
  }

  // ========================================
  // WELCOME / GOODBYE
  // ========================================

  if (
    [
      "welcome",
      "welcomeoff",
      "goodbye",
      "goodbyeoff"
    ].includes(command)
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    if (
      command === "welcome"
    ) {
      group.welcome = true;
    }

    if (
      command === "welcomeoff"
    ) {
      group.welcome = false;
    }

    if (
      command === "goodbye"
    ) {
      group.goodbye = true;
    }

    if (
      command === "goodbyeoff"
    ) {
      group.goodbye = false;
    }

    saveDB();

    return reply(
      `✅ ${command} berhasil diatur.`
    );
  }
    // ========================================
  // SECURITY
  // ========================================

  if (
    [
      "antilink",
      "antilinkoff",
      "antilinknokick"
    ].includes(command)
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    if (
      command === "antilink"
    ) {
      group.antilink = true;
      group.antilinkKick = true;
    }

    if (
      command === "antilinkoff"
    ) {
      group.antilink = false;
    }

    if (
      command === "antilinknokick"
    ) {
      group.antilink = true;
      group.antilinkKick = false;
    }

    saveDB();

    return reply(
      `🛡️ *ANTILINK*\n\n` +
      `Status: ${
        group.antilink
          ? "ON"
          : "OFF"
      }\n` +
      `Kick: ${
        group.antilinkKick
          ? "ON"
          : "OFF"
      }`
    );
  }

  // ========================================
  // ANTIBADWORD
  // ========================================

  if (
    [
      "antibadword",
      "antibadwordnokick"
    ].includes(command)
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    group.antibadword =
      true;

    group.antibadwordKick =
      command ===
      "antibadword";

    saveDB();

    return reply(
      `🛡️ *ANTIBADWORD*\n\n` +
      `Status: ON\n` +
      `Kick: ${
        group.antibadwordKick
          ? "ON"
          : "OFF"
      }`
    );
  }

  // ========================================
  // ADD BADWORD
  // ========================================

  if (
    command === "addbadword"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const word =
      args.join(" ")
        .trim()
        .toLowerCase();

    if (!word) {
      return reply(
        `Contoh:\n${PREFIX}addbadword kata`
      );
    }

    const group =
      getGroup(chat);

    if (
      !group.badwords.includes(
        word
      )
    ) {
      group.badwords.push(
        word
      );
    }

    saveDB();

    return reply(
      `✅ Kata terlarang berhasil ditambahkan:\n` +
      `"${word}"`
    );
  }

  // ========================================
  // ANTIBOT
  // ========================================

  if (
    command === "antibot"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    group.antibot = true;

    saveDB();

    return reply(
      "🤖 Antibot berhasil diaktifkan."
    );
  }

  // ========================================
  // ANTIDELETE
  // ========================================

  if (
    command === "antidelete"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    group.antidelete = true;

    saveDB();

    return reply(
      "🛡️ Antidelete berhasil diaktifkan."
    );
  }

  // ========================================
  // ANTIMENTIONSW
  // ========================================

  if (
    command === "antimentionsw"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    group.antimentionsw =
      true;

    saveDB();

    return reply(
      "🛡️ Antimentionsw berhasil diaktifkan."
    );
  }

  // ========================================
  // ANTIVIEWONCE
  // ========================================

  if (
    command === "antiviewonce"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    group.antiviewonce =
      true;

    saveDB();

    return reply(
      "🛡️ Antiviewonce berhasil diaktifkan."
    );
  }

  // ========================================
  // ANTIWAME
  // ========================================

  if (
    command === "antiwame" ||
    command === "antiwamenokick"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    group.antiwame =
      true;

    group.antiwameKick =
      command === "antiwame";

    saveDB();

    return reply(
      `🛡️ *ANTIWAME*\n\n` +
      `Status: ON\n` +
      `Kick: ${
        group.antiwameKick
          ? "ON"
          : "OFF"
      }`
    );
  }

  // ========================================
  // ANTILUAR
  // ========================================

  if (
    command === "antiluar"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    group.antiluar =
      true;

    saveDB();

    return reply(
      "🛡️ Antiluar berhasil diaktifkan."
    );
  }

  // ========================================
  // ADD / KICK / PROMOTE / DEMOTE
  // ========================================

  if (
    [
      "add",
      "kick",
      "promote",
      "demote"
    ].includes(command)
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    if (
      !await needBotAdmin(
        chat,
        reply
      )
    ) {
      return;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    if (!target) {
      return reply(
        `❌ Tag/reply nomor target.\n\n` +
        `Contoh:\n` +
        `${PREFIX}${command} @628xxxx`
      );
    }

    try {
      let action;

      if (
        command === "add"
      ) {
        action = "add";
      }

      if (
        command === "kick"
      ) {
        action = "remove";
      }

      if (
        command === "promote"
      ) {
        action = "promote";
      }

      if (
        command === "demote"
      ) {
        action = "demote";
      }

      await sock.groupParticipantsUpdate(
        chat,
        [target],
        action
      );

      return reply(
        `✅ Perintah *${command}* berhasil dijalankan untuk @${jidNumber(target)}.`,
        {
          mentions: [target]
        }
      );
    } catch (error) {
      return reply(
        `❌ Gagal menjalankan ${command}.\n\n` +
        `${error.message}`
      );
    }
  }

  // ========================================
  // TAG ALL / HIDETAG
  // ========================================

  if (
    command === "tagall" ||
    command === "hidetag"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const metadata =
      await getGroupMetadata(
        chat
      );

    if (!metadata) {
      return reply(
        "❌ Gagal mengambil member grup."
      );
    }

    const mentions =
      metadata.participants
        .map(
          participant =>
            participant.id
        );

    const messageText =
      args.join(" ").trim() ||
      "📢 Perhatian semua member!";

    const tagged =
      mentions
        .map(
          participant =>
            `@${jidNumber(
              participant
            )}`
        )
        .join(" ");

    return reply(
      `${messageText}\n\n${tagged}`,
      {
        mentions
      }
    );
  }

  // ========================================
  // SET GROUP NAME
  // ========================================

  if (
    command === "setname"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    if (
      !await needBotAdmin(
        chat,
        reply
      )
    ) {
      return;
    }

    const name =
      args.join(" ").trim();

    if (!name) {
      return reply(
        `Contoh:\n${PREFIX}setname Zaza Store`
      );
    }

    try {
      await sock.groupUpdateSubject(
        chat,
        name
      );

      return reply(
        `✅ Nama grup berhasil diubah menjadi:\n${name}`
      );
    } catch (error) {
      return reply(
        `❌ Gagal mengubah nama grup.\n${error.message}`
      );
    }
  }

  // ========================================
  // SET GROUP DESCRIPTION
  // ========================================

  if (
    command === "setdesc"
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    if (
      !await needBotAdmin(
        chat,
        reply
      )
    ) {
      return;
    }

    const description =
      args.join(" ").trim();

    if (!description) {
      return reply(
        `Contoh:\n${PREFIX}setdesc Grup Zaza Store`
      );
    }

    try {
      await sock.groupUpdateDescription(
        chat,
        description
      );

      return reply(
        "✅ Deskripsi grup berhasil diubah."
      );
    } catch (error) {
      return reply(
        `❌ Gagal mengubah deskripsi grup.\n${error.message}`
      );
    }
  }

  // ========================================
  // WARN SYSTEM
  // ========================================

  if (
    [
      "warn",
      "unwarn",
      "cekwarn",
      "listwarn",
      "resetwarn"
    ].includes(command)
  ) {
    if (
      !await needAdmin(
        chat,
        sender,
        reply
      )
    ) {
      return;
    }

    const group =
      getGroup(chat);

    // --------------------------------------
    // WARN
    // --------------------------------------

    if (
      command === "warn"
    ) {
      const target =
        targetFromMessage(
          message,
          args
        );

      if (!target) {
        return reply(
          `❌ Tag/reply target.\n\n` +
          `Contoh:\n` +
          `${PREFIX}warn @628xxxx`
        );
      }

      const number =
        jidNumber(target);

      if (
        !group.warnings[number]
      ) {
        group.warnings[number] =
          0;
      }

      group.warnings[number]++;

      const count =
        group.warnings[number];

      const targetUser =
        getUser(target);

      targetUser.warn =
        count;

      saveDB();

      if (
        count >= 3
      ) {
        if (
          await isBotAdmin(chat)
        ) {
          try {
            await sock.groupParticipantsUpdate(
              chat,
              [target],
              "remove"
            );

            group.warnings[number] =
              0;

            targetUser.warn =
              0;

            saveDB();

            return reply(
              `🚫 @${number} mendapatkan 3/3 warn dan dikeluarkan dari grup.`,
              {
                mentions: [target]
              }
            );
          } catch {}
        }
      }

      return reply(
        `⚠️ *WARNING*\n\n` +
        `👤 @${number}\n` +
        `Warn: ${count}/3`,
        {
          mentions: [target]
        }
      );
    }

    // --------------------------------------
    // UNWARN
    // --------------------------------------

    if (
      command === "unwarn"
    ) {
      const target =
        targetFromMessage(
          message,
          args
        );

      if (!target) {
        return reply(
          `❌ Tag/reply target.\n\n` +
          `Contoh:\n` +
          `${PREFIX}unwarn @628xxxx`
        );
      }

      const number =
        jidNumber(target);

      group.warnings[number] =
        Math.max(
          0,
          (group.warnings[number] ||
            0) - 1
        );

      getUser(target).warn =
        group.warnings[number];

      saveDB();

      return reply(
        `✅ Warn @${number} dikurangi.\n` +
        `Warn sekarang: ${group.warnings[number]}/3`,
        {
          mentions: [target]
        }
      );
    }

    // --------------------------------------
    // CEK WARN
    // --------------------------------------

    if (
      command === "cekwarn"
    ) {
      const target =
        targetFromMessage(
          message,
          args
        ) || sender;

      const number =
        jidNumber(target);

      const count =
        group.warnings[number] ||
        getUser(target).warn ||
        0;

      return reply(
        `⚠️ *WARN USER*\n\n` +
        `👤 @${number}\n` +
        `Warn: ${count}/3`,
        {
          mentions: [target]
        }
      );
    }

    // --------------------------------------
    // LIST WARN
    // --------------------------------------

    if (
      command === "listwarn"
    ) {
      const entries =
        Object.entries(
          group.warnings
        )
        .filter(
          ([, count]) =>
            count > 0
        );

      if (!entries.length) {
        return reply(
          "✅ Tidak ada member yang memiliki warn."
        );
      }

      const mentions =
        entries.map(
          ([number]) =>
            userJid(number)
        );

      const list =
        entries
          .map(
            ([number, count], index) =>
              `${index + 1}. @${number} — ${count}/3`
          )
          .join("\n");

      return reply(
        `⚠️ *LIST WARN*\n\n${list}`,
        {
          mentions
        }
      );
    }

    // --------------------------------------
    // RESET WARN
    // --------------------------------------

    if (
      command === "resetwarn"
    ) {
      const target =
        targetFromMessage(
          message,
          args
        );

      if (!target) {
        return reply(
          `❌ Tag/reply target.\n\n` +
          `Contoh:\n` +
          `${PREFIX}resetwarn @628xxxx`
        );
      }

      const number =
        jidNumber(target);

      group.warnings[number] =
        0;

      getUser(target).warn =
        0;

      saveDB();

      return reply(
        `✅ Warn @${number} berhasil direset.`,
        {
          mentions: [target]
        }
      );
    }
}
    // ========================================
  // LIST & REMINDER
  // ========================================

  if (command === "addlist") {
    const name =
      args.shift();

    const content =
      args.join(" ").trim();

    if (!name || !content) {
      return reply(
        `Contoh:\n${PREFIX}addlist menu Harga produk`
      );
    }

    const group =
      getGroup(chat);

    group.lists ||= {};

    group.lists[name] =
      content;

    saveDB();

    return reply(
      `✅ List *${name}* berhasil ditambahkan.\n\n` +
      `📝 Isi:\n${content}`
    );
  }

  if (
    command === "updatelist" ||
    command === "uplist"
  ) {
    const name =
      args.shift();

    const content =
      args.join(" ").trim();

    if (!name || !content) {
      return reply(
        `Contoh:\n${PREFIX}${command} menu Isi baru`
      );
    }

    const group =
      getGroup(chat);

    group.lists ||= {};

    if (
      !group.lists[name]
    ) {
      return reply(
        `❌ List *${name}* belum tersedia.`
      );
    }

    group.lists[name] =
      content;

    saveDB();

    return reply(
      `✅ List *${name}* berhasil diperbarui.\n\n` +
      `📝 Isi baru:\n${content}`
    );
  }

  // ========================================
  // ADD POINT
  // ========================================

  if (
    command === "addpoin"
  ) {
    const target =
      targetFromMessage(
        message,
        args
      ) || sender;

    const amount =
      Number(
        args.find(
          item =>
            /^\d+$/.test(item)
        ) || 1
      );

    const targetUser =
      getUser(target);

    targetUser.points =
      (targetUser.points || 0) +
      amount;

    saveDB();

    return reply(
      `⭐ *POIN DITAMBAHKAN*\n\n` +
      `👤 @${jidNumber(target)}\n` +
      `⭐ +${amount} poin\n` +
      `📊 Total: ${targetUser.points}`,
      {
        mentions: [target]
      }
    );
  }

  // ========================================
  // REMINDER / ALARM
  // ========================================

  if (
    command === "addreminder" ||
    command === "addalarm"
  ) {
    const duration =
      parseDuration(
        args[0] || ""
      );

    const reminderText =
      args
        .slice(1)
        .join(" ")
        .trim();

    if (
      !duration ||
      !reminderText
    ) {
      return reply(
        `❌ Format salah.\n\n` +
        `Contoh:\n` +
        `${PREFIX}${command} 10m minum air\n\n` +
        `Format waktu:\n` +
        `10m = 10 menit\n` +
        `1h = 1 jam\n` +
        `1d = 1 hari`
      );
    }

    const group =
      getGroup(chat);

    const reminder = {
      id: randomId("REM"),
      user:
        jidNumber(sender),
      text:
        reminderText,
      createdAt:
        Date.now(),
      duration
    };

    group.reminders ||= [];

    group.reminders.push(
      reminder
    );

    saveDB();

    setTimeout(
      async () => {
        try {
          await sendText(
            chat,
            `⏰ *REMINDER*\n\n` +
            `👤 @${jidNumber(sender)}\n` +
            `📝 ${reminderText}`,
            {
              mentions: [sender]
            }
          );
        } catch {}
      },
      duration
    );

    return reply(
      `✅ Reminder berhasil dibuat.\n\n` +
      `🆔 ${reminder.id}\n` +
      `⏰ Waktu: ${args[0]}\n` +
      `📝 ${reminderText}`
    );
  }

  // ========================================
  // AFK
  // ========================================

  if (command === "afk") {
    const reason =
      args.join(" ").trim() ||
      "AFK";

    user.afk = {
      reason,
      since: Date.now()
    };

    saveDB();

    return reply(
      `💤 *AFK AKTIF*\n\n` +
      `Alasan: ${reason}\n\n` +
      `Kirim pesan lagi untuk menonaktifkan AFK.`
    );
  }

  // ========================================
  // SCHEDULE
  // ========================================

  if (
    command === "createschedulecall"
  ) {
    const time =
      args[0];

    const scheduleText =
      args
        .slice(1)
        .join(" ")
        .trim();

    if (
      !time ||
      !scheduleText
    ) {
      return reply(
        `📅 *CREATE SCHEDULE CALL*\n\n` +
        `Contoh:\n` +
        `${PREFIX}createschedulecall 20:00 Meeting`
      );
    }

    return reply(
      `✅ Schedule call dibuat.\n\n` +
      `⏰ Waktu: ${time}\n` +
      `📝 Acara: ${scheduleText}`
    );
  }

  if (
    command === "cekabsen"
  ) {
    const group =
      getGroup(chat);

    group.absen ||= {
      active: false,
      members: {}
    };

    const members =
      Object.entries(
        group.absen.members
      );

    if (!members.length) {
      return reply(
        "📋 Belum ada data absensi."
      );
    }

    const list =
      members
        .map(
          ([number, value], index) =>
            `${index + 1}. @${number} — ${value}`
        )
        .join("\n");

    return reply(
      `📋 *DATA ABSENSI*\n\n${list}`,
      {
        mentions:
          members.map(
            ([number]) =>
              userJid(number)
          )
      }
    );
  }

  if (
    command === "cekpoint"
  ) {
    return reply(
      `⭐ *POIN KAMU*\n\n` +
      `Total poin: ${user.points || 0}`
    );
  }

  if (
    command === "cekschedule"
  ) {
    return reply(
      `📅 *SCHEDULE*\n\n` +
      `Belum ada schedule aktif.`
    );
  }

  // ========================================
  // SIMPLE GAMES
  // ========================================

  if (
    command === "asahotak" ||
    command === "tebak"
  ) {
    const item =
      riddles[
        Math.floor(
          Math.random() *
          riddles.length
        )
      ];

    startGame(
      chat,
      item[0],
      item[1],
      "riddle"
    );

    return reply(
      `🧠 *ASAH OTAK*\n\n` +
      `${item[0]}\n\n` +
      `💡 Jawab langsung dengan teks.\n` +
      `🛑 Ketik ${PREFIX}stopgame untuk berhenti.`
    );
  }

  if (
    command === "tebakkata" ||
    command === "susunkata"
  ) {
    const item =
      wordGames[
        Math.floor(
          Math.random() *
          wordGames.length
        )
      ];

    const shuffled =
      item[0]
        .split("")
        .sort(
          () =>
            Math.random() -
            0.5
        )
        .join("");

    startGame(
      chat,
      `Susun huruf: ${shuffled}`,
      item[1],
      "word"
    );

    return reply(
      `🔤 *TEBAK KATA*\n\n` +
      `Susun huruf berikut:\n\n` +
      `🔀 *${shuffled}*\n\n` +
      `Jawab dengan kata yang benar.`
    );
  }

  if (
    command === "math"
  ) {
    const a =
      Math.floor(
        Math.random() * 20
      ) + 1;

    const b =
      Math.floor(
        Math.random() * 20
      ) + 1;

    const addition =
      Math.random() > 0.5;

    const operator =
      addition
        ? "+"
        : "-";

    const answer =
      addition
        ? a + b
        : a - b;

    startGame(
      chat,
      `${a} ${operator} ${b} = ?`,
      String(answer),
      "math"
    );

    return reply(
      `🧮 *MATH GAME*\n\n` +
      `Berapa hasil dari:\n\n` +
      `*${a} ${operator} ${b} = ?*\n\n` +
      `Jawab dengan angka.`
    );
  }

  if (
    command === "truth"
  ) {
    const questions = [
      "Apa hal yang paling kamu takutkan?",
      "Apa kebiasaan burukmu?",
      "Apa hal paling memalukan yang pernah kamu alami?",
      "Siapa orang yang paling kamu percaya?",
      "Apa cita-cita terbesar kamu?"
    ];

    const question =
      questions[
        Math.floor(
          Math.random() *
          questions.length
        )
      ];

    return reply(
      `🎯 *TRUTH*\n\n${question}`
    );
  }

  if (
    command === "dare"
  ) {
    const dares = [
      "Kirim emoji yang paling sering kamu gunakan.",
      "Tag satu teman di grup.",
      "Kirim pesan dengan huruf kapital semua.",
      "Kirim satu GIF lucu.",
      "Kirim foto makanan terakhir yang kamu makan."
    ];

    const dare =
      dares[
        Math.floor(
          Math.random() *
          dares.length
        )
      ];

    return reply(
      `🔥 *DARE*\n\n${dare}`
    );
  }

  if (
    command === "caklontong"
  ) {
    return reply(
      `😂 *CAK LONTONG*\n\n` +
      `Database soal Cak Lontong belum dipasang.\n` +
      `Tambahkan dataset soal untuk mengaktifkan permainan lengkap.`
    );
  }

  if (
    command === "family100"
  ) {
    return reply(
      `👨‍👩‍👧‍👦 *FAMILY 100*\n\n` +
      `Database Family 100 belum dipasang.\n` +
      `Tambahkan dataset soal untuk mengaktifkan permainan lengkap.`
    );
  }

  if (
    command === "akinator"
  ) {
    return reply(
      `🔮 *AKINATOR*\n\n` +
      `Game Akinator membutuhkan API/game engine khusus.`
    );
  }

  if (
    command === "tebakgambar"
  ) {
    return reply(
      `🖼️ *TEBAK GAMBAR*\n\n` +
      `Database gambar belum dipasang.`
    );
  }

  if (
    command === "stopgame"
  ) {
    stopGame(chat);

    return reply(
      "🛑 Game berhasil dihentikan."
    );
  }

  // ========================================
  // INFO
  // ========================================

  if (
    command === "ceksewa"
  ) {
    return reply(
      `ℹ️ *STATUS SEWA*\n\n` +
      `Bot tidak menggunakan sistem sewa bawaan pada versi ini.`
    );
  }

  if (
    command === "ceksewabyid"
  ) {
    return reply(
      `ℹ️ *CEK SEWA BY ID*\n\n` +
      `Sistem sewa belum diaktifkan.`
    );
  }

  if (
    command === "dbinfo"
  ) {
    if (
      !needOwner(
        sender,
        reply
      )
    ) {
      return;
    }

    return reply(
      `🗄️ *DATABASE INFO*\n\n` +
      `👤 Users: ${
        Object.keys(
          db.users
        ).length
      }\n` +
      `👥 Groups: ${
        Object.keys(
          db.groups
        ).length
      }\n` +
      `📦 Orders: ${
        Object.keys(
          db.orders
        ).length
      }\n` +
      `🚫 Banned: ${
        db.banned.length
      }\n` +
      `💬 Messages: ${
        db.stats.messages
      }\n` +
      `⚡ Commands: ${
        db.stats.commands
      }`
    );
  }

  // ========================================
  // COMMAND NOT FOUND
  // ========================================

  return reply(
    `❓ Command *${command}* belum memiliki handler khusus.\n\n` +
    `Ketik ${PREFIX}menu untuk melihat daftar command.`
  );
          }
// ============================================================
// PART 7/10 — GROUP SECURITY, GAME, AFK, PARTICIPANTS
// ============================================================

async function handleGroupSecurity(m, text) {
  const chat = getChat(m);
  const sender = getSender(m);

  if (!isGroup(chat)) return false;

  const group = getGroup(chat);

  // Owner tidak terkena sistem keamanan
  if (isOwner(sender)) return false;

  const lower = String(text || "").toLowerCase();

  // ----------------------------------------------------------
  // ANTI LINK GROUP WHATSAPP
  // ----------------------------------------------------------

  if (
    group.antilink &&
    (
      lower.includes("chat.whatsapp.com/") ||
      lower.includes("whatsapp.com/channel/")
    )
  ) {
    await react(m, "⚠️");

    try {
      await sock.sendMessage(chat, {
        delete: m.key
      });
    } catch {}

    if (group.antilinkKick && await isBotAdmin(chat)) {
      try {
        await sock.groupParticipantsUpdate(
          chat,
          [sender],
          "remove"
        );

        await sendText(
          chat,
          `🚫 @${jidNumber(sender)} dikeluarkan karena mengirim link WhatsApp.`,
          [sender]
        );
      } catch {
        await sendText(
          chat,
          `⚠️ @${jidNumber(sender)} terdeteksi mengirim link WhatsApp.`,
          [sender]
        );
      }
    } else {
      await sendText(
        chat,
        `⚠️ @${jidNumber(sender)} jangan mengirim link WhatsApp di grup.`,
        [sender]
      );
    }

    return true;
  }

  // ----------------------------------------------------------
  // ANTI WA.ME
  // ----------------------------------------------------------

  if (
    group.antiwame &&
    (
      lower.includes("wa.me/") ||
      lower.includes("api.whatsapp.com/send")
    )
  ) {
    await react(m, "⚠️");

    try {
      await sock.sendMessage(chat, {
        delete: m.key
      });
    } catch {}

    if (group.antiwameKick && await isBotAdmin(chat)) {
      try {
        await sock.groupParticipantsUpdate(
          chat,
          [sender],
          "remove"
        );

        await sendText(
          chat,
          `🚫 @${jidNumber(sender)} dikeluarkan karena mengirim link WhatsApp.`,
          [sender]
        );
      } catch {
        await sendText(
          chat,
          `⚠️ @${jidNumber(sender)} terdeteksi mengirim link WhatsApp.`,
          [sender]
        );
      }
    } else {
      await sendText(
        chat,
        `⚠️ @${jidNumber(sender)} jangan mengirim link WhatsApp.`,
        [sender]
      );
    }

    return true;
  }

  // ----------------------------------------------------------
  // ANTI BADWORD
  // ----------------------------------------------------------

  if (
    group.antibadword &&
    Array.isArray(group.badwords) &&
    group.badwords.length > 0
  ) {
    const found = group.badwords.some(word => {
      const cleanWord = String(word || "")
        .toLowerCase()
        .trim();

      if (!cleanWord) return false;

      return lower.includes(cleanWord);
    });

    if (found) {
      await react(m, "🤬");

      try {
        await sock.sendMessage(chat, {
          delete: m.key
        });
      } catch {}

      if (
        group.antibadwordKick &&
        await isBotAdmin(chat)
      ) {
        try {
          await sock.groupParticipantsUpdate(
            chat,
            [sender],
            "remove"
          );

          await sendText(
            chat,
            `🚫 @${jidNumber(sender)} dikeluarkan karena menggunakan kata terlarang.`,
            [sender]
          );
        } catch {
          await sendText(
            chat,
            `⚠️ @${jidNumber(sender)} gunakan bahasa yang sopan.`,
            [sender]
          );
        }
      } else {
        await sendText(
          chat,
          `⚠️ @${jidNumber(sender)} gunakan bahasa yang sopan.`,
          [sender]
        );
      }

      return true;
    }
  }

  return false;
}


// ============================================================
// HANDLE JAWABAN GAME
// ============================================================

async function handleGameAnswer(m, text) {
  const chat = getChat(m);
  const sender = getSender(m);

  if (!chat || !sender) return false;

  const session = gameSessions[chat];

  if (!session) return false;

  // Jangan proses command sebagai jawaban game
  if (String(text || "").startsWith(PREFIX)) {
    return false;
  }

  const answer = cleanText(text);

  if (!answer) return false;

  const correct = session.answer;

  if (
    answer === cleanText(correct) ||
    answer.includes(cleanText(correct))
  ) {
    const user = getUser(sender);

    user.points += 5;
    user.limit += 1;

    stopGame(chat);

    await react(m, "✅");

    await sendText(
      chat,
      `🎉 *JAWABAN BENAR!*\n\n` +
      `👤 @${jidNumber(sender)}\n` +
      `💡 Jawaban: *${correct}*\n` +
      `🏆 +5 poin\n` +
      `🎁 +1 limit`,
      [sender]
    );

    saveDB();

    return true;
  }

  return false;
}


// ============================================================
// HANDLE AFK
// ============================================================

async function handleAfk(m, text) {
  const chat = getChat(m);
  const sender = getSender(m);

  if (!isGroup(chat)) return false;

  const user = getUser(sender);

  // ----------------------------------------------------------
  // USER KEMBALI DARI AFK
  // ----------------------------------------------------------

  if (user.afk) {
    const afkData = user.afk;

    user.afk = null;

    const elapsed = Date.now() - afkData.time;

    await sendText(
      chat,
      `👋 @${jidNumber(sender)} sudah kembali!\n` +
      `⏱️ AFK selama ${formatRuntime(elapsed)}.`,
      [sender]
    );
  }

  // ----------------------------------------------------------
  // CEK ORANG YANG DI-MENTION DAN SEDANG AFK
  // ----------------------------------------------------------

  const mentioned =
    m.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    [];

  if (!Array.isArray(mentioned) || mentioned.length === 0) {
    return false;
  }

  for (const jid of mentioned) {
    const target = getUser(jid);

    if (!target.afk) continue;

    const elapsed = Date.now() - target.afk.time;

    await sendText(
      chat,
      `💤 @${jidNumber(jid)} sedang AFK.\n` +
      `📝 Alasan: ${target.afk.reason || "Tidak ada alasan"}\n` +
      `⏱️ Sejak: ${formatRuntime(elapsed)} yang lalu.`,
      [jid]
    );
  }

  return false;
}


// ============================================================
// HANDLE MEMBER MASUK / KELUAR GRUP
// ============================================================

async function handleParticipants(update) {
  try {
    const chat = update.id;

    if (!chat || !chat.endsWith("@g.us")) {
      return;
    }

    const group = getGroup(chat);

    if (!group) return;

    const participants = update.participants || [];

    if (!Array.isArray(participants)) return;

    for (const participant of participants) {
      const number = jidNumber(participant);

      // ------------------------------------------------------
      // MEMBER MASUK
      // ------------------------------------------------------

      if (update.action === "add") {
        if (!group.welcome) continue;

        await sendText(
          chat,
          `🎉 *WELCOME!*\n\n` +
          `Selamat datang @${number} 👋\n` +
          `Semoga betah di grup ini.\n\n` +
          `📌 Jangan lupa baca rules grup ya!`,
          [participant]
        );
      }

      // ------------------------------------------------------
      // MEMBER KELUAR
      // ------------------------------------------------------

      if (
        update.action === "remove" ||
        update.action === "leave"
      ) {
        if (!group.goodbye) continue;

        await sendText(
          chat,
          `👋 Selamat tinggal @${number}.\n` +
          `Semoga sukses selalu!`,
          [participant]
        );
      }

      // ------------------------------------------------------
      // MEMBER DIPROMOTE
      // ------------------------------------------------------

      if (update.action === "promote") {
        await sendText(
          chat,
          `👑 @${number} sekarang menjadi admin grup.`,
          [participant]
        );
      }

      // ------------------------------------------------------
      // MEMBER DITURUNKAN
      // ------------------------------------------------------

      if (update.action === "demote") {
        await sendText(
          chat,
          `📉 @${number} tidak lagi menjadi admin grup.`,
          [participant]
        );
      }
    }
  } catch (error) {
    console.log(
      "handleParticipants error:",
      error?.message || error
    );
  }
    }
// ============================================================
// PART 8/10 — HANDLE MESSAGE
// ============================================================

async function handleMessage(m) {
  try {
    if (!m || !m.message) return;

    const chat = getChat(m);
    const sender = getSender(m);

    if (!chat || !sender) return;

    const text = getMessageText(m).trim();

    // Abaikan pesan kosong
    if (!text) return;

    // Update statistik
    db.stats.messages++;

    // Pastikan user tersedia di database
    const user = getUser(sender);

    // --------------------------------------------------------
    // CEK BAN
    // --------------------------------------------------------

    if (isBanned(sender)) {
      return;
    }

    // --------------------------------------------------------
    // MODE SELF
    // --------------------------------------------------------

    if (!publicMode && !isOwner(sender)) {
      return;
    }

    // --------------------------------------------------------
    // HANDLE AFK
    // --------------------------------------------------------

    try {
      await handleAfk(m, text);
    } catch (error) {
      console.log(
        "AFK handler error:",
        error?.message || error
      );
    }

    // --------------------------------------------------------
    // GROUP SECURITY
    // --------------------------------------------------------

    if (isGroup(chat)) {
      try {
        const blocked = await handleGroupSecurity(
          m,
          text
        );

        if (blocked) {
          saveDB();
          return;
        }
      } catch (error) {
        console.log(
          "Security handler error:",
          error?.message || error
        );
      }
    }

    // --------------------------------------------------------
    // HANDLE JAWABAN GAME
    // --------------------------------------------------------

    try {
      const gameAnswered = await handleGameAnswer(
        m,
        text
      );

      if (gameAnswered) {
        saveDB();
        return;
      }
    } catch (error) {
      console.log(
        "Game handler error:",
        error?.message || error
      );
    }

    // --------------------------------------------------------
    // CEK PREFIX
    // --------------------------------------------------------

    if (!text.startsWith(PREFIX)) {
      saveDB();
      return;
    }

    // --------------------------------------------------------
    // PARSING COMMAND
    // --------------------------------------------------------

    const withoutPrefix = text
      .slice(PREFIX.length)
      .trim();

    if (!withoutPrefix) return;

    const parts = withoutPrefix.split(/\s+/);

    const command = String(parts.shift() || "")
      .toLowerCase();

    const args = parts;

    const commandText = args.join(" ").trim();

    if (!command) return;

    db.stats.commands++;

    // --------------------------------------------------------
    // REACTION LOADING
    // --------------------------------------------------------

    await react(m, "⏳");

    // --------------------------------------------------------
    // JALANKAN COMMAND
    // --------------------------------------------------------

    try {
      await handleCommand(
        m,
        command,
        args,
        commandText
      );

      await react(m, "✅");
    } catch (error) {
      console.log(
        `Command ${command} error:`,
        error?.stack || error
      );

      await react(m, "❌");

      await sendText(
        chat,
        `❌ Terjadi kesalahan saat menjalankan command.\n\n` +
        `📌 Command: *${PREFIX}${command}*\n` +
        `⚠️ Error: ${error?.message || "Unknown error"}`
      );
    }

    saveDB();
  } catch (error) {
    console.log(
      "handleMessage error:",
      error?.stack || error
    );
  }
}


// ============================================================
// START BOT
// ============================================================

async function startBot() {
  try {
    console.log("========================================");
    console.log("        ZAZABOT STARTING...");
    console.log("========================================");

    // --------------------------------------------------------
    // PASTIKAN FOLDER SESSION ADA
    // --------------------------------------------------------

    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(
        SESSION_DIR,
        {
          recursive: true
        }
      );
    }

    // --------------------------------------------------------
    // AUTHENTICATION
    // --------------------------------------------------------

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      SESSION_DIR
    );

    // --------------------------------------------------------
    // BUAT SOCKET WHATSAPP
    // --------------------------------------------------------

    sock = makeWASocket({
      auth: state,

      logger: pino({
        level: "silent"
      }),

      browser: Browsers.ubuntu(
        "Chrome"
      ),

      printQRInTerminal: false,

      markOnlineOnConnect: false,

      syncFullHistory: false,

      generateHighQualityLinkPreview: true
    });

    // --------------------------------------------------------
    // SIMPAN CREDS
    // --------------------------------------------------------

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // --------------------------------------------------------
    // CONNECTION UPDATE
    // --------------------------------------------------------

    sock.ev.on(
      "connection.update",
      async (update) => {
        try {
          const {
            connection,
            lastDisconnect,
            qr
          } = update;

          // --------------------------------------------------
          // QR CODE
          // --------------------------------------------------

          if (qr) {
            connectionStatus = "qr";

            try {
              qrImage = await QRCode.toDataURL(
                qr,
                {
                  width: 500,
                  margin: 2
                }
              );

              console.log("");
              console.log(
                "========================================"
              );
              console.log(
                " QR CODE TERSEDIA"
              );
              console.log(
                " Buka: http://localhost:" +
                PORT +
                "/qr"
              );
              console.log(
                "========================================"
              );
              console.log("");
            } catch (error) {
              console.log(
                "QR generate error:",
                error?.message || error
              );
            }
          }

          // --------------------------------------------------
          // CONNECTED
          // --------------------------------------------------

          if (connection === "open") {
            connectionStatus = "connected";
            qrImage = null;

            console.log("");
            console.log(
              "========================================"
            );
            console.log(
              "       ZAZABOT BERHASIL ONLINE"
            );
            console.log(
              "========================================"
            );
            console.log(
              "Nama Bot :",
              BOT_NAME
            );
            console.log(
              "Owner    :",
              OWNER_NUMBER
            );
            console.log(
              "Prefix   :",
              PREFIX
            );
            console.log(
              "Status   : ONLINE"
            );
            console.log(
              "========================================"
            );
            console.log("");
          }

          // --------------------------------------------------
          // DISCONNECTED
          // --------------------------------------------------

          if (connection === "close") {
            connectionStatus = "disconnected";

            const statusCode =
              lastDisconnect
                ?.error
                ?.output
                ?.statusCode;

            console.log(
              "Koneksi WhatsApp terputus."
            );

            console.log(
              "Status code:",
              statusCode || "unknown"
            );

            // Hindari reconnect berkali-kali
            if (reconnectTimer) {
              clearTimeout(
                reconnectTimer
              );
            }

            // ------------------------------------------------
            // JIKA SESSION LOGOUT
            // ------------------------------------------------

            if (
              statusCode ===
              DisconnectReason.loggedOut
            ) {
              console.log(
                "Session logout."
              );

              console.log(
                "Hapus folder session lalu scan QR kembali."
              );

              return;
            }

            // ------------------------------------------------
            // RECONNECT OTOMATIS
            // ------------------------------------------------

            reconnectTimer =
              setTimeout(
                async () => {
                  console.log(
                    "Mencoba reconnect..."
                  );

                  try {
                    await startBot();
                  } catch (error) {
                    console.log(
                      "Reconnect error:",
                      error?.message || error
                    );
                  }
                },
                5000
              );
          }
        } catch (error) {
          console.log(
            "connection.update error:",
            error?.message || error
          );
        }
      }
    );

    // --------------------------------------------------------
    // PESAN MASUK
    // --------------------------------------------------------

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {
        try {
          if (
            !Array.isArray(messages) ||
            messages.length === 0
          ) {
            return;
          }

          for (const message of messages) {
            try {
              await handleMessage(
                message
              );
            } catch (error) {
              console.log(
                "Message processing error:",
                error?.message || error
              );
            }
          }
        } catch (error) {
          console.log(
            "messages.upsert error:",
            error?.message || error
          );
        }
      }
    );

    // --------------------------------------------------------
    // GROUP PARTICIPANTS
    // --------------------------------------------------------

    sock.ev.on(
      "group-participants.update",
      async (update) => {
        try {
          await handleParticipants(
            update
          );
        } catch (error) {
          console.log(
            "group-participants.update error:",
            error?.message || error
          );
        }
      }
    );

  } catch (error) {
    connectionStatus = "error";

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "       GAGAL MENJALANKAN ZAZABOT"
    );
    console.log(
      "========================================"
    );
    console.log(
      error?.stack || error
    );
    console.log(
      "========================================"
    );
    console.log("");

    // Coba start ulang
    if (reconnectTimer) {
      clearTimeout(
        reconnectTimer
      );
    }

    reconnectTimer =
      setTimeout(
        () => {
          startBot().catch(
            err => {
              console.log(
                "Start ulang gagal:",
                err?.message || err
              );
            }
          );
        },
        5000
      );
  }
    }
// ============================================================
// PART 9/10 — WEB SERVER + STATUS + QR
// ============================================================

const server = http.createServer(
  async (req, res) => {
    try {
      const url = new URL(
        req.url,
        `http://localhost:${PORT}`
      );

      // ------------------------------------------------------
      // HEADERS
      // ------------------------------------------------------

      res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
      );

      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
      );

      res.setHeader(
        "Content-Type",
        "text/html; charset=utf-8"
      );

      // ------------------------------------------------------
      // OPTIONS
      // ------------------------------------------------------

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // ------------------------------------------------------
      // HOME
      // ------------------------------------------------------

      if (
        url.pathname === "/" ||
        url.pathname === "/status"
      ) {
        const uptime =
          Date.now() - startedAt;

        const statusData = {
          bot: BOT_NAME,
          status: connectionStatus,
          owner: OWNER_NUMBER,
          prefix: PREFIX,
          uptime: formatRuntime(uptime),
          messages: db.stats.messages,
          commands: db.stats.commands,
          users: Object.keys(db.users).length,
          groups: Object.keys(db.groups).length,
          premium: Object.keys(db.premium).length,
          time: new Date().toISOString()
        };

        res.writeHead(
          200,
          {
            "Content-Type":
              "application/json; charset=utf-8"
          }
        );

        res.end(
          JSON.stringify(
            statusData,
            null,
            2
          )
        );

        return;
      }

      // ------------------------------------------------------
      // QR PAGE
      // ------------------------------------------------------

      if (url.pathname === "/qr") {
        res.writeHead(
          200,
          {
            "Content-Type":
              "text/html; charset=utf-8"
          }
        );

        if (!qrImage) {
          res.end(`
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width,
               initial-scale=1.0">
<title>ZazaBot QR</title>

<style>
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1220;
  color: white;
  font-family: Arial, sans-serif;
}

.card {
  width: 90%;
  max-width: 420px;
  padding: 30px;
  text-align: center;
  border-radius: 20px;
  background: #111827;
  box-shadow: 0 10px 40px rgba(0,0,0,.4);
}

h1 {
  margin-bottom: 10px;
}

.status {
  margin: 20px 0;
  padding: 15px;
  border-radius: 12px;
  background: #1f2937;
}

button {
  border: 0;
  padding: 12px 20px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: bold;
}
</style>
</head>

<body>

<div class="card">

  <h1>🤖 ZazaBot</h1>

  <div class="status">
    📡 Status:
    <b>${connectionStatus}</b>
  </div>

  <p>
    QR Code belum tersedia.
  </p>

  <p>
    Jika bot sedang menghubungkan WhatsApp,
    refresh halaman ini.
  </p>

  <button
    onclick="location.reload()">
    🔄 Refresh
  </button>

</div>

</body>
</html>
          `);

          return;
        }

        res.end(`
<!DOCTYPE html>
<html lang="id">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width,
               initial-scale=1.0">

<meta
  http-equiv="refresh"
  content="20"
>

<title>ZazaBot - QR Login</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;

  display: flex;
  align-items: center;
  justify-content: center;

  font-family: Arial, sans-serif;

  background:
    linear-gradient(
      135deg,
      #020617,
      #0f172a,
      #172554
    );

  color: white;
}

.card {
  width: 92%;
  max-width: 450px;

  padding: 30px;

  text-align: center;

  border-radius: 24px;

  background:
    rgba(15, 23, 42, .95);

  box-shadow:
    0 20px 60px
    rgba(0, 0, 0, .5);
}

.logo {
  font-size: 55px;
  margin-bottom: 10px;
}

h1 {
  margin: 0;
  font-size: 28px;
}

p {
  color: #cbd5e1;
}

.qr {
  margin: 25px auto;

  padding: 15px;

  width: fit-content;

  background: white;

  border-radius: 18px;
}

.qr img {
  display: block;

  width: 280px;
  max-width: 70vw;
  height: auto;
}

.info {
  padding: 15px;

  border-radius: 14px;

  background:
    rgba(30, 41, 59, .8);

  margin-top: 15px;
}

.refresh {
  margin-top: 20px;

  padding: 12px 20px;

  border: none;

  border-radius: 10px;

  font-size: 15px;

  font-weight: bold;

  cursor: pointer;
}

.small {
  font-size: 13px;
  color: #94a3b8;
}

</style>

</head>

<body>

<div class="card">

  <div class="logo">
    🤖
  </div>

  <h1>
    ZazaBot
  </h1>

  <p>
    Scan QR Code menggunakan WhatsApp
  </p>

  <div class="qr">
    <img
      src="${qrImage}"
      alt="WhatsApp QR Code"
    >
  </div>

  <div class="info">

    <b>📱 Cara Login</b>

    <p>
      WhatsApp →
      Perangkat tertaut →
      Tautkan perangkat
    </p>

  </div>

  <button
    class="refresh"
    onclick="location.reload()"
  >
    🔄 Refresh QR
  </button>

  <p class="small">
    Halaman akan refresh otomatis.
  </p>

</div>

</body>

</html>
        `);

        return;
      }

      // ------------------------------------------------------
      // API STATUS
      // ------------------------------------------------------

      if (
        url.pathname === "/api/status"
      ) {
        const data = {
          success: true,
          bot: BOT_NAME,
          status: connectionStatus,
          uptime: formatRuntime(
            Date.now() - startedAt
          ),
          stats: db.stats
        };

        res.writeHead(
          200,
          {
            "Content-Type":
              "application/json; charset=utf-8"
          }
        );

        res.end(
          JSON.stringify(
            data,
            null,
            2
          )
        );

        return;
      }

      // ------------------------------------------------------
      // 404
      // ------------------------------------------------------

      res.writeHead(
        404,
        {
          "Content-Type":
            "application/json; charset=utf-8"
        }
      );

      res.end(
        JSON.stringify({
          success: false,
          error: "Endpoint tidak ditemukan",
          path: url.pathname
        })
      );

    } catch (error) {

      console.log(
        "HTTP server error:",
        error?.message || error
      );

      res.writeHead(
        500,
        {
          "Content-Type":
            "application/json; charset=utf-8"
        }
      );

      res.end(
        JSON.stringify({
          success: false,
          error: "Internal server error"
        })
      );
    }
  }
);


// ============================================================
// SERVER LISTEN
// ============================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "       ZAZABOT WEB SERVER"
    );

    console.log(
      "========================================"
    );

    console.log(
      `Port   : ${PORT}`
    );

    console.log(
      `Status : http://localhost:${PORT}/status`
    );

    console.log(
      `QR     : http://localhost:${PORT}/qr`
    );

    console.log(
      "========================================"
    );

    console.log("");

  }
);


// ============================================================
// MULAI ZAZABOT
// ============================================================

startBot().catch(
  error => {

    console.log(
      "startBot fatal error:",
      error?.stack || error
    );

  }
);
// ============================================================
// PART 10/10 — AUTOSAVE + SHUTDOWN
// ============================================================

// ------------------------------------------------------------
// SIMPAN DATABASE OTOMATIS SETIAP 30 DETIK
// ------------------------------------------------------------

setInterval(() => {
  try {
    saveDB();

    console.log(
      `[DB] Database tersimpan ${new Date().toLocaleTimeString()}`
    );
  } catch (error) {
    console.log(
      "[DB] Gagal menyimpan database:",
      error?.message || error
    );
  }
}, 30000);


// ------------------------------------------------------------
// SHUTDOWN DENGAN AMAN
// ------------------------------------------------------------

async function shutdown(signal) {
  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    `Menerima signal: ${signal}`
  );
  console.log(
    "Mematikan ZazaBot..."
  );
  console.log(
    "========================================"
  );

  try {
    // Simpan database terlebih dahulu
    saveDB();

    console.log(
      "✅ Database berhasil disimpan."
    );
  } catch (error) {
    console.log(
      "❌ Gagal menyimpan database:",
      error?.message || error
    );
  }

  try {
    // Tutup web server
    server.close(() => {
      console.log(
        "✅ Web server ditutup."
      );
    });
  } catch {}

  try {
    // Tutup koneksi WhatsApp
    if (sock) {
      sock.ws?.close();
    }

    console.log(
      "✅ Koneksi WhatsApp ditutup."
    );
  } catch {}

  console.log(
    "ZazaBot berhenti."
  );

  process.exit(0);
}


// ------------------------------------------------------------
// HANDLE CTRL + C
// ------------------------------------------------------------

process.on(
  "SIGINT",
  () => {
    shutdown("SIGINT");
  }
);


// ------------------------------------------------------------
// HANDLE TERMINATE
// ------------------------------------------------------------

process.on(
  "SIGTERM",
  () => {
    shutdown("SIGTERM");
  }
);


// ------------------------------------------------------------
// HANDLE ERROR YANG TIDAK TERTANGANI
// ------------------------------------------------------------

process.on(
  "unhandledRejection",
  error => {
    console.log(
      "Unhandled Promise Rejection:",
      error
    );
  }
);


process.on(
  "uncaughtException",
  error => {
    console.log(
      "Uncaught Exception:",
      error?.stack || error
    );
  }
);


// ============================================================
// ZAZABOT SELESAI
// ============================================================

console.log("");
console.log(
  "========================================"
);
console.log(
  "          ZAZABOT READY"
);
console.log(
  "========================================"
);
console.log(
  `Bot Name : ${BOT_NAME}`
);
console.log(
  `Prefix   : ${PREFIX}`
);
console.log(
  `Owner    : ${OWNER_NUMBER}`
);
console.log(
  `Port     : ${PORT}`
);
console.log(
  "========================================"
);
console.log("");
