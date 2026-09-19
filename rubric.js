// ============================================================
//  rubric.js — хувилбар 4
//  AI зөвхөн АЖИГЛАЖ тоолно. Оноог ЭНЭ ФАЙЛЫН КОД тооцно.
//  Ингэснээр ижил эссэд ижил оноо гарна.
// ============================================================

// ---------- 1. AI-Д ӨГӨХ ДААЛГАВАР (оноо асуухгүй) ----------

function buildPrompt(taskNumber, question, essay, visual = "") {
  const isTask1 = taskNumber === 1;

  const system =
    "You are a precise text analyst. You COUNT and LIST what is present in a piece of writing. " +
    "You never assign scores, grades or bands. You report only what you can point to in the text. " +
    "You output strict JSON.";

  const taskSpecific = isTask1
    ? `
"overviewPresent": true if ANY sentence summarises the whole picture (the overall trend, the overall shape, or the number of stages). An introduction that only repeats the question is NOT an overview.
"overviewSpecific": true only if that overview names the actual overall pattern (e.g. which group was largest, or how many stages the process has). A vague sentence like "things changed a lot" is NOT specific.
"overviewQuote": the sentence itself, or "" if none.
"keyFeaturesRequired": how many distinct key features the visual contains (stages, categories, data series).
"keyFeaturesCovered": how many of those the candidate actually mentions.
"featuresMissing": list the ones not mentioned.
"dataUsed": true if the candidate cites specific numbers, percentages or labels from the visual.
"speculation": true if the candidate invents reasons WHY the data looks as it does (not shown in the visual).`
    : `
"taskPartsTotal": how many separate questions the prompt asks (count question marks and separate instructions).
"taskPartsAnswered": how many the candidate actually answers.
"positionClear": true if the candidate states a personal position and keeps it consistent from start to finish.
"positionQuote": the sentence where the position is stated, or "" if none.
"mainIdeas": how many distinct main ideas are developed.
"specificExamples": how many CONCRETE examples are given (a named case, a situation, a scenario). Vague statements are not examples.
"irrelevantParts": how many passages drift away from the question.`;

  const user = `
Analyse the writing below. Do NOT judge it. Do NOT give it a score. Only COUNT and LIST.

# THE TASK THE WRITER WAS GIVEN
${question}
${visual ? `The visual shows: ${visual}` : ""}

# THE WRITING
"""
${essay}
"""

# WHAT TO REPORT
Return ONLY this JSON object, nothing else:

{
  "wordCount": <integer, count the words in the writing>,
${taskSpecific.trim().split("\n").map((l) => "  " + l).join("\n")}

  "paragraphCount": <integer>,
  "logicalOrder": <true if the paragraphs follow a sensible sequence>,
  "cohesiveDevices": [<list every linking expression used, e.g. "First of all", "However", "Moreover">],
  "referencingClear": <true if pronouns and words like "this", "these", "they" clearly point to something>,
  "linkerAtSentenceStart": <how many sentences BEGIN with a linking expression>,
  "sentenceCount": <integer, total sentences>,

  "sophisticatedLexis": [<list only HIGH-REGISTER or IDIOMATIC collocations: phrases a native academic writer would use, e.g. of paramount importance, polishing their skills, weighing up the pluses and minuses, a crucial part of, rife with, cultural enrichment, new horizons, by far the largest, stable or sufficient income. List the ACTUAL items found in this text, or an empty list.>],
  "precisionLexis": [<list accurate but more ordinary topic vocabulary, e.g. approximately, significantly, dramatically, respectively, accounted for, modifications, transformed into, declined, proportion. List the ACTUAL items found in this text.>],
  "basicRepetition": <true if the writer relies on the same few basic words over and over>,
  "spellingErrors": [<list misspelled words>],
  "lexisImpeding": <how many word-choice or spelling errors actually STOP the reader working out the meaning>,

  "complexSentences": <how many sentences contain a subordinate clause: which, that, because, while, when, although, if, who>,
  "errorFreeSentences": <how many sentences contain NO grammatical error at all>,
  "grammarErrorCount": <total grammatical errors>,
  "grammarImpeding": <how many grammatical errors actually STOP the reader working out the meaning>
}

RULES:
- Count honestly. Do not round numbers to make the writing look better or worse.
- The lexis lists are the most important fields. Read the whole text and list every qualifying item.
- Every string in a list must be a SHORT plain phrase with NO punctuation at all: no quotes, no commas, no full stops.
- Use plain ASCII only. No curly quotes.
- Output ONLY the JSON object. No commentary before or after.
`.trim();

  return { system, user };
}

