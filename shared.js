// ============================================================
//  shared.js — Groq холболт (хурдны хязгаарыг автоматаар зохицуулна)
// ============================================================

// Үндсэн загвар: qwen (ажиглалт сайн хийдэг, 8,000 токен/мин)
// Нөөц загвар: compound-mini (70,000 токен/мин — хязгаарт хүрвэл энэ рүү шилжинэ)
const PRIMARY = "qwen/qwen3.8-27b";
const FALLBACK = "groq/compound-mini";
const MAX_TOKENS = 1500;
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "2.5s" / "1m30s" / "172ms" гэх мэт хугацааг миллисекунд болгоно
function parseWait(str) {
  if (!str) return null;
  const m = String(str).match(/(?:(\d+)m)?(?:([\d.]+)s)?(?:(\d+)ms)?/);
  if (!m) return null;
  const mins = Number(m[1] || 0), secs = Number(m[2] || 0), ms = Number(m[3] || 0);
  const total = mins * 60000 + secs * 1000 + ms;
  return total > 0 ? total : null;
}

function isRateLimit(msg) {
  const s = String(msg).toLowerCase();
  return s.includes("rate limit") || s.includes("request too large") || s.includes("429");
}

async function rawCall(model, system, user, strictJson, maxTokens) {
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
    max_tokens: maxTokens || MAX_TOKENS,
  };
  if (strictJson) body.response_format = { type: "json_object" };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.GROQ_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const resetMs = parseWait(res.headers.get("x-ratelimit-reset-tokens"));
  const text = await res.text();

  if (!res.ok) {
    let msg = "HTTP " + res.status;
    try {
      const err = JSON.parse(text);
      if (err?.error?.failed_generation) return { content: err.error.failed_generation };
      msg = err?.error?.message || msg;
    } catch (_) {}
    const e = new Error(msg);
    e.resetMs = resetMs;
    e.rateLimited = isRateLimit(msg) || res.status === 429;
    throw e;
  }

  return { content: JSON.parse(text).choices[0].message.content };
}

// Хязгаарт хүрвэл: Groq-ийн хэлсэн хугацаа хүлээнэ -> дахин -> нөөц загвар
async function callModel(system, user, opts = {}) {
  const quiet = opts.quiet === true;
  const order = [PRIMARY, PRIMARY, FALLBACK];

  let lastErr;
  for (let i = 0; i < order.length; i++) {
    const model = order[i];
    for (const strict of [true, false]) {
      try {
        const out = await rawCall(model, system, user, strict);
        return { ...out, model };
      } catch (e) {
        lastErr = e;
        if (e.rateLimited) break; // формат биш, хязгаарын асуудал
      }
    }

    if (lastErr?.rateLimited && i < order.length - 1) {
      const waitMs = Math.min(Math.max(lastErr.resetMs || 20000, 3000), 65000);
      if (!quiet) {
        const secs = Math.ceil(waitMs / 1000);
        for (let s = secs; s > 0; s--) {
          process.stdout.write(`\r  (хязгаар: ${s}s хүлээж байна)     `);
          await sleep(1000);
        }
        process.stdout.write("\r" + " ".repeat(34) + "\r");
      } else {
        await sleep(waitMs);
      }
    }
  }
  throw lastErr || new Error("Тодорхойгүй алдаа");
}

function parseJson(raw) {
  let text = String(raw).trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  text = text
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");

  try { return JSON.parse(text); } catch (_) {}

  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s !== -1 && e > s) {
    try { return JSON.parse(text.slice(s, e + 1)); } catch (_) {}
  }
  if (s !== -1) {
    let t = text.slice(s).replace(/,\s*$/, "");
    const q = (t.match(/(?<!\\)"/g) || []).length;
    if (q % 2 === 1) t += '"';
    let open = 0, ar = 0, inStr = false, prev = "";
    for (const ch of t) {
      if (ch === '"' && prev !== "\\") inStr = !inStr;
      if (!inStr) {
        if (ch === "{") open++; else if (ch === "}") open--;
        else if (ch === "[") ar++; else if (ch === "]") ar--;
      }
      prev = ch;
    }
    t += "]".repeat(Math.max(0, ar)) + "}".repeat(Math.max(0, open));
    return JSON.parse(t);
  }
  throw new Error("JSON уншигдсангүй");
}

// Ажиглалт хийлгэнэ. JSON эвдэрвэл өөр загвараар дахин оролдоно.
async function observe(buildPrompt, taskNumber, question, essay, visual, opts = {}) {
  const { system, user } = buildPrompt(taskNumber, question, essay, visual);
  const quiet = opts.quiet === true;

  let lastErr;
  for (const model of [PRIMARY, FALLBACK]) {
    for (const strict of [true, false]) {
      try {
        const out = await rawCall(model, system, user, strict);
        const obs = parseJson(out.content);
        // хамгийн наад захын талбар байгаа эсэхийг шалгана
        if (typeof obs === "object" && obs !== null && obs.sentenceCount !== undefined) {
          obs._model = model;
          return obs;
        }
        lastErr = new Error("Ажиглалт дутуу ирлээ");
      } catch (e) {
        lastErr = e;
        if (e.rateLimited) {
          const waitMs = Math.min(Math.max(e.resetMs || 15000, 3000), 65000);
          if (!quiet) {
            for (let sec = Math.ceil(waitMs / 1000); sec > 0; sec--) {
              process.stdout.write(`\r  (хязгаар: ${sec}s)     `);
              await sleep(1000);
            }
            process.stdout.write("\r" + " ".repeat(26) + "\r");
          } else {
            await sleep(waitMs);
          }
        }
      }
    }
    if (!quiet) process.stdout.write("");
  }
  throw lastErr || new Error("Ажиглалт авч чадсангүй");
}

// Засвар/зөвлөмж. Бүтэхгүй бол null буцаана — оноо эвдрэхгүй.
async function getFeedback(buildFeedbackPrompt, essay) {
  const { system, user } = buildFeedbackPrompt(essay);
  for (const model of [PRIMARY, FALLBACK]) {
    for (const strict of [true, false]) {
      try {
        const out = await rawCall(model, system, user, strict, 1200);
        const fb = parseJson(out.content);
        if (fb && (fb.corrections || fb.strengths)) return fb;
      } catch (_) {}
    }
  }
  return null;
}

module.exports = { PRIMARY, FALLBACK, MODEL: PRIMARY, callModel, parseJson, observe, getFeedback, sleep };
