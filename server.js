// ============================================================
//  server.js — Хамгаалалттай үнэлгээний сервер
//  Ажиллуулах:  node --env-file=.env server.js
// ============================================================

const http = require("http");
const { buildPrompt, buildFeedbackPrompt, scoreFromObservations, sanitizeCorrections } = require("./rubric.js");
const { observe, getFeedback } = require("./shared.js");

// ---------- ТОХИРГОО ----------
// Эдгээрийг .env файлд бичиж өөрчилж болно.
const PORT = Number(process.env.PORT || 3000);

// Зөвхөн эдгээр домэйнээс ирсэн хүсэлтийг хүлээж авна (таслалаар тусгаарлана).
// Жишээ .env мөр:  ALLOWED_ORIGINS=https://bolorgames.mn,https://www.bolorgames.mn
const ALLOWED = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const PER_IP_PER_HOUR = Number(process.env.PER_IP_PER_HOUR || 10);
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 200);

// ---------- ХЯЗГААРЫН БҮРТГЭЛ ----------
const ipHits = new Map();          // ip -> [timestamp, ...]
let dayKey = new Date().toDateString();
let dayCount = 0;

function rollDay() {
  const k = new Date().toDateString();
  if (k !== dayKey) { dayKey = k; dayCount = 0; ipHits.clear(); }
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function checkLimits(ip) {
  rollDay();
  if (dayCount >= DAILY_LIMIT) {
    return "Өнөөдрийн хязгаарт хүрлээ. Маргааш дахин оролдоно уу.";
  }
  const now = Date.now();
  const hour = 3600000;
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < hour);
  if (hits.length >= PER_IP_PER_HOUR) {
    const wait = Math.ceil((hour - (now - hits[0])) / 60000);
    return `Хэт олон хүсэлт илгээлээ. ${wait} минутын дараа дахин оролдоно уу.`;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return null;
}

function originAllowed(origin) {
  if (!ALLOWED.length) return true;            // тохируулаагүй бол бүгдийг зөвшөөрнө
  if (!origin) return false;                   // браузераас ирээгүй бол татгалзана
  return ALLOWED.some((a) => origin === a);
}

// ---------- ДАРААЛАЛ ----------
let chain = Promise.resolve();
let queueLength = 0;
function enqueue(fn) {
  queueLength++;
  const run = chain.then(fn, fn).finally(() => { queueLength--; });
  chain = run.catch(() => {});
  return run;
}

// ---------- ҮНЭЛГЭЭ ----------
async function evaluateEssay({ task, question, visual, essay, feedback }) {
  const taskNumber = Number(task) === 2 ? 2 : 1;
  const words = String(essay || "").trim().split(/\s+/).filter(Boolean).length;

  if (words < 20) throw new Error("Эссэ хэт богино байна (доод тал нь 20 үг).");
  if (words > 800) throw new Error("Эссэ хэт урт байна (дээд тал нь 800 үг).");

  const obs = await observe(buildPrompt, taskNumber, question || "", essay, visual || "", { quiet: true });
  const result = scoreFromObservations(obs, taskNumber);

  if (feedback !== false) {
    // Ажиглалтыг засварлагчид дамжуулна — алдааны тоог мэдэж байвал зохиохоо болино
    const fb = await getFeedback((e) => buildFeedbackPrompt(e, obs), essay);
    if (fb) {
      // Зохиосон болон хуурамч засваруудыг шүүнэ
      result.corrections = sanitizeCorrections(fb.corrections, essay);
      result.strengths = Array.isArray(fb.strengths) ? fb.strengths : [];
      result.weaknesses = Array.isArray(fb.weaknesses) ? fb.weaknesses : [];
      const dropped = (fb.corrections || []).length - result.corrections.length;
      if (dropped > 0) console.log(`  (${dropped} хуурамч засвар шүүгдлээ)`);
    }
  }
  // Үгийн тоог загвараас биш, кодоор тоолно
  result.wordCount = words;
  result.meetsWordLimit = words >= (taskNumber === 1 ? 150 : 250);
  delete result.observations._model;
  return result;
}

// ---------- ТУРШИХ ХУУДАС ----------
const PAGE = `<!doctype html><html lang="mn"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>IELTS Writing үнэлгээ</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--line:#e3e6ea;--ink:#1a1d21;--mut:#6b7280;--accent:#2563eb}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:24px}h1{font-size:20px;margin:0 0 4px}
.sub{color:var(--mut);font-size:13px;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px;margin-bottom:16px}
label{display:block;font-weight:600;font-size:13px;margin:12px 0 6px}
select,textarea{width:100%;padding:10px;border:1px solid var(--line);border-radius:7px;font:inherit;background:#fff}
textarea{min-height:150px;resize:vertical}
button{background:var(--accent);color:#fff;border:0;border-radius:7px;padding:11px 22px;font:inherit;font-weight:600;cursor:pointer;margin-top:14px}
button:disabled{opacity:.5;cursor:default}.band{font-size:40px;font-weight:700;line-height:1}
.row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line)}.row:last-child{border:0}
.sc{font-weight:700}.bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden;margin-top:5px}
.bar i{display:block;height:100%;background:var(--accent)}.fix{padding:11px 0;border-bottom:1px solid var(--line)}
.bad{color:#b91c1c;text-decoration:line-through}.good{color:#15803d;font-weight:600}
.note{color:var(--mut);font-size:13px;margin-top:3px}.meta{color:var(--mut);font-size:12px;margin-top:10px}
.err{background:#fef2f2;border-color:#fecaca;color:#b91c1c}
</style></head><body><div class="wrap">
<h1>IELTS Writing үнэлгээ</h1><div class="sub">AI ажиглана, оноог тогтсон дүрмээр код тооцно.</div>
<div class="card">
<label>Даалгаврын төрөл</label>
<select id="task"><option value="1">Task 1 — график / диаграм (150 үг)</option><option value="2">Task 2 — эссэ (250 үг)</option></select>
<label>Даалгаврын текст</label><textarea id="question" style="min-height:70px"></textarea>
<label>Зураг юуг харуулж байна (зөвхөн Task 1)</label><textarea id="visual" style="min-height:55px"></textarea>
<label>Сурагчийн эссэ</label><textarea id="essay"></textarea><div class="note" id="wc">0 үг</div>
<button id="go">Үнэлэх</button></div><div id="out"></div>
<script>
const $=s=>document.querySelector(s);
const NAMES={task:"Task Achievement / Response",coherence:"Coherence &amp; Cohesion",lexical:"Lexical Resource",grammar:"Grammatical Range &amp; Accuracy"};
const esc=s=>String(s??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
$("#essay").addEventListener("input",e=>{$("#wc").textContent=e.target.value.trim().split(/\\s+/).filter(Boolean).length+" үг";});
$("#go").onclick=async()=>{const b=$("#go"),o=$("#out");b.disabled=true;b.textContent="Үнэлж байна...";
o.innerHTML='<div class="card">Түр хүлээнэ үү...</div>';
try{const r=await fetch("/api/evaluate",{method:"POST",headers:{"Content-Type":"application/json"},
body:JSON.stringify({task:$("#task").value,question:$("#question").value,visual:$("#visual").value,essay:$("#essay").value})});
const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||"Алдаа");render(d);}
catch(e){o.innerHTML='<div class="card err">'+esc(e.message)+'</div>';}
finally{b.disabled=false;b.textContent="Үнэлэх";}};
function render(d){let h='<div class="card"><div class="band">'+d.overall.toFixed(1)+'</div><div class="note">'+d.wordCount+' үг'+(d.meetsWordLimit?"":" — доод хязгаараас бага")+'</div></div><div class="card">';
for(const k of ["task","coherence","lexical","grammar"]){const s=d.criteria[k].score;
h+='<div class="row"><div style="flex:1">'+NAMES[k]+'<div class="bar"><i style="width:'+(s/9*100)+'%"></i></div></div><div class="sc" style="margin-left:16px">'+s.toFixed(1)+'</div></div>';}
h+='<div class="meta">'+esc(d.calculation)+'</div></div>';
if(d.corrections&&d.corrections.length){h+='<div class="card"><b>Алдаа ба засвар</b>';
d.corrections.forEach(c=>{h+='<div class="fix"><span class="bad">'+esc(c.original)+'</span> &rarr; <span class="good">'+esc(c.corrected)+'</span>';if(c.explanation)h+='<div class="note">'+esc(c.explanation)+'</div>';h+='</div>';});h+='</div>';}
if(d.strengths&&d.strengths.length)h+='<div class="card"><b>Давуу тал</b><ul>'+d.strengths.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ul></div>';
if(d.weaknesses&&d.weaknesses.length)h+='<div class="card"><b>Юуг засах вэ</b><ul>'+d.weaknesses.map(s=>'<li>'+esc(s)+'</li>').join("")+'</ul></div>';
$("#out").innerHTML=h;}
</script></div></body></html>`;

// ---------- СЕРВЕР ----------
const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  const url = req.url.split("?")[0];

  if (originAllowed(origin) && origin) res.setHeader("Access-Control-Allow-Origin", origin);
  else if (!ALLOWED.length) res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(PAGE);
  }

  if (req.method === "GET" && url === "/api/health") {
    rollDay();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      ok: true, queue: queueLength,
      today: dayCount, dailyLimit: DAILY_LIMIT,
      allowedOrigins: ALLOWED.length ? ALLOWED : "бүгд (тохируулаагүй)",
    }));
  }

  if (req.method === "POST" && url === "/api/evaluate") {
    const ip = clientIp(req);

    if (!originAllowed(origin)) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      console.log(`  ${new Date().toLocaleTimeString()}  ТАТГАЛЗЛАА  домэйн: ${origin || "байхгүй"}`);
      return res.end(JSON.stringify({ error: "Энэ домэйнээс хандах эрхгүй." }));
    }

    const limitError = checkLimits(ip);
    if (limitError) {
      res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
      console.log(`  ${new Date().toLocaleTimeString()}  ХЯЗГААР  ${ip}`);
      return res.end(JSON.stringify({ error: limitError }));
    }

    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 200000) req.destroy(); });
    req.on("end", async () => {
      const t0 = Date.now();
      try {
        const input = JSON.parse(body || "{}");
        const result = await enqueue(() => evaluateEssay(input));
        result.seconds = Number(((Date.now() - t0) / 1000).toFixed(1));
        dayCount++;
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result));
        console.log(`  ${new Date().toLocaleTimeString()}  band ${result.overall.toFixed(1)}  ${result.wordCount} үг  ${result.seconds}s  [өнөөдөр ${dayCount}/${DAILY_LIMIT}]`);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: String(e.message) }));
        console.log(`  ${new Date().toLocaleTimeString()}  АЛДАА: ${e.message}`);
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

