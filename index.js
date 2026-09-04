import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  downloadContentFromMessage
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode";
import sharp from "sharp";
import http from "http";
import fs from "fs";

const BOT_NAME = "zazasza";
const OWNER_NUMBER = "6289630747010";
const PREFIX = ".";

const PORT = process.env.PORT || 8080;
const DB_FILE = "./database.json";

let qrImage = "";
let connectionStatus = "STARTING";
let startTime = Date.now();
let reconnecting = false;

// ==========================================
// DATABASE
// ==========================================

let db = {
  users: {},
  groups: {},
  banned: [],
  blocked: [],
  publicMode: true
};

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(
        DB_FILE,
        "utf8"
      );

      if (data.trim()) {
        db = JSON.parse(data);
      }
    }
  } catch (err) {
    console.log(
      "Database error:",
      err.message
    );
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (err) {
    console.log(
      "Save database error:",
      err.message
    );
  }
}

loadDatabase();

// ==========================================
// USER
// ==========================================

function getUser(jid) {
  if (!db.users[jid]) {
    db.users[jid] = {
      balance: 0,
      limit: 20,
      xp: 0,
      level: 1,
      premium: false,
      warn: 0
    };

    saveDatabase();
  }

  return db.users[jid];
}

// ==========================================
// GROUP
// ==========================================

function getGroup(jid) {
  if (!db.groups[jid]) {
    db.groups[jid] = {
      welcome: false,
      left: false,
      antilink: false,
      antilinknokick: false,
      blacklist: [],
      warns: {}
    };

    saveDatabase();
  }

  return db.groups[jid];
}

// ==========================================
// OWNER
// ==========================================

function isOwner(jid) {
  if (!jid) return false;

  const number = jid
    .split("@")[0]
    .split(":")[0];

  return number === OWNER_NUMBER;
}

// ==========================================
// TEXT
// ==========================================

function getText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    msg.message?.documentMessage?.caption ||
    ""
  );
}

// ==========================================
// SENDER
// ==========================================

function getSender(msg) {
  return (
    msg.key.participant ||
    msg.key.remoteJid
  );
}

// ==========================================
// TARGET
// ==========================================

function getTarget(msg, args = []) {
  const context =
    msg.message
      ?.extendedTextMessage
      ?.contextInfo;

  if (
    context?.mentionedJid &&
    context.mentionedJid.length
  ) {
    return context.mentionedJid[0];
  }

  if (context?.participant) {
    return context.participant;
  }

  if (args[0]) {
    let number =
      args[0].replace(/\D/g, "");

    if (number.startsWith("0")) {
      number =
        "62" +
        number.slice(1);
    }

    if (number.length >= 8) {
      return (
        number +
        "@s.whatsapp.net"
      );
    }
  }

  return null;
}

// ==========================================
// RANDOM
// ==========================================

function randomItem(array) {
  return array[
    Math.floor(
      Math.random() *
      array.length
    )
  ];
}

// ==========================================
// DOWNLOAD MEDIA
// ==========================================

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

// ==========================================
// SEND
// ==========================================

async function send(
  sock,
  jid,
  text,
  options = {}
) {
  return sock.sendMessage(
    jid,
    {
      text,
      ...options
    }
  );
}

// ==========================================
// GROUP CHECK
// ==========================================

async function requireGroup(
  sock,
  jid
) {
  if (!jid.endsWith("@g.us")) {
    await send(
      sock,
      jid,
      "❌ Command ini hanya bisa digunakan di grup."
    );

    return false;
  }

  return true;
}

// ==========================================
// FIND PARTICIPANT
// ==========================================

function findParticipant(
  metadata,
  jid
) {
  if (!metadata?.participants) {
    return null;
  }

  return metadata.participants.find(
    p =>
      p.id === jid ||
      p.jid === jid ||
      p.lid === jid ||
      p.participant === jid
  );
}

// ==========================================
// ADMIN
// ==========================================

function isAdminParticipant(
  participant
) {
  return (
    participant?.admin === "admin" ||
    participant?.admin === "superadmin"
  );
}

function isGroupAdmin(
  metadata,
  jid
) {
  return isAdminParticipant(
    findParticipant(
      metadata,
      jid
    )
  );
}

// ==========================================
// REQUIRE ADMIN
// ==========================================

async function requireAdmin(
  sock,
  msg,
  jid
) {
  if (
    !await requireGroup(
      sock,
      jid
    )
  ) {
    return false;
  }

  const metadata =
    await sock.groupMetadata(
      jid
    );

  const sender =
    getSender(msg);

  const bot =
    sock.user?.id;

  if (
    !isGroupAdmin(
      metadata,
      sender
    )
  ) {
    await send(
      sock,
      jid,
      "❌ Command ini khusus admin grup."
    );

    return false;
  }

  if (
    !isGroupAdmin(
      metadata,
      bot
    )
  ) {
    await send(
      sock,
      jid,
      "❌ Jadikan ZazaBot sebagai admin grup terlebih dahulu."
    );

    return false;
  }

  return true;
}

// ==========================================
// WEB SERVER QR
// ==========================================