// ---------- 1б. ЗАСВАР/ЗӨВЛӨМЖИЙН ТУСДАА ДУУДЛАГА ----------
// Энэ нь бүтэхгүй ч оноо гарсан хэвээр үлдэнэ.

function buildFeedbackPrompt(essay, obs) {
  const system =
    "You are a strict IELTS examiner marking a student text. " +
    "You report ONLY errors you can point to in the text. If the text is accurate, you say so " +
    "by returning an empty corrections list. Inventing an error is a serious failure. " +
    "You explain in Mongolian Cyrillic. You output strict JSON.";

  // Ажиглагчийн тоолсон алдааны тоог засварлагчид дамжуулна
  const hint = (obs && typeof obs.grammarErrorCount === "number")
    ? `\nA first reader counted roughly ${obs.grammarErrorCount} grammatical errors and ` +
      `${(obs.spellingErrors || []).length} spelling errors in this text. ` +
      `Your list should be about that size. If that number is 0, return an empty list.`
    : "";

  const user = `
Find the genuine errors in the text below — the ones that would cost marks in an IELTS Writing exam.
${hint}

# TEXT
"""
${essay}
"""

Return ONLY this JSON:

{
  "corrections": [
    { "original": "exact phrase copied character-for-character from the text", "corrected": "the fixed version", "type": "grammar", "explanation": "one short line in Mongolian Cyrillic" }
  ],
  "strengths": ["one short Mongolian Cyrillic line", "one short Mongolian Cyrillic line"],
  "weaknesses": ["one short Mongolian Cyrillic line", "one short Mongolian Cyrillic line"]
}

RULES — READ CAREFULLY:
- List between 0 and 8 corrections. ZERO IS A VALID AND EXPECTED ANSWER for an accurate text.
- NEVER invent an error. If you are not certain something is wrong, leave it out.
- "original" must be copied EXACTLY from the text above. Do not retype it from memory,
  do not alter a single letter. If you cannot find the phrase in the text, do not include it.
- "original" and "corrected" must be DIFFERENT. Never list a phrase that is already correct.
- Do NOT correct something merely because another wording is also possible.
  "adjoining" vs "adjacent to", "beside" vs "next to", "floor space" vs "floor area"
  are all acceptable. These are NOT errors.
- British spelling is fully correct in IELTS. NEVER change centre to center,
  colour to color, organise to organize, or similar. This is not an error.
- Do NOT add or remove commas unless the sentence is genuinely ungrammatical without the change.
  The Oxford comma is optional. Never list a comma as an error on its own.
- Correct structures are not errors: "not merely X but Y", "the more convincing",
  "since" meaning because, and similar are all standard English.
- If the text has few real errors, keep the list short and put positive observations
  in "strengths" instead. An empty corrections list is the correct answer for a strong text.
- "type" must be one of: grammar, vocabulary, spelling, punctuation.
- NEVER use a double quote character inside any value. Use plain words only.
- Keep every value on one line. Use plain ASCII punctuation.
- Output ONLY the JSON object.
`.trim();

  return { system, user };
}

// ---------- 1в. ЗАСВАРЫГ ШАЛГАХ (зохиосон алдааг хаяна) ----------
// Загвар заримдаа эссэд байхгүй өгүүлбэр зохиодог, эсвэл зөв өгүүлбэрийг
// "засдаг". Энэ функц тэдгээрийг шүүж хаяна.

