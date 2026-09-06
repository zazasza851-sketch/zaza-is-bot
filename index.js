// =====================================================
// ZAZABOT - WHATSAPP BOT
// PART 1 - BASIC / CONFIG / DATABASE / HELPERS
// =====================================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} from "@whiskeysockets/baileys";

import pino from "pino";
import fs from "fs";
import path from "path";
import http from "http";
import QRCode from "qrcode";

// =====================================================
// CONFIG
// =====================================================

const BOT_NAME = "ZazaBot";
const PREFIX = ".";
const OWNER_NUMBER = "6289630747010";

const PORT = process.env.PORT || 8080;

const SESSION_DIR = "./session";
const DATABASE_FILE = "./database.json";

// =====================================================
// GLOBAL
// =====================================================

let sock = null;
let qrCode = null;
let publicMode = true;
let startedAt = Date.now();
let connectionStatus = "starting";

let reconnectTimer = null;

// =====================================================
// DATABASE DEFAULT
// =====================================================

const defaultDB = {
  settings: {
    owner: OWNER_NUMBER,
    botName: BOT_NAME
  },

  users: {},

  groups: {},

  banned: [],

  premium: {},

  stats: {
    messages: 0,
    commands: 0
  }
};

let db = defaultDB;

// =====================================================
// DATABASE LOAD
// =====================================================

function loadDB() {
  try {
    if (!fs.existsSync(DATABASE_FILE)) {
      db = structuredClone(defaultDB);
      saveDB();
      return;
    }

    const raw = fs.readFileSync(DATABASE_FILE, "utf8");

    if (!raw.trim()) {
      db = structuredClone(defaultDB);
      saveDB();
      return;
    }

    const parsed = JSON.parse(raw);

    db = {
      ...structuredClone(defaultDB),
      ...parsed,

      settings: {
        ...defaultDB.settings,
        ...(parsed.settings || {})
      },

      users: parsed.users || {},
      groups: parsed.groups || {},
      banned: parsed.banned || [],
      premium: parsed.premium || {},

      stats: {
        ...defaultDB.stats,
        ...(parsed.stats || {})
      }
    };

  } catch (error) {
    console.error("DATABASE LOAD ERROR:", error.message);

    db = structuredClone(defaultDB);
  }
}

// =====================================================
// DATABASE SAVE
// =====================================================

function saveDB() {
  try {
    fs.writeFileSync(
      DATABASE_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.error("DATABASE SAVE ERROR:", error.message);
  }
}

// =====================================================
// INITIALIZE
// =====================================================

loadDB();

// =====================================================
// BASIC HELPERS
// =====================================================

function jidNumber(jid = "") {
  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

// =====================================================

function userJid(number = "") {
  const clean = String(number).replace(/\D/g, "");

  if (!clean) {
    return "";
  }

  return `${clean}@s.whatsapp.net`;
}

// =====================================================

function isGroup(jid = "") {
  return String(jid).endsWith("@g.us");
}

// =====================================================

function getSender(message) {
  return (
    message?.key?.participant ||
    message?.key?.remoteJid ||
    ""
  );
}

// =====================================================

function getChat(message) {
  return (
    message?.key?.remoteJid ||
    ""
  );
}

// =====================================================

function isOwner(jid = "") {
  const number = jidNumber(jid);

  const owners = [
    OWNER_NUMBER,
    db.settings?.owner || ""
  ]
    .map(jidNumber)
    .filter(Boolean);

  return owners.includes(number);
}

// =====================================================

function isBanned(jid = "") {
  const number = jidNumber(jid);

  return db.banned.includes(number);
}

// =====================================================

function getUser(jid = "") {
  const number = jidNumber(jid);

  if (!number) {
    return null;
  }

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

    saveDB();
  }

  return db.users[number];
}

// =====================================================

function getGroup(jid = "") {
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

    saveDB();
  }

  return db.groups[jid];
}

// =====================================================

function isPremium(jid = "") {
  const user = getUser(jid);

  if (!user) {
    return false;
  }

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

// =====================================================

function formatRupiah(amount = 0) {
  return "Rp" +
    Number(amount || 0)
      .toLocaleString("id-ID");
}

// =====================================================

function formatRuntime(ms = 0) {
  let seconds = Math.floor(ms / 1000);

  const days = Math.floor(seconds / 86400);
  seconds %= 86400;

  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;

  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// =====================================================
// GET MESSAGE TEXT
// =====================================================

function getMessageText(message) {
  const msg = message?.message;

  if (!msg) {
    return "";
  }

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  );
}

// =====================================================
// SEND TEXT
// =====================================================

async function sendText(
  chat,
  text,
  options = {}
) {
  if (!sock || !chat) {
    return;
  }

  try {
    return await sock.sendMessage(
      chat,
      {
        text: String(text),
        ...options
      }
    );
  } catch (error) {
    console.error(
      "SEND TEXT ERROR:",
      error.message
    );
  }
}

// =====================================================
// REACT
// =====================================================

async function react(
  message,
  emoji = "✅"
) {
  if (!sock) {
    return;
  }

  try {
    await sock.sendMessage(
      getChat(message),
      {
        react: {
          text: emoji,
          key: message.key
        }
      }
    );
  } catch {
    // ignore reaction errors
  }
}

// =====================================================
// RANDOM ID
// =====================================================

function randomId(length = 8) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[
      Math.floor(Math.random() * chars.length)
    ];
  }

  return result;
}

// =====================================================
// URL EXTRACTOR
// =====================================================

function extractUrl(text = "") {
  const match = String(text).match(
    /https?:\/\/[^\s]+/i
  );

  return match ? match[0] : null;
}

// =====================================================
// DURATION
// =====================================================

function parseDuration(input = "") {
  const value = String(input)
    .trim()
    .toLowerCase();

  const match = value.match(
    /^(\d+)\s*(s|m|h|d|w)$/
  );

  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };

  return number * multipliers[unit];
}

// =====================================================
// TARGET USER
// =====================================================

function targetFromMessage(message, args = []) {
  const mentioned =
    message?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid;

  if (mentioned?.length) {
    return mentioned[0];
  }

  const number = String(args[0] || "")
    .replace(/\D/g, "");

  if (number) {
    return userJid(number);
  }

  return getSender(message);
}

// =====================================================
// BASIC PERMISSION
// =====================================================

async function needOwner(
  message
) {
  const sender = getSender(message);

  if (!isOwner(sender)) {
    await sendText(
      getChat(message),
      "❌ Perintah ini khusus owner."
    );

    return false;
  }

  return true;
}

// =====================================================

async function needGroup(
  message
) {
  const chat = getChat(message);

  if (!isGroup(chat)) {
    await sendText(
      chat,
      "❌ Perintah ini hanya dapat digunakan di grup."
    );

    return false;
  }

  return true;
}

// =====================================================
// GROUP ADMIN
// =====================================================

async function getGroupMetadata(jid) {
  if (!sock) {
    return null;
  }

  try {
    return await sock.groupMetadata(jid);
  } catch (error) {
    console.error(
      "GROUP METADATA ERROR:",
      error.message
    );

    return null;
  }
}

// =====================================================

async function isGroupAdmin(
  jid,
  userJidValue
) {
  const metadata =
    await getGroupMetadata(jid);

  if (!metadata) {
    return false;
  }

  const participant =
    metadata.participants?.find(
      p => p.id === userJidValue
    );

  return Boolean(
    participant &&
    (
      participant.admin === "admin" ||
      participant.admin === "superadmin"
    )
  );
}

// =====================================================

async function needAdmin(message) {
  if (!(await needGroup(message))) {
    return false;
  }

  const chat = getChat(message);
  const sender = getSender(message);

  if (isOwner(sender)) {
    return true;
  }

  const admin =
    await isGroupAdmin(
      chat,
      sender
    );

  if (!admin) {
    await sendText(
      chat,
      "❌ Perintah ini hanya untuk admin grup."
    );

    return false;
  }

  return true;
}

// =====================================================
// BOT ADMIN
// =====================================================

async function isBotAdmin(jid) {
  if (!sock) {
    return false;
  }

  try {
    const botJid =
      sock.user?.id;

    return await isGroupAdmin(
      jid,
      botJid
    );
  } catch {
    return false;
  }
}

// =====================================================

async function needBotAdmin(message) {
  const chat = getChat(message);

  if (!(await needGroup(message))) {
    return false;
  }

  if (!(await isBotAdmin(chat))) {
    await sendText(
      chat,
      "❌ Bot harus menjadi admin grup terlebih dahulu."
    );

    return false;
  }

  return true;
}

// =====================================================
// MENU
// =====================================================

const menuText = `
╭━━━〔 ${BOT_NAME} 〕━━━╮
┃
┃ 👋 Halo!
┃
┃ Prefix : ${PREFIX}
┃
┣━━〔 GENERAL 〕
┃ ${PREFIX}menu
┃ ${PREFIX}ping
┃ ${PREFIX}runtime
┃ ${PREFIX}botinfo
┃ ${PREFIX}profile
┃ ${PREFIX}rules
┃
┣━━〔 OWNER 〕
┃ ${PREFIX}owner
┃ ${PREFIX}setowner
┃ ${PREFIX}public
┃ ${PREFIX}self
┃ ${PREFIX}ban
┃ ${PREFIX}unban
┃ ${PREFIX}listban
┃ ${PREFIX}bc
┃
┣━━〔 STORE 〕
┃ ${PREFIX}produk
┃ ${PREFIX}saldo
┃ ${PREFIX}topup
┃ ${PREFIX}order
┃ ${PREFIX}cekorder
┃ ${PREFIX}premium
┃ ${PREFIX}cekpremium
┃
┣━━〔 AI 〕
┃ ${PREFIX}ai
┃ ${PREFIX}translate
┃ ${PREFIX}aiimage
┃
┣━━〔 SEARCH 〕
┃ ${PREFIX}google
┃ ${PREFIX}googleimage
┃ ${PREFIX}wikipedia
┃ ${PREFIX}ytsearch
┃ ${PREFIX}lirik
┃
┣━━〔 DOWNLOAD 〕
┃ ${PREFIX}tiktok
┃ ${PREFIX}tiktoknowm
┃ ${PREFIX}tiktokwm
┃ ${PREFIX}igdl
┃ ${PREFIX}igreel
┃ ${PREFIX}facebook
┃ ${PREFIX}ytmp3
┃ ${PREFIX}ytmp4
┃
┣━━〔 STICKER 〕
┃ ${PREFIX}sticker
┃ ${PREFIX}s
┃ ${PREFIX}brat
┃ ${PREFIX}ttp
┃ ${PREFIX}attp
┃ ${PREFIX}toimg
┃
┣━━〔 TOOLS 〕
┃ ${PREFIX}qr
┃ ${PREFIX}shortlink
┃ ${PREFIX}tourl
┃ ${PREFIX}ocr
┃
┣━━〔 GROUP 〕
┃ ${PREFIX}groupinfo
┃ ${PREFIX}cekidgroup
┃ ${PREFIX}linkgroup
┃ ${PREFIX}listadmin
┃ ${PREFIX}tagadmin
┃ ${PREFIX}tagall
┃ ${PREFIX}hidetag
┃ ${PREFIX}add
┃ ${PREFIX}kick
┃ ${PREFIX}promote
┃ ${PREFIX}demote
┃ ${PREFIX}setname
┃ ${PREFIX}setdesc
┃
┣━━〔 SECURITY 〕
┃ ${PREFIX}antilink
┃ ${PREFIX}antilinkoff
┃ ${PREFIX}antilinknokick
┃ ${PREFIX}antibadword
┃ ${PREFIX}antibot
┃ ${PREFIX}antidelete
┃ ${PREFIX}antimentionsw
┃ ${PREFIX}antiviewonce
┃ ${PREFIX}antiwame
┃ ${PREFIX}antiwamenokick
┃ ${PREFIX}antiluar
┃
┣━━〔 GAME 〕
┃ ${PREFIX}asahotak
┃ ${PREFIX}tebakkata
┃ ${PREFIX}math
┃ ${PREFIX}truth
┃ ${PREFIX}dare
┃ ${PREFIX}caklontong
┃ ${PREFIX}family100
┃ ${PREFIX}akinator
┃ ${PREFIX}stopgame
┃
╰━━━━━━━━━━━━━━━━━━╯
`;