const server =
  http.createServer(
    (req, res) => {

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

<meta
name="viewport"
content="width=device-width,initial-scale=1">

<meta
http-equiv="refresh"
content="5">

<title>ZazaBot</title>

<style>

body {
  margin: 0;
  background: #071a35;
  color: white;
  font-family: Arial;
  text-align: center;
}

.container {
  max-width: 450px;
  margin: 50px auto;
  padding: 30px;
}

.card {
  background: #102b52;
  padding: 30px;
  border-radius: 25px;
}

.logo {
  font-size: 60px;
}

.title {
  font-size: 32px;
  font-weight: bold;
}

.status {
  padding: 15px;
  margin: 20px 0;
  border-radius: 15px;
  background: #071a35;
}

.qr {
  width: 280px;
  max-width: 90%;
  padding: 10px;
  background: white;
  border-radius: 15px;
}

.small {
  opacity: .8;
}

</style>

</head>

<body>

<div class="container">

<div class="card">

<div class="logo">
🤖
</div>

<div class="title">
ZazaBot
</div>

<p>
WhatsApp Bot
</p>

<div class="status">

Status:
<b>
${connectionStatus}
</b>

</div>

${
  qrImage
    ? `
<p>
📱 Scan QR WhatsApp
</p>

<img
class="qr"
src="${qrImage}">
`
    : `
<p>
⏳ Menunggu QR...
</p>
`
}

<p class="small">
Bot: ${BOT_NAME}
</p>

<p class="small">
Owner: ${OWNER_NUMBER}
</p>

</div>

</div>

</body>

</html>
`);
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
      "🌐 ZAZABOT WEB SERVER AKTIF"
    );

    console.log(
      "PORT:",
      PORT
    );

    console.log(
      "================================"
    );
  }
);
// ==========================================
// MENU LENGKAP ZAZABOT
// ==========================================

const MENU = `
╭━━━〔 🤖 ZAZABOT 〕━━━╮
┃
┃ Bot    : zazasza
┃ Prefix : .
┃ Owner  : ${OWNER_NUMBER}
┃
┣━━〔 GROUP 〕━━
┃ .absen
┃ .add
┃ .addalarm
┃ .addbadword
┃ .addlist
┃ .updatelist
┃ .uplist
┃ .addpoin
┃ .addreminder
┃ .afk
┃ .antibadword
┃ .antibadwordnokick
┃ .antibot
┃ .antidelete
┃ .antilink
┃ .antilinkchannel
┃ .antilinknokick
┃ .antiluar
┃ .antimentionsw
┃ .antiviewonce
┃ .antiwame
┃ .antiwamenokick
┃ .banmember
┃ .blacklist
┃ .delblacklist
┃ .listblacklist
┃ .resetblacklist
┃ .cekabsen
┃ .cekidgroup
┃ .cekpoint
┃ .ceksewa
┃ .ceksewabyid
┃ .cekwarn
┃ .createschedulecall
┃ .delalarm
┃ .delbadword
┃ .delete
┃ .deleteabsen
┃ .deletepoin
┃ .deletetotalpesan
┃ .dellist
┃ .delreminder
┃ .delultahku
┃ .delwarn
┃ .demote
┃ .demotedetector
┃ .descgc
┃ .disablealarm
┃ .done
┃ .enablealarm
┃ .gamemode
┃ .getlist
┃ .groupadmin
┃ .groupinfo
┃ .groupschedule
┃ .groupsetting
┃ .grouptime
┃ .hidetag
┃ .kick
┃ .kickme
┃ .left
┃ .levelling
┃ .linkgc
┃ .revokelink
┃ .list
┃ .listalarm
┃ .listbadword
┃ .listbanmember
┃ .listpoint
┃ .listreminder
┃ .listtotalpesan
┃ .listultah
┃ .listwarn
┃ .mulaiabsen
┃ .mute
┃ .pinmsg
┃ .promote
┃ .promotedetector
┃ .proses
┃ .refreshgroup
┃ .resetalarm
┃ .resetbadword
┃ .resetlist
┃ .resetpoint
┃ .resetreminder
┃ .resettotalpesan
┃ .resetultahku
┃ .resetwarn
┃ .setdescgc
┃ .setnamegc
┃ .setopen
┃ .setclose
┃ .setppgc
┃ .setppgcpanjang
┃ .setproses
┃ .setdone
┃ .setwarn
┃ .setwelcome
┃ .setleft
┃ .setwelcometype
┃ .setlefttype
┃ .sider
┃ .tagall
┃ .tfpoint
┃ .totag
┃ .totalpesan
┃ .ultahku
┃ .unbanmember
┃ .unpinmsg
┃ .vote
┃ .warn
┃ .welcome
┃
┣━━〔 OWNER 〕━━
┃ .addbalance
┃ .addlevel
┃ .addlimit
┃ .addpremium
┃ .addrespon
┃ .addsewa
┃ .addsewathisgroup
┃ .addxp
┃ .anticall
┃ .anticallnoblock
┃ .antideletepc
┃ .autoleavegcnosewa
┃ .autonexara
┃ .autoread
┃ .autotype
┃ .ban
┃ .blacklistglobal
┃ .delblacklistglobal
┃ .listblacklistglobal
┃ .resetblacklistglobal
┃ .block
┃ .broadcast
┃ .bccancel
┃ .bcconfirm
┃ .bcgroup
┃ .bcgchidetag
┃ .bchidetag
┃ .bcmember
┃ .bcpremium
┃ .bcpc
┃ .bcsewa
┃ .bcstat
┃ .buttonmode
┃ .buttontojson
┃ .call
┃ .cekaccount
┃ .cekopenaikey
┃ .chatgroup
┃ .clearchat
┃ .copythumbnail
┃ .createbutton
┃ .createfullbutton
┃ .createlist
┃ .createredeem
┃ .createthumbnail
┃ .delbalance
┃ .dellevel
┃ .dellimit
┃ .delpremium
┃ .deleteredeem
┃ .delrespon
┃ .delsewa
┃ .delxp
┃ .freeautores
┃ .delfreeautores
┃ .listfreeautores
┃ .resetfreeautores
┃ .freecommand
┃ .delfreecommand
┃ .listfreecommand
┃ .resetfreecommand
┃ .globalgamemode
┃ .golink
┃ .grabcontact
┃ .grouponlypremium
┃ .inforedeem
┃ .inviteme
┃ .join
┃ .leaveall
┃ .leavegcbyid
┃ .levellingpc
┃ .listredeem
┃ .listrespon
┃ .listsewa
┃ .listsewapermanent
┃ .mutebc
┃ .mutebyid
┃ .mycontacts
┃ .onlygroup
┃ .onlyindo
┃ .onlyprem
┃ .pconlyprem
┃ .premiumgroup
┃ .promoteme
┃ .public
┃ .publicbyid
┃ .queue
┃ .react
┃ .refreshgroupbyid
┃ .refreshpremiumlist
┃ .resetanonymous
┃ .resetbalance
┃ .resetblacklistglobal
┃ .resetfreeautores
┃ .resetfreecommand
┃ .resetlevel
┃ .resetlimit
┃ .resetxp
┃ .resetlimitreceivedgroup
┃ .resetpremium
┃ .resetresponsee
┃ .self
┃ .selfbyid
┃ .setbio
┃ .setcommand
┃ .setdefaultweltype
┃ .setlimitgroup
┃ .setlimitreceivedgroup
┃ .setname
┃ .setopenaikey
┃ .setpp
┃ .setpppanjang
┃ .setwrsuit
┃ .setwrttt
┃ .testbutton
┃ .unban
┃ .unblock
┃ .unreact
┃ .upchannel
┃ .upres
┃ .upswgroup
┃ .upswmentiongroup
┃ .upswmentiongroupsilent
┃ .upswpremium
┃ .videocall
┃
┣━━〔 AI 〕━━
┃ .aiimage
┃ .bard
┃ .jadianime
┃ .nexara
┃ .byenexara
┃ .openai
┃ .voicejapan
┃
┣━━〔 GAME 〕━━
┃ .akinator
┃ .akinatorstart
┃ .akinatorstop
┃ .asahotak
┃ .caklontong
┃ .dare
┃ .family100
┃ .hint
┃ .math
┃ .nyerah
┃ .redeem
┃ .sambungkata
┃ .siapakahaku
┃ .sloth
┃ .susunkalimat
┃ .susunkata
┃ .susunlirik
┃ .tebakbendera
┃ .tebakbom
┃ .tebakchara
┃ .tebakfisika
┃ .tebakgambar
┃ .tebakkata
┃ .tebaklagu
┃ .tebaklaguanime
┃ .tebaklagukpop
┃ .tekateki
┃ .tfbalance
┃ .truth
┃ .ulartangga
┃ .uno
┃
┣━━〔 RANDOM 〕━━
┃ .alay
┃ .apakah
┃ .cekkhodam
┃ .faktaunik
┃ .husbu
┃ .jadian
┃ .kapankah
┃ .katabijak
┃ .loli
┃ .pantun
┃ .ppcouple
┃ .puisi
┃ .quotesanime
┃ .randomanime
┃ .randommeme
┃ .randomnumber
┃ .randomtag
┃ .rate
┃ .siapakah
┃ .neko
┃ .waifu
┃
┣━━〔 SEARCH 〕━━
┃ .alkitab
┃ .alquranaudio
┃ .artinama
┃ .brainly
┃ .cekidff
┃ .cekidml
┃ .cuaca
┃ .dorama
┃ .google
┃ .googleimage
┃ .igstalk
┃ .ipchecker
┃ .jadwalshalat
┃ .lirik
┃ .otakudesuinfo
┃ .otakudesuongoing
┃ .otakudesu
┃ .pinterest
┃ .play
┃ .wikipedia
┃ .ytsearch
┃
┣━━〔 STICKER 〕━━
┃ .attp
┃ .brat
┃ .bratvideo
┃ .delsetwm
┃ .quickchat
┃ .semoji
┃ .semojimix
┃ .setwm
┃ .sticker
┃ .stickercircle
┃ .stickerinfo
┃ .stickerly
┃ .smeme
┃ .snobg
┃ .stickerwm
┃ .takesticker
┃ .telestick
┃ .toimg
┃ .trigger
┃ .ttp
┃ .ziptelestick
┃
┣━━〔 TOOLS 〕━━
┃ .blur
┃ .cekplatform
┃ .ehex
┃ .dhex
┃ .ebase64
┃ .dbase64
┃ .enc
┃ .dec
┃ .fakereply
┃ .hartatahta
┃ .iqc
┃ .kirim
┃ .confess
┃ .menfess
┃ .nulis
┃ .folio
┃ .ocr
┃ .poll
┃ .ptvtovideo
┃ .qrcode
┃ .qrcodereader
┃ .readmore
┃ .readviewonce
┃ .removebackground
┃ .screenshot
┃ .shortlink
┃ .myemail
┃ .getemail
┃ .tomp3
┃ .tovn
┃ .toquickvideo
┃ .tourl
┃ .toviewonce
┃ .translate
┃ .tts
┃ .tts2
┃ .upscale
┃ .halah
┃ .hilih
┃ .huluh
┃ .heleh
┃ .holoh
┃ .ytcomment
┃
┣━━〔 INFO 〕━━
┃ .buylimit
┃ .cekpremium
┃ .infocovid
┃ .infogempa
┃ .infounsur
┃ .kodebahasa
┃ .leavenosewa
┃ .level
┃ .limit
┃ .balance
┃ .listban
┃ .listblock
┃ .listcommand
┃ .listgroup
┃ .listgroupnosewa
┃ .listonline
┃ .listpremium
┃ .listpremiumgroup
┃ .profile
┃ .report
┃ .status
┃ .topglobal
┃ .toplocal
┃
┣━━〔 DOWNLOAD 〕━━
┃ .douyin
┃ .facebook
┃ .igstory
┃ .igdl
┃ .igtv
┃ .igreel
┃ .mediafire
┃ .otakudesudl
┃ .pindl
┃ .spotify
┃ .threads
┃ .tiktoknowm
┃ .tiktokwm
┃ .tiktokmusic
┃ .twitterdl
┃ .ytmp3
┃ .ytmp4
┃
┣━━〔 TEXTMAKER 〕━━
┃ .window
┃ .blankpink
┃ .thunder
┃ .bear
┃ .cloud
┃ .neonlight
┃ .sand
┃ .glow
┃ .neon
┃ .sky
┃ .cartoon
┃ .greenneon
┃ .halloween
┃ .bokeh
┃ .firework
┃ .narutologo
┃ .colorneon
┃ .digitalglitch
┃ .wetglass
┃ .watercolor
┃ .pubglogo
┃ .fflogo
┃ .glitch
┃ .thor
┃ .wolf
┃ .phlogo
┃ .avangers
┃ .spacetext
┃ .marvel
┃ .graffiti
┃ .deadpool
┃ .lightglow
┃ .blackpink
┃ .dropwater
┃ .magma
┃ .pencil
┃ .bisnissign
┃ .batman
┃ .holo
┃
┣━━〔 GENERAL 〕━━
┃ .sewabot
┃ .premium
┃ .upbalance
┃ .upxp
┃ .uplevel
┃ .owner
┃ .ping
┃ .runtime
┃
╰━━━━━━━━━━━━━━━━━━╯
`;
// ==========================================
// PART 3 - COMMAND HANDLER & START BOT
// ==========================================

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: Browsers.ubuntu("ZazaBot"),
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sock.ev.on("creds.update", saveCreds);

  // ========================================
  // CONNECTION
  // ========================================

  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect,
      qr
    } = update;

    if (qr) {
      try {
        qrImage = await QRCode.toDataURL(qr);
        connectionStatus = "SCAN QR WHATSAPP";
        console.log("📱 QR ZAZABOT TERSEDIA");
      } catch (err) {
        console.log("QR ERROR:", err.message);
      }
    }

    if (connection === "connecting") {
      connectionStatus = "CONNECTING";
      console.log("🔄 ZazaBot connecting...");
    }

    if (connection === "open") {
      connectionStatus = "ONLINE";
      qrImage = "";
      reconnecting = false;

      console.log("================================");
      console.log("✅ ZAZABOT ONLINE");
      console.log("BOT:", BOT_NAME);
      console.log("NUMBER:", sock.user?.id);
      console.log("================================");
    }

    if (connection === "close") {
      connectionStatus = "DISCONNECTED";

      const code =
        lastDisconnect?.error?.output?.statusCode;

      console.log(
        "❌ CONNECTION CLOSED:",
        code
      );

      if (
        code !== DisconnectReason.loggedOut &&
        !reconnecting
      ) {
        reconnecting = true;

        setTimeout(() => {
          startBot();
        }, 3000);
      }
    }
  });

  // ========================================
  // WELCOME / LEFT
  // ========================================

  sock.ev.on(
    "group-participants.update",
    async (update) => {
      try {
        const {
          id,
          participants,
          action
        } = update;

        const group = getGroup(id);

        const metadata =
          await sock.groupMetadata(id);

        for (const user of participants) {
          const number =
            user.split("@")[0];

          if (
            action === "add" &&
            group.welcome
          ) {
            await sock.sendMessage(id, {
              text:
                `👋 *WELCOME*\n\n` +
                `Selamat datang @${number}!\n` +
                `🎉 Selamat bergabung di *${metadata.subject}*.\n\n` +
                `🤖 ${BOT_NAME}`,
              mentions: [user]
            });
          }

          if (
            action === "remove" &&
            group.left
          ) {
            await sock.sendMessage(id, {
              text:
                `👋 *GOODBYE*\n\n` +
                `Sampai jumpa @${number}!\n\n` +
                `🤖 ${BOT_NAME}`,
              mentions: [user]
            });
          }
        }
      } catch (err) {
        console.log(
          "GROUP PARTICIPANT ERROR:",
          err.message
        );
      }
    }
  );

  // ========================================
  // MESSAGE HANDLER
  // ========================================

  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {

      try {

        const msg = messages[0];

        if (!msg?.message) return;
        if (msg.key.fromMe) return;

        const jid =
          msg.key.remoteJid;

        if (!jid) return;

        const text =
          getText(msg).trim();

        if (!text) return;

        const sender =
          getSender(msg);

        const user =
          getUser(sender);

        const owner =
          isOwner(sender);

        // ==================================
        // PREFIX
        // ==================================

        if (!text.startsWith(PREFIX)) {
          return;
        }

        const body =
          text.slice(PREFIX.length).trim();

        if (!body) return;

        const split =
          body.split(/\s+/);

        const command =
          split.shift().toLowerCase();

        const args = split;

        const argText =
          args.join(" ");

        // ==================================
        // PUBLIC / SELF
        // ==================================

        if (
          !db.publicMode &&
          !owner
        ) {
          return;
        }

        // ==================================
        // BAN CHECK
        // ==================================

        if (
          db.banned.includes(sender) &&
          !owner
        ) {
          return send(
            sock,
            jid,
            "🚫 Kamu sedang dibanned."
          );
        }

        // ==================================
        // GENERAL
        // ==================================

        if (command === "menu") {
          return send(
            sock,
            jid,
            MENU
          );
        }

        if (command === "ping") {
          return send(
            sock,
            jid,
            "🏓 PONG!\n\nZazaBot aktif."
          );
        }

        if (command === "owner") {
          return send(
            sock,
            jid,
            `👑 *OWNER ZAZABOT*\n\n📱 https://wa.me/${OWNER_NUMBER}`
          );
        }

        if (command === "runtime") {

          const seconds =
            Math.floor(
              (Date.now() - startTime) /
              1000
            );

          const days =
            Math.floor(
              seconds / 86400
            );

          const hours =
            Math.floor(
              (seconds % 86400) /
              3600
            );

          const minutes =
            Math.floor(
              (seconds % 3600) /
              60
            );

          const secs =
            seconds % 60;

          return send(
            sock,
            jid,
            `⏱️ *RUNTIME*\n\n${days} hari ${hours} jam ${minutes} menit ${secs} detik`
          );
        }

        if (command === "status") {
          return send(
            sock,
            jid,
            `🤖 *ZAZABOT STATUS*\n\nStatus: ONLINE\nMode: ${
              db.publicMode
                ? "PUBLIC"
                : "SELF"
            }\nBot: ${BOT_NAME}`
          );
        }

        // ==================================
        // PROFILE
        // ==================================

        if (command === "profile") {

          return send(
            sock,
            jid,
            `👤 *PROFILE*\n\n` +
            `📱 Nomor: ${sender.split("@")[0]}\n` +
            `💰 Balance: ${user.balance}\n` +
            `🎟️ Limit: ${user.limit}\n` +
            `⭐ Level: ${user.level}\n` +
            `✨ XP: ${user.xp}\n` +
            `💎 Premium: ${
              user.premium
                ? "YES"
                : "NO"
            }`
          );

        }

        if (command === "balance") {

          return send(
            sock,
            jid,
            `💰 Balance kamu: *${user.balance}*`
          );

        }

        if (command === "limit") {

          return send(
            sock,
            jid,
            `🎟️ Limit kamu: *${user.limit}*`
          );

        }

        if (command === "level") {

          return send(
            sock,
            jid,
            `⭐ Level: *${user.level}*\n✨ XP: *${user.xp}*`
          );

        }

        if (command === "cekpremium") {

          return send(
            sock,
            jid,
            user.premium
              ? "💎 Kamu PREMIUM."
              : "❌ Kamu belum PREMIUM."
          );

        }

        // ==================================
        // GROUP COMMAND
        // ==================================

        const groupCommands = [
          "add",
          "kick",
          "promote",
          "demote",
          "tagall",
          "hidetag",
          "groupinfo",
          "groupadmin",
          "linkgc",
          "revokelink",
          "setnamegc",
          "setdescgc",
          "descgc",
          "setopen",
          "setclose",
          "kickme",
          "left",
          "warn",
          "cekwarn",
          "resetwarn",
          "blacklist",
          "delblacklist",
          "listblacklist",
          "antilink",
          "setwelcome",
          "setleft",
          "mute"
        ];

        if (
          groupCommands.includes(command)
        ) {

          if (
            !await requireGroup(
              sock,
              jid
            )
          ) return;

        }

        // ==================================
        // GROUP INFO
        // ==================================

        if (command === "groupinfo") {

          const metadata =
            await sock.groupMetadata(jid);

          return send(
            sock,
            jid,
            `👥 *GROUP INFO*\n\n` +
            `📌 Nama: ${metadata.subject}\n` +
            `👤 Member: ${metadata.participants.length}\n` +
            `🆔 ID:\n${jid}`
          );

        }

        if (command === "groupadmin") {

          const metadata =
            await sock.groupMetadata(jid);

          const admins =
            metadata.participants
              .filter(p =>
                isAdminParticipant(p)
              );

          const mentions =
            admins.map(p => p.id);

          const textAdmin =
            admins
              .map(
                p =>
                  `• @${p.id.split("@")[0]}`
              )
              .join("\n");

          return send(
            sock,
            jid,
            `👑 *ADMIN GRUP*\n\n${textAdmin}`,
            {
              mentions
            }
          );

        }

        // ==================================
        // ADMIN CHECK
        // ==================================

        const adminCommands = [
          "add",
          "kick",
          "promote",
          "demote",
          "revokelink",
          "setnamegc",
          "setdescgc",
          "descgc",
          "setopen",
          "setclose",
          "warn",
          "resetwarn",
          "blacklist",
          "delblacklist",
          "antilink",
          "setwelcome",
          "setleft",
          "mute"
        ];

        if (
          adminCommands.includes(command)
        ) {

          if (
            !await requireAdmin(
              sock,
              msg,
              jid
            )
          ) return;

        }

        // ==================================
        // ADD
        // ==================================

        if (command === "add") {

          const target =
            getTarget(msg, args);

          if (!target) {
            return send(
              sock,
              jid,
              "Contoh:\n.add 628xxxxxxxxxx"
            );
          }

          try {

            await sock.groupParticipantsUpdate(
              jid,
              [target],
              "add"
            );

            return send(
              sock,
              jid,
              "✅ Member berhasil ditambahkan."
            );

          } catch {

            return send(
              sock,
              jid,
              "❌ Gagal menambahkan member."
            );

          }
        }

        // ==================================
        // KICK
        // ==================================

        if (command === "kick") {

          const target =
            getTarget(msg, args);

          if (!target) {
            return send(
              sock,
              jid,
              "Reply/tag member yang ingin dikeluarkan."
            );
          }

          try {

            await sock.groupParticipantsUpdate(
              jid,
              [target],
              "remove"
            );

            return send(
              sock,
              jid,
              "✅ Member berhasil dikeluarkan."
            );

          } catch {

            return send(
              sock,
              jid,
              "❌ Gagal mengeluarkan member."
            );

          }
        }

        // ==================================
        // PROMOTE
        // ==================================

        if (command === "promote") {

          const target =
            getTarget(msg, args);

          if (!target) {
            return send(
              sock,
              jid,
              "Reply/tag member."
            );
          }

          try {

            await sock.groupParticipantsUpdate(
              jid,
              [target],
              "promote"
            );

            return send(
              sock,
              jid,
              "👑 Berhasil menjadikan admin."
            );

          } catch {

            return send(
              sock,
              jid,
              "❌ Gagal promote."
            );

          }
        }

        // ==================================
        // DEMOTE
        // ==================================

        if (command === "demote") {

          const target =
            getTarget(msg, args);

          if (!target) {
            return send(
              sock,
              jid,
              "Reply/tag admin."
            );
          }

          try {

            await sock.groupParticipantsUpdate(
              jid,
              [target],
              "demote"
            );

            return send(
              sock,
              jid,
              "✅ Berhasil demote admin."
            );

          } catch {

            return send(
              sock,
              jid,
              "❌ Gagal demote."
            );

          }
        }

        // ==================================
        // TAG ALL
        // ==================================

        if (
          command === "tagall" ||
          command === "hidetag"
        ) {

          const metadata =
            await sock.groupMetadata(jid);

          const mentions =
            metadata.participants.map(
              p => p.id
            );

          if (
            command === "hidetag"
          ) {

            return send(
              sock,
              jid,
              argText ||
              "📢 Pengumuman grup.",
              {
                mentions
              }
            );

          }

          let output =
            "📢 *TAG ALL*\n\n";

          for (
            const participant
            of metadata.participants
          ) {

            output +=
              `@${participant.id.split("@")[0]}\n`;

          }

          return send(
            sock,
            jid,
            output,
            {
              mentions
            }
          );

        }

        // ==================================
        // LINK GROUP
        // ==================================

        if (command === "linkgc") {

          try {

            const code =
              await sock.groupInviteCode(
                jid
              );

            return send(
              sock,
              jid,
              `🔗 *LINK GRUP*\n\nhttps://chat.whatsapp.com/${code}`
            );

          } catch {

            return send(
              sock,
              jid,
              "❌ Gagal mengambil link grup."
            );

          }

        }

        if (command === "revokelink") {

          try {

            await sock.groupRevokeInvite(
              jid
            );

            return send(
              sock,
              jid,
              "✅ Link grup berhasil direset."
            );

          } catch {

            return send(
              sock,
              jid,
              "❌ Gagal reset link."
            );

          }

        }

        // ==================================
        // SET GROUP NAME
        // ==================================

        if (
          command === "setnamegc"
        ) {

          if (!argText) {
            return send(
              sock,
              jid,
              "Contoh:\n.setnamegc Zaza Store"
            );
          }

          try {

            await sock.groupUpdateSubject(
              jid,
              argText
            );

            return send(
              sock,
              jid,
              "✅ Nama grup berhasil diubah."
            );

          } catch {

            return send(
              sock,
              jid,
              "❌ Gagal mengubah nama grup."
            );

          }

        }

        // ==================================
        // SET DESCRIPTION
        // ==================================

        if (
          command === "setdescgc" ||
          command === "descgc"
        ) {

          if (!argText) {
            return send(
              sock,
              jid,
              "Contoh:\n.setdescgc Deskripsi grup"
            );
          }

          try {

            await sock.groupUpdateDescription(
              jid,
              argText
            );

            return send(
              sock,
              jid,
              "✅ Deskripsi grup berhasil diubah."
            );

          } catch {

            return send(
              sock,
              jid,
              "❌ Gagal mengubah deskripsi."
            );

          }

        }

        // ==================================
        // OPEN / CLOSE GROUP
        // ==================================

        if (command === "setopen") {

          await sock.groupSettingUpdate(
            jid,
            "not_announcement"
          );

          return send(
            sock,
            jid,
            "🔓 Grup dibuka."
          );

        }

        if (command === "setclose") {

          await sock.groupSettingUpdate(
            jid,
            "announcement"
          );

          return send(
            sock,
            jid,
            "🔒 Grup ditutup."
          );

        }

        // ==================================
        // KICKME
        // ==================================

        if (command === "kickme") {

          try {

            await sock.groupParticipantsUpdate(
              jid,
              [sender],
              "remove"
            );

          } catch {

            return send(
              sock,
              jid,
              "❌ Gagal keluar dari grup."
            );

          }

          return;

        }

        // ==================================
        // LEAVE
        // ==================================

        if (command === "left") {

          await sock.groupLeave(jid);

          return;

        }

        // ==================================
        // WELCOME
        // ==================================

        if (command === "setwelcome") {

          const group =
            getGroup(jid);

          group.welcome =
            !group.welcome;

          saveDatabase();

          return send(
            sock,
            jid,
            `👋 Welcome ${
              group.welcome
                ? "AKTIF"
                : "NONAKTIF"
            }`
          );

        }

        if (command === "setleft") {

          const group =
            getGroup(jid);

          group.left =
            !group.left;

          saveDatabase();

          return send(
            sock,
            jid,
            `👋 Left ${
              group.left
                ? "AKTIF"
                : "NONAKTIF"
            }`
          );

        }

        // ==================================
        // ANTI LINK
        // ==================================

        if (command === "antilink") {

          const group =
            getGroup(jid);

          group.antilink =
            !group.antilink;

          saveDatabase();

          return send(
            sock,
           jid,
                `🔗 Anti-link: ${
      group.antilink
        ? "ON"
        : "OFF"
    }`
  );

}

