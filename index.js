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
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "6289630747010").replace(/\D/g, "");
const PREFIX = process.env.PREFIX || ".";
const PORT = Number(process.env.PORT || 8080);
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
      const db = defaultDB();
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
      return db;
    }

    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    const base = defaultDB();

    return {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings || {}) },
      stats: { ...base.stats, ...(data.stats || {}) }
    };
  } catch (e) {
    console.error("DB ERROR:", e.message);
    return defaultDB();
  }
}

let db = loadDB();
publicMode = db.settings.public !== false;

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("SAVE DB ERROR:", e.message);
  }
}

// ==========================================
// HELPERS
// ==========================================

function jidNumber(jid = "") {
  return String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
}

function userJid(number = "") {
  const n = String(number).replace(/\D/g, "");
  return n ? `${n}@s.whatsapp.net` : "";
}

function isGroup(jid = "") {
  return String(jid).endsWith("@g.us");
}

function isOwner(jid = "") {
  const n = jidNumber(jid);
  const owners = [
    OWNER_NUMBER,
    jidNumber(db?.settings?.owner || "")
  ].filter(Boolean);
  return owners.includes(n);
}

function isBanned(jid = "") {
  return db.banned.includes(jidNumber(jid));
}

function getUser(jid) {
  const n = jidNumber(jid);
  if (!n) return null;

  if (!db.users[n]) {
    db.users[n] = {
      id: n,
      name: "",
      balance: 0,
      limit: 20,
      premium: false,
      premiumUntil: 0,
      warn: 0,
      afk: null,
      createdAt: Date.now()
    };
  }

  return db.users[n];
}

function isPremium(jid) {
  const user = getUser(jid);
  if (!user) return false;

  if (user.premiumUntil && user.premiumUntil > Date.now()) {
    return true;
  }

  if (user.premiumUntil && user.premiumUntil <= Date.now()) {
    user.premium = false;
    user.premiumUntil = 0;
    saveDB();
  }

  return Boolean(user.premium);
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
      warnings: {}
    };
  }

  return db.groups[jid];
}

function formatRupiah(n = 0) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}

function formatRuntime(ms) {
  let sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  sec %= 86400;
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  sec %= 60;

  return `${d}d ${h}h ${m}m ${sec}s`;
}

function randomId(prefix = "ORD") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function cleanText(text = "") {
  return String(text).trim();
}