console.log(
  `${BOT_NAME} basic module loaded.`
);
// =====================================================
// ZAZABOT - PART 2
// PRODUCTS / GAMES / UTILITY HELPERS
// =====================================================

// =====================================================
// PRODUCT DATABASE
// =====================================================

const products = [
  {
    id: "spotify1",
    name: "Spotify Premium 1 Bulan",
    price: 8000
  },
  {
    id: "spotify2",
    name: "Spotify Premium 2 Bulan",
    price: 10000
  },
  {
    id: "hokian",
    name: "Waktu Hoki Hokian",
    price: 15000
  },
  {
    id: "premium7",
    name: "Premium Bot 7 Hari",
    price: 5000
  },
  {
    id: "premium30",
    name: "Premium Bot 30 Hari",
    price: 15000
  }
];

// =====================================================
// FIND PRODUCT
// =====================================================

function findProduct(id = "") {
  const value = String(id)
    .trim()
    .toLowerCase();

  return products.find(
    product =>
      product.id.toLowerCase() === value ||
      product.name.toLowerCase().includes(value)
  );
}

// =====================================================
// PRODUCT LIST
// =====================================================

function productListText() {
  let text = `
╭━━━〔 🛒 PRODUK ZAZA STORE 〕━━━╮
┃
`;

  for (const product of products) {
    text +=
      `┃ 🛍️ ${product.name}\n` +
      `┃ ID     : ${product.id}\n` +
      `┃ Harga  : ${formatRupiah(product.price)}\n` +
      `┃\n`;
  }

  text += `
┣━━━━━━━━━━━━━━━━━━
┃ Cara order:
┃ ${PREFIX}order <id>
┃
┃ Contoh:
┃ ${PREFIX}order spotify1
╰━━━━━━━━━━━━━━━━━━╯
`;

  return text;
}

// =====================================================
// GAME DATABASE
// =====================================================

const riddles = [
  {
    question: "Apa yang mempunyai kaki tetapi tidak bisa berjalan?",
    answer: "meja"
  },
  {
    question: "Apa yang semakin diisi semakin ringan?",
    answer: "balon"
  },
  {
    question: "Aku punya banyak gigi tetapi tidak bisa menggigit. Apa aku?",
    answer: "sisir"
  },
  {
    question: "Apa yang punya leher tetapi tidak punya kepala?",
    answer: "botol"
  },
  {
    question: "Apa yang selalu naik tetapi tidak pernah turun?",
    answer: "umur"
  }
];

// =====================================================
// WORD GAMES
// =====================================================

const wordGames = [
  {
    question: "Susun kata: T-A-M-E",
    answer: "meat"
  },
  {
    question: "Susun kata: K-A-M-E-R",
    answer: "kram"
  },
  {
    question: "Susun kata: A-K-A-Y",
    answer: "kaya"
  },
  {
    question: "Susun kata: B-A-T-U",
    answer: "batu"
  }
];

// =====================================================
// GAME SESSIONS
// =====================================================

const gameSessions = new Map();

// =====================================================
// CLEAN TEXT
// =====================================================

function cleanText(text = "") {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

// =====================================================
// START GAME
// =====================================================

function startGame(
  chat,
  player,
  type,
  data
) {
  gameSessions.set(chat, {
    player,
    type,
    data,
    startedAt: Date.now()
  });
}

// =====================================================
// STOP GAME
// =====================================================

function stopGame(chat) {
  const exists =
    gameSessions.has(chat);

  gameSessions.delete(chat);

  return exists;
}

// =====================================================
// SIMPLE GAME QUESTION
// =====================================================

function randomRiddle() {
  return riddles[
    Math.floor(
      Math.random() * riddles.length
    )
  ];
}

// =====================================================

function randomWordGame() {
  return wordGames[
    Math.floor(
      Math.random() * wordGames.length
    )
  ];
}

// =====================================================
// MATH GAME
// =====================================================

function createMathQuestion() {
  const a =
    Math.floor(Math.random() * 20) + 1;

  const b =
    Math.floor(Math.random() * 20) + 1;

  const operators = ["+", "-", "*"];

  const operator =
    operators[
      Math.floor(
        Math.random() * operators.length
      )
    ];

  let answer;

  if (operator === "+") {
    answer = a + b;
  }

  if (operator === "-") {
    answer = a - b;
  }

  if (operator === "*") {
    answer = a * b;
  }

  return {
    question: `${a} ${operator} ${b} = ?`,
    answer: String(answer)
  };
}

// =====================================================
// ORDER ID
// =====================================================

function createOrder(
  userNumber,
  product
) {
  const id =
    "ZS" +
    Date.now().toString(36).toUpperCase() +
    randomId(4).toUpperCase();

  if (!db.orders) {
    db.orders = {};
  }

  db.orders[id] = {
    id,
    user: userNumber,
    productId: product.id,
    productName: product.name,
    price: product.price,
    status: "pending",
    createdAt: Date.now()
  };

  saveDB();

  return db.orders[id];
}

// =====================================================
// GET ORDER
// =====================================================

function getOrder(orderId = "") {
  if (!db.orders) {
    db.orders = {};
  }

  return db.orders[
    String(orderId).trim().toUpperCase()
  ] || null;
}

// =====================================================
// BALANCE
// =====================================================

function getBalance(jid) {
  const user = getUser(jid);

  return user
    ? Number(user.balance || 0)
    : 0;
}

// =====================================================

function addBalance(
  jid,
  amount
) {
  const user = getUser(jid);

  if (!user) {
    return false;
  }

  user.balance =
    Number(user.balance || 0) +
    Number(amount || 0);

  saveDB();

  return true;
}

// =====================================================
// LIMIT
// =====================================================

function addLimit(
  jid,
  amount = 1
) {
  const user = getUser(jid);

  if (!user) {
    return false;
  }

  user.limit =
    Number(user.limit || 0) +
    Number(amount || 0);

  saveDB();

  return true;
}

// =====================================================
// POINT
// =====================================================

function addPoint(
  jid,
  amount = 1
) {
  const user = getUser(jid);

  if (!user) {
    return false;
  }

  user.points =
    Number(user.points || 0) +
    Number(amount || 0);

  saveDB();

  return true;
}

// =====================================================
// WARNING
// =====================================================

function addWarning(
  chat,
  jid
) {
  const group = getGroup(chat);

  const number =
    jidNumber(jid);

  group.warnings[number] =
    Number(group.warnings[number] || 0) + 1;

  saveDB();

  return group.warnings[number];
}

// =====================================================

function removeWarning(
  chat,
  jid
) {
  const group = getGroup(chat);

  const number =
    jidNumber(jid);

  group.warnings[number] =
    Math.max(
      0,
      Number(group.warnings[number] || 0) - 1
    );

  saveDB();

  return group.warnings[number];
}

// =====================================================
// MENTION HELPER
// =====================================================

function mentionUser(jid) {
  return `@${jidNumber(jid)}`;
}

// =====================================================
// TIME
// =====================================================

function formatDate(timestamp) {
  return new Date(
    timestamp
  ).toLocaleString(
    "id-ID",
    {
      timeZone: "Asia/Jakarta"
    }
  );
}

// =====================================================
// PREMIUM DURATION
// =====================================================

function activatePremium(
  jid,
  duration
) {
  const user = getUser(jid);

  if (!user) {
    return false;
  }

  user.premium = true;

  user.premiumUntil =
    Date.now() + duration;

  db.premium[jidNumber(jid)] = {
    until: user.premiumUntil
  };

  saveDB();

  return true;
}

// =====================================================
// DATABASE INITIALIZATION
// =====================================================

if (!db.orders) {
  db.orders = {};
}

if (!db.premium) {
  db.premium = {};
}

saveDB();

console.log(
  `${BOT_NAME} PART 2 loaded successfully.`
);
// =====================================================
// ZAZABOT - PART 3
// COMMAND HANDLER
// =====================================================

async function handleCommand(
  message,
  command,
  args,
  text
) {
  const chat = getChat(message);
  const sender = getSender(message);
  const user = getUser(sender);

  if (!user) {
    return;
  }

  db.stats.commands++;
  saveDB();

  // ===================================================
  // GENERAL
  // ===================================================

  if (
    command === "menu" ||
    command === "help"
  ) {
    await sendText(
      chat,
      menuText
    );
    return;
  }

  if (command === "ping") {
    const start = Date.now();

    await sendText(
      chat,
      "🏓 Menghitung ping..."
    );

    const ping =
      Date.now() - start;

    await sendText(
      chat,
      `🏓 Pong!\n\n⚡ Speed: ${ping} ms`
    );

    return;
  }

  if (command === "speed") {
    const speed =
      Date.now() - startedAt;

    await sendText(
      chat,
      `⚡ ZazaBot aktif!\n\nRuntime: ${formatRuntime(speed)}`
    );

    return;
  }

  if (command === "runtime") {
    await sendText(
      chat,
      `⏱️ Runtime ZazaBot\n\n${formatRuntime(
        Date.now() - startedAt
      )}`
    );

    return;
  }

  if (command === "botinfo") {
    const mode =
      publicMode
        ? "PUBLIC"
        : "SELF";

    await sendText(
      chat,
      `╭━━━〔 🤖 BOT INFO 〕━━━╮
┃
┃ Nama    : ${BOT_NAME}
┃ Prefix  : ${PREFIX}
┃ Mode    : ${mode}
┃ Owner   : ${OWNER_NUMBER}
┃ Status  : ${connectionStatus}
┃
╰━━━━━━━━━━━━━━━━━━╯`
    );

    return;
  }

  if (command === "profile") {
    await sendText(
      chat,
      `╭━━━〔 👤 PROFILE 〕━━━╮
┃
┃ Nomor   : ${jidNumber(sender)}
┃ Saldo   : ${formatRupiah(user.balance)}
┃ Limit   : ${user.limit}
┃ Poin    : ${user.points}
┃ Premium : ${isPremium(sender) ? "YES" : "NO"}
┃ Warn    : ${user.warn}
┃
╰━━━━━━━━━━━━━━━━━━╯`
    );

    return;
  }

  if (command === "rules") {
    await sendText(
      chat,
      `╭━━━〔 📜 RULES ZAZABOT 〕━━━╮
┃
┃ 1. Jangan spam bot.
┃ 2. Jangan kirim konten ilegal.
┃ 3. Jangan menyalahgunakan bot.
┃ 4. Gunakan perintah sesuai fungsinya.
┃ 5. Hormati admin grup.
┃
╰━━━━━━━━━━━━━━━━━━╯`
    );

    return;
  }

  // ===================================================
  // OWNER
  // ===================================================

  if (command === "owner") {
    await sendText(
      chat,
      `👑 Owner ${BOT_NAME}\n\n@${OWNER_NUMBER}`,
      {
        mentions: [
          userJid(OWNER_NUMBER)
        ]
      }
    );

    return;
  }

  if (command === "cekowner") {
    await sendText(
      chat,
      isOwner(sender)
        ? "✅ Kamu adalah owner."
        : "❌ Kamu bukan owner."
    );

    return;
  }

  if (command === "setowner") {
    if (!(await needOwner(message))) {
      return;
    }

    const number =
      String(args[0] || "")
        .replace(/\D/g, "");

    if (!number) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}setowner 628xxxxxxxxxx`
      );
      return;
    }

    db.settings.owner = number;

    saveDB();

    await sendText(
      chat,
      `✅ Owner berhasil diubah menjadi ${number}`
    );

    return;
  }

  if (command === "public") {
    if (!(await needOwner(message))) {
      return;
    }

    publicMode = true;

    await sendText(
      chat,
      "✅ Mode PUBLIC aktif."
    );

    return;
  }

  if (command === "self") {
    if (!(await needOwner(message))) {
      return;
    }

    publicMode = false;

    await sendText(
      chat,
      "✅ Mode SELF aktif."
    );

    return;
  }

  if (command === "ban") {
    if (!(await needOwner(message))) {
      return;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    const number =
      jidNumber(target);

    if (!number) {
      await sendText(
        chat,
        "❌ Nomor tidak ditemukan."
      );
      return;
    }

    if (!db.banned.includes(number)) {
      db.banned.push(number);
    }

    saveDB();

    await sendText(
      chat,
      `🚫 Nomor ${number} berhasil diban.`
    );

    return;
  }

  if (command === "unban") {
    if (!(await needOwner(message))) {
      return;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    const number =
      jidNumber(target);

    db.banned =
      db.banned.filter(
        x => x !== number
      );

    saveDB();

    await sendText(
      chat,
      `✅ Nomor ${number} berhasil di-unban.`
    );

    return;
  }

  if (command === "listban") {
    if (!(await needOwner(message))) {
      return;
    }

    if (!db.banned.length) {
      await sendText(
        chat,
        "✅ Tidak ada user yang diban."
      );
      return;
    }

    const list =
      db.banned
        .map(
          (number, index) =>
            `${index + 1}. ${number}`
        )
        .join("\n");

    await sendText(
      chat,
      `🚫 LIST BAN\n\n${list}`
    );

    return;
  }

  if (command === "addbalance") {
    if (!(await needOwner(message))) {
      return;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    const amount =
      Number(
        args.find(
          x => /^\d+$/.test(x)
        ) || 0
      );

    if (!amount) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addbalance 628xxxxxxxxxx 10000`
      );
      return;
    }

    addBalance(
      target,
      amount
    );

    await sendText(
      chat,
      `✅ Saldo berhasil ditambahkan.\n\n👤 ${jidNumber(target)}\n💰 ${formatRupiah(amount)}`
    );

    return;
  }

  if (command === "addlimit") {
    if (!(await needOwner(message))) {
      return;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    const amount =
      Number(
        args.find(
          x => /^\d+$/.test(x)
        ) || 0
      );

    if (!amount) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addlimit 628xxxxxxxxxx 10`
      );
      return;
    }

    addLimit(
      target,
      amount
    );

    await sendText(
      chat,
      `✅ Limit berhasil ditambahkan.\n\n👤 ${jidNumber(target)}\n📦 +${amount} limit`
    );

    return;
  }

  if (command === "bc") {
    if (!(await needOwner(message))) {
      return;
    }

    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}bc Halo semua`
      );
      return;
    }

    const users =
      Object.keys(db.users);

    let success = 0;

    for (const number of users) {
      try {
        await sendText(
          userJid(number),
          `📢 *BROADCAST ${BOT_NAME}*\n\n${text}`
        );

        success++;
      } catch {
        // lanjut ke user berikutnya
      }
    }

    await sendText(
      chat,
      `✅ Broadcast selesai.\n\nTerkirim: ${success}`
    );

    return;
  }

  // ===================================================
  // STORE
  // ===================================================

  if (
    command === "produk" ||
    command === "pricelist"
  ) {
    await sendText(
      chat,
      productListText()
    );

    return;
  }

  if (
    command === "saldo" ||
    command === "balance"
  ) {
    await sendText(
      chat,
      `💰 Saldo kamu: ${formatRupiah(
        getBalance(sender)
      )}`
    );

    return;
  }

  if (command === "topup") {
    await sendText(
      chat,
      `💳 *TOP UP SALDO*\n\nSilakan hubungi owner untuk melakukan top up.\n\n👑 Owner: ${OWNER_NUMBER}`
    );

    return;
  }

  if (
    command === "order" ||
    command === "buy" ||
    command === "beli"
  ) {
    const productId =
      args[0];

    if (!productId) {
      await sendText(
        chat,
        `❌ Masukkan ID produk.\n\nContoh:\n${PREFIX}order spotify1\n\nKetik ${PREFIX}produk untuk melihat produk.`
      );
      return;
    }

    const product =
      findProduct(productId);

    if (!product) {
      await sendText(
        chat,
        "❌ Produk tidak ditemukan."
      );
      return;
    }

    const order =
      createOrder(
        jidNumber(sender),
        product
      );

    await sendText(
      chat,
      `╭━━━〔 🛒 ORDER 〕━━━╮
┃
┃ ID Order : ${order.id}
┃ Produk   : ${product.name}
┃ Harga    : ${formatRupiah(product.price)}
┃ Status   : PENDING
┃
┣━━━━━━━━━━━━━━━━━━
┃ Silakan lakukan pembayaran
┃ sesuai instruksi owner.
┃
╰━━━━━━━━━━━━━━━━━━╯`
    );

    return;
  }

  if (
    command === "cekorder" ||
    command === "orderstatus"
  ) {
    const orderId =
      args[0];

    if (!orderId) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}cekorder ZSXXXX`
      );
      return;
    }

    const order =
      getOrder(orderId);

    if (!order) {
      await sendText(
        chat,
        "❌ Order tidak ditemukan."
      );
      return;
    }

    await sendText(
      chat,
      `╭━━━〔 📦 ORDER 〕━━━╮
