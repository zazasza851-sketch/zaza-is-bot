```html
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>Zaza Bot</title>

    <link rel="stylesheet" href="css/style.css">
</head>

<body>

    <!-- SIDEBAR -->
    <aside class="sidebar" id="sidebar">

        <div class="logo">
            <div class="logo-icon">Z</div>

            <div>
                <h2>Zaza Bot</h2>
                <small>WhatsApp Bot</small>
            </div>
        </div>

        <button class="new-chat" onclick="newChat()">
            ＋ Chat Baru
        </button>

        <nav class="menu">
            <a href="#chat">💬 Chat</a>
            <a href="#commands">⚡ Commands</a>
            <a href="#owner">👑 Owner</a>
            <a href="#about">ℹ️ Tentang Bot</a>
        </nav>

        <div class="sidebar-footer">
            <p>Bot Number</p>
            <strong>6285866438941</strong>
        </div>

    </aside>


    <!-- MAIN -->
    <main class="main">

        <!-- HEADER -->
        <header class="header">

            <button class="mobile-menu" onclick="toggleSidebar()">
                ☰
            </button>

            <div>
                <h1>Zaza Bot</h1>

                <span class="status">
                    <span class="online"></span>
                    Online
                </span>
            </div>

            <button class="clear-btn" onclick="clearChat()">
                🗑️
            </button>

        </header>


        <!-- CHAT -->
        <section class="chat" id="chat">

            <!-- WELCOME -->
            <div class="welcome" id="welcome">

                <div class="bot-avatar">
                    Z
                </div>

                <h2>Halo! 👋</h2>

                <p>
                    Saya <b>Zaza Bot</b>, bot WhatsApp multifungsi.
                </p>

                <p class="welcome-small">
                    Pilih command di bawah atau langsung kirim pesan.
                </p>


                <!-- QUICK COMMAND -->
                <div class="quick-buttons">

                    <button onclick="runCommand('.menu')">
                        📋 Menu
                    </button>

                    <button onclick="runCommand('.ping')">
                        ⚡ Ping
                    </button>

                    <button onclick="runCommand('.owner')">
                        👑 Owner
                    </button>

                    <button onclick="runCommand('.runtime')">
                        ⏱️ Runtime
                    </button>

                </div>

            </div>

            <!-- MESSAGE CONTAINER -->
            <div id="messages"></div>

        </section>


        <!-- COMMANDS -->
        <section class="commands-section" id="commands">

            <div class="section-title">

                <div>
                    <h2>⚡ Commands</h2>
                    <p>Gunakan command Zaza Bot</p>
                </div>

                <span id="commandCount"></span>

            </div>


            <!-- SEARCH -->
            <div class="search-box">

                <span>🔍</span>

                <input
                    type="text"
                    id="commandSearch"
                    placeholder="Cari command..."
                    oninput="searchCommands()"
                >

            </div>


            <div id="commandList"></div>

        </section>


        <!-- ABOUT -->
        <section class="about" id="about">

            <div class="about-card">

                <div class="bot-avatar">
                    Z
                </div>

                <div>
                    <h2>Zaza Bot</h2>

                    <p>
                        Bot WhatsApp multifungsi dengan berbagai
                        fitur Group, AI, Game, Search, Tools,
                        Download dan lainnya.
                    </p>

                    <p>
                        👑 Owner:
                        <b>6289630747010</b>
                    </p>

                    <p>
                        🤖 Bot:
                        <b>6285866438941</b>
                    </p>

                </div>

            </div>

        </section>


        <!-- INPUT -->
        <footer class="input-area">

            <div class="input-box">

                <textarea
                    id="messageInput"
                    placeholder="Ketik pesan atau command..."
                    rows="1"
                    onkeydown="handleEnter(event)"
                ></textarea>

                <button
                    id="sendButton"
                    onclick="sendMessage()"
                >
                    ➤
                </button>

            </div>

            <p>
                Zaza Bot • Powered by Back4App
            </p>

        </footer>

    </main>


    <!-- JAVASCRIPT -->
    <script src="js/back4app.js"></script>
    <script src="js/chat.js"></script>
    <script src="js/app.js"></script>

</body>
</html>
```
