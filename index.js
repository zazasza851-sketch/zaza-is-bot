// =====================================================
// ZAZABOT - PART 1
// CONFIG + DATABASE + BASIC HELPERS
// =====================================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} from "@whiskeysockets/baileys";

import pino from "pino";
import fs from "fs";
import http from "http";
import QRCode from "qrcode";

// =====================================================
// CONFIG
// =====================================================

const BOT_NAME = "ZazaBot";
const PREFIX = ".";

// OWNER
const OWNER_NUMBER = "6289630747010";

// NOMOR BOT:
// 6285866438941
// Nomor bot adalah akun WhatsApp yang melakukan scan QR.

// PORT
const PORT = process.env.PORT || 8080;

// SESSION
const SESSION_DIR = "./session";

// DATABASE
const DATABASE_FILE = "./database.json";

// =====================================================
// GLOBAL
// =====================================================

let sock = null;
let qrCode = null;

let publicMode = true;

let connectionStatus = "starting";

let startedAt = Date.now();

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

  blocked: [],

  premium: {},

  orders: {},

  stats: {
    messages: 0,
    commands: 0
  }
};

// =====================================================
// LOAD DATABASE
// =====================================================

function loadDB() {
  try {
    if (
      !fs.existsSync(
        DATABASE_FILE
      )
    ) {
      fs.writeFileSync(
        DATABASE_FILE,
        JSON.stringify(
          defaultDB,
          null,
          2
        )
      );

      return {
        ...defaultDB
      };
    }

    const raw =
      fs.readFileSync(
        DATABASE_FILE,
        "utf8"
      );

    const data =
      JSON.parse(raw);

    return {
      ...defaultDB,
      ...data,

      settings: {
        ...defaultDB.settings,
        ...(data.settings || {})
      },

      stats: {
        ...defaultDB.stats,
        ...(data.stats || {})
      }
    };

  } catch (error) {
    console.error(
      "DATABASE LOAD ERROR:",
      error
    );

    return {
      ...defaultDB
    };
  }
}

// =====================================================
// DATABASE
// =====================================================

let db = loadDB();

// =====================================================
// SAVE DATABASE
// =====================================================

function saveDB() {
  try {
    fs.writeFileSync(
      DATABASE_FILE,
      JSON.stringify(
        db,
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      "DATABASE SAVE ERROR:",
      error
    );
  }
}

// =====================================================
// JID NUMBER
// =====================================================

function jidNumber(jid) {
  if (!jid) {
    return "";
  }

  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

// =====================================================
// USER JID
// =====================================================

function userJid(number) {
  const clean =
    String(number || "")
      .replace(/\D/g, "");

  return (
    clean + "@s.whatsapp.net"
  );
}

// =====================================================
// GROUP CHECK
// =====================================================

function isGroup(jid) {
  return String(jid || "")
    .endsWith("@g.us");
}

// =====================================================
// GET SENDER
// =====================================================

function getSender(message) {
  if (!message) {
    return "";
  }

  return (
    message.key?.participant ||
    message.key?.remoteJid ||
    ""
  );
}

// =====================================================
// GET CHAT
// =====================================================

function getChat(message) {
  if (!message) {
    return "";
  }

  return (
    message.key?.remoteJid ||
    ""
  );
}

// =====================================================
// OWNER CHECK
// =====================================================

function isOwner(jid) {
  return (
    jidNumber(jid) ===
    OWNER_NUMBER
  );
}

// =====================================================
// BANNED CHECK
// =====================================================

function isBanned(jid) {
  const number =
    jidNumber(jid);

  return Array.isArray(
    db.banned
  ) &&
    db.banned.includes(
      number
    );
}

// =====================================================
// BLOCKED CHECK
// =====================================================

function isBlocked(jid) {
  const number =
    jidNumber(jid);

  return Array.isArray(
    db.blocked
  ) &&
    db.blocked.includes(
      number
    );
}

// =====================================================
// GET USER
// =====================================================

function getUser(jid) {
  const id =
    jidNumber(jid);

  if (!id) {
    return null;
  }

  if (!db.users[id]) {
    db.users[id] = {
      id: id,
      name: id,

      balance: 0,
      limit: 20,

      level: 1,
      xp: 0,
      points: 0,

      premium: false,
      premiumUntil: 0,

      warn: 0,

      afk: null,

      createdAt:
        Date.now()
    };
  }

  return db.users[id];
}

// =====================================================
// GET GROUP
// =====================================================

function getGroup(jid) {
  if (!jid) {
    return null;
  }

  if (!db.groups[jid]) {
    db.groups[jid] = {
      id: jid,

      welcome: false,
      goodbye: false,

      antilink: false,
      antilinkKick: false,

      antilinkChannel: false,

      antibadword: false,
      antibadwordKick: false,

      antibot: false,

      antidelete: false,

      antimentionsw: false,

      antiviewonce: false,

      antiwame: false,
      antiwameKick: false,

      antiluar: false,

      mute: false,

      badwords: [],

      warnings: {},

      lists: {},

      points: {},

      reminders: [],

      schedule: [],

      settings: {
        open: true
      },

      createdAt:
        Date.now()
    };
  }

  return db.groups[jid];
}

// =====================================================
// PREMIUM CHECK
// =====================================================

function isPremium(jid) {
  const user =
    getUser(jid);

  if (!user) {
    return false;
  }

  if (
    user.premium &&
    user.premiumUntil > 0 &&
    Date.now() >
      user.premiumUntil
  ) {
    user.premium = false;
    user.premiumUntil = 0;

    saveDB();

    return false;
  }

  return Boolean(
    user.premium
  );
}

// =====================================================
// FORMAT RUPIAH
// =====================================================

function formatRupiah(
  amount
) {
  return new Intl.NumberFormat(
    "id-ID",
    {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }
  ).format(
    Number(amount || 0)
  );
}

// =====================================================
// FORMAT RUNTIME
// =====================================================

function formatRuntime(
  milliseconds
) {
  let seconds =
    Math.floor(
      milliseconds / 1000
    );

  const days =
    Math.floor(
      seconds / 86400
    );

  seconds %= 86400;

  const hours =
    Math.floor(
      seconds / 3600
    );

  seconds %= 3600;

  const minutes =
    Math.floor(
      seconds / 60
    );

  seconds %= 60;

  const result = [];

  if (days) {
    result.push(
      `${days}d`
    );
  }

  if (hours) {
    result.push(
      `${hours}h`
    );
  }

  if (minutes) {
    result.push(
      `${minutes}m`
    );
  }

  result.push(
    `${seconds}s`
  );

  return result.join(" ");
}

// =====================================================
// GET MESSAGE TEXT
// =====================================================

function getMessageText(
  message
) {
  const msg =
    message?.message;

  if (!msg) {
    return "";
  }

  if (
    msg.conversation
  ) {
    return msg.conversation;
  }

  if (
    msg.extendedTextMessage
      ?.text
  ) {
    return (
      msg.extendedTextMessage.text
    );
  }

  if (
    msg.imageMessage
      ?.caption
  ) {
    return (
      msg.imageMessage.caption
    );
  }

  if (
    msg.videoMessage
      ?.caption
  ) {
    return (
      msg.videoMessage.caption
    );
  }

  if (
    msg.documentMessage
      ?.caption
  ) {
    return (
      msg.documentMessage.caption
    );
  }

  if (
    msg.buttonsResponseMessage
      ?.selectedButtonId
  ) {
    return (
      msg.buttonsResponseMessage
        .selectedButtonId
    );
  }

  if (
    msg.listResponseMessage
      ?.singleSelectReply
      ?.selectedRowId
  ) {
    return (
      msg.listResponseMessage
        .singleSelectReply
        .selectedRowId
    );
  }

  return "";
}

// =====================================================
// SEND TEXT
// =====================================================

async function sendText(
  chat,
  text,
  options = {}
) {
  if (!sock) {
    return;
  }

  return sock.sendMessage(
    chat,
    {
      text: String(text),
      ...options
    }
  );
}

// =====================================================
// REACTION
// =====================================================

async function react(
  message,
  emoji
) {
  if (!sock) {
    return;
  }

  if (!message?.key) {
    return;
  }

  const chat =
    getChat(message);

  return sock.sendMessage(
    chat,
    {
      react: {
        text: emoji,
        key: message.key
      }
    }
  );
}

// =====================================================
// RANDOM ID
// =====================================================

function randomId(
  length = 8
) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  let result = "";

  for (
    let i = 0;
    i < length;
    i++
  ) {
    result +=
      chars[
        Math.floor(
          Math.random() *
            chars.length
        )
      ];
  }

  return result;
}

// =====================================================
// EXTRACT URL
// =====================================================

function extractUrl(
  text
) {
  if (!text) {
    return null;
  }

  const match =
    String(text).match(
      /https?:\/\/[^\s]+/i
    );

  return match
    ? match[0]
    : null;
}

// =====================================================
// CLEAN TEXT
// =====================================================

function cleanText(
  text
) {
  return String(
    text || ""
  )
    .toLowerCase()
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}

// =====================================================
// DURATION
// =====================================================

function parseDuration(
  text
) {
  if (!text) {
    return 0;
  }

  const match =
    String(text)
      .trim()
      .match(
        /^(\d+)\s*(s|m|h|d|w)$/i
      );

  if (!match) {
    return 0;
  }

  const value =
    Number(match[1]);

  const unit =
    match[2].toLowerCase();

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };

  return (
    value *
    multipliers[unit]
  );
}

// =====================================================
// GROUP METADATA
// =====================================================

async function getGroupMetadata(
  chat
) {
  if (!sock || !isGroup(chat)) {
    return null;
  }

  try {
    return await sock.groupMetadata(
      chat
    );
  } catch (error) {
    console.error(
      "GROUP METADATA ERROR:",
      error.message
    );

    return null;
  }
}

// =====================================================
// IS GROUP ADMIN
// =====================================================

async function isGroupAdmin(
  chat,
  jid
) {
  try {
    const metadata =
      await getGroupMetadata(
        chat
      );

    if (!metadata) {
      return false;
    }

    const number =
      jidNumber(jid);

    const participant =
      metadata.participants.find(
        item =>
          jidNumber(
            item.id
          ) === number
      );

    if (!participant) {
      return false;
    }

    return (
      participant.admin ===
        "admin" ||
      participant.admin ===
        "superadmin"
    );

  } catch {
    return false;
  }
}

// =====================================================
// BOT ADMIN
// =====================================================

async function isBotAdmin(
  chat
) {
  try {
    if (!sock?.user?.id) {
      return false;
    }

    return await isGroupAdmin(
      chat,
      sock.user.id
    );

  } catch {
    return false;
  }
}

// =====================================================
// NEED GROUP
// =====================================================

async function needGroup(
  chat
) {
  if (!isGroup(chat)) {
    await sendText(
      chat,
      "❌ Command ini hanya dapat digunakan di dalam grup."
    );

    return false;
  }

  return true;
}

// =====================================================
// NEED ADMIN
// =====================================================

async function needAdmin(
  message
) {
  const chat =
    getChat(message);

  const sender =
    getSender(message);

  if (
    isOwner(sender)
  ) {
    return true;
  }

  if (
    !isGroup(chat)
  ) {
    await sendText(
      chat,
      "❌ Command ini hanya untuk grup."
    );

    return false;
  }

  const admin =
    await isGroupAdmin(
      chat,
      sender
    );

  if (!admin) {
    await sendText(
      chat,
      "❌ Kamu harus menjadi admin grup."
    );

    return false;
  }

  return true;
}

// =====================================================
// NEED BOT ADMIN
// =====================================================

async function needBotAdmin(
  chat
) {
  if (
    await isBotAdmin(chat)
  ) {
    return true;
  }

  await sendText(
    chat,
    "❌ Bot harus menjadi admin grup terlebih dahulu."
  );

  return false;
}

// =====================================================
// TARGET USER
// =====================================================

function targetFromMessage(
  message,
  args = []
) {
  const mentioned =
    message?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid;

  if (
    mentioned &&
    mentioned.length > 0
  ) {
    return mentioned[0];
  }

  const number =
    args.find(
      item =>
        /^\d{8,15}$/.test(
          String(item)
            .replace(
              /\D/g,
              ""
            )
        )
    );

  if (number) {
    return userJid(
      number
    );
  }

  return getSender(
    message
  );
}

// =====================================================
// MENTION USER
// =====================================================

function mentionUser(
  jid
) {
  return `@${jidNumber(jid)}`;
}

// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(
  timestamp
) {
  if (!timestamp) {
    return "-";
  }

  return new Date(
    timestamp
  ).toLocaleString(
    "id-ID",
    {
      timeZone:
        "Asia/Jakarta"
    }
  );
}

// =====================================================
// INITIAL SAVE
// =====================================================

saveDB();

console.log(
  "========================================"
);

console.log(
  `🤖 ${BOT_NAME} PART 1 LOADED`
);

console.log(
  `👑 OWNER: ${OWNER_NUMBER}`
);

console.log(
  "📱 BOT: 6285866438941"
);

console.log(
  "========================================"
);
// =====================================================
// ZAZABOT - PART 2
// STORE + ORDER + PREMIUM + GAME DATABASE
// =====================================================

// =====================================================
// PRODUCTS
// =====================================================

const products = {
  spotify1: {
    id: "spotify1",
    name: "Spotify Premium 1 Bulan",
    price: 8000
  },

  spotify2: {
    id: "spotify2",
    name: "Spotify Premium 2 Bulan",
    price: 10000
  },

  hokian: {
    id: "hokian",
    name: "Hoki-Hokian",
    price: 15000
  },

  premium7: {
    id: "premium7",
    name: "ZazaBot Premium 7 Hari",
    price: 5000
  },

  premium30: {
    id: "premium30",
    name: "ZazaBot Premium 30 Hari",
    price: 10000
  }
};

// =====================================================
// FIND PRODUCT
// =====================================================

function findProduct(
  id
) {
  if (!id) {
    return null;
  }

  return (
    products[
      String(id).toLowerCase()
    ] || null
  );
}

// =====================================================
// PRODUCT LIST
// =====================================================

function productListText() {
  const list =
    Object.values(products);

  let text =
    "╭━━━〔 🛍️ PRODUK ZAZA STORE 〕━━━╮\n\n";

  for (
    const product of list
  ) {
    text +=
      `• ${product.id}\n` +
      `  ${product.name}\n` +
      `  💰 ${formatRupiah(product.price)}\n\n`;
  }

  text +=
    "╰━━━━━━━━━━━━━━━━━━━━━━━━╯";

  return text;
}

// =====================================================
// GAME DATA
// =====================================================

const riddles = [
  {
    question:
      "Apa yang mempunyai kaki tetapi tidak bisa berjalan?",
    answer: "meja"
  },

  {
    question:
      "Apa yang punya gigi tetapi tidak bisa menggigit?",
    answer: "sisir"
  },

  {
    question:
      "Semakin diisi semakin ringan. Apakah itu?",
    answer: "balon"
  },

  {
    question:
      "Apa yang selalu naik tetapi tidak pernah turun?",
    answer: "umur"
  },

  {
    question:
      "Apa yang memiliki mata tetapi tidak bisa melihat?",
    answer: "jarum"
  },

  {
    question:
      "Apa yang basah ketika mengeringkan?",
    answer: "handuk"
  }
];

