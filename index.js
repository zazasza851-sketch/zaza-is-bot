import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode";
import http from "http";

const BOT_NAME = "zazasza";
const OWNER_NUMBER = "6289630747010";
const BOT_NUMBER = "6285866438941";
const PREFIX = ".";

const PORT = process.env.PORT || 8080;

let qrImage = "";
let connectionStatus = "MEMULAI ZAZABOT...";
let botUptime = Date.now();


// =====================================================
// DAFTAR MENU ZAZABOT
// =====================================================

const MENU = {

  GROUP: [
    "absen","add","addalarm","addbadword","addlist","updatelist","uplist",
    "addpoin","addreminder","afk","antibadword","antibadwordnokick",
    "antibot","antidelete","antilink","antilinkchannel","antilinknokick",
    "antiluar","antimentionsw","antiviewonce","antiwame","antiwamenokick",
    "banmember","blacklist","delblacklist","listblacklist","resetblacklist",
    "cekabsen","cekidgroup","cekpoint","ceksewa","ceksewabyid","cekwarn",
    "createschedulecall","delalarm","delbadword","delete","deleteabsen",
    "deletepoin","deletetotalpesan","dellist","delreminder","delultahku",
    "delwarn","demote","demotedetector","descgc","disablealarm","done",
    "enablealarm","gamemode","getlist","groupadmin","groupinfo",
    "groupschedule","groupsetting","grouptime","hidetag","kick","kickme",
    "left","levelling","linkgc","revokelink","list","listalarm",
    "listbadword","listbanmember","listpoint","listreminder",
    "listtotalpesan","listultah","listwarn","mulaiabsen","mute","pinmsg",
    "promote","promotedetector","proses","refreshgroup","resetalarm",
    "resetbadword","resetlist","resetpoint","resetreminder",
    "resettotalpesan","resetultahku","resetwarn","setdescgc","setnamegc",
    "setopen","setclose","setppgc","setppgcpanjang","setproses","setdone",
    "setwarn","setwelcome","setleft","setwelcometype","setlefttype",
    "sider","tagall","tfpoint","totag","totalpesan","ultahku","unbanmember",
    "unpinmsg","vote","warn","welcome"
  ],

  OWNER: [
    "addbalance","addlevel","addlimit","addpremium","addrespon","addsewa",
    "addsewathisgroup","addxp","anticall","anticallnoblock","antideletepc",
    "autoleavegcnosewa","autonexara","autoread","autotype","ban",
    "blacklistglobal","delblacklistglobal","listblacklistglobal",
    "resetblacklistglobal","block","broadcast","bccancel","bcconfirm",
    "bcgroup","bcgchidetag","bchidetag","bcmember","bcpremium","bcpc",
    "bcsewa","bcstat","buttonmode","buttontojson","call","cekaccount",
    "cekopenaikey","chatgroup","clearchat","copythumbnail","createbutton",
    "createfullbutton","createlist","createredeem","createthumbnail",
    "delbalance","dellevel","dellimit","delpremium","deleteredeem",
    "delrespon","delsewa","delxp","freeautores","delfreeautores",
    "listfreeautores","resetfreeautores","freecommand","delfreecommand",
    "listfreecommand","resetfreecommand","globalgamemode","golink",
    "grabcontact","grouponlypremium","inforedeem","inviteme","join",
    "leaveall","leavegcbyid","levellingpc","listredeem","listrespon",
    "listsewa","listsewapermanent","mutebc","mutebyid","mycontacts",
    "onlygroup","onlyindo","onlyprem","pconlyprem","premiumgroup",
    "promoteme","public","publicbyid","queue","react","refreshgroupbyid",
    "refreshpremiumlist","resetanonymous","resetbalance",
    "resetblacklistglobal","resetfreeautores","resetfreecommand",
    "resetlevel","resetlimit","resetxp","resetlimitreceivedgroup",
    "resetpremium","resetresponsee","self","selfbyid","setbio","setcommand",
    "setdefaultweltype","setlimitgroup","setlimitreceivedgroup","setname",
    "setopenaikey","setpp","setpppanjang","setwrsuit","setwrttt",
    "testbutton","unban","unblock","unreact","upchannel","upres",
    "upswgroup","upswmentiongroup","upswmentiongroupsilent","upswpremium",
    "videocall"
  ],

  AI: [
    "aiimage","bard","jadianime","nexara","byenexara","openai","voicejapan"
  ],

  GAME: [
    "akinator","akinatorstart","akinatorstop","asahotak","caklontong",
    "dare","family100","hint","math","nyerah","redeem","sambungkata",
    "siapakahaku","sloth","susunkalimat","susunkata","susunlirik",
    "tebakbendera","tebakbom","tebakchara","tebakfisika","tebakgambar",
    "tebakkata","tebaklagu","tebaklaguanime","tebaklagukpop","tekateki",
    "tfbalance","truth","ulartangga","uno"
  ],

  RANDOM: [
    "alay","apakah","cekkhodam","faktaunik","husbu","jadian","kapankah",
    "katabijak","loli","pantun","ppcouple","puisi","quotesanime",
    "randomanime","randommeme","randomnumber","randomtag","rate",
    "siapakah","neko","waifu"
  ],

  SEARCH: [
    "alkitab","alquranaudio","artinama","brainly","cekidff","cekidml",
    "cuaca","dorama","google","googleimage","igstalk","ipchecker",
    "jadwalshalat","lirik","otakudesuinfo","otakudesuongoing",
    "otakudesu","pinterest","play","wikipedia","ytsearch"
  ],

  STICKER: [
    "attp","brat","bratvideo","delsetwm","quickchat","semoji",
    "semojimix","setwm","sticker","stickercircle","stickerinfo",
    "stickerly","smeme","snobg","stickerwm","takesticker","telestick",
    "toimg","trigger","ttp","ziptelestick"
  ],

  TOOLS: [
    "blur","cekplatform","ehex","dhex","ebase64","dbase64","enc","dec",
    "fakereply","hartatahta","iqc","kirim","confess","menfess","nulis",
    "folio","ocr","poll","ptvtovideo","qrcode","qrcodereader","readmore",
    "readviewonce","removebackground","screenshot","shortlink","myemail",
    "getemail","tomp3","tovn","toquickvideo","tourl","toviewonce",
    "translate","tts","tts2","upscale","halah","hilih","huluh","heleh",
    "holoh","ytcomment"
  ],

  INFO: [
    "buylimit","cekpremium","infocovid","infogempa","infounsur",
    "kodebahasa","leavenosewa","level","limit","balance","listban",
    "listblock","listcommand","listgroup","listgroupnosewa",
    "listonline","listpremium","listpremiumgroup","profile","report",
    "status","topglobal","toplocal"
  ],

  DOWNLOAD: [
    "douyin","facebook","igstory","igdl","igtv","igreel","mediafire",
    "otakudesudl","pindl","spotify","threads","tiktoknowm","tiktokwm",
    "tiktokmusic","twitterdl","ytmp3","ytmp4"
  ],

  TEXTMAKER: [
    "window","blankpink","thunder","bear","cloud","neonlight","sand",
    "glow","neon","sky","cartoon","greenneon","halloween","bokeh",
    "firework","narutologo","colorneon","digitalglitch","wetglass",
    "watercolor","pubglogo","fflogo","glitch","thor","wolf","phlogo",
    "avangers","spacetext","marvel","graffiti","deadpool","lightglow",
    "blackpink","dropwater","magma","pencil","bisnissign","batman","holo"
  ],

  GENERAL: [
    "sewabot",
    "premium user",
    "up balance",
    "up xp",
    "up level",
    "owner",
    "ping",
    "runtime"
  ]

};


