// ======================================================
// 🤖 ZAZABOT - INDEX.JS BARU
// WhatsApp Bot Baileys
// ======================================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadContentFromMessage
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode";
import sharp from "sharp";
import fs from "fs";
import http from "http";

// ======================================================
// ⚙️ CONFIG
// ======================================================

const BOT_NAME = "ZazaBot";

const OWNER_NUMBER = (
  process.env.OWNER_NUMBER || "6289630747010"
).replace(/\D/g, "");

const BOT_NUMBER = "6285866438941";

const PREFIX = process.env.PREFIX || ".";

const PORT = Number(process.env.PORT || 8080);

const DB_FILE = "./database.json";

const SESSION_DIR = "./session";

// ======================================================
// 🔌 GLOBAL
// ======================================================

let sock = null;

let qrImage = "";

let connectionStatus = "STARTING";

let reconnectTimer = null;

let publicMode = true;

const startedAt = Date.now();

// ======================================================
// 💾 DATABASE DEFAULT
// ======================================================

function createDefaultDB() {
  return {
    settings: {
      owner: OWNER_NUMBER,
      botNumber: BOT_NUMBER,
      botName: BOT_NAME,
      public: true
    },

    users: {},

    groups: {},

    banned: [],

    blocked: [],

    premium: {},

    orders: {},

    stats: {
      messages: 0,
      commands: 0
    }
  };
}

// ======================================================
// 💾 LOAD DATABASE
// ======================================================

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const data = createDefaultDB();

      fs.writeFileSync(
        DB_FILE,
        JSON.stringify(data, null, 2)
      );

      return data;
    }

    const raw = fs.readFileSync(
      DB_FILE,
      "utf8"
    );

    const data = JSON.parse(raw);

    const base = createDefaultDB();

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
      },

      users: data.users || {},

      groups: data.groups || {},

      banned: Array.isArray(data.banned)
        ? data.banned
        : [],

      blocked: Array.isArray(data.blocked)
        ? data.blocked
        : [],

      premium: data.premium || {},

      orders: data.orders || {}
    };

  } catch (error) {

    console.error(
      "❌ DATABASE ERROR:",
      error.message
    );

    return createDefaultDB();
  }
}

// ======================================================
// 💾 DATABASE INSTANCE
// ======================================================

let db = loadDB();

publicMode =
  db.settings.public !== false;

// ======================================================
// 💾 SAVE DATABASE
// ======================================================

function saveDB() {
  try {

    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    );

  } catch (error) {

    console.error(
      "❌ SAVE DATABASE ERROR:",
      error.message
    );
  }
}

// ======================================================
// 📱 JID / NOMOR
// ======================================================

function jidNumber(jid = "") {

  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

// ======================================================

function userJid(number = "") {

  const n = String(number)
    .replace(/\D/g, "");

  if (!n) return "";

  return `${n}@s.whatsapp.net`;
}

// ======================================================

function isGroup(jid = "") {

  return String(jid)
    .endsWith("@g.us");
}

// ======================================================
// 👑 OWNER
// ======================================================

function isOwner(jid = "") {

  const number = jidNumber(jid);

  const owners = [
    OWNER_NUMBER,
    jidNumber(db.settings?.owner || "")
  ].filter(Boolean);

  return owners.includes(number);
}

// ======================================================
// 🚫 BAN
// ======================================================

function isBanned(jid = "") {

  return db.banned.includes(
    jidNumber(jid)
  );
}

// ======================================================
// 👤 USER
// ======================================================

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

      xp: 0,

      level: 1,

      premium: false,

      premiumUntil: 0,

      warn: 0,

      afk: null,

      createdAt: Date.now()
    };
  }

  const user = db.users[number];

  // kompatibilitas database lama

  if (typeof user.balance !== "number") {
    user.balance = 0;
  }

  if (typeof user.limit !== "number") {
    user.limit = 20;
  }

  if (typeof user.points !== "number") {
    user.points = 0;
  }

  if (typeof user.xp !== "number") {
    user.xp = 0;
  }

  if (typeof user.level !== "number") {
    user.level = 1;
  }

  if (typeof user.warn !== "number") {
    user.warn = 0;
  }

  if (!("afk" in user)) {
    user.afk = null;
  }

  return user;
}

// ======================================================
// 💎 PREMIUM
// ======================================================

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

// ======================================================
// 👥 GROUP
// ======================================================

function getGroup(jid) {

  if (!db.groups[jid]) {

    db.groups[jid] = {

      welcome: false,

      goodbye: false,

      welcomeText:
        "👋 Selamat datang @user di grup!",

      goodbyeText:
        "👋 Sampai jumpa @user!",

      antilink: false,

      antilinkKick: true,

      antilinkChannel: false,

      antiwame: false,

      antiwameKick: true,

      antibadword: false,

      antibadwordKick: true,

      antibot: false,

      antidelete: false,

      antimentionsw: false,

      antiviewonce: false,

      antiluar:
        // ==========================================
// PART 2 - STORE, USER SYSTEM & GAME
// ==========================================

// ---------- STORE ----------
const PRODUCTS = {
  spotify: [
    {
      id: "spotify1",
      name: "Spotify Premium",
      duration: "1 Bulan",
      price: 8000
    },
    {
      id: "spotify2",
      name: "Spotify Premium",
      duration: "2 Bulan",
      price: 10000
    }
  ],

  netflix: [
    {
      id: "netflix1",
      name: "Netflix Premium",
      duration: "1 Bulan",
      price: 8000
    },
    {
      id: "netflix2",
      name: "Netflix Premium",
      duration: "2 Bulan",
      price: 10000
    }
  ],

  hoki: [
    {
      id: "hokian",
      name: "Waktu Hoki-Hokian",
      duration: "Paket",
      price: 15000
    }
  ],

  ebook: [
    {
      id: "ebook1",
      name: "E-book Belajar Bahasa Inggris",
      duration: "Paket",
      price: 7000
    },
    {
      id: "ebook2",
      name: "E-book The Psychology of Money",
      duration: "Paket",
      price: 7000
    }
  ]
};

function getAllProducts() {
  const result = [];

  for (const [category, items] of Object.entries(PRODUCTS)) {
    for (const item of items) {
      result.push({
        category,
        ...item
      });
    }
  }

  return result;
}

function findProduct(query = "") {
  const q = String(query).trim().toLowerCase();

  if (!q) return null;

  const products = getAllProducts();

  return (
    products.find(product => {
      const data = [
        product.id,
        product.name,
        product.duration,
        product.category
      ]
        .join(" ")
        .toLowerCase();

      return data.includes(q);
    }) || null
  );
}

function productListText() {
  let text = `
╭━━〔 🛍️ ZAZA STORE 〕━━╮
`;

  for (const [category, items] of Object.entries(PRODUCTS)) {
    text += `\n📦 *${category.toUpperCase()}*\n`;

    for (const item of items) {
      text +=
        `• ${item.name}\n` +
        `  ├ Durasi : ${item.duration}\n` +
        `  ├ Harga  : ${formatRupiah(item.price)}\n` +
        `  └ ID     : ${item.id}\n`;
    }
  }

  text += `
╰━━━━━━━━━━━━━━━━━━━━╯

💳 Pembayaran:
QRIS / DANA / BANK

Contoh:
${PREFIX}order spotify1
${PREFIX}order hoki
`;

  return text.trim();
}


// ==========================================
// USER / SALDO / LIMIT
// ==========================================

function ensureUserData(jid) {
  const user = getUser(jid);

  if (!user) return null;

  if (typeof user.balance !== "number") {
    user.balance = 0;
  }

  if (typeof user.limit !== "number") {
    user.limit = 20;
  }

  if (typeof user.points !== "number") {
    user.points = 0;
  }

  if (typeof user.xp !== "number") {
    user.xp = 0;
  }

  if (typeof user.level !== "number") {
    user.level = 1;
  }

  if (typeof user.warn !== "number") {
    user.warn = 0;
  }

  if (typeof user.premium !== "boolean") {
    user.premium = false;
  }

  if (typeof user.premiumUntil !== "number") {
    user.premiumUntil = 0;
  }

  return user;
}

function getBalance(jid) {
  const user = ensureUserData(jid);
  return user ? user.balance : 0;
}

function addBalance(jid, amount) {
  const user = ensureUserData(jid);

  if (!user) return false;

  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    return false;
  }

  user.balance += value;
  saveDB();

  return true;
}

function removeBalance(jid, amount) {
  const user = ensureUserData(jid);

  if (!user) return false;

  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    return false;
  }

  if (user.balance < value) {
    return false;
  }

  user.balance -= value;
  saveDB();

  return true;
}

function addLimit(jid, amount) {
  const user = ensureUserData(jid);

  if (!user) return false;

  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return false;
  }

  user.limit += value;

  if (user.limit < 0) {
    user.limit = 0;
  }

  saveDB();

  return true;
}

function removeLimit(jid, amount = 1) {
  const user = ensureUserData(jid);

  if (!user) return false;

  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    return false;
  }

  if (user.limit < value) {
    return false;
  }

  user.limit -= value;
  saveDB();

  return true;
}


// ==========================================
// POINT & XP
// ==========================================

function addPoint(jid, amount = 1) {
  const user = ensureUserData(jid);

  if (!user) return false;

  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return false;
  }

  user.points += value;

  if (user.points < 0) {
    user.points = 0;
  }

  saveDB();

  return true;
}

function addXP(jid, amount = 1) {
  const user = ensureUserData(jid);

  if (!user) return false;

  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    return false;
  }

  user.xp += value;

  const oldLevel = user.level;

  user.level = Math.floor(user.xp / 100) + 1;

  saveDB();

  return {
    xp: user.xp,
    level: user.level,
    levelUp: user.level > oldLevel
  };
}


// ==========================================
// WARNING
// ==========================================

function addWarning(jid, amount = 1) {
  const user = ensureUserData(jid);

  if (!user) return 0;

  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return user.warn;
  }

  user.warn += value;

  if (user.warn < 0) {
    user.warn = 0;
  }

  saveDB();

  return user.warn;
}

function removeWarning(jid, amount = 1) {
  const user = ensureUserData(jid);

  if (!user) return 0;

  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return user.warn;
  }

  user.warn -= value;

  if (user.warn < 0) {
    user.warn = 0;
  }

  saveDB();

  return user.warn;
}


// ==========================================
// PREMIUM
// ==========================================

function activatePremium(jid, durationMs) {
  const user = ensureUserData(jid);

  if (!user) return false;

  const duration = Number(durationMs);

  if (!Number.isFinite(duration) || duration <= 0) {
    return false;
  }

  const now = Date.now();

  const start =
    user.premiumUntil && user.premiumUntil > now
      ? user.premiumUntil
      : now;

  user.premium = true;
  user.premiumUntil = start + duration;

  saveDB();

  return true;
}

function premiumRemaining(jid) {
  const user = ensureUserData(jid);

  if (!user || !user.premiumUntil) {
    return 0;
  }

  const remaining = user.premiumUntil - Date.now();

  if (remaining <= 0) {
    user.premium = false;
    user.premiumUntil = 0;
    saveDB();
    return 0;
  }

  return remaining;
}


// ==========================================
// ORDER
// ==========================================

function createOrder(jid, product) {
  if (!db.orders || typeof db.orders !== "object") {
    db.orders = {};
  }

  const orderId = randomId("ORD");

  db.orders[orderId] = {
    id: orderId,
    user: jidNumber(jid),
    productId: product.id,
    productName: product.name,
    duration: product.duration,
    price: product.price,
    status: "pending",
    createdAt: Date.now()
  };

  saveDB();

  return db.orders[orderId];
}

function getOrder(orderId) {
  if (!db.orders || typeof db.orders !== "object") {
    db.orders = {};
  }

  return db.orders[orderId] || null;
}

function updateOrder(orderId, status) {
  const order = getOrder(orderId);

  if (!order) {
    return false;
  }

  order.status = status;
  order.updatedAt = Date.now();

  saveDB();

  return true;
}


// ==========================================
// GAME DATA
// ==========================================

const RIDDLES = [
  {
    question: "Aku punya gigi tetapi tidak bisa makan. Aku apa?",
    answer: "sisir"
  },
  {
    question: "Semakin diisi semakin ringan. Aku apa?",
    answer: "balon"
  },
  {
    question: "Aku punya kaki tetapi tidak bisa berjalan. Aku apa?",
    answer: "meja"
  },
  {
    question: "Aku selalu mengikuti kamu tetapi tidak pernah mendahului. Aku apa?",
    answer: "bayangan"
  },
  {
    question: "Aku punya wajah dan dua tangan tetapi tidak punya kaki. Aku apa?",
    answer: "jam"
  }
];

const WORD_GAMES = [
  {
    question: "Susun huruf berikut: R E T U P M O K",
    answer: "komputer"
  },
  {
    question: "Susun huruf berikut: P A H T S P A W A",
    answer: "whatsapp"
  },
  {
    question: "Susun huruf berikut: T E R N I N E T",
    answer: "internet"
  },
  {
    question: "Susun huruf berikut: N O D I N E S I A",
    answer: "indonesia"
  },
  {
    question: "Susun huruf berikut: G O L O N K E T I",
    answer: "teknologi"
  }
];

const FAMILY100 = [
  {
    question: "Sebutkan benda yang biasanya ada di kamar tidur.",
    answers: [
      "kasur",
      "bantal",
      "selimut",
      "lemari",
      "meja",
      "kursi",
      "lampu",
      "kipas"
    ]
  },
  {
    question: "Sebutkan aplikasi yang sering digunakan.",
    answers: [
      "whatsapp",
      "instagram",
      "tiktok",
      "youtube",
      "facebook",
      "telegram",
      "google"
    ]
  }
];

const TRUTH_QUESTIONS = [
  "Apa hal paling memalukan yang pernah kamu lakukan?",
  "Siapa orang yang paling sering kamu chat?",
  "Apa cita-cita kamu?",
  "Apa kebiasaan buruk kamu?",
  "Apa hal yang paling kamu takutkan?"
];

const DARE_CHALLENGES = [
  "Kirim emoji 😂 sebanyak 10 kali.",
  "Ketik nama kamu secara terbalik.",
  "Kirim pesan 'Aku jago banget 😎'.",
  "Sebutkan 3 hal yang kamu sukai.",
  "Kirim satu stiker random."
];