const wordGames = [
  {
    question:
      "Susun huruf: A - Y - A - M",
    answer: "ayam"
  },

  {
    question:
      "Susun huruf: B - U - K - U",
    answer: "buku"
  },

  {
    question:
      "Susun huruf: R - U - M - A - H",
    answer: "rumah"
  },

  {
    question:
      "Susun huruf: M - A - K - A - N",
    answer: "makan"
  },

  {
    question:
      "Susun huruf: S - E - K - O - L - A - H",
    answer: "sekolah"
  }
];

// =====================================================
// GAME SESSIONS
// =====================================================

const gameSessions =
  new Map();

// =====================================================
// START GAME
// =====================================================

function startGame(
  chat,
  player,
  type,
  data
) {
  gameSessions.set(
    chat,
    {
      type,
      player,
      data,
      startedAt:
        Date.now()
    }
  );
}

// =====================================================
// STOP GAME
// =====================================================

function stopGame(
  chat
) {
  return gameSessions.delete(
    chat
  );
}

// =====================================================
// RANDOM RIDDLE
// =====================================================

function randomRiddle() {
  return riddles[
    Math.floor(
      Math.random() *
        riddles.length
    )
  ];
}

// =====================================================
// RANDOM WORD GAME
// =====================================================

function randomWordGame() {
  return wordGames[
    Math.floor(
      Math.random() *
        wordGames.length
    )
  ];
}

// =====================================================
// MATH GAME
// =====================================================

function createMathQuestion() {
  const a =
    Math.floor(
      Math.random() * 20
    ) + 1;

  const b =
    Math.floor(
      Math.random() * 20
    ) + 1;

  const operators = [
    "+",
    "-",
    "*"
  ];

  const operator =
    operators[
      Math.floor(
        Math.random() *
          operators.length
      )
    ];

  let answer;

  if (
    operator === "+"
  ) {
    answer = a + b;
  }

  if (
    operator === "-"
  ) {
    answer = a - b;
  }

  if (
    operator === "*"
  ) {
    answer = a * b;
  }

  return {
    question:
      `${a} ${operator} ${b} = ?`,

    answer:
      String(answer)
  };
}

// =====================================================
// CREATE ORDER
// =====================================================

function createOrder(
  jid,
  product
) {
  if (!db.orders) {
    db.orders = {};
  }

  const id =
    "ZS" +
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase();

  db.orders[id] = {
    id,

    user:
      jidNumber(jid),

    productId:
      product.id,

    productName:
      product.name,

    price:
      product.price,

    status:
      "pending",

    createdAt:
      Date.now()
  };

  saveDB();

  return db.orders[id];
}

// =====================================================
// GET ORDER
// =====================================================

function getOrder(
  id
) {
  if (!db.orders) {
    db.orders = {};
  }

  return (
    db.orders[id] ||
    null
  );
}

// =====================================================
// BALANCE
// =====================================================

function getBalance(
  jid
) {
  const user =
    getUser(jid);

  return Number(
    user?.balance || 0
  );
}

// =====================================================
// ADD BALANCE
// =====================================================

function addBalance(
  jid,
  amount
) {
  const user =
    getUser(jid);

  if (!user) {
    return 0;
  }

  user.balance =
    Number(user.balance || 0) +
    Number(amount || 0);

  saveDB();

  return user.balance;
}

// =====================================================
// REMOVE BALANCE
// =====================================================

function removeBalance(
  jid,
  amount
) {
  const user =
    getUser(jid);

  if (!user) {
    return false;
  }

  const value =
    Number(amount || 0);

  if (
    Number(user.balance || 0) <
    value
  ) {
    return false;
  }

  user.balance -= value;

  saveDB();

  return true;
}

// =====================================================
// ADD LIMIT
// =====================================================

function addLimit(
  jid,
  amount
) {
  const user =
    getUser(jid);

  if (!user) {
    return 0;
  }

  user.limit =
    Number(user.limit || 0) +
    Number(amount || 0);

  saveDB();

  return user.limit;
}

// =====================================================
// REMOVE LIMIT
// =====================================================

function removeLimit(
  jid,
  amount = 1
) {
  const user =
    getUser(jid);

  if (!user) {
    return false;
  }

  const value =
    Number(amount || 0);

  if (
    Number(user.limit || 0) <
    value
  ) {
    return false;
  }

  user.limit -= value;

  saveDB();

  return true;
}

// =====================================================
// ADD POINT
// =====================================================

function addPoint(
  jid,
  amount
) {
  const user =
    getUser(jid);

  if (!user) {
    return 0;
  }

  user.points =
    Number(user.points || 0) +
    Number(amount || 0);

  saveDB();

  return user.points;
}

// =====================================================
// ADD XP
// =====================================================

function addXP(
  jid,
  amount
) {
  const user =
    getUser(jid);

  if (!user) {
    return null;
  }

  user.xp =
    Number(user.xp || 0) +
    Number(amount || 0);

  while (
    user.xp >=
    user.level * 100
  ) {
    user.xp -=
      user.level * 100;

    user.level += 1;
  }

  saveDB();

  return user;
}

// =====================================================
// WARNING
// =====================================================

function addWarning(
  chat,
  jid
) {
  const group =
    getGroup(chat);

  const id =
    jidNumber(jid);

  if (!group.warnings[id]) {
    group.warnings[id] = 0;
  }

  group.warnings[id] += 1;

  saveDB();

  return group.warnings[id];
}

// =====================================================
// REMOVE WARNING
// =====================================================

function removeWarning(
  chat,
  jid
) {
  const group =
    getGroup(chat);

  const id =
    jidNumber(jid);

  if (!group.warnings[id]) {
    return 0;
  }

  group.warnings[id] -= 1;

  if (
    group.warnings[id] < 0
  ) {
    group.warnings[id] = 0;
  }

  saveDB();

  return group.warnings[id];
}

// =====================================================
// ACTIVATE PREMIUM
// =====================================================

function activatePremium(
  jid,
  days
) {
  const user =
    getUser(jid);

  if (!user) {
    return false;
  }

  const duration =
    Number(days || 0) *
    24 *
    60 *
    60 *
    1000;

  if (
    duration <= 0
  ) {
    return false;
  }

  const now =
    Date.now();

  const current =
    user.premiumUntil >
    now
      ? user.premiumUntil
      : now;

  user.premium =
    true;

  user.premiumUntil =
    current + duration;

  if (!db.premium) {
    db.premium = {};
  }

  db.premium[
    jidNumber(jid)
  ] = {
    until:
      user.premiumUntil,

    activatedAt:
      now
  };

  saveDB();

  return true;
}

// =====================================================
// ENSURE DATABASE
// =====================================================

if (!db.orders) {
  db.orders = {};
}

if (!db.premium) {
  db.premium = {};
}

if (!db.banned) {
  db.banned = [];
}

if (!db.blocked) {
  db.blocked = [];
}

saveDB();

// =====================================================
// PART 2 LOADED
// =====================================================

console.log(
  "========================================"
);

console.log(
  `🛍️ ${BOT_NAME} PART 2 LOADED`
);

console.log(
  `📦 Produk: ${Object.keys(products).length}`
);

console.log(
  "🎮 Game database siap."
);

