import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} from "@whiskeysockets/baileys";

import pino from "pino";
import QRCode from "qrcode";
import http from "http";
import fs from "fs";

const BOT_NAME = "zazasza";
const OWNER_NUMBER = "6289630747010";
const PREFIX = ".";

const PORT = process.env.PORT || 8080;

let qrImage = "";
let connectionStatus = "MEMULAI ZAZABOT...";
const startTime = Date.now();


// ================================
// DATABASE
// ================================

const DB_FILE = "./database.json";

let db = {
  users: {},
  groups: {}
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(
        fs.readFileSync(DB_FILE, "utf8")
      );
    }
  } catch (e) {
    console.log("Database baru dibuat.");
  }
}

function saveDB() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (e) {
    console.log("Gagal menyimpan database:", e);
  }
}

loadDB();


// ================================
// USER
// ================================

function getUser(jid) {

  if (!db.users[jid]) {

    db.users[jid] = {
      balance: 0,
      limit: 20,
      level: 1,
      xp: 0,
      premium: false,
      warns: 0
    };

    saveDB();
  }

  return db.users[jid];
}


// ================================
// GROUP
// ================================

function getGroup(jid) {

  if (!db.groups[jid]) {

    db.groups[jid] = {
      welcome: false,
      left: false,
      antilink: false,
      warn: {},
      blacklist: []
    };

    saveDB();
  }

  return db.groups[jid];
}


// ================================
// MENU
// ================================

const MENU = `

╭━━━〔 🤖 ZAZABOT 〕━━━╮
┃
┃ Bot    : zazasza
┃ Owner  : 6289630747010
┃ Prefix : .
┃
┣━━〔 GENERAL 〕━━
┃ .menu
┃ .list
┃ .ping
┃ .runtime
┃ .owner
┃
┣━━〔 GROUP 〕━━
┃ .add
┃ .kick
┃ .promote
┃ .demote
┃ .tagall
┃ .hidetag
┃ .groupinfo
┃ .groupadmin
┃ .linkgc
┃ .revokelink
┃ .setnamegc
┃ .setdescgc
┃ .setopen
┃ .setclose
┃ .kickme
┃ .left
┃ .warn
┃ .cekwarn
┃ .resetwarn
┃ .blacklist
┃ .delblacklist
┃ .listblacklist
┃
┣━━〔 OWNER 〕━━
┃ .addbalance
┃ .delbalance
┃ .addlimit
┃ .dellimit
┃ .addxp
┃ .delxp
┃ .addlevel
┃ .dellevel
┃ .addpremium
┃ .delpremium
┃ .ban
┃ .unban
┃ .block
┃ .unblock
┃ .public
┃ .self
┃
┣━━〔 INFO 〕━━
┃ .profile
┃ .balance
┃ .limit
┃ .level
┃ .cekpremium
┃ .status
┃ .listpremium
┃
┣━━〔 GAME 〕━━
┃ .math
┃ .truth
┃ .dare
┃ .asahotak
┃ .caklontong
┃ .tebakkata
┃ .randomnumber
┃
┣━━〔 RANDOM 〕━━
┃ .apakah
┃ .faktaunik
┃ .katabijak
┃ .pantun
┃ .puisi
┃ .quotesanime
┃ .rate
┃ .siapakah
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
┣━━〔 SEARCH 〕━━
┃ .google
┃ .googleimage
┃ .wikipedia
┃ .ytsearch
┃ .lirik
┃ .cuaca
┃
┣━━〔 STICKER 〕━━
┃ .attp
┃ .brat
┃ .bratvideo
┃ .sticker
┃ .toimg
┃ .ttp
┃
┣━━〔 TOOLS 〕━━
┃ .qrcode
┃ .qrcodereader
┃ .readmore
┃ .shortlink
┃ .tourl
┃ .translate
┃ .tts
┃
┣━━〔 DOWNLOAD 〕━━
┃ .douyin
┃ .facebook
┃ .igdl
┃ .igreel
┃ .mediafire
┃ .spotify
┃ .tiktoknowm
┃ .tiktokwm
┃ .ytmp3
┃ .ytmp4
┃
┣━━〔 TEXTMAKER 〕━━
┃ .neon
┃ .glow
┃ .cloud
┃ .firework
┃ .glitch
┃ .marvel
┃ .graffiti
┃ .batman
┃
╰━━━━━━━━━━━━━━━━╯

⚡ ZazaBot aktif

@_zazasza
`;