// =====================================================
// MEMBUAT TEKS MENU OTOMATIS
// =====================================================

function createMenu() {

  let menu = "";

  menu += "╭━━━〔 🤖 ZAZABOT 〕━━━╮\n";
  menu += "┃\n";
  menu += "┃ 👋 Halo!\n";
  menu += `┃ Bot     : ${BOT_NAME}\n`;
  menu += `┃ Prefix  : ${PREFIX}\n`;
  menu += "┃\n";

  for (const [category, commands] of Object.entries(MENU)) {

    menu += `┣━━〔 ${category} 〕━━\n`;

    for (const command of commands) {
      menu += `┃ ${PREFIX}${command}\n`;
    }

    menu += "┃\n";
  }

  menu += "╰━━━━━━━━━━━━━━╯\n\n";
  menu += "⚡ ZazaBot siap digunakan.\n\n";
  menu += "@_zazasza";

  return menu;
}


// =====================================================
// WEB SERVER UNTUK QR
// =====================================================

const server = http.createServer((req, res) => {

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(`

<!DOCTYPE html>

<html lang="id">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1">

<meta http-equiv="refresh" content="5">

<title>ZazaBot</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 20px;
  background: #07152d;
  color: white;
  font-family: Arial, sans-serif;
  text-align: center;
}

.container {
  max-width: 500px;
  margin: 30px auto;
}

.card {
  background: #10264a;
  border-radius: 25px;
  padding: 25px;
  box-shadow: 0 10px 30px rgba(0,0,0,.3);
}

.logo {
  font-size: 55px;
}

h1 {
  margin: 5px 0;
  color: #60a5fa;
}

.status {
  margin: 20px 0;
  padding: 12px;
  border-radius: 12px;
  background: #07152d;
}

.qr {
  width: 280px;
  max-width: 90%;
  background: white;
  padding: 12px;
  border-radius: 15px;
  margin: 15px auto;
}

.info {
  line-height: 1.6;
  color: #dbeafe;
}

.warning {
  margin-top: 20px;
  font-size: 13px;
  color: #93c5fd;
}

</style>

</head>

<body>

<div class="container">

<div class="card">

<div class="logo">🤖</div>

<h1>ZAZABOT</h1>

<p>WhatsApp Bot</p>

<div class="status">
Status:
<b>${connectionStatus}</b>
</div>

${
  qrImage
    ? `
      <p>📱 Scan QR ini menggunakan WhatsApp</p>

      <img
        class="qr"
        src="${qrImage}"
        alt="QR ZazaBot"
      >

      <div class="info">
        WhatsApp → Perangkat tertaut
        → Tautkan perangkat
        → Scan QR
      </div>
    `
    : `
      <p>⏳ QR sedang dibuat...</p>
      <p>Tunggu beberapa detik.</p>
    `
}

<div class="warning">
Jangan bagikan QR ini kepada orang lain.
</div>

</div>

</div>

</body>

</html>

`);

});

