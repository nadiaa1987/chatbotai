const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// ── Pollinations key stored in .env ──
const PKEY = () => process.env.POLLINATIONS_KEY || "";

// ════════════════════════════════════════════════════
//  1. CHAT  —  POST /chat
//  Widget sends: { clientId, messages: [{role,content}] }
//  Function adds system prompt and proxies to Pollinations
// ════════════════════════════════════════════════════
exports.chat = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method !== "POST")
                return res.status(405).json({ error: "Method not allowed" });

            const { clientId, messages } = req.body;
            console.log(`Chat request for client: ${clientId}`);

            if (!clientId || !messages)
                return res.status(400).json({ error: "Missing clientId or messages" });

            // Fetch business config
            const docRef = db.collection("businesses").doc(clientId);
            const snap = await docRef.get();

            if (!snap.exists) {
                console.error(`Business not found in Firestore: ${clientId}`);
                return res.status(404).json({ error: "Business not found" });
            }

            const cfg = snap.data();
            console.log(`Config found for ${cfg.businessName}. System prompt length: ${cfg.systemPrompt?.length || 0}`);

            // Build full message list
            const full = [
                { role: "system", content: cfg.systemPrompt || "You are a helpful assistant." },
                ...messages,
            ];

            const pollKey = PKEY();
            console.log(`Calling Pollinations API. Key present: ${!!pollKey}`);

            // Call Pollinations
            const response = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${pollKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: cfg.model || "mistral", // Switched to mistral for better stability
                    messages: full,
                    temperature: 0.7,
                    max_tokens: 800,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Pollinations API error: ${response.status} - ${errorText}`);
                return res.status(502).json({ error: "Pollinations API error", details: errorText });
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                console.error("Pollinations returned empty content.");
                return res.status(500).json({ error: "Empty response from AI" });
            }

            console.log("Pollinations success. Content excerpt:", content.substring(0, 50));
            res.json(data);

        } catch (err) {
            console.error("Internal Server Error:", err);
            res.status(500).json({ error: "Internal server error", message: err.message });
        }
    });
});

// ════════════════════════════════════════════════════
//  2. SAVE APPOINTMENT  —  POST /saveAppointment
//  Widget sends: { clientId, name, phone, datetime, service }
// ════════════════════════════════════════════════════
exports.saveAppointment = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== "POST")
            return res.status(405).json({ error: "Method not allowed" });

        const { clientId, name, phone, datetime, service } = req.body;
        if (!clientId || !name || !phone || !datetime)
            return res.status(400).json({ error: "Missing required fields" });

        // Save to Firestore
        await db.collection("appointments").add({
            clientId,
            name,
            phone,
            datetime,
            service: service || "",
            status: "new",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Forward to Google Apps Script (if configured)
        const snap = await db.collection("businesses").doc(clientId).get();
        if (snap.exists) {
            const cfg = snap.data();
            if (cfg.googleWebhook) {
                try {
                    await fetch(cfg.googleWebhook, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name, phone, datetime, service,
                            businessName: cfg.businessName,
                        }),
                    });
                } catch (e) {
                    console.warn("Google webhook failed:", e.message);
                }
            }
        }

        res.json({ success: true });
    });
});

// ════════════════════════════════════════════════════
//  3. REGISTER BUSINESS  —  POST /registerBusiness
//  Builder sends config; returns clientId
// ════════════════════════════════════════════════════
exports.registerBusiness = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== "POST")
            return res.status(405).json({ error: "Method not allowed" });

        const {
            clientId, businessName, systemPrompt, welcomeMessage,
            color, position, googleWebhook, sector,
        } = req.body;

        if (!clientId || !businessName)
            return res.status(400).json({ error: "Missing clientId or businessName" });

        await db.collection("businesses").doc(clientId).set({
            businessName,
            systemPrompt: systemPrompt || "",
            welcomeMessage: welcomeMessage || "👋 Bonjour! Comment puis-je vous aider?",
            color: color || "#6366f1",
            position: position || "right",
            googleWebhook: googleWebhook || "",
            sector: sector || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        res.json({ success: true, clientId });
    });
});

// ════════════════════════════════════════════════════
//  4. GET CONFIG  —  GET /getConfig?clientId=xxx
//  Returns PUBLIC config only (no key, no prompt)
// ════════════════════════════════════════════════════
exports.getConfig = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const clientId = req.query.clientId;
        if (!clientId) return res.status(400).json({ error: "Missing clientId" });

        const snap = await db.collection("businesses").doc(clientId).get();
        if (!snap.exists) return res.status(404).json({ error: "Not found" });

        const { businessName, welcomeMessage, color, position } = snap.data();
        res.json({ businessName, welcomeMessage, color, position });
    });
});

// ════════════════════════════════════════════════════
//  5. GET APPOINTMENTS  —  GET /getAppointments?clientId=xxx
//  Returns appointments for a business
// ════════════════════════════════════════════════════
exports.getAppointments = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const clientId = req.query.clientId;
        if (!clientId) return res.status(400).json({ error: "Missing clientId" });

        const snap = await db.collection("appointments")
            .where("clientId", "==", clientId)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();

        const rows = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() }));
        res.json({ appointments: rows });
    });
});
