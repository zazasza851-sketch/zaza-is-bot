import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} from "@whiskeysockets/baileys";

import pino from "pino";
import http from "http";

// ===============================
// KONFIGURASI ZAZABOT
// ===============================

const BOT_NAME = "zazasza";
const OWNER_NUMBER = "6289630747010";
const BOT_NUMBER = "6285866438941";
const PREFIX = ".";

const PORT = process.env.PORT || 8080;

// ===============================
// WEB SERVER BACK4APP
// ===============================

let pairingCode = "MENUNGGU...";
let connectionStatus = "STARTING";

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });

  res.end(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZazaBot</title>
<style>
body{
  background:#07152d;
  color:white;
  font-family:Arial;
  text-align:center;
  padding:40px 20px;
}
.box{
  max-width:500px;
  margin:auto;
  background:#10264a;
  padding:30px;
  border-radius:20px;
}
h1{color:#60a5fa}
.code{
  font-size:32px;
  font-weight:bold;
  letter-spacing:5px;
  margin:25px 0;
}
.status{
  font-size:18px;
}
</style>
</head>
<body>
<div class="box">
<h1>🤖 ZAZABOT</h1>
<p>WhatsApp Bot</p>

<div class="status">
Status: <b>${connectionStatus}</b>
</div>

<p>PAIRING CODE</p>

<div class="code">
${pairingCode}
</div>

<p>Gunakan kode tersebut di WhatsApp pada nomor bot.</p>
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

// ===============================
// BOT
// ===============================

async function startBot() {
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

  sock.ev.on("creds.update", saveCreds);

  let pairingRequested = false;

  // ===============================
  // CONNECTION UPDATE
  // ===============================

  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect,
      qr
    } = update;

    console.log(
      "CONNECTION UPDATE:",
      connection || "waiting"
    );

    // ===============================
    // PAIRING CODE
    // ===============================

    if (
      qr &&
      !pairingRequested &&
      !state.creds.registered
    ) {
      pairingRequested = true;

      console.log("");
      console.log("=================================");
      console.log("🔑 MEMBUAT PAIRING CODE ZAZABOT");
      console.log("=================================");

      try {
        const code =
          await sock.requestPairingCode(BOT_NUMBER);

        pairingCode = code;

        console.log("");
        console.log("=================================");
        console.log("🔑 PAIRING CODE ZAZABOT");
        console.log(code);
        console.log("=================================");
        console.log("");

      } catch (error) {

        pairingRequested = false;

        pairingCode = "GAGAL";

        console.error(
          "❌ GAGAL MEMBUAT PAIRING CODE"
        );

        console.error(error);
      }
    }

    // ===============================
    // CONNECTED
    // ===============================

    if (connection === "open") {

      connectionStatus = "CONNECTED";

      pairingCode = "TERHUBUNG";

      console.log("");
      console.log("=================================");
      console.log("✅ ZAZABOT BERHASIL TERHUBUNG");
      console.log("=================================");
      console.log("");
    }

    // ===============================
    // DISCONNECTED
    // ===============================

    if (connection === "close") {

      connectionStatus = "DISCONNECTED";

      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      console.log("");
      console.log("=================================");
      console.log("⚠️ KONEKSI TERPUTUS");
      console.log("STATUS:", statusCode);
      console.log("=================================");

      if (
        statusCode !== DisconnectReason.loggedOut
      ) {

        console.log(
          "🔄 Mencoba menghubungkan kembali..."
        );

        setTimeout(() => {
          startBot();
        }, 5000);

      } else {

        console.log(
          "❌ WhatsApp melakukan logout."
        );
      }
    }
  });

  // ===============================
  // PESAN MASUK
  // ===============================

  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {

      for (const msg of messages) {

        if (!msg.message) continue;

        const jid = msg.key.remoteJid;

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

        const command =
          text
            .slice(PREFIX.length)
            .trim()
            .split(/\s+/)[0]
            .toLowerCase();

        // ===============================
        // PING
        // ===============================

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

        // ===============================
        // OWNER
        // ===============================

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

        // ===============================
        // RUNTIME
        // ===============================

        else if (command === "runtime") {

          const uptime =
            process.uptime();

          const hours =
            Math.floor(uptime / 3600);

          const minutes =
            Math.floor(
              (uptime % 3600) / 60
            );

          const seconds =
            Math.floor(uptime % 60);

          await sock.sendMessage(
            jid,
            {
              text:
                "⏱️ ZAZABOT RUNTIME\n\n" +
                `${hours} jam ${minutes} menit ${seconds} detik`
            }
          );
        }

        // ===============================
        // MENU
        // ===============================

        else if (command === "menu") {

          const menu = `
╭━━━〔 🤖 ZAZABOT 〕━━━╮
┃
┃ 👋 Halo!
┃
┃ Bot: ${BOT_NAME}
┃ Prefix: ${PREFIX}
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
┣━━〔 INFO 〕━━
┃ .runtime
┃ .ping
┃ .owner
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
}

// ===============================
// START
// ===============================

startBot().catch((error) => {

  console.error(
    "❌ ERROR START BOT:"
  );

  console.error(error);
});