┃
┃ ID      : ${order.id}
┃ Produk  : ${order.productName}
┃ Harga   : ${formatRupiah(order.price)}
┃ Status  : ${order.status}
┃ Dibuat  : ${formatDate(order.createdAt)}
┃
╰━━━━━━━━━━━━━━━━━━╯`
    );

    return;
  }

  // ===================================================
  // PREMIUM
  // ===================================================

  if (command === "premium") {
    const durationText =
      args[0] || "7d";

    const duration =
      parseDuration(durationText);

    if (!duration) {
      await sendText(
        chat,
        `❌ Format durasi salah.\n\nContoh:\n${PREFIX}premium 7d\n${PREFIX}premium 30d`
      );
      return;
    }

    if (!isOwner(sender)) {
      await sendText(
        chat,
        `💎 Premium ${durationText} tersedia melalui owner.\n\n👑 Owner: ${OWNER_NUMBER}`
      );
      return;
    }

    const target =
      targetFromMessage(
        message,
        args.slice(1)
      );

    activatePremium(
      target,
      duration
    );

    await sendText(
      chat,
      `✅ Premium berhasil diaktifkan untuk ${jidNumber(target)} selama ${durationText}.`
    );

    return;
  }

  if (command === "cekpremium") {
    const premium =
      isPremium(sender);

    const userData =
      getUser(sender);

    let textPremium =
      premium
        ? "✅ AKTIF"
        : "❌ TIDAK AKTIF";

    if (
      premium &&
      userData.premiumUntil
    ) {
      textPremium +=
        `\nBerakhir: ${formatDate(
          userData.premiumUntil
        )}`;
    }

    await sendText(
      chat,
      `💎 STATUS PREMIUM\n\n${textPremium}`
    );

    return;
  }

  // ===================================================
  // AI PLACEHOLDER
  // ===================================================

  if (
    command === "ai" ||
    command === "openai" ||
    command === "ask" ||
    command === "bard" ||
    command === "nexara"
  ) {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}ai jelaskan tentang Indonesia`
      );
      return;
    }

    await sendText(
      chat,
      `🤖 *AI*\n\nPertanyaan diterima:\n${text}\n\n⚠️ Provider AI belum dikonfigurasi.`
    );

    return;
  }

  if (command === "translate") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}translate hello world`
      );
      return;
    }

    await sendText(
      chat,
      `🌐 Teks yang akan diterjemahkan:\n\n${text}\n\n⚠️ Provider translate belum dikonfigurasi.`
    );

    return;
  }

  if (command === "aiimage") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}aiimage kucing lucu`
      );
      return;
    }

    await sendText(
      chat,
      `🎨 Prompt diterima:\n\n${text}\n\n⚠️ Generator gambar belum dikonfigurasi.`
    );

    return;
  }

  console.log(
    `Command: ${command} | User: ${jidNumber(sender)}`
  );
    }
// =====================================================
// ZAZABOT - PART 4
// SEARCH / DOWNLOAD / STICKER / TOOLS
// =====================================================

// =====================================================
// SEARCH PLACEHOLDER
// =====================================================

async function googleSearch(query) {
  return `🔎 Hasil Google untuk: ${query}\n\n⚠️ Google Search API belum dikonfigurasi.`;
}

// =====================================================

async function googleImageSearch(query) {
  return `🖼️ Pencarian gambar: ${query}\n\n⚠️ Google Image API belum dikonfigurasi.`;
}

// =====================================================

async function wikipediaSearch(query) {
  return `📚 Wikipedia: ${query}\n\n⚠️ Wikipedia API belum dikonfigurasi.`;
}

// =====================================================

async function youtubeSearch(query) {
  return `▶️ YouTube Search: ${query}\n\n⚠️ YouTube Search API belum dikonfigurasi.`;
}

// =====================================================

async function lyricSearch(query) {
  return `🎵 Lirik: ${query}\n\n⚠️ Lirik API belum dikonfigurasi.`;
}

// =====================================================
// MEDIA HELPERS
// =====================================================

async function downloadMedia(
  messageContent,
  type = "image"
) {
  if (!sock || !messageContent) {
    return null;
  }

  try {
    const {
      downloadContentFromMessage
    } = await import(
      "@whiskeysockets/baileys"
    );

    const stream =
      await downloadContentFromMessage(
        messageContent,
        type
      );

    const chunks = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);

  } catch (error) {
    console.error(
      "DOWNLOAD MEDIA ERROR:",
      error.message
    );

    return null;
  }
}

// =====================================================
// STATIC STICKER
// =====================================================

async function makeStaticSticker(
  buffer
) {
  if (!buffer) {
    return null;
  }

  // Untuk sementara mengirim media asli
  // agar bot tetap stabil tanpa ffmpeg/sharp.
  return buffer;
}