console.log(
  "========================================"
);
// =====================================================
// ZAZABOT - PART 3
// GENERAL + OWNER + STORE + PREMIUM + AI
// =====================================================

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

  const user =
    getUser(sender);

  db.stats.commands =
    Number(
      db.stats.commands || 0
    ) + 1;

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
      menuText()
    );

    return true;
  }

  if (
    command === "ping"
  ) {
    const start =
      Date.now();

    const speed =
      Date.now() - start;

    await sendText(
      chat,
      `🏓 *PONG!*\n\n⚡ Speed: ${speed} ms\n🤖 ${BOT_NAME}`
    );

    return true;
  }

  if (
    command === "speed"
  ) {
    await sendText(
      chat,
      `⚡ Speed Bot: ${Date.now() - startedAt} ms`
    );

    return true;
  }

  if (
    command === "runtime"
  ) {
    await sendText(
      chat,
      `⏱️ *RUNTIME*\n\n${formatRuntime(
        Date.now() - startedAt
      )}`
    );

    return true;
  }

  if (
    command === "status"
  ) {
    await sendText(
      chat,
      `📊 *STATUS ZAZABOT*\n\n` +
      `🤖 Bot: ${BOT_NAME}\n` +
      `📱 Nomor: 6285866438941\n` +
      `👑 Owner: ${OWNER_NUMBER}\n` +
      `🟢 Connection: ${connectionStatus}\n` +
      `🌐 Mode: ${publicMode ? "Public" : "Self"}\n` +
      `💬 Messages: ${db.stats.messages}\n` +
      `⚡ Commands: ${db.stats.commands}\n` +
      `⏱️ Runtime: ${formatRuntime(
        Date.now() - startedAt
      )}`
    );

    return true;
  }

  if (
    command === "botinfo"
  ) {
    await sendText(
      chat,
      `🤖 *${BOT_NAME}*\n\n` +
      `📱 Bot: 6285866438941\n` +
      `👑 Owner: 6289630747010\n` +
      `⚙️ Prefix: ${PREFIX}\n` +
      `🟢 Status: ${connectionStatus}\n` +
      `⏱️ Runtime: ${formatRuntime(
        Date.now() - startedAt
      )}\n\n` +
      `🔗 https://linktr.ee/zazastore19`
    );

    return true;
  }

  if (
    command === "profile"
  ) {
    await sendText(
      chat,
      `👤 *PROFILE*\n\n` +
      `📱 ID: ${user.id}\n` +
      `💰 Balance: ${formatRupiah(
        user.balance
      )}\n` +
      `🎟️ Limit: ${user.limit}\n` +
      `⭐ Level: ${user.level}\n` +
      `✨ XP: ${user.xp}\n` +
      `🏆 Point: ${user.points}\n` +
      `💎 Premium: ${
        isPremium(sender)
          ? "AKTIF"
          : "TIDAK"
      }`
    );

    return true;
  }

  if (
    command === "balance" ||
    command === "saldo"
  ) {
    await sendText(
      chat,
      `💰 *SALDO*\n\n` +
      `Saldo kamu: *${formatRupiah(
        getBalance(sender)
      )}*`
    );

    return true;
  }

  if (
    command === "limit"
  ) {
    await sendText(
      chat,
      `🎟️ *LIMIT*\n\n` +
      `Limit kamu: *${user.limit}*`
    );

    return true;
  }

  if (
    command === "level"
  ) {
    await sendText(
      chat,
      `⭐ *LEVEL*\n\n` +
      `Level: *${user.level}*\n` +
      `XP: *${user.xp}*`
    );

    return true;
  }

  if (
    command === "rules"
  ) {
    await sendText(
      chat,
      `📜 *RULES ZAZABOT*\n\n` +
      `1. Jangan spam.\n` +
      `2. Jangan gunakan bot untuk hal ilegal.\n` +
      `3. Jangan mengirim link berbahaya.\n` +
      `4. Gunakan command sesuai fungsinya.\n` +
      `5. Hormati admin grup.\n\n` +
      `🤖 ${BOT_NAME}`
    );

    return true;
  }

  // ===================================================
  // OWNER
  // ===================================================

  if (
    command === "owner"
  ) {
    await sendText(
      chat,
      `👑 *OWNER ${BOT_NAME}*\n\n` +
      `@${OWNER_NUMBER}`,
      {
        mentions: [
          userJid(
            OWNER_NUMBER
          )
        ]
      }
    );

    return true;
  }

  if (
    command === "cekowner"
  ) {
    await sendText(
      chat,
      `👑 Owner: ${OWNER_NUMBER}`
    );

    return true;
  }

  if (
    command === "setowner"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Command owner only."
      );

      return true;
    }

    const number =
      String(
        args[0] || ""
      ).replace(
        /\D/g,
        ""
      );

    if (
      !number
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}setowner 628xxxx`
      );

      return true;
    }

    db.settings.owner =
      number;

    saveDB();

    await sendText(
      chat,
      `✅ Owner database diubah menjadi ${number}`
    );

    return true;
  }

  if (
    command === "public"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Owner only."
      );

      return true;
    }

    publicMode = true;

    await sendText(
      chat,
      "🌐 Public mode aktif."
    );

    return true;
  }

  if (
    command === "self"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Owner only."
      );

      return true;
    }

    publicMode = false;

    await sendText(
      chat,
      "🔒 Self mode aktif. Hanya owner yang dapat menggunakan command."
    );

    return true;
  }

  // ===================================================
  // BAN USER
  // ===================================================

  if (
    command === "ban"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Owner only."
      );

      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    const number =
      jidNumber(target);

    if (
      !number
    ) {
      await sendText(
        chat,
        "❌ Nomor target tidak ditemukan."
      );

      return true;
    }

    if (
      number ===
      OWNER_NUMBER
    ) {
      await sendText(
        chat,
        "❌ Owner tidak dapat dibanned."
      );

      return true;
    }

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

    await sendText(
      chat,
      `🚫 ${mentionUser(
        target
      )} berhasil dibanned.`,
      {
        mentions: [
          target
        ]
      }
    );

    return true;
  }

  if (
    command === "unban"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Owner only."
      );

      return true;
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
        item =>
          item !== number
      );

    saveDB();

    await sendText(
      chat,
      `✅ ${number} berhasil di-unban.`
    );

    return true;
  }

  if (
    command === "listban"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Owner only."
      );

      return true;
    }

    if (
      db.banned.length === 0
    ) {
      await sendText(
        chat,
        "✅ Tidak ada user yang dibanned."
      );

      return true;
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
      `🚫 *LIST BAN*\n\n${list}`
    );

    return true;
  }

  // ===================================================
  // ADD BALANCE
  // ===================================================

  if (
    command === "addbalance"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Owner only."
      );

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
          item =>
            /^\d+$/.test(
              String(item)
            )
        )
      );

    if (
      !amount ||
      amount <= 0
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addbalance @user 10000`
      );

      return true;
    }

    const total =
      addBalance(
        target,
        amount
      );

    await sendText(
      chat,
      `✅ Saldo berhasil ditambahkan.\n\n` +
      `👤 ${mentionUser(
        target
      )}\n` +
      `💰 Tambahan: ${formatRupiah(
        amount
      )}\n` +
      `💵 Total: ${formatRupiah(
        total
      )}`,
      {
        mentions: [
          target
        ]
      }
    );

    return true;
  }

  // ===================================================
  // ADD LIMIT
  // ===================================================

  if (
    command === "addlimit"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Owner only."
      );

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
          item =>
            /^\d+$/.test(
              String(item)
            )
        )
      );

    if (
      !amount ||
      amount <= 0
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addlimit @user 10`
      );

      return true;
    }

    const total =
      addLimit(
        target,
        amount
      );

    await sendText(
      chat,
      `✅ Limit berhasil ditambahkan.\n\n` +
      `👤 ${mentionUser(
        target
      )}\n` +
      `🎟️ Tambahan: ${amount}\n` +
      `🎟️ Total: ${total}`,
      {
        mentions: [
          target
        ]
      }
    );

    return true;
  }

  // ===================================================
  // PREMIUM
  // ===================================================

  if (
    command === "premium"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Command ini khusus owner."
      );

      return true;
    }

    const target =
      targetFromMessage(
        message,
        args.slice(1)
      );

    const days =
      Number(
        args.find(
          item =>
            /^\d+$/.test(
              String(item)
            )
        )
      );

    if (
      !days ||
      days <= 0
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}premium @user 30`
      );

      return true;
    }

    activatePremium(
      target,
      days
    );

    await sendText(
      chat,
      `💎 *PREMIUM AKTIF*\n\n` +
      `👤 ${mentionUser(
        target
      )}\n` +
      `⏳ Durasi: ${days} hari\n` +
      `📅 Sampai: ${formatDate(
        getUser(target)
          .premiumUntil
      )}`,
      {
        mentions: [
          target
        ]
      }
    );

    return true;
  }

  if (
    command === "addpremium"
  ) {
    if (
      !isOwner(sender)
    ) {
      await sendText(
        chat,
        "❌ Owner only."
      );

      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    const days =
      Number(
        args.find(
          item =>
            /^\d+$/.test(
              String(item)
            )
        )
      ) || 30;

    activatePremium(
      target,
      days
    );

    await sendText(
      chat,
      `💎 Premium aktif selama ${days} hari untuk ${mentionUser(
        target
      )}.`,
      {
        mentions: [
          target
        ]
      }
    );

    return true;
  }

  if (
    command === "cekpremium"
  ) {
    const target =
      targetFromMessage(
        message,
        args
      );

    const targetUser =
      getUser(target);

    if (
      isPremium(target)
    ) {
      await sendText(
        chat,
        `💎 *PREMIUM AKTIF*\n\n` +
        `👤 ${mentionUser(
          target
        )}\n` +
        `📅 Sampai: ${formatDate(
          targetUser.premiumUntil
        )}`,
        {
          mentions: [
            target
          ]
        }
      );
    } else {
      await sendText(
        chat,
        `❌ ${mentionUser(
          target
        )} belum premium.`,
        {
          mentions: [
            target
          ]
        }
      );
    }

    return true;
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

    return true;
  }

  if (
    command === "topup"
  ) {
    const amount =
      Number(
        args[0]
      );

    if (
      !amount ||
      amount < 1000
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}topup 10000\n\nMinimal topup Rp1.000.`
      );

      return true;
    }

    await sendText(
      chat,
      `💳 *TOP UP SALDO*\n\n` +
      `Nominal: ${formatRupiah(
        amount
      )}\n\n` +
      `Silakan hubungi owner untuk pembayaran QRIS:\n` +
      `👑 @${OWNER_NUMBER}`,
      {
        mentions: [
          userJid(
            OWNER_NUMBER
          )
        ]
      }
    );

    return true;
  }

  if (
    command === "order" ||
    command === "buy" ||
    command === "beli"
  ) {
    const product =
      findProduct(
        args[0]
      );

    if (!product) {
      await sendText(
        chat,
        `❌ Produk tidak ditemukan.\n\n${productListText()}`
      );

      return true;
    }

    const balance =
      getBalance(sender);

    if (
      balance <
      product.price
    ) {
      await sendText(
        chat,
        `❌ Saldo tidak cukup.\n\n` +
        `Produk: ${product.name}\n` +
        `Harga: ${formatRupiah(
          product.price
        )}\n` +
        `Saldo: ${formatRupiah(
          balance
        )}`
      );

      return true;
    }

    const paid =
      removeBalance(
        sender,
        product.price
      );

    if (!paid) {
      await sendText(
        chat,
        "❌ Transaksi gagal."
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
      `✅ *ORDER DIBUAT*\n\n` +
      `🧾 ID: ${order.id}\n` +
      `📦 Produk: ${order.productName}\n` +
      `💰 Harga: ${formatRupiah(
        order.price
      )}\n` +
      `📌 Status: PENDING\n\n` +
      `Silakan tunggu proses dari owner.`
    );

    return true;
  }

  if (
    command === "cekorder" ||
    command === "orderstatus"
  ) {
    const order =
      getOrder(
        args[0]
      );

    if (!order) {
      await sendText(
        chat,
        `❌ Order tidak ditemukan.\n\nContoh:\n${PREFIX}cekorder ZSxxxx`
      );

      return true;
    }

    await sendText(
      chat,
      `🧾 *ORDER*\n\n` +
      `ID: ${order.id}\n` +
      `📦 ${order.productName}\n` +
      `💰 ${formatRupiah(
        order.price
      )}\n` +
      `📌 ${order.status.toUpperCase()}\n` +
      `📅 ${formatDate(
        order.createdAt
      )}`
    );

    return true;
  }

  // ===================================================
  // AI
  // ===================================================

  if (
    command === "ai" ||
    command === "openai" ||
    command === "bard" ||
    command === "nexara"
  ) {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}${command} halo`
      );

      return true;
    }

    await sendText(
      chat,
      `🤖 *${command.toUpperCase()}*\n\n` +
      `Pertanyaan:\n${text}\n\n` +
      `⚠️ AI API belum dipasang pada server.`
    );

    return true;
  }

  if (
    command === "aiimage"
  ) {
    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}aiimage kucing anime`
      );

      return true;
    }

    await sendText(
      chat,
      `🎨 *AI IMAGE*\n\n` +
      `Prompt: ${text}\n\n` +
      `⚠️ Generator gambar membutuhkan API image generator.`
    );

    return true;
  }

  // ===================================================
  // TRANSLATE
  // ===================================================

  if (
    command === "translate"
  ) {
    return false;
  }

  // ===================================================
  // OWNER UNKNOWN COMMAND
  // ===================================================

  console.log(
    `[COMMAND] ${command} | ${sender}`
  );

  return false;
}

// =====================================================
// PART 3 LOADED
// =====================================================

console.log(
  "========================================"
);

console.log(
  `⚙️ ${BOT_NAME} PART 3 LOADED`
);

console.log(
  "👑 Owner command siap."
);

console.log(
  "🛍️ Store command siap."
);

console.log(
  "💎 Premium command siap."
);

console.log(
  "========================================"
);
// =====================================================
// ZAZABOT - PART 4
// STICKER + BRAT + SEARCH + DOWNLOAD + TOOLS
// =====================================================

// =====================================================
// DOWNLOAD MEDIA
// =====================================================

async function downloadMedia(
  content,
  type
) {
  try {
    const {
      downloadContentFromMessage
    } = await import(
      "@whiskeysockets/baileys"
    );

    if (!content) {
      throw new Error(
        "Media tidak ditemukan."
      );
    }

    const stream =
      await downloadContentFromMessage(
        content,
        type
      );

    const chunks = [];

    for await (
      const chunk of stream
    ) {
      chunks.push(chunk);
    }

    return Buffer.concat(
      chunks
    );

  } catch (error) {
    console.error(
      "MEDIA ERROR:",
      error
    );

    throw new Error(
      "Gagal mengambil media."
    );
  }
}

// =====================================================
// GET QUOTED MESSAGE
// =====================================================

function getQuotedMessage(
  message
) {
  return (
    message?.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.quotedMessage ||
    null
  );
}

// =====================================================
// CREATE STICKER
// =====================================================

async function makeStaticSticker(
  buffer
) {
  try {
    const {
      Sticker,
      StickerTypes
    } = await import(
      "wa-sticker-formatter"
    );

    const sticker =
      new Sticker(
        buffer,
        {
          pack: "ZazaBot",
          author: "Zaza Store",
          type:
            StickerTypes.FULL,
          quality: 80
        }
      );

    return await sticker.toBuffer();

  } catch (error) {
    console.error(
      "STICKER ERROR:",
      error
    );

    throw new Error(
      "Gagal membuat sticker."
    );
  }
}

// =====================================================
// TEXT TO STICKER
// =====================================================

async function textSticker(
  text
) {
  try {
    const sharp =
      (await import("sharp"))
        .default;

    const safeText =
      String(text || "")
        .replace(
          /&/g,
          "&amp;"
        )
        .replace(
          /</g,
          "&lt;"
        )
        .replace(
          />/g,
          "&gt;"
        )
        .slice(0, 80);

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
    fill="white"
  />

  <text
    x="256"
    y="256"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Arial"
    font-size="42"
    font-weight="bold"
    fill="black"
  >
    ${safeText}
  </text>
</svg>
`;

    const png =
      await sharp(
        Buffer.from(svg)
      )
      .png()
      .toBuffer();

    return await makeStaticSticker(
      png
    );

  } catch (error) {
    console.error(
      "TEXT STICKER ERROR:",
      error
    );

    throw new Error(
      "Gagal membuat text sticker."
    );
  }
}

// =====================================================
// BRAT
// =====================================================

