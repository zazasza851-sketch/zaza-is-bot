import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";

import P from "pino";
import http from "http";

// ========================================
// KONFIGURASI ZAZABOT
// ========================================

const BOT_NUMBER = "6285866438941";
const OWNER_NUMBER = "6289630747010";

const BOT_NAME = "ZazaBot";
const PREFIX = ".";

const PORT = process.env.PORT || 8080;

let sock = null;
let pairingCode = "BELUM TERSEDIA";
let statusBot = "Menunggu WhatsApp";

// ========================================
// WEB SERVER
// ========================================

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
body{
  margin:0;
  background:#071a36;
  color:white;
  font-family:Arial,sans-serif;
  text-align:center;
}

.container{
  max-width:500px;
  margin:auto;
  padding:40px 20px;
}

.card{
  background:#102b52;
  padding:25px;
  border-radius:20px;
  margin-top:25px;
}

.code{
  font-size:32px;
  font-weight:bold;
  letter-spacing:6px;
  background:#06152c;
  padding:20px;
  border-radius:15px;
  margin:20px 0;
}

button{
  background:#1683ff;
  color:white;
  border:0;
  padding:14px 25px;
  border-radius:12px;
  font-size:16px;
}

a{
  color:white;
  text-decoration:none;
}
</style>
</head>

<body>

<div class="container">

<h1>🤖 ZazaBot</h1>

<div class="card">

<h2>Status</h2>

<p>${statusBot}</p>

<hr>

<h3>📱 Nomor Bot</h3>

<p>${BOT_NUMBER}</p>

<h3>🔑 Pairing Code</h3>

<div class="code">
${pairingCode}
</div>

<a href="/pair">
<button>🔄 Buat Pairing Code</button>
</a>

</div>

<div class="card">

<h3>Cara Menghubungkan</h3>

<p>
WhatsApp → Perangkat tertaut →
Tautkan perangkat →
Tautkan dengan nomor telepon
</p>

<p>
Masukkan kode pairing di atas.
</p>

</div>

<p>© ZazaBot</p>

</div>

</body>
</html>
`);

    return;
  }

  if (req.url === "/pair") {

    if (!sock) {

      res.end(`
        <h2>Bot belum siap.</h2>
        <p>Tunggu beberapa detik lalu buka kembali.</p>
      `);

      return;
    }

    try {

      if (sock.authState?.creds?.registered) {

        pairingCode = "SUDAH TERHUBUNG";

      } else {

        const code =
          await sock.requestPairingCode(BOT_NUMBER);

        pairingCode = code;

        console.log("");
        console.log("==============================");
        console.log("🔑 PAIRING CODE ZAZABOT");
        console.log("CODE:", code);
        console.log("==============================");
        console.log("");

      }

      res.writeHead(302, {
        Location: "/"
      });

      res.end();

    } catch (error) {

      console.log("PAIRING ERROR:", error);

      res.writeHead(500, {
        "Content-Type": "text/plain"
      });

      res.end(
        "Gagal membuat pairing code: " +
        error.message
      );
    }

    return;
  }

  res.writeHead(404);

  res.end("404");
});

server.listen(PORT, "0.0.0.0", () => {

  console.log(
    `🌐 ${BOT_NAME} aktif di port ${PORT}`
  );

});

// ========================================
// START WHATSAPP
// ========================================

async function startBot() {

  try {

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState("./session");

    sock = makeWASocket({

      auth: state,

      logger: P({
        level: "silent"
      }),

      printQRInTerminal: false

    });

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // ====================================
    // CONNECTION
    // ====================================

    sock.ev.on(
      "connection.update",
      async ({
        connection,
        lastDisconnect
      }) => {

        if (connection === "connecting") {

          statusBot =
            "🟡 Menghubungkan WhatsApp...";

          console.log(
            "🔄 Menghubungkan WhatsApp..."
          );

        }

        if (
          connection === "connecting" &&
          !state.creds.registered
        ) {

          try {

            const code =
              await sock.requestPairingCode(
                BOT_NUMBER
              );

            pairingCode = code;

            console.log("");
            console.log(
              "🔑 PAIRING CODE:",
              code
            );
            console.log("");

          } catch (error) {

            console.log(
              "❌ Gagal mendapatkan pairing code:",
              error.message
            );

          }

        }

        if (connection === "open") {

          statusBot =
            "🟢 WhatsApp Terhubung";

          pairingCode =
            "SUDAH TERHUBUNG";

          console.log("");
          console.log(
            "================================"
          );
          console.log(
            "✅ ZAZABOT WHATSAPP TERHUBUNG"
          );
          console.log(
            "================================"
          );
          console.log("");

        }

        if (connection === "close") {

          statusBot =
            "🔴 WhatsApp Terputus";

          const statusCode =
            lastDisconnect?.error?.output?.statusCode;

          const shouldReconnect =
            statusCode !== DisconnectReason.loggedOut;

          console.log(
            "❌ WhatsApp terputus:",
            statusCode
          );

          if (shouldReconnect) {

            statusBot =
              "🔄 Menghubungkan kembali...";

            setTimeout(() => {

              startBot();

            }, 5000);

          } else {

            console.log(
              "⚠️ WhatsApp logout."
            );

          }

        }

      }
    );

    // ====================================
    // PESAN MASUK
    // ====================================

    sock.ev.on(
      "messages.upsert",
      async ({ messages }) => {

        try {

          const msg = messages[0];

          if (!msg) return;

          if (!msg.message) return;

          if (msg.key.fromMe) return;

          const jid =
            msg.key.remoteJid;

          if (!jid) return;

          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";

          if (!text) return;

          if (!text.startsWith(PREFIX))
            return;

          const args =
            text
              .slice(PREFIX.length)
              .trim()
              .split(/\s+/);

          const command =
            args.shift()?.toLowerCase();

          // ==============================
          // PING
          // ==============================

          if (command === "ping") {

            await sock.sendMessage(
              jid,
              {
                text:
`🏓 PONG!

