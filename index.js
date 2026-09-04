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

const BOT_NAME = "ZazaBot";

const OWNER_NUMBER =
  (process.env.OWNER_NUMBER || "6289630747010")
    .replace(/\D/g, "");

const PREFIX =
  process.env.PREFIX || ".";

const PORT =
  Number(process.env.PORT || 8080);

const SESSION_DIR = "./session";
const DB_FILE = "./database.json";

let sock = null;
let qrImage = "";
let status = "STARTING";
let publicMode = true;
let reconnectTimer = null;


/* =========================================================
   COMMAND CATEGORIES
========================================================= */

const CATEGORIES = {

  GROUP: [
    "absen",
    "add",
    "addalarm",
    "addbadword",
    "addlist",
    "updatelist",
    "uplist",
    "addpoin",
    "addreminder",
    "afk",
    "antibadword",
    "antibadwordnokick",
    "antibot",
    "antidelete",
    "antilink",
    "antilinkchannel",
    "antilinknokick",
    "antiluar",
    "antimentionsw",
    "antiviewonce",
    "antiwame",
    "antiwamenokick",
    "banmember",
    "blacklist",
    "delblacklist",
    "listblacklist",
    "resetblacklist",
    "cekabsen",
    "cekidgroup",
    "cekpoint",
    "cekwarn",
    "createschedulecall",
    "delalarm",
    "delbadword",
    "delete",
    "deleteabsen",
    "deletepoin",
    "deletetotalpesan",
    "dellist",
    "delreminder",
    "delultahku",
    "delwarn",
    "demote",
    "demotedetector",
    "descgc",
    "disablealarm",
    "done",
    "enablealarm",
    "gamemode",
    "getlist",
    "groupadmin",
    "groupinfo",
    "groupschedule",
    "groupsetting",
    "grouptime",
    "hidetag",
    "kick",
    "kickme",
    "left",
    "levelling",
    "linkgc",
    "revokelink",
    "list",
    "listalarm",
    "listbadword",
    "listbanmember",
    "listpoint",
    "listreminder",
    "listtotalpesan",
    "listultah",
    "listwarn",
    "mulaiabsen",
    "mute",
    "pinmsg",
    "promote",
    "promotedetector",
    "proses",
    "refreshgroup",
    "resetalarm",
    "resetbadword",
    "resetlist",
    "resetpoint",
    "resetreminder",
    "resettotalpesan",
    "resetultahku",
    "resetwarn",
    "setdescgc",
    "setnamegc",
    "setopen",
    "setclose",
    "setppgc",
    "setppgcpanjang",
    "setproses",
    "setdone",
    "setwarn",
    "setwelcome",
    "setleft",
    "setwelcometype",
    "setlefttype",
    "sider",
    "tagall",
    "tfpoint",
    "totag",
    "totalpesan",
    "ultahku",
    "unbanmember",
    "unpinmsg",
    "vote",
    "warn",
    "welcome"
  ],

  OWNER: [
    "addbalance",
    "addlevel",
    "addlimit",
    "addpremium",
    "addrespon",
    "addsewa",
    "addsewathisgroup",
    "addxp",
    "anticall",
    "anticallnoblock",
    "antideletepc",
    "autoleavegcnosewa",
    "autonexara",
    "autoread",
    "autotype",
    "ban",
    "blacklistglobal",
    "delblacklistglobal",
    "listblacklistglobal",
    "resetblacklistglobal",
    "block",
    "broadcast",
    "bccancel",
    "bcconfirm",
    "bcgroup",
    "bcgchidetag",
    "bchidetag",
    "bcmember",
    "bcpremium",
    "bcpc",
    "bcsewa",
    "bcstat",
    "buttonmode",
    "buttontojson",
    "call",
    "cekaccount",
    "cekopenaikey",
    "chatgroup",
    "clearchat",
    "copythumbnail",
    "createbutton",
    "createfullbutton",
    "createlist",
    "createredeem",
    "createthumbnail",
    "delbalance",
    "dellevel",
    "dellimit",
    "delpremium",
    "deleteredeem",
    "delrespon",
    "delsewa",
    "delxp",
    "freeautores",
    "delfreeautores",
    "listfreeautores",
    "resetfreeautores",
    "freecommand",
    "delfreecommand",
    "listfreecommand",
    "resetfreecommand",
    "globalgamemode",
    "golink",
    "grabcontact",
    "grouponlypremium",
    "inforedeem",
    "inviteme",
    "join",
    "leaveall",
    "leavegcbyid",
    "levellingpc",
    "listredeem",
    "listrespon",
    "listsewa",
    "listsewapermanent",
    "mutebc",
    "mutebyid",
    "mycontacts",
    "onlygroup",
    "onlyindo",
    "onlyprem",
    "pconlyprem",
    "premiumgroup",
    "promoteme",
    "public",
    "publicbyid",
    "queue",
    "react",
    "refreshgroupbyid",
    "refreshpremiumlist",
    "resetanonymous",
    "resetbalance",
    "resetlevel",
    "resetlimit",
    "resetxp",
    "resetlimitreceivedgroup",
    "resetpremium",
    "resetresponsee",
    "self",
    "selfbyid",
    "setbio",
    "setcommand",
    "setdefaultweltype",
    "setlimitgroup",
    "setlimitreceivedgroup",
    "setname",
    "setopenaikey",
    "setpp",
    "setpppanjang",
    "setwrsuit",
    "setwrttt",
    "testbutton",
    "unban",
    "unblock",
    "unreact",
    "upchannel",
    "upres",
    "upswgroup",
    "upswmentiongroup",
    "upswmentiongroupsilent",
    "upswpremium",
    "videocall"
  ],
    AI: [
    "aiimage",
    "bard",
    "jadianime",
    "nexara",
    "byenexara",
    "openai",
    "voicejapan"
  ],

  GAME: [
    "akinator",
    "akinatorstart",
    "akinatorstop",
    "asahotak",
    "caklontong",
    "dare",
    "family100",
    "hint",
    "math",
    "nyerah",
    "redeem",
    "sambungkata",
    "siapakahaku",
    "sloth",
    "susunkalimat",
    "susunkata",
    "susunlirik",
    "tebakbendera",
    "tebakbom",
    "tebakchara",
    "tebakfisika",
    "tebakgambar",
    "tebakkata",
    "tebaklagu",
    "tebaklaguanime",
    "tebaklagukpop",
    "tekateki",
    "tfbalance",
    "truth",
    "ulartangga",
    "uno"
  ],

  RANDOM: [
    "alay",
    "apakah",
    "cekkhodam",
    "faktaunik",
    "husbu",
    "jadian",
    "kapankah",
    "katabijak",
    "loli",
    "pantun",
    "ppcouple",
    "puisi",
    "quotesanime",
    "randomanime",
    "randommeme",
    "randomnumber",
    "randomtag",
    "rate",
    "siapakah",
    "neko",
    "waifu"
  ],

  SEARCH: [
    "alkitab",
    "alquranaudio",
    "artinama",
    "brainly",
    "cekidff",
    "cekidml",
    "cuaca",
    "dorama",
    "google",
    "googleimage",
    "igstalk",
    "ipchecker",
    "jadwalshalat",
    "lirik",
    "otakudesuinfo",
    "otakudesuongoing",
    "otakudesu",
    "pinterest",
    "play",
    "wikipedia",
    "ytsearch"
  ],

  STICKER: [
    "attp",
    "brat",
    "bratvideo",
    "delsetwm",
    "quickchat",
    "semoji",
    "semojimix",
    "setwm",
    "sticker",
    "stickercircle",
    "stickerinfo",
    "stickerly",
    "smeme",
    "snobg",
    "stickerwm",
    "takesticker",
    "telestick",
    "toimg",
    "trigger",
    "ttp",
    "ziptelesticker"
  ],

  TOOLS: [
    "blur",
    "cekplatform",
    "ehex",
    "dhex",
    "ebase64",
    "dbase64",
    "enc",
    "dec",
    "fakereply",
    "hartatahta",
    "iqc",
    "kirim",
    "confess",
    "menfess",
    "nulis",
    "folio",
    "ocr",
    "poll",
    "ptvtovideo",
    "qrcode",
    "qrcodereader",
    "readmore",
    "readviewonce",
    "removebackground",
    "screenshot",
    "shortlink",
    "myemail",
    "getemail",
    "tomp3",
    "tovn",
    "toquickvideo",
    "tourl",
    "toviewonce",
    "translate",
    "tts",
    "tts2",
    "upscale",
    "halah",
    "hilih",
    "huluh",
    "heleh",
    "holoh",
    "ytcomment"
  ],

  INFO: [
    "buylimit",
    "cekpremium",
    "infocovid",
    "infogempa",
    "infounsur",
    "kodebahasa",
    "leavenosewa",
    "level",
    "limit",
    "balance",
    "listban",
    "listblock",
    "listcommand",
    "listgroup",
    "listgroupnosewa",
    "listonline",
    "listpremium",
    "listpremiumgroup",
    "profile",
    "report",
    "status",
    "topglobal",
    "toplocal"
  ],

  DOWNLOAD: [
    "douyin",
    "facebook",
    "igstory",
    "igdl",
    "igtv",
    "igreel",
    "mediafire",
    "otakudesudl",
    "pindl",
    "spotify",
    "threads",
    "tiktoknowm",
    "tiktokwm",
    "tiktokmusic",
    "twitterdl",
    "ytmp3",
    "ytmp4"
  ],

  TEXTMAKER: [
    "window",
    "blankpink",
    "thunder",
    "bear",
    "cloud",
    "neonlight",
    "sand",
    "glow",
    "neon",
    "sky",
    "cartoon",
    "greenneon",
    "halloween",
    "bokeh",
    "firework",
    "narutologo",
    "colorneon",
    "digitalglitch",
    "wetglass",
    "watercolor",
    "pubglogo",
    "fflogo",
    "glitch",
    "thor",
    "wolf",
    "phlogo",
    "avangers",
    "spacetext",
    "marvel",
    "graffiti",
    "deadpool",
    "lightglow",
    "blackpink",
    "dropwater",
    "magma",
    "pencil",
    "bisnissign",
    "batman",
    "holo"
  ],

  GENERAL: [
    "sewabot",
    "premium",
    "user",
    "upbalance",
    "upxp",
    "uplevel",
    "owner",
    "ping",
    "runtime"
  ]

};
const ALL_COMMANDS = Object.values(CATEGORIES)
  .flat();