function extractUrl(text = "") {
  const m = String(text).match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

function mentionNumbers(text = "") {
  return [...String(text).matchAll(/@(\d{5,16})/g)].map(x => x[1]);
}

function parseDuration(text = "") {
  const m = String(text).match(/(\d+)\s*(d|day|hari|h|m|menit|month|bulan)/i);
  if (!m) return null;

  const n = Number(m[1]);
  const unit = m[2].toLowerCase();

  if (["d", "day", "hari"].includes(unit)) return n * 24 * 60 * 60 * 1000;
  if (["m", "menit"].includes(unit)) return n * 60 * 1000;
  if (["month", "bulan"].includes(unit)) return n * 30 * 24 * 60 * 60 * 1000;

  return null;
}

function getMessageText(message) {
  if (!message) return "";

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

function getQuotedMessage(message) {
  return message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
}

function getQuotedParticipant(message) {
  return message?.extendedTextMessage?.contextInfo?.participant || null;
}

async function sendText(jid, text, options = {}) {
  if (!sock) return;
  return sock.sendMessage(jid, { text: String(text), ...options });
}

async function react(jid, key, emoji = "✅") {
  try {
    await sock.sendMessage(jid, {
      react: { text: emoji, key }
    });
  } catch {}
}

async function downloadMedia(msg, type) {
  const stream = await downloadContentFromMessage(msg, type);
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function getImageBuffer(message, quoted = false) {
  let target = message;

  if (quoted) {
    target = getQuotedMessage(message);
  }

  if (!target?.imageMessage) return null;

  return downloadMedia(target.imageMessage, "image");
}

function getSender(m) {
  return m.key.participant || m.key.remoteJid || "";
}

function getChat(m) {
  return m.key.remoteJid || "";
}

// ==========================================
// STORE DATA
// ==========================================

const PRODUCTS = {
  spotify: [
    { name: "Spotify Premium", duration: "1 Bulan", price: 8000 },
    { name: "Spotify Premium", duration: "2 Bulan", price: 10000 }
  ],
  netflix: [
    { name: "Netflix Premium", duration: "1 Bulan", price: 8000 },
    { name: "Netflix Premium", duration: "2 Bulan", price: 10000 }
  ],
  hoki: [
    { name: "Waktu Hoki-Hokian", duration: "Paket", price: 15000 }
  ],
  ebook: [
    { name: "E-book Belajar Bahasa Inggris", duration: "Paket", price: 7000 },
    { name: "E-book The Psychology of Money", duration: "Paket", price: 7000 }
  ]
};

function productList() {
  let out = "🛍️ *ZAZA STORE*\n\n";

  for (const [category, items] of Object.entries(PRODUCTS)) {
    out += `📦 *${category.toUpperCase()}*\n`;

    for (const item of items) {
      out += `• ${item.name} — ${item.duration} — ${formatRupiah(item.price)}\n`;
    }

    out += "\n";
  }

  out += `💳 Pembayaran: QRIS / DANA / BANK\n`;
  out += `📌 Ketik ${PREFIX}order <produk> untuk membuat pesanan.`;

  return out;
}

function findProduct(query = "") {
  const q = query.toLowerCase();

  for (const [category, items] of Object.entries(PRODUCTS)) {
    for (const item of items) {
      const full =
        `${category} ${item.name} ${item.duration}`.toLowerCase();

      if (full.includes(q) || q.includes(category)) {
        return { category, ...item };
      }
    }
  }

  return null;
}

// ==========================================
// MENU
// ==========================================

function menuText(sender) {
  const premium =
    isPremium(sender)
      ? "Premium"
      : "Free";

  return `
╭━━━〔 🤖 ${BOT_NAME} 〕━━━╮
┃ 👤 Status : ${premium}
┃ ⚡ Prefix : ${PREFIX}
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

🛒 *STORE*
${PREFIX}produk
${PREFIX}pricelist
${PREFIX}order
${PREFIX}beli
${PREFIX}cekorder
${PREFIX}saldo
${PREFIX}balance
${PREFIX}premium

🧰 *TOOLS*
${PREFIX}qr
${PREFIX}qrcode
${PREFIX}shortlink
${PREFIX}screenshot
${PREFIX}ocr
${PREFIX}removebg

📊 *INFO*
${PREFIX}status
${PREFIX}stats
${PREFIX}dbinfo

━━━━━━━━━━━━━━━━━━━━━━
> @_zazasza
info:https://linktr.ee/zazastore19
`;
}

// ==========================================
// GAME DATA
// ==========================================

const riddles = [
  {
    question: "Aku punya kaki tapi tidak bisa berjalan. Apakah aku?",
    answer: "meja"
  },
  {
    question: "Semakin diisi semakin ringan. Apakah aku?",
    answer: "balon"
  },
  {
    question: "Aku punya gigi tetapi tidak bisa menggigit. Apakah aku?",
    answer: "sisir"
  },
  {
    question: "Aku selalu mengikuti kamu tetapi tidak pernah bisa disentuh. Apakah aku?",
    answer: "bayangan"
  },
  {
    question: "Aku memiliki banyak halaman tetapi bukan buku. Apakah aku?",
    answer: "kalender"
  }
];

const wordGames = [
  {
    question: "Susun kata: K O B T O",
    answer: "botok"
  },
  {
    question: "Susun kata: P U M K O M E R",
    answer: "komputer"
  },
  {
    question: "Susun kata: S A W H A T P P",
    answer: "whatsapp"
  },
  {
    question: "Susun kata: O R B O Z A",
    answer: "zaboor"
  }
];

const gameSessions = new Map();

function startGame(chat, player, type, data) {
  gameSessions.set(chat, {
    type,
    player,
    ...data,
    startedAt: Date.now()
  });
}

function stopGame(chat) {
  gameSessions.delete(chat);
}

function randomRiddle() {
  return riddles[
    Math.floor(Math.random() * riddles.length)
  ];
}

function randomWordGame() {
  return wordGames[
    Math.floor(Math.random() * wordGames.length)
  ];
}

function createMathQuestion() {
  const a =
    Math.floor(Math.random() * 20) + 1;

  const b =
    Math.floor(Math.random() * 20) + 1;

  const operators = ["+", "-", "*"];

  const op =
    operators[
      Math.floor(Math.random() * operators.length)
    ];

  let answer;

  if (op === "+") {
    answer = a + b;
  }

  if (op === "-") {
    answer = a - b;
  }

  if (op === "*") {
    answer = a * b;
  }

  return {
    question: `${a} ${op} ${b} = ?`,
    answer: String(answer)
  };
}

// ==========================================
// BALANCE / XP / PREMIUM
// ==========================================

function getBalance(jid) {
  const user = getUser(jid);
  return user ? Number(user.balance || 0) : 0;
}

function addBalance(jid, amount) {
  const user = getUser(jid);
  if (!user) return;

  user.balance =
    Number(user.balance || 0) +
    Number(amount || 0);

  saveDB();
}

function removeBalance(jid, amount) {
  const user = getUser(jid);
  if (!user) return false;

  amount =
    Number(amount || 0);

  if (
    Number(user.balance || 0) <
    amount
  ) {
    return false;
  }

  user.balance -= amount;

  saveDB();

  return true;
}

function addLimit(jid, amount = 1) {
  const user = getUser(jid);
  if (!user) return;

  user.limit =
    Number(user.limit || 0) +
    Number(amount || 0);
}

function removeLimit(jid, amount = 1) {
  const user = getUser(jid);
  if (!user) return false;

  amount =
    Number(amount || 0);

  if (
    Number(user.limit || 0) <
    amount
  ) {
    return false;
  }

  user.limit -= amount;

  return true;
}

function addPoint(jid, amount = 1) {
  const user = getUser(jid);
  if (!user) return;

  user.points =
    Number(user.points || 0) +
    Number(amount || 0);
}

function addXP(jid, amount = 1) {
  const user = getUser(jid);
  if (!user) return;

  user.xp =
    Number(user.xp || 0) +
    Number(amount || 0);

  user.level =
    Math.floor(
      Number(user.xp || 0) / 100
    ) + 1;
}

function addWarning(jid) {
  const user = getUser(jid);
  if (!user) return 0;

  user.warn =
    Number(user.warn || 0) + 1;

  return user.warn;
}

function removeWarning(jid) {
  const user = getUser(jid);
  if (!user) return;

  user.warn =
    Math.max(
      0,
      Number(user.warn || 0) - 1
    );
}

function activatePremium(jid, duration) {
  const user = getUser(jid);
  if (!user) return;

  user.premium = true;

  user.premiumUntil =
    Date.now() +
    Number(duration || 0);

  db.premium[jidNumber(jid)] =
    user.premiumUntil;

  saveDB();
}

// ==========================================
// ORDER
// ==========================================

function createOrder(jid, product) {
  const id =
    randomId("ORDER");

  db.orders[id] = {
    id,
    user: jidNumber(jid),
    product,
    status: "pending",
    createdAt: Date.now()
  };

  saveDB();

  return db.orders[id];
}

function getOrder(id) {
  return db.orders[id] || null;
}

console.log("✅ Bagian 1 berhasil dimuat.");
// ==========================================
// PART 2 - COMMAND UTAMA
// ==========================================

async function handleCommand(message, command, args, text) {
  const chat = getChat(message);
  const sender = getSender(message);

  // ========================================
  // GENERAL
  // ========================================

  if (["menu", "help"].includes(command)) {
    await sendText(chat, menuText(sender));
    return true;
  }

  if (command === "ping") {
    const start = Date.now();

    await sendText(
      chat,
      `🏓 Pong!\n⚡ ${Date.now() - start} ms`
    );

    return true;
  }

  if (["speed", "kecepatan"].includes(command)) {
    const start = Date.now();

    await sendText(
      chat,
      `⚡ Speed: ${Date.now() - start} ms`
    );

    return true;
  }

  if (["runtime", "uptime"].includes(command)) {
    await sendText(
      chat,
      `⏱️ Runtime:\n${formatRuntime(Date.now() - startedAt)}`
    );

    return true;
  }

  if (command === "status") {
    const users =
      Object.keys(db.users || {}).length;

    const groups =
      Object.keys(db.groups || {}).length;

    await sendText(
      chat,
      `🤖 *STATUS ZAZABOT*\n\n` +
      `• Status: ${connectionStatus}\n` +
      `• Mode: ${publicMode ? "PUBLIC" : "SELF"}\n` +
      `• Users: ${users}\n` +
      `• Groups: ${groups}\n` +
      `• Messages: ${db.stats.messages}\n` +
      `• Commands: ${db.stats.commands}\n` +
      `• Runtime: ${formatRuntime(Date.now() - startedAt)}`
    );

    return true;
  }

  if (["botinfo", "info"].includes(command)) {
    await sendText(
      chat,
      `🤖 *${BOT_NAME}*\n\n` +
      `📱 Bot: ${BOT_NUMBER_DISPLAY()}\n` +
      `👑 Owner: ${OWNER_NUMBER}\n` +
      `⚡ Prefix: ${PREFIX}\n` +
      `📡 Status: ${connectionStatus}\n` +
      `🔓 Mode: ${publicMode ? "PUBLIC" : "SELF"}`
    );

    return true;
  }

  if (command === "profile") {
    const user = getUser(sender);

    await sendText(
      chat,
      `👤 *PROFILE*\n\n` +
      `Nama: ${user.name || jidNumber(sender)}\n` +
      `Nomor: ${jidNumber(sender)}\n` +
      `💰 Saldo: ${formatRupiah(user.balance)}\n` +
      `🎟️ Limit: ${user.limit}\n` +
      `⭐ Point: ${user.points || 0}\n` +
      `✨ XP: ${user.xp || 0}\n` +
      `🏆 Level: ${user.level || 1}\n` +
      `💎 Premium: ${isPremium(sender) ? "YES" : "NO"}\n` +
      `⚠️ Warn: ${user.warn || 0}`
    );

    return true;
  }

  if (["balance", "saldo"].includes(command)) {
    await sendText(
      chat,
      `💰 Saldo kamu: *${formatRupiah(getBalance(sender))}*`
    );

    return true;
  }

  if (command === "limit") {
    const user = getUser(sender);

    await sendText(
      chat,
      `🎟️ Limit kamu: *${user.limit || 0}*`
    );

    return true;
  }

  if (command === "level") {
    const user = getUser(sender);

    await sendText(
      chat,
      `🏆 *LEVEL*\n\n` +
      `Level: ${user.level || 1}\n` +
      `XP: ${user.xp || 0}`
    );

    return true;
  }

  if (command === "rules") {
    await sendText(
      chat,
      `📜 *RULES ZAZABOT*\n\n` +
      `1. Jangan spam bot.\n` +
      `2. Jangan mengirim konten ilegal.\n` +
      `3. Jangan abuse fitur bot.\n` +
      `4. Gunakan bot dengan bijak.\n` +
      `5. Admin berhak membatasi penggunaan.`
    );

    return true;
  }

  if (["donate", "donasi"].includes(command)) {
    await sendText(
      chat,
      `💙 *DONASI ZAZA STORE*\n\n` +
      `Jika ingin membantu pengembangan bot,\n` +
      `silakan hubungi owner:\n\n` +
      `👑 ${OWNER_NUMBER}`
    );

    return true;
  }


  // ========================================
  // OWNER
  // ========================================

  if (command === "owner") {
    await sendText(
      chat,
      `👑 *OWNER ZAZABOT*\n\n` +
      `Nama: Zaza Store\n` +
      `WhatsApp: wa.me/${OWNER_NUMBER}`
    );

    return true;
  }

  if (["cekowner", "ownerinfo"].includes(command)) {
    await sendText(
      chat,
      `👑 Owner:\n${OWNER_NUMBER}`
    );

    return true;
  }

  if (command === "setowner") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Command ini khusus owner.");
      return true;
    }

    const number =
      String(args[0] || "").replace(/\D/g, "");

    if (!number) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}setowner 628xxxxxxxxxx`
      );
      return true;
    }

    db.settings.owner = number;
    saveDB();

    await sendText(
      chat,
      `✅ Owner database diubah menjadi:\n${number}`
    );

    return true;
  }

  if (command === "public") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    publicMode = true;
    db.settings.public = true;
    saveDB();

    await sendText(
      chat,
      "✅ Mode PUBLIC aktif."
    );

    return true;
  }

  if (command === "self") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    publicMode = false;
    db.settings.public = false;
    saveDB();

    await sendText(
      chat,
      "🔒 Mode SELF aktif."
    );

    return true;
  }

  if (command === "ban") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    const target =
      args[0] ||
      getQuotedParticipant(message);

    const number =
      String(target || "").replace(/\D/g, "");

    if (!number) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}ban 628xxxxxxxxxx`
      );
      return true;
    }

    if (!db.banned.includes(number)) {
      db.banned.push(number);
    }

    saveDB();

    await sendText(
      chat,
      `🚫 ${number} berhasil dibanned.`
    );

    return true;
  }

  if (command === "unban") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    const number =
      String(args[0] || "").replace(/\D/g, "");

    if (!number) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}unban 628xxxxxxxxxx`
      );
      return true;
    }

    db.banned =
      db.banned.filter(
        x => x !== number
      );

    saveDB();

    await sendText(
      chat,
      `✅ ${number} berhasil di-unban.`
    );

    return true;
  }

  if (["listban", "banlist"].includes(command)) {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    if (!db.banned.length) {
      await sendText(
        chat,
        "✅ Tidak ada user yang dibanned."
      );
      return true;
    }

    await sendText(
      chat,
      `🚫 *LIST BAN*\n\n` +
      db.banned
        .map((x, i) => `${i + 1}. ${x}`)
        .join("\n")
    );

    return true;
  }

  if (command === "addbalance") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    const number =
      String(args[0] || "").replace(/\D/g, "");

    const amount =
      Number(args[1] || 0);

    if (!number || !amount || amount <= 0) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addbalance 628xxxxxxxxxx 10000`
      );
      return true;
    }

    addBalance(
      userJid(number),
      amount
    );

    await sendText(
      chat,
      `✅ Saldo ${number} ditambah ${formatRupiah(amount)}.`
    );

    return true;
  }

  if (command === "addlimit") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    const number =
      String(args[0] || "").replace(/\D/g, "");

    const amount =
      Number(args[1] || 0);

    if (!number || !amount) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addlimit 628xxxxxxxxxx 10`
      );
      return true;
    }

    addLimit(
      userJid(number),
      amount
    );

    saveDB();

    await sendText(
      chat,
      `✅ Limit ${number} ditambah ${amount}.`
    );

    return true;
  }


  // ========================================
  // PREMIUM
  // ========================================

  if (command === "premium") {
    const user = getUser(sender);

    await sendText(
      chat,
      `💎 *PREMIUM*\n\n` +
      `Status: ${isPremium(sender) ? "AKTIF" : "TIDAK AKTIF"}\n` +
      `Saldo: ${formatRupiah(user.balance)}`
    );

    return true;
  }

  if (command === "cekpremium") {
    await sendText(
      chat,
      isPremium(sender)
        ? "💎 Premium kamu masih aktif."
        : "❌ Kamu belum memiliki Premium."
    );

    return true;
  }

  if (command === "addpremium") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    const number =
      String(args[0] || "").replace(/\D/g, "");

    const durationText =
      args.slice(1).join(" ") || "30 hari";

    const duration =
      parseDuration(durationText);

    if (!number || !duration) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addpremium 628xxxxxxxxxx 30 hari`
      );
      return true;
    }

    activatePremium(
      userJid(number),
      duration
    );

    await sendText(
      chat,
      `💎 Premium ${number} berhasil diaktifkan.\n` +
      `⏱️ Durasi: ${durationText}`
    );

    return true;
  }


  // ========================================
  // STORE
  // ========================================

  if (
    ["produk", "pricelist", "price", "store"]
      .includes(command)
  ) {
    await sendText(
      chat,
      productList()
    );

    return true;
  }

  if (["order", "buy", "beli"].includes(command)) {
    const query =
      args.join(" ").trim();

    if (!query) {
      await sendText(
        chat,
        `🛒 *CARA ORDER*\n\n` +
        `${PREFIX}order spotify 1 bulan\n` +
        `${PREFIX}order netflix 1 bulan\n` +
        `${PREFIX}order hoki`
      );

      return true;
    }

    const product =
      findProduct(query);

    if (!product) {
      await sendText(
        chat,
        "❌ Produk tidak ditemukan.\n\n" +
        productList()
      );

      return true;
    }

    const order =
      createOrder(
        sender,
        product
      );

    await sendText(
      chat,
      `🛒 *ORDER BERHASIL DIBUAT*\n\n` +
      `🆔 ID: ${order.id}\n` +
      `📦 Produk: ${product.name}\n` +
      `⏱️ Durasi: ${product.duration}\n` +
      `💰 Harga: ${formatRupiah(product.price)}\n` +
      `📌 Status: PENDING\n\n` +
      `Silakan hubungi owner untuk pembayaran.`
    );

    return true;
  }

  if (
    ["cekorder", "orderstatus"].includes(command)
  ) {
    const id =
      String(args[0] || "").trim();

    if (!id) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}cekorder ORDER-xxxxx`
      );
      return true;
    }

    const order =
      getOrder(id);

    if (!order) {
      await sendText(
        chat,
        "❌ Order tidak ditemukan."
      );
      return true;
    }

    if (
      order.user !== jidNumber(sender) &&
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Kamu tidak memiliki akses ke order ini."
      );
      return true;
    }

    await sendText(
      chat,
      `📦 *ORDER*\n\n` +
      `ID: ${order.id}\n` +
      `Produk: ${order.product.name}\n` +
      `Harga: ${formatRupiah(order.product.price)}\n` +
      `Status: ${order.status}\n` +
      `Tanggal: ${new Date(order.createdAt).toLocaleString("id-ID")}`
    );

    return true;
  }


  // ========================================
  // AI
  // ========================================

  if (
    ["ai", "openai", "ask", "bard", "nexara"]
      .includes(command)
  ) {
    const prompt =
      args.join(" ").trim();

    if (!prompt) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}ai jelaskan apa itu WhatsApp`
      );
      return true;
    }

    // Fungsi openAI akan dipasang
    // pada bagian media/AI berikutnya.
    if (typeof openAI === "function") {

      const result =
        await openAI(prompt);

      await sendText(
        chat,
        result || "❌ AI tidak memberikan jawaban."
      );

    } else {

      await sendText(
        chat,
        "⚠️ Fitur AI belum dikonfigurasi."
      );
    }

    return true;
  }


  // ========================================
  // TRANSLATE
  // ========================================

  if (command === "translate") {
    const input =
      args.join(" ").trim();

    if (!input) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}translate hello dunia`
      );
      return true;
    }

    await sendText(
      chat,
      `🌐 *TRANSLATE*\n\n` +
      `Teks: ${input}\n\n` +
      `Fitur terjemahan akan menggunakan layanan translator pada bagian berikutnya.`
    );

    return true;
  }


  // ========================================
  // STATS
  // ========================================

  if (command === "stats") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    await sendText(
      chat,
      `📊 *STATISTIK ZAZABOT*\n\n` +
      `👤 Users: ${Object.keys(db.users).length}\n` +
      `👥 Groups: ${Object.keys(db.groups).length}\n` +
      `💬 Messages: ${db.stats.messages}\n` +
      `⚡ Commands: ${db.stats.commands}\n` +
      `🚫 Banned: ${db.banned.length}\n` +
      `🛒 Orders: ${Object.keys(db.orders).length}`
    );

    return true;
  }


  // ========================================
  // DB INFO
  // ========================================

  if (command === "dbinfo") {
    if (!isOwner(sender)) {
      await sendText(chat, "❌ Khusus owner.");
      return true;
    }

    await sendText(
      chat,
      `💾 *DATABASE*\n\n` +
      `Users: ${Object.keys(db.users).length}\n` +
      `Groups: ${Object.keys(db.groups).length}\n` +
      `Orders: ${Object.keys(db.orders).length}\n` +
      `Banned: ${db.banned.length}`
    );

    return true;
  }


  // ========================================
  // UNKNOWN
  // ========================================

  return false;
}


// ==========================================
// BOT NUMBER
// ==========================================

function BOT_NUMBER_DISPLAY() {
  return "6285866438941";
}


console.log("✅ Bagian 2 berhasil dimuat.");
// ==========================================
// PART 3 - GROUP COMMAND
// ==========================================

async function getGroupMetadataSafe(chat) {
  try {
    return await sock.groupMetadata(chat);
  } catch {
    return null;
  }
}

function getGroupAdmins(metadata) {
  if (!metadata?.participants) return [];

  return metadata.participants
    .filter(p => p.admin === "admin" || p.admin === "superadmin")
    .map(p => p.id);
}

function isParticipantAdmin(metadata, jid) {
  if (!metadata?.participants) return false;

  const participant =
    metadata.participants.find(
      p => p.id === jid
    );

  return Boolean(
    participant &&
    (
      participant.admin === "admin" ||
      participant.admin === "superadmin"
    )
  );
}

async function isBotAdminSafe(chat, metadata = null) {
  try {
    const data =
      metadata ||
      await getGroupMetadataSafe(chat);

    if (!data) return false;

    const botJid =
      sock.user?.id?.split(":")[0] + "@s.whatsapp.net";

    return isParticipantAdmin(
      data,
      botJid
    );

  } catch {
    return false;
  }
}

async function requireGroup(message) {
  const chat = getChat(message);

  if (!isGroup(chat)) {
    await sendText(
      chat,
      "❌ Command ini hanya bisa digunakan di grup."
    );

    return false;
  }

  return true;
}

async function requireAdmin(message) {
  const chat = getChat(message);
  const sender = getSender(message);

  if (!(await requireGroup(message))) {
    return false;
  }

  const metadata =
    await getGroupMetadataSafe(chat);

  if (!metadata) {
    await sendText(
      chat,
      "❌ Gagal mengambil data grup."
    );

    return false;
  }

  if (
    !isOwner(sender) &&
    !isParticipantAdmin(metadata, sender)
  ) {
    await sendText(
      chat,
      "❌ Command ini khusus admin grup."
    );

    return false;
  }

  return metadata;
}

async function requireBotAdmin(message, metadata = null) {
  const chat = getChat(message);

  const data =
    metadata ||
    await getGroupMetadataSafe(chat);

  if (!data) {
    await sendText(
      chat,
      "❌ Gagal mengambil data grup."
    );

    return null;
  }

  if (
    !(await isBotAdminSafe(chat, data))
  ) {
    await sendText(
      chat,
      "❌ Bot harus menjadi admin terlebih dahulu."
    );

    return null;
  }

  return data;
}

function getTargetMembers(message, args = []) {
  const result = [];

  const quoted =
    getQuotedParticipant(message);

  if (quoted) {
    result.push(quoted);
  }

  for (const n of args) {
    const number =
      String(n)
        .replace(/[^0-9]/g, "");

    if (
      number.length >= 5 &&
      number.length <= 16
    ) {
      result.push(
        userJid(number)
      );
    }
  }

  return [
    ...new Set(
      result.filter(Boolean)
    )
  ];
}


// ==========================================
// GROUP COMMAND HANDLER
// ==========================================

async function handleGroupCommand(
  message,
  command,
  args,
  text
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);


  // ========================================
  // GROUP INFO
  // ========================================

  if (
    ["groupinfo", "groupsetting"].includes(command)
  ) {

    const metadata =
      await getGroupMetadataSafe(chat);

    if (!metadata) {
      await sendText(
        chat,
        "❌ Gagal mengambil informasi grup."
      );

      return true;
    }

    const admins =
      getGroupAdmins(metadata);

    const group =
      getGroup(chat);

    await sendText(
      chat,
      `👥 *GROUP INFO*\n\n` +
      `📛 Nama: ${metadata.subject}\n` +
      `🆔 ID: ${chat}\n` +
      `👤 Member: ${metadata.participants.length}\n` +
      `👑 Admin: ${admins.length}\n\n` +
      `🛡️ Anti Link: ${group.antilink ? "ON" : "OFF"}\n` +
      `🚫 Anti Badword: ${group.antibadword ? "ON" : "OFF"}\n` +
      `🤖 Anti Bot: ${group.antibot ? "ON" : "OFF"}`
    );

    return true;
  }


  // ========================================
  // CEK ID GROUP
  // ========================================

  if (
    ["cekidgroup", "idgc"].includes(command)
  ) {

    if (!(await requireGroup(message))) {
      return true;
    }

    await sendText(
      chat,
      `🆔 *GROUP ID*\n\n${chat}`
    );

    return true;
  }


  // ========================================
  // LINK GROUP
  // ========================================

  if (
    ["linkgc", "linkgroup"].includes(command)
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const data =
      await requireBotAdmin(
        message,
        metadata
      );

    if (!data) {
      return true;
    }

    try {

      const code =
        await sock.groupInviteCode(chat);

      await sendText(
        chat,
        `🔗 *LINK GROUP*\n\n` +
        `https://chat.whatsapp.com/${code}`
      );

    } catch {

      await sendText(
        chat,
        "❌ Gagal mengambil link grup."
      );
    }

    return true;
  }


  // ========================================
  // REVOKE LINK
  // ========================================

  if (
    ["revokelink", "resetlink"].includes(command)
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const data =
      await requireBotAdmin(
        message,
        metadata
      );

    if (!data) {
      return true;
    }

    try {

      await sock.groupRevokeInvite(chat);

      await sendText(
        chat,
        "✅ Link grup berhasil direset."
      );

    } catch {

      await sendText(
        chat,
        "❌ Gagal mereset link grup."
      );
    }

    return true;
  }


  // ========================================
  // LIST ADMIN
  // ========================================

  if (
    ["groupadmin", "listadmin", "adminlist"].includes(command)
  ) {

    if (!(await requireGroup(message))) {
      return true;
    }

    const metadata =
      await getGroupMetadataSafe(chat);

    if (!metadata) {
      return true;
    }

    const admins =
      getGroupAdmins(metadata);

    const mentions =
      admins.map(
        jid => `@${jidNumber(jid)}`
      );

    await sock.sendMessage(
      chat,
      {
        text:
          `👑 *ADMIN GRUP*\n\n` +
          mentions.join("\n"),
        mentions: admins
      }
    );

    return true;
  }


  // ========================================
  // TAG ADMIN
  // ========================================

  if (command === "tagadmin") {

    if (!(await requireGroup(message))) {
      return true;
    }

    const metadata =
      await getGroupMetadataSafe(chat);

    if (!metadata) {
      return true;
    }

    const admins =
      getGroupAdmins(metadata);

    const mentions =
      admins.map(
        jid => `@${jidNumber(jid)}`
      );

    await sock.sendMessage(
      chat,
      {
        text:
          `📢 *TAG ADMIN*\n\n` +
          mentions.join(" "),
        mentions: admins
      }
    );

    return true;
  }


  // ========================================
  // TAG ALL
  // ========================================

  if (
    ["tagall", "hidetag"].includes(command)
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const members =
      metadata.participants.map(
        p => p.id
      );

    const mentions =
      members.map(
        jid => `@${jidNumber(jid)}`
      );

    const title =
      args.length
        ? args.join(" ")
        : "📢 TAG ALL";

    await sock.sendMessage(
      chat,
      {
        text:
          `*${title}*\n\n` +
          mentions.join(" "),
        mentions: members
      }
    );

    return true;
  }


  // ========================================
  // ADD MEMBER
  // ========================================

  if (command === "add") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const data =
      await requireBotAdmin(
        message,
        metadata
      );

    if (!data) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}add 628xxxxxxxxxx`
      );

      return true;
    }

    try {

      const result =
        await sock.groupParticipantsUpdate(
          chat,
          targets,
          "add"
        );

      await sendText(
        chat,
        `✅ Proses menambahkan ${targets.length} member selesai.`
      );

      console.log(
        "ADD RESULT:",
        result
      );

    } catch (error) {

      await sendText(
        chat,
        `❌ Gagal menambahkan member.\n${error.message}`
      );
    }

    return true;
  }


  // ========================================
  // KICK
  // ========================================

  if (
    ["kick", "banmember"].includes(command)
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const data =
      await requireBotAdmin(
        message,
        metadata
      );

    if (!data) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {
      await sendText(
        chat,
        `Reply pesan target atau gunakan:\n${PREFIX}kick 628xxxxxxxxxx`
      );

      return true;
    }

    try {

      await sock.groupParticipantsUpdate(
        chat,
        targets,
        "remove"
      );

      await sendText(
        chat,
        `👢 ${targets.length} member berhasil dikeluarkan.`
      );

    } catch (error) {

      await sendText(
        chat,
        `❌ Gagal mengeluarkan member.\n${error.message}`
      );
    }

    return true;
  }


  // ========================================
  // KICK ME
  // ========================================

  if (command === "kickme") {

    const metadata =
      await requireBotAdmin(
        message
      );

    if (!metadata) {
      return true;
    }

    try {

      await sock.groupParticipantsUpdate(
        chat,
        [sender],
        "remove"
      );

    } catch (error) {

      await sendText(
        chat,
        `❌ Gagal keluar dari grup.\n${error.message}`
      );
    }

    return true;
  }


  // ========================================
  // PROMOTE
  // ========================================

  if (command === "promote") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const data =
      await requireBotAdmin(
        message,
        metadata
      );

    if (!data) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}promote 628xxxxxxxxxx`
      );

      return true;
    }

    try {

      await sock.groupParticipantsUpdate(
        chat,
        targets,
        "promote"
      );

      await sendText(
        chat,
        "👑 Member berhasil dipromosikan menjadi admin."
      );

    } catch (error) {

      await sendText(
        chat,
        `❌ Gagal promote.\n${error.message}`
      );
    }

    return true;
  }


  // ========================================
  // DEMOTE
  // ========================================

  if (command === "demote") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const data =
      await requireBotAdmin(
        message,
        metadata
      );

    if (!data) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}demote 628xxxxxxxxxx`
      );

      return true;
    }

    try {

      await sock.groupParticipantsUpdate(
        chat,
        targets,
        "demote"
      );

      await sendText(
        chat,
        "✅ Admin berhasil diturunkan menjadi member."
      );

    } catch (error) {

      await sendText(
        chat,
        `❌ Gagal demote.\n${error.message}`
      );
    }

    return true;
  }


  // ========================================
  // SET NAME
  // ========================================

  if (
    ["setnamegc", "setname"].includes(command)
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const data =
      await requireBotAdmin(
        message,
        metadata
      );

    if (!data) {
      return true;
    }

    const name =
      args.join(" ").trim();

    if (!name) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}setname Nama Grup Baru`
      );

      return true;
    }

    try {

      await sock.groupUpdateSubject(
        chat,
        name
      );

      await sendText(
        chat,
        "✅ Nama grup berhasil diubah."
      );

    } catch (error) {

      await sendText(
        chat,
        `❌ Gagal mengubah nama grup.\n${error.message}`
      );
    }

    return true;
  }


  // ========================================
  // SET DESCRIPTION
  // ========================================

  if (
    ["setdescgc", "descgc", "setdesc"].includes(command)
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const data =
      await requireBotAdmin(
        message,
        metadata
      );

    if (!data) {
      return true;
    }

    const desc =
      args.join(" ").trim();

    if (!desc) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}setdesc Deskripsi grup`
      );

      return true;
    }

    try {

      await sock.groupUpdateDescription(
        chat,
        desc
      );

      await sendText(
        chat,
        "✅ Deskripsi grup berhasil diubah."
      );

    } catch (error) {

      await sendText(
        chat,
        `❌ Gagal mengubah deskripsi.\n${error.message}`
      );
    }

    return true;
  }


  // ========================================
  // WELCOME
  // ========================================

  if (command === "welcome") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.welcome = true;

    saveDB();

    await sendText(
      chat,
      "✅ Welcome group diaktifkan."
    );

    return true;
  }

  if (command === "welcomeoff") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.welcome = false;

    saveDB();

    await sendText(
      chat,
      "❌ Welcome group dimatikan."
    );

    return true;
  }


  // ========================================
  // GOODBYE
  // ========================================

  if (command === "goodbye") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.goodbye = true;

    saveDB();

    await sendText(
      chat,
      "✅ Goodbye group diaktifkan."
    );

    return true;
  }

  if (command === "goodbyeoff") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.goodbye = false;

    saveDB();

    await sendText(
      chat,
      "❌ Goodbye group dimatikan."
    );

    return true;
  }


  // ========================================
  // ANTI LINK
  // ========================================

  if (command === "antilink") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antilink = true;
    group.antilinkKick = true;

    saveDB();

    await sendText(
      chat,
      "🛡️ Anti Link aktif.\nMember yang melanggar akan dikeluarkan jika bot admin."
    );

    return true;
  }

  if (command === "antilinkoff") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antilink = false;

    saveDB();

    await sendText(
      chat,
      "❌ Anti Link dimatikan."
    );

    return true;
  }

  if (command === "antilinknokick") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antilink = true;
    group.antilinkKick = false;

    saveDB();

    await sendText(
      chat,
      "🛡️ Anti Link aktif tanpa kick."
    );

    return true;
  }


  // ========================================
  // ANTI LINK CHANNEL
  // ========================================

  if (command === "antilinkchannel") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antilinkChannel = true;

    saveDB();

    await sendText(
      chat,
      "🛡️ Anti Link Channel aktif."
    );

    return true;
  }


  // ========================================
  // ANTI BADWORD
  // ========================================

  if (command === "antibadword") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antibadword = true;
    group.antibadwordKick = true;

    saveDB();

    await sendText(
      chat,
      "🚫 Anti Badword aktif."
    );

    return true;
  }

  if (command === "antibadwordoff") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antibadword = false;

    saveDB();

    await sendText(
      chat,
      "❌ Anti Badword dimatikan."
    );

    return true;
  }

  if (command === "antibadwordnokick") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antibadword = true;
    group.antibadwordKick = false;

    saveDB();

    await sendText(
      chat,
      "🚫 Anti Badword aktif tanpa kick."
    );

    return true;
  }


  // ========================================
  // ADD BADWORD
  // ========================================

  if (command === "addbadword") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const word =
      args.join(" ")
        .trim()
        .toLowerCase();

    if (!word) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addbadword kata`
      );

      return true;
    }

    const group =
      getGroup(chat);

    if (!group.badwords.includes(word)) {
      group.badwords.push(word);
    }

    saveDB();

    await sendText(
      chat,
      `✅ Badword "${word}" berhasil ditambahkan.`
    );

    return true;
  }


  // ========================================
  // LIST BADWORD
  // ========================================

  if (command === "listbadword") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    if (!group.badwords.length) {
      await sendText(
        chat,
        "📋 Belum ada daftar badword."
      );

      return true;
    }

    await sendText(
      chat,
      `🚫 *BADWORD LIST*\n\n` +
      group.badwords
        .map(
          (x, i) =>
            `${i + 1}. ${x}`
        )
        .join("\n")
    );

    return true;
  }


  // ========================================
  // ANTI BOT
  // ========================================

  if (command === "antibot") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antibot = true;

    saveDB();

    await sendText(
      chat,
      "🤖 Anti Bot diaktifkan."
    );

    return true;
  }


  // ========================================
  // ANTI DELETE
  // ========================================

  if (command === "antidelete") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antidelete = !group.antidelete;

    saveDB();

    await sendText(
      chat,
      `🛡️ Anti Delete: ${group.antidelete ? "ON" : "OFF"}`
    );

    return true;
  }


  // ========================================
  // ANTI MENTION SW
  // ========================================

  if (command === "antimentionsw") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antimentionsw =
      !group.antimentionsw;

    saveDB();

    await sendText(
      chat,
      `🛡️ Anti Mention: ${group.antimentionsw ? "ON" : "OFF"}`
    );

    return true;
  }


  // ========================================
  // ANTI VIEW ONCE
  // ========================================

  if (command === "antiviewonce") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antiviewonce =
      !group.antiviewonce;

    saveDB();

    await sendText(
      chat,
      `🛡️ Anti View Once: ${group.antiviewonce ? "ON" : "OFF"}`
    );

    return true;
  }


  // ========================================
  // ANTI WA.ME
  // ========================================

  if (command === "antiwame") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antiwame = true;
    group.antiwameKick = true;

    saveDB();

    await sendText(
      chat,
      "🛡️ Anti wa.me aktif."
    );

    return true;
  }

  if (command === "antiwamenokick") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antiwame = true;
    group.antiwameKick = false;

    saveDB();

    await sendText(
      chat,
      "🛡️ Anti wa.me aktif tanpa kick."
    );

    return true;
  }


  // ========================================
  // ANTI LUAR
  // ========================================

  if (command === "antiluar") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antiluar =
      !group.antiluar;

    saveDB();

    await sendText(
      chat,
      `🌎 Anti Luar: ${group.antiluar ? "ON" : "OFF"}`
    );

    return true;
  }


  // ========================================
  // UNKNOWN GROUP COMMAND
  // ========================================

  return false;
}