const gameSessions = new Map();

function startGame(chat, data) {
  gameSessions.set(chat, {
    ...data,
    startedAt: Date.now()
  });
}

function getGame(chat) {
  return gameSessions.get(chat) || null;
}

function stopGame(chat) {
  gameSessions.delete(chat);
}

function cleanGameAnswer(text = "") {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}


// ==========================================
// DATABASE INITIALIZATION
// ==========================================

if (!db.orders || typeof db.orders !== "object") {
  db.orders = {};
}

if (!db.premium || typeof db.premium !== "object") {
  db.premium = {};
}

if (!db.banned || !Array.isArray(db.banned)) {
  db.banned = [];
}

saveDB();

console.log("✅ Part 2 loaded.");
    // ==========================================
// PART 3 - COMMAND UTAMA
// ==========================================

async function handleMainCommand(message, command, args, text) {

  const chat = getChat(message);
  const sender = getSender(message);
  const user = getUser(sender);

  const reply = async (content, options = {}) => {
    return sendText(chat, content, options);
  };

  // ========================================
  // GENERAL
  // ========================================

  if (command === "menu" || command === "help") {

    return reply(menuText(sender));
  }

  if (command === "ping") {

    const start = Date.now();

    await reply("🏓 Pong!");

    const speed = Date.now() - start;

    return reply(
      `⚡ Response: ${speed} ms`
    );
  }

  if (command === "speed") {

    return reply(
      `⚡ Speed: ${Date.now() - startedAt} ms`
    );
  }

  if (command === "runtime") {

    return reply(
      `⏱️ Runtime: ${formatRuntime(
        Date.now() - startedAt
      )}`
    );
  }

  if (command === "status") {

    return reply(
      `🤖 *STATUS ZAZABOT*\n\n` +
      `📡 Koneksi : ${connectionStatus}\n` +
      `🌐 Mode : ${publicMode ? "PUBLIC" : "SELF"}\n` +
      `👤 User : ${Object.keys(db.users).length}\n` +
      `👥 Group : ${Object.keys(db.groups).length}\n` +
      `💬 Pesan : ${db.stats.messages}\n` +
      `⚡ Command : ${db.stats.commands}`
    );
  }

  if (command === "botinfo") {

    return reply(
      `╭━━〔 🤖 BOT INFO 〕━━╮\n` +
      `┃ Nama : ${BOT_NAME}\n` +
      `┃ Nomor : ${BOT_NUMBER}\n` +
      `┃ Owner : ${OWNER_NUMBER}\n` +
      `┃ Prefix : ${PREFIX}\n` +
      `┃ Status : ${connectionStatus}\n` +
      `┃ Mode : ${publicMode ? "Public" : "Self"}\n` +
      `╰━━━━━━━━━━━━━━━━━━╯`
    );
  }

  if (command === "owner") {

    return reply(
      `👑 *OWNER ${BOT_NAME}*\n\n` +
      `📱 wa.me/${OWNER_NUMBER}`
    );
  }

  if (command === "cekowner") {

    return reply(
      `👑 Owner saat ini:\n` +
      `wa.me/${db.settings.owner || OWNER_NUMBER}`
    );
  }

  if (command === "profile") {

    return reply(
      `╭━━〔 👤 PROFILE 〕━━╮\n` +
      `┃ Nomor : ${jidNumber(sender)}\n` +
      `┃ Saldo : ${formatRupiah(user.balance)}\n` +
      `┃ Limit : ${user.limit}\n` +
      `┃ Point : ${user.points}\n` +
      `┃ XP : ${user.xp}\n` +
      `┃ Level : ${user.level}\n` +
      `┃ Premium : ${isPremium(sender) ? "✅" : "❌"}\n` +
      `┃ Warn : ${user.warn}\n` +
      `╰━━━━━━━━━━━━━━━━━━╯`
    );
  }

  if (command === "saldo" || command === "balance") {

    return reply(
      `💰 Saldo kamu: ${formatRupiah(
        getBalance(sender)
      )}`
    );
  }

  if (command === "limit") {

    return reply(
      `🎟️ Limit kamu: ${user.limit}`
    );
  }

  if (command === "level") {

    return reply(
      `⭐ *LEVEL*\n\n` +
      `Level : ${user.level}\n` +
      `XP : ${user.xp}/${
        user.level * 100
      }`
    );
  }

  if (command === "rules") {

    return reply(
      `📜 *RULES ZAZABOT*\n\n` +
      `1. Jangan spam bot.\n` +
      `2. Jangan gunakan bot untuk hal ilegal.\n` +
      `3. Hormati pengguna lain.\n` +
      `4. Jangan spam command di grup.\n` +
      `5. Patuhi aturan grup.\n` +
      `6. Gunakan fitur bot dengan bijak.`
    );
  }

  if (command === "donate") {

    return reply(
      `💙 *DONATE ZAZABOT*\n\n` +
      `Terima kasih sudah mendukung ZazaBot.\n\n` +
      `Silakan hubungi owner untuk informasi pembayaran.`
    );
  }


  // ========================================
  // OWNER
  // ========================================

  if (command === "setowner") {

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    const target = targetFromMessage(
      message,
      args
    );

    if (!target) {
      return reply(
        `Contoh:\n${PREFIX}setowner 628xxxxxxxxxx`
      );
    }

    const number = jidNumber(target);

    db.settings.owner = number;

    saveDB();

    return reply(
      `✅ Owner database berhasil diubah menjadi:\n${number}`
    );
  }

  if (command === "public") {

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    publicMode = true;

    db.settings.public = true;

    saveDB();

    return reply(
      "✅ Mode PUBLIC berhasil diaktifkan."
    );
  }

  if (command === "self") {

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    publicMode = false;

    db.settings.public = false;

    saveDB();

    return reply(
      "🔒 Mode SELF berhasil diaktifkan."
    );
  }

  if (command === "ban") {

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    const target = targetFromMessage(
      message,
      args
    );

    if (!target) {
      return reply(
        `Contoh:\n${PREFIX}ban 628xxxxxxxxxx`
      );
    }

    const number = jidNumber(target);

    if (number === OWNER_NUMBER) {
      return reply(
        "❌ Tidak dapat membanned owner utama."
      );
    }

    if (!db.banned.includes(number)) {
      db.banned.push(number);
    }

    saveDB();

    return reply(
      `🚫 ${number} berhasil dibanned.`
    );
  }

  if (command === "unban") {

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    const target = targetFromMessage(
      message,
      args
    );

    if (!target) {
      return reply(
        `Contoh:\n${PREFIX}unban 628xxxxxxxxxx`
      );
    }

    const number = jidNumber(target);

    db.banned = db.banned.filter(
      x => x !== number
    );

    saveDB();

    return reply(
      `✅ ${number} berhasil di-unban.`
    );
  }

  if (command === "listban") {

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    if (!db.banned.length) {
      return reply(
        "✅ Tidak ada user yang dibanned."
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

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    const target = targetFromMessage(
      message,
      args
    );

    const amount = Number(
      args.find(
        x => /^\d+$/.test(x)
      )
    );

    if (!target || !amount) {

      return reply(
        `Contoh:\n${PREFIX}addbalance 628xxxx 10000`
      );
    }

    addBalance(
      target,
      amount
    );

    return reply(
      `✅ Saldo ${jidNumber(target)} ditambah ${formatRupiah(amount)}.`
    );
  }

  if (command === "addlimit") {

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    const target = targetFromMessage(
      message,
      args
    );

    const amount = Number(
      args.find(
        x => /^\d+$/.test(x)
      )
    );

    if (!target || !amount) {

      return reply(
        `Contoh:\n${PREFIX}addlimit 628xxxx 10`
      );
    }

    addLimit(
      target,
      amount
    );

    return reply(
      `✅ Limit ${jidNumber(target)} ditambah ${amount}.`
    );
  }

  if (command === "bc" || command === "broadcast") {

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    const broadcastText =
      args.join(" ").trim();

    if (!broadcastText) {

      return reply(
        `Contoh:\n${PREFIX}bc Halo semua!`
      );
    }

    let success = 0;

    for (
      const number of Object.keys(db.users)
    ) {

      try {

        await sendText(
          userJid(number),
          `📢 *BROADCAST ${BOT_NAME}*\n\n${broadcastText}`
        );

        success++;

      } catch {}
    }

    return reply(
      `✅ Broadcast selesai.\n` +
      `📤 Terkirim: ${success}`
    );
  }

  if (command === "restart") {

    if (!isOwner(sender)) {
      return reply(
        "❌ Command ini khusus owner."
      );
    }

    await reply(
      "♻️ Bot sedang melakukan restart..."
    );

    setTimeout(
      () => process.exit(0),
      1000
    );

    return true;
  }


  // ========================================
  // STORE
  // ========================================

  if (
    command === "produk" ||
    command === "pricelist"
  ) {

    return reply(
      productListText()
    );
  }

  if (command === "topup") {

    return reply(
      `💳 *TOP UP SALDO*\n\n` +
      `Untuk melakukan top up saldo,\n` +
      `silakan hubungi owner.\n\n` +
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
        `❌ Masukkan ID produk.\n\n` +
        `Contoh:\n` +
        `${PREFIX}order spotify1\n\n` +
        productListText()
      );
    }

    const product =
      findProduct(query);

    if (!product) {

      return reply(
        "❌ Produk tidak ditemukan.\n\n" +
        `Ketik ${PREFIX}produk`
      );
    }

    if (
      getBalance(sender) <
      product.price
    ) {

      return reply(
        `❌ Saldo tidak cukup.\n\n` +
        `Produk : ${product.name}\n` +
        `Harga : ${formatRupiah(product.price)}\n` +
        `Saldo : ${formatRupiah(getBalance(sender))}\n\n` +
        `Top up melalui owner.`
      );
    }

    const order =
      createOrder(
        sender,
        product
      );

    return reply(
      `╭━━〔 🛒 ORDER 〕━━╮\n` +
      `┃ ID : ${order.id}\n` +
      `┃ Produk : ${product.name}\n` +
      `┃ Durasi : ${product.duration}\n` +
      `┃ Harga : ${formatRupiah(product.price)}\n` +
      `┃ Status : PENDING\n` +
      `╰━━━━━━━━━━━━━━━━╯\n\n` +
      `Silakan hubungi owner untuk proses pesanan.`
    );
  }

  if (
    command === "cekorder" ||
    command === "orderstatus"
  ) {

    const id =
      args[0];

    if (!id) {

      return reply(
        `Contoh:\n${PREFIX}cekorder ORD-xxxxx`
      );
    }

    const order =
      getOrder(id);

    if (!order) {

      return reply(
        "❌ Order tidak ditemukan."
      );
    }

    return reply(
      `🧾 *DETAIL ORDER*\n\n` +
      `ID : ${order.id}\n` +
      `Produk : ${order.productName}\n` +
      `Durasi : ${order.duration}\n` +
      `Harga : ${formatRupiah(order.price)}\n` +
      `Status : ${order.status}\n` +
      `Tanggal : ${new Date(order.createdAt).toLocaleString("id-ID")}`
    );
  }


  // ========================================
  // PREMIUM
  // ========================================

  if (command === "premium") {

    const remaining =
      premiumRemaining(sender);

    if (!remaining) {

      return reply(
        `⭐ *PREMIUM ZAZABOT*\n\n` +
        `Status: ❌ Belum Premium\n\n` +
        `Hubungi owner untuk membeli premium.`
      );
    }

    return reply(
      `⭐ *PREMIUM AKTIF*\n\n` +
      `Sisa waktu: ${formatRuntime(remaining)}`
    );
  }

  if (command === "cekpremium") {

    const remaining =
      premiumRemaining(sender);

    return reply(
      remaining > 0
        ? `⭐ Premium aktif.\nSisa: ${formatRuntime(remaining)}`
        : "❌ Kamu belum memiliki premium."
    );
  }

  if (command === "addpremium") {

    if (!isOwner(sender)) {

      return reply(
        "❌ Command ini khusus owner."
      );
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    if (!target) {

      return reply(
        `Contoh:\n${PREFIX}addpremium 628xxxx 30`
      );
    }

    const days = Number(
      args.find(
        x => /^\d+$/.test(x)
      )
    );

    if (!days || days <= 0) {

      return reply(
        "❌ Masukkan jumlah hari."
      );
    }

    activatePremium(
      target,
      days * 24 * 60 * 60 * 1000
    );

    return reply(
      `⭐ Premium ${jidNumber(target)} berhasil diaktifkan selama ${days} hari.`
    );
  }


  // ========================================
  // AI
  // ========================================

  if (
    command === "ai" ||
    command === "openai" ||
    command === "ask"
  ) {

    const prompt =
      args.join(" ").trim();

    if (!prompt) {

      return reply(
        `Contoh:\n${PREFIX}ai jelaskan fotosintesis`
      );
    }

    try {

      const answer =
        await openAI(prompt);

      return reply(
        `🤖 *ZAZABOT AI*\n\n${answer}`
      );

    } catch (error) {

      console.error(
        "AI ERROR:",
        error.message
      );

      return reply(
        "❌ AI sedang mengalami error."
      );
    }
  }

  if (command === "bard") {

    return reply(
      "⚠️ Bard belum memiliki API resmi di bot ini.\nGunakan .ai"
    );
  }

  if (command === "nexara") {

    return reply(
      "⚠️ Nexara belum dikonfigurasi.\nGunakan .ai"
    );
  }

  if (command === "aiimage") {

    return reply(
      "⚠️ AI Image belum dikonfigurasi.\nTambahkan API image generator jika ingin mengaktifkannya."
    );
  }


  // ========================================
  // TRANSLATE
  // ========================================

  if (command === "translate") {

    const parts =
      text.trim().split(/\s+/);

    const lang =
      parts[1];

    const source =
      parts[2] || "auto";

    const phrase =
      parts.slice(3).join(" ");

    if (!lang || !phrase) {

      return reply(
        `Contoh:\n${PREFIX}translate en id hello world`
      );
    }

    try {

      const url =
        `https://api.mymemory.translated.net/get?` +
        `q=${encodeURIComponent(phrase)}` +
        `&langpair=${encodeURIComponent(source)}|${encodeURIComponent(lang)}`;

      const response =
        await fetch(url);

      const data =
        await response.json();

      const translated =
        data?.responseData?.translatedText;

      if (!translated) {

        return reply(
          "❌ Terjemahan tidak ditemukan."
        );
      }

      return reply(
        `🌐 *TRANSLATE*\n\n` +
        `Dari : ${source}\n` +
        `Ke : ${lang}\n\n` +
        `${translated}`
      );

    } catch (error) {

      console.error(
        "TRANSLATE ERROR:",
        error.message
      );

      return reply(
        "❌ Gagal melakukan translate."
      );
    }
  }

  return false;
}

console.log("✅ Part 3 loaded.");
    // ==========================================
// PART 4 - MEDIA, STICKER, SEARCH & TOOLS
// ==========================================

// ==========================================
// 📥 DOWNLOAD MEDIA WHATSAPP
// ==========================================

async function downloadMediaMessage(message) {
  const msg = message?.message;

  if (!msg) {
    throw new Error("Media tidak ditemukan.");
  }

  let media = null;
  let type = null;

  if (msg.imageMessage) {
    media = msg.imageMessage;
    type = "image";
  } else if (msg.videoMessage) {
    media = msg.videoMessage;
    type = "video";
  } else if (msg.audioMessage) {
    media = msg.audioMessage;
    type = "audio";
  } else if (msg.documentMessage) {
    media = msg.documentMessage;
    type = "document";
  }

  if (!media || !type) {
    throw new Error("Pesan bukan media.");
  }

  const stream = await downloadContentFromMessage(
    media,
    type
  );

  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}


// ==========================================
// 🎯 QUOTED MESSAGE
// ==========================================

function getQuotedMessage(message) {

  const context =
    message?.message?.extendedTextMessage
      ?.contextInfo;

  if (!context?.quotedMessage) {
    return null;
  }

  return {
    key: {
      remoteJid: message.key.remoteJid,
      fromMe: false,
      id: context.stanzaId,
      participant: context.participant
    },

    message: context.quotedMessage
  };
}


// ==========================================
// 🖼️ STICKER BUFFER
// ==========================================

async function makeSticker(buffer) {

  if (!Buffer.isBuffer(buffer)) {
    throw new Error("Buffer sticker tidak valid.");
  }

  return await sharp(buffer)
    .resize(512, 512, {
      fit: "contain",
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    })
    .webp({
      quality: 80
    })
    .toBuffer();
}


// ==========================================
// ✏️ TEXT TO STICKER
// ==========================================

async function textToSticker(text) {

  const safeText =
    String(text || "ZazaBot")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .slice(0, 300);

  const svg = `
<svg
  width="512"
  height="512"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect
    width="512"
    height="512"
    rx="50"
    fill="white"
  />

  <foreignObject
    x="30"
    y="30"
    width="452"
    height="452"
  >
    <div
      xmlns="http://www.w3.org/1999/xhtml"
      style="
        width:452px;
        height:452px;
        display:flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        font-family:Arial,sans-serif;
        font-size:42px;
        font-weight:bold;
        color:black;
        word-wrap:break-word;
        overflow:hidden;
      "
    >
      ${safeText}
    </div>
  </foreignObject>
</svg>
`;

  const png = await sharp(
    Buffer.from(svg)
  )
    .png()
    .toBuffer();

  return await makeSticker(png);
}


// ==========================================
// 🤪 BRAT STICKER
// ==========================================

async function createBratSticker(text) {

  const safeText =
    String(text || "brat")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .slice(0, 180);

  const svg = `
<svg
  width="512"
  height="512"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect
    width="512"
    height="512"
    fill="#ffffff"
  />

  <foreignObject
    x="35"
    y="35"
    width="442"
    height="442"
  >
    <div
      xmlns="http://www.w3.org/1999/xhtml"
      style="
        width:442px;
        height:442px;
        display:flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        font-family:Arial,sans-serif;
        font-size:48px;
        font-weight:bold;
        color:#111111;
        line-height:1.05;
        word-break:break-word;
        overflow:hidden;
      "
    >
      ${safeText}
    </div>
  </foreignObject>
</svg>
`;

  const png = await sharp(
    Buffer.from(svg)
  )
    .png()
    .toBuffer();

  return await makeSticker(png);
}


// ==========================================
// 📱 SEND QR
// ==========================================

async function sendQRImage(chat, data, quoted = null) {

  const buffer =
    await QRCode.toBuffer(
      String(data),
      {
        width: 600,
        margin: 2
      }
    );

  return sock.sendMessage(
    chat,
    {
      image: buffer,
      caption: "📱 QR Code ZazaBot"
    },
    quoted
      ? { quoted }
      : {}
  );
}


// ==========================================
// 🔎 GOOGLE SEARCH
// ==========================================

async function googleSearch(query) {

  const q =
    String(query || "").trim();

  if (!q) {
    return [];
  }

  const url =
    "https://www.google.com/search?q=" +
    encodeURIComponent(q);

  const response =
    await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
      }
    });

  const html =
    await response.text();

  const results = [];

  const regex =
    /<a href="\/url\?q=(.*?)&/g;

  let match;

  while (
    (match = regex.exec(html)) &&
    results.length < 5
  ) {

    const link =
      decodeURIComponent(match[1]);

    if (
      link.startsWith("http") &&
      !link.includes("google.com")
    ) {

      results.push(link);
    }
  }

  return results;
}