// ==================================
// WARN
// ==================================

if (command === "warn") {

  const target =
    getTarget(msg, args);

  if (!target) {
    return send(
      sock,
      jid,
      "Reply/tag member."
    );
  }

  const group =
    getGroup(jid);

  if (!group.warns[target]) {
    group.warns[target] = 0;
  }

  group.warns[target]++;

  saveDatabase();

  return send(
    sock,
    jid,
    `⚠️ @${target.split("@")[0]} mendapat WARN ${group.warns[target]}/3`,
    {
      mentions: [target]
    }
  );

}

if (command === "cekwarn") {

  const target =
    getTarget(msg, args) ||
    sender;

  const group =
    getGroup(jid);

  const warn =
    group.warns[target] || 0;

  return send(
    sock,
    jid,
    `⚠️ Warn @${target.split("@")[0]}: ${warn}/3`,
    {
      mentions: [target]
    }
  );

}

if (command === "resetwarn") {

  const target =
    getTarget(msg, args);

  if (!target) {
    return send(
      sock,
      jid,
      "Reply/tag member."
    );
  }

  const group =
    getGroup(jid);

  delete group.warns[target];

  saveDatabase();

  return send(
    sock,
    jid,
    "✅ Warn berhasil direset."
  );

} 
      // ==========================================