async function createBratSticker(
  text
) {
  try {
    const sharp =
      (await import("sharp"))
        .default;

    const safeText =
      String(text || "")
        .replace(
          /&/g,
          "&amp;"
        )
        .replace(
          /</g,
          "&lt;"
        )
        .replace(
          />/g,
          "&gt;"
        )
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
    fill="white"
  />

  <text
    x="35"
    y="70"
    font-family="Arial"
    font-size="38"
    font-weight="bold"
    fill="black"
  >
    ${safeText}
  </text>
</svg>
`;

    const png =
      await sharp(
        Buffer.from(svg)
      )
      .png()
      .toBuffer();

    return await makeStaticSticker(
      png
    );

  } catch (error) {
    console.error(
      "BRAT ERROR:",
      error
    );

    throw new Error(
      "Gagal membuat Brat."
    );
  }
}

// =====================================================
// QR CODE
// =====================================================

async function sendQR(
  chat,
  data,
  quoted = null
) {
  try {
    const buffer =
      await QRCode.toBuffer(
        String(data),
        {
          width: 700,
          margin: 3,
          errorCorrectionLevel:
            "H"
        }
      );

    await sock.sendMessage(
      chat,
      {
        image: buffer,
        caption:
          `📱 *QR CODE*\n\n${data}`
      },
      quoted
        ? {
            quoted
          }
        : {}
    );

  } catch (error) {
    await sendText(
      chat,
      `❌ QR Code gagal.\n${error.message}`
    );
  }
}

// =====================================================
// SHORT LINK
// =====================================================

async function tinyUrl(
  url
) {
  try {
    const api =
      "https://tinyurl.com/api-create.php?url=" +
      encodeURIComponent(url);

    const response =
      await fetch(api);

    if (!response.ok) {
      return url;
    }

    const result =
      await response.text();

    return (
      result.trim() ||
      url
    );

  } catch {
    return url;
  }
}

// =====================================================
// WIKIPEDIA
// =====================================================

async function wikipediaSearch(
  query
) {
  try {
    const api =
      "https://id.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(
        query
      );

    const response =
      await fetch(api);

    if (!response.ok) {
      throw new Error(
        "Artikel tidak ditemukan."
      );
    }

    const data =
      await response.json();

    return (
      `📚 *WIKIPEDIA*\n\n` +
      `📌 ${data.title || query}\n\n` +
      `${data.extract || "Tidak ada ringkasan."}\n\n` +
      `${data.content_urls?.desktop?.page || ""}`
    );

  } catch (error) {
    return (
      `❌ Wikipedia gagal.\n\n${error.message}`
    );
  }
}

// =====================================================
// GOOGLE SEARCH
// =====================================================

async function googleSearch(
  query
) {
  const url =
    "https://www.google.com/search?q=" +
    encodeURIComponent(query);

  return (
    `🔎 *GOOGLE SEARCH*\n\n` +
    `Query: ${query}\n\n` +
    `${url}`
  );
}

// =====================================================
// GOOGLE IMAGE
// =====================================================

async function googleImageSearch(
  query
) {
  const url =
    "https://www.google.com/search?tbm=isch&q=" +
    encodeURIComponent(query);

  return (
    `🖼️ *GOOGLE IMAGE*\n\n` +
    `Query: ${query}\n\n` +
    `${url}`
  );
}

// =====================================================
// YOUTUBE SEARCH
// =====================================================

async function youtubeSearch(
  query
) {
  const url =
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(query);

  return (
    `▶️ *YOUTUBE SEARCH*\n\n` +
    `Query: ${query}\n\n` +
    `${url}`
  );
}

// =====================================================
// LIRIK
// =====================================================

async function lyricSearch(
  query
) {
  const url =
    "https://www.google.com/search?q=" +
    encodeURIComponent(
      query + " lyrics"
    );

  return (
    `🎵 *LIRIK*\n\n` +
    `Judul: ${query}\n\n` +
    `🔎 ${url}`
  );
}

// =====================================================
// TIKTOK DOWNLOADER
// =====================================================

async function tikwmDownload(
  url
) {
  try {
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
            "url=" +
            encodeURIComponent(url) +
            "&hd=1"
        }
      );

    if (!response.ok) {
      throw new Error(
        "Server TikTok tidak merespons."
      );
    }

    const data =
      await response.json();

    if (
      !data.data
    ) {
      throw new Error(
        "Data TikTok tidak ditemukan."
      );
    }

    return data.data;

  } catch (error) {
    console.error(
      "TIKTOK ERROR:",
      error
    );

    throw new Error(
      "Gagal mengambil video TikTok."
    );
  }
}

// =====================================================
// HANDLE PART 4
// =====================================================

async function handleCommandPart4(
  message,
  command,
  args,
  text
) {
  const chat =
    getChat(message);

  try {

    // =================================================
    // BRAT
    // =================================================

    if (
      command === "brat"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}brat zaza baik`
        );

        return true;
      }

      await sendText(
        chat,
        "⏳ Membuat Brat..."
      );

      const sticker =
        await createBratSticker(
          text
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

      return true;
    }

    // =================================================
    // STICKER
    // =================================================

    if (
      command === "sticker" ||
      command === "s"
    ) {
      let image =
        message.message
          ?.imageMessage;

      const quoted =
        getQuotedMessage(
          message
        );

      if (
        !image &&
        quoted?.imageMessage
      ) {
        image =
          quoted.imageMessage;
      }

      if (!image) {
        await sendText(
          chat,
          `⚠️ Kirim/reply gambar dengan:\n${PREFIX}sticker`
        );

        return true;
      }

      await sendText(
        chat,
        "⏳ Membuat sticker..."
      );

      try {
        const buffer =
          await downloadMedia(
            image,
            "image"
          );

        const sticker =
          await makeStaticSticker(
            buffer
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
          `❌ Sticker gagal.\n\n${error.message}`
        );
      }

      return true;
    }

    // =================================================
    // TTP
    // =================================================

    if (
      command === "ttp"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}ttp ZazaBot`
        );

        return true;
      }

      const sticker =
        await textSticker(
          text
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

      return true;
    }

    // =================================================
    // ATTP
    // =================================================

    if (
      command === "attp"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}attp ZazaBot`
        );

        return true;
      }

      const sticker =
        await textSticker(
          text
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

      return true;
    }

    // =================================================
    // TO IMAGE
    // =================================================

    if (
      command === "toimg"
    ) {
      const quoted =
        getQuotedMessage(
          message
        );

      if (
        !quoted?.stickerMessage
      ) {
        await sendText(
          chat,
          `⚠️ Reply sticker dengan:\n${PREFIX}toimg`
        );

        return true;
      }

      try {
        const buffer =
          await downloadMedia(
            quoted.stickerMessage,
            "sticker"
          );

        await sock.sendMessage(
          chat,
          {
            image: buffer,
            caption:
              "🖼️ Sticker berhasil diubah menjadi gambar."
          },
          {
            quoted: message
          }
        );

      } catch (error) {
        await sendText(
          chat,
          `❌ Gagal mengubah sticker.\n${error.message}`
        );
      }

      return true;
    }

    // =================================================
    // GOOGLE
    // =================================================

    if (
      command === "google"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}google Zaza Store`
        );

        return true;
      }

      await sendText(
        chat,
        await googleSearch(
          text
        )
      );

      return true;
    }

    // =================================================
    // GOOGLE IMAGE
    // =================================================

    if (
      command === "googleimage"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}googleimage anime`
        );

        return true;
      }

      await sendText(
        chat,
        await googleImageSearch(
          text
        )
      );

      return true;
    }

    // =================================================
    // WIKIPEDIA
    // =================================================

    if (
      command === "wikipedia"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}wikipedia Indonesia`
        );

        return true;
      }

      await sendText(
        chat,
        await wikipediaSearch(
          text
        )
      );

      return true;
    }

    // =================================================
    // YOUTUBE SEARCH
    // =================================================

    if (
      command === "ytsearch" ||
      command === "play"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}${command} lagu`
        );

        return true;
      }

      await sendText(
        chat,
        await youtubeSearch(
          text
        )
      );

      return true;
    }

    // =================================================
    // LIRIK
    // =================================================

    if (
      command === "lirik"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}lirik judul lagu`
        );

        return true;
      }

      await sendText(
        chat,
        await lyricSearch(
          text
        )
      );

      return true;
    }

    // =================================================
    // QR CODE
    // =================================================

    if (
      command === "qr" ||
      command === "qrcode"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}qrcode Zaza Store`
        );

        return true;
      }

      await sendQR(
        chat,
        text,
        message
      );

      return true;
    }

    // =================================================
    // SHORTLINK
    // =================================================

    if (
      command === "shortlink"
    ) {
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
        await tinyUrl(
          url
        );

      await sendText(
        chat,
        `🔗 *SHORTLINK*\n\n${result}`
      );

      return true;
    }

    // =================================================
    // TRANSLATE
    // =================================================

    if (
      command === "translate"
    ) {
      if (!text) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}translate en halo dunia`
        );

        return true;
      }

      const parts =
        text.split(
          /\s+/
        );

      let lang =
        parts[0];

      let source =
        parts
          .slice(1)
          .join(" ");

      if (
        !source
      ) {
        lang = "en";
        source = text;
      }

      try {
        const api =
          "https://api.mymemory.translated.net/get?q=" +
          encodeURIComponent(
            source
          ) +
          "&langpair=id|" +
          encodeURIComponent(
            lang
          );

        const response =
          await fetch(api);

        const data =
          await response.json();

        const result =
          data?.responseData
            ?.translatedText;

        if (!result) {
          throw new Error(
            "Hasil terjemahan kosong."
          );
        }

        await sendText(
          chat,
          `🌐 *TRANSLATE*\n\n` +
          `🇮🇩 ${source}\n\n` +
          `➡️ ${result}`
        );

      } catch (error) {
        await sendText(
          chat,
          `❌ Translate gagal.\n${error.message}`
        );
      }

      return true;
    }

    // =================================================
    // TIKTOK
    // =================================================

    if (
      command === "tiktok" ||
      command === "tiktoknowm" ||
      command === "tiktokwm"
    ) {
      const url =
        extractUrl(text);

      if (!url) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}tiktoknowm https://vt.tiktok.com/xxxxx`
        );

        return true;
      }

      if (
        !url.includes(
          "tiktok.com"
        )
      ) {
        await sendText(
          chat,
          "❌ Link bukan TikTok."
        );

        return true;
      }

      await sendText(
        chat,
        "⏳ Mengambil video TikTok..."
      );

      try {
        const data =
          await tikwmDownload(
            url
          );

        const video =
          data.hdplay ||
          data.play;

        if (!video) {
          throw new Error(
            "Link video tidak ditemukan."
          );
        }

        await sock.sendMessage(
          chat,
          {
            video: {
              url: video
            },

            caption:
              `🎵 *TIKTOK DOWNLOADER*\n\n` +
              `✅ Berhasil`
          },
          {
            quoted: message
          }
        );

      } catch (error) {
        await sendText(
          chat,
          `❌ TikTok gagal.\n\n${error.message}`
        );
      }

      return true;
    }

    // =================================================
    // TIKTOK MUSIC
    // =================================================

    if (
      command === "tiktokmusic"
    ) {
      const url =
        extractUrl(text);

      if (!url) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}tiktokmusic https://vt.tiktok.com/xxxxx`
        );

        return true;
      }

      try {
        const data =
          await tikwmDownload(
            url
          );

        const music =
          data.music;

        if (!music) {
          throw new Error(
            "Audio tidak ditemukan."
          );
        }

        await sock.sendMessage(
          chat,
          {
            audio: {
              url: music
            },

            mimetype:
              "audio/mpeg"
          },
          {
            quoted: message
          }
        );

      } catch (error) {
        await sendText(
          chat,
          `❌ Audio TikTok gagal.\n\n${error.message}`
        );
      }

      return true;
    }

    // =================================================
    // SCREENSHOT
    // =================================================

    if (
      command === "screenshot"
    ) {
      const url =
        extractUrl(text);

      if (!url) {
        await sendText(
          chat,
          `Contoh:\n${PREFIX}screenshot https://google.com`
        );

        return true;
      }

      const api =
        "https://image.thum.io/get/fullpage/" +
        url;

      try {
        await sock.sendMessage(
          chat,
          {
            image: {
              url: api
            },

            caption:
              `📸 Screenshot\n${url}`
          },
          {
            quoted: message
          }
        );

      } catch {
        await sendText(
          chat,
          "❌ Screenshot gagal."
        );
      }

      return true;
    }

    // =================================================
    // REMOVE BACKGROUND
    // =================================================

    if (
      command === "removebg" ||
      command ===
        "removebackground"
    ) {
      await sendText(
        chat,
        "⚠️ Fitur Remove Background membutuhkan API khusus."
      );

      return true;
    }

    // =================================================
    // OCR
    // =================================================

    if (
      command === "ocr"
    ) {
      await sendText(
        chat,
        "⚠️ OCR membutuhkan API OCR."
      );

      return true;
    }

    // =================================================
    // COMMAND BELUM TERSEDIA
    // =================================================

    const belumTersedia = [
      "facebook",
      "igdl",
      "igreel",
      "igtv",
      "igstory",
      "pindl",
      "threads",
      "twitterdl",
      "douyin",
      "mediafire",
      "spotify",
      "ytmp3",
      "ytmp4",
      "otakudesudl",
      "tourl",
      "tomp3",
      "tovn",
      "upscale",
      "tts",
      "qrcodereader"
    ];

    if (
      belumTersedia.includes(
        command
      )
    ) {
      await sendText(
        chat,
        `⚠️ Command *${command}* membutuhkan provider/API tambahan.`
      );

      return true;
    }

    return false;

  } catch (error) {
    console.error(
      "PART 4 ERROR:",
      error
    );

    await sendText(
      chat,
      `❌ Terjadi error:\n${error.message}`
    );

    return true;
  }
}

// =====================================================
// PART 4 LOADED
// =====================================================

console.log(
  "========================================"
);

console.log(
  "🧩 ZazaBot PART 4 LOADED"
);

console.log(
  "🎨 Brat siap."
);

console.log(
  "🖼️ Sticker siap."
);

console.log(
  "🔎 Search siap."
);

console.log(
  "🎵 TikTok downloader siap."
);

