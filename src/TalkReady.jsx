import React, { useState, useRef, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// TalkReady — голосовой тренажёр английского для нетворкинга
// Собран по ТЗ v.02 (финальная). Партнёр в диалоге = Claude API.
// Палитра: тропический сенот. Mobile-first. Рост, а не оценка.
// ─────────────────────────────────────────────────────────────

const C = {
  teal:   "#237569", // бренд, спокойствие воды
  mint:   "#85C5B5", // фон/поверхности, «воздух»
  yellow: "#E8DD68", // акцент/успех — только для главного действия и «получилось»
  sage:   "#759B79", // вторичные/нейтральные состояния
  olive:  "#385427", // текст, глубина
  brown:  "#4C2C0A", // границы, тёмный текст
  bg:     "#EAF4EF", // мягкий «воздух» фона
  surface:"#FFFFFF",
  mintSoft:"#CFE8DF",
};

const SCENARIOS = [
  { id:"techconf", label:"IT-конференция", emoji:"💡",
    persona:"Maya Chen", role:"a conference speaker who just finished a talk on AI ethics",
    sceneRu:"Кофе-брейк на IT-конференции. Майя только что закончила доклад про этику ИИ и стоит рядом с кофе.",
    theme:"tech conference, AI ethics, networking" },
  { id:"bizmixer", label:"Бизнес-миксер", emoji:"🌍",
    persona:"Lucas Meyer", role:"a product manager from Berlin, here on a business trip",
    sceneRu:"Вечерний нетворкинг-миксер в командировке. Рядом стоит Лукас, продакт-менеджер из Берлина.",
    theme:"international business trip, product management, networking" },
  { id:"research", label:"Научная секция", emoji:"🔬",
    persona:"Dr. Amara Okafor", role:"a researcher who just presented a poster on climate data",
    sceneRu:"Постерная секция научной конференции. Доктор Амара только что представила постер про климатические данные.",
    theme:"academic conference, climate research, networking" },
  { id:"startup", label:"Стартап-питч", emoji:"🚀",
    persona:"Diego Ramos", role:"a founder of a small fintech startup, mingling after pitches",
    sceneRu:"Афтепати после питч-сессии. Диего, основатель финтех-стартапа, общается у стойки.",
    theme:"startup pitch event, fintech, networking" },
];

const CLAR_PHRASES = ["Sorry, did you mean…?", "Could you please clarify?", "Sorry, I didn't catch that — could you say it again?"];

// ── Claude API helpers ───────────────────────────────────────
// Calls our own /api/chat proxy — the Anthropic key lives on the server, never in the browser.
async function callClaude(system, messages, maxTokens = 800) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error || ""; } catch (e) {}
    throw new Error(`proxy ${res.status} ${detail}`);
  }
  const data = await res.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}
function parseJSON(text) {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  return JSON.parse(clean.slice(s, e + 1));
}

function partnerSystem(scn, goals, hardCount, turns) {
  return `You are role-playing ONE friendly person at an international networking event. This is a safe rehearsal for a B1–B2 English learner, not an exam.

PERSONA: ${scn.persona}, ${scn.role}. Scene: ${scn.sceneRu}

STRICT RULES (never break):
- Speak ONLY in English. If the learner writes in Russian, stay warm, keep replying in simple English, and gently invite them back to English. Never switch to Russian yourself.
- React to COMMUNICATION — whether you understood them — NOT to grammar. Never correct grammar or point out mistakes.
- Never criticize. Stay a warm, friendly conversation partner.
- Never speak the learner's lines for them, never prompt them, never suggest what to say.
- Stay strictly inside this fictional scene. Do NOT invent facts about real people, real companies, or real events.
- Keep replies short and natural — 1–2 spoken sentences. Usually end with a light question to keep it going.

The learner has 4 mini-goals: greeting, small talk (about your talk/work), a counter-question to you, and a polite closing. Create natural openings for each.
Occasionally throw ONE slightly faster / denser reply so the learner gets a REAL chance to ask for clarification — but do this at most twice in the whole conversation, and only when it fits. So far you have done this ${hardCount} time(s).
When the learner clearly moves to close the conversation, respond warmly and wrap up.

Goals already achieved so far: ${JSON.stringify(goals)}. Turns so far: ${turns}.

Assess the learner's LAST turn and reply. Output ONLY this JSON, nothing else:
{"reply":"<your in-character English reply>","goals":{"greeting":bool,"smalltalk":bool,"counterQuestion":bool,"closing":bool},"threwHardReply":bool,"userClarified":bool,"understood":bool,"conversationComplete":bool}
- goals: cumulative — true if the learner has achieved it at any point (keep already-true ones true).
- threwHardReply: true only if YOUR reply this turn deliberately introduces a harder/faster line (a genuine clarification opportunity).
- userClarified: true only if the learner's THIS turn appropriately used a clarification strategy in response to real difficulty — not a memorized phrase dropped out of context.
- understood: did you understand the learner without needing a repeat.`;
}

