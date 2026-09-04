import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} from "@whiskeysockets/baileys";

import P from "pino";
import http from "http";

// ==========================================
// KONFIGURASI ZAZABOT
// ==========================================

const BOT_NUMBER = "6285866438941";
const OWNER_NUMBER = "6289630747010";

const BOT_NAME = "ZazaBot";
const PREFIX = ".";

const PORT = process.env.PORT || 8080;

let sock = null;
let pairingCode = "MENUNGGU...";
let botStatus = "🟡 Memulai ZazaBot...";
let pairingRequested = false;

// ==========================================
// WEB SERVER
// ==========================================

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });

  if (req.url === "/") {
    res.end(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZazaBot</title>

<style>
body {
  margin: 0;
  background: #071a36;
  color: white;
  font-family: Arial, sans-serif;
  text-align: center;
}

.container {
  max-width: 500px;
  margin: auto;
  padding: 30px 20px;
}

.card {
  background: #102b52;
  padding: 25px;
  border-radius: 20px;
  margin-top: 20px;
}

.code {
  font-size: 30px;
  font-weight: bold;
  letter-spacing: 5px;
  background: #06152c;
  padding: 20px;
  border-radius: 15px;
  margin: 20px 0;
}

.button {
  display: inline-block;
  background: #1683ff;
  color: white;
  padding: 14px 22px;
  border-radius: 12px;
  text-decoration: none;
}

.status {
  font-size: 20px;
}
</style>
</head>

<body>

<div class="container">

<h1>🤖 ${BOT_NAME}</h1>

<div class="card">

<h2>Status</h2>

<div class="status">
${botStatus}
</div>

</div>

<div class="card">

<h3>📱 Nomor Bot</h3>

<p>${BOT_NUMBER}</p>

<h3>🔑 Pairing Code</h3>

<div class="code">
${pairingCode}
</div>

<p>
Jika kode sudah muncul, buka WhatsApp pada
nomor bot dan pilih:
</p>

<p>
<b>Setelan → Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon</b>
</p>

</div>

<div class="card">

<a class="button" href="/">
🔄 Refresh
</a>

</div>

<p>© ${BOT_NAME}</p>

</div>

</body>
</html>
`);

    return;
  }

  res.writeHead(404);
  res.end("404");
});

// ==========================================
// START WEB SERVER
// ==========================================

server.listen(PORT, "0.0.0.0", () => {
  console.log("====================================");
  console.log("🌐 ZazaBot Web Server AKTIF");
  console.log("📡 PORT:", PORT);
  console.log("====================================");
});

// ==========================================
// FUNGSI START BOT
// ==========================================

async function startBot() {
  try {
    const {
      state,
      saveCreds
    } = await useMultiFileAuthState("./session");

    sock = makeWASocket({
      auth: state,

      browser: Browsers.ubuntu("Chrome"),

      logger: P({
        level: "silent"
      }),

      printQRInTerminal: false,

      generateHighQualityLinkPreview: false
    });

    // ======================================
    // SIMPAN CREDENTIAL
    // ======================================

    sock.ev.on("creds.update", saveCreds);

    // ======================================
    // CONNECTION UPDATE
    // ======================================

    sock.ev.on(
      "connection.update",
      async (update) => {

        const {
          connection,
          lastDisconnect
        } = update;

        // -------------------------------
        // CONNECTING
        // -------------------------------

        if (connection === "connecting") {

          botStatus =
            "🟡 Menghubungkan WhatsApp...";

          console.log(
            "🔄 Menghubungkan WhatsApp..."
          );

          // --------------------------------
          // REQUEST PAIRING CODE
          // --------------------------------

          if (
            !state.creds.registered &&
            !pairingRequested
          ) {

            pairingRequested = true;

            try {

              console.log(
                "🔑 Meminta pairing code..."
              );

              const code =
                await sock.requestPairingCode(
                  BOT_NUMBER
                );

              pairingCode = code;

              console.log("");
              console.log(
                "===================================="
              );
              console.log(
                "🔑 PAIRING CODE ZAZABOT"
              );
              console.log(
                "📱 NOMOR:",
                BOT_NUMBER
              );
              console.log(
                "🔐 CODE:",
                code
              );
              console.log(
                "===================================="
              );
              console.log("");

            } catch (error) {

              pairingRequested = false;

              console.log(
                "❌ GAGAL MEMBUAT PAIRING CODE"
              );

              console.log(
                error?.message || error
              );

            }
          }
        }

        // -------------------------------
        // CONNECTED
        // -------------------------------

        if (connection === "open") {

          botStatus =
            "🟢 WhatsApp TERHUBUNG";

          pairingCode =
            "SUDAH TERHUBUNG";

          console.log("");
          console.log(
            "===================================="
          );
          console.log(
            "✅ ZAZABOT WHATSAPP TERHUBUNG"
          );
          console.log(
            "📱 NOMOR:",
            BOT_NUMBER
          );
          console.log(
            "===================================="
          );
          console.log("");

        }

        // -------------------------------
        // DISCONNECTED
        // -------------------------------

        if (connection === "close") {

          botStatus =
            "🔴 WhatsApp Terputus";

          pairingRequested = false;

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log("");
          console.log(
            "❌ WhatsApp terputus"
          );

          console.log(
            "Status:",
            statusCode
          );

          const shouldReconnect =
            statusCode !==
            DisconnectReason.loggedOut;

          if (shouldReconnect) {

            botStatus =
              "🔄 Menghubungkan kembali...";

            console.log(
              "🔄 Mencoba terhubung kembali..."
            );

            setTimeout(() => {
              startBot();
            }, 5000);

          } else {

            botStatus =
              "🔴 Logout dari WhatsApp";

            pairingCode =
              "LOGIN ULANG DIPERLUKAN";

            console.log(
              "⚠️ WhatsApp logout."
            );

          }
        }
      }
    );

    // ======================================
    // PESAN MASUK
    // ======================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {

        try {

          const msg = messages?.[0];

          if (!msg) return;

          if (!msg.message) return;

          if (msg.key?.fromMe) return;

          const jid =
            msg.key?.remoteJid;

          if (!jid) return;

          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            "";

          if (!text) return;

          if (!text.startsWith(PREFIX))
            return;

          const commandText =
            text
              .slice(PREFIX.length)
              .trim();

          if (!commandText)
            return;

          const args =
            commandText.split(/\s+/);

          const command =
            args.shift()?.toLowerCase();

          // ==================================
          // .PING
          // ==================================

          if (command === "ping") {

            await sock.sendMessage(
              jid,
              {
                text:
`🏓 PONG!

🤖 ${BOT_NAME}
🟢 Status: Aktif
📱 Bot: ${BOT_NUMBER}`
              }
            );

            return;
          }

          // ==================================
          // .OWNER
          // ==================================

          if (command === "owner") {

            await sock.sendMessage(
              jid,
              {
                text:
`👑 OWNER ${BOT_NAME}

📱 Nomor Owner:
https://wa.me/${OWNER_NUMBER}`
              }
            );

            return;
          }

          // ==================================
          // .RUNTIME
          // ==================================

          if (command === "runtime") {

            const uptime =
              Math.floor(process.uptime());

            const days =
              Math.floor(
                uptime / 86400
              );

            const hours =
              Math.floor(
                (uptime % 86400) / 3600
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
`⏱️ RUNTIME ZAZABOT

📅 ${days} Hari
⏰ ${hours} Jam
⏱️ ${minutes} Menit
⏲️ ${seconds} Detik`
              }
            );

            return;
          }

          // ==================================
          // .MENU
          // ==================================

          if (
            command === "menu" ||
            command === "help"
          ) {

            const menu =
`╭━━━〔 🤖 ZAZABOT 〕━━━╮
┃
┃ 👑 OWNER
┃ • .owner
┃
┃ ⚙️ GENERAL
┃ • .menu
┃ • .ping
┃ • .runtime
┃
┃ 🤖 AI
┃ • .openai
┃ • .bard
┃ • .nexara
┃ • .aiimage
┃ • .jadianime
┃
┃ 🎮 GAME
┃ • .akinator
┃ • .asahotak
┃ • .caklontong
┃ • .family100
┃ • .math
┃ • .truth
┃ • .dare
┃ • .susunkata
┃ • .tebakgambar
┃ • .tebakkata
┃
┃ 🎲 RANDOM
┃ • .alay
┃ • .apakah
┃ • .faktaunik
┃ • .katabijak
┃ • .pantun
┃ • .puisi
┃ • .quotesanime
┃ • .randomanime
┃ • .randommeme
┃
┃ 🔍 SEARCH
┃ • .google
┃ • .googleimage
┃ • .wikipedia
┃ • .ytsearch
┃ • .lirik
┃ • .play
┃ • .pinterest
┃
┃ 🎨 STICKER
┃ • .sticker
┃ • .attp
┃ • .ttp
┃ • .toimg
┃ • .brat
┃ • .stickerly
┃
┃ 🛠️ TOOLS
┃ • .qrcode
┃ • .translate
┃ • .tts
┃ • .ocr
┃ • .tourl
┃ • .tomp3
┃ • .shortlink
┃
┃ 📥 DOWNLOAD
┃ • .tiktoknowm
┃ • .tiktokwm
┃ • .igdl
┃ • .igreel
┃ • .facebook
┃ • .mediafire
┃ • .ytmp3
┃ • .ytmp4
┃
┃ 👥 GROUP
┃ • .tagall
┃ • .hidetag
┃ • .kick
┃ • .promote
┃ • .demote
┃ • .groupinfo
┃ • .linkgc
┃ • .antilink
┃ • .welcome
┃
┃ ℹ️ INFO
┃ • .profile
┃ • .balance
┃ • .limit
┃ • .level
┃ • .status
┃ • .cekpremium
┃
╰━━━━━━━━━━━━━━━━━━╯

> @_zazasza`;

            await sock.sendMessage(
              jid,
              {
                text: menu
              }
            );

            return;
          }

          // ==================================
          // COMMAND BELUM DIBUAT
          // ==================================

          await sock.sendMessage(
            jid,
            {
              text:
`❌ Command belum tersedia.

Ketik:
.menu

untuk melihat command ZazaBot.`
            }
          );

        } catch (error) {

          console.log(
            "❌ MESSAGE ERROR:",
            error?.message || error
          );

        }
      }
    );

  } catch (error) {

    console.log("");
    console.log(
      "❌ START BOT ERROR"
    );
    console.log(
      error?.message || error
    );
    console.log("");

    setTimeout(() => {
      startBot();
    }, 5000);
  }
}

// ==========================================
// JALANKAN ZAZABOT
// ==========================================

console.log("");
console.log("====================================");
console.log("🤖 ZAZABOT STARTING...");
console.log("📱 BOT:", BOT_NUMBER);
console.log("👑 OWNER:", OWNER_NUMBER);
console.log("====================================");
console.log("");

startBot();
