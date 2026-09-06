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