const OWNER_COMMANDS = new Set(CATEGORIES.OWNER);
const GROUP_COMMANDS = new Set(CATEGORIES.GROUP);


/* =========================================================
   DATABASE
========================================================= */

let db = {
  users: {},
  groups: {},
  premium: [],
  banned: [],
  blocked: [],
  settings: {}
};

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(
        fs.readFileSync(DB_FILE, "utf8")
      );

      db = {
        users: data.users || {},
        groups: data.groups || {},
        premium: data.premium || [],
        banned: data.banned || [],
        blocked: data.blocked || [],
        settings: data.settings || {}
      };
    }
  } catch (error) {
    console.log("Gagal membaca database:", error.message);
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.log("Gagal menyimpan database:", error.message);
  }
}

loadDatabase();


/* =========================================================
   USER DATABASE
========================================================= */

function ensureUser(jid) {
  if (!jid) return null;

  if (!db.users[jid]) {
    db.users[jid] = {
      balance: 0,
      limit: 20,
      xp: 0,
      level: 1,
      premium: false,
      banned: false,
      warn: 0,
      messageCount: 0
    };

    saveDatabase();
  }

  return db.users[jid];
}

function isPremium(jid) {
  const user = ensureUser(jid);

  return Boolean(
    user?.premium ||
    db.premium.includes(jid)
  );
}

function isOwner(jid) {
  return normalizeJid(jid)
    .replace(/\D/g, "") === OWNER_NUMBER;
}


/* =========================================================
   JID / ADMIN
========================================================= */

function normalizeJid(jid = "") {
  return String(jid)
    .split(":")[0]
    .split("/")[0]
    .trim()
    .toLowerCase();
}

function sameUser(a = "", b = "") {
  const na = normalizeJid(a);
  const nb = normalizeJid(b);

  if (!na || !nb) return false;
  if (na === nb) return true;

  const aa = na
    .split("@")[0]
    .replace(/\D/g, "");

  const bb = nb
    .split("@")[0]
    .replace(/\D/g, "");

  return Boolean(
    aa &&
    bb &&
    aa === bb
  );
}

function participantIsAdmin(participant) {
  return (
    participant?.admin === "admin" ||
    participant?.admin === "superadmin" ||
    participant?.admin === true
  );
}

async function checkAdmin(jid, sender) {
  if (!jid || !jid.endsWith("@g.us")) {
    return {
      ok: false,
      senderAdmin: false,
      botAdmin: false
    };
  }

  try {
    const metadata = await sock.groupMetadata(jid);
    const participants =
      metadata?.participants || [];

    const senderParticipant =
      participants.find(p =>
        sameUser(p.id, sender) ||
        sameUser(p.jid, sender) ||
        sameUser(p.lid, sender) ||
        sameUser(p.participant, sender)
      );

    const botId =
      sock?.user?.id || "";

    const botLid =
      sock?.user?.lid || "";

    const botParticipant =
      participants.find(p =>
        sameUser(p.id, botId) ||
        sameUser(p.jid, botId) ||
        sameUser(p.lid, botId) ||
        sameUser(p.participant, botId) ||
        sameUser(p.id, botLid) ||
        sameUser(p.jid, botLid) ||
        sameUser(p.lid, botLid) ||
        sameUser(p.participant, botLid)
      );

    const senderAdmin =
      participantIsAdmin(senderParticipant);

    const botAdmin =
      participantIsAdmin(botParticipant);

    return {
      ok: senderAdmin && botAdmin,
      senderAdmin,
      botAdmin
    };

  } catch (error) {
    console.log(
      "Admin check error:",
      error.message
    );

    return {
      ok: false,
      senderAdmin: false,
      botAdmin: false
    };
  }
}

async function requireAdmin(jid, sender) {
  const result =
    await checkAdmin(jid, sender);

  if (!result.senderAdmin) {
    await sendMessage(
      jid,
      "❌ Kamu harus menjadi admin grup."
    );

    return false;
  }

  if (!result.botAdmin) {
    await sendMessage(
      jid,
      "❌ ZazaBot harus menjadi admin grup terlebih dahulu."
    );

    return false;
  }

  return true;
    }
/* =========================================================
   MESSAGE HELPERS
========================================================= */

async function sendMessage(jid, text, options = {}) {
  if (!sock || !jid) return;

  try {
    return await sock.sendMessage(
      jid,
      {
        text: String(text),
        ...options
      }
    );
  } catch (error) {
    console.log(
      "Gagal mengirim pesan:",
      error.message
    );
  }
}

function getSender(msg) {
  return (
    msg?.key?.participant ||
    msg?.participant ||
    msg?.key?.remoteJid ||
    ""
  );
}

function getChatId(msg) {
  return msg?.key?.remoteJid || "";
}

function getMessageText(msg) {
  const m = msg?.message;

  if (!m) return "";

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  );
}

function getQuotedMessage(msg) {
  return (
    msg?.message?.extendedTextMessage
      ?.contextInfo?.quotedMessage || null
  );
}

function getQuotedParticipant(msg) {
  return (
    msg?.message?.extendedTextMessage
      ?.contextInfo?.participant || ""
  );
}

function getMentions(msg) {
  return (
    msg?.message?.extendedTextMessage
      ?.contextInfo?.mentionedJid || []
  );
}

async function downloadMedia(message, type) {
  const stream =
    await downloadContentFromMessage(
      message,
      type
    );

  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}


/* =========================================================
   GROUP SETTINGS
========================================================= */

function ensureGroup(jid) {
  if (!db.groups[jid]) {
    db.groups[jid] = {
      welcome: false,
      left: false,
      antiLink: false,
      antiBadword: false,
      warn: {},
      blacklist: [],
      messageCount: 0,
      points: {},
      list: {},
      reminders: {},
      alarms: {}
    };

    saveDatabase();
  }

  return db.groups[jid];
}


/* =========================================================
   COMMAND PARSER
========================================================= */

function parseCommand(text) {
  if (!text) return null;

  if (!text.startsWith(PREFIX)) {
    return null;
  }

  const body =
    text.slice(PREFIX.length).trim();

  if (!body) return null;

  const parts =
    body.split(/\s+/);

  const command =
    parts.shift()
      .toLowerCase();

  const args = parts;

  return {
    command,
    args,
    text: args.join(" ")
  };
}


/* =========================================================
   RUNTIME
========================================================= */

const START_TIME = Date.now();

function runtime() {
  const seconds =
    Math.floor(
      (Date.now() - START_TIME) / 1000
    );

  const days =
    Math.floor(seconds / 86400);

  const hours =
    Math.floor(
      (seconds % 86400) / 3600
    );

  const minutes =
    Math.floor(
      (seconds % 3600) / 60
    );

  const secs =
    seconds % 60;

  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}


/* =========================================================
   RANDOM HELPERS
========================================================= */

function randomItem(array) {
  return array[
    Math.floor(
      Math.random() * array.length
    )
  ];
}

function randomNumber(min = 1, max = 100) {
  return Math.floor(
    Math.random() *
      (max - min + 1)
  ) + min;
}

function cleanText(text = "") {
  return String(text)
    .replace(/[<>]/g, "")
    .trim();
}


/* =========================================================
   BOT INFORMATION
========================================================= */

function getBotNumber() {
  return normalizeJid(
    sock?.user?.id || ""
  );
}