// =====================================================
// TEXT STICKER
// =====================================================

async function textSticker(
  text
) {
  return Buffer.from(
    String(text || "ZazaBot")
  );
}

// =====================================================
// SEND QR
// =====================================================

async function sendQR(
  chat,
  data
) {
  if (!data) {
    await sendText(
      chat,
      "❌ QR tidak tersedia."
    );

    return;
  }

  try {
    const buffer =
      await QRCode.toBuffer(
        data,
        {
          type: "png",
          width: 600,
          margin: 2
        }
      );

    await sock.sendMessage(
      chat,
      {
        image: buffer,
        caption:
          "📱 Silakan scan QR di atas."
      }
    );

  } catch (error) {
    console.error(
      "SEND QR ERROR:",
      error.message
    );

    await sendText(
      chat,
      "❌ Gagal membuat QR."
    );
  }
}

// =====================================================
// TINY URL PLACEHOLDER
// =====================================================

async function tinyUrl(url) {
  return url;
}

// =====================================================
// COMMAND HANDLER PART 4
// =====================================================

async function handleCommandPart4(
  message,
  command,
  args,
  text
) {
  const chat = getChat(message);

  // ===================================================
  // SEARCH
  // ===================================================

  if (command === "google") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}google Zaza Store`
      );
      return true;
    }

    const result =
      await googleSearch(text);

    await sendText(
      chat,
      result
    );

    return true;
  }

  if (command === "googleimage") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}googleimage kucing`
      );
      return true;
    }

    const result =
      await googleImageSearch(text);

    await sendText(
      chat,
      result
    );

    return true;
  }

  if (command === "wikipedia") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}wikipedia Indonesia`
      );
      return true;
    }

    const result =
      await wikipediaSearch(text);

    await sendText(
      chat,
      result
    );

    return true;
  }

  if (command === "ytsearch") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}ytsearch lagu Indonesia`
      );
      return true;
    }

    const result =
      await youtubeSearch(text);

    await sendText(
      chat,
      result
    );

    return true;
  }

  if (command === "lirik") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}lirik judul lagu`
      );
      return true;
    }

    const result =
      await lyricSearch(text);

    await sendText(
      chat,
      result
    );

    return true;
  }

  // ===================================================
  // DOWNLOAD
  // ===================================================

  const downloadCommands = [
    "tiktok",
    "tiktoknowm",
    "tiktokwm",
    "igdl",
    "igreel",
    "instagram",
    "facebook",
    "ytmp3",
    "ytmp4"
  ];

  if (
    downloadCommands.includes(command)
  ) {
    const url =
      extractUrl(text);

    if (!url) {
      await sendText(
        chat,
        `❌ Masukkan URL.\n\nContoh:\n${PREFIX}${command} https://contoh.com/video`
      );

      return true;
    }

    await sendText(
      chat,
      `⏳ URL diterima:\n${url}\n\n⚠️ Downloader ${command} belum dikonfigurasi dengan API downloader.`
    );

    return true;
  }

  // ===================================================
  // STICKER
  // ===================================================

  if (
    command === "sticker" ||
    command === "s"
  ) {
    const msg =
      message?.message;

    const imageMessage =
      msg?.imageMessage;

    const quoted =
      msg?.extendedTextMessage
        ?.contextInfo
        ?.quotedMessage;

    let media = null;

    if (imageMessage) {
      media =
        await downloadMedia(
          imageMessage,
          "image"
        );
    }

    if (
      !media &&
      quoted?.imageMessage
    ) {
      media =
        await downloadMedia(
          quoted.imageMessage,
          "image"
        );
    }

    if (!media) {
      await sendText(
        chat,
        "❌ Kirim atau reply gambar dengan perintah .sticker"
      );

      return true;
    }

    const sticker =
      await makeStaticSticker(
        media
      );

    if (!sticker) {
      await sendText(
        chat,
        "❌ Gagal membuat sticker."
      );

      return true;
    }

    try {
      await sock.sendMessage(
        chat,
        {
          image: sticker,
          caption:
            "⚠️ Sticker converter belum memakai encoder WebP."
        }
      );
    } catch {
      await sendText(
        chat,
        "❌ Gagal mengirim media."
      );
    }

    return true;
  }

  // ===================================================
  // TO IMAGE
  // ===================================================

  if (command === "toimg") {
    await sendText(
      chat,
      "⚠️ Fitur .toimg membutuhkan converter WebP ke PNG."
    );

    return true;
  }

  // ===================================================
  // BRAT
  // ===================================================

  if (command === "brat") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}brat Zaza Store`
      );

      return true;
    }

    await sendText(
      chat,
      `🖼️ Brat text:\n\n${text}\n\n⚠️ Generator Brat belum dikonfigurasi.`
    );

    return true;
  }

  // ===================================================
  // TTP
  // ===================================================

  if (command === "ttp") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}ttp ZazaBot`
      );

      return true;
    }

    await sendText(
      chat,
      `📝 TTP:\n${text}\n\n⚠️ Generator sticker teks belum dikonfigurasi.`
    );

    return true;
  }

  // ===================================================
  // ATTP
  // ===================================================

  if (command === "attp") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}attp ZazaBot`
      );

      return true;
    }

    await sendText(
      chat,
      `📝 ATTP:\n${text}\n\n⚠️ Generator animasi teks belum dikonfigurasi.`
    );

    return true;
  }

  // ===================================================
  // QR
  // ===================================================

  if (command === "qr") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}qr https://google.com`
      );

      return true;
    }

    await sendQR(
      chat,
      text
    );

    return true;
  }

  // ===================================================
  // SHORTLINK
  // ===================================================

  if (command === "shortlink") {
    const url =
      extractUrl(text);

    if (!url) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}shortlink https://google.com`
      );

      return true;
    }

    const result =
      await tinyUrl(url);

    await sendText(
      chat,
      `🔗 Shortlink:\n${result}`
    );

    return true;
  }

  // ===================================================
  // SCREENSHOT
  // ===================================================

  if (command === "ss") {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}ss https://google.com`
      );

      return true;
    }

    await sendText(
      chat,
      `📸 Screenshot URL:\n${text}\n\n⚠️ Screenshot API belum dikonfigurasi.`
    );

    return true;
  }

  // ===================================================
  // TOURl
  // ===================================================

  if (command === "tourl") {
    await sendText(
      chat,
      "⚠️ Upload-to-URL belum dikonfigurasi."
    );

    return true;
  }

  // ===================================================
  // REMOVE BG
  // ===================================================

  if (command === "removebg") {
    await sendText(
      chat,
      "⚠️ Remove Background API belum dikonfigurasi."
    );

    return true;
  }

  // ===================================================
  // OCR
  // ===================================================

  if (command === "ocr") {
    await sendText(
      chat,
      "⚠️ OCR belum dikonfigurasi."
    );

    return true;
  }

  return false;
}

// =====================================================
// PART 4 LOADED
// =====================================================

console.log(
  `${BOT_NAME} PART 4 loaded successfully.`
);
// =====================================================
// ZAZABOT - PART 5
// GROUP / ADMIN / SECURITY
// =====================================================

// =====================================================
// GROUP COMMAND HANDLER
// =====================================================