// ==========================================
// 🖼️ GOOGLE IMAGE SEARCH
// ==========================================

async function googleImageSearch(query) {

  const q =
    String(query || "").trim();

  if (!q) {
    return [];
  }

  const url =
    "https://www.google.com/search?tbm=isch&q=" +
    encodeURIComponent(q);

  const response =
    await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
      }
    });

  const html =
    await response.text();

  const images = [];

  const regex =
    /https?:\/\/[^"'\\ ]+\.(?:jpg|jpeg|png|webp)/gi;

  let match;

  while (
    (match = regex.exec(html)) &&
    images.length < 5
  ) {

    const image =
      match[0];

    if (!image.includes("gstatic.com")) {
      images.push(image);
    }
  }

  return [
    ...new Set(images)
  ];
}


// ==========================================
// 📚 WIKIPEDIA
// ==========================================

async function wikipediaSearch(query) {

  const q =
    String(query || "").trim();

  if (!q) {
    return null;
  }

  const url =
    "https://id.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(q);

  const response =
    await fetch(url, {
      headers: {
        "User-Agent":
          "ZazaBot/1.0"
      }
    });

  if (!response.ok) {
    return null;
  }

  const data =
    await response.json();

  return {
    title: data.title || q,
    description:
      data.description || "",
    extract:
      data.extract || "",
    url:
      data.content_urls
        ?.desktop
        ?.page || ""
  };
}


// ==========================================
// 🎵 YOUTUBE SEARCH
// ==========================================

async function youtubeSearch(query) {

  const q =
    String(query || "").trim();

  if (!q) {
    return [];
  }

  const url =
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(q);

  const response =
    await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0"
      }
    });

  const html =
    await response.text();

  const results = [];

  const regex =
    /"videoId":"([^"]+)"/g;

  let match;

  while (
    (match = regex.exec(html)) &&
    results.length < 5
  ) {

    const id =
      match[1];

    const videoUrl =
      `https://www.youtube.com/watch?v=${id}`;

    if (
      !results.includes(videoUrl)
    ) {

      results.push(videoUrl);
    }
  }

  return results;
}


// ==========================================
// 🎶 LYRICS SEARCH
// ==========================================

async function lyricSearch(query) {

  const q =
    String(query || "").trim();

  if (!q) {
    return null;
  }

  const url =
    "https://api.lyrics.ovh/v1/" +
    encodeURIComponent(q.split(" ")[0]) +
    "/" +
    encodeURIComponent(
      q.split(" ").slice(1).join(" ")
    );

  const response =
    await fetch(url);

  if (!response.ok) {
    return null;
  }

  const data =
    await response.json();

  return data.lyrics || null;
}


// ==========================================
// 🔗 SHORTLINK
// ==========================================

async function createShortLink(url) {

  const target =
    String(url || "").trim();

  if (!/^https?:\/\//i.test(target)) {
    throw new Error("URL tidak valid.");
  }

  const api =
    "https://tinyurl.com/api-create.php?url=" +
    encodeURIComponent(target);

  const response =
    await fetch(api);

  const result =
    await response.text();

  if (!result.startsWith("http")) {
    throw new Error("Shortlink gagal.");
  }

  return result.trim();
}


// ==========================================
// 🤖 AI
// ==========================================

async function openAI(prompt) {

  const question =
    String(prompt || "").trim();

  if (!question) {
    return "Pertanyaan kosong.";
  }

  /*
   * Jika OPENAI_API_KEY dipasang di environment,
   * gunakan OpenAI API.
   */

  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {

    return (
      "⚠️ OPENAI_API_KEY belum dipasang.\n\n" +
      "Tambahkan API key OpenAI di environment " +
      "jika ingin fitur .ai aktif."
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
            "gpt-4o-mini",

          input: question
        })
      }
    );

  if (!response.ok) {

    const errorText =
      await response.text();

    throw new Error(
      `OpenAI ${response.status}: ${errorText}`
    );
  }

  const data =
    await response.json();

  if (data.output_text) {
    return data.output_text;
  }

  const output =
    data.output || [];

  const texts = [];

  for (const item of output) {

    for (
      const content of
      item.content || []
    ) {

      if (
        content.type ===
        "output_text"
      ) {

        texts.push(
          content.text
        );
      }
    }
  }

  return (
    texts.join("\n").trim() ||
    "AI tidak memberikan jawaban."
  );
}


// ==========================================
// 🌐 TIKTOK DOWNLOAD
// ==========================================