// BLACKLIST
// ==========================================

if (command === "blacklist") {

  const target = getTarget(msg, args);

  if (!target) {
    return send(
      sock,
      jid,
      "❌ Reply/tag member yang ingin dimasukkan blacklist."
    );
  }

  const group = getGroup(jid);

  if (!group.blacklist.includes(target)) {
    group.blacklist.push(target);
  }

  saveDatabase();

  return send(
    sock,
    jid,
    `🚫 @${target.split("@")[0]} berhasil dimasukkan ke blacklist.`,
    {
      mentions: [target]
    }
  );
}

if (command === "delblacklist") {

  const target = getTarget(msg, args);

  if (!target) {
    return send(
      sock,
      jid,
      "❌ Reply/tag member."
    );
  }

  const group = getGroup(jid);

  group.blacklist =
    group.blacklist.filter(
      x => x !== target
    );

  saveDatabase();

  return send(
    sock,
    jid,
    "✅ Member berhasil dihapus dari blacklist."
  );
}

if (command === "listblacklist") {

  const group = getGroup(jid);

  if (!group.blacklist.length) {
    return send(
      sock,
      jid,
      "🚫 Blacklist masih kosong."
    );
  }

  const list =
    group.blacklist
      .map(
        x => `• @${x.split("@")[0]}`
      )
      .join("\n");

  return send(
    sock,
    jid,
    `🚫 *LIST BLACKLIST*\n\n${list}`,
    {
      mentions: group.blacklist
    }
  );
}

