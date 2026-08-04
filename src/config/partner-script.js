// Реплики собеседницы для локального (офлайн) движка.
// Это КОНТЕНТ, а не логика: правится без программиста.
//
// Ограничение честно фиксируем: ТЗ (блок 1) хочет, чтобы собеседник ГЕНЕРИРОВАЛ реплики.
// Пока подключённой модели нет, реплики собраны заранее, а живость даёт слой реакций:
// собеседница отвечает на прямые вопросы, подхватывает сферу работы и умеет переспросить проще.
// При переключении ENGINE на "claude" этот файл перестаёт использоваться.

// Этапы разговора. Порядок = ход разговора.
// line   — основная реплика этапа.
// simple — та же мысль проще и короче: показывается, если пользователь не понял.
export const STAGES = [
  {
    id: "open",
    line: "Hi! I don't think we've met. I'm Maya — I'm a product designer at Northwind Labs.",
    simple: "Hi! My name is Maya. I'm a designer.",
  },
  {
    id: "askWork",
    line: "So what brings you here — what do you do?",
    simple: "What is your job?",
  },
  {
    id: "shareWork",
    line:
      "Nice. I mostly do research and prototypes — I spend a lot of my week just talking to users. " +
      "This is my second year at this conference.",
    simple: "I talk to users and make prototypes. This is my second year here.",
  },
  {
    id: "askEvent",
    line: "How are you finding it so far? Have you been to any of the talks?",
    simple: "Do you like the conference?",
  },
  {
    id: "preClose",
    line:
      "Same here. The next session starts in a few minutes and I promised a colleague I'd save her a seat.",
    simple: "I have to go soon. The next talk starts in a few minutes.",
  },
  {
    id: "close",
    line: "It was really nice meeting you. Enjoy the rest of the conference!",
    simple: "Nice to meet you. Bye!",
  },
];

// Ответы на прямые вопросы пользователя. Проверяются сверху вниз — первое совпадение выигрывает.
// Собеседница отвечает и продолжает свою реплику этапа, разговор не останавливается.
export const ANSWERS = [
  {
    match: /\b(what.*(you )?do|what.*your (job|work)|where.*you work)\b/,
    reply: "Me? I'm a product designer — mostly research and prototypes.",
  },
  {
    match: /\b(what.*your name|who are you|your name)\b/,
    reply: "Maya. Maya Ortega.",
  },
  {
    match: /\b(where.*(you )?from|where.*you live|where.*based)\b/,
    reply: "I'm based here in Lisbon, but I grew up in Seville.",
  },
  {
    match: /\b(first time|been here before|your first)\b/,
    reply: "Second year for me. Last year it was much smaller.",
  },
  {
    match: /\b(your (talk|company)|northwind)\b/,
    reply: "Northwind Labs — we're small, about forty people.",
  },
  {
    match: /\b(are you (speaking|presenting)|do you have a talk|give a talk)\b/,
    reply: "Not speaking this year. Maybe next time.",
  },
  {
    match: /\b(how (are|is) (you|it going)|how's it going)\b/,
    reply: "Good, thanks — a bit too much coffee already.",
  },
  {
    match: /\b(conference|event|talks?|sessions?)\b.*\b(like|enjoy|finding|think)\b/,
    reply: "Better than I expected, honestly. The onboarding talk this morning was great.",
  },
];

// Реакция на сферу работы пользователя — чтобы ответ не был безличным.
export const WORK_REACTIONS = [
  { match: /\b(teach|teacher|school|educat|student|university|course)\b/, reply: "Oh, education — that's a world I keep bumping into." },
  { match: /\b(design|designer|ux|ui)\b/, reply: "A designer too! Then we'll have plenty to talk about." },
  // Осторожно со короткими словами: "it" здесь означал отрасль, но ловил любое "it" в реплике.
  { match: /\b(develop|developer|engineer|programm|code|coding|software)\b/, reply: "Engineering, nice — I work with developers every day." },
  { match: /\b(market|sales|brand|content)\b/, reply: "Marketing, got it. You're probably the reason half of us are here." },
  { match: /\b(manage|product owner|pm|founder|ceo|business)\b/, reply: "That sounds like a lot of plates to keep spinning." },
  { match: /\b(doctor|nurse|medic|health)\b/, reply: "Healthcare — that's a serious one." },
  { match: /\b(study|studying|student)\b/, reply: "Still studying — good time to be at something like this." },
];

// Нейтральные подхваты, когда конкретной зацепки нет.
export const NEUTRAL_REACTIONS = [
  "Oh, interesting.",
  "That makes sense.",
  "Nice.",
  "I see what you mean.",
];

// Если пользователь ответил совсем коротко — мягко оставляем место для продолжения.
// Это НЕ обучение и не оценка: живой собеседник тоже так делает.
export const SHORT_ANSWER_REACTIONS = [
  "Oh really?",
  "Go on.",
  "Nice.",
];

// Пользователь ушёл на русский. ТЗ, блок 2: мягко возвращаем в английский, не переводим.
export const RUSSIAN_NUDGE =
  "Sorry, my Russian is terrible — can you try that in English?";

// Пользователь не понял. Дальше движок покажет упрощённую версию своей прошлой реплики.
export const CLARIFY_LEAD_IN = "Sure, sorry —";