async function tikTokDownload(url) {

  const target =
    String(url || "").trim();

  if (
    !/^https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)/i
      .test(target)
  ) {

    throw new Error(
      "URL TikTok tidak valid."
    );
  }

  const api =
    "https://www.tikwm.com/api/";

  const response =
    await fetch(
      api,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          `url=${encodeURIComponent(target)}&hd=1`
      }
    );

  if (!response.ok) {
    throw new Error(
      `TikTok API ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !data ||
    data.code !== 0 ||
    !data.data
  ) {

    throw new Error(
      "Video TikTok tidak dapat diambil."
    );
  }

  return data.data;
}


// ==========================================
// 📸 SCREENSHOT WEBSITE
// ==========================================

async function websiteScreenshot(url) {

  const target =
    String(url || "").trim();

  if (
    !/^https?:\/\//i.test(target)
  ) {

    throw new Error(
      "URL website tidak valid."
    );
  }

  const screenshotUrl =
    "https://image.thum.io/get/fullpage/" +
    encodeURIComponent(target);

  const response =
    await fetch(screenshotUrl);

  if (!response.ok) {

    throw new Error(
      "Screenshot gagal."
    );
  }

  return Buffer.from(
    await response.arrayBuffer()
  );
}


// ==========================================
// 🔤 OCR
// ==========================================

async function ocrImage(buffer) {

  /*
   * OCR eksternal tidak dipasang agar bot
   * tidak membutuhkan package tambahan.
   */

  if (!Buffer.isBuffer(buffer)) {
    throw new Error(
      "Gambar tidak valid."
    );
  }

  return null;
}


// ==========================================
// 🖼️ HANDLE MEDIA COMMAND
// ==========================================

async function handleMediaCommand(
  message,
  command,
  args,
  text
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  const quoted =
    getQuotedMessage(message);

  // ========================================
  // STICKER
  // ========================================

  if (
    command === "sticker" ||
    command === "s"
  ) {

    try {

      let buffer = null;

      if (
        message.message?.imageMessage ||
        message.message?.videoMessage ||
        message.message?.documentMessage
      ) {

        buffer =
          await downloadMediaMessage(
            message
          );

      } else if (quoted) {

        buffer =
          await downloadMediaMessage(
            quoted
          );

      }

      if (!buffer) {

        return sendText(
          chat,
          `❌ Kirim/reply gambar atau video dengan caption ${PREFIX}sticker`
        );
      }

      const sticker =
        await makeSticker(buffer);

      await sock.sendMessage(
        chat,
        {
          sticker
        },
        {
          quoted: message
        }
      );

      return true;

    } catch (error) {

      console.error(
        "STICKER ERROR:",
        error.message
      );

      await sendText(
        chat,
        "❌ Gagal membuat sticker."
      );

      return true;
    }
  }


  // ========================================
  // TTP
  // ========================================

  if (command === "ttp") {

    const value =
      args.join(" ").trim();

    if (!value) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}ttp Zaza Store`
      );
    }

    try {

      const sticker =
        await textToSticker(
          value
        );

      await sock.sendMessage(
        chat,
        {
          sticker
        },
        {
          quoted: message
        }
      );

    } catch (error) {

      await sendText(
        chat,
        "❌ Gagal membuat TTP."
      );
    }

    return true;
  }


  // ========================================
  // ATTP
  // ========================================

  if (command === "attp") {

    const value =
      args.join(" ").trim();

    if (!value) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}attp Halo`
      );
    }

    try {

      const sticker =
        await textToSticker(
          value
        );

      await sock.sendMessage(
        chat,
        {
          sticker
        },
        {
          quoted: message
        }
      );

    } catch (error) {

      await sendText(
        chat,
        "❌ Gagal membuat ATTP."
      );
    }

    return true;
  }


  // ========================================
  // BRAT
  // ========================================

  if (command === "brat") {

    const value =
      args.join(" ").trim();

    if (!value) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}brat ZazaBot`
      );
    }

    try {

      const sticker =
        await createBratSticker(
          value
        );

      await sock.sendMessage(
        chat,
        {
          sticker
        },
        {
          quoted: message
        }
      );

    } catch (error) {

      console.error(
        "BRAT ERROR:",
        error.message
      );

      await sendText(
        chat,
        "❌ Gagal membuat Brat sticker."
      );
    }

    return true;
  }


  // ========================================
  // TOIMG
  // ========================================

  if (command === "toimg") {

    try {

      let buffer = null;

      if (quoted) {

        buffer =
          await downloadMediaMessage(
            quoted
          );
      }

      if (!buffer) {

        return sendText(
          chat,
          `❌ Reply sticker dengan ${PREFIX}toimg`
        );
      }

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
        },
        {
          quoted: message
        }
      );

    } catch (error) {

      console.error(
        "TOIMG ERROR:",
        error.message
      );

      await sendText(
        chat,
        "❌ Gagal mengubah sticker."
      );
    }

    return true;
  }


  // ========================================
  // QR CODE
  // ========================================

  if (
    command === "qr" ||
    command === "qrcode"
  ) {

    const value =
      args.join(" ").trim();

    if (!value) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}qr https://google.com`
      );
    }

    try {

      await sendQRImage(
        chat,
        value,
        message
      );

    } catch (error) {

      await sendText(
        chat,
        "❌ Gagal membuat QR."
      );
    }

    return true;
  }


  // ========================================
  // GOOGLE
  // ========================================

  if (command === "google") {

    const query =
      args.join(" ").trim();

    if (!query) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}google WhatsApp`
      );
    }

    try {

      const results =
        await googleSearch(
          query
        );

      if (!results.length) {

        return sendText(
          chat,
          "❌ Hasil pencarian tidak ditemukan."
        );
      }

      return sendText(
        chat,
        `🔎 *GOOGLE*\n\n` +
        results
          .map(
            (url, index) =>
              `${index + 1}. ${url}`
          )
          .join("\n\n")
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Google search gagal."
      );
    }
  }


  // ========================================
  // GOOGLE IMAGE
  // ========================================

  if (command === "googleimage") {

    const query =
      args.join(" ").trim();

    if (!query) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}googleimage kucing`
      );
    }

    try {

      const images =
        await googleImageSearch(
          query
        );

      if (!images.length) {

        return sendText(
          chat,
          "❌ Gambar tidak ditemukan."
        );
      }

      for (const image of images) {

        try {

          await sock.sendMessage(
            chat,
            {
              image: {
                url: image
              },
              caption:
                `🔎 Hasil gambar: ${query}`
            },
            {
              quoted: message
            }
          );

        } catch {}
      }

    } catch (error) {

      await sendText(
        chat,
        "❌ Google Image gagal."
      );
    }

    return true;
  }


  // ========================================
  // WIKIPEDIA
  // ========================================

  if (command === "wikipedia") {

    const query =
      args.join(" ").trim();

    if (!query) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}wikipedia Indonesia`
      );
    }

    try {

      const result =
        await wikipediaSearch(
          query
        );

      if (!result) {

        return sendText(
          chat,
          "❌ Artikel tidak ditemukan."
        );
      }

      return sendText(
        chat,
        `📚 *${result.title}*\n\n` +
        `${result.description}\n\n` +
        `${result.extract}\n\n` +
        `${result.url}`
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Wikipedia gagal."
      );
    }
  }


  // ========================================
  // YOUTUBE SEARCH
  // ========================================

  if (
    command === "ytsearch" ||
    command === "yts"
  ) {

    const query =
      args.join(" ").trim();

    if (!query) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}ytsearch lagu`
      );
    }

    try {

      const results =
        await youtubeSearch(
          query
        );

      if (!results.length) {

        return sendText(
          chat,
          "❌ Video tidak ditemukan."
        );
      }

      return sendText(
        chat,
        `🎬 *YOUTUBE SEARCH*\n\n` +
        results
          .map(
            (url, index) =>
              `${index + 1}. ${url}`
          )
          .join("\n\n")
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ YouTube search gagal."
      );
    }
  }


  // ========================================
  // LIRIK
  // ========================================

  if (command === "lirik") {

    const query =
      args.join(" ").trim();

    if (!query) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}lirik artist judul lagu`
      );
    }

    try {

      const lyrics =
        await lyricSearch(
          query
        );

      if (!lyrics) {

        return sendText(
          chat,
          "❌ Lirik tidak ditemukan."
        );
      }

      return sendText(
        chat,
        `🎵 *LIRIK*\n\n${lyrics.slice(0, 6000)}`
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Pencarian lirik gagal."
      );
    }
  }


  // ========================================
  // SHORTLINK
  // ========================================

  if (
    command === "shortlink" ||
    command === "short"
  ) {

    const url =
      args[0];

    if (!url) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}shortlink https://google.com`
      );
    }

    try {

      const short =
        await createShortLink(
          url
        );

      return sendText(
        chat,
        `🔗 *SHORTLINK*\n\n${short}`
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Gagal membuat shortlink."
      );
    }
  }


  // ========================================
  // TIKTOK
  // ========================================

  if (
    command === "tiktok" ||
    command === "tiktoknowm" ||
    command === "tiktokwm"
  ) {

    const url =
      args[0];

    if (!url) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}tiktok https://vt.tiktok.com/...`
      );
    }

    try {

      await sendText(
        chat,
        "⏳ Sedang mengambil video TikTok..."
      );

      const data =
        await tikTokDownload(
          url
        );

      const video =
        data.play ||
        data.wmplay ||
        data.hdplay;

      if (!video) {

        return sendText(
          chat,
          "❌ Link video tidak tersedia."
        );
      }

      await sock.sendMessage(
        chat,
        {
          video: {
            url: video
          },
          caption:
            "🎬 TikTok Downloader\n\n" +
            "🤖 ZazaBot"
        },
        {
          quoted: message
        }
      );

      if (data.music) {

        try {

          await sock.sendMessage(
            chat,
            {
              audio: {
                url: data.music
              },
              mimetype:
                "audio/mpeg",
              ptt: false
            },
            {
              quoted: message
            }
          );

        } catch {}
      }

    } catch (error) {

      console.error(
        "TIKTOK ERROR:",
        error.message
      );

      await sendText(
        chat,
        "❌ Gagal mengambil video TikTok."
      );
    }

    return true;
  }


  // ========================================
  // TIKTOK MUSIC
  // ========================================

  if (command === "tiktokmusic") {

    const url =
      args[0];

    if (!url) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}tiktokmusic https://vt.tiktok.com/...`
      );
    }

    try {

      const data =
        await tikTokDownload(
          url
        );

      const music =
        data.music;

      if (!music) {

        return sendText(
          chat,
          "❌ Audio tidak tersedia."
        );
      }

      await sock.sendMessage(
        chat,
        {
          audio: {
            url: music
          },
          mimetype:
            "audio/mpeg",
          ptt: false
        },
        {
          quoted: message
        }
      );

    } catch (error) {

      await sendText(
        chat,
        "❌ Gagal mengambil audio TikTok."
      );
    }

    return true;
  }


  // ========================================
  // SCREENSHOT
  // ========================================

  if (command === "screenshot") {

    const url =
      args[0];

    if (!url) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}screenshot https://google.com`
      );
    }

    try {

      const image =
        await websiteScreenshot(
          url
        );

      await sock.sendMessage(
        chat,
        {
          image,
          caption:
            "📸 Screenshot website"
        },
        {
          quoted: message
        }
      );

    } catch (error) {

      await sendText(
        chat,
        "❌ Screenshot gagal."
      );
    }

    return true;
  }


  // ========================================
  // REMOVE BG
  // ========================================

  if (
    command === "removebg" ||
    command === "removebackground"
  ) {

    return sendText(
      chat,
      "⚠️ Fitur Remove Background membutuhkan API khusus. Belum diaktifkan agar bot tidak error."
    );
  }


  // ========================================
  // OCR
  // ========================================

  if (command === "ocr") {

    return sendText(
      chat,
      "⚠️ OCR membutuhkan engine/API OCR. Belum diaktifkan pada versi stabil ini."
    );
  }


  return false;
}

console.log("✅ Part 4 loaded.");
    // ==========================================
// PART 5 - GROUP & ADMIN
// ==========================================

async function getGroupMetadataSafe(chat) {
  try {
    return await sock.groupMetadata(chat);
  } catch (error) {
    console.error("GROUP METADATA ERROR:", error.message);
    return null;
  }
}

function getGroupAdmins(metadata) {
  if (!metadata?.participants) return [];

  return metadata.participants
    .filter(
      participant =>
        participant.admin === "admin" ||
        participant.admin === "superadmin"
    )
    .map(participant => participant.id);
}

function isParticipantAdmin(metadata, jid) {
  if (!metadata?.participants) return false;

  const participant = metadata.participants.find(
    item => item.id === jid
  );

  return Boolean(
    participant &&
    (
      participant.admin === "admin" ||
      participant.admin === "superadmin"
    )
  );
}

async function isBotAdmin(chat, metadata = null) {
  const info =
    metadata ||
    await getGroupMetadataSafe(chat);

  if (!info) return false;

  return isParticipantAdmin(
    info,
    sock.user?.id
  );
}

async function requireGroup(message) {
  const chat = getChat(message);

  if (!isGroup(chat)) {
    await sendText(
      chat,
      "❌ Command ini hanya dapat digunakan di dalam grup."
    );

    return false;
  }

  return true;
}