if (command === "resetblacklist") {

  const group = getGroup(jid);

  group.blacklist = [];

  saveDatabase();

  return send(
    sock,
    jid,
    "✅ Semua blacklist grup berhasil direset."
  );
}


// ==========================================
// DELETE MESSAGE
// ==========================================

if (command === "delete") {

  const context =
    msg.message
      ?.extendedTextMessage
      ?.contextInfo;

  if (!context?.stanzaId) {
    return send(
      sock,
      jid,
      "❌ Reply pesan yang ingin dihapus."
    );
  }

  try {

    await sock.sendMessage(
      jid,
      {
        delete: {
          remoteJid: jid,
          fromMe: false,
          id: context.stanzaId,
          participant:
            context.participant
        }
      }
    );

  } catch (err) {

    console.log(
      "DELETE ERROR:",
      err.message
    );

    return send(
      sock,
      jid,
      "❌ Gagal menghapus pesan."
    );
  }

  return;
}


// ==========================================
// POLL
// ==========================================

if (command === "poll") {

  if (!argText) {
    return send(
      sock,
      jid,
      "Format:\n.poll Pertanyaan|Pilihan 1|Pilihan 2"
    );
  }

  const parts =
    argText
      .split("|")
      .map(x => x.trim())
      .filter(Boolean);

  if (parts.length < 3) {
    return send(
      sock,
      jid,
      "❌ Minimal 1 pertanyaan + 2 pilihan."
    );
  }

  const question = parts.shift();

  try {

    await sock.sendMessage(
      jid,
      {
        poll: {
          name: question,
          values: parts,
          selectableCount: 1
        }
      }
    );

  } catch (err) {

    console.log(
      "POLL ERROR:",
      err.message
    );

    return send(
      sock,
      jid,
      "❌ Gagal membuat polling."
    );
  }

  return;
}