// ── small UI atoms ───────────────────────────────────────────
function Bubble({ role, children }) {
  const user = role === "user";
  return (
    <div style={{ display:"flex", justifyContent: user ? "flex-end" : "flex-start", marginBottom:10 }}>
      <div style={{
        maxWidth:"82%", padding:"10px 14px", borderRadius:16,
        borderBottomRightRadius: user ? 4 : 16, borderBottomLeftRadius: user ? 16 : 4,
        background: user ? C.teal : C.surface,
        color: user ? "#fff" : C.olive,
        border: user ? "none" : `1px solid ${C.mintSoft}`,
        fontSize:15, lineHeight:1.45, whiteSpace:"pre-wrap",
      }}>{children}</div>
    </div>
  );
}

function GoalChip({ done, label }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:6, padding:"5px 9px", borderRadius:999,
      background: done ? C.yellow : "#fff",
      border: `1.5px solid ${done ? C.yellow : C.mintSoft}`,
      color: done ? C.brown : C.sage, fontSize:12, fontWeight:600, whiteSpace:"nowrap",
      transition:"all .25s",
    }}>
      <span style={{ fontSize:12 }}>{done ? "✓" : "○"}</span>{label}
    </div>
  );
}

function Scale({ label, value, prev }) {
  const na = value == null;
  const pct = na ? 0 : Math.round(value);
  let delta = null;
  if (!na && prev != null) delta = pct - Math.round(prev);
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
        <span style={{ fontSize:14, fontWeight:700, color:C.olive }}>{label}</span>
        <span style={{ fontSize:13, color:C.sage }}>
          {na ? "в этот раз не было повода" : `${pct}%`}
          {delta != null && delta !== 0 && (
            <span style={{ marginLeft:8, fontWeight:700, color: delta > 0 ? C.teal : C.sage }}>
              {delta > 0 ? `↑ +${delta} к прошлому` : `растём: ${Math.abs(delta)} до прошлого`}
            </span>
          )}
        </span>
      </div>
      <div style={{ height:12, borderRadius:999, background:C.mintSoft, overflow:"hidden" }}>
        <div style={{
          width:`${na ? 0 : pct}%`, height:"100%", borderRadius:999,
          background:`linear-gradient(90deg, ${C.teal}, ${C.yellow})`, transition:"width .6s ease",
        }} />
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────
export default function TalkReady() {
  const [screen, setScreen] = useState("onboarding"); // onboarding | convo | summary
  const [scenario, setScenario] = useState(null);
  const [consent, setConsent] = useState(false);
  const [fbLang, setFbLang] = useState("ru");

  const [messages, setMessages] = useState([]);
  const [goals, setGoals] = useState({ greeting:false, smalltalk:false, counterQuestion:false, closing:false });
  const [status, setStatus] = useState("idle"); // idle | listening | thinking | speaking
  const [mode, setMode] = useState("voice"); // voice | text
  const [draft, setDraft] = useState("");
  const [muted, setMuted] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [supportPhrase, setSupportPhrase] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [notice, setNotice] = useState("");

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [scales, setScales] = useState(null);
  const [lastScales, setLastScales] = useState(null);

  // metrics accumulators
  const metrics = useRef({ latencies:[], words:[], clarOpp:0, clarOk:0, understood:0, turns:0, hardCount:0 });
  const partnerDoneAt = useRef(null);
  const stuckTimer = useRef(null);
  const recog = useRef(null);
  const scrollRef = useRef(null);

  // load previous session for comparison (localStorage — this is a standalone app now)
  useEffect(() => {
    try { const r = localStorage.getItem("talkready:last"); if (r) setLastScales(JSON.parse(r)); }
    catch (e) {/* first run */}
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceSupported(false); setMode("text"); }
  }, []);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, status]);

  // ── stuck detection: >10s silence after it's the learner's turn ──
  const armStuck = useCallback(() => {
    clearTimeout(stuckTimer.current);
    setStuck(false);
    stuckTimer.current = setTimeout(() => {
      setSupportPhrase(!goals.greeting ? "Hi! I really enjoyed the event. I'm — nice to meet you." : CLAR_PHRASES[metrics.current.turns % CLAR_PHRASES.length]);
      setStuck(true);
    }, 10000);
  }, [goals.greeting]);
  const disarmStuck = useCallback(() => { clearTimeout(stuckTimer.current); setStuck(false); }, []);

  // ── text-to-speech (partner speaks) ──
  const speak = useCallback((text) => {
    if (muted || !window.speechSynthesis) { partnerDoneAt.current = Date.now(); setStatus("idle"); armStuck(); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = 1;
      const vs = window.speechSynthesis.getVoices();
      const en = vs.find(v => /en-US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang));
      if (en) u.voice = en;
      setStatus("speaking");
      u.onend = () => { partnerDoneAt.current = Date.now(); setStatus("idle"); armStuck(); };
      u.onerror = () => { partnerDoneAt.current = Date.now(); setStatus("idle"); armStuck(); };
      window.speechSynthesis.speak(u);
    } catch (e) { partnerDoneAt.current = Date.now(); setStatus("idle"); armStuck(); }
  }, [muted, armStuck]);

  // ── send a learner turn ──
  const sendTurn = useCallback(async (text) => {
    const clean = text.trim();
    if (!clean) return;
    disarmStuck();
    const latency = partnerDoneAt.current ? (Date.now() - partnerDoneAt.current) / 1000 : 0;
    const words = clean.split(/\s+/).filter(Boolean).length;
    metrics.current.latencies.push(latency);
    metrics.current.words.push(words);
    metrics.current.turns += 1;

    const history = [...messages, { role:"user", text:clean }];
    setMessages(history);
    setDraft("");
    setStatus("thinking");

    const apiMsgs = history.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    try {
      const raw = await callClaude(
        partnerSystem(scenario, goals, metrics.current.hardCount, metrics.current.turns),
        apiMsgs
      );
      const j = parseJSON(raw);
      setGoals(g => ({
        greeting: g.greeting || !!j.goals?.greeting,
        smalltalk: g.smalltalk || !!j.goals?.smalltalk,
        counterQuestion: g.counterQuestion || !!j.goals?.counterQuestion,
        closing: g.closing || !!j.goals?.closing,
      }));
      if (j.understood) metrics.current.understood += 1;
      // anti-gaming: clarification only counts against a real opportunity
      if (metrics.current.lastHard && j.userClarified) metrics.current.clarOk += 1;
      if (j.threwHardReply) { metrics.current.hardCount += 1; metrics.current.clarOpp += 1; metrics.current.lastHard = true; }
      else metrics.current.lastHard = false;

      setMessages(m => [...m, { role:"partner", text:j.reply }]);
      speak(j.reply);
      if (j.conversationComplete || goals.closing) setNotice("Разговор подходит к концу — можно завершать и смотреть «Мои успехи».");
    } catch (e) {
      setMessages(m => [...m, { role:"partner", text:"Sorry — I lost the thread there. Could you say that again?" }]);
      setStatus("idle"); armStuck();
    }
  }, [messages, goals, scenario, speak, disarmStuck, armStuck]);

  // ── speech recognition (learner speaks) ──
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceSupported(false); setMode("text"); return; }
    disarmStuck();
    try {
      const r = new SR();
      r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 1;
      recog.current = r;
      setStatus("listening");
      r.onresult = (ev) => { const t = ev.results[0][0].transcript; setStatus("idle"); sendTurn(t); };
      r.onerror = (ev) => {
        setStatus("idle");
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          setVoiceSupported(false); setMode("text");
          setNotice("Микрофон недоступен в этом окне — включён режим «печатать вместо говорить». В реальном приложении это тот же фолбэк для метро/опенспейса.");
        } else armStuck();
      };
      r.onend = () => { if (status === "listening") setStatus("idle"); };
      r.start();
    } catch (e) { setVoiceSupported(false); setMode("text"); }
  }, [sendTurn, status, disarmStuck, armStuck]);

  const stopListening = useCallback(() => { try { recog.current?.stop(); } catch (e) {} setStatus("idle"); }, []);

  // ── start session ──
  const start = (scn) => {
    setScenario(scn);
    metrics.current = { latencies:[], words:[], clarOpp:0, clarOk:0, understood:0, turns:0, hardCount:0, lastHard:false };
    setGoals({ greeting:false, smalltalk:false, counterQuestion:false, closing:false });
    setMessages([]); setNotice(""); setSummary(null); setScales(null);
    partnerDoneAt.current = Date.now();
    setScreen("convo");
    setTimeout(armStuck, 400);
  };

  // ── compute scales & generate summary ──
  const finish = async () => {
    clearTimeout(stuckTimer.current);
    try { window.speechSynthesis?.cancel(); } catch (e) {}
    const m = metrics.current;
    const goalsDone = Object.values(goals).filter(Boolean).length;
    const okLat = m.latencies.filter(l => l <= 4).length;
    const okElab = m.words.filter(w => w >= 7).length;
    const sc = {
      taskCompletion: (goalsDone / 4) * 100,
      latency: m.latencies.length ? (okLat / m.latencies.length) * 100 : 100,
      elaboration: m.words.length ? (okElab / m.words.length) * 100 : 0,
      clarification: m.clarOpp > 0 ? (m.clarOk / m.clarOpp) * 100 : null,
      date: new Date().toLocaleDateString("ru-RU"),
    };
    setScales(sc);
    setScreen("summary");
    setSummaryLoading(true);
    try {
      const transcript = messages.map(x => `${x.role === "user" ? "Learner" : "Partner"}: ${x.text}`).join("\n");
      const sys = `You are a warm, supportive English-speaking coach — an equal, understanding colleague, never top-down. Language for prose: ${fbLang === "ru" ? "Russian" : "English"}. Target practice phrases: ALWAYS English. No bureaucratese, no impersonal grading. Do NOT invent facts, films, or titles.`;
      const usr = `Networking scene theme: ${scenario.theme}. Goals achieved: ${goalsDone}/4. Avg reply length: ${(m.words.reduce((a,b)=>a+b,0)/(m.words.length||1)).toFixed(1)} words. Clarification opportunities: ${m.clarOpp}, taken: ${m.clarOk}.

Transcript:
${transcript}

Return ONLY JSON:
{"strength":"one concrete strength, warm, in ${fbLang==="ru"?"Russian":"English"}","growthZone":"exactly ONE growth area, gentle","microPractice":"one tiny next-time practice; if it involves a phrase, give it in English","entertainment":{"title":"a REAL, well-known English-language film, podcast, or TED talk related to the theme, subtitles available","type":"film|podcast|TED","why":"one warm line why, in ${fbLang==="ru"?"Russian":"English"}"}}`;
      const raw = await callClaude(sys, [{ role:"user", content: usr }], 700);
      setSummary(parseJSON(raw));
    } catch (e) {
      setSummary({ strength: fbLang==="ru"?"Ты довёл разговор до конца и держал его по-английски — это уже победа.":"You carried the whole conversation in English — that's the win.",
        growthZone: fbLang==="ru"?"В паре мест можно было переспросить, а не кивать.":"A couple of spots were worth a quick clarification instead of a nod.",
        microPractice: `Next time try: "${CLAR_PHRASES[0]}"`,
        entertainment: null });
    } finally {
      setSummaryLoading(false);
      try { localStorage.setItem("talkready:last", JSON.stringify(sc)); } catch (e) {}
    }
  };

  // ── shared shell (plain function, not a component → no remount, keeps input focus) ──
  const shell = (children) => (
    <div style={{ minHeight:"100%", background:C.bg, display:"flex", justifyContent:"center", padding:"0", fontFamily:"'Nunito', ui-rounded, 'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @keyframes breathe { 0%,100%{ transform:scale(1); box-shadow:0 0 0 0 rgba(35,117,105,.35);} 50%{ transform:scale(1.05); box-shadow:0 0 0 18px rgba(35,117,105,0);} }
        @keyframes ripple { 0%{ transform:scale(1); opacity:.5;} 100%{ transform:scale(2.1); opacity:0;} }
        @keyframes dots { 0%,80%,100%{ opacity:.2;} 40%{ opacity:1;} }
        * { box-sizing:border-box; }
        @media print {
          body * { visibility:hidden; }
          #tr-report, #tr-report * { visibility:visible; }
          #tr-report { position:absolute; left:0; top:0; width:100%; }
          .no-print { display:none !important; }
        }
      `}</style>
      <div style={{ width:"100%", maxWidth:440, minHeight:"100vh", background:C.bg, position:"relative", display:"flex", flexDirection:"column" }}>
        {children}
      </div>
    </div>
  );

  // ════════════════════════════ ONBOARDING ════════════════════════════
  if (screen === "onboarding") {
    return shell(
      <>
        <div style={{ padding:"32px 22px 40px", display:"flex", flexDirection:"column", gap:20 }}>
          <div style={{ textAlign:"center", marginTop:8 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:10, padding:"7px 16px", borderRadius:999, background:C.mintSoft, color:C.teal, fontWeight:800, letterSpacing:.5, fontSize:13 }}>
              <span style={{ width:9, height:9, borderRadius:9, background:C.yellow, display:"inline-block" }} />TALKREADY
            </div>
            <h1 style={{ margin:"18px 0 8px", fontSize:30, lineHeight:1.15, color:C.olive, fontWeight:900 }}>
              Репетиция разговора,<br/>а не экзамен
            </h1>
            <p style={{ margin:0, color:C.sage, fontSize:15, lineHeight:1.5 }}>
              Потренируйся говорить по-английски вслух, чтобы на живом нетворкинге разговаривать, а не думать о правилах.
            </p>
          </div>

          <div style={{ background:C.surface, borderRadius:20, padding:"18px 18px 6px", border:`1px solid ${C.mintSoft}` }}>
            <div style={{ fontSize:13, fontWeight:800, color:C.teal, marginBottom:12, textTransform:"uppercase", letterSpacing:.5 }}>Выбери, где ты сегодня</div>
            {SCENARIOS.map(s => (
              <button key={s.id} onClick={() => setScenario(s)} style={{
                width:"100%", textAlign:"left", display:"flex", alignItems:"center", gap:12, padding:"12px 14px", marginBottom:12,
                borderRadius:14, cursor:"pointer", transition:"all .2s",
                border:`2px solid ${scenario?.id===s.id ? C.teal : C.mintSoft}`,
                background: scenario?.id===s.id ? C.mintSoft : "#fff",
              }}>
                <span style={{ fontSize:24 }}>{s.emoji}</span>
                <span>
                  <span style={{ display:"block", fontWeight:800, color:C.olive, fontSize:15 }}>{s.label}</span>
                  <span style={{ display:"block", color:C.sage, fontSize:12.5, lineHeight:1.35 }}>{s.sceneRu}</span>
                </span>
              </button>
            ))}
            <button onClick={() => setScenario(SCENARIOS[Math.floor(Math.random()*SCENARIOS.length)])}
              style={{ width:"100%", padding:"10px", marginBottom:14, borderRadius:12, border:`1.5px dashed ${C.sage}`, background:"transparent", color:C.sage, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              🎲 Случайный собеседник
            </button>
          </div>

          <label style={{ display:"flex", gap:11, alignItems:"flex-start", padding:"14px 16px", borderRadius:14, background:C.surface, border:`1px solid ${C.mintSoft}`, cursor:"pointer" }}>
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop:3, width:18, height:18, accentColor:C.teal }} />
            <span style={{ fontSize:12.5, color:C.olive, lineHeight:1.5 }}>
              Согласен на запись и транскрипцию речи для разбора. Это чувствительные данные: хранятся ограниченный срок, удалить можно в любой момент.
              <span style={{ color:C.sage }}> (срок и формулировка — [решение продукта/юристов])</span>
            </span>
          </label>

          <button disabled={!scenario || !consent} onClick={() => start(scenario)} style={{
            padding:"16px", borderRadius:16, border:"none", fontSize:17, fontWeight:900, cursor: (!scenario||!consent)?"not-allowed":"pointer",
            background: (!scenario||!consent) ? C.mintSoft : C.yellow, color:C.brown, opacity:(!scenario||!consent)?.6:1, transition:"all .2s",
            boxShadow:(!scenario||!consent)?"none":"0 6px 16px rgba(232,221,104,.5)",
          }}>
            Начать репетицию →
          </button>
          {!voiceSupported && <p style={{ margin:0, textAlign:"center", fontSize:12, color:C.sage }}>Микрофон в этом окне недоступен — работает режим «печатать вместо говорить». Собеседник всё равно говорит вслух.</p>}
        </div>
      </>
    );
  }

  // ════════════════════════════ CONVERSATION ════════════════════════════
  if (screen === "convo") {
    const goalsDone = Object.values(goals).filter(Boolean).length;
    const avgW = metrics.current.words.length ? (metrics.current.words.reduce((a,b)=>a+b,0)/metrics.current.words.length).toFixed(0) : "—";
    const statusText = { idle:"твоя очередь", listening:"слушаю…", thinking:"думает…", speaking:"говорит…" }[status];
    return shell(
      <>
        {/* header + live goals */}
        <div style={{ padding:"14px 16px 10px", background:C.teal, color:"#fff", borderBottomLeftRadius:22, borderBottomRightRadius:22 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontWeight:800, fontSize:14 }}>{scenario.emoji} {scenario.persona}</div>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:12.5, opacity:.9 }}>{statusText}</span>
              <button onClick={()=>setMuted(!muted)} className="no-print" title="звук собеседника" style={{ background:"rgba(255,255,255,.18)", border:"none", color:"#fff", borderRadius:8, padding:"4px 8px", cursor:"pointer", fontSize:13 }}>{muted?"🔇":"🔊"}</button>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <GoalChip done={goals.greeting} label="Приветствие" />
            <GoalChip done={goals.smalltalk} label="Small talk" />
            <GoalChip done={goals.counterQuestion} label="Встречный вопрос" />
            <GoalChip done={goals.closing} label="Закрытие" />
          </div>
        </div>

        {/* transcript */}
        <div ref={scrollRef} style={{ flex:1, overflowY:"auto", padding:"16px 16px 8px" }}>
          <div style={{ textAlign:"center", fontSize:12.5, color:C.sage, background:C.mintSoft, borderRadius:12, padding:"10px 12px", marginBottom:16, lineHeight:1.45 }}>
            {scenario.sceneRu}<br/><span style={{ color:C.teal, fontWeight:700 }}>Начни с приветствия — по-английски.</span>
          </div>
          {messages.map((m, i) => <Bubble key={i} role={m.role}>{m.text}</Bubble>)}
          {status === "thinking" && (
            <div style={{ display:"flex", gap:4, padding:"8px 14px" }}>
              {[0,1,2].map(i => <span key={i} style={{ width:8, height:8, borderRadius:8, background:C.sage, animation:`dots 1.2s ${i*0.2}s infinite` }} />)}
            </div>
          )}
        </div>

        {/* support phrase (stuck) */}
        {stuck && (
          <div className="no-print" style={{ margin:"0 16px 8px", padding:"12px 14px", borderRadius:14, background:"#fff", border:`2px solid ${C.yellow}` }}>
            <div style={{ fontSize:11.5, fontWeight:800, color:C.sage, textTransform:"uppercase", letterSpacing:.4, marginBottom:4 }}>Фраза-опора</div>
            <div style={{ fontSize:15, color:C.olive, fontWeight:700 }}>{supportPhrase}</div>
            <div style={{ fontSize:11.5, color:C.sage, marginTop:4 }}>Можешь опереться на неё — эта пауза не штрафуется.</div>
          </div>
        )}
        {notice && <div className="no-print" style={{ margin:"0 16px 8px", fontSize:12.5, color:C.teal, textAlign:"center" }}>{notice}</div>}

        {/* input dock */}
        <div className="no-print" style={{ padding:"12px 16px 18px", background:C.surface, borderTop:`1px solid ${C.mintSoft}` }}>
          <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:12 }}>
            <button onClick={()=>voiceSupported && setMode("voice")} disabled={!voiceSupported} style={{ padding:"5px 12px", borderRadius:999, fontSize:12, fontWeight:700, cursor:voiceSupported?"pointer":"not-allowed", border:`1.5px solid ${mode==="voice"?C.teal:C.mintSoft}`, background:mode==="voice"?C.teal:"#fff", color:mode==="voice"?"#fff":C.sage, opacity:voiceSupported?1:.5 }}>🎤 Говорить</button>
            <button onClick={()=>setMode("text")} style={{ padding:"5px 12px", borderRadius:999, fontSize:12, fontWeight:700, cursor:"pointer", border:`1.5px solid ${mode==="text"?C.teal:C.mintSoft}`, background:mode==="text"?C.teal:"#fff", color:mode==="text"?"#fff":C.sage }}>⌨️ Печатать</button>
          </div>

          {mode === "voice" ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
              <button
                onMouseDown={()=>{}} onClick={() => status==="listening" ? stopListening() : startListening()}
                disabled={status==="thinking"||status==="speaking"}
                style={{
                  position:"relative", width:76, height:76, borderRadius:999, border:"none", cursor: (status==="thinking"||status==="speaking")?"not-allowed":"pointer",
                  background: status==="listening" ? C.yellow : C.yellow, color:C.brown, fontSize:30,
                  animation: status==="listening" ? "breathe 1.6s infinite" : "none",
                  opacity:(status==="thinking"||status==="speaking")?.5:1, boxShadow:"0 6px 16px rgba(232,221,104,.5)",
                }}>
                {status==="listening" ? "■" : "🎤"}
              </button>
              <span style={{ fontSize:12.5, color:C.sage }}>{status==="listening" ? "нажми, чтобы остановить" : "нажми и говори по-английски"}</span>
            </div>
          ) : (
            <div style={{ display:"flex", gap:8 }}>
              <input value={draft} onChange={e=>{ setDraft(e.target.value); disarmStuck(); }}
                onKeyDown={e=>{ if(e.key==="Enter") sendTurn(draft); }}
                placeholder="Type your reply in English…" disabled={status==="thinking"}
                style={{ flex:1, padding:"13px 14px", borderRadius:12, border:`1.5px solid ${C.mintSoft}`, fontSize:15, color:C.olive, outline:"none" }} />
              <button onClick={()=>sendTurn(draft)} disabled={status==="thinking"||!draft.trim()} style={{ padding:"0 18px", borderRadius:12, border:"none", background:C.yellow, color:C.brown, fontWeight:900, fontSize:16, cursor:draft.trim()?"pointer":"not-allowed", opacity:draft.trim()?1:.5 }}>→</button>
            </div>
          )}

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14 }}>
            <span style={{ fontSize:11.5, color:C.sage }}>цели {goalsDone}/4 · средняя реплика {avgW} сл.</span>
            <button onClick={finish} disabled={messages.length < 2} style={{ padding:"8px 14px", borderRadius:10, border:`1.5px solid ${C.teal}`, background: messages.length<2?"#fff":C.teal, color:messages.length<2?C.sage:"#fff", fontWeight:800, fontSize:12.5, cursor:messages.length<2?"not-allowed":"pointer", opacity:messages.length<2?.5:1 }}>Мои успехи →</button>
          </div>
        </div>
      </>
    );
  }

  // ════════════════════════════ SUMMARY ════════════════════════════
  const goalsDone = Object.values(goals).filter(Boolean).length;
  const pass = goalsDone >= 3 && metrics.current.turns > 0 && (metrics.current.understood / metrics.current.turns) >= 0.5;
  return shell(
    <>
      <div id="tr-report" style={{ padding:"26px 20px 40px" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ display:"inline-block", padding:"6px 14px", borderRadius:999, background: pass?C.yellow:C.mintSoft, color: pass?C.brown:C.teal, fontWeight:800, fontSize:13, marginBottom:12 }}>
            {pass ? "✓ Финал пройден" : "Хорошая репетиция"}
          </div>
          <h2 style={{ margin:0, fontSize:24, color:C.olive, fontWeight:900 }}>Мои успехи</h2>
          <p style={{ margin:"6px 0 0", color:C.sage, fontSize:13.5 }}>{scenario.emoji} {scenario.label} · {scales?.date}</p>
        </div>

        {/* 1 — scales */}
        <div style={{ background:C.surface, borderRadius:18, padding:"18px 18px 4px", border:`1px solid ${C.mintSoft}`, marginBottom:16 }}>
          <div style={{ fontSize:12.5, fontWeight:800, color:C.teal, textTransform:"uppercase", letterSpacing:.5, marginBottom:14 }}>Прогресс · рост, не оценка</div>
          {scales && <>
            <Scale label="Выполнение целей" value={scales.taskCompletion} prev={lastScales?.taskCompletion} />
            <Scale label="Темп (без долгих пауз)" value={scales.latency} prev={lastScales?.latency} />
            <Scale label="Развёрнутость реплик" value={scales.elaboration} prev={lastScales?.elaboration} />
            <Scale label="Уточнение при непонимании" value={scales.clarification} prev={lastScales?.clarification} />
          </>}
          {!lastScales && <p style={{ margin:"2px 0 6px", fontSize:12, color:C.sage }}>Это первая сессия — со следующей появится сравнение «от раза к разу».</p>}
        </div>

        {/* 2 — recommendation */}
        <div style={{ background:C.surface, borderRadius:18, padding:"18px", border:`1px solid ${C.mintSoft}`, marginBottom:16 }}>
          <div style={{ fontSize:12.5, fontWeight:800, color:C.teal, textTransform:"uppercase", letterSpacing:.5, marginBottom:12 }}>Разбор от коллеги</div>
          {summaryLoading ? (
            <div style={{ display:"flex", gap:5, padding:"6px 0" }}>{[0,1,2].map(i=><span key={i} style={{ width:8,height:8,borderRadius:8,background:C.sage,animation:`dots 1.2s ${i*.2}s infinite` }}/>)}</div>
          ) : summary && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div><div style={{ fontSize:12, fontWeight:800, color:C.teal, marginBottom:3 }}>Сильная сторона</div><div style={{ fontSize:14.5, color:C.olive, lineHeight:1.5 }}>{summary.strength}</div></div>
              <div><div style={{ fontSize:12, fontWeight:800, color:C.sage, marginBottom:3 }}>Одна зона роста</div><div style={{ fontSize:14.5, color:C.olive, lineHeight:1.5 }}>{summary.growthZone}</div></div>
              <div style={{ background:C.mintSoft, borderRadius:12, padding:"12px 14px" }}><div style={{ fontSize:12, fontWeight:800, color:C.teal, marginBottom:3 }}>Микропрактика на следующий раз</div><div style={{ fontSize:14.5, color:C.olive, lineHeight:1.5 }}>{summary.microPractice}</div></div>
            </div>
          )}
        </div>

        {/* 3 — entertainment */}
        {summary?.entertainment && (
          <div style={{ background:`linear-gradient(135deg, ${C.mintSoft}, #fff)`, borderRadius:18, padding:"18px", border:`1px solid ${C.mintSoft}`, marginBottom:20 }}>
            <div style={{ fontSize:12.5, fontWeight:800, color:C.teal, textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>🎬 На вечер, по теме</div>
            <div style={{ fontSize:16, fontWeight:800, color:C.olive }}>{summary.entertainment.title} <span style={{ fontSize:12, fontWeight:700, color:C.sage }}>· {summary.entertainment.type}</span></div>
            <div style={{ fontSize:13.5, color:C.olive, marginTop:5, lineHeight:1.5 }}>{summary.entertainment.why}</div>
          </div>
        )}

        <div className="no-print" style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <button onClick={()=>window.print()} style={{ padding:"14px", borderRadius:14, border:`1.5px solid ${C.teal}`, background:"#fff", color:C.teal, fontWeight:800, fontSize:15, cursor:"pointer" }}>⬇ Скачать отчёт (PDF)</button>
          <button onClick={()=>start(scenario)} style={{ padding:"15px", borderRadius:14, border:"none", background:C.yellow, color:C.brown, fontWeight:900, fontSize:16, cursor:"pointer", boxShadow:"0 6px 16px rgba(232,221,104,.5)" }}>Ещё разок? →</button>
          <button onClick={()=>setScreen("onboarding")} style={{ padding:"12px", borderRadius:14, border:"none", background:"transparent", color:C.sage, fontWeight:700, fontSize:13.5, cursor:"pointer" }}>Сменить сценарий</button>
        </div>
      </div>
    </>
  );
}