async function requireAdmin(message) {
  const chat = getChat(message);
  const sender = getSender(message);

  if (!await requireGroup(message)) {
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

  const info =
    metadata ||
    await getGroupMetadataSafe(chat);

  if (!info) {
    await sendText(
      chat,
      "❌ Gagal mengambil data grup."
    );

    return false;
  }

  if (!await isBotAdmin(chat, info)) {
    await sendText(
      chat,
      "❌ Bot harus menjadi admin grup."
    );

    return false;
  }

  return info;
}


// ==========================================
// 🎯 TARGET MEMBER
// ==========================================

function getTargetMembers(message, args = []) {

  const targets = [];

  const mentioned =
    message?.message?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid || [];

  for (const jid of mentioned) {
    if (!targets.includes(jid)) {
      targets.push(jid);
    }
  }

  for (const arg of args) {

    const number =
      String(arg)
        .replace(/\D/g, "");

    if (
      number.length >= 8 &&
      number.length <= 15
    ) {

      const jid =
        userJid(number);

      if (
        jid &&
        !targets.includes(jid)
      ) {
        targets.push(jid);
      }
    }
  }

  return targets;
}


// ==========================================
// 👥 GROUP COMMAND
// ==========================================

async function handleGroupCommand(
  message,
  command,
  args,
  text
) {

  const chat = getChat(message);
  const sender = getSender(message);

  // ========================================
  // GROUP INFO
  // ========================================

  if (
    command === "groupinfo" ||
    command === "groupsetting"
  ) {

    if (!await requireGroup(message)) {
      return true;
    }

    const metadata =
      await getGroupMetadataSafe(chat);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    const admins =
      getGroupAdmins(metadata);

    return sendText(
      chat,
      `╭━━〔 👥 GROUP INFO 〕━━╮\n` +
      `┃ Nama : ${metadata.subject}\n` +
      `┃ ID : ${chat}\n` +
      `┃ Member : ${metadata.participants.length}\n` +
      `┃ Admin : ${admins.length}\n` +
      `┃ Welcome : ${group.welcome ? "ON" : "OFF"}\n` +
      `┃ Goodbye : ${group.goodbye ? "ON" : "OFF"}\n` +
      `┃ Antilink : ${group.antilink ? "ON" : "OFF"}\n` +
      `┃ Anti Wame : ${group.antiwame ? "ON" : "OFF"}\n` +
      `┃ Anti Badword : ${group.antibadword ? "ON" : "OFF"}\n` +
      `╰━━━━━━━━━━━━━━━━━━╯`
    );
  }


  // ========================================
  // CEK ID GROUP
  // ========================================

  if (command === "cekidgroup") {

    if (!await requireGroup(message)) {
      return true;
    }

    return sendText(
      chat,
      `🆔 *GROUP ID*\n\n${chat}`
    );
  }


  // ========================================
  // LINK GROUP
  // ========================================

  if (
    command === "linkgc" ||
    command === "linkgroup"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    if (
      !await requireBotAdmin(
        message,
        metadata
      )
    ) {
      return true;
    }

    try {

      const code =
        await sock.groupInviteCode(chat);

      return sendText(
        chat,
        `🔗 *LINK GROUP*\n\n` +
        `https://chat.whatsapp.com/${code}`
      );

    } catch (error) {

      console.error(
        "GROUP LINK ERROR:",
        error.message
      );

      return sendText(
        chat,
        "❌ Gagal mengambil link grup."
      );
    }
  }


  // ========================================
  // REVOKE LINK
  // ========================================

  if (command === "revokelink") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    if (
      !await requireBotAdmin(
        message,
        metadata
      )
    ) {
      return true;
    }

    try {

      await sock.groupRevokeInvite(chat);

      return sendText(
        chat,
        "✅ Link grup berhasil direset."
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Gagal mereset link grup."
      );
    }
  }


  // ========================================
  // LIST ADMIN
  // ========================================

  if (
    command === "groupadmin" ||
    command === "listadmin"
  ) {

    if (!await requireGroup(message)) {
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

    return sock.sendMessage(
      chat,
      {
        text:
          `👑 *ADMIN GROUP*\n\n` +
          mentions
            .map(
              (x, i) =>
                `${i + 1}. ${x}`
            )
            .join("\n"),
        mentions: admins
      },
      {
        quoted: message
      }
    );
  }


  // ========================================
  // TAG ADMIN
  // ========================================

  if (command === "tagadmin") {

    if (!await requireGroup(message)) {
      return true;
    }

    const metadata =
      await getGroupMetadataSafe(chat);

    if (!metadata) {
      return true;
    }

    const admins =
      getGroupAdmins(metadata);

    return sock.sendMessage(
      chat,
      {
        text:
          `📢 *TAG ADMIN*\n\n` +
          admins
            .map(
              jid => `@${jidNumber(jid)}`
            )
            .join(" "),
        mentions: admins
      },
      {
        quoted: message
      }
    );
  }


  // ========================================
  // TAG ALL
  // ========================================

  if (
    command === "tagall" ||
    command === "hidetag"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const members =
      metadata.participants
        .map(
          participant => participant.id
        );

    const content =
      args.join(" ").trim() ||
      "📢 Semua member harap perhatikan!";

    return sock.sendMessage(
      chat,
      {
        text: content,
        mentions: members
      },
      {
        quoted: message
      }
    );
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

    if (
      !await requireBotAdmin(
        message,
        metadata
      )
    ) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}add 628xxxxxxxxxx`
      );
    }

    try {

      const result =
        await sock.groupParticipantsUpdate(
          chat,
          targets,
          "add"
        );

      const success =
        result.filter(
          item =>
            item.status === "200"
        ).length;

      return sendText(
        chat,
        `✅ Proses add selesai.\n` +
        `Berhasil: ${success}/${targets.length}`
      );

    } catch (error) {

      console.error(
        "ADD ERROR:",
        error.message
      );

      return sendText(
        chat,
        "❌ Gagal menambahkan member."
      );
    }
  }


  // ========================================
  // KICK
  // ========================================

  if (
    command === "kick" ||
    command === "banmember"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    if (
      !await requireBotAdmin(
        message,
        metadata
      )
    ) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}kick @user`
      );
    }

    const protectedMembers =
      metadata.participants
        .filter(
          participant =>
            participant.admin
        )
        .map(
          participant =>
            participant.id
        );

    const validTargets =
      targets.filter(
        target =>
          !protectedMembers.includes(
            target
          ) &&
          target !== sock.user?.id
      );

    if (!validTargets.length) {

      return sendText(
        chat,
        "❌ Target tidak dapat dikeluarkan."
      );
    }

    try {

      await sock.groupParticipantsUpdate(
        chat,
        validTargets,
        "remove"
      );

      return sendText(
        chat,
        `✅ ${validTargets.length} member berhasil dikeluarkan.`
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Gagal mengeluarkan member."
      );
    }
  }


  // ========================================
  // KICK ME
  // ========================================

  if (command === "kickme") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    if (
      !await requireBotAdmin(
        message,
        metadata
      )
    ) {
      return true;
    }

    if (
      isParticipantAdmin(
        metadata,
        sender
      )
    ) {

      return sendText(
        chat,
        "❌ Admin tidak dapat menggunakan command ini."
      );
    }

    try {

      await sock.groupParticipantsUpdate(
        chat,
        [sender],
        "remove"
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Gagal keluar dari grup."
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

    if (
      !await requireBotAdmin(
        message,
        metadata
      )
    ) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}promote @user`
      );
    }

    try {

      await sock.groupParticipantsUpdate(
        chat,
        targets,
        "promote"
      );

      return sendText(
        chat,
        "✅ Member berhasil dipromosikan menjadi admin."
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Gagal promote member."
      );
    }
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

    if (
      !await requireBotAdmin(
        message,
        metadata
      )
    ) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}demote @user`
      );
    }

    try {

      await sock.groupParticipantsUpdate(
        chat,
        targets,
        "demote"
      );

      return sendText(
        chat,
        "✅ Admin berhasil diturunkan menjadi member."
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Gagal demote member."
      );
    }
  }


  // ========================================
  // SET NAMA GROUP
  // ========================================

  if (
    command === "setnamegc" ||
    command === "setname"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    if (
      !await requireBotAdmin(
        message,
        metadata
      )
    ) {
      return true;
    }

    const name =
      args.join(" ").trim();

    if (!name) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}setnamegc Zaza Store`
      );
    }

    try {

      await sock.groupUpdateSubject(
        chat,
        name
      );

      return sendText(
        chat,
        "✅ Nama grup berhasil diubah."
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Gagal mengubah nama grup."
      );
    }
  }


  // ========================================
  // SET DESCRIPTION
  // ========================================

  if (
    command === "setdescgc" ||
    command === "descgc"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    if (
      !await requireBotAdmin(
        message,
        metadata
      )
    ) {
      return true;
    }

    const description =
      args.join(" ").trim();

    if (!description) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}setdescgc Deskripsi grup`
      );
    }

    try {

      await sock.groupUpdateDescription(
        chat,
        description
      );

      return sendText(
        chat,
        "✅ Deskripsi grup berhasil diubah."
      );

    } catch (error) {

      return sendText(
        chat,
        "❌ Gagal mengubah deskripsi grup."
      );
    }
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

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}welcome on\n${PREFIX}welcome off`
      );
    }

    group.welcome =
      value === "on";

    saveDB();

    return sendText(
      chat,
      `✅ Welcome ${group.welcome ? "diaktifkan" : "dimatikan"}.`
    );
  }


  // ========================================
  // GOODBYE
  // ========================================

  if (
    command === "goodbye" ||
    command === "setleft"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}goodbye on\n${PREFIX}goodbye off`
      );
    }

    group.goodbye =
      value === "on";

    saveDB();

    return sendText(
      chat,
      `✅ Goodbye ${group.goodbye ? "diaktifkan" : "dimatikan"}.`
    );
  }


  // ========================================
  // SET WELCOME
  // ========================================

  if (command === "setwelcome") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const value =
      args.join(" ").trim();

    if (!value) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}setwelcome Selamat datang @user`
      );
    }

    const group =
      getGroup(chat);

    group.welcomeText =
      value;

    saveDB();

    return sendText(
      chat,
      "✅ Pesan welcome berhasil diubah."
    );
  }


  // ========================================
  // ANTILINK
  // ========================================

  if (
    command === "antilink" ||
    command === "antilinknokick"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}antilink on\n${PREFIX}antilink off`
      );
    }

    group.antilink =
      value === "on";

    group.antilinkKick =
      command === "antilink"
        ? true
        : false;

    saveDB();

    return sendText(
      chat,
      `🔗 Antilink ${group.antilink ? "ON" : "OFF"}\n` +
      `👢 Kick : ${group.antilinkKick ? "ON" : "OFF"}`
    );
  }


  // ========================================
  // ANTILINK CHANNEL
  // ========================================

  if (command === "antilinkchannel") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}antilinkchannel on`
      );
    }

    group.antilinkChannel =
      value === "on";

    saveDB();

    return sendText(
      chat,
      `📢 Anti WhatsApp Channel ${group.antilinkChannel ? "ON" : "OFF"}`
    );
  }


  // ========================================
  // ANTI BADWORD
  // ========================================

  if (
    command === "antibadword" ||
    command === "antibadwordnokick"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}antibadword on`
      );
    }

    group.antibadword =
      value === "on";

    group.antibadwordKick =
      command === "antibadword";

    saveDB();

    return sendText(
      chat,
      `🤬 Anti Badword ${group.antibadword ? "ON" : "OFF"}`
    );
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

      return sendText(
        chat,
        `Contoh:\n${PREFIX}addbadword kata`
      );
    }

    const group =
      getGroup(chat);

    if (
      !Array.isArray(group.badwords)
    ) {
      group.badwords = [];
    }

    if (
      !group.badwords.includes(word)
    ) {

      group.badwords.push(word);
    }

    saveDB();

    return sendText(
      chat,
      `✅ Badword "${word}" berhasil ditambahkan.`
    );
  }


  // ========================================
  // LIST BADWORD
  // ========================================

  if (command === "listbadword") {

    if (!await requireGroup(message)) {
      return true;
    }

    const group =
      getGroup(chat);

    const words =
      Array.isArray(group.badwords)
        ? group.badwords
        : [];

    if (!words.length) {

      return sendText(
        chat,
        "📋 Belum ada badword."
      );
    }

    return sendText(
      chat,
      `🤬 *LIST BADWORD*\n\n` +
      words
        .map(
          (word, index) =>
            `${index + 1}. ${word}`
        )
        .join("\n")
    );
  }


  // ========================================
  // ANTIBOT
  // ========================================

  if (command === "antibot") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}antibot on`
      );
    }

    group.antibot =
      value === "on";

    saveDB();

    return sendText(
      chat,
      `🤖 Antibot ${group.antibot ? "ON" : "OFF"}`
    );
  }


  // ========================================
  // ANTIDELETE
  // ========================================

  if (command === "antidelete") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}antidelete on`
      );
    }

    group.antidelete =
      value === "on";

    saveDB();

    return sendText(
      chat,
      `🗑️ Antidelete ${group.antidelete ? "ON" : "OFF"}`
    );
  }


  // ========================================
  // ANTI MENTION
  // ========================================

  if (command === "antimentionsw") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}antimentionsw on`
      );
    }

    group.antimentionsw =
      value === "on";

    saveDB();

    return sendText(
      chat,
      `📢 Anti Mention ${group.antimentionsw ? "ON" : "OFF"}`
    );
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

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}antiviewonce on`
      );
    }

    group.antiviewonce =
      value === "on";

    saveDB();

    return sendText(
      chat,
      `👁️ Anti View Once ${group.antiviewonce ? "ON" : "OFF"}`
    );
  }


  // ========================================
  // ANTI WAME
  // ========================================

  if (
    command === "antiwame" ||
    command === "antiwamenokick"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) {
      return true;
    }

    const group =
      getGroup(chat);

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}antiwame on`
      );
    }

    group.antiwame =
      value === "on";

    group.antiwameKick =
      command === "antiwame";

    saveDB();

    return sendText(
      chat,
      `📱 Anti Wame ${group.antiwame ? "ON" : "OFF"}`
    );
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

    const value =
      String(args[0] || "")
        .toLowerCase();

    if (
      value !== "on" &&
      value !== "off"
    ) {

      return sendText(
        chat,
        `Contoh:\n${PREFIX}antiluar on`
      );
    }

    group.antiluar =
      value === "on";

    saveDB();

    return sendText(
      chat,
      `🌎 Anti Luar ${group.antiluar ? "ON" : "OFF"}`
    );
  }


  return false;
}

console.log("✅ Part 5 loaded.");
    // ==========================================
// PART 6 - WARN, LIST, POINT, REMINDER & AFK
// ==========================================


// ==========================================
// ⚠️ WARNING SYSTEM
// ==========================================

async function handleWarningCommand(
  message,
  command,
  args
) {

  const chat = getChat(message);

  // WARN
  if (command === "warn") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const botAdmin =
      await requireBotAdmin(
        message,
        metadata
      );

    if (!botAdmin) return true;

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}warn @user`
      );

      return true;
    }

    const group =
      getGroup(chat);

    if (!group.warnings) {
      group.warnings = {};
    }

    for (const target of targets) {

      group.warnings[target] =
        Number(
          group.warnings[target] || 0
        ) + 1;

      const count =
        group.warnings[target];

      const mention =
        `@${jidNumber(target)}`;

      if (count >= 3) {

        try {

          await sock.groupParticipantsUpdate(
            chat,
            [target],
            "remove"
          );

          group.warnings[target] = 0;

          await sock.sendMessage(
            chat,
            {
              text:
                `🚨 ${mention} telah mencapai 3 warning dan dikeluarkan dari grup.`,
              mentions: [target]
            },
            {
              quoted: message
            }
          );

        } catch (error) {

          await sock.sendMessage(
            chat,
            {
              text:
                `⚠️ ${mention} mencapai 3 warning, tetapi bot gagal mengeluarkannya.`,
              mentions: [target]
            },
            {
              quoted: message
            }
          );
        }

      } else {

        await sock.sendMessage(
          chat,
          {
            text:
              `⚠️ Warning untuk ${mention}\n` +
              `Jumlah warning: ${count}/3`,
            mentions: [target]
          },
          {
            quoted: message
          }
        );
      }
    }

    saveDB();
    return true;
  }


  // UNWARN
  if (command === "unwarn") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const targets =
      getTargetMembers(
        message,
        args
      );

    if (!targets.length) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}unwarn @user`
      );

      return true;
    }

    const group =
      getGroup(chat);

    if (!group.warnings) {
      group.warnings = {};
    }

    for (const target of targets) {

      const current =
        Number(
          group.warnings[target] || 0
        );

      group.warnings[target] =
        Math.max(
          0,
          current - 1
        );
    }

    saveDB();

    await sendText(
      chat,
      "✅ Warning berhasil dikurangi."
    );

    return true;
  }


  // CEK WARN
  if (command === "cekwarn") {

    if (!await requireGroup(message)) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    const target =
      targets[0] ||
      getSender(message);

    const group =
      getGroup(chat);

    const count =
      Number(
        group.warnings?.[target] || 0
      );

    await sock.sendMessage(
      chat,
      {
        text:
          `⚠️ Warning @${jidNumber(target)}: ${count}/3`,
        mentions: [target]
      },
      {
        quoted: message
      }
    );

    return true;
  }


  // LIST WARN
  if (command === "listwarn") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const group =
      getGroup(chat);

    const warnings =
      group.warnings || {};

    const entries =
      Object.entries(warnings)
        .filter(
          ([, value]) =>
            Number(value) > 0
        );

    if (!entries.length) {

      await sendText(
        chat,
        "✅ Tidak ada member yang memiliki warning."
      );

      return true;
    }

    const mentions =
      entries.map(
        ([jid, value], index) =>
          `${index + 1}. @${jidNumber(jid)} — ${value}/3`
      );

    await sock.sendMessage(
      chat,
      {
        text:
          `⚠️ *LIST WARNING*\n\n` +
          mentions.join("\n"),
        mentions:
          entries.map(
            ([jid]) => jid
          )
      },
      {
        quoted: message
      }
    );

    return true;
  }


  // RESET WARN
  if (command === "resetwarn") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const group =
      getGroup(chat);

    group.warnings = {};

    saveDB();

    await sendText(
      chat,
      "✅ Semua warning berhasil direset."
    );

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

  const sender =
    getSender(message);

  // ADD LIST
  if (command === "addlist") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const name =
      args[0];

    const content =
      args.slice(1).join(" ").trim();

    if (!name || !content) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}addlist nama isi`
      );

      return true;
    }

    const group =
      getGroup(chat);

    if (!group.lists) {
      group.lists = {};
    }

    group.lists[name.toLowerCase()] =
      content;

    saveDB();

    await sendText(
      chat,
      `✅ List *${name}* berhasil ditambahkan.`
    );

    return true;
  }


  // UPDATE LIST
  if (
    command === "updatelist" ||
    command === "uplist"
  ) {

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const name =
      args[0];

    const content =
      args.slice(1).join(" ").trim();

    if (!name || !content) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}updatelist nama isi baru`
      );

      return true;
    }

    const group =
      getGroup(chat);

    if (!group.lists) {
      group.lists = {};
    }

    group.lists[name.toLowerCase()] =
      content;

    saveDB();

    await sendText(
      chat,
      `✅ List *${name}* berhasil diperbarui.`
    );

    return true;
  }


  // LIST
  if (command === "list") {

    if (!await requireGroup(message)) {
      return true;
    }

    const group =
      getGroup(chat);

    const lists =
      group.lists || {};

    const entries =
      Object.entries(lists);

    if (!entries.length) {

      await sendText(
        chat,
        "📋 Belum ada list."
      );

      return true;
    }

    let output =
      "📋 *DAFTAR LIST*\n\n";

    for (
      const [name, content]
      of entries
    ) {

      output +=
        `📌 *${name}*\n` +
        `${content}\n\n`;
    }

    await sendText(
      chat,
      output.trim()
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

  // ADD POINT
  if (command === "addpoin") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const targets =
      getTargetMembers(
        message,
        args
      );

    const amountArg =
      args.find(
        arg =>
          /^\d+$/.test(arg)
      );

    const amount =
      Number(amountArg || 1);

    if (!targets.length) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}addpoin @user 10`
      );

      return true;
    }

    if (
      !Number.isFinite(amount) ||
      amount < 1 ||
      amount > 100000
    ) {

      await sendText(
        chat,
        "❌ Jumlah point tidak valid."
      );

      return true;
    }

    for (const target of targets) {

      addPoint(
        target,
        amount
      );
    }

    saveDB();

    await sendText(
      chat,
      `✅ Berhasil menambahkan ${amount} point.`
    );

    return true;
  }


  // CEK POINT
  if (command === "cekpoint") {

    if (!await requireGroup(message)) {
      return true;
    }

    const targets =
      getTargetMembers(
        message,
        args
      );

    const target =
      targets[0] ||
      getSender(message);

    const user =
      getUser(target);

    await sock.sendMessage(
      chat,
      {
        text:
          `⭐ Point @${jidNumber(target)}: ${user.points || 0}`,
        mentions: [target]
      },
      {
        quoted: message
      }
    );

    return true;
  }


  // LIST POINT
  if (command === "listpoint") {

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const group =
      getGroup(chat);

    const points =
      group.points || {};

    const entries =
      Object.entries(points)
        .sort(
          (a, b) =>
            Number(b[1]) -
            Number(a[1])
        );

    if (!entries.length) {

      await sendText(
        chat,
        "⭐ Belum ada data point grup."
      );

      return true;
    }

    const mentions =
      entries
        .slice(0, 20)
        .map(
          ([jid, value], index) =>
            `${index + 1}. @${jidNumber(jid)} — ${value}`
        );

    await sock.sendMessage(
      chat,
      {
        text:
          `🏆 *LEADERBOARD POINT*\n\n` +
          mentions.join("\n"),
        mentions:
          entries
            .slice(0, 20)
            .map(
              ([jid]) => jid
            )
      },
      {
        quoted: message
      }
    );

    return true;
  }


  return false;
}


