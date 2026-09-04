import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode";
import http from "http";

// =====================================
// KONFIGURASI ZAZABOT
// =====================================

const BOT_NAME = "zazasza";
const OWNER_NUMBER = "6289630747010";
const BOT_NUMBER = "6285866438941";
const PREFIX = ".";

const PORT = process.env.PORT || 8080;

// =====================================
// STATUS
// =====================================

let qrImage = "";
let connectionStatus = "MEMULAI ZAZABOT...";
let botUptime = Date.now();

// =====================================
// WEB SERVER
// =====================================

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
Status: <b>${connectionStatus}</b>
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
      <p>Tunggu beberapa detik lalu halaman akan diperbarui.</p>
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

// =====================================
// START BOT
// =====================================

async function startBot() {

  try {

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState("./session");

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

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    // =================================
    // CONNECTION UPDATE
    // =================================

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
        // QR BARU
        // ===============================

        if (qr) {

          console.log("");
          console.log("=================================");
          console.log("📱 QR ZAZABOT TERSEDIA");
          console.log("=================================");

          try {

            qrImage =
              await QRCode.toDataURL(qr, {
                width: 500,
                margin: 2
              });

            connectionStatus =
              "MENUNGGU SCAN QR";

            console.log(
              "✅ QR berhasil dibuat"
            );

            console.log(
              "🌐 Buka URL ZazaBot untuk scan QR"
            );

          } catch (error) {

            console.error(
              "❌ GAGAL MEMBUAT GAMBAR QR"
            );

            console.error(error);

          }

        }

        // ===============================
        // TERHUBUNG
        // ===============================

        if (connection === "open") {

          connectionStatus =
            "🟢 ZAZABOT TERHUBUNG";

          qrImage = "";

          console.log("");
          console.log("=================================");
          console.log("✅ ZAZABOT BERHASIL TERHUBUNG");
          console.log("=================================");
          console.log("");

        }

        // ===============================
        // TERPUTUS
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
          console.log("=================================");
          console.log("⚠️ KONEKSI TERPUTUS");
          console.log("STATUS:", statusCode);
          console.log("=================================");

          if (
            statusCode !==
            DisconnectReason.loggedOut
          ) {

            console.log(
              "🔄 MENGHUBUNGKAN KEMBALI..."
            );

            setTimeout(() => {

              startBot();

            }, 5000);

          } else {

            console.log(
              "❌ ZazaBot telah logout."
            );

          }

        }

      }
    );

    // =================================
    // PESAN MASUK
    // =================================

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

          if (!text.startsWith(PREFIX)) {
            continue;
          }

          const args =
            text
              .slice(PREFIX.length)
              .trim()
              .split(/\s+/);

          const command =
            args.shift()?.toLowerCase();

          // ============================
          // PING
          // ============================

          if (command === "ping") {

            await sock.sendMessage(
              jid,
              {
                text:
                  "🏓 PONG!\n\n" +
                  "🤖 ZazaBot aktif."
              }
            );

          }

          // ============================
          // OWNER
          // ============================

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

          // ============================
          // RUNTIME
          // ============================

          else if (command === "runtime") {

            const uptime =
              Math.floor(
                (Date.now() - botUptime) / 1000
              );

            const hours =
              Math.floor(uptime / 3600);

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

          // ============================
          // MENU
          // ============================

          else if (command === "menu") {

            const menu = `
╭━━━〔 🤖 ZAZABOT 〕━━━╮
┃
┃ 👋 Halo!
┃
┃ Bot     : ${BOT_NAME}
┃ Prefix  : ${PREFIX}
┃
┣━━〔 GENERAL 〕━━
┃ .menu
┃ .ping
┃ .runtime
┃ .owner
┃
┣━━〔 GROUP 〕━━
┃ .add
┃ .kick
┃ .promote
┃ .demote
┃ .antilink
┃ .welcome
┃ .goodbye
┃ .tagall
┃ .hidetag
┃
┣━━〔 AI 〕━━
┃ .ai
┃ .openai
┃ .nexara
┃ .aiimage
┃
┣━━〔 GAME 〕━━
┃ .akinator
┃ .asahotak
┃ .caklontong
┃ .family100
┃ .math
┃ .truth
┃ .dare
┃
┣━━〔 STICKER 〕━━
┃ .sticker
┃ .attp
┃ .ttp
┃ .toimg
┃
┣━━〔 SEARCH 〕━━
┃ .google
┃ .googleimage
┃ .wikipedia
┃ .ytsearch
┃ .lirik
┃
┣━━〔 DOWNLOAD 〕━━
┃ .tiktoknowm
┃ .tiktokwm
┃ .igdl
┃ .igreel
┃ .facebook
┃ .ytmp3
┃ .ytmp4
┃
┣━━〔 TOOLS 〕━━
┃ .shortlink
┃ .ssweb
┃ .qrcode
┃ .tourl
┃ .readmore
┃
╰━━━━━━━━━━━━━━╯

⚡ ZazaBot siap digunakan.
`;

            await sock.sendMessage(
              jid,
              {
                text: menu
              }
            );

          }

        }

      }
    );

  } catch (error) {

    console.error(
      "❌ ERROR START BOT:"
    );

    console.error(error);

    setTimeout(() => {
      startBot();
    }, 10000);

  }

}

// =====================================
// JALANKAN BOT
// =====================================

startBot();