// ================================
// WEB QR
// ================================

const server = http.createServer(
  (req, res) => {

    res.writeHead(200, {
      "Content-Type":
        "text/html; charset=utf-8"
    });

    res.end(`
<!DOCTYPE html>

<html lang="id">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<meta http-equiv="refresh"
content="5">

<title>ZazaBot</title>

<style>

body {
  margin:0;
  padding:20px;
  background:#07152d;
  color:white;
  font-family:Arial;
  text-align:center;
}

.card {
  max-width:450px;
  margin:40px auto;
  padding:30px;
  background:#10264a;
  border-radius:25px;
}

h1 {
  color:#60a5fa;
}

.status {
  padding:15px;
  background:#07152d;
  border-radius:15px;
}

.qr {
  width:280px;
  max-width:90%;
  background:white;
  padding:10px;
  border-radius:15px;
}

</style>

</head>

<body>

<div class="card">

<div style="font-size:55px">
🤖
</div>

<h1>ZAZABOT</h1>

<p>WhatsApp Bot</p>

<div class="status">
Status:
<b>${connectionStatus}</b>
</div>

${
  qrImage
  ? `
    <p>📱 Scan QR WhatsApp</p>
    <img class="qr" src="${qrImage}">
  `
  : `
    <p>⏳ Menunggu QR...</p>
  `
}

<p>
Bot: zazasza<br>
Owner: 6289630747010
</p>

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
      "🌐 ZAZABOT WEB SERVER AKTIF"
    );

    console.log(
      "PORT:",
      PORT
    );
  }
);


// ================================
// HELPER
// ================================

function getText(msg) {

  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ""
  );

}

function getTarget(msg, args) {

  const context =
    msg.message
      ?.extendedTextMessage
      ?.contextInfo;

  if (
    context?.mentionedJid?.length
  ) {

    return context.mentionedJid[0];

  }

  if (
    context?.participant
  ) {

    return context.participant;

  }

  if (args[0]) {

    let number =
      args[0].replace(
        /\D/g,
        ""
      );

    if (
      number.startsWith("0")
    ) {

      number =
        "62" +
        number.slice(1);

    }

    if (
      number.length >= 8
    ) {

      return (
        number +
        "@s.whatsapp.net"
      );

    }

  }

  return null;

}

async function getGroupInfo(
  sock,
  jid
) {

  return await sock.groupMetadata(
    jid
  );

}

function isAdmin(
  metadata,
  jid
) {

  const participant =
    metadata.participants.find(
      p => p.id === jid
    );

  return (
    participant?.admin === "admin" ||
    participant?.admin === "superadmin"
  );

}

async function requireAdmin(
  sock,
  msg,
  jid
) {

  if (
    !jid.endsWith("@g.us")
  ) {

    await sock.sendMessage(
      jid,
      {
        text:
          "❌ Perintah ini hanya untuk grup."
      }
    );

    return false;

  }

  const metadata =
    await getGroupInfo(
      sock,
      jid
    );

  const sender =
    msg.key.participant;

  const bot =
    sock.user?.id;

  if (
    !isAdmin(
      metadata,
      sender
    )
  ) {

    await sock.sendMessage(
      jid,
      {
        text:
          "❌ Hanya admin grup."
      }
    );

    return false;

  }

  if (
    !isAdmin(
      metadata,
      bot
    )
  ) {

    await sock.sendMessage(
      jid,
      {
        text:
          "❌ Jadikan ZazaBot sebagai admin terlebih dahulu."
      }
    );

    return false;

  }

  return true;

}

function isOwner(jid) {

  const number =
    jid
      .split("@")[0]
      .split(":")[0];

  return (
    number === OWNER_NUMBER
  );

}


// ================================
// START BOT
// ================================

let reconnecting = false;

async function startBot() {

  try {

    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        "./session"
      );

    const sock =
      makeWASocket({

        auth: state,

        browser:
          Browsers.ubuntu(
            "ZazaBot"
          ),

        printQRInTerminal:
          false,

        logger:
          pino({
            level: "silent"
          }),

        markOnlineOnConnect:
          false,

        syncFullHistory:
          false

      });

    sock.ev.on(
      "creds.update",
      saveCreds
    );


    sock.ev.on(
      "connection.update",
      async update => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;

        console.log(
          "CONNECTION:",
          connection || "waiting"
        );

        if (qr) {

          try {

            qrImage =
              await QRCode.toDataURL(
                qr,
                {
                  width:500,
                  margin:2
                }
              );

            connectionStatus =
              "MENUNGGU SCAN QR";

            console.log(
              "📱 QR ZAZABOT TERSEDIA"
            );

          } catch (e) {

            console.log(
              "QR ERROR:",
              e
            );

          }

        }

        if (
          connection === "open"
        ) {

          connectionStatus =
            "🟢 ZAZABOT TERHUBUNG";

          qrImage = "";

          reconnecting = false;

          console.log(
            "================================"
          );

          console.log(
            "✅ ZAZABOT TERHUBUNG"
          );

          console.log(
            "================================"
          );

        }

        if (
          connection === "close"
        ) {

          connectionStatus =
            "🔴 TERPUTUS";

          const code =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log(
            "DISCONNECT:",
            code
          );

          if (
            code !==
            DisconnectReason.loggedOut &&
            !reconnecting
          ) {

            reconnecting = true;

            setTimeout(
              () => {

                reconnecting = false;

                startBot();

              },
              5000
            );

          }

        }

      }
    );


    // ================================
    // PESAN
    // ================================

    sock.ev.on(
      "messages.upsert",
      async ({
        messages
      }) => {

        for (
          const msg of messages
        ) {

          try {

            if (
              !msg.message
            )
              continue;

            if (
              msg.key.fromMe
            )
              continue;

            const jid =
              msg.key.remoteJid;

            if (!jid)
              continue;

            const text =
              getText(msg);

            if (
              !text.startsWith(
                PREFIX
              )
            )
              continue;

            const parts =
              text
                .slice(
                  PREFIX.length
                )
                .trim()
                .split(/\s+/);

            const command =
              parts.shift()
                ?.toLowerCase();

            const args =
              parts;

            const sender =
              msg.key.participant ||
              jid;

            const user =
              getUser(sender);


            // =========================
            // GENERAL
            // =========================

            if (
              command === "menu" ||
              command === "list"
            ) {

              await sock.sendMessage(
                jid,
                {
                  text: MENU
                }
              );

              continue;

            }

            if (
              command === "ping"
            ) {

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🏓 PONG!\n\n" +
                    "🤖 ZazaBot aktif."
                }
              );

              continue;

            }

            if (
              command === "owner"
            ) {

              await sock.sendMessage(
                jid,
                {
                  text:
                    "👑 OWNER ZAZABOT\n\n" +
                    "https://wa.me/" +
                    OWNER_NUMBER
                }
              );

              continue;

            }

            if (
              command === "runtime"
            ) {

              const total =
                Math.floor(
                  (
                    Date.now() -
                    startTime
                  ) / 1000
                );

              const h =
                Math.floor(
                  total / 3600
                );

              const m =
                Math.floor(
                  (
                    total % 3600
                  ) / 60
                );

              const s =
                total % 60;

              await sock.sendMessage(
                jid,
                {
                  text:
                    `⏱️ Runtime\n\n${h} jam ${m} menit ${s} detik`
                }
              );

              continue;

            }


            // =========================
            // PROFILE
            // =========================

            if (
              command === "profile"
            ) {

              await sock.sendMessage(
                jid,
                {
                  text:
                    "👤 PROFILE\n\n" +
                    `💰 Balance : ${user.balance}\n` +
                    `🎚️ Level   : ${user.level}\n` +
                    `⭐ XP      : ${user.xp}\n` +
                    `⚡ Limit   : ${user.limit}\n` +
                    `💎 Premium : ${user.premium ? "YA" : "TIDAK"}`
                }
              );

              continue;

            }

            if (
              command === "balance"
            ) {

              await sock.sendMessage(
                jid,
                {
                  text:
                    `💰 Balance kamu: ${user.balance}`
                }
              );

              continue;

            }

            if (
              command === "limit"
            ) {

              await sock.sendMessage(
                jid,
                {
                  text:
                    `⚡ Limit kamu: ${user.limit}`
                }
              );

              continue;

            }

            if (
              command === "level"
            ) {

              await sock.sendMessage(
                jid,
                {
                  text:
                    `🎚️ Level: ${user.level}\n⭐ XP: ${user.xp}`
                }
              );

              continue;

            }

            if (
              command === "cekpremium"
            ) {

              await sock.sendMessage(
                jid,
                {
                  text:
                    user.premium
                    ? "💎 Kamu adalah user PREMIUM."
                    : "❌ Kamu belum PREMIUM."
                }
              );

              continue;

            }

            if (
              command === "status"
            ) {

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🤖 ZazaBot Status\n\n" +
                    "🟢 Online\n" +
                    `👤 User: ${Object.keys(db.users).length}\n` +
                    `👥 Group: ${Object.keys(db.groups).length}`
                }
              );

              continue;

            }


            // =========================
            // OWNER
            // =========================

            if (
              [
                "addbalance",
                "delbalance",
                "addlimit",
                "dellimit",
                "addxp",
                "delxp",
                "addlevel",
                "dellevel",
                "addpremium",
                "delpremium",
                "ban",
                "unban",
                "block",
                "unblock",
                "public",
                "self"
              ].includes(command)
            ) {

              if (
                !isOwner(sender)
              ) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Perintah khusus owner."
                  }
                );

                continue;

              }

            }


            if (
              command === "addbalance"
            ) {

              const target =
                getTarget(
                  msg,
                  args
                );

              const amount =
                Number(
                  args.find(
                    x => /^\d+$/.test(x)
                  )
                );

              if (
                !target ||
                !amount
              ) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Contoh:\n.addbalance 628xxxxxxxx 1000"
                  }
                );

                continue;

              }

              getUser(target)
                .balance += amount;

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    `✅ Balance ditambah ${amount}.`
                }
              );

              continue;

            }


            if (
              command === "delbalance"
            ) {

              const target =
                getTarget(
                  msg,
                  args
                );

              const amount =
                Number(
                  args.find(
                    x => /^\d+$/.test(x)
                  )
                );

              if (
                !target ||
                !amount
              ) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Contoh:\n.delbalance 628xxxxxxxx 1000"
                  }
                );

                continue;

              }

              const targetUser =
                getUser(target);

              targetUser.balance =
                Math.max(
                  0,
                  targetUser.balance -
                  amount
                );

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    `✅ Balance dikurangi ${amount}.`
                }
              );

              continue;

            }


            if (
              command === "addlimit"
            ) {

              const target =
                getTarget(
                  msg,
                  args
                );

              const amount =
                Number(
                  args.find(
                    x => /^\d+$/.test(x)
                  )
                );

              if (
                !target ||
                !amount
              ) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Contoh:\n.addlimit 628xxxxxxxx 10"
                  }
                );

                continue;

              }

              getUser(target)
                .limit += amount;

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    `✅ Limit ditambah ${amount}.`
                }
              );

              continue;

            }


            if (
              command === "dellimit"
            ) {

              const target =
                getTarget(
                  msg,
                  args
                );

              const amount =
                Number(
                  args.find(
                    x => /^\d+$/.test(x)
                  )
                );

              if (
                !target ||
                !amount
              ) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Contoh:\n.dellimit 628xxxxxxxx 10"
                  }
                );

                continue;

              }

              const targetUser =
                getUser(target);

              targetUser.limit =
                Math.max(
                  0,
                  targetUser.limit -
                  amount
                );

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    `✅ Limit dikurangi ${amount}.`
                }
              );

              continue;

            }


            if (
              command === "addxp"
            ) {

              const target =
                getTarget(
                  msg,
                  args
                );

              const amount =
                Number(
                  args.find(
                    x => /^\d+$/.test(x)
                  )
                );

              if (
                !target ||
                !amount
              ) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Contoh:\n.addxp 628xxxxxxxx 100"
                  }
                );

                continue;

              }

              getUser(target)
                .xp += amount;

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    `✅ XP ditambah ${amount}.`
                }
              );

              continue;

            }


            if (
              command === "addlevel"
            ) {

              const target =
                getTarget(
                  msg,
                  args
                );

              const amount =
                Number(
                  args.find(
                    x => /^\d+$/.test(x)
                  )
                );

              if (
                !target ||
                !amount
              ) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Contoh:\n.addlevel 628xxxxxxxx 1"
                  }
                );

                continue;

              }

              getUser(target)
                .level += amount;

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    `✅ Level ditambah ${amount}.`
                }
              );

              continue;

            }


            if (
              command === "addpremium"
            ) {

              const target =
                getTarget(
                  msg,
                  args
                );

              if (!target) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Mention/reply user."
                  }
                );

                continue;

              }

              getUser(target)
                .premium = true;

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    "💎 ✅ User sekarang PREMIUM."
                }
              );

              continue;

            }


            if (
              command === "delpremium"
            ) {

              const target =
                getTarget(
                  msg,
                  args
                );

              if (!target) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Mention/reply user."
                  }
                );

                continue;

              }

              getUser(target)
                .premium = false;

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    "✅ Premium user dihapus."
                }
              );

              continue;

            }


            // =========================
            // GROUP INFO
            // =========================

            if (
              command === "groupinfo"
            ) {

              if (
                !jid.endsWith(
                  "@g.us"
                )
              ) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Hanya untuk grup."
                  }
                );

                continue;

              }

              const metadata =
                await getGroupInfo(
                  sock,
                  jid
                );

              const admins =
                metadata.participants
                  .filter(
                    p => p.admin
                  );

              await sock.sendMessage(
                jid,
                {
                  text:
                    "👥 GROUP INFO\n\n" +
                    `📛 Nama: ${metadata.subject}\n` +
                    `👤 Member: ${metadata.participants.length}\n` +
                    `👑 Admin: ${admins.length}\n` +
                    `🆔 ID: ${jid}`
                }
              );

              continue;

            }


            if (
              command === "groupadmin"
            ) {

              if (
                !jid.endsWith(
                  "@g.us"
                )
              )
                continue;

              const metadata =
                await getGroupInfo(
                  sock,
                  jid
                );

              const admins =
                metadata.participants
                  .filter(
                    p => p.admin
                  );

              const mentions =
                admins.map(
                  p => p.id
                );

              let txt =
                "👑 ADMIN GRUP\n\n";

              for (
                const admin of admins
              ) {

                txt +=
                  `• @${admin.id.split("@")[0]}\n`;

              }

              await sock.sendMessage(
                jid,
                {
                  text: txt,
                  mentions
                }
              );

              continue;

            }


            if (
              command === "add" ||
              command === "kick" ||
              command === "promote" ||
              command === "demote"
            ) {

              if (
                !await requireAdmin(
                  sock,
                  msg,
                  jid
                )
              )
                continue;

              const target =
                getTarget(
                  msg,
                  args
                );

              if (!target) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      `❌ Contoh:\n.${command} 628xxxxxxxx\n\natau mention/reply orangnya.`
                  }
                );

                continue;

              }

              const action =
                command === "add"
                ? "add"
                : command === "kick"
                ? "remove"
                : command;

              await sock.groupParticipantsUpdate(
                jid,
                [target],
                action
              );

              await sock.sendMessage(
                jid,
                {
                  text:
                    `✅ Perintah ${command} berhasil dikirim.`
                }
              );

              continue;

            }


            if (
              command === "kickme"
            ) {

              if (
                !await requireAdmin(
                  sock,
                  msg,
                  jid
                )
              )
                continue;

              await sock.groupParticipantsUpdate(
                jid,
                [sender],
                "remove"
              );

              continue;

            }


            if (
              command === "left"
            ) {

              if (
                !isOwner(sender)
              ) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Hanya owner."
                  }
                );

                continue;

              }

              await sock.groupLeave(
                jid
              );

              continue;

            }


            if (
              command === "tagall"
            ) {

              if (
                !jid.endsWith(
                  "@g.us"
                )
              )
                continue;

              const metadata =
                await getGroupInfo(
                  sock,
                  jid
                );

              const mentions =
                metadata.participants
                  .map(
                    p => p.id
                  );

              let txt =
                "📢 *TAG ALL*\n\n";

              for (
                const p
                of metadata.participants
              ) {

                txt +=
                  `@${p.id.split("@")[0]} `;

              }

              await sock.sendMessage(
                jid,
                {
                  text: txt,
                  mentions
                }
              );

              continue;

            }


            if (
              command === "hidetag"
            ) {

              if (
                !jid.endsWith(
                  "@g.us"
                )
              )
                continue;

              const metadata =
                await getGroupInfo(
                  sock,
                  jid
                );

              const mentions =
                metadata.participants
                  .map(
                    p => p.id
                  );

              await sock.sendMessage(
                jid,
                {
                  text:
                    args.join(" ") ||
                    "📢 Semua anggota grup",
                  mentions
                }
              );

              continue;

            }


            if (
              command === "linkgc"
            ) {

              if (
                !await requireAdmin(
                  sock,
                  msg,
                  jid
                )
              )
                continue;

              const code =
                await sock.groupInviteCode(
                  jid
                );

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🔗 LINK GRUP\n\n" +
                    "https://chat.whatsapp.com/" +
                    code
                }
              );

              continue;

            }


            if (
              command === "revokelink"
            ) {

              if (
                !await requireAdmin(
                  sock,
                  msg,
                  jid
                )
              )
                continue;

              await sock.groupRevokeInvite(
                jid
              );

              await sock.sendMessage(
                jid,
                {
                  text:
                    "✅ Link grup berhasil direset."
                }
              );

              continue;

            }


            if (
              command === "setnamegc"
            ) {

              if (
                !await requireAdmin(
                  sock,
                  msg,
                  jid
                )
              )
                continue;

              const name =
                args.join(" ");

              if (!name) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Contoh:\n.setnamegc Zaza Store"
                  }
                );

                continue;

              }

              await sock.groupUpdateSubject(
                jid,
                name
              );

              await sock.sendMessage(
                jid,
                {
                  text:
                    "✅ Nama grup berhasil diubah."
                }
              );

              continue;

            }


            if (
              command === "setdescgc"
            ) {

              if (
                !await requireAdmin(
                  sock,
                  msg,
                  jid
                )
              )
                continue;

              const desc =
                args.join(" ");

              if (!desc) {

                await sock.sendMessage(
                  jid,
                  {
                    text:
                      "❌ Contoh:\n.setdescgc Grup Zaza Store"
                  }
                );

                continue;

              }

              await sock.groupUpdateDescription(
                jid,
                desc
              );

              await sock.sendMessage(
                jid,
                {
                  text:
                    "✅ Deskripsi grup berhasil diubah."
                }
              );

              continue;

            }


            if (
              command === "setopen"
            ) {

              if (
                !await requireAdmin(
                  sock,
                  msg,
                  jid
                )
              )
                continue;

              await sock.groupSettingUpdate(
                jid,
                "not_announcement"
              );

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🔓 Grup dibuka."
                }
              );

              continue;

            }


            if (
              command === "setclose"
            ) {

              if (
                !await requireAdmin(
                  sock,
                  msg,
                  jid
                )
              )
                continue;

              await sock.groupSettingUpdate(
                jid,
                "announcement"
              );

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🔒 Grup ditutup. Hanya admin yang dapat mengirim pesan."
                }
              );

              continue;

            } 
                      // =========================
            // WARN
            // =========================

            if (command === "warn") {

              if (!jid.endsWith("@g.us"))
                continue;

              const target =
                getTarget(msg, args) || sender;

              const group =
                getGroup(jid);

              if (!group.warn[target])
                group.warn[target] = 0;

              group.warn[target]++;

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    `⚠️ Warning diberikan.\n\nJumlah warn: ${group.warn[target]}`
                }
              );

              continue;
            }


            if (command === "cekwarn") {

              if (!jid.endsWith("@g.us"))
                continue;

              const target =
                getTarget(msg, args) || sender;

              const group =
                getGroup(jid);

              const count =
                group.warn[target] || 0;

              await sock.sendMessage(
                jid,
                {
                  text:
                    `⚠️ Warn: ${count}`
                }
              );

              continue;
            }


            if (command === "resetwarn") {

              if (
                !await requireAdmin(
                  sock,
                  msg,
                  jid
                )
              )
                continue;

              const target =
                getTarget(msg, args);

              if (!target)
                continue;

              const group =
                getGroup(jid);

              group.warn[target] = 0;

              saveDB();

              await sock.sendMessage(
                jid,
                {
                  text:
                    "✅ Warn berhasil direset."
                }
              );

              continue;
            }


            // =========================
            // RANDOM
            // =========================

            if (command === "randomnumber") {

              const min =
                Number(args[0]) || 1;

              const max =
                Number(args[1]) || 100;

              const result =
                Math.floor(
                  Math.random() *
                  (max - min + 1)
                ) + min;

              await sock.sendMessage(
                jid,
                {
                  text:
                    `🎲 Angka random: ${result}`
                }
              );

              continue;
            }


            if (command === "apakah") {

              const answers = [
                "Iya ✅",
                "Tidak ❌",
                "Mungkin 🤔",
                "Coba lagi 🔄",
                "Kemungkinan besar iya 👍",
                "Kemungkinan besar tidak 👎"
              ];

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🔮 " +
                    answers[
                      Math.floor(
                        Math.random() *
                        answers.length
                      )
                    ]
                }
              );

              continue;
            }


            if (command === "rate") {

              const target =
                args.join(" ") ||
                "kamu";

              const value =
                Math.floor(
                  Math.random() * 101
                );

              await sock.sendMessage(
                jid,
                {
                  text:
                    `📊 Rate ${target}: ${value}%`
                }
              );

              continue;
            }


            if (command === "faktaunik") {

              const facts = [
                "Gurita memiliki tiga jantung.",
                "Madu dapat bertahan sangat lama jika disimpan dengan benar.",
                "Pisang secara botani termasuk berry.",
                "Jantung manusia berdetak ribuan kali setiap hari.",
                "Lebah dapat mengenali pola dan wajah sederhana."
              ];

              await sock.sendMessage(
                jid,
                {
                  text:
                    "💡 FAKTA UNIK\n\n" +
                    facts[
                      Math.floor(
                        Math.random() *
                        facts.length
                      )
                    ]
                }
              );

              continue;
            }


            if (command === "katabijak") {

              const quotes = [
                "Tetap berjalan walau perlahan.",
                "Kesuksesan dimulai dari langkah kecil.",
                "Jangan menyerah hanya karena hari ini sulit.",
                "Belajar dari kesalahan dan lanjutkan perjalanan."
              ];

              await sock.sendMessage(
                jid,
                {
                  text:
                    "💭 " +
                    quotes[
                      Math.floor(
                        Math.random() *
                        quotes.length
                      )
                    ]
                }
              );

              continue;
            }


            if (command === "pantun") {

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🌸 *PANTUN*\n\n" +
                    "Pergi pagi membeli jamu,\n" +
                    "Singgah sebentar membeli roti.\n" +
                    "Kalau ingin cita-citamu maju,\n" +
                    "Belajarlah dengan sepenuh hati."
                }
              );

              continue;
            }


            if (command === "puisi") {

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🌙 *PUISI*\n\n" +
                    "Langkah kecil terus berjalan,\n" +
                    "Mengejar mimpi di masa depan.\n" +
                    "Walau jalan penuh tantangan,\n" +
                    "Jangan berhenti memperjuangkan."
                }
              );

              continue;
            }


            // =========================
            // GAME
            // =========================

            if (command === "math") {

              const a =
                Math.floor(
                  Math.random() * 20
                ) + 1;

              const b =
                Math.floor(
                  Math.random() * 20
                ) + 1;

              const answer =
                a + b;

              await sock.sendMessage(
                jid,
                {
                  text:
                    `🧮 *MATH*\n\n${a} + ${b} = ?\n\nJawaban: ${answer}`
                }
              );

              continue;
            }


            if (command === "truth") {

              const questions = [
                "Apa impian terbesar kamu?",
                "Apa hal yang paling kamu takutkan?",
                "Siapa orang yang paling kamu kagumi?",
                "Apa pengalaman paling berkesan buat kamu?"
              ];

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🎯 *TRUTH*\n\n" +
                    questions[
                      Math.floor(
                        Math.random() *
                        questions.length
                      )
                    ]
                }
              );

              continue;
            }


            if (command === "dare") {

              const dares = [
                "Kirim emoji favoritmu.",
                "Tulis nama kamu dengan huruf terbalik.",
                "Kirim satu kata yang menggambarkan dirimu.",
                "Sebutkan tiga hal yang kamu sukai."
              ];

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🔥 *DARE*\n\n" +
                    dares[
                      Math.floor(
                        Math.random() *
                        dares.length
                      )
                    ]
                }
              );

              continue;
            }


            if (command === "asahotak") {

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🧠 *ASAH OTAK*\n\n" +
                    "Apa yang memiliki banyak gigi tetapi tidak bisa menggigit?\n\n" +
                    "Jawaban: SISIR."
                }
              );

              continue;
            }


            if (command === "caklontong") {

              await sock.sendMessage(
                jid,
                {
                  text:
                    "🤣 *CAK LONTONG*\n\n" +
                    "Apa yang naik tetapi tidak pernah turun?\n\n" +
                    "Jawaban: UMUR."
                }
              );

              continue;
            }


            if (command === "tebakkata") {

              const words = [
                "KUCING",
                "SEKOLAH",
                "KOMPUTER",
                "MATAHARI",
                "WHATSAPP"
              ];

              const word =
                words[
                  Math.floor(
                    Math.random() *
                    words.length
                  )
                ];

              const hidden =
                word
                  .split("")
                  .map(
                    (_, i) =>
                      i % 2 === 0
                        ? "_"
                        : word[i]
                  )
                  .join(" ");

              await sock.sendMessage(
                jid,
                {
                  text:
                    `🎮 *TEBAK KATA*\n\n${hidden}\n\nJawaban: ${word}`
                }
              );

              continue;
            }


            // =========================
            // COMMAND BELUM TERSEDIA
            // =========================

            await sock.sendMessage(
              jid,
              {
                text:
                  `❌ Command .${command} belum mempunyai fungsi.\n\nKetik .menu untuk melihat menu.`
              }
            );

          } catch (error) {

            console.log(
              "COMMAND ERROR:",
              error
            );

            try {

              await sock.sendMessage(
                msg.key.remoteJid,
                {
                  text:
                    "❌ Terjadi error saat menjalankan command."
                }
              );

            } catch {}

          }

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
      10000
    );

  }

}


// ================================
// START
// ================================

startBot();