// ==========================================
// ⏰ REMINDER & ALARM
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

  // ADD REMINDER
  if (
    command === "addreminder" ||
    command === "addalarm"
  ) {

    if (!await requireGroup(message)) {
      return true;
    }

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const duration =
      parseDuration(args[0]);

    const reminderText =
      args.slice(1)
        .join(" ")
        .trim();

    if (
      !duration ||
      !reminderText
    ) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}addreminder 10m rapat\n\n` +
        `Format waktu: 10s, 10m, 2h, 1d`
      );

      return true;
    }

    const group =
      getGroup(chat);

    if (!Array.isArray(group.reminders)) {
      group.reminders = [];
    }

    const reminder = {
      id: randomId("rem"),
      text: reminderText,
      createdBy: sender,
      createdAt: Date.now(),
      duration
    };

    group.reminders.push(
      reminder
    );

    saveDB();

    await sendText(
      chat,
      `⏰ Reminder dibuat.\n\n` +
      `📝 ${reminderText}\n` +
      `⏱️ ${args[0]}`
    );

    setTimeout(
      async () => {

        try {

          await sendText(
            chat,
            `⏰ *REMINDER*\n\n${reminderText}`
          );

          const currentGroup =
            getGroup(chat);

          currentGroup.reminders =
            currentGroup.reminders.filter(
              item =>
                item.id !== reminder.id
            );

          saveDB();

        } catch (error) {

          console.error(
            "REMINDER ERROR:",
            error.message
          );
        }

      },
      Math.min(
        duration,
        2147483647
      )
    );

    return true;
  }


  // CREATE SCHEDULE
  if (
    command === "createschedulecall" ||
    command === "groupschedule"
  ) {

    if (!await requireGroup(message)) {
      return true;
    }

    const metadata =
      await requireAdmin(message);

    if (!metadata) return true;

    const duration =
      parseDuration(args[0]);

    const scheduleText =
      args.slice(1)
        .join(" ")
        .trim();

    if (
      !duration ||
      !scheduleText
    ) {

      await sendText(
        chat,
        `Contoh:\n${PREFIX}groupschedule 30m Meeting`
      );

      return true;
    }

    await sendText(
      chat,
      `📅 Jadwal berhasil dibuat.\n\n` +
      `📝 ${scheduleText}\n` +
      `⏱️ ${args[0]}`
    );

    setTimeout(
      async () => {

        try {

          await sendText(
            chat,
            `📅 *JADWAL*\n\n${scheduleText}`
          );

        } catch {}
      },
      Math.min(
        duration,
        2147483647
      )
    );

    return true;
  }


  // LIST REMINDER
  if (
    command === "listreminder" ||
    command === "listalarm"
  ) {

    if (!await requireGroup(message)) {
      return true;
    }

    const group =
      getGroup(chat);

    const reminders =
      Array.isArray(group.reminders)
        ? group.reminders
        : [];

    if (!reminders.length) {

      await sendText(
        chat,
        "⏰ Tidak ada reminder aktif."
      );

      return true;
    }

    let output =
      "⏰ *REMINDER AKTIF*\n\n";

    reminders.forEach(
      (item, index) => {

        output +=
          `${index + 1}. ${item.text}\n`;
      }
    );

    await sendText(
      chat,
      output.trim()
    );

    return true;
  }


  return false;
}


// ==========================================
// 😴 AFK
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

  if (command === "afk") {

    const reason =
      args.join(" ").trim() ||
      "AFK";

    const user =
      getUser(sender);

    user.afk = {
      reason,
      time: Date.now()
    };

    saveDB();

    await sendText(
      chat,
      `😴 *AFK AKTIF*\n\n` +
      `Alasan: ${reason}`
    );

    return true;
  }


  return false;
}


// ==========================================
// 👤 ABSEN
// ==========================================

async function handleAbsenCommand(
  message,
  command
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  if (command === "absen") {

    if (!await requireGroup(message)) {
      return true;
    }

    const group =
      getGroup(chat);

    if (!group.absen) {
      group.absen = {};
    }

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    if (
      group.absen[sender] === today
    ) {

      await sendText(
        chat,
        "✅ Kamu sudah absen hari ini."
      );

      return true;
    }

    group.absen[sender] =
      today;

    addPoint(
      sender,
      1
    );

    saveDB();

    await sock.sendMessage(
      chat,
      {
        text:
          `✅ @${jidNumber(sender)} berhasil absen.\n` +
          `⭐ +1 point`,
        mentions: [sender]
      },
      {
        quoted: message
      }
    );

    return true;
  }

  return false;
}


// ==========================================
// 📊 GROUP POINT DATA
// ==========================================

function syncGroupPoint(
  chat,
  jid,
  amount
) {

  const group =
    getGroup(chat);

  if (!group.points) {
    group.points = {};
  }

  group.points[jid] =
    Number(group.points[jid] || 0) +
    Number(amount || 0);
}


// ==========================================
// 🔧 DATABASE MIGRATION
// ==========================================

function migrateDatabase() {

  if (!db.users) {
    db.users = {};
  }

  if (!db.groups) {
    db.groups = {};
  }

  for (
    const user of
    Object.values(db.users)
  ) {

    if (
      typeof user.points !== "number"
    ) {
      user.points = 0;
    }

    if (
      typeof user.xp !== "number"
    ) {
      user.xp = 0;
    }

    if (
      typeof user.level !== "number"
    ) {
      user.level = 1;
    }

    if (
      typeof user.limit !== "number"
    ) {
      user.limit = 20;
    }

    if (
      typeof user.balance !== "number"
    ) {
      user.balance = 0;
    }

    if (
      typeof user.warn !== "number"
    ) {
      user.warn = 0;
    }
  }

  for (
    const group of
    Object.values(db.groups)
  ) {

    if (!group.lists) {
      group.lists = {};
    }

    if (!group.points) {
      group.points = {};
    }

    if (!group.warnings) {
      group.warnings = {};
    }

    if (!Array.isArray(group.reminders)) {
      group.reminders = [];
    }

    if (!Array.isArray(group.badwords)) {
      group.badwords = [];
    }

    if (
      typeof group.welcome !== "boolean"
    ) {
      group.welcome = false;
    }

    if (
      typeof group.goodbye !== "boolean"
    ) {
      group.goodbye = false;
    }

    if (
      typeof group.antilink !== "boolean"
    ) {
      group.antilink = false;
    }

    if (
      typeof group.antibadword !== "boolean"
    ) {
      group.antibadword = false;
    }

    if (
      typeof group.antiwame !== "boolean"
    ) {
      group.antiwame = false;
    }
  }

  saveDB();
}

migrateDatabase();

console.log("✅ Part 6 loaded.");
    // ==========================================
// PART 7 - SECURITY, GAME & AFK HANDLER
// ==========================================


// ==========================================
// 🛡️ GROUP SECURITY
// ==========================================

async function handleGroupSecurity(message, text) {

  const chat = getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const sender = getSender(message);
  const group = getGroup(chat);

  // Admin dan owner bebas dari sistem anti
  try {
    const metadata = await getGroupMetadataSafe(chat);

    if (
      isOwner(sender) ||
      isParticipantAdmin(metadata, sender)
    ) {
      return false;
    }
  } catch {}

  const lowerText =
    String(text || "").toLowerCase();

  // ========================================
  // 🔗 ANTI LINK
  // ========================================

  if (
    group.antilink &&
    /(https?:\/\/|www\.|chat\.whatsapp\.com\/)/i.test(text)
  ) {

    try {
      await sock.sendMessage(
        chat,
        {
          delete: message.key
        }
      );
    } catch {}

    const warning =
      `🚫 *ANTI LINK*\n\n` +
      `@${jidNumber(sender)} jangan kirim link di grup!`;

    await sock.sendMessage(
      chat,
      {
        text: warning,
        mentions: [sender]
      }
    );

    if (group.antilinkKick) {

      try {

        const metadata =
          await getGroupMetadataSafe(chat);

        if (
          isBotAdmin(chat, metadata)
        ) {

          await sock.groupParticipantsUpdate(
            chat,
            [sender],
            "remove"
          );
        }

      } catch {}
    }

    return true;
  }


  // ========================================
  // 📢 ANTI CHANNEL
  // ========================================

  if (
    group.antilinkChannel &&
    (
      lowerText.includes("whatsapp.com/channel/") ||
      lowerText.includes("wa.me/channel/")
    )
  ) {

    try {
      await sock.sendMessage(
        chat,
        {
          delete: message.key
        }
      );
    } catch {}

    await sock.sendMessage(
      chat,
      {
        text:
          `🚫 @${jidNumber(sender)} link channel WhatsApp dilarang!`,
        mentions: [sender]
      }
    );

    return true;
  }


  // ========================================
  // 🔞 ANTI WA.ME
  // ========================================

  if (
    group.antiwame &&
    (
      lowerText.includes("wa.me/") ||
      lowerText.includes("whatsapp.com/send")
    )
  ) {

    try {
      await sock.sendMessage(
        chat,
        {
          delete: message.key
        }
      );
    } catch {}

    await sock.sendMessage(
      chat,
      {
        text:
          `🚫 @${jidNumber(sender)} link WhatsApp tidak diperbolehkan!`,
        mentions: [sender]
      }
    );

    if (group.antiwameKick) {

      try {

        const metadata =
          await getGroupMetadataSafe(chat);

        if (
          isBotAdmin(chat, metadata)
        ) {

          await sock.groupParticipantsUpdate(
            chat,
            [sender],
            "remove"
          );
        }

      } catch {}
    }

    return true;
  }


  // ========================================
  // 🤬 ANTI BADWORD
  // ========================================

  if (
    group.antibadword &&
    Array.isArray(group.badwords) &&
    group.badwords.length
  ) {

    const found =
      group.badwords.find(
        word =>
          word &&
          lowerText.includes(
            String(word).toLowerCase()
          )
      );

    if (found) {

      try {
        await sock.sendMessage(
          chat,
          {
            delete: message.key
          }
        );
      } catch {}

      await sock.sendMessage(
        chat,
        {
          text:
            `⚠️ @${jidNumber(sender)} gunakan bahasa yang sopan.`,
          mentions: [sender]
        }
      );

      if (group.antibadwordKick) {

        try {

          const metadata =
            await getGroupMetadataSafe(chat);

          if (
            isBotAdmin(chat, metadata)
          ) {

            await sock.groupParticipantsUpdate(
              chat,
              [sender],
              "remove"
            );
          }

        } catch {}
      }

      return true;
    }
  }


  // ========================================
  // 📣 ANTI MASS MENTION
  // ========================================

  if (
    group.antimentionsw &&
    message.message?.extendedTextMessage?.contextInfo?.mentionedJid
  ) {

    const mentions =
      message.message
        .extendedTextMessage
        .contextInfo
        .mentionedJid || [];

    if (mentions.length >= 5) {

      try {
        await sock.sendMessage(
          chat,
          {
            delete: message.key
          }
        );
      } catch {}

      await sock.sendMessage(
        chat,
        {
          text:
            `🚫 @${jidNumber(sender)} terlalu banyak mention!`,
          mentions: [sender]
        }
      );

      return true;
    }
  }


  return false;
}


// ==========================================
// 🎮 GAME ANSWER
// ==========================================

async function handleGameAnswer(
  message,
  text
) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  const game =
    gameSessions[chat];

  if (!game) {
    return false;
  }

  const answer =
    cleanText(text);

  if (!answer) {
    return false;
  }


  // ========================================
  // FAMILY 100
  // ========================================

  if (
    game.type === "family100"
  ) {

    const answers =
      Array.isArray(game.answers)
        ? game.answers
        : [];

    const index =
      answers.findIndex(
        item =>
          cleanText(item) === answer
      );

    if (index === -1) {
      return false;
    }

    if (
      game.found &&
      game.found.includes(index)
    ) {
      return false;
    }

    if (!game.found) {
      game.found = [];
    }

    game.found.push(index);

    addPoint(
      sender,
      5
    );

    addLimit(
      sender,
      1
    );

    addXP(
      sender,
      10
    );

    const remaining =
      answers.length -
      game.found.length;

    if (remaining <= 0) {

      await sendText(
        chat,
        `🎉 *FAMILY 100 SELESAI!*\n\n` +
        `Semua jawaban berhasil ditemukan!\n` +
        `👤 @${jidNumber(sender)} menemukan jawaban terakhir.\n\n` +
        `⭐ +5 point\n` +
        `🎯 +1 limit\n` +
        `✨ +10 XP`,
        {
          mentions: [sender]
        }
      );

      stopGame(chat);

    } else {

      await sendText(
        chat,
        `✅ Jawaban benar!\n\n` +
        `👤 @${jidNumber(sender)}\n` +
        `⭐ +5 point\n` +
        `🎯 +1 limit\n` +
        `✨ +10 XP\n\n` +
        `📊 Tersisa: ${remaining} jawaban`,
        {
          mentions: [sender]
        }
      );
    }

    return true;
  }


  // ========================================
  // GAME BIASA
  // ========================================

  if (
    game.answer
  ) {

    const correct =
      cleanText(game.answer);

    if (
      answer !== correct
    ) {
      return false;
    }

    addPoint(
      sender,
      5
    );

    addLimit(
      sender,
      1
    );

    addXP(
      sender,
      10
    );

    await sendText(
      chat,
      `🎉 *JAWABAN BENAR!*\n\n` +
      `👤 @${jidNumber(sender)}\n` +
      `⭐ +5 point\n` +
      `🎯 +1 limit\n` +
      `✨ +10 XP`,
      {
        mentions: [sender]
      }
    );

    stopGame(chat);

    return true;
  }


  return false;
}


// ==========================================
// 😴 HANDLE AFK USER
// ==========================================

async function handleAfk(message, text) {

  const chat =
    getChat(message);

  const sender =
    getSender(message);

  // ========================================
  // HAPUS AFK SENDIRI
  // ========================================

  const ownUser =
    getUser(sender);

  if (ownUser.afk) {

    const afkData =
      ownUser.afk;

    ownUser.afk = null;

    const duration =
      Date.now() -
      Number(
        afkData.time || Date.now()
      );

    const seconds =
      Math.floor(
        duration / 1000
      );

    saveDB();

    await sendText(
      chat,
      `👋 @${jidNumber(sender)} sudah kembali.\n` +
      `⏱️ AFK selama ${seconds} detik.`,
      {
        mentions: [sender]
      }
    );
  }


  // ========================================
  // CEK MENTION USER AFK
  // ========================================

  const mentioned =
    message.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid || [];

  if (!mentioned.length) {
    return false;
  }

  for (
    const target
    of mentioned
  ) {

    if (
      target === sender
    ) {
      continue;
    }

    const user =
      getUser(target);

    if (!user.afk) {
      continue;
    }

    const duration =
      Date.now() -
      Number(
        user.afk.time || Date.now()
      );

    const minutes =
      Math.floor(
        duration / 60000
      );

    const reason =
      user.afk.reason ||
      "AFK";

    await sock.sendMessage(
      chat,
      {
        text:
          `😴 @${jidNumber(target)} sedang AFK.\n\n` +
          `📝 Alasan: ${reason}\n` +
          `⏱️ Durasi: ${minutes} menit`,
        mentions: [target]
      },
      {
        quoted: message
      }
    );
  }

  return false;
}


// ==========================================
// 👥 GROUP PARTICIPANTS
// ==========================================

async function handleParticipants(update) {

  try {

    const chat =
      update.id;

    if (
      !chat ||
      !isGroup(chat)
    ) {
      return;
    }

    const group =
      getGroup(chat);

    const action =
      update.action;

    const participants =
      update.participants || [];

    if (!participants.length) {
      return;
    }

    const metadata =
      await getGroupMetadataSafe(chat);

    // ======================================
    // WELCOME
    // ======================================

    if (
      action === "add" &&
      group.welcome
    ) {

      for (
        const participant
        of participants
      ) {

        const name =
          participant
            .split("@")[0];

        const welcomeText =
          group.welcomeText ||
          `👋 Selamat datang @${name} di grup *${metadata.subject || "Grup"}*!`;

        await sock.sendMessage(
          chat,
          {
            text: welcomeText,
            mentions: [participant]
          }
        );
      }
    }


    // ======================================
    // GOODBYE
    // ======================================

    if (
      (
        action === "remove" ||
        action === "leave"
      ) &&
      group.goodbye
    ) {

      for (
        const participant
        of participants
      ) {

        const name =
          participant
            .split("@")[0];

        const goodbyeText =
          group.goodbyeText ||
          `👋 @${name} telah keluar dari grup.`;

        await sock.sendMessage(
          chat,
          {
            text: goodbyeText,
            mentions: [participant]
          }
        );
      }
    }


    // ======================================
    // PROMOTE
    // ======================================

    if (
      action === "promote"
    ) {

      for (
        const participant
        of participants
      ) {

        await sock.sendMessage(
          chat,
          {
            text:
              `🎉 Selamat @${jidNumber(participant)} sekarang menjadi admin!`,
            mentions: [participant]
          }
        );
      }
    }


    // ======================================
    // DEMOTE
    // ======================================

    if (
      action === "demote"
    ) {

      for (
        const participant
        of participants
      ) {

        await sock.sendMessage(
          chat,
          {
            text:
              `ℹ️ @${jidNumber(participant)} sudah tidak menjadi admin.`,
            mentions: [participant]
          }
        );
      }
    }

  } catch (error) {

    console.error(
      "PARTICIPANTS ERROR:",
      error.message
    );
  }
}


// ==========================================
// 🎮 CEK STATUS GAME
// ==========================================

function getActiveGame(chat) {

  return (
    gameSessions[chat] ||
    null
  );
}


// ==========================================
// 🧹 CLEAN EXPIRED AFK
// ==========================================

function cleanExpiredAfk() {

  const now =
    Date.now();

  for (
    const user
    of Object.values(db.users || {})
  ) {

    if (!user.afk) {
      continue;
    }

    const time =
      Number(
        user.afk.time || 0
      );

    // AFK otomatis hilang setelah 24 jam
    if (
      time &&
      now - time >
      24 * 60 * 60 * 1000
    ) {

      user.afk = null;
    }
  }
}


// Jalankan pembersihan AFK setiap 10 menit
setInterval(
  cleanExpiredAfk,
  10 * 60 * 1000
);


console.log(
  "✅ Part 7 loaded."
);
    // ==========================================
// PART 8 - MAIN MESSAGE HANDLER & START BOT
// ==========================================


// ==========================================
// 📨 MAIN MESSAGE HANDLER
// ==========================================

async function handleMessage(message) {

  try {

    if (!message) {
      return;
    }

    if (!message.message) {
      return;
    }

    // Jangan proses pesan yang dikirim bot sendiri
    if (message.key?.fromMe) {
      return;
    }

    const chat =
      getChat(message);

    const sender =
      getSender(message);

    const text =
      getMessageText(message).trim();

    if (!chat || !sender) {
      return;
    }

    // ======================================
    // UPDATE USER
    // ======================================

    const user =
      getUser(sender);

    user.id =
      sender;

    user.name =
      message.pushName ||
      user.name ||
      jidNumber(sender);

    db.stats.messages =
      Number(db.stats.messages || 0) + 1;

    // Simpan berkala, tidak setiap pesan
    if (
      db.stats.messages % 10 === 0
    ) {
      saveDB();
    }


    // ======================================
    // CEK BAN
    // ======================================

    if (
      isBanned(sender) &&
      !isOwner(sender)
    ) {

      return;
    }


    // ======================================
    // MODE PUBLIC / SELF
    // ======================================

    if (
      !publicMode &&
      !isOwner(sender)
    ) {

      return;
    }


    // ======================================
    // AFK
    // ======================================

    await handleAfk(
      message,
      text
    );


    // ======================================
    // SECURITY GROUP
    // ======================================

    if (isGroup(chat)) {

      const blocked =
        await handleGroupSecurity(
          message,
          text
        );

      if (blocked) {
        return;
      }
    }


    // ======================================
    // JAWAB GAME
    // ======================================

    if (text) {

      const gameAnswered =
        await handleGameAnswer(
          message,
          text
        );

      if (gameAnswered) {
        return;
      }
    }


    // ======================================
    // CEK PREFIX
    // ======================================

    if (
      !text.startsWith(PREFIX)
    ) {

      return;
    }


    // ======================================
    // PARSE COMMAND
    // ======================================

    const body =
      text.slice(
        PREFIX.length
      ).trim();

    if (!body) {
      return;
    }

    const parts =
      body.split(/\s+/);

    const command =
      String(
        parts.shift() || ""
      ).toLowerCase();

    const args =
      parts;

    if (!command) {
      return;
    }


    // ======================================
    // HITUNG COMMAND
    // ======================================

    db.stats.commands =
      Number(db.stats.commands || 0) + 1;


    // ======================================
    // MEDIA / SEARCH COMMAND
    // ======================================

    const mediaHandled =
      await handleMediaCommand(
        message,
        command,
        args,
        text
      );

    if (mediaHandled) {
      return;
    }


    // ======================================
    // GROUP COMMAND
    // ======================================

    const groupHandled =
      await handleGroupCommand(
        message,
        command,
        args,
        text
      );

    if (groupHandled) {
      return;
    }


    // ======================================
    // WARNING
    // ======================================

    const warningHandled =
      await handleWarningCommand(
        message,
        command,
        args
      );

    if (warningHandled) {
      return;
    }


    // ======================================
    // LIST
    // ======================================

    const listHandled =
      await handleListCommand(
        message,
        command,
        args,
        text
      );

    if (listHandled) {
      return;
    }


    // ======================================
    // POINT
    // ======================================

    const pointHandled =
      await handlePointCommand(
        message,
        command,
        args
      );

    if (pointHandled) {
      return;
    }


    // ======================================
    // REMINDER
    // ======================================

    const reminderHandled =
      await handleReminderCommand(
        message,
        command,
        args,
        text
      );

    if (reminderHandled) {
      return;
    }


    // ======================================
    // AFK COMMAND
    // ======================================

    const afkHandled =
      await handleAfkCommand(
        message,
        command,
        args,
        text
      );

    if (afkHandled) {
      return;
    }


    // ======================================
    // ABSEN
    // ======================================

    const absenHandled =
      await handleAbsenCommand(
        message,
        command
      );

    if (absenHandled) {
      return;
    }


    // ======================================
    // GAME
    // ======================================

    const gameHandled =
      await handleGameCommand(
        message,
        command,
        args
      );

    if (gameHandled) {
      return;
    }


    // ======================================
    // GROUP INFO
    // ======================================

    const groupInfoHandled =
      await handleGroupInfoCommand(
        message,
        command
      );

    if (groupInfoHandled) {
      return;
    }


    // ======================================
    // COMMAND UTAMA
    // ======================================

    const mainHandled =
      await handleCommand(
        message,
        command,
        args,
        text
      );

    if (mainHandled) {
      return;
    }


    // ======================================
    // COMMAND TIDAK DIKENAL
    // ======================================

    if (
      command &&
      ![
        "menu"
      ].includes(command)
    ) {

      // Jangan spam pesan untuk command
      // yang tidak dikenal.
      console.log(
        `[UNKNOWN COMMAND] ${PREFIX}${command}`
      );
    }

  } catch (error) {

    console.error(
      "MESSAGE HANDLER ERROR:",
      error
    );

    try {

      await sendText(
        getChat(message),
        "❌ Terjadi kesalahan saat memproses command."
      );

    } catch {}
  }
}


// ==========================================
// 🤖 START WHATSAPP BOT
// ==========================================

async function startBot() {

  try {

    // ======================================
    // SESSION DIRECTORY
    // ======================================

    if (
      !fs.existsSync(SESSION_DIR)
    ) {

      fs.mkdirSync(
        SESSION_DIR,
        {
          recursive: true
        }
      );
    }


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
            level: "silent"
          }),

        printQRInTerminal: false,

        markOnlineOnConnect: false,

        syncFullHistory: false
      });


    // ======================================
    // SAVE CREDENTIALS
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
      async (update) => {

        try {

          const {
            connection,
            lastDisconnect,
            qr
          } = update;


          // ================================
          // QR CODE
          // ================================

          if (qr) {

            qrCode = qr;

            connectionStatus =
              "qr";

            console.log(
              "\n================================"
            );

            console.log(
              "📱 QR WHATSAPP TERSEDIA"
            );

            console.log(
              "Buka halaman /qr untuk melihat QR."
            );

            console.log(
              "================================\n"
            );
          }


          // ================================
          // CONNECTING
          // ================================

          if (
            connection === "connecting"
          ) {

            connectionStatus =
              "connecting";

            console.log(
              "🔄 Menghubungkan ke WhatsApp..."
            );
          }


          // ================================
          // OPEN
          // ================================

          if (
            connection === "open"
          ) {

            connectionStatus =
              "open";

            qrCode = null;

            console.log(
              "\n================================"
            );

            console.log(
              "✅ ZAZABOT ONLINE"
            );

            console.log(
              `📱 Bot: ${BOT_NUMBER_DISPLAY()}`
            );

            console.log(
              `👑 Owner: ${OWNER_NUMBER}`
            );

            console.log(
              "================================\n"
            );
          }


          // ================================
          // CLOSE
          // ================================

          if (
            connection === "close"
          ) {

            connectionStatus =
              "closed";

            const statusCode =
              lastDisconnect
                ?.error
                ?.output
                ?.statusCode;

            console.log(
              `❌ Koneksi terputus. Code: ${statusCode || "unknown"}`
            );


            // ==============================
            // LOGGED OUT
            // ==============================

            if (
              statusCode ===
              DisconnectReason.loggedOut
            ) {

              console.log(
                "🚪 Session logout."
              );

              console.log(
                "Hapus folder session lalu scan QR lagi."
              );

              return;
            }


            // ==============================
            // RECONNECT
            // ==============================

            if (
              reconnectTimer
            ) {

              return;
            }

            reconnectTimer =
              setTimeout(
                async () => {

                  reconnectTimer =
                    null;

                  try {

                    await startBot();

                  } catch (error) {

                    console.error(
                      "RECONNECT ERROR:",
                      error.message
                    );
                  }

                },
                5000
              );
          }

        } catch (error) {

          console.error(
            "CONNECTION UPDATE ERROR:",
            error.message
          );
        }
      }
    );


    // ======================================
    // INCOMING MESSAGE
    // ======================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {

        if (
          !Array.isArray(messages)
        ) {
          return;
        }

        for (
          const message
          of messages
        ) {

          try {

            await handleMessage(
              message
            );

          } catch (error) {

            console.error(
              "MESSAGE ERROR:",
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
      async (update) => {

        try {

          await handleParticipants(
            update
          );

        } catch (error) {

          console.error(
            "GROUP UPDATE ERROR:",
            error.message
          );
        }
      }
    );


    return sock;

  } catch (error) {

    connectionStatus =
      "error";

    console.error(
      "START BOT ERROR:",
      error
    );

    throw error;
  }
}


// ==========================================
// 📱 BOT NUMBER DISPLAY
// ==========================================

function BOT_NUMBER_DISPLAY() {

  // Nomor akun bot yang digunakan
  // sesuai konfigurasi ZazaBot.
  return "6285866438941";
}


// ==========================================
// 🔄 SAFE RESTART
// ==========================================

async function restartBot() {

  try {

    if (sock) {

      try {
        sock.ws?.close();
      } catch {}

      sock = null;
    }

  } catch {}

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        2000
      )
  );

  return startBot();
}


console.log(
  "✅ Part 8 loaded."
);
    // ==========================================
// PART 9 - WEB SERVER, QR & STATUS
// ==========================================


// ==========================================
// 🌐 HTTP RESPONSE
// ==========================================

function sendHttp(
  res,
  statusCode,
  contentType,
  body
) {

  res.writeHead(
    statusCode,
    {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    }
  );

  res.end(body);
}


// ==========================================
// 🏠 HOME PAGE
// ==========================================

function homePage() {

  const status =
    connectionStatus === "open"
      ? "🟢 ONLINE"
      : connectionStatus === "qr"
        ? "🟡 MENUNGGU SCAN QR"
        : "🔴 OFFLINE";

  return `