server.listen(PORT, "0.0.0.0", () => {

  console.log("=================================");
  console.log("🌐 ZAZABOT WEB SERVER AKTIF");
  console.log("PORT:", PORT);
  console.log("=================================");

});


// =====================================================
// START BOT
// =====================================================

async function startBot() {

  try {

    const { state, saveCreds } =
      await useMultiFileAuthState("./session");

    const sock = makeWASocket({

      auth: state,

      browser: Browsers.ubuntu("ZazaBot"),

      printQRInTerminal: false,

      logger: pino({
        level: "silent"
      }),

      markOnlineOnConnect: false,

      syncFullHistory: false

    });


    // SIMPAN SESSION

    sock.ev.on(
      "creds.update",
      saveCreds
    );


    // =================================================
    // CONNECTION
    // =================================================

    sock.ev.on(
      "connection.update",
      async (update) => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;


        console.log(
          "CONNECTION:",
          connection || "waiting"
        );


        // ===============================
        // QR
        // ===============================

        if (qr) {

          console.log("");
          console.log(
            "================================="
          );
          console.log(
            "📱 QR ZAZABOT TERSEDIA"
          );
          console.log(
            "================================="
          );


          try {

            qrImage =
              await QRCode.toDataURL(
                qr,
                {
                  width: 500,
                  margin: 2
                }
              );

            connectionStatus =
              "MENUNGGU SCAN QR";

            console.log(
              "✅ QR berhasil dibuat"
            );

          } catch (error) {

            console.error(
              "❌ GAGAL MEMBUAT QR"
            );

            console.error(error);

          }

        }


        // ===============================
        // CONNECTED
        // ===============================

        if (connection === "open") {

          connectionStatus =
            "🟢 ZAZABOT TERHUBUNG";

          qrImage = "";

          console.log("");
          console.log(
            "================================="
          );
          console.log(
            "✅ ZAZABOT BERHASIL TERHUBUNG"
          );
          console.log(
            "================================="
          );
          console.log("");

        }


        // ===============================
        // CLOSED
        // ===============================

        if (connection === "close") {

          connectionStatus =
            "🔴 KONEKSI TERPUTUS";

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;


          console.log("");
          console.log(
            "================================="
          );

          console.log(
            "⚠️ KONEKSI TERPUTUS"
          );

          console.log(
            "STATUS:",
            statusCode
          );

          console.log(
            "================================="
          );


          if (
            statusCode !==
            DisconnectReason.loggedOut
          ) {

            console.log(
              "🔄 MENGHUBUNGKAN KEMBALI..."
            );

            setTimeout(
              () => {
                startBot();
              },
              5000
            );

          } else {

            console.log(
              "❌ ZazaBot telah logout."
            );

          }

        }

      }
    );


    // =================================================
    // PESAN MASUK
    // =================================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {

        for (const msg of messages) {

          if (!msg.message) continue;

          if (msg.key.fromMe) continue;


          const jid =
            msg.key.remoteJid;

          if (!jid) continue;


          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";


          if (!text.startsWith(PREFIX))
            continue;


          const args =
            text
              .slice(PREFIX.length)
              .trim()
              .split(/\s+/);


          const command =
            args
              .shift()
              ?.toLowerCase();


          console.log(
            "COMMAND:",
            command
          );


          // =================================================
          // MENU
          // =================================================

          if (command === "menu") {

            await sock.sendMessage(
              jid,
              {
                text: createMenu()
              }
            );

          }


          // =================================================
          // PING
          // =================================================

          else if (command === "ping") {

            await sock.sendMessage(
              jid,
              {
                text:
                  "🏓 PONG!\n\n" +
                  "🤖 ZazaBot aktif."
              }
            );

          }


          // =================================================
          // OWNER
          // =================================================

          else if (command === "owner") {

            await sock.sendMessage(
              jid,
              {
                text:
                  "👑 OWNER ZAZABOT\n\n" +
                  "📱 wa.me/" +
                  OWNER_NUMBER
              }
            );

          }


          // =================================================
          // RUNTIME
          // =================================================

          else if (command === "runtime") {

            const uptime =
              Math.floor(
                (Date.now() - botUptime) / 1000
              );


            const hours =
              Math.floor(
                uptime / 3600
              );


            const minutes =
              Math.floor(
                (uptime % 3600) / 60
              );


            const seconds =
              uptime % 60;


            await sock.sendMessage(
              jid,
              {
                text:
                  "⏱️ ZAZABOT RUNTIME\n\n" +
                  `${hours} jam ` +
                  `${minutes} menit ` +
                  `${seconds} detik`
              }
            );

          }


          // =================================================
          // COMMAND BELUM DIBUAT
          // =================================================

          else {

            await sock.sendMessage(
              jid,
              {
                text:
                  `❌ Perintah .${command} belum aktif.\n\n` +
                  `Gunakan .menu untuk melihat daftar perintah.`
              }
            );

          }

        }

      }
    );

  }


  catch (error) {

    console.error(
      "❌ ERROR START BOT:"
    );

    console.error(error);


    setTimeout(
      () => {
        startBot();
      },
      10000
    );

  }

}


// =====================================================
// JALANKAN BOT
// =====================================================

startBot();