function getBotName() {
  return (
    sock?.user?.name ||
    BOT_NAME
  );
}
/* =========================================================
   MENU
========================================================= */

function makeMenu() {
  let menu = `╭━━━〔 🤖 ${BOT_NAME} 〕━━━╮
┃
┃ 👋 Halo! Selamat datang di ZazaBot
┃
┃ Prefix : ${PREFIX}
┃ Owner  : ${OWNER_NUMBER}
┃ Runtime: ${runtime()}
┃
╰━━━━━━━━━━━━━━━━━━━━╯

`;

  for (const [category, commands] of Object.entries(CATEGORIES)) {
    menu += `╭─「 ${category} 」\n`;

    for (const command of commands) {
      menu += `│ ${PREFIX}${command}\n`;
    }

    menu += `╰──────────────\n\n`;
  }

  menu += `╭━━━〔 GENERAL 〕━━━╮
┃ ${PREFIX}menu
┃ ${PREFIX}ping
┃ ${PREFIX}runtime
┃ ${PREFIX}owner
╰━━━━━━━━━━━━━━━━━━╯`;

  return menu;
}


/* =========================================================
   OWNER CHECK
========================================================= */

function ownerOnly(jid) {
  return isOwner(jid);
}


/* =========================================================
   GROUP CHECK
========================================================= */

function groupOnly(jid) {
  return String(jid).endsWith("@g.us");
}


/* =========================================================
   COMMAND EXISTS
========================================================= */

function commandExists(command) {
  return ALL_COMMANDS.includes(command);
}


/* =========================================================
   SIMPLE REPLY
========================================================= */

async function reply(jid, text) {
  return sendMessage(jid, text);
}


/* =========================================================
   COMMAND ERROR
========================================================= */

async function commandError(jid, error) {
  console.log(
    "Command error:",
    error?.message || error
  );

  await reply(
    jid,
    `❌ Terjadi kesalahan saat menjalankan perintah.

${error?.message || "Silakan coba lagi."}`
  );
}


/* =========================================================
   HELP TEXT
========================================================= */

function commandHelp(command) {
  return `╭━━〔 ${PREFIX}${command} 〕━━╮
┃
┃ Perintah ${PREFIX}${command} tersedia.
┃
┃ Gunakan sesuai format perintah
┃ yang ditentukan oleh ZazaBot.
┃
╰━━━━━━━━━━━━━━━━━━━━╯`;
}


/* =========================================================
   OWNER MENU
========================================================= */

function ownerMenu() {
  let text = `╭━━━〔 👑 OWNER MENU 〕━━━╮\n`;

  for (const command of CATEGORIES.OWNER) {
    text += `┃ ${PREFIX}${command}\n`;
  }

  text += `╰━━━━━━━━━━━━━━━━━━━━╯`;

  return text;
}


/* =========================================================
   GROUP MENU
========================================================= */

function groupMenu() {
  let text = `╭━━━〔 👥 GROUP MENU 〕━━━╮\n`;

  for (const command of CATEGORIES.GROUP) {
    text += `┃ ${PREFIX}${command}\n`;
  }

  text += `╰━━━━━━━━━━━━━━━━━━━━╯`;

  return text;
}


/* =========================================================
   BASIC MENU COMMAND
========================================================= */

async function handleMenu(jid) {
  await reply(
    jid,
    makeMenu()
  );
}


/* =========================================================
   OWNER COMMAND CHECK
========================================================= */

async function checkOwnerCommand(command, jid) {
  if (!OWNER_COMMANDS.has(command)) {
    return true;
  }

  if (!ownerOnly(getSenderFromJid(jid))) {
    await reply(
      jid,
      "❌ Perintah ini khusus Owner ZazaBot."
    );

    return false;
  }

  return true;
}
/* =========================================================
   SENDER HELPER
========================================================= */

function getSenderFromJid(jid) {
  return normalizeJid(jid);
}

function getMentionTarget(msg, args = []) {
  const mentions = getMentions(msg);

  if (mentions.length > 0) {
    return mentions[0];
  }

  if (args[0]) {
    const number = args[0].replace(/\D/g, "");

    if (number.length >= 8) {
      return `${number}@s.whatsapp.net`;
    }
  }

  return null;
}


/* =========================================================
   ADD / REMOVE BALANCE
========================================================= */

function addBalance(jid, amount) {
  const user = ensureUser(jid);

  amount = Number(amount);

  if (!Number.isFinite(amount)) {
    return false;
  }

  user.balance += amount;
  saveDatabase();

  return true;
}

function removeBalance(jid, amount) {
  const user = ensureUser(jid);

  amount = Number(amount);

  if (!Number.isFinite(amount)) {
    return false;
  }

  user.balance =
    Math.max(0, user.balance - amount);

  saveDatabase();

  return true;
}


/* =========================================================
   LIMIT
========================================================= */

function addLimit(jid, amount) {
  const user = ensureUser(jid);

  amount = Number(amount);

  if (!Number.isFinite(amount)) {
    return false;
  }

  user.limit += amount;

  saveDatabase();

  return true;
}

function removeLimit(jid, amount) {
  const user = ensureUser(jid);

  amount = Number(amount);

  if (!Number.isFinite(amount)) {
    return false;
  }

  user.limit =
    Math.max(0, user.limit - amount);

  saveDatabase();

  return true;
}


/* =========================================================
   XP / LEVEL
========================================================= */

function addXP(jid, amount) {
  const user = ensureUser(jid);

  amount = Number(amount);

  if (!Number.isFinite(amount)) {
    return false;
  }

  user.xp += amount;

  const newLevel =
    Math.max(
      1,
      Math.floor(user.xp / 100) + 1
    );

  if (newLevel > user.level) {
    user.level = newLevel;
  }

  saveDatabase();

  return true;
}

function removeXP(jid, amount) {
  const user = ensureUser(jid);

  amount = Number(amount);

  if (!Number.isFinite(amount)) {
    return false;
  }

  user.xp =
    Math.max(0, user.xp - amount);

  user.level =
    Math.max(
      1,
      Math.floor(user.xp / 100) + 1
    );

  saveDatabase();

  return true;
}


/* =========================================================
   PREMIUM
========================================================= */

function addPremium(jid) {
  const user = ensureUser(jid);

  user.premium = true;

  if (!db.premium.includes(jid)) {
    db.premium.push(jid);
  }

  saveDatabase();
}

function removePremium(jid) {
  const user = ensureUser(jid);

  user.premium = false;

  db.premium =
    db.premium.filter(
      id => !sameUser(id, jid)
    );

  saveDatabase();
}


/* =========================================================
   BAN
========================================================= */

function isBanned(jid) {
  const user = ensureUser(jid);

  return Boolean(
    user?.banned ||
    db.banned.some(
      id => sameUser(id, jid)
    )
  );
}

function banUser(jid) {
  const user = ensureUser(jid);

  user.banned = true;

  if (!db.banned.includes(jid)) {
    db.banned.push(jid);
  }

  saveDatabase();
}

function unbanUser(jid) {
  const user = ensureUser(jid);

  user.banned = false;

  db.banned =
    db.banned.filter(
      id => !sameUser(id, jid)
    );

  saveDatabase();
}
/* =========================================================
   BASIC COMMANDS
========================================================= */

async function handleBasicCommand(command, jid, sender, args) {

  const user = ensureUser(sender);

  switch (command) {

    case "menu":
      return handleMenu(jid);

    case "ping":
      return reply(
        jid,
        `🏓 Pong!\n\n🤖 ${BOT_NAME}\n⚡ Bot aktif`
      );

    case "runtime":
      return reply(
        jid,
        `⏱️ Runtime ZazaBot\n\n${runtime()}`
      );

    case "owner":
      return reply(
        jid,
        `👑 OWNER ZAZABOT\n\nwa.me/${OWNER_NUMBER}`
      );

    case "profile":
    case "user":
      return reply(
        jid,
        `👤 PROFILE

Nomor : ${sender}
💰 Balance : ${user.balance}
🎟️ Limit : ${user.limit}
⭐ XP : ${user.xp}
📈 Level : ${user.level}
💎 Premium : ${isPremium(sender) ? "YA" : "TIDAK"}
⚠️ Warn : ${user.warn || 0}`
      );

    case "balance":
      return reply(
        jid,
        `💰 Balance kamu: Rp${user.balance.toLocaleString("id-ID")}`
      );

    case "limit":
      return reply(
        jid,
        `🎟️ Limit kamu: ${user.limit}`
      );

    case "level":
      return reply(
        jid,
        `📈 Level kamu: ${user.level}\n⭐ XP: ${user.xp}`
      );

    case "cekpremium":
      return reply(
        jid,
        isPremium(sender)
          ? "💎 Status Premium: AKTIF"
          : "❌ Status Premium: TIDAK AKTIF"
      );

    case "status":
      return reply(
        jid,
        `🤖 STATUS ZAZABOT

Bot : ${BOT_NAME}
Status : Online
Mode : ${publicMode ? "Public" : "Self"}
Runtime : ${runtime()}
Prefix : ${PREFIX}`
      );

    case "listcommand":
      return reply(
        jid,
        `📚 Total command: ${ALL_COMMANDS.length}

Gunakan:
${PREFIX}menu`
      );

    case "listpremium":
      return reply(
        jid,
        `💎 TOTAL PREMIUM: ${db.premium.length}

${db.premium.length
          ? db.premium.join("\n")
          : "Belum ada user premium."}`
      );

    case "buylimit":
      return reply(
        jid,
        `🎟️ PEMBELIAN LIMIT

Contoh:
${PREFIX}buylimit 10

Fitur pembayaran dapat disambungkan
ke sistem pembayaran Zaza Store.`
      );

    case "topglobal":
    case "toplocal": {
      const users = Object.entries(db.users)
        .sort(
          (a, b) =>
            (b[1].xp || 0) -
            (a[1].xp || 0)
        )
        .slice(0, 10);

      if (!users.length) {
        return reply(
          jid,
          "📊 Belum ada data ranking."
        );
      }

      let text =
        `🏆 TOP XP\n\n`;

      users.forEach(
        ([id, data], index) => {
          text +=
            `${index + 1}. ${id}\n` +
            `   ⭐ XP: ${data.xp || 0}\n` +
            `   📈 Level: ${data.level || 1}\n\n`;
        }
      );

      return reply(jid, text);
    }

    default:
      return false;
  }
  }