function sanitizeCorrections(list, essay) {
  const norm = (x) => String(x == null ? "" : x).replace(/\s+/g, " ").trim();
  const bare = (x) => norm(x).toLowerCase().replace(/[.,;:!?'"\u2019\u2018-]/g, "");
  const hay = norm(essay).toLowerCase();
  const seen = new Set();

  return (Array.isArray(list) ? list : []).filter((c) => {
    const a = norm(c && c.original);
    const b = norm(c && c.corrected);
    if (!a || !b) return false;

    // 1. Зөв өгүүлбэрийг "засвар" гэж жагсаасан
    if (a.toLowerCase() === b.toLowerCase()) return false;

    // 2. Зөвхөн таслал/цэг нэмсэн — бодит алдаа биш
    if (bare(a) === bare(b)) return false;

    // 3. Эссэд байхгүй өгүүлбэр зохиосон
    if (!hay.includes(a.toLowerCase())) return false;

    // 4. Британи бичлэгийг Америк руу "зассан" — IELTS-д алдаа биш
    const brit = [["centre","center"],["colour","color"],["favourite","favorite"],
                  ["organise","organize"],["realise","realize"],["analyse","analyze"],
                  ["programme","program"],["labour","labor"],["behaviour","behavior"],
                  ["travelling","traveling"],["practise","practice"]];
    const al = a.toLowerCase(), bl = b.toLowerCase();
    if (brit.some(([uk, us]) => al.includes(uk) && bl.includes(us))) return false;

    // 5. Давхардсан
    const key = a.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

// ---------- 2. АЖИГЛАЛТААС ОНОО ТООЦОХ (код, AI биш) ----------

const clamp = (v) => Math.max(3, Math.min(9, Math.round(v * 2) / 2));
const num = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
const arr = (v) => (Array.isArray(v) ? v : []);

function scoreLexical(o) {
  const soph = arr(o.sophisticatedLexis).length;
  const prec = arr(o.precisionLexis).length;

  let s;
  if (soph >= 8) s = 8.0;
  else if (soph >= 5) s = 7.5;
  else if (soph >= 3) s = 7.0;
  else if (soph >= 1) s = 6.5;
  else if (prec >= 2) s = 6.0;
  else if (prec >= 1) s = 5.5;
  else s = 5.0;

  // Давхар хасахгүй: хамгийн том нэг хасалтыг л хэрэглэнэ
  const imp = num(o.lexisImpeding);
  let deduct = 0;
  if (imp >= 4) deduct = 1.0;
  else if (imp >= 2) deduct = 0.5;
  if (o.basicRepetition === true && s > 5.5) deduct = Math.max(deduct, 0.5);
  if (arr(o.spellingErrors).length >= 10) deduct = Math.max(deduct, 0.5);
  s -= deduct;
  return clamp(s);
}

function scoreGrammar(o) {
  const total = Math.max(1, num(o.sentenceCount, 1));
  const complexRatio = num(o.complexSentences) / total;
  const cleanRatio = num(o.errorFreeSentences) / total;

  // Алдаагүй өгүүлбэрийн харьцаа бол гол ялгагч
  let s;
  if (cleanRatio >= 0.35) s = 8.0;
  else if (cleanRatio >= 0.18) s = 7.5;
  else if (cleanRatio >= 0.12) s = 7.0;
  else if (cleanRatio >= 0.06) s = 6.0;
  else if (cleanRatio > 0) s = 5.5;
  else s = 5.0;

  // Нийлмэл өгүүлбэр дутвал дээд оноог хязгаарлана
  if (complexRatio < 0.15) s = Math.min(s, 5.5);
  else if (complexRatio < 0.25) s = Math.min(s, 6.5);

  // Давхар хасалтаас сэргийлнэ: утга ойлгогдож байвал 5.0-аас доош унахгүй
  const imp = num(o.grammarImpeding);
  if (imp >= 6) s -= 1.0;
  else if (imp >= 4) s -= 0.5;
  if (imp < 6) s = Math.max(s, 5.0);

  return clamp(s);
}

function scoreCoherence(o) {
  const paras = num(o.paragraphCount);
  const devices = arr(o.cohesiveDevices).length;
  const sentences = Math.max(1, num(o.sentenceCount, 1));

  let s;
  if (paras >= 3 && o.logicalOrder === true && devices >= 5 && o.referencingClear === true) s = 7.0;
  else if (paras >= 2 && o.logicalOrder === true && devices >= 3) s = 6.0;
  else if (paras >= 2 || devices >= 2) s = 5.0;
  else s = 4.0;

  // өгүүлбэр бүр холбоос үгээр эхэлбэл механик болно
  if (num(o.linkerAtSentenceStart) / sentences > 0.7 && s > 6.0) s = 6.5;
  if (o.referencingClear === false && s > 6.0) s -= 0.5;
  return clamp(s);
}

function scoreTask1(o) {
  const req = Math.max(1, num(o.keyFeaturesRequired, 1));
  const cov = num(o.keyFeaturesCovered) / req;

  let s;
  if (o.overviewPresent === true && o.overviewSpecific === true) {
    s = cov >= 0.8 ? 7.0 : cov >= 0.5 ? 6.0 : 5.5;
  } else if (o.overviewPresent === true) {
    s = cov >= 0.8 ? 6.0 : cov >= 0.5 ? 5.5 : 5.0;
  } else {
    // Overview байхгүй ч гол зүйлсийг хамарсан бол 5-аас доошлохгүй
    s = cov >= 0.8 ? 5.5 : cov >= 0.45 ? 5.0 : 4.5;
  }

  // Хоёулаа давхар хасагдахгүй — нийт дээд тал нь 0.5
  let deduct = 0;
  if (o.speculation === true) deduct = 0.5;
  if (o.dataUsed === false) deduct = Math.max(deduct, 0.5);
  s -= deduct;

  // Гол зүйлсийн тал хувийг хамарсан бол 5.0-аас доош унахгүй
  if (cov >= 0.45) s = Math.max(s, 5.0);
  return clamp(s);
}

function scoreTask2(o) {
  const total = Math.max(1, num(o.taskPartsTotal, 1));
  const answered = num(o.taskPartsAnswered);
  const ideas = num(o.mainIdeas);
  const examples = num(o.specificExamples);

  if (answered < total) return clamp(4.5 + 0.5 * (answered / total));
  if (o.positionClear !== true) return 5.0;

  // Санааны ТОО ба ХӨГЖИЛТ нь гол. Нэрлэсэн жишээ нь нэмэлт урамшуулал.
  let s;
  if (ideas >= 5) s = 8.0;
  else if (ideas >= 4) s = 7.5;
  else if (ideas >= 3) s = 7.0;
  else if (ideas >= 2) s = 6.0;
  else s = 5.5;

  if (examples >= 2 && s < 8.0) s += 0.5;

  const irr = num(o.irrelevantParts);
  if (irr >= 3) s -= 1.0;
  else if (irr >= 2) s -= 0.5;
  return clamp(s);
}

function applyWordPenalty(s, wordCount, minWords) {
  const short = minWords - num(wordCount, minWords);
  if (short <= 0) return s;
  if (short <= 20) return clamp(s - 0.25);
  if (short <= 50) return clamp(s - 1.0);
  return clamp(s - 1.5);
}

function scoreFromObservations(o, taskNumber) {
  const minWords = taskNumber === 1 ? 150 : 250;

  let task = taskNumber === 1 ? scoreTask1(o) : scoreTask2(o);
  task = applyWordPenalty(task, o.wordCount, minWords);

  const coherence = scoreCoherence(o);
  const lexical = scoreLexical(o);
  const grammar = scoreGrammar(o);

  const sum = task + coherence + lexical + grammar;
  const avg = sum / 4;
  const overall = Math.round(avg * 2) / 2;

  return {
    wordCount: num(o.wordCount),
    meetsWordLimit: num(o.wordCount) >= minWords,
    criteria: {
      task: { score: task },
      coherence: { score: coherence },
      lexical: { score: lexical },
      grammar: { score: grammar },
    },
    calculation:
      `${task.toFixed(1)} + ${coherence.toFixed(1)} + ${lexical.toFixed(1)} + ${grammar.toFixed(1)}` +
      ` = ${sum.toFixed(1)} / 4 = ${avg.toFixed(3)} -> ${overall.toFixed(1)}`,
    overall,
    corrections: arr(o.corrections),
    strengths: arr(o.strengths),
    weaknesses: arr(o.weaknesses),
    observations: o,
  };
}

module.exports = { buildPrompt, buildFeedbackPrompt, scoreFromObservations, sanitizeCorrections };
