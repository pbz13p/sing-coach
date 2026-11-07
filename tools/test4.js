// 唱的时候（实时）判断自测：把合成歌声按手机真实的节奏（每 4096 个采样一次）喂给 SC.yinAvg + SC.liveJudge，
// 看“准 / 偏高 / 偏低 / 换音”判断对不对。失败退出码 1。
const SC = require('../analysis.js');
const sr = 16000, hop = Math.round(4096 / 3); // 48k 采样、每次 4096 → 降到 16k 约 1365 个
function voice(notes, o = {}) { // notes: [[midi 或 null, 秒]]
  const total = notes.reduce((s, n) => s + n[1], 0), x = new Float32Array(Math.ceil(total * sr)); let s = 0, ph = 0, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - .5; };
  for (const [m, d] of notes) { const n = Math.floor(d * sr);
    for (let k = 0; k < n; k++, s++) { if (m == null) { x[s] = 0.001 * rnd(); continue; } const tt = k / sr;
      const midi = m + (o.vib || 0) * Math.sin(2 * Math.PI * 5.5 * tt), f = 440 * Math.pow(2, (midi - 69) / 12); ph += 2 * Math.PI * f / sr;
      const env = Math.min(1, tt / .03, (d - tt) / .03); x[s] = env * .3 * (Math.sin(ph) + .5 * Math.sin(2 * ph) + .25 * Math.sin(3 * ph)) + 0.003 * rnd(); } }
  return x;
}
function run(x) { // 返回每一帧 {t, st}
  const tune = { x: 0, y: 0, n: 0 }, live = [], out = [], ph = {}; let buf = [], steady = 0, maxSteady = 0; out.says = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    for (let k = 0; k < hop; k++) buf.push(x[i + k]); if (buf.length > 4000) buf = buf.slice(buf.length - 4000);
    const n = buf.length; if (n < 800) continue;
    let e = 0; for (let j = n - 400; j < n; j++) e += buf[j] * buf[j]; const rms = Math.sqrt(e / 400);
    const f = rms > 0.004 ? SC.yinAvg(buf, sr) : 0, t = (i + hop) / sr;
    live.push({ t, m: f > 0 ? 69 + 12 * Math.log2(f / 440) : NaN, rms }); while (live[0].t < t - 8) live.shift();
    const J = SC.liveJudge(tune, live, t); steady = SC.liveSteady(steady, J.st); maxSteady = Math.max(maxSteady, steady);
    out.push({ t, st: J.st, sing: J.sing, cents: J.cents });
    const pv = SC.phraseTrack(ph, t, J.sing, J.st === "move" ? null : J.st); if (pv && out.says[out.says.length - 1] !== pv) out.says.push(pv);
  }
  out.maxSteady = maxSteady; return out;
}
const share = (fr, t0, t1, st) => { const a = fr.filter(f => f.t > t0 && f.t < t1 && f.st && f.st !== "move"); return a.length ? a.filter(f => f.st === st).length / a.length : 0; };
const scale = [60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60, 64]; // 每个音 1 秒
let bad = 0; const check = (name, ok, info) => { console.log((ok ? "通过 " : "失败 ") + name + (info ? "  " + info : "")); if (!ok) bad++; };
{ const fr = run(voice(scale.map(m => [m, 1])));
  const ok = fr.filter(f => f.st && f.st !== "move"), r = ok.filter(f => f.st === "ok").length / ok.length;
  check("唱准：绝大多数时候是绿色（准）", r > 0.9, "准的比例 " + (r * 100).toFixed(0) + "%，最长连续稳 " + (fr.maxSteady / 10).toFixed(1) + " 秒");
  check("唱准：能说出“很稳！连续 3 秒以上”", fr.maxSteady >= 30); }
{ const fr = run(voice(scale.map(m => [m, 1]), { vib: .4 }));
  const ok = fr.filter(f => f.st && f.st !== "move"), r = ok.filter(f => f.st === "ok").length / ok.length;
  check("带颤音（±40 音分）唱准：不冤枉成“晃/偏”", r > 0.8, "准的比例 " + (r * 100).toFixed(0) + "%"); }
{ const notes = scale.map((m, i) => [m + (i === 8 ? .45 : i === 9 ? -.45 : 0), 1]); // 第 9 个音唱高、第 10 个唱低 45 音分
  const fr = run(voice(notes));
  check("唱高 45 音分：判成“偏高”", share(fr, 8.3, 8.9, "hi") > 0.6, (share(fr, 8.3, 8.9, "hi") * 100).toFixed(0) + "%");
  check("唱低 45 音分：判成“偏低”", share(fr, 9.3, 9.9, "lo") > 0.6, (share(fr, 9.3, 9.9, "lo") * 100).toFixed(0) + "%");
  check("唱准的音没被连累", share(fr, 2.3, 7.9, "ok") > 0.9, (share(fr, 2.3, 7.9, "ok") * 100).toFixed(0) + "%"); }
{ const fr = run(voice(scale.map(m => [m - .5, 1]))); // 整首都低半个音（调起低了），只要音和音之间准就算准
  const ok = fr.filter(f => f.t > 3 && f.st && f.st !== "move"), r = ok.filter(f => f.st === "ok").length / ok.length;
  check("整首起调低半音：不算错（按他自己的调）", r > 0.85, "准的比例 " + (r * 100).toFixed(0) + "%"); }
{ const fr = run(voice([[60, 1], [null, 1], [64, 1]]));
  const q = fr.filter(f => f.t > 1.3 && f.t < 1.9);
  check("不出声的时候：不判对错", q.length > 0 && q.every(f => !f.sing && !f.st)); }
{ const fr = run(voice([[60, .5], [67, .5], [60, .5], [67, .5], [60, .5], [67, .5]]));
  const wrong = fr.filter(f => f.st === "hi" || f.st === "lo").length;
  check("快速换音（大跳）：换音那一下不算唱错", wrong <= 2, "误判 " + wrong + " 帧"); }
{ const P = (ns, d = 0) => ns.map(m => [m + d, .8]).concat([[null, 1.2]]);
  const fr = run(voice([].concat(P([60, 62, 64, 65, 67]), P([65, 64, 62, 60], -.45), P([62, 64, 65, 67]), P([67, 65, 64, 62]), [[64, .7], [null, 1.2]], P([60, 62, 64], .45))));
  const t = fr.says.map(v => v.text);
  check("每句唱完马上评价：准 / 偏低 / 准 / 连着 2 句准 / （哼一下不评）/ 偏高", t.length === 5 && /很准/.test(t[0]) && /偏低/.test(t[1]) && /很准/.test(t[2]) && /连着 2 句/.test(t[3]) && /偏高/.test(t[4]), t.join(" | ")); }
{ const fr = run(voice([].concat([60, 62, 64, 62].map(m => [m, .8]), [[null, .4]], [64, 65].map(m => [m, .8]), [[null, 1.2]])));
  check("字和字之间短停顿（0.4 秒）不算一句", fr.says.length === 1, fr.says.map(v => v.text).join(" | ")); }
console.log(bad ? "有 " + bad + " 项失败" : "全部通过"); process.exit(bad ? 1 : 0);