/* =========================================================
   OWNER COMMANDS
========================================================= */

async function handleOwnerCommand(
  command,
  jid,
  sender,
  args
) {
  if (!OWNER_COMMANDS.has(command)) {
    return false;
  }

  if (!isOwner(sender)) {
    await reply(
      jid,
      "❌ Perintah ini khusus Owner ZazaBot."
    );
    return true;
  }

  const target =
    args[0]
      ? (
          args[0].replace(/\D/g, "") +
          "@s.whatsapp.net"
        )
      : sender;

  const amount =
    Number(args[1] || args[0] || 0);

  switch (command) {

    case "addbalance":
      if (!amount) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}addbalance 628xxx 10000`
        );
      }

      addBalance(target, amount);

      return reply(
        jid,
        `✅ Balance berhasil ditambahkan.\n\n👤 ${target}\n💰 +Rp${amount.toLocaleString("id-ID")}`
      );


    case "delbalance":
      if (!amount) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}delbalance 628xxx 10000`
        );
      }

      removeBalance(target, amount);

      return reply(
        jid,
        `✅ Balance berhasil dikurangi.\n\n👤 ${target}\n💰 -Rp${amount.toLocaleString("id-ID")}`
      );


    case "addlimit":
      if (!amount) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}addlimit 628xxx 10`
        );
      }

      addLimit(target, amount);

      return reply(
        jid,
        `✅ Limit ditambahkan.\n\n👤 ${target}\n🎟️ +${amount}`
      );


    case "dellimit":
      if (!amount) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}dellimit 628xxx 10`
        );
      }

      removeLimit(target, amount);

      return reply(
        jid,
        `✅ Limit dikurangi.\n\n👤 ${target}\n🎟️ -${amount}`
      );


    case "addxp":
      if (!amount) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}addxp 628xxx 100`
        );
      }

      addXP(target, amount);

      return reply(
        jid,
        `✅ XP berhasil ditambahkan.\n\n👤 ${target}\n⭐ +${amount} XP`
      );


    case "delxp":
      if (!amount) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}delxp 628xxx 100`
        );
      }

      removeXP(target, amount);

      return reply(
        jid,
        `✅ XP berhasil dikurangi.\n\n👤 ${target}\n⭐ -${amount} XP`
      );


    case "addlevel": {
      const user =
        ensureUser(target);

      user.level +=
        Number(args[1] || 1);

      saveDatabase();

      return reply(
        jid,
        `✅ Level berhasil ditambahkan.\n\n👤 ${target}\n📈 Level: ${user.level}`
      );
    }


    case "dellevel": {
      const user =
        ensureUser(target);

      user.level =
        Math.max(
          1,
          user.level -
          Number(args[1] || 1)
        );

      saveDatabase();

      return reply(
        jid,
        `✅ Level berhasil dikurangi.\n\n👤 ${target}\n📈 Level: ${user.level}`
      );
    }


    case "resetbalance":
      ensureUser(target).balance = 0;
      saveDatabase();

      return reply(
        jid,
        `✅ Balance ${target} berhasil di-reset.`
      );


    case "resetlimit":
      ensureUser(target).limit = 20;
      saveDatabase();

      return reply(
        jid,
        `✅ Limit ${target} berhasil di-reset ke 20.`
      );


    case "resetxp":
      ensureUser(target).xp = 0;
      ensureUser(target).level = 1;
      saveDatabase();

      return reply(
        jid,
        `✅ XP dan level ${target} berhasil di-reset.`
      );


    case "addpremium":
      addPremium(target);

      return reply(
        jid,
        `💎 ${target} sekarang menjadi PREMIUM.`
      );


    case "delpremium":
      removePremium(target);

      return reply(
        jid,
        `❌ Premium ${target} berhasil dihapus.`
      );


    case "ban":
    case "blacklistglobal":
      banUser(target);

      return reply(
        jid,
        `🚫 ${target} berhasil dibanned.`
      );


    case "unban":
      unbanUser(target);

      return reply(
        jid,
        `✅ ${target} berhasil di-unban.`
      );


    case "block":
      if (!db.blocked.includes(target)) {
        db.blocked.push(target);
        saveDatabase();
      }

      try {
        await sock.updateBlockStatus(
          target,
          "block"
        );
      } catch {}

      return reply(
        jid,
        `🚫 ${target} berhasil diblokir.`
      );


    case "unblock":
      db.blocked =
        db.blocked.filter(
          id => !sameUser(id, target)
        );

      saveDatabase();

      try {
        await sock.updateBlockStatus(
          target,
          "unblock"
        );
      } catch {}

      return reply(
        jid,
        `✅ ${target} berhasil di-unblock.`
      );


    case "public":
      publicMode = true;

      return reply(
        jid,
        "🌐 ZazaBot sekarang PUBLIC."
      );


    case "self":
      publicMode = false;

      return reply(
        jid,
        "🔒 ZazaBot sekarang SELF."
      );


    case "listpremium":
      return reply(
        jid,
        `💎 LIST PREMIUM

${db.premium.length
          ? db.premium.join("\n")
          : "Belum ada user premium."}`
      );


    case "listban":
    case "listblacklistglobal":
      return reply(
        jid,
        `🚫 LIST BAN

${db.banned.length
          ? db.banned.join("\n")
          : "Tidak ada user yang diban."}`
      );


    default:
      return reply(
        jid,
        commandHelp(command)
      );
  }
          }
/* =========================================================
   GROUP COMMANDS
========================================================= */