async function handleGroupCommand(
  message,
  command,
  args,
  text
) {
  const chat = getChat(message);
  const sender = getSender(message);

  // ===================================================
  // GROUP INFO
  // ===================================================

  if (command === "groupinfo") {
    if (!(await needGroup(message))) {
      return true;
    }

    const metadata =
      await getGroupMetadata(chat);

    if (!metadata) {
      await sendText(
        chat,
        "❌ Gagal mengambil informasi grup."
      );

      return true;
    }

    const admins =
      metadata.participants?.filter(
        p =>
          p.admin === "admin" ||
          p.admin === "superadmin"
      ) || [];

    await sendText(
      chat,
      `╭━━━〔 👥 GROUP INFO 〕━━━╮
┃
┃ Nama    : ${metadata.subject || "-"}
┃ ID      : ${chat}
┃ Member  : ${metadata.participants?.length || 0}
┃ Admin   : ${admins.length}
┃
╰━━━━━━━━━━━━━━━━━━╯`
    );

    return true;
  }

  // ===================================================
  // GROUP ID
  // ===================================================

  if (command === "cekidgroup") {
    if (!(await needGroup(message))) {
      return true;
    }

    await sendText(
      chat,
      `🆔 ID Grup:\n\n${chat}`
    );

    return true;
  }

  // ===================================================
  // GROUP LINK
  // ===================================================

  if (command === "linkgroup") {
    if (!(await needGroup(message))) {
      return true;
    }

    if (!(await needBotAdmin(message))) {
      return true;
    }

    try {
      const code =
        await sock.groupInviteCode(chat);

      await sendText(
        chat,
        `🔗 Link Grup:\n\nhttps://chat.whatsapp.com/${code}`
      );
    } catch (error) {
      await sendText(
        chat,
        "❌ Bot tidak dapat mengambil link grup."
      );
    }

    return true;
  }

  // ===================================================
  // LIST ADMIN
  // ===================================================

  if (command === "listadmin") {
    if (!(await needGroup(message))) {
      return true;
    }

    const metadata =
      await getGroupMetadata(chat);

    if (!metadata) {
      return true;
    }

    const admins =
      metadata.participants?.filter(
        p =>
          p.admin === "admin" ||
          p.admin === "superadmin"
      ) || [];

    if (!admins.length) {
      await sendText(
        chat,
        "❌ Admin tidak ditemukan."
      );

      return true;
    }

    let output =
      "👑 *LIST ADMIN*\n\n";

    const mentions = [];

    admins.forEach(
      (admin, index) => {
        output +=
          `${index + 1}. ${mentionUser(admin.id)}\n`;

        mentions.push(admin.id);
      }
    );

    await sendText(
      chat,
      output,
      {
        mentions
      }
    );

    return true;
  }

  // ===================================================
  // TAG ADMIN
  // ===================================================

  if (command === "tagadmin") {
    if (!(await needGroup(message))) {
      return true;
    }

    const metadata =
      await getGroupMetadata(chat);

    if (!metadata) {
      return true;
    }

    const admins =
      metadata.participants?.filter(
        p =>
          p.admin === "admin" ||
          p.admin === "superadmin"
      ) || [];

    const mentions =
      admins.map(
        admin => admin.id
      );

    const textAdmin =
      admins
        .map(
          admin =>
            `@${jidNumber(admin.id)}`
        )
        .join(" ");

    await sendText(
      chat,
      `📢 *PANGGIL ADMIN*\n\n${textAdmin}`,
      {
        mentions
      }
    );

    return true;
  }

  // ===================================================
  // TAG ALL
  // ===================================================

  if (command === "tagall") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const metadata =
      await getGroupMetadata(chat);

    if (!metadata) {
      return true;
    }

    const mentions =
      metadata.participants
        .map(p => p.id);

    let output =
      text ||
      "📢 *TAG ALL*";

    output += "\n\n";

    output +=
      mentions
        .map(
          jid =>
            `@${jidNumber(jid)}`
        )
        .join(" ");

    await sendText(
      chat,
      output,
      {
        mentions
      }
    );

    return true;
  }

  // ===================================================
  // HIDETAG
  // ===================================================

  if (command === "hidetag") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const metadata =
      await getGroupMetadata(chat);

    if (!metadata) {
      return true;
    }

    const mentions =
      metadata.participants
        .map(p => p.id);

    await sendText(
      chat,
      text || "📢 Hidetag",
      {
        mentions
      }
    );

    return true;
  }

  // ===================================================
  // ADD MEMBER
  // ===================================================

  if (command === "add") {
    if (!(await needAdmin(message))) {
      return true;
    }

    if (!(await needBotAdmin(message))) {
      return true;
    }

    const number =
      String(args[0] || "")
        .replace(/\D/g, "");

    if (!number) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}add 628xxxxxxxxxx`
      );

      return true;
    }

    try {
      await sock.groupParticipantsUpdate(
        chat,
        [userJid(number)],
        "add"
      );

      await sendText(
        chat,
        `✅ Berhasil mencoba menambahkan ${number}.`
      );
    } catch (error) {
      await sendText(
        chat,
        `❌ Gagal menambahkan ${number}.`
      );
    }

    return true;
  }

  // ===================================================
  // KICK
  // ===================================================

  if (command === "kick") {
    if (!(await needAdmin(message))) {
      return true;
    }

    if (!(await needBotAdmin(message))) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    if (!target) {
      await sendText(
        chat,
        "❌ Tag/reply member yang ingin dikeluarkan."
      );

      return true;
    }

    try {
      await sock.groupParticipantsUpdate(
        chat,
        [target],
        "remove"
      );

      await sendText(
        chat,
        `✅ ${mentionUser(target)} dikeluarkan.`,
        {
          mentions: [target]
        }
      );
    } catch {
      await sendText(
        chat,
        "❌ Gagal mengeluarkan member."
      );
    }

    return true;
  }

  // ===================================================
  // PROMOTE
  // ===================================================

  if (command === "promote") {
    if (!(await needAdmin(message))) {
      return true;
    }

    if (!(await needBotAdmin(message))) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    if (!target) {
      await sendText(
        chat,
        "❌ Tag/reply member."
      );

      return true;
    }

    try {
      await sock.groupParticipantsUpdate(
        chat,
        [target],
        "promote"
      );

      await sendText(
        chat,
        `👑 ${mentionUser(target)} sekarang menjadi admin.`,
        {
          mentions: [target]
        }
      );
    } catch {
      await sendText(
        chat,
        "❌ Gagal menjadikan admin."
      );
    }

    return true;
  }

  // ===================================================
  // DEMOTE
  // ===================================================

  if (command === "demote") {
    if (!(await needAdmin(message))) {
      return true;
    }

    if (!(await needBotAdmin(message))) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    if (!target) {
      await sendText(
        chat,
        "❌ Tag/reply admin."
      );

      return true;
    }

    try {
      await sock.groupParticipantsUpdate(
        chat,
        [target],
        "demote"
      );

      await sendText(
        chat,
        `✅ ${mentionUser(target)} bukan admin lagi.`,
        {
          mentions: [target]
        }
      );
    } catch {
      await sendText(
        chat,
        "❌ Gagal menurunkan admin."
      );
    }

    return true;
  }

  // ===================================================
  // SET NAME
  // ===================================================

  if (command === "setname") {
    if (!(await needAdmin(message))) {
      return true;
    }

    if (!(await needBotAdmin(message))) {
      return true;
    }

    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}setname Zaza Store`
      );

      return true;
    }

    try {
      await sock.groupUpdateSubject(
        chat,
        text
      );

      await sendText(
        chat,
        "✅ Nama grup berhasil diubah."
      );
    } catch {
      await sendText(
        chat,
        "❌ Gagal mengubah nama grup."
      );
    }

    return true;
  }

  // ===================================================
  // SET DESCRIPTION
  // ===================================================

  if (command === "setdesc") {
    if (!(await needAdmin(message))) {
      return true;
    }

    if (!(await needBotAdmin(message))) {
      return true;
    }

    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}setdesc Grup Zaza Store`
      );

      return true;
    }

    try {
      await sock.groupUpdateDescription(
        chat,
        text
      );

      await sendText(
        chat,
        "✅ Deskripsi grup berhasil diubah."
      );
    } catch {
      await sendText(
        chat,
        "❌ Gagal mengubah deskripsi grup."
      );
    }

    return true;
  }

  // ===================================================
  // WELCOME
  // ===================================================

  if (command === "welcome") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.welcome =
      args[0] === "off"
        ? false
        : true;

    saveDB();

    await sendText(
      chat,
      group.welcome
        ? "✅ Welcome aktif."
        : "❌ Welcome nonaktif."
    );

    return true;
  }

  // ===================================================
  // GOODBYE
  // ===================================================

  if (command === "goodbye") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.goodbye =
      args[0] === "off"
        ? false
        : true;

    saveDB();

    await sendText(
      chat,
      group.goodbye
        ? "✅ Goodbye aktif."
        : "❌ Goodbye nonaktif."
    );

    return true;
  }

  // ===================================================
  // ANTILINK
  // ===================================================

  if (command === "antilink") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antilink = true;

    if (args[0] === "nokick") {
      group.antilinkKick = false;
    } else {
      group.antilinkKick = true;
    }

    saveDB();

    await sendText(
      chat,
      group.antilinkKick
        ? "✅ Antilink aktif + kick."
        : "✅ Antilink aktif tanpa kick."
    );

    return true;
  }

  // ===================================================
  // ANTILINK OFF
  // ===================================================

  if (command === "antilinkoff") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antilink = false;

    saveDB();

    await sendText(
      chat,
      "❌ Antilink dimatikan."
    );

    return true;
  }

  // ===================================================
  // ANTILINK NOKICK
  // ===================================================

  if (command === "antilinknokick") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antilink = true;
    group.antilinkKick = false;

    saveDB();

    await sendText(
      chat,
      "✅ Antilink aktif tanpa kick."
    );

    return true;
  }

  // ===================================================
  // ANTIBADWORD
  // ===================================================

  if (command === "antibadword") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antibadword = true;

    group.antibadwordKick =
      args[0] !== "nokick";

    saveDB();

    await sendText(
      chat,
      group.antibadwordKick
        ? "✅ Antibadword aktif + kick."
        : "✅ Antibadword aktif tanpa kick."
    );

    return true;
  }

  // ===================================================
  // ADD BADWORD
  // ===================================================

  if (command === "addbadword") {
    if (!(await needAdmin(message))) {
      return true;
    }

    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addbadword kata1 kata2`
      );

      return true;
    }

    const group =
      getGroup(chat);

    const words =
      text
        .split(/\s+/)
        .map(cleanText)
        .filter(Boolean);

    for (const word of words) {
      if (!group.badwords.includes(word)) {
        group.badwords.push(word);
      }
    }

    saveDB();

    await sendText(
      chat,
      `✅ ${words.length} kata berhasil ditambahkan.`
    );

    return true;
  }

  // ===================================================
  // ANTIBOT
  // ===================================================

  if (command === "antibot") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antibot =
      args[0] !== "off";

    saveDB();

    await sendText(
      chat,
      group.antibot
        ? "✅ Antibot aktif."
        : "❌ Antibot nonaktif."
    );

    return true;
  }

  // ===================================================
  // ANTIDELETE
  // ===================================================

  if (command === "antidelete") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antidelete =
      args[0] !== "off";

    saveDB();

    await sendText(
      chat,
      group.antidelete
        ? "✅ Antidelete aktif."
        : "❌ Antidelete nonaktif."
    );

    return true;
  }

  // ===================================================
  // ANTIMENTIONSW
  // ===================================================

  if (command === "antimentionsw") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antimentionsw =
      args[0] !== "off";

    saveDB();

    await sendText(
      chat,
      group.antimentionsw
        ? "✅ Anti mention aktif."
        : "❌ Anti mention nonaktif."
    );

    return true;
  }

  // ===================================================
  // ANTIVIEWONCE
  // ===================================================

  if (command === "antiviewonce") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antiviewonce =
      args[0] !== "off";

    saveDB();

    await sendText(
      chat,
      group.antiviewonce
        ? "✅ Antiviewonce aktif."
        : "❌ Antiviewonce nonaktif."
    );

    return true;
  }

  // ===================================================
  // ANTIWAME
  // ===================================================

  if (command === "antiwame") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antiwame = true;
    group.antiwameKick =
      args[0] !== "nokick";

    saveDB();

    await sendText(
      chat,
      group.antiwameKick
        ? "✅ Antiwa.me aktif + kick."
        : "✅ Antiwa.me aktif tanpa kick."
    );

    return true;
  }

  // ===================================================
  // ANTIWAME NOKICK
  // ===================================================

  if (command === "antiwamenokick") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antiwame = true;
    group.antiwameKick = false;

    saveDB();

    await sendText(
      chat,
      "✅ Antiwa.me aktif tanpa kick."
    );

    return true;
  }

  // ===================================================
  // ANTILUAR
  // ===================================================

  if (command === "antiluar") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.antiluar =
      args[0] !== "off";

    saveDB();

    await sendText(
      chat,
      group.antiluar
        ? "✅ Antiluar aktif."
        : "❌ Antiluar nonaktif."
    );

    return true;
  }

  return false;
}

// =====================================================
// PART 5 LOADED
// =====================================================

console.log(
  `${BOT_NAME} PART 5 loaded successfully.`
);
// =====================================================
// ZAZABOT - PART 6
// WARNING / LIST / REMINDER / GAME
// =====================================================

// =====================================================
// WARNING SYSTEM
// =====================================================

