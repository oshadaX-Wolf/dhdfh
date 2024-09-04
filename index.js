const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const cron = require("node-cron");
const axios = require("axios");

const OWNER_NUMBER = "94755773910@s.whatsapp.net";

let botStatus = "on"; // Initial bot status: 'on' or 'off'

// Watermark text
const WATERMARK = "\n\nThis is coded AI-based WhatsApp bot";

// Function to fetch a random quote from Quotable API
const fetchRandomQuote = async () => {
    try {
        const response = await axios.get("https://api.quotable.io/random");
        return response.data.content + " — " + response.data.author;
    } catch (error) {
        console.error("Failed to fetch quote:", error);
        return 'Here is a quote for you: "Be yourself; everyone else is already taken." — Oscar Wilde';
    }
};

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
        }

        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startBot(); // Attempt to restart the bot
            }
        } else if (connection === "open") {
            console.log("Bot is online");
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        const sender = msg.key.remoteJid;

        if (!msg.key.fromMe && msg.message) {
            // Handle commands if the message is from the owner
            if (sender === OWNER_NUMBER) {
                const command = msg.message.conversation?.toLowerCase();

                if (command === "bot on") {
                    botStatus = "on";
                    await sock.sendMessage(sender, {
                        text: `Bot is now ON.${WATERMARK}`,
                    });
                } else if (command === "bot off") {
                    botStatus = "off";
                    await sock.sendMessage(sender, {
                        text: `Bot is now OFF.${WATERMARK}`,
                    });
                } else if (command === "status") {
                    await sock.sendMessage(sender, {
                        text: `Status: The bot is ${botStatus.toUpperCase()}.${WATERMARK}`,
                    });
                } else if (command.startsWith("schedule")) {
                    const message = command.replace("schedule", "").trim();
                    await sock.sendMessage(sender, {
                        text: `Scheduled message: "${message}".${WATERMARK}`,
                    });
                    // Implement scheduling logic here
                } else if (command === "news") {
                    await fetchAndSendNews(sender, "latest"); // Default to 'latest' news
                }
            }

            // Respond only if the bot is 'on'
            if (botStatus === "on") {
                await sock.sendMessage(sender, {
                       text: "*I am currently busy*. *I will respond to you as soon as possible*.",
                    });
            
            }
        }
    });

    // Function to fetch all contacts
    async function fetchContacts() {
        try {
            const contacts = await sock.getContacts();
            return contacts.map((contact) => contact.id);
        } catch (err) {
            console.error("Failed to fetch contacts:", err);
            return [];
        }
    }

    // Schedule task to send morning quotes daily at 6:00 AM
    cron.schedule("0 6 * * *", async () => {
        const quote = await fetchRandomQuote();
        const contacts = await fetchContacts();
        for (const contactId of contacts) {
            try {
                await sock.sendMessage(contactId, {
                    text: `Good morning! Here's your daily quote:\n\n${quote}${WATERMARK}`,
                });
                console.log(`Daily morning quote sent to ${contactId}:`, quote);
            } catch (err) {
                console.error(
                    `Failed to send daily morning quote to ${contactId}:`,
                    err,
                );
            }
        }
    });

    async function fetchAndSendNews(to, type) {
        let url = "";
        if (type === "latest") {
            url =
                "https://newsapi.org/v2/everything?q=latest&apiKey=7c050befeb3a4fe4a7f3d87cabd7dbd1";
        } else if (type === "top") {
            url =
                "https://newsapi.org/v2/top-headlines?country=lk&language=si&apiKey=7c050befeb3a4fe4a7f3d87cabd7dbd1";
        } else if (type === "world") {
            url =
                "https://newsapi.org/v2/top-headlines?category=general&language=si&apiKey=7c050befeb3a4fe4a7f3d87cabd7dbd1";
        }

        try {
            const response = await axios.get(url);
            const articles = response.data.articles.slice(0, 5);
            const newsText = articles
                .map(
                    (article, index) =>
                        `${index + 1}. ${article.title} - ${article.url}`,
                )
                .join("\n");

            await sock.sendMessage(to, {
                text: `Here are the ${type} news:\n${newsText}${WATERMARK}`,
            });
        } catch (err) {
            console.error("Failed to fetch news:", err);
            await sock.sendMessage(to, {
                text: `Failed to fetch news. Please try again later.${WATERMARK}`,
            });
        }
    }
};

startBot();