async function handleGroupCommand(
  command,
  jid,
  sender,
  args,
  msg
) {
  if (!GROUP_COMMANDS.has(command)) {
    return false;
  }

  if (!groupOnly(jid)) {
    await reply(
      jid,
      "❌ Perintah ini hanya dapat digunakan di grup."
    );
    return true;
  }

  const adminCommands = [
    "add",
    "kick",
    "promote",
    "demote",
    "banmember",
    "unbanmember",
    "tagall",
    "hidetag",
    "setnamegc",
    "setdescgc",
    "setopen",
    "setclose",
    "setwarn",
    "resetwarn",
    "blacklist",
    "delblacklist",
    "resetblacklist",
    "mute",
    "pinmsg",
    "unpinmsg",
    "setwelcome",
    "setleft"
  ];

  if (adminCommands.includes(command)) {
    const allowed =
      await requireAdmin(
        jid,
        sender
      );

    if (!allowed) {
      return true;
    }
  }

  const group =
    ensureGroup(jid);

  switch (command) {

    case "groupinfo": {
      const metadata =
        await sock.groupMetadata(jid);

      return reply(
        jid,
        `👥 GROUP INFO

📛 Nama: ${metadata.subject}
🆔 ID: ${jid}
👤 Member: ${metadata.participants.length}
👑 Admin: ${
          metadata.participants
            .filter(p =>
              participantIsAdmin(p)
            ).length
        }`
      );
    }


    case "groupadmin": {
      const metadata =
        await sock.groupMetadata(jid);

      const admins =
        metadata.participants
          .filter(p =>
            participantIsAdmin(p)
          );

      let text =
        "👑 ADMIN GRUP\n\n";

      admins.forEach(
        (p, i) => {
          text +=
            `${i + 1}. @${normalizeJid(
              p.id || p.jid || ""
            ).split("@")[0]}\n`;
        }
      );

      return sock.sendMessage(
        jid,
        {
          text,
          mentions: admins.map(
            p =>
              p.id ||
              p.jid ||
              p.participant
          )
        }
      );
    }


    case "tagall":
    case "hidetag": {
      const metadata =
        await sock.groupMetadata(jid);

      const participants =
        metadata.participants || [];

      const mentions =
        participants.map(
          p =>
            p.id ||
            p.jid ||
            p.participant
        );

      let text =
        command === "tagall"
          ? "📢 TAG ALL\n\n"
          : "📢 HIDETAG\n\n";

      participants.forEach(
        (p, i) => {
          const id =
            p.id ||
            p.jid ||
            p.participant ||
            "";

          text +=
            `${i + 1}. @${normalizeJid(id)
              .split("@")[0]}\n`;
        }
      );

      return sock.sendMessage(
        jid,
        {
          text,
          mentions
        }
      );
    }


    case "add": {
      const number =
        args[0]?.replace(/\D/g, "");

      if (!number) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}add 628xxx`
        );
      }

      try {
        await sock.groupParticipantsUpdate(
          jid,
          [`${number}@s.whatsapp.net`],
          "add"
        );

        return reply(
          jid,
          `✅ Berhasil menambahkan +${number}`
        );
      } catch (error) {
        return reply(
          jid,
          `❌ Gagal menambahkan nomor.\n\n${error.message}`
        );
      }
    }


    case "kick":
    case "banmember": {
      const target =
        getMentionTarget(
          msg,
          args
        );

      if (!target) {
        return reply(
          jid,
          `Tag member terlebih dahulu.\n\nContoh:\n${PREFIX}${command} @628xxx`
        );
      }

      try {
        await sock.groupParticipantsUpdate(
          jid,
          [target],
          "remove"
        );

        return reply(
          jid,
          `✅ Member berhasil dikeluarkan.`
        );
      } catch (error) {
        return reply(
          jid,
          `❌ Gagal mengeluarkan member.\n\n${error.message}`
        );
      }
    }


    case "promote": {
      const target =
        getMentionTarget(
          msg,
          args
        );

      if (!target) {
        return reply(
          jid,
          `Tag member terlebih dahulu.`
        );
      }

      await sock.groupParticipantsUpdate(
        jid,
        [target],
        "promote"
      );

      return reply(
        jid,
        "✅ Member berhasil dijadikan admin."
      );
    }


    case "demote": {
      const target =
        getMentionTarget(
          msg,
          args
        );

      if (!target) {
        return reply(
          jid,
          `Tag admin yang ingin diturunkan.`
        );
      }

      await sock.groupParticipantsUpdate(
        jid,
        [target],
        "demote"
      );

      return reply(
        jid,
        "✅ Admin berhasil diturunkan."
      );
    }


    case "kickme":
    case "left":
      try {
        await sock.groupParticipantsUpdate(
          jid,
          [sender],
          "remove"
        );
      } catch (error) {
        await reply(
          jid,
          `❌ Gagal keluar dari grup.\n\n${error.message}`
        );
      }

      return true;


    case "setnamegc": {
      const name =
        cleanText(args.join(" "));

      if (!name) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}setnamegc Nama Grup Baru`
        );
      }

      await sock.groupUpdateSubject(
        jid,
        name
      );

      return reply(
        jid,
        "✅ Nama grup berhasil diubah."
      );
    }


    case "setdescgc": {
      const desc =
        cleanText(args.join(" "));

      if (!desc) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}setdescgc Deskripsi grup`
        );
      }

      await sock.groupUpdateDescription(
        jid,
        desc
      );

      return reply(
        jid,
        "✅ Deskripsi grup berhasil diubah."
      );
    }


    case "setopen":
      await sock.groupSettingUpdate(
        jid,
        "not_announcement"
      );

      return reply(
        jid,
        "🔓 Grup dibuka. Semua member dapat mengirim pesan."
      );


    case "setclose":
      await sock.groupSettingUpdate(
        jid,
        "announcement"
      );

      return reply(
        jid,
        "🔒 Grup ditutup. Hanya admin yang dapat mengirim pesan."
      );


    case "linkgc": {
      try {
        const code =
          await sock.groupInviteCode(jid);

        return reply(
          jid,
          `🔗 LINK GRUP\n\nhttps://chat.whatsapp.com/${code}`
        );
      } catch (error) {
        return reply(
          jid,
          `❌ Gagal mengambil link grup.\n\n${error.message}`
        );
      }
    }


    case "revokelink": {
      try {
        await sock.groupRevokeInvite(jid);

        return reply(
          jid,
          "✅ Link grup berhasil di-reset."
        );
      } catch (error) {
        return reply(
          jid,
          `❌ Gagal reset link.\n\n${error.message}`
        );
      }
    }


    case "warn": {
      const target =
        getMentionTarget(
          msg,
          args
        ) || sender;

      group.warn[target] =
        (group.warn[target] || 0) + 1;

      ensureUser(target).warn =
        group.warn[target];

      saveDatabase();

      return reply(
        jid,
        `⚠️ Warning diberikan.\n\nJumlah warn: ${group.warn[target]}`
      );
    }


    case "cekwarn": {
      const target =
        getMentionTarget(
          msg,
          args
        ) || sender;

      const total =
        group.warn[target] || 0;

      return reply(
        jid,
        `⚠️ Warn @${normalizeJid(target)
          .split("@")[0]}: ${total}`
      );
    }


    case "resetwarn": {
      const target =
        getMentionTarget(
          msg,
          args
        ) || sender;

      group.warn[target] = 0;

      ensureUser(target).warn = 0;

      saveDatabase();

      return reply(
        jid,
        "✅ Warn berhasil di-reset."
      );
    }


    default:
      return reply(
        jid,
        `✅ ${PREFIX}${command} terdeteksi dan siap digunakan.\n\nGunakan ${PREFIX}menu untuk melihat daftar command.`
      );
  }
    }
/* =========================================================
   STICKER COMMANDS
========================================================= */

async function makeTextSticker(text) {
  text = cleanText(text || "ZazaBot");

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg"
       width="512"
       height="512">
    <rect
      width="512"
      height="512"
      rx="80"
      fill="white"/>
    <text
      x="256"
      y="270"
      text-anchor="middle"
      font-family="Arial"
      font-size="52"
      font-weight="bold"
      fill="black">
      ${text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}
    </text>
  </svg>`;

  return sharp(
    Buffer.from(svg)
  )
    .webp({
      quality: 90
    })
    .toBuffer();
}


async function handleStickerCommand(
  command,
  jid,
  msg,
  args
) {

  /* =========================
     TEXT STICKER
  ========================= */

  if (
    command === "brat" ||
    command === "ttp" ||
    command === "attp"
  ) {
    const text =
      args.join(" ").trim();

    if (!text) {
      return reply(
        jid,
        `Contoh:\n${PREFIX}${command} ZazaBot`
      );
    }

    try {
      const sticker =
        await makeTextSticker(text);

      await sock.sendMessage(
        jid,
        {
          sticker
        }
      );

      return true;

    } catch (error) {
      return reply(
        jid,
        `❌ Gagal membuat sticker.\n\n${error.message}`
      );
    }
  }


  /* =========================
     IMAGE → STICKER
  ========================= */

  if (command === "sticker") {

    let imageMessage = null;

    const direct =
      msg?.message?.imageMessage;

    if (direct) {
      imageMessage = direct;
    }

    const quoted =
      getQuotedMessage(msg);

    if (
      !imageMessage &&
      quoted?.imageMessage
    ) {
      imageMessage =
        quoted.imageMessage;
    }

    if (!imageMessage) {
      return reply(
        jid,
        `🖼️ Kirim atau reply gambar dengan caption ${PREFIX}sticker`
      );
    }

    try {

      const buffer =
        await downloadMedia(
          imageMessage,
          "image"
        );

      const sticker =
        await sharp(buffer)
          .resize(
            512,
            512,
            {
              fit: "contain",
              background: {
                r: 0,
                g: 0,
                b: 0,
                alpha: 0
              }
            }
          )
          .webp({
            quality: 90
          })
          .toBuffer();

      await sock.sendMessage(
        jid,
        {
          sticker
        }
      );

      return true;

    } catch (error) {

      return reply(
        jid,
        `❌ Gagal membuat sticker.\n\n${error.message}`
      );
    }
  }


  /* =========================
     STICKER → IMAGE
  ========================= */

  if (command === "toimg") {

    const quoted =
      getQuotedMessage(msg);

    const stickerMessage =
      quoted?.stickerMessage ||
      msg?.message?.stickerMessage;

    if (!stickerMessage) {
      return reply(
        jid,
        `Reply sticker dengan ${PREFIX}toimg`
      );
    }

    try {

      const buffer =
        await downloadMedia(
          stickerMessage,
          "sticker"
        );

      const image =
        await sharp(buffer)
          .png()
          .toBuffer();

      await sock.sendMessage(
        jid,
        {
          image
        }
      );

      return true;

    } catch (error) {

      return reply(
        jid,
        `❌ Gagal mengubah sticker menjadi gambar.\n\n${error.message}`
      );
    }
  }


  return false;
}
/* =========================================================
   TOOLS COMMANDS
========================================================= */

async function handleToolsCommand(
  command,
  jid,
  args
) {
  const text =
    args.join(" ").trim();

  switch (command) {

    case "ebase64": {
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}ebase64 halo`
        );
      }

      const result =
        Buffer.from(text, "utf8")
          .toString("base64");

      return reply(
        jid,
        `🔐 BASE64 ENCODE\n\n${result}`
      );
    }


    case "dbase64": {
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}dbase64 aGVsbG8=`
        );
      }

      try {
        const result =
          Buffer.from(
            text,
            "base64"
          ).toString("utf8");

        return reply(
          jid,
          `🔓 BASE64 DECODE\n\n${result}`
        );

      } catch {
        return reply(
          jid,
          "❌ Base64 tidak valid."
        );
      }
    }


    case "ehex": {
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}ehex halo`
        );
      }

      const result =
        Buffer.from(text, "utf8")
          .toString("hex");

      return reply(
        jid,
        `🔐 HEX ENCODE\n\n${result}`
      );
    }


    case "dhex": {
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}dhex 68656c6c6f`
        );
      }

      try {
        const result =
          Buffer.from(
            text,
            "hex"
          ).toString("utf8");

        return reply(
          jid,
          `🔓 HEX DECODE\n\n${result}`
        );

      } catch {
        return reply(
          jid,
          "❌ Hex tidak valid."
        );
      }
    }


    case "enc":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}enc halo`
        );
      }

      return reply(
        jid,
        `🔐 ENCODE\n\n${encodeURIComponent(text)}`
      );


    case "dec":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}dec%20halo`
        );
      }

      try {
        return reply(
          jid,
          `🔓 DECODE\n\n${decodeURIComponent(text)}`
        );
      } catch {
        return reply(
          jid,
          "❌ Format decode tidak valid."
        );
      }


    case "qrcode": {
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}qrcode https://example.com`
        );
      }

      try {

        const buffer =
          await QRCode.toBuffer(
            text,
            {
              type: "png",
              width: 800,
              margin: 2
            }
          );

        await sock.sendMessage(
          jid,
          {
            image: buffer,
            caption:
              `📱 QR CODE\n\n${text}`
          }
        );

        return true;

      } catch (error) {
        return reply(
          jid,
          `❌ Gagal membuat QR Code.\n\n${error.message}`
        );
      }
    }


    case "translate": {
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}translate en halo dunia`
        );
      }

      return reply(
        jid,
        `🌐 TRANSLATE