console.log(
  "========================================"
);
// =====================================================
// ZAZABOT - PART 5
// GROUP COMMAND + ADMIN + SECURITY
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
  const chat =
    getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const sender =
    getSender(message);

  const group =
    getGroup(chat);

  // ===================================================
  // GROUP INFO
  // ===================================================

  if (
    command === "groupinfo" ||
    command === "groupsetting"
  ) {
    const metadata =
      await getGroupMetadata(
        chat
      );

    const admins =
      metadata.participants.filter(
        p =>
          p.admin === "admin" ||
          p.admin === "superadmin"
      ).length;

    await sendText(
      chat,
      `👥 *GROUP INFO*\n\n` +
      `📌 Nama: ${metadata.subject}\n` +
      `🆔 ID: ${chat}\n` +
      `👤 Member: ${metadata.participants.length}\n` +
      `👑 Admin: ${admins}\n\n` +
      `🔗 Welcome: ${
        group.welcome
          ? "ON"
          : "OFF"
      }\n` +
      `🔗 Goodbye: ${
        group.goodbye
          ? "ON"
          : "OFF"
      }\n` +
      `🚫 Antilink: ${
        group.antilink
          ? "ON"
          : "OFF"
      }\n` +
      `⚠️ Antibadword: ${
        group.antibadword
          ? "ON"
          : "OFF"
      }`
    );

    return true;
  }

  // ===================================================
  // CEK ID GROUP
  // ===================================================

  if (
    command === "cekidgroup"
  ) {
    await sendText(
      chat,
      `🆔 *GROUP ID*\n\n${chat}`
    );

    return true;
  }

  // ===================================================
  // LINK GROUP
  // ===================================================

  if (
    command === "linkgc" ||
    command === "linkgroup"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !(await needBotAdmin(
        message
      ))
    ) {
      return true;
    }

    try {
      const code =
        await sock.groupInviteCode(
          chat
        );

      await sendText(
        chat,
        `🔗 *LINK GROUP*\n\nhttps://chat.whatsapp.com/${code}`
      );

    } catch (error) {
      await sendText(
        chat,
        `❌ Gagal mengambil link group.\n${error.message}`
      );
    }

    return true;
  }

  // ===================================================
  // REVOKE LINK
  // ===================================================

  if (
    command === "revokelink"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !(await needBotAdmin(
        message
      ))
    ) {
      return true;
    }

    try {
      await sock.groupRevokeInvite(
        chat
      );

      await sendText(
        chat,
        "✅ Link group berhasil diperbarui."
      );

    } catch (error) {
      await sendText(
        chat,
        `❌ Gagal memperbarui link.\n${error.message}`
      );
    }

    return true;
  }

  // ===================================================
  // LIST ADMIN
  // ===================================================

  if (
    command === "groupadmin" ||
    command === "listadmin"
  ) {
    const metadata =
      await getGroupMetadata(
        chat
      );

    const admins =
      metadata.participants.filter(
        p =>
          p.admin === "admin" ||
          p.admin === "superadmin"
      );

    if (
      admins.length === 0
    ) {
      await sendText(
        chat,
        "❌ Admin tidak ditemukan."
      );

      return true;
    }

    const mentions =
      admins.map(
        p => p.id
      );

    const list =
      admins
        .map(
          (p, i) =>
            `${i + 1}. @${jidNumber(
              p.id
            )}`
        )
        .join("\n");

    await sendText(
      chat,
      `👑 *GROUP ADMIN*\n\n${list}`,
      {
        mentions
      }
    );

    return true;
  }

  // ===================================================
  // TAG ADMIN
  // ===================================================

  if (
    command === "tagadmin"
  ) {
    const metadata =
      await getGroupMetadata(
        chat
      );

    const admins =
      metadata.participants.filter(
        p =>
          p.admin === "admin" ||
          p.admin === "superadmin"
      );

    const mentions =
      admins.map(
        p => p.id
      );

    await sendText(
      chat,
      `📢 *TAG ADMIN*\n\n${admins
        .map(
          p =>
            `@${jidNumber(
              p.id
            )}`
        )
        .join(" ")}`,
      {
        mentions
      }
    );

    return true;
  }

  // ===================================================
  // TAG ALL
  // ===================================================

  if (
    command === "tagall" ||
    command === "hidetag"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    const metadata =
      await getGroupMetadata(
        chat
      );

    const participants =
      metadata.participants;

    const mentions =
      participants.map(
        p => p.id
      );

    let body =
      text ||
      "📢 TAG ALL";

    if (
      command === "tagall"
    ) {
      body =
        `📢 *TAG ALL*\n\n${participants
          .map(
            p =>
              `@${jidNumber(
                p.id
              )}`
          )
          .join("\n")}\n\n` +
        `${text || ""}`;
    }

    await sendText(
      chat,
      body,
      {
        mentions
      }
    );

    return true;
  }

  // ===================================================
  // ADD MEMBER
  // ===================================================

  if (
    command === "add"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !(await needBotAdmin(
        message
      ))
    ) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    if (
      !target
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}add 628xxxx`
      );

      return true;
    }

    try {
      await sock.groupParticipantsUpdate(
        chat,
        [target],
        "add"
      );

      await sendText(
        chat,
        `✅ Berhasil menambahkan @${jidNumber(
          target
        )}`,
        {
          mentions: [
            target
          ]
        }
      );

    } catch (error) {
      await sendText(
        chat,
        `❌ Gagal menambahkan member.\n${error.message}`
      );
    }

    return true;
  }

  // ===================================================
  // KICK
  // ===================================================

  if (
    command === "kick" ||
    command === "banmember"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !(await needBotAdmin(
        message
      ))
    ) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    if (
      !target
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}kick @user`
      );

      return true;
    }

    if (
      isOwner(target)
    ) {
      await sendText(
        chat,
        "❌ Owner tidak dapat dikeluarkan."
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
        `🚫 @${jidNumber(
          target
        )} dikeluarkan dari group.`,
        {
          mentions: [
            target
          ]
        }
      );

    } catch (error) {
      await sendText(
        chat,
        `❌ Gagal kick member.\n${error.message}`
      );
    }

    return true;
  }

  // ===================================================
  // UNBAN MEMBER
  // ===================================================

  if (
    command === "unbanmember"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    if (
      !target
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}unbanmember 628xxxx`
      );

      return true;
    }

    const number =
      jidNumber(target);

    db.banned =
      db.banned.filter(
        n =>
          n !== number
      );

    saveDB();

    await sendText(
      chat,
      `✅ ${number} dihapus dari daftar ban bot.`
    );

    return true;
  }

  // ===================================================
  // KICK ME
  // ===================================================

  if (
    command === "kickme"
  ) {
    if (
      !(await needBotAdmin(
        message
      ))
    ) {
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
        `❌ Gagal keluar.\n${error.message}`
      );
    }

    return true;
  }

  // ===================================================
  // PROMOTE
  // ===================================================

  if (
    command === "promote"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !(await needBotAdmin(
        message
      ))
    ) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    try {
      await sock.groupParticipantsUpdate(
        chat,
        [target],
        "promote"
      );

      await sendText(
        chat,
        `👑 @${jidNumber(
          target
        )} sekarang menjadi admin.`,
        {
          mentions: [
            target
          ]
        }
      );

    } catch (error) {
      await sendText(
        chat,
        `❌ Gagal promote.\n${error.message}`
      );
    }

    return true;
  }

  // ===================================================
  // DEMOTE
  // ===================================================

  if (
    command === "demote"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !(await needBotAdmin(
        message
      ))
    ) {
      return true;
    }

    const target =
      targetFromMessage(
        message,
        args
      );

    try {
      await sock.groupParticipantsUpdate(
        chat,
        [target],
        "demote"
      );

      await sendText(
        chat,
        `⬇️ @${jidNumber(
          target
        )} bukan admin lagi.`,
        {
          mentions: [
            target
          ]
        }
      );

    } catch (error) {
      await sendText(
        chat,
        `❌ Gagal demote.\n${error.message}`
      );
    }

    return true;
  }

  // ===================================================
  // SET NAME
  // ===================================================

  if (
    command === "setnamegc" ||
    command === "setname"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !(await needBotAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !text
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}setnamegc Nama Baru`
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
        "✅ Nama group berhasil diubah."
      );

    } catch (error) {
      await sendText(
        chat,
        `❌ Gagal mengubah nama.\n${error.message}`
      );
    }

    return true;
  }

  // ===================================================
  // SET DESCRIPTION
  // ===================================================

  if (
    command === "setdescgc" ||
    command === "descgc"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !(await needBotAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !text
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}setdescgc Deskripsi group`
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
        "✅ Deskripsi group berhasil diubah."
      );

    } catch (error) {
      await sendText(
        chat,
        `❌ Gagal mengubah deskripsi.\n${error.message}`
      );
    }

    return true;
  }

  // ===================================================
  // WELCOME
  // ===================================================

  if (
    command === "welcome"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.welcome =
      !group.welcome;

    saveDB();

    await sendText(
      chat,
      `👋 Welcome: ${
        group.welcome
          ? "ON"
          : "OFF"
      }`
    );

    return true;
  }

  // ===================================================
  // GOODBYE / LEFT
  // ===================================================

  if (
    command === "goodbye" ||
    command === "setleft"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.goodbye =
      !group.goodbye;

    saveDB();

    await sendText(
      chat,
      `👋 Goodbye: ${
        group.goodbye
          ? "ON"
          : "OFF"
      }`
    );

    return true;
  }

  // ===================================================
  // SET WELCOME
  // ===================================================

  if (
    command === "setwelcome"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.welcome =
      true;

    if (
      text
    ) {
      group.welcomeText =
        text;
    }

    saveDB();

    await sendText(
      chat,
      `✅ Welcome aktif.\n\nPesan:\n${
        group.welcomeText ||
        "Selamat datang @user!"
      }`
    );

    return true;
  }

  // ===================================================
  // ANTILINK
  // ===================================================

  if (
    command === "antilink"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antilink =
      true;

    group.antilinkKick =
      true;

    saveDB();

    await sendText(
      chat,
      "🔗 Antilink aktif + kick."
    );

    return true;
  }

  if (
    command === "antilinknokick"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antilink =
      true;

    group.antilinkKick =
      false;

    saveDB();

    await sendText(
      chat,
      "🔗 Antilink aktif tanpa kick."
    );

    return true;
  }

  if (
    command === "antilinkchannel"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antilinkChannel =
      !group.antilinkChannel;

    saveDB();

    await sendText(
      chat,
      `🔗 Antilink Channel: ${
        group.antilinkChannel
          ? "ON"
          : "OFF"
      }`
    );

    return true;
  }

  // ===================================================
  // ANTIBADWORD
  // ===================================================

  if (
    command === "antibadword"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antibadword =
      true;

    group.antibadwordKick =
      true;

    saveDB();

    await sendText(
      chat,
      "🚫 Antibadword aktif + kick."
    );

    return true;
  }

  if (
    command === "antibadwordnokick"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antibadword =
      true;

    group.antibadwordKick =
      false;

    saveDB();

    await sendText(
      chat,
      "🚫 Antibadword aktif tanpa kick."
    );

    return true;
  }

  // ===================================================
  // ADD BADWORD
  // ===================================================

  if (
    command === "addbadword"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    if (
      !text
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addbadword kata1,kata2`
      );

      return true;
    }

    const words =
      text
        .split(",")
        .map(
          word =>
            cleanText(
              word
            )
        )
        .filter(Boolean);

    group.badwords =
      [
        ...new Set([
          ...group.badwords,
          ...words
        ])
      ];

    saveDB();

    await sendText(
      chat,
      `✅ Badword ditambahkan: ${words.join(
        ", "
      )}`
    );

    return true;
  }

  // ===================================================
  // LIST BADWORD
  // ===================================================

  if (
    command === "listbadword"
  ) {
    await sendText(
      chat,
      group.badwords.length
        ? `🚫 *BADWORD LIST*\n\n${group.badwords
            .map(
              (w, i) =>
                `${i + 1}. ${w}`
            )
            .join("\n")}`
        : "✅ Belum ada badword."
    );

    return true;
  }

  // ===================================================
  // ANTIBOT
  // ===================================================

  if (
    command === "antibot"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antibot =
      !group.antibot;

    saveDB();

    await sendText(
      chat,
      `🤖 Antibot: ${
        group.antibot
          ? "ON"
          : "OFF"
      }`
    );

    return true;
  }

  // ===================================================
  // ANTIDELETE
  // ===================================================

  if (
    command === "antidelete"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antidelete =
      !group.antidelete;

    saveDB();

    await sendText(
      chat,
      `🗑️ Antidelete: ${
        group.antidelete
          ? "ON"
          : "OFF"
      }`
    );

    return true;
  }

  // ===================================================
  // ANTIMENTIONS
  // ===================================================

  if (
    command === "antimentionsw"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antimentionsw =
      !group.antimentionsw;

    saveDB();

    await sendText(
      chat,
      `⚠️ Anti mention: ${
        group.antimentionsw
          ? "ON"
          : "OFF"
      }`
    );

    return true;
  }

  // ===================================================
  // ANTIVIEWONCE
  // ===================================================

  if (
    command === "antiviewonce"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antiviewonce =
      !group.antiviewonce;

    saveDB();

    await sendText(
      chat,
      `👁️ Anti view once: ${
        group.antiviewonce
          ? "ON"
          : "OFF"
      }`
    );

    return true;
  }

  // ===================================================
  // ANTIWAME
  // ===================================================

  if (
    command === "antiwame"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antiwame =
      true;

    group.antiwameKick =
      true;

    saveDB();

    await sendText(
      chat,
      "📵 Anti-WA.me aktif + kick."
    );

    return true;
  }

  if (
    command === "antiwamenokick"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antiwame =
      true;

    group.antiwameKick =
      false;

    saveDB();

    await sendText(
      chat,
      "📵 Anti-WA.me aktif tanpa kick."
    );

    return true;
  }

  // ===================================================
  // ANTILUAR
  // ===================================================

  if (
    command === "antiluar"
  ) {
    if (
      !(await needAdmin(
        message
      ))
    ) {
      return true;
    }

    group.antiluar =
      !group.antiluar;

    saveDB();

    await sendText(
      chat,
      `🌍 Anti luar: ${
        group.antiluar
          ? "ON"
          : "OFF"
      }`
    );

    return true;
  }

  return false;
}

// =====================================================
// PART 5 LOADED
// =====================================================

console.log(
  "========================================"
);

console.log(
  `👥 ${BOT_NAME} PART 5 LOADED`
);

console.log(
  "🛡️ Group security siap."
);

console.log(
  "👑 Admin command siap."
);

console.log(
  "========================================"
);
// =====================================================
// ZAZABOT - PART 6
// WARNING + LIST + POINT + REMINDER + AFK + GAME
// =====================================================

// =====================================================
// WARNING COMMAND
// =====================================================