console.log("✅ Bagian 3 berhasil dimuat.");
// ==========================================
// PART 4 - WARNING / LIST / POINT / REMINDER
// ==========================================


// ==========================================
// ⚠️ WARNING SYSTEM
// ==========================================

async function handleWarningCommand(message, command, args) {

  const chat = getChat(message);
  const sender = getSender(message);

  if (
    ![
      "warn",
      "unwarn",
      "cekwarn",
      "listwarn",
      "resetwarn"
    ].includes(command)
  ) {
    return false;
  }

  // ========================================
  // CEK WARN SENDIRI
  // ========================================

  if (command === "cekwarn") {

    const target =
      getQuotedParticipant(message) ||
      sender;

    const user =
      getUser(target);

    await sendText(
      chat,
      `⚠️ Warn @${jidNumber(target)}: ${user.warn || 0}/3`,
      {
        mentions: [target]
      }
    );

    return true;
  }


  // ========================================
  // LIST WARN
  // ========================================

  if (command === "listwarn") {

    if (!isGroup(chat)) {
      await sendText(
        chat,
        "❌ Command ini hanya untuk grup."
      );

      return true;
    }

    const metadata =
      await getGroupMetadataSafe(chat);

    if (!metadata) {
      await sendText(
        chat,
        "❌ Gagal mengambil data grup."
      );

      return true;
    }

    let result =
      "⚠️ *DAFTAR WARN*\n\n";

    let found = false;

    for (
      const participant
      of metadata.participants
    ) {

      const user =
        getUser(participant.id);

      if (user.warn > 0) {

        found = true;

        result +=
          `• @${jidNumber(participant.id)} : ${user.warn}/3\n`;
      }
    }

    if (!found) {
      result +=
        "Tidak ada member yang memiliki warn.";
    }

    const mentions =
      metadata.participants
        .filter(p => getUser(p.id).warn > 0)
        .map(p => p.id);

    await sendText(
      chat,
      result,
      {
        mentions
      }
    );

    return true;
  }


  // ========================================
  // ADMIN REQUIRED
  // ========================================

  const metadata =
    await requireAdmin(message);

  if (!metadata) {
    return true;
  }


  // ========================================
  // RESET WARN
  // ========================================

  if (command === "resetwarn") {

    const target =
      getQuotedParticipant(message) ||
      (args[0]
        ? userJid(args[0])
        : null);

    if (!target) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}resetwarn 628xxxxxxxxxx`
      );

      return true;
    }

    const user =
      getUser(target);

    user.warn = 0;

    saveDB();

    await sendText(
      chat,
      `✅ Warn @${jidNumber(target)} berhasil direset.`,
      {
        mentions: [target]
      }
    );

    return true;
  }


  // ========================================
  // UNWARN
  // ========================================

  if (command === "unwarn") {

    const target =
      getQuotedParticipant(message) ||
      (args[0]
        ? userJid(args[0])
        : null);

    if (!target) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}unwarn 628xxxxxxxxxx`
      );

      return true;
    }

    removeWarning(target);
    saveDB();

    const user =
      getUser(target);

    await sendText(
      chat,
      `✅ Warn @${jidNumber(target)} dikurangi.\n` +
      `⚠️ Sekarang: ${user.warn || 0}/3`,
      {
        mentions: [target]
      }
    );

    return true;
  }


  // ========================================
  // WARN
  // ========================================

  if (command === "warn") {

    const target =
      getQuotedParticipant(message) ||
      (args[0]
        ? userJid(args[0])
        : null);

    if (!target) {
      await sendText(
        chat,
        `Reply pesan target atau gunakan:\n${PREFIX}warn 628xxxxxxxxxx`
      );

      return true;
    }

    if (
      isOwner(target)
    ) {
      await sendText(
        chat,
        "❌ Owner tidak dapat diberikan warn."
      );

      return true;
    }

    const warn =
      addWarning(target);

    saveDB();

    // ======================================
    // KICK PADA WARN KE-3
    // ======================================

    if (warn >= 3) {

      const botAdmin =
        await isBotAdminSafe(
          chat,
          metadata
        );

      if (botAdmin) {

        try {

          await sock.groupParticipantsUpdate(
            chat,
            [target],
            "remove"
          );

          getUser(target).warn = 0;

          saveDB();

          await sendText(
            chat,
            `🚫 @${jidNumber(target)} telah dikeluarkan karena mencapai 3 warn.`,
            {
              mentions: [target]
            }
          );

        } catch {

          await sendText(
            chat,
            `⚠️ @${jidNumber(target)} mencapai 3 warn, tetapi bot gagal mengeluarkannya.`,
            {
              mentions: [target]
            }
          );
        }

      } else {

        await sendText(
          chat,
          `⚠️ @${jidNumber(target)} mencapai 3/3 warn.\nBot bukan admin sehingga tidak dapat mengeluarkannya.`,
          {
            mentions: [target]
          }
        );
      }

    } else {

      await sendText(
        chat,
        `⚠️ @${jidNumber(target)} mendapat warn.\n` +
        `Warn: ${warn}/3`,
        {
          mentions: [target]
        }
      );
    }

    return true;
  }

  return false;
}