Fitur translate membutuhkan
layanan/API terjemahan.

Teks:
${text}`
      );
    }


    case "shortlink": {
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}shortlink https://example.com`
        );
      }

      return reply(
        jid,
        `🔗 SHORTLINK

URL diterima:
${text}

Layanan shortlink dapat
ditambahkan pada tahap API.`
      );
    }


    case "cekplatform":
      return reply(
        jid,
        `📱 CEK PLATFORM

Android/iOS/WhatsApp
terdeteksi melalui akun
yang sedang digunakan.`
      );


    case "randomnumber": {
      const min =
        Number(args[0]) || 1;

      const max =
        Number(args[1]) || 100;

      if (max < min) {
        return reply(
          jid,
          "❌ Nilai maksimum harus lebih besar."
        );
      }

      return reply(
        jid,
        `🎲 RANDOM NUMBER\n\n${randomNumber(
          min,
          max
        )}`
      );
    }


    default:
      return false;
  }
    }
/* =========================================================
   RANDOM & GAME COMMANDS
========================================================= */

async function handleGameCommand(
  command,
  jid,
  args
) {
  const text =
    args.join(" ").trim();

  switch (command) {

    case "math": {
      const a = randomNumber(1, 50);
      const b = randomNumber(1, 50);

      return reply(
        jid,
        `🧮 SOAL MATEMATIKA

Berapa hasil:

${a} + ${b} = ?

Jawab dengan:
${PREFIX}jawab ${a + b}`
      );
    }


    case "truth":
      return reply(
        jid,
        `🎯 TRUTH

${randomItem([
  "Apa hal paling memalukan yang pernah kamu lakukan?",
  "Siapa orang yang paling sering kamu chat?",
  "Apa cita-cita terbesar kamu?",
  "Apa rahasia kecil yang belum banyak orang tahu?",
  "Apa hal yang paling kamu takutkan?"
])}`
      );


    case "dare":
      return reply(
        jid,
        `🔥 DARE

${randomItem([
  "Kirim emoji 😂 sebanyak 10 kali.",
  "Tag teman yang paling sering membuatmu tertawa.",
  "Kirim pesan 'Aku keren 😎' di grup.",
  "Ganti status WhatsApp dengan emoji selama 5 menit.",
  "Kirim satu pantun spontan."
])}`
      );


    case "asahotak":
    case "tekateki":
      return reply(
        jid,
        `🧠 TEKA-TEKI

Aku punya banyak gigi,
tetapi tidak bisa menggigit.

Apakah aku?

💡 Gunakan ${PREFIX}hint jika menyerah.`
      );


    case "hint":
      return reply(
        jid,
        "💡 HINT: Benda ini sering digunakan untuk merapikan rambut."
      );


    case "tebakkata":
      return reply(
        jid,
        `📝 TEBAK KATA

Petunjuk:
Benda yang digunakan untuk menulis.

Jawaban: PENSIL ✏️`
      );


    case "caklontong":
      return reply(
        jid,
        `😂 CAK LONTONG

Kenapa ayam menyeberang jalan?

Jawaban:
Karena ayamnya mau ke seberang. 🐔`
      );


    case "siapakah":
    case "siapakahaku":
      return reply(
        jid,
        `❓ SIAPAKAH AKU?

Aku adalah sesuatu yang selalu
mengikuti kamu ketika ada cahaya.

Siapakah aku?

💡 ${PREFIX}hint`
      );


    case "sambungkata":
      return reply(
        jid,
        `🔤 SAMBUNG KATA

Kata pertama:

ZAZA

Lanjutkan kata berikutnya
dengan huruf terakhir.`
      );


    case "susunkata":
      return reply(
        jid,
        `🔀 SUSUN KATA

Susun huruf berikut:

T - O - K - O

Jawaban: TOKO 🏪`
      );


    case "tebakbendera":
      return reply(
        jid,
        `🏳️ TEBAK BENDERA

🇮🇩

Negara apakah ini?

Jawaban: Indonesia 🇮🇩`
      );


    case "tebakbom":
      return reply(
        jid,
        `💣 TEBAK BOM

Pilih angka 1 sampai 5.

${PREFIX}pilih 1`
      );


    case "family100":
      return reply(
        jid,
        `👨‍👩‍👧‍👦 FAMILY 100

Sebutkan benda yang biasanya
ada di kamar tidur.

1. Kasur
2. Bantal
3. Lemari
4. Selimut`
      );


    case "ulartangga":
      return reply(
        jid,
        `🐍 ULAR TANGGA

🎲 Kamu mendapatkan angka:
${randomNumber(1, 6)}

Game sederhana berhasil dimulai.`
      );


    case "uno":
      return reply(
        jid,
        `🃏 UNO

Game UNO ZazaBot aktif.

Gunakan:
${PREFIX}uno`
      );


    case "akinator":
    case "akinatorstart":
      return reply(
        jid,
        `🔮 AKINATOR

Mode Akinator aktif.

Pikirkan seseorang lalu jawab
pertanyaan berikut dengan:
ya / tidak / mungkin.`
      );


    case "akinatorstop":
      return reply(
        jid,
        "🛑 Game Akinator dihentikan."
      );


    case "redeem":
      return reply(
        jid,
        `🎁 REDEEM

Masukkan kode redeem:

${PREFIX}redeem KODE`
      );


    default:
      return false;
  }
}


/* =========================================================
   RANDOM COMMANDS
========================================================= */