// ==========================================
// READ MORE
// ==========================================

if (command === "readmore") {

  if (!argText) {
    return send(
      sock,
      jid,
      "Contoh:\n.readmore Teks panjang di sini"
    );
  }

  const hidden =
    "\u200e".repeat(4000);

  return send(
    sock,
    jid,
    `${argText}\n\n${hidden}\n\n━━━━━━━━━━━━━━\n🤖 ${BOT_NAME}`
  );
}


// ==========================================
// CEK PLATFORM
// ==========================================

if (command === "cekplatform") {

  if (!argText) {
    return send(
      sock,
      jid,
      "Contoh:\n.cekplatform https://tiktok.com/..."
    );
  }

  try {

    const url =
      new URL(argText);

    const host =
      url.hostname
        .replace("www.", "")
        .toLowerCase();

    let platform = "Unknown";

    if (host.includes("tiktok")) {
      platform = "TikTok";
    } else if (
      host.includes("instagram")
    ) {
      platform = "Instagram";
    } else if (
      host.includes("youtube") ||
      host.includes("youtu.be")
    ) {
      platform = "YouTube";
    } else if (
      host.includes("facebook") ||
      host.includes("fb.watch")
    ) {
      platform = "Facebook";
    } else if (
      host.includes("twitter") ||
      host.includes("x.com")
    ) {
      platform = "Twitter / X";
    } else if (
      host.includes("spotify")
    ) {
      platform = "Spotify";
    }

    return send(
      sock,
      jid,
      `🔎 *CEK PLATFORM*\n\n🌐 Domain: ${host}\n📱 Platform: *${platform}*`
    );

  } catch {

    return send(
      sock,
      jid,
      "❌ URL tidak valid."
    );
  }
}