// ==========================================
// 📋 LIST SYSTEM
// ==========================================

async function handleListCommand(
  message,
  command,
  args,
  text
) {

  const chat =
    getChat(message);

  if (
    ![
      "addlist",
      "updatelist",
      "uplist",
      "list",
      "dellist"
    ].includes(command)
  ) {
    return false;
  }


  // ========================================
  // TAMPILKAN LIST
  // ========================================

  if (command === "list") {

    if (!isGroup(chat)) {
      await sendText(
        chat,
        "❌ List ini hanya tersedia di grup."
      );

      return true;
    }

    const group =
      getGroup(chat);

    const lists =
      group.lists || [];

    if (!lists.length) {
      await sendText(
        chat,
        "📋 Belum ada list."
      );

      return true;
    }

    let result =
      "📋 *DAFTAR LIST*\n\n";

    for (
      let i = 0;
      i < lists.length;
      i++
    ) {

      result +=
        `${i + 1}. *${lists[i].name}*\n`;

      result +=
        `${lists[i].content}\n\n`;
    }

    await sendText(
      chat,
      result
    );

    return true;
  }


  // ========================================
  // ADMIN
  // ========================================

  const metadata =
    await requireAdmin(message);

  if (!metadata) {
    return true;
  }

  const group =
    getGroup(chat);

  if (!Array.isArray(group.lists)) {
    group.lists = [];
  }


  // ========================================
  // ADD LIST
  // ========================================

  if (command === "addlist") {

    const input =
      args.join(" ").trim();

    if (!input.includes("|")) {

      await sendText(
        chat,
        `Format:\n${PREFIX}addlist nama | isi list`
      );

      return true;
    }

    const [
      name,
      ...contentParts
    ] =
      input.split("|");

    const content =
      contentParts.join("|").trim();

    if (!name.trim() || !content) {

      await sendText(
        chat,
        `Format:\n${PREFIX}addlist nama | isi list`
      );

      return true;
    }

    group.lists.push({
      name: name.trim(),
      content,
      createdAt: Date.now()
    });

    saveDB();

    await sendText(
      chat,
      `✅ List *${name.trim()}* berhasil ditambahkan.`
    );

    return true;
  }


  // ========================================
  // UPDATE LIST
  // ========================================

  if (
    ["updatelist", "uplist"].includes(command)
  ) {

    const input =
      args.join(" ").trim();

    if (!input.includes("|")) {

      await sendText(
        chat,
        `Format:\n${PREFIX}uplist nama | isi baru`
      );

      return true;
    }

    const [
      name,
      ...contentParts
    ] =
      input.split("|");

    const content =
      contentParts.join("|").trim();

    const index =
      group.lists.findIndex(
        x =>
          x.name.toLowerCase() ===
          name.trim().toLowerCase()
      );

    if (index === -1) {

      await sendText(
        chat,
        "❌ List tidak ditemukan."
      );

      return true;
    }

    group.lists[index].content =
      content;

    group.lists[index].updatedAt =
      Date.now();

    saveDB();

    await sendText(
      chat,
      `✅ List *${name.trim()}* berhasil diperbarui.`
    );

    return true;
  }


  // ========================================
  // DELETE LIST
  // ========================================

  if (command === "dellist") {

    const name =
      args.join(" ").trim();

    if (!name) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}dellist nama`
      );

      return true;
    }

    const before =
      group.lists.length;

    group.lists =
      group.lists.filter(
        x =>
          x.name.toLowerCase() !==
          name.toLowerCase()
      );

    if (
      group.lists.length === before
    ) {

      await sendText(
        chat,
        "❌ List tidak ditemukan."
      );

      return true;
    }

    saveDB();

    await sendText(
      chat,
      `🗑️ List *${name}* berhasil dihapus.`
    );

    return true;
  }

  return false;
}


// ==========================================
// ⭐ POINT SYSTEM
// ==========================================

async function handlePointCommand(
  message,
  command,
  args
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  if (
    ![
      "addpoin",
      "addpoint",
      "cekpoint",
      "point",
      "listpoint"
    ].includes(command)
  ) {
    return false;
  }


  // ========================================
  // CEK POINT
  // ========================================

  if (
    ["cekpoint", "point"].includes(command)
  ) {

    const user =
      getUser(sender);

    await sendText(
      chat,
      `⭐ Point kamu: *${user.points || 0}*`
    );

    return true;
  }


  // ========================================
  // LIST POINT
  // ========================================

  if (command === "listpoint") {

    if (!isGroup(chat)) {
      await sendText(
        chat,
        "❌ Command ini hanya untuk grup."
      );

      return true;
    }

    const metadata =
      await getGroupMetadataSafe(chat);

    if (!metadata) {
      return true;
    }

    const data =
      metadata.participants
        .map(p => {
          const user =
            getUser(p.id);

          return {
            jid: p.id,
            points: Number(user.points || 0)
          };
        })
        .filter(x => x.points > 0)
        .sort(
          (a, b) =>
            b.points - a.points
        );

    if (!data.length) {

      await sendText(
        chat,
        "⭐ Belum ada point."
      );

      return true;
    }

    const mentions =
      data.map(x => x.jid);

    let result =
      "🏆 *POINT MEMBER*\n\n";

    data.forEach(
      (x, i) => {

        result +=
          `${i + 1}. @${jidNumber(x.jid)} — ${x.points}\n`;
      }
    );

    await sendText(
      chat,
      result,
      {
        mentions
      }
    );

    return true;
  }


  // ========================================
  // ADD POINT
  // ========================================

  if (
    ["addpoin", "addpoint"].includes(command)
  ) {

    if (!isOwner(sender)) {

      const metadata =
        await requireAdmin(message);

      if (!metadata) {
        return true;
      }
    }

    const target =
      getQuotedParticipant(message) ||
      (args[0]
        ? userJid(args[0])
        : null);

    let amountIndex =
      getQuotedParticipant(message)
        ? 0
        : 1;

    const amount =
      Number(
        args[amountIndex] || 1
      );

    if (!target || !amount) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}addpoin 628xxxxxxxxxx 10`
      );

      return true;
    }

    addPoint(
      target,
      amount
    );

    saveDB();

    const user =
      getUser(target);

    await sendText(
      chat,
      `⭐ Point @${jidNumber(target)} ditambah ${amount}.\n` +
      `Total: ${user.points || 0}`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  return false;
}


