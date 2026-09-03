import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import P from "pino";
import qrcode from "qrcode-terminal";

const BOT_NAME = "zazasza";
const BOT_NUMBER = "6285866438941";
const OWNER_NUMBER = "6289630747010";
const PREFIX = ".";

const startBot = async () => {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {

    if (qr) {
      console.log("\n==============================");
      console.log("📱 SCAN QR DENGAN WHATSAPP");
      console.log("==============================\n");

      qrcode.generate(qr, { small: true });
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
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {

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

      const args = text.trim().split(/\s+/);

      const command =
        args[0]
          .slice(PREFIX.length)
          .toLowerCase();

      /* =========================
         PING
      ========================= */

      if (command === "ping") {

        await sock.sendMessage(jid, {
          text:
`🏓 PONG!

🤖 Bot: ${BOT_NAME}
📱 Nomor: +${BOT_NUMBER}

✅ ZazaBot aktif.`
        });

      }

      /* =========================
         OWNER
      ========================= */

      else if (command === "owner") {

        await sock.sendMessage(jid, {
          text:
`👑 OWNER ZAZABOT

Nama Bot : ${BOT_NAME}
Bot      : +${BOT_NUMBER}
Owner    : +${OWNER_NUMBER}`
        });

      }

      /* =========================
         MENU
      ========================= */

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