<!DOCTYPE html>
<html lang="id">
<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>${BOT_NAME}</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #07152e;
  color: white;
}

.container {
  max-width: 700px;
  margin: auto;
  padding: 25px;
}

.card {
  background: #0d2347;
  border-radius: 20px;
  padding: 25px;
  margin-top: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,.25);
}

h1 {
  margin-bottom: 5px;
}

.status {
  font-size: 20px;
  font-weight: bold;
  margin: 20px 0;
}

.info {
  line-height: 1.8;
}

a {
  display: inline-block;
  margin-top: 15px;
  padding: 12px 18px;
  border-radius: 12px;
  background: #1683ff;
  color: white;
  text-decoration: none;
}

a:hover {
  opacity: .85;
}

.small {
  opacity: .7;
  font-size: 13px;
  margin-top: 20px;
}

</style>

</head>

<body>

<div class="container">

  <div class="card">

    <h1>🤖 ${BOT_NAME}</h1>

    <p>WhatsApp Bot Zaza Store</p>

    <div class="status">
      ${status}
    </div>

    <div class="info">

      📱 Bot:
      <b>6285866438941</b>
      <br>

      👑 Owner:
      <b>${OWNER_NUMBER}</b>
      <br>

      ⚙️ Mode:
      <b>${publicMode ? "PUBLIC" : "SELF"}</b>
      <br>

      💬 Messages:
      <b>${db.stats?.messages || 0}</b>
      <br>

      🛠️ Commands:
      <b>${db.stats?.commands || 0}</b>

    </div>

    <a href="/qr">
      📱 Buka QR WhatsApp
    </a>

    <a href="/status">
      📊 Status JSON
    </a>

  </div>

  <div class="card">

    <h2>📋 Fitur</h2>

    <p>
      Group Management, Anti Link,
      Anti Badword, Games, Store,
      Sticker, Search, AI dan berbagai
      fitur WhatsApp lainnya.
    </p>

  </div>

  <div class="small">
    ZazaBot • Zaza Store
  </div>