async function handleWarningCommand(
  message,
  command,
  args
) {
  const chat = getChat(message);

  if (command === "warn") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    if (!target) {
      await sendText(
        chat,
        "❌ Tag atau reply member yang ingin diberi warn."
      );

      return true;
    }

    const count =
      addWarning(
        chat,
        target
      );

    await sendText(
      chat,
      `⚠️ ${mentionUser(target)} mendapat WARN.\n\nJumlah warn: ${count}/3`,
      {
        mentions: [target]
      }
    );

    if (count >= 3) {
      if (await isBotAdmin(chat)) {
        try {
          await sock.groupParticipantsUpdate(
            chat,
            [target],
            "remove"
          );

          const group =
            getGroup(chat);

          group.warnings[
            jidNumber(target)
          ] = 0;

          saveDB();

          await sendText(
            chat,
            `🚫 ${mentionUser(target)} telah dikeluarkan karena mencapai 3 warn.`,
            {
              mentions: [target]
            }
          );
        } catch {
          await sendText(
            chat,
            "❌ Warn sudah mencapai 3, tetapi bot gagal mengeluarkan member."
          );
        }
      }
    }

    return true;
  }

  if (command === "unwarn") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    const count =
      removeWarning(
        chat,
        target
      );

    await sendText(
      chat,
      `✅ Warn ${mentionUser(target)} dikurangi.\n\nJumlah warn: ${count}/3`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  if (command === "cekwarn") {
    const target =
      targetFromMessage(
        message,
        args
      );

    const group =
      getGroup(chat);

    const count =
      Number(
        group.warnings[
          jidNumber(target)
        ] || 0
      );

    await sendText(
      chat,
      `⚠️ Warn ${mentionUser(target)}: ${count}/3`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  if (command === "listwarn") {
    if (!(await needGroup(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    const entries =
      Object.entries(
        group.warnings
      ).filter(
        ([, count]) =>
          Number(count) > 0
      );

    if (!entries.length) {
      await sendText(
        chat,
        "✅ Tidak ada member yang memiliki warn."
      );

      return true;
    }

    let output =
      "⚠️ *LIST WARN*\n\n";

    for (
      let i = 0;
      i < entries.length;
      i++
    ) {
      const [
        number,
        count
      ] = entries[i];

      output +=
        `${i + 1}. @${number} — ${count}/3\n`;
    }

    await sendText(
      chat,
      output,
      {
        mentions:
          entries.map(
            ([number]) =>
              userJid(number)
          )
      }
    );

    return true;
  }

  if (command === "resetwarn") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    group.warnings = {};

    saveDB();

    await sendText(
      chat,
      "✅ Semua warn grup telah direset."
    );

    return true;
  }

  return false;
}

// =====================================================
// LIST SYSTEM
// =====================================================

async function handleListCommand(
  message,
  command,
  args,
  text
) {
  const chat = getChat(message);

  if (command === "addlist") {
    if (!(await needAdmin(message))) {
      return true;
    }

    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addlist harga|Rp10.000`
      );

      return true;
    }

    const parts =
      text.split("|");

    const name =
      String(parts[0] || "")
        .trim();

    const value =
      String(parts.slice(1).join("|") || "")
        .trim();

    if (!name || !value) {
      await sendText(
        chat,
        "❌ Format salah."
      );

      return true;
    }

    const group =
      getGroup(chat);

    if (!group.lists) {
      group.lists = {};
    }

    group.lists[name] = value;

    saveDB();

    await sendText(
      chat,
      `✅ List berhasil ditambahkan.\n\n📌 ${name}\n📝 ${value}`
    );

    return true;
  }

  if (
    command === "updatelist" ||
    command === "uplist"
  ) {
    if (!(await needAdmin(message))) {
      return true;
    }

    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}updatelist harga|Rp20.000`
      );

      return true;
    }

    const parts =
      text.split("|");

    const name =
      String(parts[0] || "")
        .trim();

    const value =
      String(parts.slice(1).join("|") || "")
        .trim();

    const group =
      getGroup(chat);

    if (
      !group.lists ||
      !group.lists[name]
    ) {
      await sendText(
        chat,
        "❌ List tersebut belum ada."
      );

      return true;
    }

    group.lists[name] =
      value;

    saveDB();

    await sendText(
      chat,
      `✅ List ${name} berhasil diperbarui.`
    );

    return true;
  }

  if (command === "list") {
    if (!(await needGroup(message))) {
      return true;
    }

    const group =
      getGroup(chat);

    const entries =
      Object.entries(
        group.lists || {}
      );

    if (!entries.length) {
      await sendText(
        chat,
        "📋 List masih kosong."
      );

      return true;
    }

    let output =
      "📋 *LIST GRUP*\n\n";

    for (const [
      name,
      value
    ] of entries) {
      output +=
        `• ${name}: ${value}\n`;
    }

    await sendText(
      chat,
      output
    );

    return true;
  }

  return false;
}

// =====================================================
// POINT SYSTEM
// =====================================================

async function handlePointCommand(
  message,
  command,
  args
) {
  const chat = getChat(message);
  const sender = getSender(message);

  if (command === "addpoin") {
    if (!(await needAdmin(message))) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    const amount =
      Number(
        args.find(
          x => /^\d+$/.test(x)
        ) || 1
      );

    addPoint(
      target,
      amount
    );

    await sendText(
      chat,
      `🏆 ${mentionUser(target)} mendapat +${amount} poin.`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  if (command === "cekpoint") {
    const target =
      targetFromMessage(
        message,
        args
      );

    const targetUser =
      getUser(target);

    await sendText(
      chat,
      `🏆 Poin ${mentionUser(target)}: ${targetUser.points}`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  return false;
}

// =====================================================
// REMINDER
// =====================================================

async function handleReminderCommand(
  message,
  command,
  args,
  text
) {
  const chat = getChat(message);
  const sender = getSender(message);

  if (
    command === "addreminder" ||
    command === "addalarm"
  ) {
    const durationText =
      args[0];

    const duration =
      parseDuration(
        durationText
      );

    if (!duration) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addreminder 10m belajar`
      );

      return true;
    }

    const reminderText =
      args.slice(1).join(" ") ||
      "Reminder";

    const group =
      isGroup(chat)
        ? getGroup(chat)
        : null;

    if (group) {
      if (!group.reminders) {
        group.reminders = [];
      }

      group.reminders.push({
        id: randomId(6),
        user: sender,
        text: reminderText,
        time: Date.now() + duration
      });
    }

    saveDB();

    setTimeout(
      async () => {
        try {
          await sendText(
            chat,
            `⏰ *REMINDER*\n\n@${jidNumber(sender)}\n\n${reminderText}`,
            {
              mentions: [sender]
            }
          );
        } catch {
          // ignore
        }
      },
      duration
    );

    await sendText(
      chat,
      `⏰ Reminder dibuat.\n\n📝 ${reminderText}\n⏱️ ${durationText}`
    );

    return true;
  }

  if (command === "createschedulecall") {
    await sendText(
      chat,
      "📅 Fitur schedule call akan ditambahkan pada modul berikutnya."
    );

    return true;
  }

  if (command === "cekschedule") {
    const group =
      isGroup(chat)
        ? getGroup(chat)
        : null;

    const reminders =
      group?.reminders || [];

    if (!reminders.length) {
      await sendText(
        chat,
        "📅 Tidak ada schedule aktif."
      );

      return true;
    }

    let output =
      "📅 *SCHEDULE*\n\n";

    for (const reminder of reminders) {
      output +=
        `• ${reminder.text}\n`;
    }

    await sendText(
      chat,
      output
    );

    return true;
  }

  return false;
}

// =====================================================
// AFK
// =====================================================

async function handleAfkCommand(
  message,
  command,
  args,
  text
) {
  const chat = getChat(message);
  const sender = getSender(message);

  if (command === "afk") {
    const user =
      getUser(sender);

    user.afk = {
      reason:
        text ||
        "AFK",
      time: Date.now()
    };

    saveDB();

    await sendText(
      chat,
      `💤 @${jidNumber(sender)} sekarang AFK.\n\nAlasan: ${text || "AFK"}`,
      {
        mentions: [sender]
      }
    );

    return true;
  }

  return false;
}

// =====================================================
// GAME COMMAND
// =====================================================

async function handleGameCommand(
  message,
  command,
  args
) {
  const chat = getChat(message);
  const sender = getSender(message);

  // ---------------------------------------------------
  // ASAH OTAK
  // ---------------------------------------------------

  if (
    command === "asahotak" ||
    command === "tebak"
  ) {
    if (gameSessions.has(chat)) {
      await sendText(
        chat,
        "🎮 Masih ada game yang sedang berjalan.\nGunakan .stopgame terlebih dahulu."
      );

      return true;
    }

    const game =
      randomRiddle();

    startGame(
      chat,
      sender,
      "riddle",
      game
    );

    await sendText(
      chat,
      `🧠 *ASAH OTAK*\n\n${game.question}\n\nJawab langsung di chat.`
    );

    return true;
  }

  // ---------------------------------------------------
  // TEBAK KATA
  // ---------------------------------------------------

  if (
    command === "tebakkata" ||
    command === "susunkata"
  ) {
    if (gameSessions.has(chat)) {
      await sendText(
        chat,
        "🎮 Masih ada game yang berjalan."
      );

      return true;
    }

    const game =
      randomWordGame();

    startGame(
      chat,
      sender,
      "word",
      game
    );

    await sendText(
      chat,
      `🔤 *TEBAK KATA*\n\n${game.question}\n\nJawab langsung di chat.`
    );

    return true;
  }

  // ---------------------------------------------------
  // MATH
  // ---------------------------------------------------

  if (command === "math") {
    if (gameSessions.has(chat)) {
      await sendText(
        chat,
        "🎮 Masih ada game yang berjalan."
      );

      return true;
    }

    const game =
      createMathQuestion();

    startGame(
      chat,
      sender,
      "math",
      game
    );

    await sendText(
      chat,
      `➗ *MATH GAME*\n\n${game.question}`
    );

    return true;
  }

  // ---------------------------------------------------
  // TRUTH
  // ---------------------------------------------------

  if (command === "truth") {
    const questions = [
      "Apa hal paling memalukan yang pernah kamu lakukan?",
      "Siapa orang yang paling sering kamu chat?",
      "Apa cita-cita kamu?",
      "Apa kebiasaan burukmu?"
    ];

    const question =
      questions[
        Math.floor(
          Math.random() *
          questions.length
        )
      ];

    await sendText(
      chat,
      `🎯 *TRUTH*\n\n${question}`
    );

    return true;
  }

  // ---------------------------------------------------
  // DARE
  // ---------------------------------------------------

  if (command === "dare") {
    const dares = [
      "Kirim emoji favoritmu 10 kali.",
      "Kirim stiker terakhir yang kamu gunakan.",
      "Tulis 'ZazaBot keren' 5 kali.",
      "Kirim foto profilmu."
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

  // ---------------------------------------------------
  // CAKLONTONG
  // ---------------------------------------------------

  if (command === "caklontong") {
    if (gameSessions.has(chat)) {
      await sendText(
        chat,
        "🎮 Masih ada game yang berjalan."
      );

      return true;
    }

    const games = [
      {
        question:
          "Hewan apa yang paling sederhana?",
        answer:
          "ikan"
      },
      {
        question:
          "Apa yang dipakai untuk melihat?",
        answer:
          "mata"
      },
      {
        question:
          "Apa lawan kata panas?",
        answer:
          "dingin"
      }
    ];

    const game =
      games[
        Math.floor(
          Math.random() *
          games.length
        )
      ];

    startGame(
      chat,
      sender,
      "caklontong",
      game
    );

    await sendText(
      chat,
      `😂 *CAKLONTONG*\n\n${game.question}`
    );

    return true;
  }

  // ---------------------------------------------------
  // FAMILY 100
  // ---------------------------------------------------

  if (command === "family100") {
    await sendText(
      chat,
      `👨‍👩‍👧‍👦 *FAMILY 100*\n\nSebutkan benda yang biasanya ada di kamar tidur.\n\n⚠️ Mode sederhana.`
    );

    return true;
  }

  // ---------------------------------------------------
  // AKINATOR
  // ---------------------------------------------------

  if (command === "akinator") {
    await sendText(
      chat,
      "🔮 Akinator membutuhkan sistem pertanyaan khusus. Modul ini belum diaktifkan."
    );

    return true;
  }

  // ---------------------------------------------------
  // TEBAK GAMBAR
  // ---------------------------------------------------

  if (command === "tebakgambar") {
    await sendText(
      chat,
      "🖼️ Tebak gambar belum memiliki database gambar."
    );

    return true;
  }

  // ---------------------------------------------------
  // STOP GAME
  // ---------------------------------------------------

  if (command === "stopgame") {
    const stopped =
      stopGame(chat);

    await sendText(
      chat,
      stopped
        ? "🛑 Game dihentikan."
        : "❌ Tidak ada game yang sedang berjalan."
    );

    return true;
  }

  return false;
}

// =====================================================
// GENERAL GROUP INFO
// =====================================================

async function handleGroupInfoCommand(
  message,
  command
) {
  const chat = getChat(message);

  if (command === "ceksewa") {
    await sendText(
      chat,
      "📦 Status sewa bot:\n\nℹ️ Sistem sewa belum diaktifkan."
    );

    return true;
  }

  if (command === "ceksewabyid") {
    await sendText(
      chat,
      `📦 ID Grup:\n${chat}\n\nℹ️ Sistem sewa belum diaktifkan.`
    );

    return true;
  }

  if (command === "dbinfo") {
    if (!(await needOwner(message))) {
      return true;
    }

    await sendText(
      chat,
      `🗄️ *DATABASE INFO*\n\nUsers: ${Object.keys(db.users).length}\nGroups: ${Object.keys(db.groups).length}\nBanned: ${db.banned.length}\nPremium: ${Object.keys(db.premium).length}\nOrders: ${Object.keys(db.orders || {}).length}`
    );

    return true;
  }

  return false;
}

// =====================================================
// PART 6 LOADED
// =====================================================

console.log(
  `${BOT_NAME} PART 6 loaded successfully.`
);
// =====================================================
// ZAZABOT - PART 7
// AUTO SECURITY / AFK / GAME / PARTICIPANTS
// =====================================================

// =====================================================
// GROUP SECURITY
// =====================================================

async function handleGroupSecurity(message, text) {
  const chat = getChat(message);
  const sender = getSender(message);

  if (!isGroup(chat)) {
    return false;
  }

  const group = getGroup(chat);

  // Owner dan admin grup tidak terkena security otomatis
  if (
    isOwner(sender) ||
    await isGroupAdmin(chat, sender)
  ) {
    return false;
  }

  const lowerText = String(text || "").toLowerCase();

  // ===================================================
  // ANTI LINK WHATSAPP / GROUP LINK
  // ===================================================

  if (
    group.antilink &&
    (
      lowerText.includes("chat.whatsapp.com/") ||
      lowerText.includes("whatsapp.com/channel/")
    )
  ) {
    try {
      await sock.sendMessage(
        chat,
        {
          delete: message.key
        }
      );
    } catch {
      // abaikan jika bot tidak bisa menghapus
    }

    await sendText(
      chat,
      `⚠️ @${jidNumber(sender)} terdeteksi mengirim link WhatsApp.`,
      {
        mentions: [sender]
      }
    );

    if (
      group.antilinkKick &&
      await isBotAdmin(chat)
    ) {
      try {
        await sock.groupParticipantsUpdate(
          chat,
          [sender],
          "remove"
        );
      } catch {
        // abaikan
      }
    }

    return true;
  }

  // ===================================================
  // ANTI WA.ME
  // ===================================================

  if (
    group.antiwame &&
    (
      lowerText.includes("wa.me/") ||
      lowerText.includes("wa.link/")
    )
  ) {
    try {
      await sock.sendMessage(
        chat,
        {
          delete: message.key
        }
      );
    } catch {
      // abaikan
    }

    await sendText(
      chat,
      `⚠️ @${jidNumber(sender)} tidak diperbolehkan mengirim link wa.me.`,
      {
        mentions: [sender]
      }
    );

    if (
      group.antiwameKick &&
      await isBotAdmin(chat)
    ) {
      try {
        await sock.groupParticipantsUpdate(
          chat,
          [sender],
          "remove"
        );
      } catch {
        // abaikan
      }
    }

    return true;
  }

  // ===================================================
  // ANTI BADWORD
  // ===================================================

  if (
    group.antibadword &&
    Array.isArray(group.badwords) &&
    group.badwords.length
  ) {
    const cleaned =
      cleanText(lowerText);

    const found =
      group.badwords.find(
        word =>
          word &&
          cleaned.includes(
            cleanText(word)
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
      } catch {
        // abaikan
      }

      await sendText(
        chat,
        `⚠️ @${jidNumber(sender)} terdeteksi menggunakan kata terlarang.`,
        {
          mentions: [sender]
        }
      );

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
        } catch {
          // abaikan
        }
      }

      return true;
    }
  }

  return false;
}

// =====================================================
// GAME ANSWER
// =====================================================

async function handleGameAnswer(
  message,
  text
) {
  const chat = getChat(message);
  const sender = getSender(message);

  const session =
    gameSessions.get(chat);

  if (!session) {
    return false;
  }

  // Hanya pemain yang memulai game
  if (
    session.player &&
    session.player !== sender
  ) {
    return false;
  }

  const answer =
    cleanText(
      session.data?.answer || ""
    );

  const userAnswer =
    cleanText(text);

  if (!answer || !userAnswer) {
    return false;
  }

  if (userAnswer === answer) {
    const user =
      getUser(sender);

    user.points =
      Number(user.points || 0) + 5;

    user.limit =
      Number(user.limit || 0) + 1;

    gameSessions.delete(chat);

    saveDB();

    await sendText(
      chat,
      `🎉 *BENAR!*\n\nJawaban: ${session.data.answer}\n\n🏆 +5 poin\n🎁 +1 limit`
    );

    return true;
  }

  // Jawaban salah tidak menghapus game
  return false;
}

// =====================================================
// AFK SYSTEM
// =====================================================

async function handleAfk(
  message,
  text
) {
  const chat = getChat(message);
  const sender = getSender(message);

  if (!chat || !sender) {
    return false;
  }

  const user =
    getUser(sender);

  // ===================================================
  // USER KEMBALI DARI AFK
  // ===================================================

  if (
    user?.afk &&
    user.afk.time
  ) {
    const duration =
      Date.now() -
      user.afk.time;

    const reason =
      user.afk.reason ||
      "AFK";

    user.afk = null;

    saveDB();

    await sendText(
      chat,
      `👋 @${jidNumber(sender)} sudah kembali!\n\n⏱️ AFK selama: ${formatRuntime(duration)}\n📝 Alasan: ${reason}`,
      {
        mentions: [sender]
      }
    );
  }

  // ===================================================
  // CEK MENTION USER AFK
  // ===================================================

  const mentioned =
    message?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid || [];

  for (const jid of mentioned) {
    const mentionedUser =
      getUser(jid);

    if (
      mentionedUser?.afk &&
      mentionedUser.afk.time
    ) {
      const duration =
        Date.now() -
        mentionedUser.afk.time;

      await sendText(
        chat,
        `💤 @${jidNumber(jid)} sedang AFK.\n\n📝 Alasan: ${mentionedUser.afk.reason || "AFK"}\n⏱️ Selama: ${formatRuntime(duration)}`,
        {
          mentions: [jid]
        }
      );
    }
  }

  return false;
}

// =====================================================
// PARTICIPANT EVENTS
// =====================================================

async function handleParticipants(
  update
) {
  const {
    id: groupId,
    participants,
    action
  } = update;

  if (!groupId) {
    return;
  }

  const group =
    getGroup(groupId);

  // ===================================================
  // WELCOME
  // ===================================================

  if (
    action === "add" &&
    group.welcome
  ) {
    const metadata =
      await getGroupMetadata(
        groupId
      );

    const groupName =
      metadata?.subject ||
      "Grup";

    for (const jid of participants || []) {
      await sendText(
        groupId,
        `╭━━━〔 👋 WELCOME 〕━━━╮
┃
┃ Selamat datang @${jidNumber(jid)}!
┃
┃ 👥 Grup: ${groupName}
┃
┃ Silakan baca deskripsi
┃ dan patuhi peraturan grup.
┃
╰━━━━━━━━━━━━━━━━━━╯`,
        {
          mentions: [jid]
        }
      );
    }
  }

  // ===================================================
  // GOODBYE
  // ===================================================

  if (
    (
      action === "remove" ||
      action === "leave"
    ) &&
    group.goodbye
  ) {
    for (const jid of participants || []) {
      await sendText(
        groupId,
        `👋 @${jidNumber(jid)} telah keluar dari grup.`,
        {
          mentions: [jid]
        }
      );
    }
  }

  // ===================================================
  // PROMOTE
  // ===================================================

  if (action === "promote") {
    for (const jid of participants || []) {
      await sendText(
        groupId,
        `👑 Selamat @${jidNumber(jid)}, sekarang menjadi admin grup.`,
        {
          mentions: [jid]
        }
      );
    }
  }

  // ===================================================
  // DEMOTE
  // ===================================================

  if (action === "demote") {
    for (const jid of participants || []) {
      await sendText(
        groupId,
        `📢 @${jidNumber(jid)} tidak lagi menjadi admin.`,
        {
          mentions: [jid]
        }
      );
    }
  }
}

// =====================================================
// PART 7 LOADED
// =====================================================

console.log(
  `${BOT_NAME} PART 7 loaded successfully.`
);
// =====================================================
// ZAZABOT - PART 8
// MESSAGE HANDLER + COMMAND ROUTER + START BOT
// =====================================================

// =====================================================
// PARSE COMMAND
// =====================================================

function parseCommand(text) {
  if (!text) {
    return null;
  }

  const value = String(text).trim();

  if (!value.startsWith(PREFIX)) {
    return null;
  }

  const body =
    value.slice(PREFIX.length).trim();

  if (!body) {
    return null;
  }

  const parts =
    body.split(/\s+/);

  const command =
    String(parts.shift())
      .toLowerCase();

  return {
    command,
    args: parts,
    text: parts.join(" ")
  };
}

// =====================================================
// MAIN MESSAGE HANDLER
// =====================================================

async function handleMessage(message) {
  try {
    if (!message) {
      return;
    }

    if (!message.message) {
      return;
    }

    if (message.key?.fromMe) {
      return;
    }

    const chat =
      getChat(message);

    const sender =
      getSender(message);

    if (!chat || !sender) {
      return;
    }

    const text =
      getMessageText(message);

    if (!text) {
      return;
    }

    // =================================================
    // DATABASE USER
    // =================================================

    getUser(sender);

    db.stats.messages =
      Number(db.stats.messages || 0) + 1;

    saveDB();

    // =================================================
    // BANNED USER
    // =================================================

    if (
      isBanned(sender) &&
      !isOwner(sender)
    ) {
      return;
    }

    // =================================================
    // PUBLIC / SELF MODE
    // =================================================

    if (
      !publicMode &&
      !isOwner(sender)
    ) {
      return;
    }

    // =================================================
    // AFK
    // =================================================

    await handleAfk(
      message,
      text
    );

    // =================================================
    // GROUP SECURITY
    // =================================================

    if (isGroup(chat)) {
      const security =
        await handleGroupSecurity(
          message,
          text
        );

      if (security) {
        return;
      }
    }

    // =================================================
    // GAME ANSWER
    // =================================================

    const gameAnswered =
      await handleGameAnswer(
        message,
        text
      );

    if (gameAnswered) {
      return;
    }

    // =================================================
    // COMMAND
    // =================================================

    const parsed =
      parseCommand(text);

    if (!parsed) {
      return;
    }

    const {
      command,
      args,
      text: commandText
    } = parsed;

    // =================================================
    // PART 4
    // SEARCH / DOWNLOAD / STICKER
    // =================================================

    const part4 =
      await handleCommandPart4(
        message,
        command,
        args,
        commandText
      );

    if (part4) {
      return;
    }

    // =================================================
    // GROUP COMMAND
    // =================================================

    const groupCommand =
      await handleGroupCommand(
        message,
        command,
        args,
        commandText
      );

    if (groupCommand) {
      return;
    }

    // =================================================
    // WARNING
    // =================================================

    const warningCommand =
      await handleWarningCommand(
        message,
        command,
        args
      );

    if (warningCommand) {
      return;
    }

    // =================================================
    // LIST
    // =================================================

    const listCommand =
      await handleListCommand(
        message,
        command,
        args,
        commandText
      );

    if (listCommand) {
      return;
    }

    // =================================================
    // POINT
    // =================================================

    const pointCommand =
      await handlePointCommand(
        message,
        command,
        args
      );

    if (pointCommand) {
      return;
    }

    // =================================================
    // REMINDER
    // =================================================

    const reminderCommand =
      await handleReminderCommand(
        message,
        command,
        args,
        commandText
      );

    if (reminderCommand) {
      return;
    }

    // =================================================
    // AFK COMMAND
    // =================================================

    const afkCommand =
      await handleAfkCommand(
        message,
        command,
        args,
        commandText
      );

    if (afkCommand) {
      return;
    }

    // =================================================
    // GAME COMMAND
    // =================================================

    const gameCommand =
      await handleGameCommand(
        message,
        command,
        args
      );

    if (gameCommand) {
      return;
    }

    // =================================================
    // GROUP INFO / SEWA
    // =================================================

    const groupInfoCommand =
      await handleGroupInfoCommand(
        message,
        command
      );

    if (groupInfoCommand) {
      return;
    }

    // =================================================
    // MAIN COMMAND
    // =================================================

    await handleCommand(
      message,
      command,
      args,
      commandText
    );

  } catch (error) {
    console.error(
      "HANDLE MESSAGE ERROR:",
      error
    );
  }
}

// =====================================================
// START BOT
// =====================================================

async function startBot() {
  try {
    if (sock) {
      console.log(
        "Bot sudah memiliki koneksi."
      );
    }

    fs.mkdirSync(
      SESSION_DIR,
      {
        recursive: true
      }
    );

    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        SESSION_DIR
      );

    sock =
      makeWASocket({
        auth: state,

        logger:
          pino({
            level: "silent"
          }),

        browser:
          Browsers.ubuntu(
            BOT_NAME
          ),

        markOnlineOnConnect: false,

        generateHighQualityLinkPreview: false
      });

    // =================================================
    // SAVE CREDENTIALS
    // =================================================

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // =================================================
    // CONNECTION UPDATE
    // =================================================

    sock.ev.on(
      "connection.update",
      async (update) => {
        try {
          const {
            connection,
            lastDisconnect,
            qr
          } = update;

          // ---------------------------------------------
          // QR
          // ---------------------------------------------

          if (qr) {
            qrCode = qr;

            connectionStatus =
              "qr";

            console.log(
              "QR CODE TERSEDIA."
            );

            console.log(
              "Buka endpoint /qr untuk melihat QR."
            );
          }

          // ---------------------------------------------
          // OPEN
          // ---------------------------------------------

          if (
            connection === "open"
          ) {
            connectionStatus =
              "open";

            qrCode = null;

            startedAt =
              Date.now();

            console.log(
              "================================"
            );

            console.log(
              `${BOT_NAME} BERHASIL ONLINE`
            );

            console.log(
              "================================"
            );
          }

          // ---------------------------------------------
          // CLOSE
          // ---------------------------------------------

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
              "Koneksi WhatsApp terputus.",
              statusCode || ""
            );

            if (
              statusCode ===
              DisconnectReason.loggedOut
            ) {
              console.log(
                "Session logout. Hapus folder session lalu scan ulang."
              );

              return;
            }

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

                  console.log(
                    "Mencoba reconnect..."
                  );

                  await startBot();
                },
                5000
              );
          }

        } catch (error) {
          console.error(
            "CONNECTION UPDATE ERROR:",
            error
          );
        }
      }
    );

    // =================================================
    // INCOMING MESSAGE
    // =================================================

    sock.ev.on(
      "messages.upsert",
      async ({
        messages,
        type
      }) => {
        if (
          type !== "notify"
        ) {
          return;
        }

        for (
          const message
          of messages
        ) {
          await handleMessage(
            message
          );
        }
      }
    );

    // =================================================
    // GROUP PARTICIPANTS
    // =================================================

    sock.ev.on(
      "group-participants.update",
      async (update) => {
        try {
          await handleParticipants(
            update
          );
        } catch (error) {
          console.error(
            "PARTICIPANT ERROR:",
            error
          );
        }
      }
    );

  } catch (error) {
    connectionStatus =
      "error";

    console.error(
      "START BOT ERROR:",
      error
    );

    if (!reconnectTimer) {
      reconnectTimer =
        setTimeout(
          async () => {
            reconnectTimer =
              null;

            await startBot();
          },
          10000
        );
    }
  }
}

// =====================================================
// START ZAZABOT
// =====================================================

startBot();

console.log(
  `${BOT_NAME} sedang dijalankan...`
);
// =====================================================
// ZAZABOT - PART 9
// WEB SERVER / STATUS / QR
// =====================================================

const server = http.createServer(
  async (req, res) => {
    try {
      const url =
        req.url || "/";

      // =================================================
      // HOME
      // =================================================

      if (
        url === "/" ||
        url === "/index.html"
      ) {
        res.writeHead(
          200,
          {
            "Content-Type":
              "text/html; charset=utf-8"
          }
        );

        res.end(`
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width,initial-scale=1.0">
<title>${BOT_NAME}</title>

<style>
body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #0b1220;
  color: white;
  text-align: center;
}

.container {
  max-width: 500px;
  margin: 80px auto;
  padding: 30px;
}

.card {
  background: #111827;
  border-radius: 20px;
  padding: 30px;
  box-shadow: 0 10px 30px rgba(0,0,0,.3);
}

h1 {
  margin-bottom: 10px;
}

.status {
  font-size: 20px;
  margin: 20px 0;
}

a {
  display: block;
  margin: 12px;
  padding: 14px;
  border-radius: 12px;
  background: #2563eb;
  color: white;
  text-decoration: none;
}

a:hover {
  background: #1d4ed8;
}
</style>
</head>

<body>

<div class="container">

<div class="card">

<h1>🤖 ${BOT_NAME}</h1>

<p>WhatsApp Bot</p>

<div class="status">
Status:
<b>${connectionStatus}</b>
</div>

<a href="/status">
📊 Status Bot
</a>

<a href="/qr">
📱 QR Code
</a>

</div>

</div>

</body>
</html>
        `);

        return;
      }

      // =================================================
      // STATUS
      // =================================================

      if (
        url === "/status"
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
              bot: BOT_NAME,

              status:
                connectionStatus,

              public:
                publicMode,

              uptime:
                formatRuntime(
                  Date.now() -
                  startedAt
                ),

              messages:
                db.stats?.messages ||
                0,

              commands:
                db.stats?.commands ||
                0,

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
            },
            null,
            2
          )
        );

        return;
      }

      // =================================================
      // QR CODE
      // =================================================

      if (
        url === "/qr"
      ) {
        res.writeHead(
          200,
          {
            "Content-Type":
              "text/html; charset=utf-8"
          }
        );

        if (!qrCode) {
          res.end(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">
<title>QR ${BOT_NAME}</title>

<style>
body {
  background: #0b1220;
  color: white;
  font-family: Arial;
  text-align: center;
  padding-top: 60px;
}

.card {
  max-width: 400px;
  margin: auto;
  padding: 30px;
  background: #111827;
  border-radius: 20px;
}
</style>
</head>

<body>

<div class="card">

<h2>📱 QR ${BOT_NAME}</h2>

<p>QR belum tersedia.</p>

<p>
Status:
<b>${connectionStatus}</b>
</p>

<p>
Tunggu beberapa detik lalu refresh.
</p>

<a href="/qr">
🔄 Refresh
</a>

</div>

</body>
</html>
          `);

          return;
        }

        try {
          const qrImage =
            await QRCode.toDataURL(
              qrCode,
              {
                width: 350,
                margin: 2
              }
            );

          res.end(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">
<title>QR ${BOT_NAME}</title>

<style>
body {
  background: #0b1220;
  color: white;
  font-family: Arial;
  text-align: center;
  padding: 30px;
}

.card {
  max-width: 420px;
  margin: auto;
  background: white;
  color: black;
  padding: 25px;
  border-radius: 20px;
}

img {
  width: 100%;
  max-width: 350px;
}

button {
  padding: 12px 20px;
  border: 0;
  border-radius: 10px;
  background: #2563eb;
  color: white;
}
</style>
</head>

<body>

<div class="card">

<h2>📱 Scan QR ${BOT_NAME}</h2>

<img src="${qrImage}" />

<p>
Buka WhatsApp → Perangkat tertaut
→ Tautkan perangkat
</p>

<button onclick="location.reload()">
🔄 Refresh QR
</button>

</div>

</body>
</html>
          `);

        } catch (error) {
          res.end(`
QR gagal dibuat.

Error:
${String(error)}
          `);
        }

        return;
      }

      // =================================================
      // 404
      // =================================================

      res.writeHead(
        404,
        {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      );

      res.end(
        "404 - Halaman tidak ditemukan"
      );

    } catch (error) {
      console.error(
        "HTTP ERROR:",
        error
      );

      res.writeHead(
        500,
        {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      );

      res.end(
        "Internal Server Error"
      );
    }
  }
);

// =====================================================
// LISTEN SERVER
// =====================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "================================"
    );

    console.log(
      `WEB SERVER AKTIF DI PORT ${PORT}`
    );

    console.log(
      `http://0.0.0.0:${PORT}`
    );

    console.log(
      "================================"
    );
  }
);

// =====================================================
// AUTO SAVE DATABASE
// =====================================================

setInterval(
  () => {
    try {
      saveDB();

      console.log(
        "Database tersimpan."
      );
    } catch (error) {
      console.error(
        "AUTO SAVE ERROR:",
        error
      );
    }
  },
  60 * 1000
);

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

async function shutdown(
  signal
) {
  console.log(
    `${signal} diterima.`
  );

  try {
    saveDB();

    if (server) {
      server.close();
    }

    if (sock) {
      try {
        sock.end(
          undefined
        );
      } catch {
        // abaikan
      }
    }

  } catch (error) {
    console.error(
      "SHUTDOWN ERROR:",
      error
    );
  }

  process.exit(0);
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

// =====================================================
// ERROR HANDLER
// =====================================================

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "UNHANDLED REJECTION:",
      error
    );
  }
);

console.log(
  `${BOT_NAME} PART 9 loaded successfully.`
);
// =====================================================
// ZAZABOT - PART 10
// FINAL CHECK
// =====================================================

console.log("");
console.log("========================================");
console.log(`🤖 ${BOT_NAME} INITIALIZATION COMPLETE`);
console.log("========================================");
console.log(`📌 Prefix       : ${PREFIX}`);
console.log(`👑 Owner        : ${OWNER_NUMBER}`);
console.log(`🌐 Port         : ${PORT}`);
console.log(`📁 Session      : ${SESSION_DIR}`);
console.log(`💾 Database     : ${DATABASE_FILE}`);
console.log(`📡 Connection   : ${connectionStatus}`);
console.log("========================================");
console.log("✅ Semua PART index.js telah dimuat.");
console.log("========================================");