🤖 ${BOT_NAME}
✅ Bot aktif
📱 ${BOT_NUMBER}`
              }
            );

            return;
          }

          // ==============================
          // OWNER
          // ==============================

          if (command === "owner") {

            await sock.sendMessage(
              jid,
              {
                text:
`👑 OWNER ${BOT_NAME}

📱 https://wa.me/${OWNER_NUMBER}`
              }
            );

            return;
          }

          // ==============================
          // RUNTIME
          // ==============================

          if (command === "runtime") {

            const uptime =
              process.uptime();

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
              Math.floor(
                uptime % 60
              );

            await sock.sendMessage(
              jid,
              {
                text:
`⏱️ RUNTIME ${BOT_NAME}

${days} Hari
${hours} Jam
${minutes} Menit
${seconds} Detik`
              }
            );

            return;
          }

          // ==============================
          // MENU
          // ==============================

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
┃
┃ 🎮 GAME
┃ • .akinator
┃ • .asahotak
┃ • .caklontong
┃ • .family100
┃ • .math
┃ • .truth
┃ • .dare
┃
┃ 🎲 RANDOM
┃ • .alay
┃ • .apakah
┃ • .faktaunik
┃ • .katabijak
┃ • .pantun
┃ • .puisi
┃ • .quotesanime
┃
┃ 🔍 SEARCH
┃ • .google
┃ • .googleimage
┃ • .wikipedia
┃ • .ytsearch
┃ • .lirik
┃ • .play
┃
┃ 🎨 STICKER
┃ • .sticker
┃ • .attp
┃ • .ttp
┃ • .toimg
┃ • .brat
┃
┃ 🛠️ TOOLS
┃ • .qrcode
┃ • .translate
┃ • .tts
┃ • .tourl
┃ • .tomp3
┃ • .ocr
┃
┃ 📥 DOWNLOAD
┃ • .tiktoknowm
┃ • .tiktokwm
┃ • .igdl
┃ • .igreel
┃ • .facebook
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
┃
┃ ℹ️ INFO
┃ • .profile
┃ • .balance
┃ • .limit
┃ • .level
┃ • .status
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

          // ==============================
          // COMMAND TIDAK DIKENAL
          // ==============================

          await sock.sendMessage(
            jid,
            {
              text:
`❌ Command tidak tersedia.

Ketik ${PREFIX}menu untuk melihat menu.`
            }
          );

        } catch (error) {

          console.log(
            "MESSAGE ERROR:",
            error
          );

        }

      }
    );

  } catch (error) {

    console.log(
      "START BOT ERROR:",
      error
    );

    setTimeout(
      startBot,
      5000
    );

  }

}

// ========================================
// JALANKAN BOT
// ========================================

startBot();