// ==========================================
// ⏰ REMINDER SYSTEM
// ==========================================

async function handleReminderCommand(
  message,
  command,
  args,
  text
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  if (
    ![
      "addreminder",
      "addalarm",
      "listreminder",
      "listalarm",
      "delreminder",
      "createschedulecall",
      "groupschedule"
    ].includes(command)
  ) {
    return false;
  }


  // ========================================
  // GROUP ONLY
  // ========================================

  if (!(await requireGroup(message))) {
    return true;
  }

  const group =
    getGroup(chat);

  if (!Array.isArray(group.reminders)) {
    group.reminders = [];
  }


  // ========================================
  // LIST REMINDER
  // ========================================

  if (
    ["listreminder", "listalarm"].includes(command)
  ) {

    if (!group.reminders.length) {

      await sendText(
        chat,
        "⏰ Tidak ada reminder."
      );

      return true;
    }

    let result =
      "⏰ *REMINDER GRUP*\n\n";

    for (
      let i = 0;
      i < group.reminders.length;
      i++
    ) {

      const r =
        group.reminders[i];

      result +=
        `${i + 1}. ${r.text}\n`;

      result +=
        `   ⏱️ ${new Date(r.time).toLocaleString("id-ID")}\n\n`;
    }

    await sendText(
      chat,
      result
    );

    return true;
  }


  // ========================================
  // DELETE REMINDER
  // ========================================

  if (command === "delreminder") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const index =
      Number(args[0]) - 1;

    if (
      !Number.isInteger(index) ||
      !group.reminders[index]
    ) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}delreminder 1`
      );

      return true;
    }

    group.reminders.splice(
      index,
      1
    );

    saveDB();

    await sendText(
      chat,
      "🗑️ Reminder berhasil dihapus."
    );

    return true;
  }


  // ========================================
  // ADD REMINDER
  // ========================================

  const metadata =
    await requireAdmin(message);

  if (!metadata) {
    return true;
  }


  // Format:
  // .addreminder 10m | Pesan
  // .addreminder 1h | Pesan

  const input =
    args.join(" ").trim();

  if (!input.includes("|")) {

    await sendText(
      chat,
      `Format:\n${PREFIX}addreminder 10m | Pesan reminder`
    );

    return true;
  }

  const [
    durationText,
    ...messageParts
  ] =
    input.split("|");

  const duration =
    parseDuration(
      durationText.trim()
    );

  const reminderText =
    messageParts
      .join("|")
      .trim();

  if (!duration || !reminderText) {

    await sendText(
      chat,
      `Format:\n${PREFIX}addreminder 10m | Pesan reminder`
    );

    return true;
  }

  const reminder = {
    id: randomId("REM"),
    text: reminderText,
    time: Date.now() + duration,
    creator: jidNumber(sender),
    createdAt: Date.now()
  };

  group.reminders.push(
    reminder
  );

  saveDB();

  await sendText(
    chat,
    `⏰ *REMINDER DIBUAT*\n\n` +
    `📝 ${reminderText}\n` +
    `⏱️ ${new Date(reminder.time).toLocaleString("id-ID")}`
  );

  return true;
}


// ==========================================
// AFK COMMAND
// ==========================================

async function handleAfkCommand(
  message,
  command,
  args,
  text
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  if (command !== "afk") {
    return false;
  }

  const user =
    getUser(sender);

  const reason =
    args.join(" ").trim() ||
    "AFK";

  user.afk = {
    reason,
    time: Date.now()
  };

  saveDB();

  await sendText(
    chat,
    `💤 Kamu sekarang AFK.\n\n` +
    `Alasan: ${reason}`
  );

  return true;
}


console.log("✅ Part 4 berhasil dimuat.");
// ==========================================
// PART 5 - GAME SYSTEM
// ==========================================


// ==========================================
// 🎮 GAME COMMAND HANDLER
// ==========================================

async function handleGameCommand(
  message,
  command,
  args,
  text
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  const gameCommands = [
    "game",
    "games",
    "tebak",
    "tebakkata",
    "tebaktebakan",
    "asahotak",
    "caklontong",
    "family100",
    "math",
    "hitung",
    "truth",
    "dare",
    "akinator",
    "stopgame",
    "surrender"
  ];

  if (!gameCommands.includes(command)) {
    return false;
  }


  // ========================================
  // STOP GAME
  // ========================================

  if (
    command === "stopgame" ||
    command === "surrender"
  ) {

    const game =
      gameSessions.get(chat);

    if (!game) {

      await sendText(
        chat,
        "❌ Tidak ada game yang sedang berjalan."
      );

      return true;
    }

    gameSessions.delete(chat);

    await sendText(
      chat,
      "🛑 Game dihentikan."
    );

    return true;
  }


  // ========================================
  // GAME MENU
  // ========================================

  if (
    command === "game" ||
    command === "games"
  ) {

    await sendText(
      chat,
      `🎮 *GAME MENU*\n\n` +
      `• ${PREFIX}tebak\n` +
      `• ${PREFIX}tebakkata\n` +
      `• ${PREFIX}asahotak\n` +
      `• ${PREFIX}caklontong\n` +
      `• ${PREFIX}family100\n` +
      `• ${PREFIX}math\n` +
      `• ${PREFIX}truth\n` +
      `• ${PREFIX}dare\n` +
      `• ${PREFIX}akinator\n\n` +
      `Ketik ${PREFIX}stopgame untuk menghentikan game.`
    );

    return true;
  }


  // ========================================
  // CEK GAME YANG SEDANG BERJALAN
  // ========================================

  if (gameSessions.has(chat)) {

    await sendText(
      chat,
      "🎮 Masih ada game yang sedang berjalan.\n" +
      `Jawab game tersebut atau gunakan ${PREFIX}stopgame.`
    );

    return true;
  }


  // ========================================
  // TEBAK TEBAKAN
  // ========================================

  if (
    command === "tebak" ||
    command === "tebaktebakan" ||
    command === "asahotak"
  ) {

    const data =
      randomRiddle();

    startGame(
      chat,
      {
        type: "riddle",
        question: data.question,
        answer: data.answer,
        creator: sender,
        startedAt: Date.now()
      }
    );

    await sendText(
      chat,
      `🧠 *ASAH OTAK*\n\n` +
      `❓ ${data.question}\n\n` +
      `💡 Jawab dengan mengirim jawabannya.\n` +
      `🛑 ${PREFIX}stopgame untuk menyerah.`
    );

    return true;
  }


  // ========================================
  // TEBAK KATA
  // ========================================

  if (
    command === "tebakkata"
  ) {

    const data =
      randomWordGame();

    startGame(
      chat,
      {
        type: "word",
        question: data.question,
        answer: data.answer,
        creator: sender,
        startedAt: Date.now()
      }
    );

    await sendText(
      chat,
      `🔤 *TEBAK KATA*\n\n` +
      `Petunjuk: ${data.question}\n\n` +
      `Ketik jawabanmu.`
    );

    return true;
  }


  // ========================================
  // CAK LONTONG
  // ========================================

  if (
    command === "caklontong"
  ) {

    const data = randomRiddle();

    startGame(
      chat,
      {
        type: "caklontong",
        question: data.question,
        answer: data.answer,
        creator: sender,
        startedAt: Date.now()
      }
    );

    await sendText(
      chat,
      `🤣 *CAK LONTONG*\n\n` +
      `❓ ${data.question}\n\n` +
      `Jawab dengan jawabanmu!`
    );

    return true;
  }


  // ========================================
  // FAMILY 100
  // ========================================

  if (
    command === "family100"
  ) {

    const questions = [
      {
        question:
          "Sebutkan benda yang biasanya ada di kamar tidur.",
        answers: [
          "kasur",
          "bantal",
          "selimut",
          "lemari",
          "meja"
        ]
      },
      {
        question:
          "Sebutkan aplikasi media sosial yang populer.",
        answers: [
          "tiktok",
          "instagram",
          "facebook",
          "whatsapp",
          "youtube"
        ]
      },
      {
        question:
          "Sebutkan makanan yang sering dimakan saat sarapan.",
        answers: [
          "nasi",
          "roti",
          "bubur",
          "telur",
          "sereal"
        ]
      }
    ];

    const selected =
      questions[
        Math.floor(
          Math.random() *
          questions.length
        )
      ];

    startGame(
      chat,
      {
        type: "family100",
        question: selected.question,
        answers: selected.answers,
        found: [],
        creator: sender,
        startedAt: Date.now()
      }
    );

    await sendText(
      chat,
      `👨‍👩‍👧‍👦 *FAMILY 100*\n\n` +
      `❓ ${selected.question}\n\n` +
      `🎯 Tebak semua jawaban yang ada!`
    );

    return true;
  }


  // ========================================
  // MATH
  // ========================================

  if (
    command === "math" ||
    command === "hitung"
  ) {

    const question =
      createMathQuestion();

    startGame(
      chat,
      {
        type: "math",
        question: question.text,
        answer: String(question.answer),
        creator: sender,
        startedAt: Date.now()
      }
    );

    await sendText(
      chat,
      `🧮 *MATH GAME*\n\n` +
      `❓ ${question.text}\n\n` +
      `⏱️ Jawab dengan angka yang benar.`
    );

    return true;
  }


  // ========================================
  // TRUTH
  // ========================================

  if (
    command === "truth"
  ) {

    const truths = [
      "Apa hal paling memalukan yang pernah kamu alami?",
      "Siapa orang yang paling sering kamu chat?",
      "Apa cita-cita yang ingin kamu capai?",
      "Apa kebiasaan buruk yang ingin kamu hilangkan?",
      "Apa hal yang paling kamu takutkan?"
    ];

    const question =
      truths[
        Math.floor(
          Math.random() *
          truths.length
        )
      ];

    await sendText(
      chat,
      `😇 *TRUTH*\n\n${question}`
    );

    return true;
  }


  // ========================================
  // DARE
  // ========================================

  if (
    command === "dare"
  ) {

    const dares = [
      "Kirim emoji yang paling sering kamu gunakan.",
      "Kirim foto profilmu.",
      "Ketik nama panggilanmu 5 kali.",
      "Kirim pesan menggunakan 5 emoji.",
      "Ketik 'ZazaBot keren' sebanyak 3 kali."
    ];

    const dare =
      dares[
        Math.floor(
          Math.random() *
          dares.length
        )
      ];

    await sendText(
      chat,
      `🔥 *DARE*\n\n${dare}`
    );

    return true;
  }


  // ========================================
  // AKINATOR
  // ========================================

  if (
    command === "akinator"
  ) {

    await sendText(
      chat,
      `🧞 *AKINATOR*\n\n` +
      `Game Akinator online membutuhkan layanan/API eksternal.\n\n` +
      `Untuk sementara fitur ini belum menggunakan API eksternal agar bot tetap stabil.`
    );

    return true;
  }

  return false;
}


// ==========================================
// 🎯 JAWABAN GAME
// ==========================================

async function handleGameAnswer(
  message,
  text
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  const answerText =
    cleanText(text);

  if (!answerText) {
    return false;
  }

  const game =
    gameSessions.get(chat);

  if (!game) {
    return false;
  }


  // ========================================
  // FAMILY 100
  // ========================================

  if (
    game.type === "family100"
  ) {

    const index =
      game.answers.findIndex(
        answer =>
          cleanText(answer) ===
          answerText
      );

    if (index === -1) {
      return false;
    }

    if (
      game.found.includes(index)
    ) {
      return true;
    }

    game.found.push(index);

    const foundAnswer =
      game.answers[index];

    addPoint(
      sender,
      1
    );

    addXP(
      sender,
      10
    );

    saveDB();

    await sendText(
      chat,
      `✅ Benar!\n\n` +
      `🎯 Jawaban: *${foundAnswer}*\n` +
      `⭐ +1 point\n` +
      `✨ +10 XP`
    );

    if (
      game.found.length >=
      game.answers.length
    ) {

      gameSessions.delete(chat);

      await sendText(
        chat,
        `🎉 *FAMILY 100 SELESAI!*\n\n` +
        `Semua jawaban berhasil ditemukan!`
      );
    }

    return true;
  }


  // ========================================
  // GAME BIASA
  // ========================================

  const correct =
    cleanText(game.answer) ===
    answerText;

  if (!correct) {
    return false;
  }

  gameSessions.delete(chat);

  addPoint(
    sender,
    1
  );

  addXP(
    sender,
    10
  );

  saveDB();

  await sendText(
    chat,
    `🎉 *BENAR!*\n\n` +
    `👤 @${jidNumber(sender)}\n` +
    `⭐ +1 Point\n` +
    `✨ +10 XP`,
    {
      mentions: [sender]
    }
  );

  return true;
}


// ==========================================
// 🏆 LEADERBOARD
// ==========================================

async function handleLeaderboard(
  message,
  command
) {

  if (
    ![
      "leaderboard",
      "leader",
      "top",
      "ranking"
    ].includes(command)
  ) {
    return false;
  }

  const chat =
    getChat(message);

  if (!isGroup(chat)) {

    await sendText(
      chat,
      "❌ Leaderboard hanya tersedia di grup."
    );

    return true;
  }

  const metadata =
    await getGroupMetadataSafe(chat);

  if (!metadata) {
    return true;
  }

  const data =
    metadata.participants
      .map(p => {

        const user =
          getUser(p.id);

        return {
          jid: p.id,
          points: Number(user.points || 0),
          xp: Number(user.xp || 0),
          level: Number(user.level || 1)
        };
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.xp - a.xp
      )
      .slice(0, 10);

  let result =
    "🏆 *LEADERBOARD GRUP*\n\n";

  const mentions =
    data.map(x => x.jid);

  data.forEach(
    (x, index) => {

      result +=
        `${index + 1}. @${jidNumber(x.jid)}\n`;

      result +=
        `   ⭐ Point: ${x.points}\n`;

      result +=
        `   ✨ XP: ${x.xp}\n`;

      result +=
        `   🎖️ Level: ${x.level}\n\n`;
    }
  );

  await sendText(
    chat,
    result,
    {
      mentions
    }
  );

  return true;
}


// ==========================================
// AUTO XP PESAN
// ==========================================

function giveMessageXP(
  sender
) {

  if (!sender) {
    return;
  }

  const user =
    getUser(sender);

  user.xp =
    Number(user.xp || 0) + 1;

  const oldLevel =
    Number(user.level || 1);

  const newLevel =
    Math.floor(
      Math.sqrt(user.xp / 10)
    ) + 1;

  user.level =
    Math.max(
      oldLevel,
      newLevel
    );

  saveDB();
}


// ==========================================
// GAME TIMER
// ==========================================

function cleanupExpiredGames() {

  const now =
    Date.now();

  for (
    const [chat, game]
    of gameSessions.entries()
  ) {

    if (
      now - game.startedAt >
      5 * 60 * 1000
    ) {

      gameSessions.delete(chat);

      if (sock) {

        sendText(
          chat,
          "⏰ Game otomatis berakhir karena tidak ada jawaban selama 5 menit."
        ).catch(() => {});
      }
    }
  }
}


// ==========================================
// JALANKAN CLEANUP GAME
// ==========================================

setInterval(
  cleanupExpiredGames,
  60 * 1000
);


console.log("✅ Part 5 berhasil dimuat.");
// ==========================================
// PART 6 - AFK / PARTICIPANT / SECURITY
// ==========================================


// ==========================================
// 💤 CEK AFK & AUTO REMOVE AFK
// ==========================================

async function handleAfk(
  message,
  text
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  const user =
    getUser(sender);

  // ========================================
  // USER KEMBALI DARI AFK
  // ========================================

  if (user.afk) {

    const afkData =
      user.afk;

    const duration =
      Date.now() - afkData.time;

    delete user.afk;

    saveDB();

    const seconds =
      Math.floor(duration / 1000);

    const minutes =
      Math.floor(seconds / 60);

    const hours =
      Math.floor(minutes / 60);

    let timeText;

    if (hours > 0) {
      timeText =
        `${hours} jam ${minutes % 60} menit`;
    } else if (minutes > 0) {
      timeText =
        `${minutes} menit`;
    } else {
      timeText =
        `${seconds} detik`;
    }

    await sendText(
      chat,
      `👋 Selamat datang kembali @${jidNumber(sender)}!\n\n` +
      `Kamu AFK selama *${timeText}*.\n` +
      `Alasan: ${afkData.reason}`,
      {
        mentions: [sender]
      }
    );

    return true;
  }


  // ========================================
  // CEK ORANG YANG DI-MENTION
  // ========================================

  const mentioned =
    message.message?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid || [];

  if (!mentioned.length) {
    return false;
  }

  for (
    const jid of mentioned
  ) {

    const target =
      getUser(jid);

    if (!target.afk) {
      continue;
    }

    const duration =
      Date.now() - target.afk.time;

    const minutes =
      Math.floor(
        duration / 60000
      );

    await sendText(
      chat,
      `💤 @${jidNumber(jid)} sedang AFK.\n\n` +
      `📝 Alasan: ${target.afk.reason}\n` +
      `⏱️ Selama: ${minutes} menit`,
      {
        mentions: [jid]
      }
    );
  }

  return true;
}


// ==========================================
// 👥 PARTICIPANT HANDLER
// ==========================================

async function handleParticipants(
  update
) {

  if (
    !update ||
    !update.id ||
    !Array.isArray(update.participants)
  ) {
    return;
  }

  const chat =
    update.id;

  const group =
    getGroup(chat);

  const action =
    update.action;

  const participants =
    update.participants;


  // ========================================
  // WELCOME
  // ========================================

  if (
    action === "add" &&
    group.welcome
  ) {

    for (
      const jid of participants
    ) {

      await sendText(
        chat,
        `👋 Selamat datang @${jidNumber(jid)}!\n\n` +
        `🎉 Selamat bergabung di grup.\n` +
        `📖 Jangan lupa baca deskripsi dan peraturan grup.`,
        {
          mentions: [jid]
        }
      );
    }
  }


  // ========================================
  // GOODBYE
  // ========================================

  if (
    action === "remove" &&
    group.goodbye
  ) {

    for (
      const jid of participants
    ) {

      await sendText(
        chat,
        `👋 Selamat tinggal @${jidNumber(jid)}.\n` +
        `Semoga sukses di luar grup!`,
        {
          mentions: [jid]
        }
      );
    }
  }


  // ========================================
  // PROMOTE
  // ========================================

  if (
    action === "promote"
  ) {

    for (
      const jid of participants
    ) {

      await sendText(
        chat,
        `👑 Selamat @${jidNumber(jid)}!\n` +
        `Sekarang kamu menjadi admin grup.`,
        {
          mentions: [jid]
        }
      );
    }
  }


  // ========================================
  // DEMOTE
  // ========================================

  if (
    action === "demote"
  ) {

    for (
      const jid of participants
    ) {

      await sendText(
        chat,
        `📉 @${jidNumber(jid)} tidak lagi menjadi admin.`,
        {
          mentions: [jid]
        }
      );
    }
  }
}


// ==========================================
// 🔐 GROUP SECURITY
// ==========================================

async function handleGroupSecurity(
  message,
  text
) {

  const chat =
    getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const group =
    getGroup(chat);

  const metadata =
    await getGroupMetadataSafe(chat);

  if (!metadata) {
    return false;
  }

  const sender =
    getSender(message);

  const senderIsAdmin =
    isParticipantAdmin(
      metadata,
      sender
    );

  const botIsAdmin =
    await isBotAdminSafe(
      chat,
      metadata
    );


  // ========================================
  // 🚫 ANTILINK
  // ========================================

  if (
    group.antilink &&
    !senderIsAdmin &&
    !isOwner(sender)
  ) {

    const hasLink =
      /https?:\/\/|www\.|chat\.whatsapp\.com\//i
        .test(text || "");

    if (hasLink) {

      if (!botIsAdmin) {

        await sendText(
          chat,
          `⚠️ @${jidNumber(sender)} mengirim link.\n` +
          `Bot bukan admin sehingga tidak dapat mengambil tindakan.`,
          {
            mentions: [sender]
          }
        );

        return true;
      }

      try {

        await sock.sendMessage(
          chat,
          {
            delete:
              message.key
          }
        );

      } catch {}

      if (
        group.antilinkKick
      ) {

        try {

          await sock.groupParticipantsUpdate(
            chat,
            [sender],
            "remove"
          );

        } catch {}
      }

      await sendText(
        chat,
        `🚫 Link terdeteksi dari @${jidNumber(sender)}.`,
        {
          mentions: [sender]
        }
      );

      return true;
    }
  }


  // ========================================
  // 🚫 ANTI WAME
  // ========================================

  if (
    group.antiwame &&
    !senderIsAdmin &&
    !isOwner(sender)
  ) {

    const isWaMe =
      /wa\.me\/|api\.whatsapp\.com\/send/i
        .test(text || "");

    if (isWaMe) {

      if (botIsAdmin) {

        try {

          await sock.sendMessage(
            chat,
            {
              delete:
                message.key
            }
          );

        } catch {}

        if (
          group.antiwameKick
        ) {

          try {

            await sock.groupParticipantsUpdate(
              chat,
              [sender],
              "remove"
            );

          } catch {}
        }
      }

      await sendText(
        chat,
        `🚫 Link WhatsApp terdeteksi dari @${jidNumber(sender)}.`,
        {
          mentions: [sender]
        }
      );

      return true;
    }
  }


  // ========================================
  // 🤬 ANTI BADWORD
  // ========================================

  if (
    group.antibadword &&
    !senderIsAdmin &&
    !isOwner(sender)
  ) {

    const badwords =
      Array.isArray(group.badwords)
        ? group.badwords
        : [];

    const lowerText =
      String(text || "")
        .toLowerCase();

    const found =
      badwords.find(
        word =>
          word &&
          lowerText.includes(
            String(word).toLowerCase()
          )
      );

    if (found) {

      if (botIsAdmin) {

        try {

          await sock.sendMessage(
            chat,
            {
              delete:
                message.key
            }
          );

        } catch {}

        if (
          group.antibadwordKick
        ) {

          try {

            await sock.groupParticipantsUpdate(
              chat,
              [sender],
              "remove"
            );

          } catch {}
        }
      }

      await sendText(
        chat,
        `⚠️ @${jidNumber(sender)}, kata tersebut dilarang di grup.`,
        {
          mentions: [sender]
        }
      );

      return true;
    }
  }


  // ========================================
  // 📢 ANTI MENTION EVERYONE
  // ========================================

  if (
    group.antimentionsw &&
    !senderIsAdmin &&
    !isOwner(sender)
  ) {

    const mentions =
      message.message
        ?.extendedTextMessage
        ?.contextInfo
        ?.mentionedJid || [];

    if (
      mentions.length >= 5
    ) {

      if (botIsAdmin) {

        try {

          await sock.sendMessage(
            chat,
            {
              delete:
                message.key
            }
          );

        } catch {}
      }

      await sendText(
        chat,
        `⚠️ @${jidNumber(sender)}, jangan mention terlalu banyak member.`,
        {
          mentions: [sender]
        }
      );

      return true;
    }
  }


  return false;
}


// ==========================================
// 👁️ ANTI VIEW ONCE
// ==========================================

async function handleAntiViewOnce(
  message
) {

  const chat =
    getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const group =
    getGroup(chat);

  if (!group.antiviewonce) {
    return false;
  }

  const msg =
    message.message;

  if (
    !msg?.viewOnceMessage &&
    !msg?.viewOnceMessageV2 &&
    !msg?.viewOnceMessageV2Extension
  ) {
    return false;
  }

  try {

    const viewOnce =
      msg.viewOnceMessage ||
      msg.viewOnceMessageV2 ||
      msg.viewOnceMessageV2Extension;

    const content =
      viewOnce.message;

    if (
      content?.imageMessage
    ) {

      const buffer =
        await getImageBuffer(
          message
        );

      if (buffer) {

        await sock.sendMessage(
          chat,
          {
            image: buffer,
            caption:
              "👁️ View Once berhasil dibuka."
          }
        );

        return true;
      }
    }

    if (
      content?.videoMessage
    ) {

      const stream =
        await downloadContentFromMessage(
          content.videoMessage,
          "video"
        );

      const chunks = [];

      for await (
        const chunk of stream
      ) {
        chunks.push(chunk);
      }

      const buffer =
        Buffer.concat(chunks);

      await sock.sendMessage(
        chat,
        {
          video: buffer,
          caption:
            "👁️ View Once berhasil dibuka."
        }
      );

      return true;
    }

  } catch (error) {

    console.log(
      "Anti view once error:",
      error.message
    );
  }

  return false;
}


// ==========================================
// 🛡️ SECURITY MESSAGE CHECK
// ==========================================

async function runSecurityChecks(
  message,
  text
) {

  try {

    if (
      await handleAntiViewOnce(message)
    ) {
      return true;
    }

    if (
      await handleGroupSecurity(
        message,
        text
      )
    ) {
      return true;
    }

  } catch (error) {

    console.log(
      "Security error:",
      error.message
    );
  }

  return false;
}


console.log("✅ Part 6 berhasil dimuat.");
// ==========================================
// PART 7 - TOOLS / UTILITAS
// ==========================================


// ==========================================
// 🧹 CLEAR SESSION
// ==========================================

async function handleToolsCommand(
  message,
  command,
  args,
  text
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  const toolCommands = [
    "sticker",
    "stiker",
    "toimg",
    "toimage",
    "attp",
    "ttp",
    "say",
    "qrcode",
    "qr",
    "shortlink",
    "tourl",
    "getpp",
    "getbio",
    "getid",
    "cekid",
    "jid",
    "tagme"
  ];

  if (!toolCommands.includes(command)) {
    return false;
  }


  // ========================================
  // 🆔 CEK ID
  // ========================================

  if (
    command === "getid" ||
    command === "cekid" ||
    command === "jid"
  ) {

    const target =
      getQuotedParticipant(message) ||
      sender;

    await sendText(
      chat,
      `🆔 *ID WHATSAPP*\n\n` +
      `👤 Nomor: ${jidNumber(target)}\n` +
      `📱 JID: ${target}`
    );

    return true;
  }


  // ========================================
  // 👤 TAG ME
  // ========================================

  if (
    command === "tagme"
  ) {

    await sendText(
      chat,
      `👤 @${jidNumber(sender)}`,
      {
        mentions: [sender]
      }
    );

    return true;
  }


  // ========================================
  // 📝 SAY
  // ========================================

  if (
    command === "say"
  ) {

    const sayText =
      args.join(" ").trim();

    if (!sayText) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}say Halo semuanya`
      );

      return true;
    }

    await sendText(
      chat,
      sayText
    );

    return true;
  }


  // ========================================
  // 🔳 QR CODE
  // ========================================

  if (
    command === "qr" ||
    command === "qrcode"
  ) {

    const qrText =
      args.join(" ").trim();

    if (!qrText) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}qr https://example.com`
      );

      return true;
    }

    try {

      const buffer =
        await QRCode.toBuffer(
          qrText,
          {
            width: 600,
            margin: 2
          }
        );

      await sock.sendMessage(
        chat,
        {
          image: buffer,
          caption:
            `🔳 QR Code\n\n${qrText}`
        }
      );

    } catch (error) {

      await sendText(
        chat,
        `❌ Gagal membuat QR Code.\n${error.message}`
      );
    }

    return true;
  }


  // ========================================
  // 🖼️ GET PROFILE PICTURE
  // ========================================

  if (
    command === "getpp"
  ) {

    const target =
      getQuotedParticipant(message) ||
      sender;

    try {

      const url =
        await sock.profilePictureUrl(
          target,
          "image"
        );

      await sock.sendMessage(
        chat,
        {
          image: {
            url
          },
          caption:
            `🖼️ Foto profil @${jidNumber(target)}`,
          mentions: [target]
        }
      );

    } catch {

      await sendText(
        chat,
        "❌ Foto profil tidak tersedia."
      );
    }

    return true;
  }


  // ========================================
  // 📖 GET BIO
  // ========================================

  if (
    command === "getbio"
  ) {

    const target =
      getQuotedParticipant(message) ||
      sender;

    try {

      const data =
        await sock.fetchStatus(
          target
        );

      const status =
        data?.status ||
        "Tidak ada bio.";

      await sendText(
        chat,
        `📖 *BIO*\n\n` +
        `👤 @${jidNumber(target)}\n` +
        `📝 ${status}`,
        {
          mentions: [target]
        }
      );

    } catch {

      await sendText(
        chat,
        "❌ Gagal mengambil bio."
      );
    }

    return true;
  }


  // ========================================
  // 🔗 SHORTLINK / TOURL
  // ========================================

  if (
    command === "shortlink" ||
    command === "tourl"
  ) {

    await sendText(
      chat,
      "ℹ️ Fitur upload/shortlink membutuhkan layanan eksternal. Untuk menjaga bot tetap stabil, fitur ini belum menggunakan API pihak ketiga."
    );

    return true;
  }


  // ========================================
  // 🖼️ STICKER
  // ========================================

  if (
    command === "sticker" ||
    command === "stiker"
  ) {

    const quoted =
      getQuotedMessage(message);

    const imageMessage =
      message.message?.imageMessage ||
      quoted?.imageMessage;

    const videoMessage =
      message.message?.videoMessage ||
      quoted?.videoMessage;

    if (
      !imageMessage &&
      !videoMessage
    ) {

      await sendText(
        chat,
        `🖼️ Kirim/reply gambar atau video lalu ketik ${PREFIX}sticker`
      );

      return true;
    }

    try {

      let buffer;

      if (imageMessage) {

        const stream =
          await downloadContentFromMessage(
            imageMessage,
            "image"
          );

        const chunks = [];

        for await (
          const chunk of stream
        ) {
          chunks.push(chunk);
        }

        buffer =
          Buffer.concat(chunks);

      } else {

        const stream =
          await downloadContentFromMessage(
            videoMessage,
            "video"
          );

        const chunks = [];

        for await (
          const chunk of stream
        ) {
          chunks.push(chunk);
        }

        buffer =
          Buffer.concat(chunks);
      }


      // ====================================
      // CONVERT KE WEBP
      // ====================================

      let webp;

      if (imageMessage) {

        webp =
          await sharp(buffer)
            .resize({
              width: 512,
              height: 512,
              fit: "inside"
            })
            .webp()
            .toBuffer();

      } else {

        // Video dibuat sebagai gambar
        // frame pertama untuk menghindari
        // proses berat di server.

        webp =
          await sharp(buffer)
            .resize({
              width: 512,
              height: 512,
              fit: "inside"
            })
            .webp()
            .toBuffer();
      }

      await sock.sendMessage(
        chat,
        {
          sticker: webp
        }
      );

    } catch (error) {

      console.log(
        "Sticker error:",
        error.message
      );

      await sendText(
        chat,
        "❌ Gagal membuat sticker.\n\n" +
        "Pastikan file yang dikirim adalah gambar yang valid."
      );
    }

    return true;
  }


  // ========================================
  // 🖼️ TO IMAGE
  // ========================================

  if (
    command === "toimg" ||
    command === "toimage"
  ) {

    const quoted =
      getQuotedMessage(message);

    const sticker =
      message.message?.stickerMessage ||
      quoted?.stickerMessage;

    if (!sticker) {

      await sendText(
        chat,
        `Reply sticker lalu ketik ${PREFIX}toimg`
      );

      return true;
    }

    try {

      const stream =
        await downloadContentFromMessage(
          sticker,
          "sticker"
        );

      const chunks = [];

      for await (
        const chunk of stream
      ) {
        chunks.push(chunk);
      }

      const buffer =
        Buffer.concat(chunks);

      const image =
        await sharp(buffer)
          .png()
          .toBuffer();

      await sock.sendMessage(
        chat,
        {
          image,
          caption:
            "🖼️ Sticker berhasil diubah menjadi gambar."
        }
      );

    } catch (error) {

      await sendText(
        chat,
        "❌ Gagal mengubah sticker menjadi gambar."
      );
    }

    return true;
  }


  // ========================================
  // 📝 TTP
  // ========================================

  if (
    command === "ttp" ||
    command === "attp"
  ) {

    const stickerText =
      args.join(" ").trim();

    if (!stickerText) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}ttp Zaza Store`
      );

      return true;
    }

    try {

      // Membuat gambar sederhana
      // menggunakan SVG lalu dikonversi
      // menjadi WebP.

      const safeText =
        stickerText
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

      const svg = `
        <svg
          width="512"
          height="512"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            width="100%"
            height="100%"
            rx="60"
            fill="#ffffff"
          />

          <text
            x="256"
            y="256"
            text-anchor="middle"
            dominant-baseline="middle"
            font-family="Arial"
            font-size="48"
            font-weight="bold"
            fill="#000000"
          >
            ${safeText}
          </text>
        </svg>
      `;

      const webp =
        await sharp(
          Buffer.from(svg)
        )
          .webp()
          .toBuffer();

      await sock.sendMessage(
        chat,
        {
          sticker: webp
        }
      );

    } catch (error) {

      console.log(
        "TTP error:",
        error.message
      );

      await sendText(
        chat,
        "❌ Gagal membuat sticker teks."
      );
    }

    return true;
  }


  return false;
}


// ==========================================
// 🛠️ BOT STATUS
// ==========================================

async function sendBotStatus(
  chat
) {

  const memory =
    process.memoryUsage();

  const memoryMB =
    (
      memory.rss /
      1024 /
      1024
    ).toFixed(2);

  await sendText(
    chat,
    `📊 *STATUS ZAZABOT*\n\n` +
    `🤖 Bot: ${BOT_NAME}\n` +
    `📡 Connection: ${connectionStatus}\n` +
    `👤 Mode: ${publicMode ? "Public" : "Self"}\n` +
    `💾 RAM: ${memoryMB} MB\n` +
    `⏱️ Runtime: ${formatRuntime(
      Date.now() - startedAt
    )}`
  );
}


// ==========================================
// 📈 STATISTIK DATABASE
// ==========================================

function getDatabaseStats() {

  const users =
    Object.keys(
      db.users || {}
    ).length;

  const groups =
    Object.keys(
      db.groups || {}
    ).length;

  const orders =
    Object.keys(
      db.orders || {}
    ).length;

  let premium = 0;

  for (
    const jid of Object.keys(
      db.users || {}
    )
  ) {

    if (
      isPremium(jid)
    ) {
      premium++;
    }
  }

  return {
    users,
    groups,
    orders,
    premium
  };
}


// ==========================================
// 💾 DATABASE BACKUP MEMORY
// ==========================================

function safeSaveDatabase() {

  try {

    saveDB();

    return true;

  } catch (error) {

    console.log(
      "Database save error:",
      error.message
    );

    return false;
  }
}


// ==========================================
// 🧪 TEST DATABASE
// ==========================================

function testDatabase() {

  try {

    if (!db) {
      return false;
    }

    if (!db.users) {
      db.users = {};
    }

    if (!db.groups) {
      db.groups = {};
    }

    if (!db.orders) {
      db.orders = {};
    }

    return true;

  } catch {

    return false;
  }
}


// ==========================================
// 🧹 CLEAN DATABASE
// ==========================================

function cleanupDatabase() {

  try {

    const now =
      Date.now();

    // Hapus AFK yang terlalu lama
    for (
      const jid of Object.keys(
        db.users || {}
      )
    ) {

      const user =
        db.users[jid];

      if (
        user.afk &&
        now - user.afk.time >
        24 * 60 * 60 * 1000
      ) {

        delete user.afk;
      }
    }

    saveDB();

  } catch (error) {

    console.log(
      "Database cleanup error:",
      error.message
    );
  }
}


// ==========================================
// DATABASE CLEANUP SETIAP 30 MENIT
// ==========================================

setInterval(
  cleanupDatabase,
  30 * 60 * 1000
);


// ==========================================
// TEST DATABASE SAAT START
// ==========================================

testDatabase();

console.log("✅ Part 7 berhasil dimuat.");
// ==========================================
// PART 8 - HANDLE MESSAGE & START BOT
// ==========================================


// ==========================================
// 📩 HANDLE MESSAGE
// ==========================================

async function handleMessage(message) {

  try {

    if (!message?.message) {
      return;
    }

    const chat =
      getChat(message);

    const sender =
      getSender(message);

    if (!chat || !sender) {
      return;
    }

    // ======================================
    // AMBIL TEXT PESAN
    // ======================================

    const text =
      getMessageText(message);

    if (!text) {
      return;
    }

    const trimmed =
      text.trim();

    // ======================================
    // AUTO XP
    // ======================================

    if (
      sender &&
      !isOwner(sender)
    ) {

      giveMessageXP(sender);
    }

    // ======================================
    // AFK CHECK
    // ======================================

    try {

      await handleAfk(
        message,
        text
      );

    } catch (error) {

      console.log(
        "AFK error:",
        error.message
      );
    }


    // ======================================
    // SECURITY
    // ======================================

    if (
      await runSecurityChecks(
        message,
        text
      )
    ) {
      return;
    }


    // ======================================
    // CEK APAKAH COMMAND
    // ======================================

    if (
      !trimmed.startsWith(PREFIX)
    ) {
      return;
    }


    // ======================================
    // PARSE COMMAND
    // ======================================

    const withoutPrefix =
      trimmed
        .slice(PREFIX.length)
        .trim();

    if (!withoutPrefix) {
      return;
    }

    const parts =
      withoutPrefix.split(/\s+/);

    const command =
      String(parts.shift() || "")
        .toLowerCase();

    const args =
      parts;

    const commandText =
      args.join(" ");


    // ======================================
    // PUBLIC / SELF MODE
    // ======================================

    if (
      !publicMode &&
      !isOwner(sender)
    ) {

      await sendText(
        chat,
        "🔒 Bot sedang dalam mode self.\nHanya owner yang dapat menggunakan bot."
      );

      return;
    }


    // ======================================
    // COMMAND STATISTIC
    // ======================================

    if (!db.stats) {
      db.stats = {
        commands: 0,
        messages: 0
      };
    }

    db.stats.commands =
      Number(db.stats.commands || 0) + 1;

    db.stats.messages =
      Number(db.stats.messages || 0) + 1;


    // ======================================
    // REACT COMMAND
    // ======================================

    try {

      await react(
        chat,
        message,
        "⏳"
      );

    } catch {}


    // ======================================
    // GROUP COMMAND
    // ======================================

    try {

      if (
        await handleGroupCommand(
          message,
          command,
          args,
          commandText
        )
      ) {

        try {
          await react(
            chat,
            message,
            "✅"
          );
        } catch {}

        saveDB();

        return;
      }

    } catch (error) {

      console.log(
        "Group command error:",
        error.message
      );
    }


    // ======================================
    // WARNING COMMAND
    // ======================================

    try {

      if (
        await handleWarningCommand(
          message,
          command,
          args
        )
      ) {

        saveDB();

        return;
      }

    } catch (error) {

      console.log(
        "Warning command error:",
        error.message
      );
    }


    // ======================================
    // LIST COMMAND
    // ======================================

    try {

      if (
        await handleListCommand(
          message,
          command,
          args,
          commandText
        )
      ) {

        saveDB();

        return;
      }

    } catch (error) {

      console.log(
        "List command error:",
        error.message
      );
    }


    // ======================================
    // POINT COMMAND
    // ======================================

    try {

      if (
        await handlePointCommand(
          message,
          command,
          args
        )
      ) {

        saveDB();

        return;
      }

    } catch (error) {

      console.log(
        "Point command error:",
        error.message
      );
    }


    // ======================================
    // REMINDER COMMAND
    // ======================================

    try {

      if (
        await handleReminderCommand(
          message,
          command,
          args,
          commandText
        )
      ) {

        saveDB();

        return;
      }

    } catch (error) {

      console.log(
        "Reminder command error:",
        error.message
      );
    }


    // ======================================
    // GAME COMMAND
    // ======================================

    try {

      if (
        await handleGameCommand(
          message,
          command,
          args,
          commandText
        )
      ) {

        saveDB();

        return;
      }

    } catch (error) {

      console.log(
        "Game command error:",
        error.message
      );
    }


    // ======================================
    // LEADERBOARD
    // ======================================

    try {

      if (
        await handleLeaderboard(
          message,
          command
        )
      ) {

        saveDB();

        return;
      }

    } catch (error) {

      console.log(
        "Leaderboard error:",
        error.message
      );
    }


    // ======================================
    // TOOLS
    // ======================================

    try {

      if (
        await handleToolsCommand(
          message,
          command,
          args,
          commandText
        )
      ) {

        saveDB();

        return;
      }

    } catch (error) {

      console.log(
        "Tools command error:",
        error.message
      );
    }


    // ======================================
    // MAIN COMMAND
    // ======================================

    try {

      const handled =
        await handleCommand(
          message,
          command,
          args,
          commandText
        );

      if (handled) {

        saveDB();

        try {
          await react(
            chat,
            message,
            "✅"
          );
        } catch {}

        return;
      }

    } catch (error) {

      console.log(
        "Main command error:",
        error
      );

      await sendText(
        chat,
        `❌ Terjadi error saat menjalankan command.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );

      return;
    }


    // ======================================
    // UNKNOWN COMMAND
    // ======================================

    await sendText(
      chat,
      `❌ Command *${command}* tidak ditemukan.\n\n` +
      `Ketik *${PREFIX}menu* untuk melihat semua command.`
    );

    saveDB();

  } catch (error) {

    console.log(
      "handleMessage error:",
      error
    );
  }
}