// ==========================================
// HILAH / HILIH / HULUH / HELEH / HOLOH
// ==========================================

if (
  [
    "halah",
    "hilih",
    "huluh",
    "heleh",
    "holoh"
  ].includes(command)
) {

  if (!argText) {
    return send(
      sock,
      jid,
      `Contoh:\n.${command} halo dunia`
    );
  }

  const vowelMap = {
    halah: "a",
    hilih: "i",
    huluh: "u",
    heleh: "e",
    holoh: "o"
  };

  const vowel =
    vowelMap[command];

  const result =
    argText.replace(
      /[aiueo]/gi,
      vowel
    );

  return send(
    sock,
    jid,
    result
  );
}


// ==========================================
// RANDOM TAG
// ==========================================

if (command === "randomtag") {

  if (!isGroupJid(jid)) {
    return send(
      sock,
      jid,
      "❌ Command ini hanya untuk grup."
    );
  }

  const metadata =
    await sock.groupMetadata(jid);

  const members =
    metadata.participants;

  if (!members.length) {
    return send(
      sock,
      jid,
      "❌ Member tidak ditemukan."
    );
  }

  const target =
    randomItem(members);

  return send(
    sock,
    jid,
    `🎯 Random member:\n@${target.id.split("@")[0]}`,
    {
      mentions: [target.id]
    }
  );
}


// ==========================================
// SIAPAKAH
// ==========================================

if (
  command === "siapakah" ||
  command === "siapakahaku"
) {

  if (!isGroupJid(jid)) {
    return send(
      sock,
      jid,
      "❌ Gunakan command ini di grup."
    );
  }

  const metadata =
    await sock.groupMetadata(jid);

  const members =
    metadata.participants;

  if (!members.length) {
    return send(
      sock,
      jid,
      "❌ Member tidak ditemukan."
    );
  }

  const target =
    randomItem(members);

  return send(
    sock,
    jid,
    `🔮 *SIAPAKAH?*\n\nJawabannya adalah...\n\n👉 @${target.id.split("@")[0]} 😆`,
    {
      mentions: [target.id]
    }
  );
}


// ==========================================
// KATA BIJAK
// ==========================================

if (command === "katabijak") {

  const quotes = [
    "Jangan takut gagal, takutlah tidak mencoba.",
    "Sedikit demi sedikit tetap merupakan kemajuan.",
    "Masa depan dibangun dari apa yang kamu lakukan hari ini.",
    "Kesuksesan membutuhkan proses.",
    "Tetap berjalan meskipun perlahan."
  ];

  return send(
    sock,
    jid,
    `💡 *KATA BIJAK*\n\n"${randomItem(quotes)}"`
  );
}


// ==========================================
// QUOTES ANIME
// ==========================================