if (!process.env.GROQ_API_KEY) {
  console.log("FAIL: GROQ_API_KEY олдсонгүй. --env-file=.env нэмсэн эсэхээ шалга.");
  process.exit(1);
}

server.listen(PORT, () => {
  console.log("\n" + "=".repeat(62));
  console.log("  IELTS WRITING ҮНЭЛГЭЭНИЙ СЕРВЕР");
  console.log("=".repeat(62));
  console.log(`  Туршилтын хуудас:  http://localhost:${PORT}`);
  console.log(`  API:               POST /api/evaluate`);
  console.log("\n  ХАМГААЛАЛТ");
  console.log(`    Зөвшөөрсөн домэйн:  ${ALLOWED.length ? ALLOWED.join(", ") : "тохируулаагүй — БҮГД (аюултай)"}`);
  console.log(`    Нэг IP цагт:        ${PER_IP_PER_HOUR} удаа`);
  console.log(`    Өдрийн дээд:        ${DAILY_LIMIT} үнэлгээ`);
  if (!ALLOWED.length) {
    console.log("\n  .env файлд нэмнэ үү:");
    console.log("    ALLOWED_ORIGINS=https://таны-домэйн.mn");
  }
  console.log("\n  Зогсоохдоо Ctrl + C.\n");
});