// ==========================================
// 🤖 START BOT
// ==========================================

async function startBot() {

  try {

    connectionStatus =
      "CONNECTING";

    console.log(
      "\n===================================="
    );

    console.log(
      "🤖 ZAZABOT STARTING..."
    );

    console.log(
      "===================================="
    );


    // ======================================
    // AUTH STATE
    // ======================================

    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        SESSION_DIR
      );


    // ======================================
    // CREATE SOCKET
    // ======================================

    sock =
      makeWASocket({

        auth: state,

        logger:
          pino({
            level:
              process.env.LOG_LEVEL ||
              "silent"
          }),

        browser:
          Browsers.ubuntu(
            "Chrome"
          ),

        printQRInTerminal:
          false,

        markOnlineOnConnect:
          false,

        syncFullHistory:
          false,

        generateHighQualityLinkPreview:
          false
      });


    // ======================================
    // CREDENTIAL UPDATE
    // ======================================

    sock.ev.on(
      "creds.update",
      saveCreds
    );


    // ======================================
    // CONNECTION UPDATE
    // ======================================

    sock.ev.on(
      "connection.update",
      async update => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;


        // ====================================
        // QR CODE
        // ====================================

        if (qr) {

          try {

            qrImage =
              await QRCode.toDataURL(
                qr,
                {
                  width: 400,
                  margin: 2
                }
              );

            connectionStatus =
              "QR_READY";

            console.log(
              "📱 QR WhatsApp tersedia di /qr"
            );

          } catch (error) {

            console.log(
              "QR error:",
              error.message
            );
          }
        }


        // ====================================
        // OPEN
        // ====================================

        if (
          connection === "open"
        ) {

          connectionStatus =
            "CONNECTED";

          qrImage = "";

          reconnectTimer =
            null;

          console.log(
            "\n===================================="
          );

          console.log(
            "✅ ZAZABOT BERHASIL ONLINE!"
          );

          console.log(
            `🤖 Bot: ${BOT_NAME}`
          );

          console.log(
            `👑 Owner: ${OWNER_NUMBER}`
          );

          console.log(
            "====================================\n"
          );
        }


        // ====================================
        // CLOSE
        // ====================================

        if (
          connection === "close"
        ) {

          connectionStatus =
            "DISCONNECTED";

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log(
            "❌ WhatsApp terputus.",
            statusCode || ""
          );


          // ==================================
          // JANGAN RECONNECT JIKA LOGOUT
          // ==================================

          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {

            console.log(
              "⚠️ Session logout. Hapus folder session lalu scan QR ulang."
            );

            return;
          }


          // ==================================
          // RECONNECT
          // ==================================

          if (
            !reconnectTimer
          ) {

            reconnectTimer =
              setTimeout(
                () => {

                  reconnectTimer =
                    null;

                  startBot()
                    .catch(
                      console.error
                    );

                },
                5000
              );

            console.log(
              "🔄 Reconnect dalam 5 detik..."
            );
          }
        }
      }
    );


    // ======================================
    // INCOMING MESSAGES
    // ======================================

    sock.ev.on(
      "messages.upsert",
      async ({
        messages
      }) => {

        for (
          const message
          of messages
        ) {

          try {

            if (
              !message?.message
            ) {
              continue;
            }

            // Abaikan pesan status
            if (
              message.key.remoteJid ===
              "status@broadcast"
            ) {
              continue;
            }

            await handleMessage(
              message
            );

          } catch (error) {

            console.log(
              "Message handler error:",
              error.message
            );
          }
        }
      }
    );


    // ======================================
    // GROUP PARTICIPANTS
    // ======================================

    sock.ev.on(
      "group-participants.update",
      async update => {

        try {

          await handleParticipants(
            update
          );

        } catch (error) {

          console.log(
            "Participant update error:",
            error.message
          );
        }
      }
    );


    return sock;

  } catch (error) {

    connectionStatus =
      "ERROR";

    console.log(
      "❌ Gagal menjalankan bot:",
      error
    );

    if (!reconnectTimer) {

      reconnectTimer =
        setTimeout(
          () => {

            reconnectTimer =
              null;

            startBot()
              .catch(
                console.error
              );

          },
          5000
        );
    }
  }
}