async function handleRandomCommand(
  command,
  jid,
  args,
  sender
) {
  const text =
    args.join(" ").trim();

  switch (command) {

    case "apakah":
      return reply(
        jid,
        `🔮 ${text || "pertanyaan kamu"}\n\nJawaban: ${
          randomItem([
            "Iya",
            "Tidak",
            "Mungkin",
            "Kemungkinan besar iya",
            "Kemungkinan besar tidak"
          ])
        }`
      );


    case "cekkhodam":
      return reply(
        jid,
        `🔮 CEK KHODAM

Nama:
${text || sender}

Hasil:
${randomItem([
  "Macan Putih 🐯",
  "Naga Biru 🐉",
  "Harimau 🐅",
  "Kucing Oren 🐈",
  "Bebek Goreng 🦆",
  "Tidak terdeteksi 👻"
])}`
      );


    case "faktaunik":
      return reply(
        jid,
        `💡 FAKTA UNIK

${randomItem([
  "Madu dapat bertahan sangat lama jika disimpan dengan baik.",
  "Gurita memiliki tiga jantung.",
  "Pisang secara botani termasuk buah beri.",
  "Jantung manusia berdetak ribuan kali setiap hari."
])}`
      );


    case "katabijak":
      return reply(
        jid,
        `💭 KATA BIJAK

"${randomItem([
  "Jangan takut memulai dari kecil.",
  "Konsisten lebih penting daripada sempurna.",
  "Kegagalan adalah bagian dari proses belajar.",
  "Hari ini adalah kesempatan untuk menjadi lebih baik."
])}"`
      );


    case "pantun":
      return reply(
        jid,
        `🌸 PANTUN

Pergi ke pasar membeli ikan,
Ikan dibawa bersama teman.
Terus berusaha jangan menyerah,
Impian besar pasti tercapai kemudian.`
      );


    case "puisi":
      return reply(
        jid,
        `🌙 PUISI

Langkah kecil terus berjalan,
Mengejar mimpi penuh harapan.
Walau jalan penuh rintangan,
Tetap melangkah menuju tujuan.`
      );


    case "quotesanime":
      return reply(
        jid,
        `⚔️ QUOTES

"Jangan menyerah hanya karena
perjalananmu terasa sulit."`
      );


    case "rate": {
      const nilai =
        randomNumber(1, 100);

      return reply(
        jid,
        `⭐ RATE

${text || "Kamu"} mendapatkan nilai:

${nilai}/100`
      );
    }


    case "randomnumber": {
      const min =
        Number(args[0]) || 1;

      const max =
        Number(args[1]) || 100;

      return reply(
        jid,
        `🎲 Angka random:

${randomNumber(min, max)}`
      );
    }


    case "alay":
      return reply(
        jid,
        `✨ ALAY

${text
          ? text
              .split("")
              .map((c, i) =>
                i % 2
                  ? c.toUpperCase()
                  : c.toLowerCase()
              )
              .join("")
          : "Masukkan teks."}`
      );


    case "hilih":
      return reply(
        jid,
        text
          ? text.replace(
              /[aiueo]/gi,
              "i"
            )
          : "Masukkan teks."
      );


    case "halah":
      return reply(
        jid,
        text
          ? text.replace(
              /[aiueo]/gi,
              "a"
            )
          : "Masukkan teks."
      );


    case "huluh":
      return reply(
        jid,
        text
          ? text.replace(
              /[aiueo]/gi,
              "u"
            )
          : "Masukkan teks."
      );


    case "heleh":
      return reply(
        jid,
        text
          ? text.replace(
              /[aiueo]/gi,
              "e"
            )
          : "Masukkan teks."
      );


    case "holoh":
      return reply(
        jid,
        text
          ? text.replace(
              /[aiueo]/gi,
              "o"
            )
          : "Masukkan teks."
      );


    default:
      return false;
  }
        }
/* =========================================================
   AI / SEARCH / DOWNLOAD
========================================================= */

async function handleOnlineCommand(
  command,
  jid,
  args
) {
  const text =
    args.join(" ").trim();

  switch (command) {

    case "openai":
    case "bard":
    case "nexara":
    case "aiimage":
    case "jadianime":
    case "voicejapan":

      if (!text) {
        return reply(
          jid,
          `🤖 ${command.toUpperCase()}

Masukkan pertanyaan atau teks.

Contoh:
${PREFIX}${command} halo ZazaBot`
        );
      }

      return reply(
        jid,
        `🤖 ${command.toUpperCase()}

Permintaan diterima:

${text}

⚙️ API AI belum dikonfigurasi.
Setelah API dipasang, command ini
dapat menghasilkan jawaban otomatis.`
      );


    case "google":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}google cara membuat website`
        );
      }

      return reply(
        jid,
        `🔎 GOOGLE SEARCH

https://www.google.com/search?q=${encodeURIComponent(text)}`
      );


    case "googleimage":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}googleimage kucing`
        );
      }

      return reply(
        jid,
        `🖼️ GOOGLE IMAGE

https://www.google.com/search?tbm=isch&q=${encodeURIComponent(text)}`
      );


    case "wikipedia":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}wikipedia Indonesia`
        );
      }

      return reply(
        jid,
        `📚 WIKIPEDIA

https://id.wikipedia.org/wiki/${encodeURIComponent(text)}`
      );


    case "ytsearch":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}ytsearch lagu Indonesia`
        );
      }

      return reply(
        jid,
        `▶️ YOUTUBE SEARCH

https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`
      );


    case "pinterest":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}pinterest anime`
        );
      }

      return reply(
        jid,
        `📌 PINTEREST

https://www.pinterest.com/search/pins/?q=${encodeURIComponent(text)}`
      );


    case "play":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}play judul lagu`
        );
      }

      return reply(
        jid,
        `🎵 PLAY

Pencarian:
${text}

⚙️ Downloader audio akan
disambungkan melalui API.`
      );


    case "lirik":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}lirik judul lagu`
        );
      }

      return reply(
        jid,
        `🎵 LIRIK

Judul:
${text}

⚙️ API lirik belum dikonfigurasi.`
      );


    case "cuaca":
      return reply(
        jid,
        `🌤️ CUACA

Gunakan:
${PREFIX}cuaca Jakarta

⚙️ Data cuaca membutuhkan
API cuaca.`
      );


    case "jadwalshalat":
      return reply(
        jid,
        `🕌 JADWAL SHALAT

Contoh:
${PREFIX}jadwalshalat Jakarta

⚙️ Data jadwal membutuhkan
API jadwal shalat.`
      );


    case "ipchecker":
      return reply(
        jid,
        `🌐 IP CHECKER

Gunakan:
${PREFIX}ipchecker 8.8.8.8

⚙️ Pemeriksaan IP membutuhkan
layanan API.`
      );


    case "artinama":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}artinama Zaza`
        );
      }

      return reply(
        jid,
        `📖 ARTI NAMA

Nama:
${text}

Untuk hasil lengkap,
database nama dapat ditambahkan
pada tahap berikutnya.`
      );


    case "cekidff":
    case "cekidml":
      if (!text) {
        return reply(
          jid,
          `Contoh:\n${PREFIX}${command} 12345678`
        );
      }

      return reply(
        jid,
        `🎮 ${command.toUpperCase()}

ID:
${text}

⚙️ Pemeriksaan akun game
membutuhkan API game.`
      );


    case "download":
    case "tiktoknowm":
    case "tiktokwm":
    case "tiktokmusic":
    case "igdl":
    case "igreel":
    case "igstory":
    case "igtv":
    case "facebook":
    case "twitterdl":
    case "threads":
    case "douyin":
    case "mediafire":
    case "pindl":
    case "spotify":
    case "ytmp3":
    case "ytmp4":
    case "otakudesudl":

      if (!text) {
        return reply(
          jid,
          `📥 ${command.toUpperCase()}

Kirim URL yang ingin diproses.

Contoh:
${PREFIX}${command} https://...`
        );
      }

      return reply(
        jid,
        `📥 ${command.toUpperCase()}

URL diterima:
${text}

⚙️ Downloader ${command}
memerlukan API downloader.
Bot tidak akan memberikan
link/file palsu.`
      );


    default:
      return false;
  }
}
/* =========================================================
   MESSAGE HANDLER
========================================================= */