if (command === "quotesanime") {

  const quotes = [
    "Kekuatan bukan hanya tentang menang, tetapi tentang terus berdiri.",
    "Jangan menyerah pada sesuatu yang benar-benar kamu inginkan.",
    "Mimpi akan menjadi nyata jika kamu terus berusaha.",
    "Orang yang kuat bukan yang tidak pernah jatuh, tetapi yang selalu bangkit."
  ];

  return send(
    sock,
    jid,
    `🌸 *QUOTES ANIME*\n\n"${randomItem(quotes)}"`
  );
}


// ==========================================
// OWNER - LIST BAN
// ==========================================

if (command === "listban") {

  if (!owner) {
    return send(
      sock,
      jid,
      "❌ Command khusus owner."
    );
  }

  if (!db.banned.length) {
    return send(
      sock,
      jid,
      "🚫 Tidak ada user yang dibanned."
    );
  }

  const list =
    db.banned
      .map(
        x => `• ${x.split("@")[0]}`
      )
      .join("\n");

  return send(
    sock,
    jid,
    `🚫 *LIST BANNED*\n\n${list}`
  );
}


// ==========================================
// OWNER - LIST BLOCK
// ==========================================

if (command === "listblock") {

  if (!owner) {
    return send(
      sock,
      jid,
      "❌ Command khusus owner."
    );
  }

  try {

    const blocked =
      await sock.fetchBlocklist();

    if (!blocked.length) {
      return send(
        sock,
        jid,
        "📋 Tidak ada nomor yang diblokir."
      );
    }

    const list =
      blocked
        .map(
          x => `• ${x.split("@")[0]}`
        )
        .join("\n");

    return send(
      sock,
      jid,
      `🚫 *LIST BLOCK*\n\n${list}`
    );

  } catch {

    return send(
      sock,
      jid,
      "❌ Gagal mengambil daftar block."
    );
  }
}


// ==========================================
// LIST PREMIUM
// ==========================================

if (command === "listpremium") {

  const premiumUsers =
    Object.entries(db.users || {})
      .filter(
        ([, value]) =>
          value.premium === true
      );

  if (!premiumUsers.length) {
    return send(
      sock,
      jid,
      "💎 Belum ada user premium."
    );
  }

  const list =
    premiumUsers
      .map(
        ([number]) =>
          `• ${number.replace("@s.whatsapp.net", "")}`
      )
      .join("\n");

  return send(
    sock,
    jid,
    `💎 *LIST PREMIUM*\n\n${list}`
  );
}


// ==========================================
// TOP GLOBAL
// ==========================================

if (
  command === "topglobal" ||
  command === "toplocal"
) {

  const users =
    Object.entries(db.users || {});

  const sorted =
    users
      .sort(
        (a, b) =>
          Number(b[1].balance || 0) -
          Number(a[1].balance || 0)
      )
      .slice(0, 10);

  if (!sorted.length) {
    return send(
      sock,
      jid,
      "📊 Belum ada data ranking."
    );
  }

  let result =
    `🏆 *TOP ${command === "toplocal" ? "LOCAL" : "GLOBAL"}*\n\n`;

  sorted.forEach(
    ([number, data], index) => {

      const clean =
        number
          .replace("@s.whatsapp.net", "");

      result +=
        `${index + 1}. ${clean} — 💰 ${data.balance || 0}\n`;
    }
  );

  return send(
    sock,
    jid,
    result
  );
}


// ==========================================
// BUY LIMIT
// ==========================================

if (command === "buylimit") {

  const amount =
    Number(args[0]);

  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    return send(
      sock,
      jid,
      "Contoh:\n.buylimit 10"
    );
  }

  const price =
    amount * 100;

  if (user.balance < price) {
    return send(
      sock,
      jid,
      `❌ Balance tidak cukup.\n\nHarga: ${price}\nBalance: ${user.balance}`
    );
  }

  user.balance -= price;
  user.limit += amount;

  saveDatabase();

  return send(
    sock,
    jid,
    `✅ Berhasil membeli *${amount} limit*.\n\n💰 Sisa balance: ${user.balance}\n🎟️ Limit: ${user.limit}`
  );
}


// ==========================================
// SEWABOT
// ==========================================

if (command === "sewabot") {

  return send(
    sock,
    jid,
    `🤖 *SEWA ZAZABOT*\n\n` +
    `Hubungi owner untuk informasi harga dan durasi sewa.\n\n` +
    `👑 Owner: ${OWNER_NUMBER}`
  );
}


// ==========================================
// FREE / API COMMAND NOTICE
// ==========================================

const additionalApiCommands = [
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
  "ytmp4",

  "aiimage",
  "bard",
  "jadianime",
  "nexara",
  "openai",
  "voicejapan",

  "ocr",
  "removebackground",
  "upscale",
  "tourl",
  "shortlink",
  "tts",
  "tts2",
  "tomp3",
  "tovn"
];

if (
  additionalApiCommands.includes(
    command
  )
) {

  return send(
    sock,
    jid,
    `⚠️ *${PREFIX}${command}* sudah tersedia di menu, tetapi layanan/API khusus command tersebut belum dikonfigurasi di server.\n\nCore ZazaBot tetap aktif.`
  );
}


// ==========================================
// COMMAND MENU TAPI BELUM DIIMPLEMENTASI
// ==========================================

const menuCommandList =
  MENU
    .match(/\.[a-z0-9]+/gi)
    ?.map(
      x =>
        x
          .slice(1)
          .toLowerCase()
    ) || [];

const knownCommand =
  menuCommandList.includes(
    command
  );

if (knownCommand) {

  return send(
    sock,
    jid,
    `⚠️ *${PREFIX}${command}* sudah terdaftar di menu ZazaBot, tetapi fungsi command tersebut belum dihubungkan.\n\nGunakan *.menu* untuk melihat command yang tersedia.`
  );
}


// ==========================================
// UNKNOWN COMMAND
// ==========================================

return send(
  sock,
  jid,
  `❌ Command *${PREFIX}${command}* tidak ditemukan.\n\nKetik *.menu* untuk melihat daftar command.`
);

      } catch (error) {

        console.log(
          "❌ MESSAGE HANDLER ERROR:",
          error
        );

      }

    }
  );
}


// ==========================================
// START ZAZABOT
// ==========================================

startBot().catch(
  error => {
    console.log(
      "❌ ZAZABOT START ERROR:",
      error
    );
  }
);