// ==========================================
// 🌐 HTTP SERVER
// ==========================================

const server =
  http.createServer(
    async (req, res) => {

      try {

        // ==================================
        // CORS
        // ==================================

        res.setHeader(
          "Access-Control-Allow-Origin",
          "*"
        );

        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type"
        );


        // ==================================
        // HOME
        // ==================================

        if (
          req.url === "/" ||
          req.url === "/home"
        ) {

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json; charset=utf-8"
            }
          );

          res.end(
            JSON.stringify(
              {
                ok: true,
                bot: BOT_NAME,
                status: connectionStatus,
                mode:
                  publicMode
                    ? "public"
                    : "self"
              },
              null,
              2
            )
          );

          return;
        }


        // ==================================
        // STATUS
        // ==================================

        if (
          req.url === "/status"
        ) {

          const stats =
            getDatabaseStats();

          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json; charset=utf-8"
            }
          );

          res.end(
            JSON.stringify(
              {
                ok: true,
                bot: BOT_NAME,
                status:
                  connectionStatus,
                uptime:
                  formatRuntime(
                    Date.now() -
                    startedAt
                  ),
                users:
                  stats.users,
                groups:
                  stats.groups,
                orders:
                  stats.orders,
                premium:
                  stats.premium
              },
              null,
              2
            )
          );

          return;
        }


        // ==================================
        // QR PAGE
        // ==================================

        if (
          req.url === "/qr"
        ) {

          res.writeHead(
            200,
            {
              "Content-Type":
                "text/html; charset=utf-8"
            }
          );

          if (qrImage) {

            res.end(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZazaBot QR</title>

<style>
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: Arial, sans-serif;
  background: #111;
  color: white;
  text-align: center;
}

.box {
  background: #222;
  padding: 25px;
  border-radius: 20px;
  max-width: 90%;
}

img {
  width: 320px;
  max-width: 100%;
  background: white;
  padding: 10px;
  border-radius: 10px;
}

h1 {
  margin-top: 0;
}
</style>

</head>

<body>

<div class="box">

<h1>🤖 ZazaBot</h1>

<p>Scan QR ini menggunakan WhatsApp.</p>

<img src="${qrImage}" />

<p>Status: ${connectionStatus}</p>

</div>

</body>
</html>
`);

          } else {

            res.end(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZazaBot</title>
</head>

<body style="
font-family:Arial;
text-align:center;
padding:50px;
">

<h1>🤖 ZazaBot</h1>

<h2>${connectionStatus}</h2>

<p>QR belum tersedia.</p>

<p>Refresh halaman setelah bot membuat QR.</p>

</body>
</html>
`);

          }

          return;
        }


        // ==================================
        // 404
        // ==================================

        res.writeHead(
          404,
          {
            "Content-Type":
              "application/json; charset=utf-8"
          }
        );

        res.end(
          JSON.stringify({
            ok: false,
            error: "Not Found"
          })
        );

      } catch (error) {

        res.writeHead(
          500,
          {
            "Content-Type":
              "application/json; charset=utf-8"
          }
        );

        res.end(
          JSON.stringify({
            ok: false,
            error:
              error.message
          })
        );
      }
    }
  );