async function handleWarningCommand(
  message,
  command,
  args
) {
  const chat =
    getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const sender =
    getSender(message);

  const group =
    getGroup(chat);

  // ===================================================
  // WARN
  // ===================================================

  if (
    command === "warn"
  ) {
    if (
      !(await needAdmin(message))
    ) {
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
        `Contoh:\n${PREFIX}warn @user`
      );

      return true;
    }

    if (isOwner(target)) {
      await sendText(
        chat,
        "❌ Owner tidak dapat diberi warn."
      );

      return true;
    }

    const total =
      addWarning(
        chat,
        target
      );

    let extra = "";

    if (total >= 3) {
      if (
        await isBotAdmin(chat)
      ) {
        try {
          await sock.groupParticipantsUpdate(
            chat,
            [target],
            "remove"
          );

          group.warnings[
            jidNumber(target)
          ] = 0;

          saveDB();

          extra =
            "\n🚫 Warn mencapai 3x, member dikeluarkan.";
        } catch (error) {
          extra =
            `\n⚠️ Gagal mengeluarkan member: ${error.message}`;
        }
      } else {
        extra =
          "\n⚠️ Warn mencapai 3x, tetapi bot bukan admin.";
      }
    }

    await sendText(
      chat,
      `⚠️ *WARNING*\n\n` +
      `👤 @${jidNumber(target)}\n` +
      `📊 Warn: ${total}/3${extra}`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  // ===================================================
  // UNWARN
  // ===================================================

  if (
    command === "unwarn"
  ) {
    if (
      !(await needAdmin(message))
    ) {
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
        `Contoh:\n${PREFIX}unwarn @user`
      );

      return true;
    }

    const total =
      removeWarning(
        chat,
        target
      );

    await sendText(
      chat,
      `✅ Warn @${jidNumber(
        target
      )} sekarang: ${total}`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  // ===================================================
  // CEK WARN
  // ===================================================

  if (
    command === "cekwarn"
  ) {
    const target =
      targetFromMessage(
        message,
        args
      );

    const total =
      Number(
        group.warnings[
          jidNumber(target)
        ] || 0
      );

    await sendText(
      chat,
      `⚠️ *CEK WARN*\n\n` +
      `👤 @${jidNumber(target)}\n` +
      `📊 Warn: ${total}/3`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  // ===================================================
  // LIST WARN
  // ===================================================

  if (
    command === "listwarn"
  ) {
    const entries =
      Object.entries(
        group.warnings
      ).filter(
        ([, value]) =>
          Number(value) > 0
      );

    if (!entries.length) {
      await sendText(
        chat,
        "✅ Tidak ada member yang memiliki warn."
      );

      return true;
    }

    const list =
      entries
        .map(
          ([id, value], index) =>
            `${index + 1}. @${id} — ${value}/3`
        )
        .join("\n");

    await sendText(
      chat,
      `⚠️ *LIST WARNING*\n\n${list}`,
      {
        mentions: entries.map(
          ([id]) =>
            userJid(id)
        )
      }
    );

    return true;
  }

  // ===================================================
  // RESET WARN
  // ===================================================

  if (
    command === "resetwarn"
  ) {
    if (
      !(await needAdmin(message))
    ) {
      return true;
    }

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

// =====================================================
// LIST COMMAND
// =====================================================

async function handleListCommand(
  message,
  command,
  args,
  text
) {
  const chat =
    getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const group =
    getGroup(chat);

  // ===================================================
  // ADD LIST
  // ===================================================

  if (
    command === "addlist"
  ) {
    if (
      !(await needAdmin(message))
    ) {
      return true;
    }

    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addlist harga|Rp10.000`
      );

      return true;
    }

    const separator =
      text.includes("|")
        ? "|"
        : ":";

    const parts =
      text.split(separator);

    const name =
      String(
        parts.shift() || ""
      ).trim();

    const value =
      parts
        .join(separator)
        .trim();

    if (!name || !value) {
      await sendText(
        chat,
        `Format salah.\n\nContoh:\n${PREFIX}addlist harga|Rp10.000`
      );

      return true;
    }

    group.lists[name] =
      value;

    saveDB();

    await sendText(
      chat,
      `✅ List berhasil ditambahkan.\n\n📌 ${name}\n📝 ${value}`
    );

    return true;
  }

  // ===================================================
  // UPDATE LIST
  // ===================================================

  if (
    command === "updatelist" ||
    command === "uplist"
  ) {
    if (
      !(await needAdmin(message))
    ) {
      return true;
    }

    if (!text) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}updatelist harga|Rp20.000`
      );

      return true;
    }

    const separator =
      text.includes("|")
        ? "|"
        : ":";

    const parts =
      text.split(separator);

    const name =
      String(
        parts.shift() || ""
      ).trim();

    const value =
      parts
        .join(separator)
        .trim();

    if (!name || !value) {
      await sendText(
        chat,
        "❌ Format tidak valid."
      );

      return true;
    }

    if (
      !group.lists[name]
    ) {
      await sendText(
        chat,
        `❌ List *${name}* belum ada.`
      );

      return true;
    }

    group.lists[name] =
      value;

    saveDB();

    await sendText(
      chat,
      `✅ List *${name}* berhasil diperbarui.`
    );

    return true;
  }

  // ===================================================
  // LIST
  // ===================================================

  if (
    command === "list"
  ) {
    const entries =
      Object.entries(
        group.lists
      );

    if (!entries.length) {
      await sendText(
        chat,
        "📋 Belum ada list."
      );

      return true;
    }

    const list =
      entries
        .map(
          ([name, value], index) =>
            `${index + 1}. *${name}*\n${value}`
        )
        .join("\n\n");

    await sendText(
      chat,
      `📋 *GROUP LIST*\n\n${list}`
    );

    return true;
  }

  return false;
}

// =====================================================
// POINT COMMAND
// =====================================================

async function handlePointCommand(
  message,
  command,
  args
) {
  const chat =
    getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const group =
    getGroup(chat);

  // ===================================================
  // ADD POINT
  // ===================================================

  if (
    command === "addpoin"
  ) {
    if (
      !(await needAdmin(message))
    ) {
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
          item =>
            /^\d+$/.test(
              String(item)
            )
        )
      );

    if (
      !target ||
      !amount ||
      amount <= 0
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addpoin @user 10`
      );

      return true;
    }

    const total =
      addPoint(
        target,
        amount
      );

    if (!group.points) {
      group.points = {};
    }

    group.points[
      jidNumber(target)
    ] = total;

    saveDB();

    await sendText(
      chat,
      `⭐ Point berhasil ditambahkan.\n\n` +
      `👤 @${jidNumber(target)}\n` +
      `➕ ${amount}\n` +
      `🏆 Total: ${total}`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  // ===================================================
  // CEK POINT
  // ===================================================

  if (
    command === "cekpoint"
  ) {
    const target =
      targetFromMessage(
        message,
        args
      );

    const user =
      getUser(target);

    await sendText(
      chat,
      `🏆 *POINT*\n\n` +
      `👤 @${jidNumber(target)}\n` +
      `⭐ ${user.points || 0}`,
      {
        mentions: [target]
      }
    );

    return true;
  }

  // ===================================================
  // LIST POINT
  // ===================================================

  if (
    command === "listpoint"
  ) {
    const entries =
      Object.entries(
        group.points || {}
      );

    if (!entries.length) {
      await sendText(
        chat,
        "🏆 Belum ada data point."
      );

      return true;
    }

    entries.sort(
      (a, b) =>
        Number(b[1]) -
        Number(a[1])
    );

    const list =
      entries
        .map(
          ([id, point], index) =>
            `${index + 1}. @${id} — ${point}`
        )
        .join("\n");

    await sendText(
      chat,
      `🏆 *LEADERBOARD POINT*\n\n${list}`,
      {
        mentions: entries.map(
          ([id]) =>
            userJid(id)
        )
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
  const chat =
    getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const group =
    getGroup(chat);

  // ===================================================
  // ADD REMINDER
  // ===================================================

  if (
    command === "addreminder" ||
    command === "addalarm"
  ) {
    if (
      !(await needAdmin(message))
    ) {
      return true;
    }

    if (
      args.length < 2
    ) {
      await sendText(
        chat,
        `Contoh:\n${PREFIX}addreminder 10m meeting`
      );

      return true;
    }

    const duration =
      parseDuration(
        args[0]
      );

    const reminderText =
      args
        .slice(1)
        .join(" ");

    if (
      !duration ||
      !reminderText
    ) {
      await sendText(
        chat,
        "❌ Format reminder salah."
      );

      return true;
    }

    if (
      !group.reminders
    ) {
      group.reminders = [];
    }

    const reminder = {
      id:
        randomId("REM"),
      text:
        reminderText,
      time:
        Date.now() +
        duration,
      createdBy:
        sender
    };

    group.reminders.push(
      reminder
    );

    saveDB();

    await sendText(
      chat,
      `⏰ *REMINDER DIBUAT*\n\n` +
      `🆔 ${reminder.id}\n` +
      `📝 ${reminder.text}\n` +
      `⏳ ${args[0]}`
    );

    setTimeout(
      async () => {
        try {
          await sendText(
            chat,
            `⏰ *REMINDER*\n\n${reminder.text}`
          );

          group.reminders =
            group.reminders.filter(
              item =>
                item.id !==
                reminder.id
            );

          saveDB();

        } catch (
          error
        ) {
          console.error(
            "REMINDER ERROR:",
            error
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

  // ===================================================
  // LIST REMINDER
  // ===================================================

  if (
    command === "listreminder" ||
    command === "listalarm"
  ) {
    const reminders =
      group.reminders || [];

    if (!reminders.length) {
      await sendText(
        chat,
        "⏰ Tidak ada reminder aktif."
      );

      return true;
    }

    const list =
      reminders
        .map(
          (item, index) =>
            `${index + 1}. ${item.text}\n   🆔 ${item.id}\n   📅 ${formatDate(item.time)}`
        )
        .join("\n\n");

    await sendText(
      chat,
      `⏰ *REMINDER AKTIF*\n\n${list}`
    );

    return true;
  }

  // ===================================================
  // CHECK SCHEDULE
  // ===================================================

  if (
    command === "createschedulecall" ||
    command === "groupschedule"
  ) {
    await sendText(
      chat,
      `📅 *SCHEDULE GROUP*\n\n` +
      `Gunakan:\n` +
      `${PREFIX}addreminder 10m nama agenda\n\n` +
      `Untuk melihat agenda:\n` +
      `${PREFIX}listreminder`
    );

    return true;
  }

  return false;
}

// =====================================================
// AFK COMMAND
// =====================================================

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

  const user =
    getUser(sender);

  if (
    command !== "afk"
  ) {
    return false;
  }

  user.afk = {
    reason:
      text ||
      "AFK",
    time:
      Date.now()
  };

  saveDB();

  await sendText(
    chat,
    `💤 *AFK AKTIF*\n\n` +
    `Alasan: ${
      user.afk.reason
    }`
  );

  return true;
}

// =====================================================
// GAME COMMAND
// =====================================================

async function handleGameCommand(
  message,
  command,
  args
) {
  const chat =
    getChat(message);

  const sender =
    getSender(message);

  // ===================================================
  // STOP GAME
  // ===================================================

  if (
    command === "stopgame" ||
    command === "nyerah"
  ) {
    if (
      stopGame(chat)
    ) {
      await sendText(
        chat,
        "🛑 Game dihentikan."
      );
    } else {
      await sendText(
        chat,
        "❌ Tidak ada game aktif."
      );
    }

    return true;
  }

  // ===================================================
  // ASAH OTAK
  // ===================================================

  if (
    command === "asahotak" ||
    command === "tekateki"
  ) {
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
      `🧠 *ASAH OTAK*\n\n` +
      `${game.question}\n\n` +
      `💡 Jawab pertanyaan ini!`
    );

    return true;
  }

  // ===================================================
  // SUSUN KATA
  // ===================================================

  if (
    command === "susunkata" ||
    command === "tebakkata" ||
    command === "sambungkata"
  ) {
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
      `🔤 *SUSUN KATA*\n\n` +
      `${game.question}`
    );

    return true;
  }

  // ===================================================
  // MATH
  // ===================================================

  if (
    command === "math"
  ) {
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
      `🧮 *MATH GAME*\n\n` +
      `${game.question}\n\n` +
      `Ketik jawabannya.`
    );

    return true;
  }

  // ===================================================
  // TRUTH
  // ===================================================

  if (
    command === "truth"
  ) {
    const questions = [
      "Apa hal yang paling kamu takutkan?",
      "Siapa orang yang paling kamu percaya?",
      "Apa cita-cita terbesar kamu?",
      "Apa kesalahan yang paling kamu sesali?",
      "Apa hal yang belum pernah kamu ceritakan?"
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
      `🟢 *TRUTH*\n\n${question}`
    );

    return true;
  }

  // ===================================================
  // DARE
  // ===================================================

  if (
    command === "dare"
  ) {
    const dares = [
      "Kirim emoji yang paling sering kamu gunakan.",
      "Kirim voice note selama 5 detik.",
      "Tag satu teman di group.",
      "Kirim foto dengan gaya lucu.",
      "Tulis nama panggilanmu."
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
      `🔴 *DARE*\n\n${dare}`
    );

    return true;
  }

  // ===================================================
  // CAKLONTONG
  // ===================================================

  if (
    command === "caklontong"
  ) {
    const games = [
      {
        q:
          "Hewan apa yang paling panjang?",
        a:
          "ular"
      },
      {
        q:
          "Apa yang selalu ada di depan mata tetapi tidak bisa dilihat?",
        a:
          "masa depan"
      },
      {
        q:
          "Apa yang kalau dipotong malah menjadi panjang?",
        a:
          "jalan"
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
      {
        question:
          game.q,
        answer:
          game.a
      }
    );

    await sendText(
      chat,
      `😂 *CAK LONTONG*\n\n${game.q}`
    );

    return true;
  }

  // ===================================================
  // FAMILY 100
  // ===================================================

  if (
    command === "family100"
  ) {
    const games = [
      {
        q:
          "Sebutkan benda yang ada di kamar tidur.",
        answers: [
          "kasur",
          "bantal",
          "selimut",
          "lemari",
          "meja"
        ]
      },
      {
        q:
          "Sebutkan buah berwarna merah.",
        answers: [
          "apel",
          "semangka",
          "stroberi"
        ]
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
      "family100",
      {
        question:
          game.q,
        answers:
          game.answers,
        found: []
      }
    );

    await sendText(
      chat,
      `👨‍👩‍👧‍👦 *FAMILY 100*\n\n${game.q}\n\n` +
      `Jawab salah satu jawaban!`
    );

    return true;
  }

  // ===================================================
  // AKINATOR
  // ===================================================

  if (
    command === "akinator" ||
    command === "akinatorstart"
  ) {
    await sendText(
      chat,
      `🧞 *AKINATOR*\n\n` +
      `Game Akinator membutuhkan API eksternal.\n` +
      `Untuk sementara gunakan game ${PREFIX}asahotak.`
    );

    return true;
  }

  if (
    command === "akinatorstop"
  ) {
    stopGame(chat);

    await sendText(
      chat,
      "🛑 Akinator dihentikan."
    );

    return true;
  }

  // ===================================================
  // TEBAK GAMBAR
  // ===================================================

  if (
    command === "tebakgambar"
  ) {
    await sendText(
      chat,
      "🖼️ Game tebak gambar membutuhkan database gambar."
    );

    return true;
  }

  return false;
}

// =====================================================
// GROUP INFO TAMBAHAN
// =====================================================

async function handleGroupInfoCommand(
  message,
  command
) {
  const chat =
    getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const group =
    getGroup(chat);

  if (
    command === "ceksewa" ||
    command === "ceksewabyid"
  ) {
    await sendText(
      chat,
      `📦 *STATUS SEWA GROUP*\n\n` +
      `🆔 ${chat}\n` +
      `📌 Status: AKTIF\n` +
      `⏳ Sistem sewa siap digunakan.`
    );

    return true;
  }

  if (
    command === "dbinfo"
  ) {
    await sendText(
      chat,
      `💾 *DATABASE GROUP*\n\n` +
      `👥 Group: ${chat}\n` +
      `📋 List: ${
        Object.keys(
          group.lists || {}
        ).length
      }\n` +
      `⚠️ Warning: ${
        Object.keys(
          group.warnings || {}
        ).length
      }\n` +
      `🏆 Point: ${
        Object.keys(
          group.points || {}
        ).length
      }\n` +
      `⏰ Reminder: ${
        (group.reminders || [])
          .length
      }`
    );

    return true;
  }

  return false;
}

// =====================================================
// PART 6 LOADED
// =====================================================

console.log(
  "========================================"
);

console.log(
  `🎮 ${BOT_NAME} PART 6 LOADED`
);

console.log(
  "⚠️ Warning system siap."
);

console.log(
  "📋 List system siap."
);

console.log(
  "🏆 Point system siap."
);

console.log(
  "⏰ Reminder system siap."
);

console.log(
  "💤 AFK system siap."
);

console.log(
  "🎮 Game system siap."
);

console.log(
  "========================================"
);// =====================================================
// ZAZABOT - PART 7
// SECURITY + GAME ANSWER + AFK + GROUP PARTICIPANTS
// =====================================================

// =====================================================
// GROUP SECURITY
// =====================================================

async function handleGroupSecurity(message, text) {
  const chat = getChat(message);

  if (!isGroup(chat)) {
    return false;
  }

  const sender = getSender(message);
  const group = getGroup(chat);

  // Owner dan admin bebas dari sistem anti
  if (isOwner(sender)) {
    return false;
  }

  const admin = await isGroupAdmin(chat, sender);

  if (admin) {
    return false;
  }

  const lower = String(text || "").toLowerCase();

  // ===================================================
  // ANTI LINK GROUP
  // ===================================================

  const groupLink =
    /chat\.whatsapp\.com\//i.test(lower);

  const channelLink =
    /whatsapp\.com\/channel\//i.test(lower);

  if (
    group.antilink &&
    (
      groupLink ||
      (group.antilinkChannel && channelLink)
    )
  ) {
    try {
      await sock.sendMessage(
        chat,
        {
          delete: message.key
        }
      );
    } catch (error) {
      console.log(
        "Gagal delete anti-link:",
        error.message
      );
    }

    const warn = addWarning(
      chat,
      sender
    );

    if (
      group.antilinkKick &&
      warn >= 3 &&
      await isBotAdmin(chat)
    ) {
      try {
        await sock.groupParticipantsUpdate(
          chat,
          [sender],
          "remove"
        );

        removeWarning(
          chat,
          sender
        );

        await sendText(
          chat,
          `🚫 @${jidNumber(sender)} dikeluarkan karena mencapai 3 warning.`,
          {
            mentions: [sender]
          }
        );
      } catch (error) {
        console.log(
          "Gagal kick anti-link:",
          error.message
        );
      }
    } else {
      await sendText(
        chat,
        `🚫 *ANTI LINK*\n\n` +
        `@${jidNumber(sender)}, link WhatsApp tidak diperbolehkan.\n` +
        `⚠️ Warning: ${warn}/3`,
        {
          mentions: [sender]
        }
      );
    }

    saveDB();

    return true;
  }

  // ===================================================
  // ANTI WA.ME
  // ===================================================

  const waMe =
    /wa\.me\//i.test(lower);

  const apiWhatsApp =
    /api\.whatsapp\.com\/send/i.test(lower);

  if (
    group.antiwame &&
    (
      waMe ||
      apiWhatsApp
    )
  ) {
    try {
      await sock.sendMessage(
        chat,
        {
          delete: message.key
        }
      );
    } catch (error) {
      console.log(
        "Gagal delete antiwame:",
        error.message
      );
    }

    const warn = addWarning(
      chat,
      sender
    );

    if (
      group.antiwameKick &&
      warn >= 3 &&
      await isBotAdmin(chat)
    ) {
      try {
        await sock.groupParticipantsUpdate(
          chat,
          [sender],
          "remove"
        );

        removeWarning(
          chat,
          sender
        );

        await sendText(
          chat,
          `🚫 @${jidNumber(sender)} dikeluarkan karena melanggar anti-wa.me.`,
          {
            mentions: [sender]
          }
        );
      } catch (error) {
        console.log(
          "Gagal kick antiwame:",
          error.message
        );
      }
    } else {
      await sendText(
        chat,
        `🚫 @${jidNumber(sender)} link wa.me tidak diperbolehkan.\n` +
        `⚠️ Warning: ${warn}/3`,
        {
          mentions: [sender]
        }
      );
    }

    saveDB();

    return true;
  }

  // ===================================================
  // ANTI BADWORD
  // ===================================================

  if (
    group.antibadword &&
    Array.isArray(group.badwords)
  ) {
    const found =
      group.badwords.find(
        word =>
          word &&
          lower.includes(
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
      } catch (error) {
        console.log(
          "Gagal delete badword:",
          error.message
        );
      }

      const warn = addWarning(
        chat,
        sender
      );

      if (
        group.antibadwordKick &&
        warn >= 3 &&
        await isBotAdmin(chat)
      ) {
        try {
          await sock.groupParticipantsUpdate(
            chat,
            [sender],
            "remove"
          );

          removeWarning(
            chat,
            sender
          );

          await sendText(
            chat,
            `🚫 @${jidNumber(sender)} dikeluarkan karena terlalu banyak pelanggaran.`,
            {
              mentions: [sender]
            }
          );
        } catch (error) {
          console.log(
            "Gagal kick badword:",
            error.message
          );
        }
      } else {
        await sendText(
          chat,
          `⚠️ @${jidNumber(sender)} pesan mengandung kata yang dilarang.\n` +
          `📊 Warning: ${warn}/3`,
          {
            mentions: [sender]
          }
        );
      }

      saveDB();

      return true;
    }
  }

  // ===================================================
  // ANTI MENTION @ALL / MASS MENTION
  // ===================================================

  if (
    group.antimentionsw
  ) {
    const mentions =
      message.message
        ?.extendedTextMessage
        ?.contextInfo
        ?.mentionedJid ||
      [];

    if (
      mentions.length >= 5
    ) {
      try {
        await sock.sendMessage(
          chat,
          {
            delete: message.key
          }
        );
      } catch (error) {
        console.log(
          "Gagal delete mass mention:",
          error.message
        );
      }

      await sendText(
        chat,
        `⚠️ @${jidNumber(sender)} terlalu banyak melakukan mention.`,
        {
          mentions: [sender]
        }
      );

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

  const session =
    gameSessions.get(chat);

  if (!session) {
    return false;
  }

  const sender =
    getSender(message);

  // Hanya pemain yang memulai game
  if (
    sender !== session.player
  ) {
    return false;
  }

  const answer =
    cleanText(text);

  if (!answer) {
    return false;
  }

  let correct = false;

  // ===================================================
  // FAMILY 100
  // ===================================================

  if (
    session.type === "family100"
  ) {
    const answers =
      session.data.answers || [];

    const foundIndex =
      answers.findIndex(
        item =>
          cleanText(item) === answer
      );

    if (
      foundIndex !== -1
    ) {
      if (
        !session.data.found
      ) {
        session.data.found = [];
      }

      if (
        session.data.found.includes(
          foundIndex
        )
      ) {
        return true;
      }

      session.data.found.push(
        foundIndex
      );

      const total =
        answers.length;

      const found =
        session.data.found.length;

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

      if (
        found >= total
      ) {
        stopGame(chat);

        await sendText(
          chat,
          `🎉 *FAMILY 100 SELESAI!*\n\n` +
          `🏆 Semua jawaban ditemukan!\n` +
          `⭐ +5 Point\n` +
          `🎫 +1 Limit\n` +
          `✨ +10 XP`
        );
      } else {
        await sendText(
          chat,
          `✅ Jawaban benar!\n\n` +
          `⭐ +5 Point\n` +
          `🎫 +1 Limit\n` +
          `✨ +10 XP\n\n` +
          `📊 Terjawab: ${found}/${total}`
        );
      }

      saveDB();

      return true;
    }

    return false;
  }

  // ===================================================
  // GAME BIASA
  // ===================================================

  if (
    session.data &&
    session.data.answer
  ) {
    correct =
      cleanText(
        session.data.answer
      ) === answer;
  }

  if (!correct) {
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

  const gameName =
    {
      riddle:
        "ASAH OTAK",
      word:
        "SUSUN KATA",
      math:
        "MATH",
      caklontong:
        "CAK LONTONG"
    }[session.type] ||
    "GAME";

  stopGame(chat);

  await sendText(
    chat,
    `🎉 *JAWABAN BENAR!*\n\n` +
    `🎮 Game: ${gameName}\n` +
    `👤 @${jidNumber(sender)}\n\n` +
    `⭐ +5 Point\n` +
    `🎫 +1 Limit\n` +
    `✨ +10 XP`,
    {
      mentions: [sender]
    }
  );

  saveDB();

  return true;
}

// =====================================================
// AFK SYSTEM
// =====================================================

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

  // ===================================================
  // PEMAIN KEMBALI DARI AFK
  // ===================================================

  if (
    user.afk
  ) {
    const duration =
      formatRuntime(
        Date.now() -
        Number(
          user.afk.time ||
          Date.now()
        )
      );

    const reason =
      user.afk.reason ||
      "Tidak ada alasan";

    user.afk = null;

    saveDB();

    await sendText(
      chat,
      `👋 Selamat datang kembali @${jidNumber(sender)}!\n\n` +
      `💤 AFK selama: ${duration}\n` +
      `📝 Alasan: ${reason}`,
      {
        mentions: [sender]
      }
    );
  }

  // ===================================================
  // CEK MENTION USER AFK
  // ===================================================

  const mentioned =
    message.message
      ?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid ||
    [];

  if (
    !mentioned.length
  ) {
    return;
  }

  for (
    const jid of mentioned
  ) {
    const mentionedUser =
      getUser(jid);

    if (
      !mentionedUser.afk
    ) {
      continue;
    }

    const duration =
      formatRuntime(
        Date.now() -
        Number(
          mentionedUser.afk.time ||
          Date.now()
        )
      );

    const reason =
      mentionedUser.afk.reason ||
      "AFK";

    await sendText(
      chat,
      `💤 @${jidNumber(jid)} sedang AFK.\n\n` +
      `📝 Alasan: ${reason}\n` +
      `⏳ AFK selama: ${duration}`,
      {
        mentions: [jid]
      }
    );
  }
}

// =====================================================
// GROUP PARTICIPANTS
// =====================================================

async function handleParticipants(
  update
) {
  if (
    !update ||
    !update.id
  ) {
    return;
  }

  const chat =
    update.id;

  if (
    !isGroup(chat)
  ) {
    return;
  }

  const group =
    getGroup(chat);

  const participants =
    update.participants || [];

  if (
    !participants.length
  ) {
    return;
  }

  // ===================================================
  // MEMBER MASUK
  // ===================================================

  if (
    update.action === "add" &&
    group.welcome
  ) {
    for (
      const participant of participants
    ) {
      const number =
        jidNumber(
          participant
        );

      await sendText(
        chat,
        `👋 *WELCOME!*\n\n` +
        `Selamat datang @${number} 🎉\n` +
        `Semoga betah di group!\n\n` +
        `Ketik ${PREFIX}menu untuk melihat menu bot.`,
        {
          mentions: [
            participant
          ]
        }
      );
    }
  }

  // ===================================================
  // MEMBER KELUAR
  // ===================================================

  if (
    update.action === "remove" &&
    group.goodbye
  ) {
    for (
      const participant of participants
    ) {
      const number =
        jidNumber(
          participant
        );

      await sendText(
        chat,
        `👋 *GOODBYE!*\n\n` +
        `@${number} telah keluar dari group.`,
        {
          mentions: [
            participant
          ]
        }
      );
    }
  }

  // ===================================================
  // PROMOTE
  // ===================================================

  if (
    update.action === "promote"
  ) {
    for (
      const participant of participants
    ) {
      await sendText(
        chat,
        `👑 @${jidNumber(
          participant
        )} sekarang menjadi admin group.`,
        {
          mentions: [
            participant
          ]
        }
      );
    }
  }

  // ===================================================
  // DEMOTE
  // ===================================================

  if (
    update.action === "demote"
  ) {
    for (
      const participant of participants
    ) {
      await sendText(
        chat,
        `📉 @${jidNumber(
          participant
        )} tidak lagi menjadi admin.`,
        {
          mentions: [
            participant
          ]
        }
      );
    }
  }
}

// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(
  timestamp
) {
  const date =
    new Date(timestamp);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return date.toLocaleString(
    "id-ID",
    {
      timeZone:
        "Asia/Jakarta"
    }
  );
}

// =====================================================
// PART 7 LOADED
// =====================================================

console.log(
  "========================================"
);

console.log(
  `🛡️ ${BOT_NAME} PART 7 LOADED`
);

console.log(
  "🔗 Anti-link system siap."
);

console.log(
  "🚫 Anti-wa.me system siap."
);

console.log(
  "🤬 Anti-badword system siap."
);

console.log(
  "🎮 Game answer system siap."
);

console.log(
  "💤 AFK system siap."
);

console.log(
  "👋 Welcome/Goodbye system siap."
);

console.log(
  "========================================"
);
// =====================================================
// ZAZABOT - PART 8
// MESSAGE HANDLER + BOT START
// =====================================================

// =====================================================
// HANDLE MESSAGE
// =====================================================

async function handleMessage(message) {
  try {
    // Abaikan pesan kosong
    if (!message?.message) {
      return;
    }

    // Abaikan pesan dari bot sendiri
    if (message.key?.fromMe) {
      return;
    }

    const chat =
      getChat(message);

    const sender =
      getSender(message);

    const text =
      getMessageText(message).trim();

    // Tidak ada teks
    if (!text) {
      return;
    }

    // =================================================
    // UPDATE USER
    // =================================================

    const user =
      getUser(sender);

    user.name =
      message.pushName ||
      user.name ||
      "User";

    db.stats.messages =
      Number(
        db.stats.messages || 0
      ) + 1;

    saveDB();

    // =================================================
    // CEK BAN
    // =================================================

    if (
      isBanned(sender) &&
      !isOwner(sender)
    ) {
      return;
    }

    // =================================================
    // MODE PUBLIC / SELF
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

    if (
      isGroup(chat)
    ) {
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

    if (
      gameAnswered
    ) {
      return;
    }

    // =================================================
    // BUKAN COMMAND
    // =================================================

    if (
      !text.startsWith(PREFIX)
    ) {
      return;
    }

    // =================================================
    // PARSE COMMAND
    // =================================================

    const body =
      text
        .slice(PREFIX.length)
        .trim();

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

    const commandText =
      args.join(" ");

    if (!command) {
      return;
    }

    // =================================================
    // COMMAND COUNTER
    // =================================================

    db.stats.commands =
      Number(
        db.stats.commands || 0
      ) + 1;

    saveDB();

    // =================================================
    // PART 4
    // =================================================

    if (
      await handleCommandPart4(
        message,
        command,
        args,
        commandText
      )
    ) {
      return;
    }

    // =================================================
    // GROUP COMMAND
    // =================================================

    if (
      await handleGroupCommand(
        message,
        command,
        args,
        commandText
      )
    ) {
      return;
    }

    // =================================================
    // WARNING
    // =================================================

    if (
      await handleWarningCommand(
        message,
        command,
        args
      )
    ) {
      return;
    }

    // =================================================
    // LIST
    // =================================================

    if (
      await handleListCommand(
        message,
        command,
        args,
        commandText
      )
    ) {
      return;
    }

    // =================================================
    // POINT
    // =================================================

    if (
      await handlePointCommand(
        message,
        command,
        args
      )
    ) {
      return;
    }

    // =================================================
    // REMINDER
    // =================================================

    if (
      await handleReminderCommand(
        message,
        command,
        args,
        commandText
      )
    ) {
      return;
    }

    // =================================================
    // AFK COMMAND
    // =================================================

    if (
      await handleAfkCommand(
        message,
        command,
        args,
        commandText
      )
    ) {
      return;
    }

    // =================================================
    // GAME COMMAND
    // =================================================

    if (
      await handleGameCommand(
        message,
        command,
        args
      )
    ) {
      return;
    }

    // =================================================
    // GROUP INFO
    // =================================================

    if (
      await handleGroupInfoCommand(
        message,
        command
      )
    ) {
      return;
    }

    // =================================================
    // GENERAL / OWNER / STORE / AI
    // =================================================

    const handled =
      await handleCommand(
        message,
        command,
        args,
        commandText
      );

    if (
      handled
    ) {
      return;
    }

    // =================================================
    // COMMAND TIDAK DIKENAL
    // =================================================

    await sendText(
      chat,
      `❌ Command *${PREFIX}${command}* tidak ditemukan.\n\n` +
      `Ketik *${PREFIX}menu* untuk melihat daftar command.`
    );

  } catch (error) {
    console.error(
      "HANDLE MESSAGE ERROR:",
      error
    );

    try {
      await sendText(
        getChat(message),
        `❌ Terjadi error saat menjalankan command.\n\n` +
        `Detail: ${error.message}`
      );
    } catch (sendError) {
      console.error(
        "SEND ERROR:",
        sendError
      );
    }
  }
}

// =====================================================
// START BOT
// =====================================================

async function startBot() {
  try {
    // =================================================
    // SESSION FOLDER
    // =================================================

    fs.mkdirSync(
      SESSION_DIR,
      {
        recursive: true
      }
    );

    // =================================================
    // LOAD AUTH
    // =================================================

    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        SESSION_DIR
      );

    // =================================================
    // CREATE SOCKET
    // =================================================

    sock =
      makeWASocket({
        auth: state,

        logger:
          pino({
            level:
              "silent"
          }),

        browser: [
          BOT_NAME,
          "Chrome",
          "1.0.0"
        ],

        markOnlineOnConnect:
          false,

        printQRInTerminal:
          false,

        syncFullHistory:
          false
      });

    // =================================================
    // SAVE SESSION
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
      async ({
        connection,
        lastDisconnect,
        qr
      }) => {

        try {

          // ===========================================
          // QR
          // ===========================================

          if (qr) {
            qrCode = qr;

            connectionStatus =
              "qr";

            console.log(
              "========================================"
            );

            console.log(
              "📱 QR CODE TERSEDIA"
            );

            console.log(
              "🌐 Buka /qr pada URL server."
            );

            console.log(
              "========================================"
            );
          }

          // ===========================================
          // CONNECTING
          // ===========================================

          if (
            connection ===
            "connecting"
          ) {
            connectionStatus =
              "connecting";

            console.log(
              "🔄 Menghubungkan ke WhatsApp..."
            );
          }

          // ===========================================
          // OPEN
          // ===========================================

          if (
            connection ===
            "open"
          ) {
            connectionStatus =
              "open";

            qrCode =
              null;

            startedAt =
              Date.now();

            console.log(
              "========================================"
            );

            console.log(
              `✅ ${BOT_NAME} ONLINE`
            );

            console.log(
              `👤 Owner: ${OWNER_NUMBER}`
            );

            console.log(
              "📱 Bot: 6285866438941"
            );

            console.log(
              "========================================"
            );
          }

          // ===========================================
          // CLOSE
          // ===========================================

          if (
            connection ===
            "close"
          ) {

            connectionStatus =
              "closed";

            const statusCode =
              lastDisconnect
                ?.error
                ?.output
                ?.statusCode;

            console.log(
              "❌ Koneksi WhatsApp terputus."
            );

            console.log(
              "Status:",
              statusCode
            );

            // =========================================
            // LOGOUT
            // =========================================

            if (
              statusCode ===
              DisconnectReason.loggedOut
            ) {

              console.log(
                "🚪 Session logout."
              );

              console.log(
                "🗑️ Hapus folder session lalu pairing ulang."
              );

              return;
            }

            // =========================================
            // RECONNECT
            // =========================================

            if (
              !reconnectTimer
            ) {

              reconnectTimer =
                setTimeout(
                  async () => {

                    reconnectTimer =
                      null;

                    console.log(
                      "🔄 Mencoba reconnect..."
                    );

                    try {
                      await startBot();
                    } catch (
                      error
                    ) {
                      console.error(
                        "RECONNECT ERROR:",
                        error
                      );
                    }

                  },
                  5000
                );
            }
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
    // MESSAGES
    // =================================================

    sock.ev.on(
      "messages.upsert",
      async ({
        messages,
        type
      }) => {

        if (
          type !==
          "notify"
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

          } catch (
            error
          ) {

            console.error(
              "MESSAGE ERROR:",
              error
            );

          }

        }

      }
    );

    // =================================================
    // GROUP PARTICIPANTS
    // =================================================

    sock.ev.on(
      "group-participants.update",
      async update => {

        try {

          await handleParticipants(
            update
          );

        } catch (
          error
        ) {

          console.error(
            "PARTICIPANT ERROR:",
            error
          );

        }

      }
    );

    console.log(
      `🚀 ${BOT_NAME} berhasil menjalankan socket.`
    );

  } catch (error) {

    connectionStatus =
      "error";

    console.error(
      "START BOT ERROR:",
      error
    );

    // Coba start ulang
    if (
      !reconnectTimer
    ) {

      reconnectTimer =
        setTimeout(
          async () => {

            reconnectTimer =
              null;

            try {
              await startBot();
            } catch (
              retryError
            ) {
              console.error(
                "START RETRY ERROR:",
                retryError
              );
            }

          },
          10000
        );
    }
  }
}

// =====================================================
// PART 8 LOADED
// =====================================================

console.log(
  "========================================"
);

console.log(
  `🚀 ${BOT_NAME} PART 8 LOADED`
);

console.log(
  "📨 Message handler siap."
);

console.log(
  "📱 WhatsApp socket siap."
);

console.log(
  "🔄 Auto reconnect siap."
);

console.log(
  "👥 Group participant handler siap."
);

console.log(
  "========================================"
);
// =====================================================
// ZAZABOT - PART 9
// HTTP SERVER + QR PAGE + STATUS
// =====================================================

// =====================================================
// HTTP RESPONSE HELPER
// =====================================================

function sendHttp(
  res,
  statusCode,
  contentType,
  body
) {
  res.writeHead(
    statusCode,
    {
      "Content-Type":
        contentType,
      "Cache-Control":
        "no-store"
    }
  );

  res.end(body);
}

// =====================================================
// HTML PAGE
// =====================================================

function homePage() {
  const status =
    connectionStatus === "open"
      ? "ONLINE 🟢"
      : connectionStatus === "qr"
        ? "MENUNGGU QR 📱"
        : connectionStatus.toUpperCase();

  const uptime =
    formatRuntime(
      Date.now() -
      startedAt
    );

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
  min-height: 100vh;
  font-family: Arial, sans-serif;
  background:
    linear-gradient(
      135deg,
      #071a33,
      #0b3d66,
      #071a33
    );
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.container {
  width: 92%;
  max-width: 500px;
  padding: 25px;
}

.card {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 25px;
  padding: 30px;
  text-align: center;
  box-shadow:
    0 15px 50px rgba(0,0,0,0.35);
  backdrop-filter: blur(12px);
}

.logo {
  width: 90px;
  height: 90px;
  margin: auto;
  border-radius: 50%;
  background: #0d6efd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: bold;
}

h1 {
  margin-bottom: 5px;
}

.subtitle {
  opacity: 0.75;
  margin-bottom: 25px;
}

.status {
  padding: 15px;
  border-radius: 15px;
  background: rgba(0,0,0,0.2);
  margin-bottom: 15px;
}

.info {
  text-align: left;
  line-height: 1.8;
  margin-top: 20px;
}

.button {
  display: block;
  padding: 14px;
  margin-top: 12px;
  border-radius: 14px;
  background: #0d6efd;
  color: white;
  text-decoration: none;
  font-weight: bold;
}

.footer {
  margin-top: 25px;
  font-size: 12px;
  opacity: 0.55;
}

</style>
</head>

<body>

<div class="container">

<div class="card">

<div class="logo">
Z
</div>

<h1>
${BOT_NAME}
</h1>

<div class="subtitle">
WhatsApp Bot
</div>

<div class="status">
<strong>
${status}
</strong>
</div>

<div class="info">

📱 <b>Bot:</b>
6285866438941
<br>

👑 <b>Owner:</b>
${OWNER_NUMBER}
<br>

⏱️ <b>Runtime:</b>
${uptime}
<br>

📨 <b>Messages:</b>
${db.stats.messages || 0}
<br>

⚡ <b>Commands:</b>
${db.stats.commands || 0}

</div>

<a
  class="button"
  href="/qr"
>
📱 Pair WhatsApp
</a>

<a
  class="button"
  href="/status"
>
📊 Bot Status
</a>

<div class="footer">
ZazaBot © 2026
</div>

</div>

</div>

</body>
</html>
`;
}

// =====================================================
// QR PAGE
// =====================================================

async function qrPage() {

  if (
    !qrCode
  ) {
    return `
<!DOCTYPE html>

<html lang="id">

<head>
<meta
  charset="UTF-8"
>

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>QR ${BOT_NAME}</title>

<style>

body {
  margin: 0;
  min-height: 100vh;
  background: #071a33;
  color: white;
  font-family: Arial;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.card {
  width: 90%;
  max-width: 450px;
  padding: 30px;
  border-radius: 25px;
  background: rgba(255,255,255,0.08);
}

a {
  display: inline-block;
  margin-top: 20px;
  padding: 12px 20px;
  background: #0d6efd;
  color: white;
  border-radius: 12px;
  text-decoration: none;
}

</style>

</head>

<body>

<div class="card">

<h2>
📱 QR Belum Tersedia
</h2>

<p>
Status bot:
<b>
${connectionStatus}
</b>
</p>

<p>
Jika bot sedang menghubungkan,
tunggu beberapa detik lalu refresh.
</p>

<a href="/qr">
🔄 Refresh QR
</a>

<br>

<a href="/">
🏠 Home
</a>

</div>

</body>

</html>
`;
  }

  try {

    const qrImage =
      await QRCode.toDataURL(
        qrCode,
        {
          margin: 2,
          width: 350
        }
      );

    return `
<!DOCTYPE html>

<html lang="id">

<head>

<meta
  charset="UTF-8"
>

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>QR ${BOT_NAME}</title>

<style>

body {
  margin: 0;
  min-height: 100vh;
  background: #071a33;
  color: white;
  font-family: Arial;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.card {
  width: 90%;
  max-width: 450px;
  padding: 25px;
  border-radius: 25px;
  background: white;
  color: #111;
}

.qr {
  width: 100%;
  max-width: 350px;
  border-radius: 10px;
}

.info {
  margin-top: 15px;
  font-size: 14px;
}

a {
  display: inline-block;
  margin-top: 15px;
  padding: 12px 20px;
  background: #0d6efd;
  color: white;
  border-radius: 12px;
  text-decoration: none;
}

</style>

</head>

<body>

<div class="card">

<h2>
📱 Scan QR WhatsApp
</h2>

<img
  class="qr"
  src="${qrImage}"
  alt="QR WhatsApp"
>

<div class="info">

Buka WhatsApp di HP yang ingin
dijadikan nomor bot.

<br><br>

<b>
Perangkat tertaut →
Tautkan perangkat
</b>

<br><br>

Scan QR di atas.

</div>

<a href="/qr">
🔄 Refresh
</a>

<br>

<a href="/">
🏠 Home
</a>

</div>

</body>

</html>
`;

  } catch (error) {

    console.error(
      "QR PAGE ERROR:",
      error
    );

    return `
<h2>
❌ Gagal membuat QR
</h2>

<p>
${error.message}
</p>
`;
  }
}

// =====================================================
// STATUS JSON
// =====================================================

function statusData() {

  return {
    bot:
      BOT_NAME,

    status:
      connectionStatus,

    owner:
      OWNER_NUMBER,

    botNumber:
      "6285866438941",

    uptime:
      formatRuntime(
        Date.now() -
        startedAt
      ),

    messages:
      Number(
        db.stats.messages || 0
      ),

    commands:
      Number(
        db.stats.commands || 0
      ),

    users:
      Object.keys(
        db.users || {}
      ).length,

    groups:
      Object.keys(
        db.groups || {}
      ).length,

    premium:
      Object.keys(
        db.premium || {}
      ).length,

    time:
      new Date().toISOString()
  };
}

// =====================================================
// START HTTP SERVER
// =====================================================

function startHttpServer() {

  const server =
    http.createServer(
      async (
        req,
        res
      ) => {

        try {

          const url =
            new URL(
              req.url,
              `http://${req.headers.host || "localhost"}`
            );

          // ==========================================
          // HOME
          // ==========================================

          if (
            url.pathname === "/"
          ) {

            sendHttp(
              res,
              200,
              "text/html; charset=utf-8",
              homePage()
            );

            return;
          }

          // ==========================================
          // QR
          // ==========================================

          if (
            url.pathname === "/qr"
          ) {

            const html =
              await qrPage();

            sendHttp(
              res,
              200,
              "text/html; charset=utf-8",
              html
            );

            return;
          }

          // ==========================================
          // STATUS
          // ==========================================

          if (
            url.pathname === "/status"
          ) {

            sendHttp(
              res,
              200,
              "application/json; charset=utf-8",
              JSON.stringify(
                statusData(),
                null,
                2
              )
            );

            return;
          }

          // ==========================================
          // HEALTH CHECK
          // ==========================================

          if (
            url.pathname === "/health"
          ) {

            sendHttp(
              res,
              200,
              "text/plain; charset=utf-8",
              "OK"
            );

            return;
          }

          // ==========================================
          // 404
          // ==========================================

          sendHttp(
            res,
            404,
            "text/plain; charset=utf-8",
            "404 - Not Found"
          );

        } catch (
          error
        ) {

          console.error(
            "HTTP ERROR:",
            error
          );

          sendHttp(
            res,
            500,
            "text/plain; charset=utf-8",
            "Internal Server Error"
          );
        }

      }
    );

  server.on(
    "error",
    error => {

      console.error(
        "HTTP SERVER ERROR:",
        error
      );

    }
  );

  server.listen(
    PORT,
    "0.0.0.0",
    () => {

      console.log(
        "========================================"
      );

      console.log(
        `🌐 HTTP SERVER AKTIF`
      );

      console.log(
        `📡 PORT: ${PORT}`
      );

      console.log(
        `🏠 Home: /`
      );

      console.log(
        `📱 QR: /qr`
      );

      console.log(
        `📊 Status: /status`
      );

      console.log(
        `❤️ Health: /health`
      );

      console.log(
        "========================================"
      );

    }
  );

  return server;
}

// =====================================================
// PART 9 LOADED
// =====================================================

console.log(
  "========================================"
);

console.log(
  `🌐 ${BOT_NAME} PART 9 LOADED`
);

console.log(
  "🏠 Web server siap."
);

console.log(
  "📱 QR page siap."
);

console.log(
  "📊 Status API siap."
);

console.log(
  "❤️ Health check siap."
);

console.log(
  "========================================"
);
// =====================================================
// ZAZABOT - PART 10
// AUTOSAVE + START SERVER + START BOT
// ERROR HANDLER + SHUTDOWN
// =====================================================


// =====================================================
// AUTOSAVE DATABASE
// =====================================================

const autosaveInterval =
  setInterval(() => {
    try {
      saveDB();

      console.log(
        `💾 Database tersimpan: ${new Date().toLocaleTimeString("id-ID")}`
      );

    } catch (error) {

      console.error(
        "AUTOSAVE ERROR:",
        error
      );

    }
  }, 30000);


// =====================================================
// START HTTP SERVER
// =====================================================

let httpServer = null;

try {

  httpServer =
    startHttpServer();

} catch (error) {

  console.error(
    "❌ Gagal menjalankan HTTP server:",
    error
  );

}


// =====================================================
// START WHATSAPP BOT
// =====================================================

console.log(
  "========================================"
);

console.log(
  `🚀 STARTING ${BOT_NAME}...`
);

console.log(
  `👑 OWNER: ${OWNER_NUMBER}`
);

console.log(
  "📱 BOT: 6285866438941"
);

console.log(
  "========================================"
);


startBot()
  .then(() => {

    console.log(
      "✅ StartBot berhasil dipanggil."
    );

  })
  .catch(error => {

    console.error(
      "❌ START BOT ERROR:",
      error
    );

  });


// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

async function shutdown(
  signal
) {

  console.log(
    `\n🛑 Menerima signal ${signal}`
  );

  console.log(
    "💾 Menyimpan database..."
  );

  try {

    saveDB();

  } catch (error) {

    console.error(
      "Gagal menyimpan database:",
      error
    );

  }


  // ==========================================
  // STOP AUTOSAVE
  // ==========================================

  try {

    clearInterval(
      autosaveInterval
    );

  } catch (error) {

    console.error(
      "Gagal menghentikan autosave:",
      error
    );

  }


  // ==========================================
  // CLOSE HTTP SERVER
  // ==========================================

  if (
    httpServer
  ) {

    try {

      httpServer.close(
        () => {

          console.log(
            "🌐 HTTP server ditutup."
          );

        }
      );

    } catch (error) {

      console.error(
        "HTTP CLOSE ERROR:",
        error
      );

    }

  }


  // ==========================================
  // CLOSE WHATSAPP SOCKET
  // ==========================================

  if (
    sock
  ) {

    try {

      sock.ws?.close();

      console.log(
        "📱 WhatsApp socket ditutup."
      );

    } catch (error) {

      console.error(
        "SOCKET CLOSE ERROR:",
        error
      );

    }

  }


  console.log(
    "✅ Shutdown selesai."
  );

  process.exit(
    0
  );
}


// =====================================================
// SIGINT
// =====================================================

process.on(
  "SIGINT",
  () => {

    shutdown(
      "SIGINT"
    );

  }
);


// =====================================================
// SIGTERM
// =====================================================

process.on(
  "SIGTERM",
  () => {

    shutdown(
      "SIGTERM"
    );

  }
);


// =====================================================
// UNCAUGHT EXCEPTION
// =====================================================

process.on(
  "uncaughtException",
  error => {

    console.error(
      "========================================"
    );

    console.error(
      "❌ UNCAUGHT EXCEPTION"
    );

    console.error(
      error
    );

    console.error(
      "========================================"
    );

  }
);


// =====================================================
// UNHANDLED REJECTION
// =====================================================

process.on(
  "unhandledRejection",
  reason => {

    console.error(
      "========================================"
    );

    console.error(
      "❌ UNHANDLED REJECTION"
    );

    console.error(
      reason
    );

    console.error(
      "========================================"
    );

  }
);


// =====================================================
// FINAL INFO
// =====================================================

console.log(
  "========================================"
);

console.log(
  `🤖 ${BOT_NAME} SIAP DIJALANKAN`
);

console.log(
  "📦 PART 1 - 10 SELESAI"
);

console.log(
  "💾 Database: aktif"
);

console.log(
  "🌐 HTTP Server: aktif"
);

console.log(
  "📱 WhatsApp: menunggu koneksi"
);

console.log(
  "🔄 Auto reconnect: aktif"
);

console.log(
  "💾 Auto save: 30 detik"
);

console.log(
  "========================================"
);