async function handleMessage(msg) {
  try {
    if (!msg?.message) return;

    const jid = getChatId(msg);
    const sender = getSender(msg);

    if (!jid || !sender) return;

    const text =
      getMessageText(msg).trim();

    if (!text) return;

    const parsed =
      parseCommand(text);

    /*
     * Hitung pesan user
     */
    const user =
      ensureUser(sender);

    user.messageCount =
      (user.messageCount || 0) + 1;

    if (groupOnly(jid)) {
      const group =
        ensureGroup(jid);

      group.messageCount =
        (group.messageCount || 0) + 1;
    }

    saveDatabase();

    /*
     * Abaikan user yang dibanned
     */
    if (
      isBanned(sender) &&
      !isOwner(sender)
    ) {
      return;
    }

    /*
     * Jika bukan command
     */
    if (!parsed) {
      return;
    }

    const {
      command,
      args
    } = parsed;

    /*
     * Command tidak dikenal
     */
    if (!commandExists(command)) {
      return;
    }

    /*
     * Mode SELF
     */
    if (
      !publicMode &&
      !isOwner(sender)
    ) {
      return;
    }

    /*
     * OWNER
     */
    if (
      OWNER_COMMANDS.has(command)
    ) {
      await handleOwnerCommand(
        command,
        jid,
        sender,
        args
      );

      return;
    }

    /*
     * GROUP
     */
    if (
      GROUP_COMMANDS.has(command)
    ) {
      await handleGroupCommand(
        command,
        jid,
        sender,
        args,
        msg
      );

      return;
    }

    /*
     * STICKER
     */
    if (
      CATEGORIES.STICKER
        .includes(command)
    ) {
      const result =
        await handleStickerCommand(
          command,
          jid,
          msg,
          args
        );

      if (result) return;
    }

    /*
     * TOOLS
     */
    if (
      CATEGORIES.TOOLS
        .includes(command)
    ) {
      const result =
        await handleToolsCommand(
          command,
          jid,
          args
        );

      if (result) return;
    }

    /*
     * GAME
     */
    if (
      CATEGORIES.GAME
        .includes(command)
    ) {
      const result =
        await handleGameCommand(
          command,
          jid,
          args
        );

      if (result) return;
    }

    /*
     * RANDOM
     */
    if (
      CATEGORIES.RANDOM
        .includes(command)
    ) {
      const result =
        await handleRandomCommand(
          command,
          jid,
          args,
          sender
        );

      if (result) return;
    }

    /*
     * AI / SEARCH / DOWNLOAD
     */
    if (
      CATEGORIES.AI.includes(command) ||
      CATEGORIES.SEARCH.includes(command) ||
      CATEGORIES.DOWNLOAD.includes(command)
    ) {
      const result =
        await handleOnlineCommand(
          command,
          jid,
          args
        );

      if (result) return;
    }

    /*
     * BASIC
     */
    await handleBasicCommand(
      command,
      jid,
      sender,
      args
    );

  } catch (error) {
    console.log(
      "MESSAGE ERROR:",
      error
    );

    try {
      await reply(
        getChatId(msg),
        `❌ Error: ${
          error?.message ||
          "Terjadi kesalahan."
        }`
      );
    } catch {}
  }
}


/* =========================================================
   BAILEYS EVENT
========================================================= */

function setupEvents() {

  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {

      for (const msg of messages) {

        if (
          !msg?.message
        ) continue;

        if (
          msg.key?.fromMe
        ) continue;

        await handleMessage(msg);
      }
    }
  );


  sock.ev.on(
    "connection.update",
    async ({
      connection,
      lastDisconnect,
      qr
    }) => {

      status =
        connection || status;

      console.log(
        "CONNECTION:",
        connection
      );

      /*
       * QR baru
       */
      if (qr) {
        try {

          qrImage =
            await QRCode.toDataURL(
              qr
            );

          console.log(
            "📱 QR ZAZABOT TERSEDIA"
          );

          console.log(
            "✅ QR berhasil dibuat"
          );

        } catch (error) {

          console.log(
            "QR ERROR:",
            error.message
          );
        }
      }


      /*
       * Berhasil tersambung
       */
      if (
        connection === "open"
      ) {

        status = "CONNECTED";
        qrImage = "";

        console.log(
          "================================"
        );

        console.log(
          `🤖 ${BOT_NAME} ONLINE`
        );

        console.log(
          `📱 ${getBotNumber()}`
        );

        console.log(
          "================================"
        );
      }


      /*
       * Terputus
       */
      if (
        connection === "close"
      ) {

        status = "DISCONNECTED";

        const code =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        console.log(
          "DISCONNECT CODE:",
          code
        );

        /*
         * Jangan reconnect jika logout
         */
        if (
          code === DisconnectReason.loggedOut
        ) {

          console.log(
            "❌ Session logout."
          );

          console.log(
            "Hapus folder session lalu scan QR baru."
          );

          return;
        }

        /*
         * Reconnect otomatis
         */
        if (reconnectTimer) {
          clearTimeout(
            reconnectTimer
          );
        }

        reconnectTimer =
          setTimeout(
            () => {
              startBot();
            },
            5000
          );
      }
    }
  );
      }

/* =========================================================
   WEB SERVER QR ZAZABOT
========================================================= */

function startWebServer() {

  const server = http.createServer(
    async (req, res) => {

      try {

        /*
         * HEADERS
         */
        res.setHeader(
          "Content-Type",
          "text/html; charset=utf-8"
        );

        /*
         * HALAMAN UTAMA
         */
        if (
          req.url === "/" ||
          req.url === "/qr"
        ) {

          const connected =
            status === "CONNECTED";

          const qrContent =
            connected
              ? `
                <div class="success">
                  ✅ ZazaBot sudah terhubung
                </div>
              `
              : qrImage
                ? `
                  <img
                    src="${qrImage}"
                    class="qr"
                  />

                  <p>
                    📱 Scan QR menggunakan
                    WhatsApp di HP.
                  </p>

                  <p>
                    Jika QR kadaluarsa,
                    refresh halaman.
                  </p>
                `
                : `
                  <div class="loading">
                    ⏳ Menunggu QR...
                  </div>
                `;

          res.end(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport"
      content="width=device-width,initial-scale=1">

<title>${BOT_NAME}</title>

<style>

body {
  margin: 0;
  padding: 20px;
  font-family: Arial, sans-serif;
  background: #071b3a;
  color: white;
  text-align: center;
}

.container {
  max-width: 500px;
  margin: auto;
  padding: 25px;
}

h1 {
  margin-bottom: 5px;
}

.logo {
  font-size: 50px;
  margin-bottom: 10px;
}

.card {
  background: white;
  color: #111;
  padding: 25px;
  border-radius: 20px;
  margin-top: 20px;
}

.qr {
  width: 280px;
  max-width: 90%;
  border-radius: 10px;
}

.success {
  padding: 20px;
  border-radius: 15px;
  background: #d9ffd9;
  color: #075c07;
  font-weight: bold;
}

.loading {
  padding: 20px;
  font-size: 18px;
}

.info {
  margin-top: 20px;
  font-size: 14px;
  opacity: .8;
}

button {
  border: none;
  padding: 12px 20px;
  border-radius: 10px;
  background: #075cff;
  color: white;
  font-weight: bold;
}

</style>

<script>
setTimeout(function(){
  location.reload();
}, 5000);
</script>

</head>

<body>

<div class="container">

  <div class="logo">
    🤖
  </div>

  <h1>${BOT_NAME}</h1>

  <p>
    WhatsApp Bot
  </p>

  <div class="card">

    ${qrContent}

  </div>

  <div class="info">

    Status:
    <b>${status}</b>

    <br><br>

    Prefix:
    <b>${PREFIX}</b>

    <br><br>

    Bot:
    <b>${getBotNumber()}</b>

  </div>

</div>

</body>
</html>
          `);

          return;
        }


        /*
         * STATUS API
         */
        if (
          req.url === "/status"
        ) {

          res.setHeader(
            "Content-Type",
            "application/json"
          );

          res.end(
            JSON.stringify({
              bot: BOT_NAME,
              number: getBotNumber(),
              status,
              prefix: PREFIX,
              connected:
                status === "CONNECTED"
            })
          );

          return;
        }


        /*
         * 404
         */
        res.statusCode = 404;

        res.end(
          "404 - Not Found"
        );

      } catch (error) {

        console.log(
          "WEB ERROR:",
          error
        );

        res.statusCode = 500;

        res.end(
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
        "🌐 ZazaBot Web Server AKTIF"
      );

      console.log(
        `PORT: ${PORT}`
      );

      console.log(
        "================================"
      );
    }
  );

  return server;
    }
/* =========================================================
   START BOT
========================================================= */

async function startBot() {

  try {

    status = "CONNECTING";

    console.log(
      "================================"
    );

    console.log(
      `🚀 STARTING ${BOT_NAME}`
    );

    console.log(
      "================================"
    );


    /*
     * Authentication
     */
    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      SESSION_DIR
    );


    /*
     * Buat koneksi WhatsApp
     */
    sock = makeWASocket({

      auth: state,

      logger: pino({
        level: "silent"
      }),

      browser:
        Browsers.ubuntu(
          BOT_NAME
        ),

      printQRInTerminal: false,

      generateHighQualityLinkPreview:
        false,

      syncFullHistory: false

    });


    /*
     * Simpan credential
     */
    sock.ev.on(
      "creds.update",
      saveCreds
    );


    /*
     * Pasang event
     */
    setupEvents();


    console.log(
      "✅ Baileys berhasil dijalankan."
    );


  } catch (error) {

    status = "ERROR";

    console.log(
      "================================"
    );

    console.log(
      "❌ START BOT ERROR"
    );

    console.log(
      error
    );

    console.log(
      "================================"
    );


    /*
     * Coba restart otomatis
     */
    if (reconnectTimer) {
      clearTimeout(
        reconnectTimer
      );
    }

    reconnectTimer =
      setTimeout(
        () => {
          startBot();
        },
        10000
      );
  }
}


/* =========================================================
   START WEB + BOT
========================================================= */

console.log(
  "================================"
);

console.log(
  `🤖 ${BOT_NAME}`
);

console.log(
  "ZazaBot sedang dimulai..."
);

console.log(
  "================================"
);


/*
 * Jalankan Web QR
 */
startWebServer();


/*
 * Jalankan WhatsApp Bot
 */
startBot();
  