// ==========================================
// 🚀 START HTTP SERVER
// ==========================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🌐 HTTP server berjalan di port ${PORT}`
    );

    console.log(
      `📡 Status: /status`
    );

    console.log(
      `📱 QR: /qr`
    );
  }
);


// ==========================================
// 💾 AUTO SAVE DATABASE
// ==========================================

setInterval(
  () => {

    try {

      saveDB();

    } catch (error) {

      console.log(
        "Auto save error:",
        error.message
      );
    }

  },
  30 * 1000
);


// ==========================================
// 🧹 SHUTDOWN HANDLER
// ==========================================

async function shutdown(
  signal
) {

  console.log(
    `\n🛑 Menerima ${signal}.`
  );

  try {

    saveDB();

  } catch {}

  try {

    if (
      sock
    ) {

      sock.end(
        undefined
      );
    }

  } catch {}

  try {

    server.close(
      () => {
        console.log(
          "🌐 HTTP server ditutup."
        );

        process.exit(0);
      }
    );

  } catch {

    process.exit(0);
  }
}


process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);


// ==========================================
// ⚠️ UNHANDLED ERROR
// ==========================================

process.on(
  "unhandledRejection",
  error => {

    console.log(
      "Unhandled rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {

    console.log(
      "Uncaught exception:",
      error
    );
  }
);


// ==========================================
// 🤖 START ZAZABOT
// ==========================================

console.log(
  "\n🚀 Memulai ZazaBot..."
);

startBot()
  .catch(
    error => {

      console.log(
        "Start bot error:",
        error
      );

    }
  );