</div>

</body>
</html>
`;
}


// ==========================================
// 📱 QR PAGE
// ==========================================

async function qrPage() {

  if (!qrCode) {

    return `
<!DOCTYPE html>
<html lang="id">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>QR ${BOT_NAME}</title>

<style>

body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #07152e;
  color: white;
  font-family: Arial, sans-serif;
}

.box {
  width: 90%;
  max-width: 500px;
  padding: 30px;
  text-align: center;
  background: #0d2347;
  border-radius: 20px;
}

a {
  color: white;
  text-decoration: none;
}

</style>

</head>

<body>

<div class="box">

  <h1>📱 QR WhatsApp</h1>

  <p>
    ${
      connectionStatus === "open"
        ? "✅ Bot sudah terhubung ke WhatsApp."
        : "⏳ QR belum tersedia. Tunggu beberapa detik lalu refresh halaman."
    }
  </p>

  <p>
    <a href="/">⬅️ Kembali</a>
  </p>

</div>

</body>
</html>
`;
  }


  try {

    const qrBuffer =
      await QRCode.toBuffer(
        qrCode,
        {
          type: "png",
          width: 400,
          margin: 2
        }
      );

    const base64 =
      qrBuffer.toString("base64");

    return `
<!DOCTYPE html>
<html lang="id">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>Scan QR ${BOT_NAME}</title>

<style>

body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #07152e;
  color: white;
  font-family: Arial, sans-serif;
}

.box {
  width: 90%;
  max-width: 500px;
  padding: 25px;
  text-align: center;
  background: #0d2347;
  border-radius: 20px;
}

img {
  width: min(400px, 90%);
  background: white;
  padding: 10px;
  border-radius: 15px;
}

button,
a {
  margin-top: 20px;
  display: inline-block;
  padding: 12px 18px;
  border: 0;
  border-radius: 10px;
  background: #1683ff;
  color: white;
  text-decoration: none;
}

</style>

</head>

<body>

<div class="box">

  <h1>📱 Scan QR</h1>

  <p>
    Scan QR ini menggunakan WhatsApp
    di HP yang ingin dijadikan akun bot.
  </p>

  <img
    src="data:image/png;base64,${base64}"
    alt="WhatsApp QR"
  >

  <br>

  <a href="/qr">
    🔄 Refresh QR
  </a>

  <br>

  <a href="/">
    ⬅️ Kembali
  </a>

</div>

</body>

</html>
`;

  } catch (error) {

    console.error(
      "QR PAGE ERROR:",
      error.message
    );

    return `
<!DOCTYPE html>
<html lang="id">

<body>

<h2>❌ Gagal membuat QR</h2>

<p>
${String(error.message)}
</p>

</body>

</html>
`;
  }
}


// ==========================================
// 📊 STATUS DATA
// ==========================================

function statusData() {

  return {

    bot: BOT_NAME,

    botNumber:
      BOT_NUMBER_DISPLAY(),

    owner:
      OWNER_NUMBER,

    status:
      connectionStatus,

    mode:
      publicMode
        ? "public"
        : "self",

    uptime:
      formatRuntime(
        Date.now() -
        startedAt
      ),

    messages:
      Number(
        db.stats?.messages || 0
      ),

    commands:
      Number(
        db.stats?.commands || 0
      ),

    users:
      Object.keys(
        db.users || {}
      ).length,

    groups:
      Object.keys(
        db.groups || {}
      ).length,

    time:
      new Date().toISOString()

  };
}


// ==========================================
// 🌐 START HTTP SERVER
// ==========================================

function startHttpServer() {

  const server =
    http.createServer(
      async (req, res) => {

        try {

          const url =
            new URL(
              req.url,
              `http://${req.headers.host || "localhost"}`
            );


          // ================================
          // HOME
          // ================================

          if (
            url.pathname === "/"
          ) {

            return sendHttp(
              res,
              200,
              "text/html; charset=utf-8",
              homePage()
            );
          }


          // ================================
          // QR
          // ================================

          if (
            url.pathname === "/qr"
          ) {

            const page =
              await qrPage();

            return sendHttp(
              res,
              200,
              "text/html; charset=utf-8",
              page
            );
          }


          // ================================
          // STATUS
          // ================================

          if (
            url.pathname === "/status"
          ) {

            return sendHttp(
              res,
              200,
              "application/json; charset=utf-8",
              JSON.stringify(
                statusData(),
                null,
                2
              )
            );
          }


          // ================================
          // HEALTH CHECK
          // ================================

          if (
            url.pathname === "/health"
          ) {

            return sendHttp(
              res,
              connectionStatus === "open"
                ? 200
                : 503,
              "application/json; charset=utf-8",
              JSON.stringify(
                {
                  ok:
                    connectionStatus === "open",

                  status:
                    connectionStatus,

                  bot:
                    BOT_NAME
                },
                null,
                2
              )
            );
          }


          // ================================
          // PING
          // ================================

          if (
            url.pathname === "/ping"
          ) {

            return sendHttp(
              res,
              200,
              "text/plain; charset=utf-8",
              "pong"
            );
          }


          // ================================
          // 404
          // ================================

          return sendHttp(
            res,
            404,
            "text/html; charset=utf-8",
            `
              <h1>404</h1>
              <p>Halaman tidak ditemukan.</p>
              <a href="/">Kembali</a>
            `
          );

        } catch (error) {

          console.error(
            "HTTP ERROR:",
            error.message
          );

          return sendHttp(
            res,
            500,
            "text/plain; charset=utf-8",
            "Internal Server Error"
          );
        }
      }
    );


  server.listen(
    PORT,
    "0.0.0.0",
    () => {

      console.log(
        "================================"
      );

      console.log(
        "🌐 WEB SERVER ZAZABOT AKTIF"
      );

      console.log(
        `📡 PORT: ${PORT}`
      );

      console.log(
        `📱 QR: /qr`
      );

      console.log(
        `📊 STATUS: /status`
      );

      console.log(
        "================================"
      );
    }
  );


  server.on(
    "error",
    (error) => {

      console.error(
        "HTTP SERVER ERROR:",
        error.message
      );
    }
  );


  return server;
}


console.log(
  "✅ Part 9 loaded."
);
    // ==========================================
// PART 10 - AUTOSAVE & STARTUP
// ==========================================


// ==========================================
// 💾 AUTOSAVE DATABASE
// ==========================================

const autosaveTimer =
  setInterval(
    () => {

      try {

        saveDB();

        console.log(
          "💾 Database tersimpan."
        );

      } catch (error) {

        console.error(
          "AUTOSAVE ERROR:",
          error.message
        );
      }

    },
    30 * 1000
  );


// ==========================================
// 🌐 START WEB SERVER
// ==========================================

let httpServer = null;

try {

  httpServer =
    startHttpServer();

} catch (error) {

  console.error(
    "❌ Gagal menjalankan web server:",
    error.message
  );
}


// ==========================================
// 🤖 START ZAZABOT
// ==========================================

console.log(
  "================================"
);

console.log(
  "🚀 MEMULAI ZAZABOT..."
);

console.log(
  `📱 Nomor Bot: ${BOT_NUMBER_DISPLAY()}`
);

console.log(
  `👑 Owner: ${OWNER_NUMBER}`
);

console.log(
  "================================"
);


startBot()
  .then(() => {

    console.log(
      "✅ ZazaBot berhasil dijalankan."
    );

  })
  .catch((error) => {

    console.error(
      "❌ ZazaBot gagal dimulai:",
      error
    );

  });


// ==========================================
// 🛑 SHUTDOWN
// ==========================================

async function shutdownZazaBot(
  signal
) {

  console.log(
    `\n🛑 Menerima ${signal}.`
  );

  console.log(
    "🔄 Menutup ZazaBot..."
  );


  // ========================================
  // STOP AUTOSAVE
  // ========================================

  try {

    clearInterval(
      autosaveTimer
    );

  } catch {}


  // ========================================
  // SAVE DATABASE TERAKHIR
  // ========================================

  try {

    saveDB();

    console.log(
      "💾 Database terakhir berhasil disimpan."
    );

  } catch (error) {

    console.error(
      "SAVE ERROR:",
      error.message
    );
  }


  // ========================================
  // CLOSE HTTP SERVER
  // ========================================

  try {

    if (httpServer) {

      await new Promise(
        resolve => {

          httpServer.close(
            () => resolve()
          );

        }
      );

      console.log(
        "🌐 Web server ditutup."
      );
    }

  } catch (error) {

    console.error(
      "HTTP CLOSE ERROR:",
      error.message
    );
  }


  // ========================================
  // CLOSE WHATSAPP
  // ========================================

  try {

    if (sock) {

      try {

        sock.ws?.close();

      } catch {}

      sock = null;

      console.log(
        "📱 Koneksi WhatsApp ditutup."
      );
    }

  } catch (error) {

    console.error(
      "WHATSAPP CLOSE ERROR:",
      error.message
    );
  }


  console.log(
    "✅ ZazaBot berhenti dengan aman."
  );

  process.exit(0);
}


// ==========================================
// SIGNAL HANDLER
// ==========================================

process.once(
  "SIGINT",
  () =>
    shutdownZazaBot("SIGINT")
);

process.once(
  "SIGTERM",
  () =>
    shutdownZazaBot("SIGTERM")
);


// ==========================================
// ❌ UNCAUGHT EXCEPTION
// ==========================================

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "❌ UNCAUGHT EXCEPTION:",
      error
    );

  }
);


// ==========================================
// ❌ UNHANDLED REJECTION
// ==========================================

process.on(
  "unhandledRejection",
  (reason) => {

    console.error(
      "❌ UNHANDLED REJECTION:",
      reason
    );

  }
);


// ==========================================
// 🟢 FINAL INFO
// ==========================================

console.log(
  "================================"
);

console.log(
  "🟢 ZAZABOT STARTUP SELESAI"
);

console.log(
  `🤖 ${BOT_NAME}`
);

console.log(
  `📱 Bot: ${BOT_NUMBER_DISPLAY()}`
);

console.log(
  `👑 Owner: ${OWNER_NUMBER}`
);

console.log(
  `🌐 Port: ${PORT}`
);

console.log(
  "================================"
);
