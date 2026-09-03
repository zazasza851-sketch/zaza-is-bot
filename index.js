import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import P from "pino";
import qrcode from "qrcode-terminal";
import http from "http";

const BOT_NAME = "zazasza";
const BOT_NUMBER = "6285866438941";
const OWNER_NUMBER = "6289630747010";
const PREFIX = ".";

// ===============================
// SERVER UNTUK BACK4APP
// ===============================
const PORT = process.env.PORT || 8080;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("ZazaBot aktif");
}).listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server berjalan di port ${PORT}`);
});

// ===============================
// START BOT
// ===============================
const startBot = async () => {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  // ===============================
  // CONNECTION
  // ===============================
  sock.ev.on(
    "connection.update",
    ({ connection, lastDisconnect, qr }) => {

      if (qr) {
        console.log("\n==============================");
        console.log("📱 SCAN QR DENGAN WHATSAPP");
        console.log("==============================\n");

        qrcode.generate(qr, {
          small: true
        });
      }

      if (connection === "open") {
        console.log("\n==============================");
        console.log("✅ ZAZABOT BERHASIL ONLINE");
        console.log("==============================");
        console.log(`🤖 Bot   : ${BOT_NAME}`);
        console.log(`📱 Nomor : ${BOT_NUMBER}`);
        console.log(`👑 Owner : ${OWNER_NUMBER}`);
        console.log("==============================\n");
      }

      if (connection === "close") {
        const code =
          lastDisconnect?.error?.output?.statusCode;

        if (code !== DisconnectReason.loggedOut) {
          console.log("🔄 Menghubungkan kembali...");
          startBot();
        } else {
          console.log("❌ WhatsApp logout.");
        }
      }
    }
  );

  // ===============================
  // PESAN MASUK
  // ===============================
  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {

      try {
        const msg = messages[0];

        if (!msg?.message) return;
        if (msg.key.fromMe) return;

        const jid = msg.key.remoteJid;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          "";

        if (!text.startsWith(PREFIX)) return;

        const args =
          text.trim().split(/\s+/);

        const command =
          args[0]
            .slice(PREFIX.length)
            .toLowerCase();

        // ===============================
        // PING
        // ===============================
        if (command === "ping") {

          await sock.sendMessage(jid, {
            text:
`🏓 PONG!

🤖 Bot: ${BOT_NAME}
📱 Nomor: +${BOT_NUMBER}

✅ ZazaBot aktif.`
          });

        }

        // ===============================
        // OWNER
        // ===============================
        else if (command === "owner") {

          await sock.sendMessage(jid, {
            text:
`👑 OWNER ZAZABOT

Nama Bot : ${BOT_NAME}
Bot      : +${BOT_NUMBER}
Owner    : +${OWNER_NUMBER}`
          });

        }

        // ===============================
        // MENU
        // ===============================
        else if (command === "menu") {

          await sock.sendMessage(jid, {
            text:
`╭───「 ZAZABOT 」───
│
│ 🤖 Bot : ${BOT_NAME}
│ 📱 Bot : +${BOT_NUMBER}
│ 👑 Owner : +${OWNER_NUMBER}
│
├─「 GROUP 」
│ • .absen
│ • .add
│ • .addalarm
│ • .addbadword
│ • .addlist
│ • .updatelist
│ • .uplist
│ • .addpoin
│ • .addreminder
│ • .afk
│ • .antibadword
│ • .antibot
│ • .antidelete
│ • .antilink
│ • .antilinkchannel
│ • .antiluar
│ • .kick
│ • .promote
│ • .demote
│ • .tagall
│ • .hidetag
│ • .groupadmin
│ • .groupinfo
│ • .linkgc
│ • .setwelcome
│ • .setleft
│ • .welcome
│
├─「 OWNER 」
│ • .addbalance
│ • .addlevel
│ • .addlimit
│ • .addpremium
│ • .addrespon
│ • .addsewa
│ • .addxp
│ • .ban
│ • .block
│ • .broadcast
│ • .join
│ • .leaveall
│ • .public
│ • .self
│ • .setbio
│ • .setname
│ • .setpp
│
├─「 AI 」
│ • .aiimage
│ • .bard
│ • .jadianime
│ • .nexara
│ • .openai
│ • .voicejapan
│
├─「 GAME 」
│ • .akinator
│ • .asahotak
│ • .caklontong
│ • .dare
│ • .family100
│ • .math
│ • .truth
│ • .tebakgambar
│ • .tebaklagu
│ • .uno
│
├─「 RANDOM 」
│ • .alay
│ • .apakah
│ • .cekkhodam
│ • .faktaunik
│ • .husbu
│ • .jadian
│ • .katabijak
│ • .pantun
│ • .puisi
│ • .quotesanime
│ • .randommeme
│ • .waifu
│
├─「 SEARCH 」
│ • .alkitab
│ • .artinama
│ • .brainly
│ • .cekidff
│ • .cekidml
│ • .cuaca
│ • .google
│ • .googleimage
│ • .igstalk
│ • .lirik
│ • .pinterest
│ • .play
│ • .wikipedia
│ • .ytsearch
│
├─「 STICKER 」
│ • .attp
│ • .brat
│ • .sticker
│ • .stickerinfo
│ • .stickerly
│ • .stickerwm
│ • .takesticker
│ • .toimg
│ • .ttp
│
├─「 TOOLS 」
│ • .blur
│ • .ebase64
│ • .dbase64
│ • .enc
│ • .dec
│ • .ocr
│ • .qrcode
│ • .qrcodereader
│ • .removebackground
│ • .shortlink
│ • .tomp3
│ • .tourl
│ • .translate
│ • .tts
│ • .upscale
│
├─「 INFO 」
│ • .balance
│ • .cekpremium
│ • .level
│ • .limit
│ • .listban
│ • .listblock
│ • .listcommand
│ • .listgroup
│ • .listpremium
│ • .profile
│ • .status
│ • .topglobal
│ • .toplocal
│
├─「 DOWNLOAD 」
│ • .douyin
│ • .facebook
│ • .igdl
│ • .igreel
│ • .mediafire
│ • .spotify
│ • .tiktoknowm
│ • .tiktokwm
│ • .twitterdl
│ • .ytmp3
│ • .ytmp4
│
├─「 TEXTMAKER 」
│ • .window
│ • .thunder
│ • .bear
│ • .cloud
│ • .neon
│ • .sky
│ • .cartoon
│ • .halloween
│ • .glitch
│ • .thor
│ • .wolf
│ • .marvel
│ • .graffiti
│ • .deadpool
│
├─「 GENERAL 」
│ • .menu
│ • .ping
│ • .owner
│ • .runtime
│
╰──────────────────

> @_zazasza`
          });

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
            Math.floor(
              uptime % 60
            );

          await sock.sendMessage(jid, {
            text:
`⏱️ ZAZABOT RUNTIME

${hours} jam
${minutes} menit
${seconds} detik`
          });

        }

      } catch (error) {

        console.log(
          "Error:",
          error
        );

      }
    }
  );
};

// ===============================
// JALANKAN BOT
// ===============================
startBot();
