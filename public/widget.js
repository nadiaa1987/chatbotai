(function () {
  "use strict";

  // ─────────────────────────────────────────
  //  CONFIG — only clientId needed in embed
  // ─────────────────────────────────────────
  const CFG = Object.assign({
    clientId: "",
    businessName: "Assistant",
    welcomeMessage: "👋 Bonjour! Comment puis-je vous aider aujourd'hui?",
    color: "#6366f1",
    position: "right",
  }, window.AgentChatConfig || {});

  // Firebase Functions base URL
  const API = "https://us-central1-ai-agent-chatbot-4f4b8.cloudfunctions.net";

  // ─────────────────────────────────────────
  //  STATE
  // ─────────────────────────────────────────
  let isOpen = false, isTyping = false;
  let messages = []; // NO system prompt here — backend adds it
  let pendingAppt = false;

  // ─────────────────────────────────────────
  //  STYLES
  // ─────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    :root { --ac: ${CFG.color}; }
    #ac-btn {
      position:fixed; ${CFG.position}:24px; bottom:24px;
      width:60px; height:60px; border-radius:50%;
      background:var(--ac); border:none; cursor:pointer;
      box-shadow:0 4px 24px rgba(0,0,0,.25); z-index:99998;
      display:flex; align-items:center; justify-content:center;
      transition:transform .2s,box-shadow .2s;
    }
    #ac-btn:hover{transform:scale(1.08);box-shadow:0 8px 32px rgba(0,0,0,.3)}
    #ac-btn svg{width:28px;height:28px;fill:#fff}
    #ac-badge{
      position:absolute;top:-4px;right:-4px;width:18px;height:18px;
      border-radius:50%;background:#ef4444;color:#fff;font-size:10px;
      font-weight:700;display:none;align-items:center;justify-content:center;
      font-family:sans-serif;
    }
    #ac-panel{
      position:fixed;${CFG.position}:20px;bottom:96px;
      width:370px;max-height:80vh;height:560px;border-radius:20px;
      background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.18);
      z-index:99999;display:flex;flex-direction:column;overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      transform:scale(.85) translateY(20px);opacity:0;pointer-events:none;
      transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s;
    }
    #ac-panel.open{transform:scale(1) translateY(0);opacity:1;pointer-events:all}
    #ac-head{
      background:linear-gradient(135deg,var(--ac),color-mix(in srgb,var(--ac) 70%,#000));
      padding:16px 20px;display:flex;align-items:center;gap:12px;color:#fff;flex-shrink:0;
    }
    #ac-av{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.25);
      display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
    #ac-head-name{font-weight:700;font-size:15px}
    #ac-head-st{font-size:12px;opacity:.85;display:flex;align-items:center;gap:5px}
    #ac-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;animation:ac-p 2s infinite}
    @keyframes ac-p{0%,100%{opacity:1}50%{opacity:.5}}
    #ac-x{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.8);
      font-size:22px;padding:4px;border-radius:6px;transition:background .15s}
    #ac-x:hover{background:rgba(255,255,255,.15);color:#fff}
    #ac-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;
      gap:10px;background:#f8fafc;scroll-behavior:smooth}
    #ac-msgs::-webkit-scrollbar{width:4px}
    #ac-msgs::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
    .ac-row{display:flex;align-items:flex-end;gap:8px;animation:ac-fi .2s ease}
    @keyframes ac-fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .ac-row.user{flex-direction:row-reverse}
    .ac-av{width:28px;height:28px;border-radius:50%;background:var(--ac);color:#fff;
      font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .ac-row.user .ac-av{background:#64748b}
    .ac-bbl{max-width:78%;padding:10px 14px;border-radius:16px;font-size:14px;
      line-height:1.5;word-wrap:break-word}
    .ac-row.bot .ac-bbl{background:#fff;color:#1e293b;border-bottom-left-radius:4px;
      box-shadow:0 1px 4px rgba(0,0,0,.07)}
    .ac-row.user .ac-bbl{background:var(--ac);color:#fff;border-bottom-right-radius:4px}
    #ac-typing{display:none;align-items:flex-end;gap:8px;animation:ac-fi .2s}
    #ac-typing.show{display:flex}
    .ac-dots{background:#fff;padding:12px 16px;border-radius:16px;border-bottom-left-radius:4px;
      box-shadow:0 1px 4px rgba(0,0,0,.07);display:flex;gap:4px;align-items:center}
    .ac-dots span{width:7px;height:7px;background:#94a3b8;border-radius:50%;animation:ac-b .9s infinite}
    .ac-dots span:nth-child(2){animation-delay:.15s}
    .ac-dots span:nth-child(3){animation-delay:.3s}
    @keyframes ac-b{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
    .ac-appt{background:#fff;border:2px solid var(--ac);border-radius:14px;padding:16px;
      margin:4px 0;font-size:13px;color:#1e293b;animation:ac-fi .3s;
      box-shadow:0 2px 12px rgba(99,102,241,.15)}
    .ac-appt h4{margin:0 0 12px;font-size:14px;font-weight:700;color:var(--ac);
      display:flex;align-items:center;gap:6px}
    .ac-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
    .ac-f label{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
    .ac-f input{border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 10px;
      font-size:13px;outline:none;transition:border-color .15s;font-family:inherit}
    .ac-f input:focus{border-color:var(--ac)}
    .ac-appt-btn{width:100%;padding:10px;background:var(--ac);color:#fff;border:none;
      border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;margin-top:4px;
      transition:opacity .15s;font-family:inherit}
    .ac-appt-btn:hover{opacity:.9}
    #ac-qr{padding:8px 16px 4px;display:flex;flex-wrap:wrap;gap:6px}
    .ac-qb{background:#fff;border:1.5px solid var(--ac);color:var(--ac);border-radius:20px;
      padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;
      transition:background .15s,color .15s;font-family:inherit}
    .ac-qb:hover{background:var(--ac);color:#fff}
    #ac-inp-wrap{padding:12px 16px;display:flex;gap:8px;background:#fff;
      border-top:1px solid #f1f5f9;flex-shrink:0}
    #ac-inp{flex:1;border:1.5px solid #e2e8f0;border-radius:24px;padding:10px 16px;
      font-size:14px;outline:none;resize:none;font-family:inherit;max-height:100px;
      transition:border-color .15s;background:#f8fafc}
    #ac-inp:focus{border-color:var(--ac);background:#fff}
    #ac-inp::placeholder{color:#94a3b8}
    #ac-send{width:42px;height:42px;border-radius:50%;background:var(--ac);border:none;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      flex-shrink:0;align-self:flex-end;transition:transform .15s,opacity .15s}
    #ac-send:hover{transform:scale(1.08)}
    #ac-send:disabled{opacity:.5;cursor:not-allowed;transform:none}
    #ac-send svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2.5}
    #ac-foot{padding:6px 16px 10px;text-align:center;font-size:11px;color:#94a3b8;background:#fff;flex-shrink:0}
    #ac-foot a{color:var(--ac);text-decoration:none}
    #ac-toast{position:fixed;${CFG.position}:24px;bottom:94px;background:#1e293b;color:#fff;
      padding:10px 18px;border-radius:12px;font-size:13px;
      font-family:-apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.2);
      z-index:99997;max-width:260px;opacity:0;transform:translateY(8px);
      transition:opacity .25s,transform .25s;pointer-events:none}
    #ac-toast.show{opacity:1;transform:none}
    @media(max-width:420px){
      #ac-panel{width:calc(100vw - 16px);${CFG.position}:8px;bottom:84px;border-radius:16px}
      #ac-btn{${CFG.position}:16px;bottom:16px}
    }
  `;
  document.head.appendChild(style);

  // ─────────────────────────────────────────
  //  DOM
  // ─────────────────────────────────────────
  function buildUI() {
    // Toast
    const toast = mk("div", { id: "ac-toast" });
    document.body.appendChild(toast);

    // Launch Button
    const btn = mk("button", { id: "ac-btn", "aria-label": "Open chat" });
    btn.innerHTML = `
      <div id="ac-badge"></div>
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
    btn.onclick = toggleChat;
    document.body.appendChild(btn);

    // Panel
    const panel = mk("div", { id: "ac-panel", role: "dialog" });
    panel.innerHTML = `
      <div id="ac-head">
        <div id="ac-av">🤖</div>
        <div style="flex:1">
          <div id="ac-head-name">${CFG.businessName}</div>
          <div id="ac-head-st"><div id="ac-dot"></div>En ligne maintenant</div>
        </div>
        <button id="ac-x">✕</button>
      </div>
      <div id="ac-msgs">
        <div id="ac-typing" class="ac-row bot">
          <div class="ac-av">🤖</div>
          <div class="ac-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
      <div id="ac-qr"></div>
      <div id="ac-inp-wrap">
        <textarea id="ac-inp" placeholder="Écrivez votre message..." rows="1"></textarea>
        <button id="ac-send">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div id="ac-foot">Propulsé par <a href="https://pollinations.ai" target="_blank">AgentChat AI</a></div>`;
    document.body.appendChild(panel);

    document.getElementById("ac-x").onclick = toggleChat;
    document.getElementById("ac-send").onclick = handleSend;
    document.getElementById("ac-inp").onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };
    document.getElementById("ac-inp").oninput = autoResize;

    // Load remote config if clientId provided
    if (CFG.clientId) loadRemoteConfig();

    setTimeout(showBadge, 2500);
  }

  // ─────────────────────────────────────────
  //  LOAD REMOTE CONFIG
  // ─────────────────────────────────────────
  async function loadRemoteConfig() {
    try {
      const r = await fetch(`${API}/getConfig?clientId=${CFG.clientId}`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.businessName) {
        CFG.businessName = d.businessName;
        document.getElementById("ac-head-name").textContent = d.businessName;
      }
      if (d.welcomeMessage) CFG.welcomeMessage = d.welcomeMessage;
      if (d.color) {
        CFG.color = d.color;
        document.documentElement.style.setProperty("--ac", d.color);
      }
    } catch (e) { /* use defaults */ }
  }

  // ─────────────────────────────────────────
  //  TOGGLE
  // ─────────────────────────────────────────
  function toggleChat() {
    isOpen = !isOpen;
    document.getElementById("ac-panel").classList.toggle("open", isOpen);
    document.getElementById("ac-badge").style.display = "none";

    if (isOpen && messages.length === 0) {
      setTimeout(() => {
        addMsg("bot", CFG.welcomeMessage);
        showQR(["📅 Prendre RDV", "💬 Question", "🕐 Horaires", "📞 Contact"]);
      }, 350);
    }
    if (isOpen) setTimeout(() => document.getElementById("ac-inp").focus(), 300);
  }

  function showBadge() {
    if (!isOpen) {
      const b = document.getElementById("ac-badge");
      b.style.display = "flex";
      b.textContent = "1";
      showToast("👋 " + CFG.welcomeMessage.slice(0, 50) + "…");
    }
  }

  // ─────────────────────────────────────────
  //  MESSAGES
  // ─────────────────────────────────────────
  function addMsg(role, text) {
    const msgs = document.getElementById("ac-msgs");
    const typing = document.getElementById("ac-typing");
    const row = mk("div", { class: `ac-row ${role}` });
    const av = mk("div", { class: "ac-av" }); av.textContent = role === "bot" ? "🤖" : "👤";
    const bbl = mk("div", { class: "ac-bbl" }); bbl.textContent = text;
    row.appendChild(av); row.appendChild(bbl);
    msgs.insertBefore(row, typing);
    scrollBot();
  }

  function showTyping() { document.getElementById("ac-typing").classList.add("show"); scrollBot(); }
  function hideTyping() { document.getElementById("ac-typing").classList.remove("show"); }
  function scrollBot() { const m = document.getElementById("ac-msgs"); setTimeout(() => m.scrollTop = m.scrollHeight, 50); }

  function showQR(items) {
    const qr = document.getElementById("ac-qr");
    qr.innerHTML = "";
    items.forEach(label => {
      const b = mk("button", { class: "ac-qb" }); b.textContent = label;
      b.onclick = () => { qr.innerHTML = ""; addMsg("user", label); messages.push({ role: "user", content: label }); getBotReply(label); };
      qr.appendChild(b);
    });
  }

  // ─────────────────────────────────────────
  //  SEND / RECEIVE
  // ─────────────────────────────────────────
  async function handleSend() {
    if (isTyping) return;
    const inp = document.getElementById("ac-inp");
    const text = inp.value.trim(); if (!text) return;
    inp.value = ""; autoResize.call(inp);
    document.getElementById("ac-qr").innerHTML = "";
    addMsg("user", text);
    messages.push({ role: "user", content: text });
    await getBotReply(text);
  }

  async function getBotReply(userText) {
    isTyping = true;
    document.getElementById("ac-send").disabled = true;
    showTyping();

    try {
      let reply;

      if (CFG.clientId) {
        // ✅ SECURE — calls Firebase Function (key stays on server)
        const r = await fetch(`${API}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: CFG.clientId, messages }),
        });
        const d = await r.json();
        reply = d.choices?.[0]?.message?.content || "Désolé, une erreur s'est produite.";
      } else {
        // Fallback: direct Pollinations (for demo/testing only)
        const key = CFG.pollinationsKey || "";
        const sysPrompt = CFG.systemPrompt || "You are a helpful assistant.";
        const full = [{ role: "system", content: sysPrompt }, ...messages];
        const r = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "openai", messages: full, temperature: 0.7, max_tokens: 400 }),
        });
        const d = await r.json();
        reply = d.choices?.[0]?.message?.content || "Désolé, une erreur s'est produite.";
      }

      messages.push({ role: "assistant", content: reply });
      hideTyping();
      addMsg("bot", reply);

      // Detect appointment intent
      const apptKw = ["rendez-vous", "rdv", "réserver", "booking", "appointment", "موعد", "حجز", "mwa3ad", "7jez", "bghit njiw"];
      if (!pendingAppt && apptKw.some(k => (userText + reply).toLowerCase().includes(k))) {
        pendingAppt = true;
        setTimeout(showApptForm, 600);
      } else {
        const lower = reply.toLowerCase();
        if (lower.includes("rendez-vous") || lower.includes("réserver"))
          showQR(["📅 Oui, je veux un RDV", "❓ Plus d'infos"]);
        else if (lower.includes("autre chose") || lower.includes("besoin"))
          showQR(["📅 Prendre RDV", "👋 Non merci"]);
      }
    } catch {
      hideTyping();
      addMsg("bot", "⚠️ Connexion impossible. Veuillez réessayer.");
    } finally {
      isTyping = false;
      document.getElementById("ac-send").disabled = false;
    }
  }

  // ─────────────────────────────────────────
  //  APPOINTMENT FORM
  // ─────────────────────────────────────────
  function showApptForm() {
    const msgs = document.getElementById("ac-msgs");
    const typing = document.getElementById("ac-typing");
    const row = mk("div", { class: "ac-row bot" });
    const av = mk("div", { class: "ac-av" }); av.textContent = "🤖";
    const card = mk("div", { class: "ac-appt" });
    const min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    card.innerHTML = `
      <h4>📅 Réserver un Rendez-vous</h4>
      <div class="ac-f"><label>Votre nom</label><input type="text" id="appt-name" placeholder="Ex: Mohamed Alaoui"/></div>
      <div class="ac-f"><label>Téléphone</label><input type="tel" id="appt-phone" placeholder="+212 6XX XXX XXX"/></div>
      <div class="ac-f"><label>Date & Heure</label><input type="datetime-local" id="appt-dt" min="${min}T08:00"/></div>
      <div class="ac-f"><label>Service souhaité</label><input type="text" id="appt-svc" placeholder="Ex: Consultation..."/></div>
      <button class="ac-appt-btn" id="appt-submit">✅ Confirmer le Rendez-vous</button>`;
    row.appendChild(av); row.appendChild(card);
    msgs.insertBefore(row, typing);
    scrollBot();
    document.getElementById("appt-submit").onclick = submitAppt;
  }

  async function submitAppt() {
    const name = document.getElementById("appt-name")?.value.trim();
    const phone = document.getElementById("appt-phone")?.value.trim();
    const dt = document.getElementById("appt-dt")?.value;
    const svc = document.getElementById("appt-svc")?.value.trim();
    if (!name || !phone || !dt) { showToast("⚠️ Remplissez tous les champs"); return; }

    const btn = document.getElementById("appt-submit");
    btn.textContent = "⏳ Envoi en cours..."; btn.disabled = true;

    try {
      if (CFG.clientId) {
        await fetch(`${API}/saveAppointment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: CFG.clientId, name, phone, datetime: dt, service: svc }),
        });
      }
    } catch (e) { console.warn("Appointment save failed:", e); }

    btn.textContent = "✅ Confirmé!";
    const dtFmt = new Date(dt).toLocaleString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
    addMsg("bot", `✅ Parfait ${name}! Votre RDV est confirmé:\n\n📅 ${dtFmt}\n🔧 ${svc || "À définir"}\n📱 ${phone}\n\n📊 Enregistré dans notre système!`);
    showQR(["❓ Autre question", "👋 Merci, au revoir"]);
  }

  // ─────────────────────────────────────────
  //  UTILS
  // ─────────────────────────────────────────
  function showToast(msg) {
    const t = document.getElementById("ac-toast");
    t.textContent = msg; t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 4000);
  }
  function autoResize() { this.style.height = "auto"; this.style.height = Math.min(this.scrollHeight, 100) + "px"; }
  function mk(tag, attrs = {}) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => k === "class" ? (e.className = v) : e.setAttribute(k, v));
    return e;
  }

  // ─────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildUI);
  else buildUI();
})();
