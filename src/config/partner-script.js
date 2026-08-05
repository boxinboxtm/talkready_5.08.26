// Контент собеседницы для офлайн-режима. Правится без программиста.
//
// ПРИНЦИП: реплика Maya рождается из того, что сказал человек.
// Не из её очереди тем — именно очередь и давала ощущение «отвечает своё»:
// человек говорил про доклад, а Maya спрашивала «были ли вы на докладах?».
//
// Поэтому здесь два разных списка:
//   RULES   — что ответить на КОНКРЕТНОЕ содержание. Вопрос внутри правила
//             всегда про то же, о чём человек только что сказал.
//   OPENERS — вопросы «от себя». Достаются, только когда зацепиться не за что,
//             и никогда — если человек эту тему уже закрыл.

/* ================================================================== */
/* Открытие                                                            */
/* ================================================================== */

export const OPENING =
  "Hi! I don't think we've met — I'm Maya, product designer at Northwind Labs. What about you?";

export const OPENING_SIMPLE = "Hi! I'm Maya. And you?";

/* ================================================================== */
/* Ответы на вопросы о Maya                                            */
/* ================================================================== */

// Распознавание речи не ставит знаков препинания и теряет слова,
// поэтому шаблоны свободные — ловим суть, а не формулировку.
// Порядок важен: узкие правила выше широких.
export const ANSWERS = [
  { id: "enjoyWork", match: /\b(do you (like|enjoy)|are you enjoying)\b.{0,15}\b(your )?(job|work|design|it there)\b/, reply: "Most days, yes. The user interviews are the best part." },
  { id: "likeIt", match: /\b(do you (like|enjoy)|are you enjoying|how are you (finding|liking))\b.{0,25}\b(it|this|here|conference|event|talks?|lisbon|so far)\b/, reply: "Yeah, genuinely. The research track alone was worth the trip." },
  // Выше вопроса про работу: «what do you do for fun» иначе попадало в шаблон про работу.
  { id: "hobby", match: /\b(hobb|free time|weekends?|for fun|outside (of )?work|when you'?re not working)\b/, reply: "I swim, badly but often. It's the only hour I don't look at a screen." },
  { id: "job", match: /\bwhat.{0,20}\b(you do|your job|your work|for a living)\b/, reply: "I'm a product designer — mostly research and prototypes." },
  { id: "name", match: /\b(what.{0,10}your name|who are you|your name again)\b/, reply: "Maya. Maya Ortega." },
  { id: "from", match: /\b(where.{0,15}(you )?from|where.{0,10}you (live|based)|are you local)\b/, reply: "I'm based here in Lisbon, though I grew up in Seville." },
  { id: "company", match: /\b(what company|who do you work for|northwind|your team|how big)\b/, reply: "Northwind Labs. We're small — about forty people." },
  { id: "first", match: /\b(first time|been here before|is this your first)\b/, reply: "Second year for me. Last year it was half this size." },
  { id: "speaking", match: /\b(are you (speaking|presenting)|do you have a talk|giving a talk|your talk)\b/, reply: "Not speaking this year. Maybe next one, if I'm brave." },
  { id: "howAre", match: /\b(how are you|how.{0,5}s it going|how are things|how.{0,5}s your day)\b/, reply: "Good, thanks — one coffee too many already." },
  { id: "howLong", match: /\b(how long|how many years|since when)\b/, reply: "About four years now. Longest I've stayed anywhere." },
  { id: "whichTalks", match: /\b(which|what).{0,20}\b(talks?|sessions?)\b/, reply: "The onboarding one this morning, and I want to catch the research panel later." },
  { id: "whyHere", match: /\b(why.{0,15}(here|come|came)|what brings you|what are you here for)\b/, reply: "Mostly the research track. And to escape my inbox, honestly." },
  { id: "age", match: /\b(how old|your age)\b/, reply: "Old enough to have strong opinions about design systems." },
  { id: "family", match: /\b(married|kids|children|family|partner|boyfriend|husband)\b/, reply: "No kids. A very demanding cat, though." },
  { id: "languages", match: /\b(speak.{0,20}(spanish|portuguese|languages?)|how many languages)\b/, reply: "Spanish and English. My Portuguese is still embarrassing." },
  { id: "travelQ", match: /\b(do you travel|travel.{0,15}(much|often|a lot))\b/, reply: "A few trips a year. This one I actually look forward to." },
  { id: "coffee", match: /\b(want|get|grab|like).{0,12}(coffee|drink|lunch)\b/, reply: "I'd love one, but I've had three already. Rain check?" },
];

// Вопрос задан, но в банке его нет. Честнее признать, чем ответить не по теме.
export const UNKNOWN_ANSWERS = [
  "Hm, good question — I've honestly never thought about it.",
  "You know what, I have no idea.",
  "Ha, you've got me there.",
  "No clue, but now I want to know too.",
];

// Изредка возвращаем мяч после своего ответа — но только если человеку есть что добавить.
export const BOUNCE_BACK = "What about you?";

/* ================================================================== */
/* Правила: ответ на СОДЕРЖАНИЕ реплики                                */
/* ================================================================== */

// react    — реакция на сказанное (без вопроса)
// followUp — один вопрос ПРО ТО ЖЕ САМОЕ; null, если продолжать нечем
// covers   — какие темы считать закрытыми, чтобы Maya про них не спросила
//
// Границы слова справа у основ нет намеренно: с `\beducat\b` шаблон не ловил
// «education» и подхват молчал.
export const RULES = [
  // --- состояние «только пришёл»: проверяем раньше всего, иначе «Not yet, I just
  //     arrived» читалось как «сейчас без работы» ---
  { id: "justArrived", match: /\b(just (arrived|got here|landed|walked in)|literally just|only just)\b/, react: "Ah, you've only just landed. Coffee first, everything else after.", followUp: null, covers: [] },
  { id: "dontKnow",    match: /\b(i don'?t know|not sure|no idea|hard to say|difficult to say)\b/, react: "Fair enough — it's a lot to take in at once.", followUp: null, covers: [] },

  // --- сфера работы: реакция по полю + вопрос про стаж (та же тема) ---
  { id: "work_edu",    match: /\b(teach|educat|school|universit|tutor|lectur)/, react: "Education — that's a world I keep bumping into lately.", followUp: "How long have you been doing that?", covers: ["work"] },
  { id: "work_design", match: /\b(design|ux|ui)\b/,                            react: "A designer too! Then we'll have things to argue about.", followUp: "In-house, or agency side?", covers: ["work"] },
  { id: "work_dev",    match: /\b(develop|engineer|programm|coding|software|backend|frontend)/, react: "Engineering — I work with developers every day, they keep me honest.", followUp: "What are you building at the moment?", covers: ["work"] },
  { id: "work_mkt",    match: /\b(market|sales|brand|copywrit|advertis)/,      react: "Marketing — you're probably the reason half of us are in this room.", followUp: "Product side, or agency?", covers: ["work"] },
  { id: "work_mgmt",   match: /\b(product manager|founder|ceo|business owner|i manage|consult)/, react: "That sounds like a lot of plates to keep spinning.", followUp: "How big is the team?", covers: ["work"] },
  { id: "work_health", match: /\b(doctor|nurse|medic|health|therap|psycho)/,   react: "Healthcare — that's a serious one, very far from my world.", followUp: "What brings you to a design conference, then?", covers: ["work"] },
  { id: "work_student",match: /\b(student|studying|at uni)/,                   react: "Still studying — good time to be somewhere like this.", followUp: "What are you studying?", covers: ["work"] },
  { id: "work_res",    match: /\b(research|analyst|scien|data)/,               react: "Research — then the panel later is yours, not mine.", followUp: "What sort of research?", covers: ["work"] },
  { id: "work_lang",   match: /\b(translat|interpret|linguist)/,               react: "Languages — and here I am, monolingual and ashamed.", followUp: "Which ones do you work with?", covers: ["work"] },
  { id: "work_write",  match: /\b(journalis|writ|editor|blog)/,                react: "Writing — I'm always slightly in awe of people who finish things.", followUp: "What do you write about?", covers: ["work"] },
  { id: "work_law",    match: /\b(lawyer|legal|account|financ|bank)/,          react: "A world with actual rules. Mine mostly has opinions.", followUp: "And what brings you here?", covers: ["work"] },
  { id: "work_art",    match: /\b(artist|music|photo|film|creativ)/,           react: "Something creative — you'll like the room upstairs.", followUp: "Is that your full-time thing?", covers: ["work"] },
  { id: "work_generic",match: /\b(i work|i'?m a|i am a|i'?m an|i am an|my job|freelance|self.?employed)\b/, react: "Oh, nice.", followUp: "How long have you been doing that?", covers: ["work"] },

  // --- стаж: человек назвал срок ---
  { id: "duration", match: /\b(\d+|a few|a couple|several|many|two|three|four|five|six|seven|eight|ten)\s*(years?|months?)\b|\bsince \d{4}\b|\ball my life\b/, react: "That's a proper stretch — you must know where all the bodies are buried.", followUp: null, covers: [] },

  // --- доклады: человек сам заговорил про них ---
  { id: "talk_named", match: /\b(onboarding|keynote|panel|workshop)\b/,        react: "Oh, that one. I heard people talking about it in the queue.", followUp: "Was it worth it?", covers: ["talks"] },
  { id: "talk_seen",  match: /\b(went to|been to|saw|watched|attended|caught)\b.{0,25}\b(talks?|sessions?|one)\b/, react: "Nice, you're ahead of me.", followUp: "How was it?", covers: ["talks"] },
  { id: "talk_any",   match: /\b(talks?|sessions?|speakers?|programme|schedule)\b/, react: "The programme's a bit overwhelming this year.", followUp: "Anything you'd recommend?", covers: ["talks"] },

  // --- город и поездка ---
  { id: "staying", match: /\b(staying|until|till|through|leaving|fly (back|out)|few days|weekend|monday|sunday|tomorrow)\b/, react: "Good — that's enough time to actually see the place.", followUp: "Have you been down to the water yet?", covers: ["city"] },
  { id: "city",    match: /\b(lisbon|portugal|hotel|flight|flew|airbnb|first time here)\b/, react: "Lisbon's been kind to me so far. Four years and I still get lost.", followUp: null, covers: ["city"] },
  { id: "food",    match: /\b(food|eat|restaurant|dinner|lunch|pastel|coffee)\b/, react: "The food alone is worth extending the trip for.", followUp: null, covers: [] },

  // --- состояние человека ---
  { id: "tired",   match: /\b(tired|exhausted|jet ?lag|long day|early flight|didn'?t sleep)\b/, react: "Yeah, it's a long day. The coffee here is doing heavy lifting.", followUp: null, covers: [] },
  { id: "nervous", match: /\b(nervous|shy|not good at|my english|difficult|hard for me)\b/, react: "Honestly, everyone here is faking it a bit. You're doing fine.", followUp: null, covers: [] },
  { id: "firstCon",match: /\b(first (time|conference)|never been|my first)\b/,  react: "A first-timer! It's a friendly crowd, mostly.", followUp: null, covers: [] },
];

/* ================================================================== */
/* Вопросы «от себя» — только когда зацепиться не за что               */
/* ================================================================== */

// Каждый звучит не больше раза. Тема, которую человек закрыл сам, пропускается.
export const OPENERS = [
  { id: "work",  topic: "work",  line: "So what do you do?",                                    simple: "What is your job?",             retry: "What kind of work are you in?" },
  { id: "talks", topic: "talks", line: "Have you made it to any of the talks yet?",              simple: "Did you go to any talks?",      retry: "Anything good in the programme today?" },
  { id: "city",  topic: "city",  line: "Are you here just for the conference, or staying a few days?", simple: "Are you staying long?",   retry: "Is this your first time in Lisbon?" },
];

// Реакции на отрицательный ответ — по каждому вопросу свои, чтобы «Not yet» не повисало.
export const OPENER_NO = {
  work: "Between things, then. Honestly, not a bad place to be.",
  talks: "Ah, you've got time. The onboarding one at four is supposed to be the good one.",
  city: "Straight in and out — brave. The city deserves a slow morning.",
};

// Подтвердил, но без подробностей.
export const OPENER_YES = {
  work: "Nice. What kind of work is it?",
  talks: "Oh good — how was it?",
  city: "Good call. Any plans beyond the conference?",
};

/* ================================================================== */
/* Реплики Maya от себя — без вопроса, чтобы разговор не был допросом  */
/* ================================================================== */

export const SHARES = [
  "I spend half my week just talking to users, so a room full of strangers is basically my job.",
  "The onboarding talk this morning was better than I expected, and I went in sceptical.",
  "I've lived here four years and still find streets I've never walked down.",
  "This is the one conference I don't have to fly to, which makes me unreasonably smug.",
];

/* ================================================================== */
/* Общие подхваты                                                      */
/* ================================================================== */

export const NEUTRAL_REACTIONS = [
  "That makes sense.",
  "Oh, interesting.",
  "Right, I can see that.",
  "Fair enough.",
];

export const SHORT_ANSWER_REACTIONS = ["Oh really?", "Go on.", "Ha, fair."];

export const AGREEMENT_REACTIONS = [
  "Right? I thought so too.",
  "Glad it's not just me.",
  "It has its moments.",
];

/* ================================================================== */
/* Завершение и служебное                                              */
/* ================================================================== */

export const PRE_CLOSE =
  "Listen — the next session starts in a few minutes and I promised a colleague I'd save her a seat.";
export const PRE_CLOSE_SIMPLE = "I have to go soon. The next talk starts in a few minutes.";

export const CLOSE = "It was really nice meeting you. Enjoy the rest of the conference!";
export const CLOSE_WITH_NAME = (name) =>
  `It was really nice meeting you, ${name}. Enjoy the rest of the conference!`;
export const CLOSE_SIMPLE = "Nice to meet you. Bye!";

export const NAME_ACK = (name) => `${name} — nice to meet you.`;

// Ушли на русский. ТЗ, блок 2: мягко возвращаем, не переводим.
export const RUSSIAN_NUDGE = "Sorry, my Russian is terrible — can you try that in English?";

// Не понял: движок повторит СВОЮ прошлую реплику проще.
export const CLARIFY_LEAD_IN = "Sure, sorry.";

// Слова, которые нельзя принимать за имя: «I'm a designer» — это не имя.
export const NOT_A_NAME =
  /^(a|an|the|not|from|here|so|just|really|very|good|fine|sorry|okay|ok|glad|happy|nice|going|working|trying|looking|new|still|also|too|and|but|in|at|on|my|your|interested|excited|afraid|sure|only|quite|kind|sort|based|originally)$/;
