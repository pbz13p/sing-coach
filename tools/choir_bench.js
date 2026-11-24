// 合唱声部测试：用合成人声把每个声部"唱"一遍，看 App 逐句判断对不对
//   node tools/choir_bench.js [谱子.txt] [--gate]
// 唱法：唱准 / 某一句故意高 50 音分 / 某一句故意低 50 音分 / 外放（其他声部从喇叭漏进麦克风）+ 某句低 50
// 关卡：逐句判断正确率 ≥ 90%
const SC = require('../analysis.js'), CH = require('../choir.js'), fs = require('fs');
const SR = 16000;
const file = process.env.CHOIR_FILE || process.argv.find(a => a.endsWith('.txt')) || __dirname + '/choir/huanle.txt';
const song = CH.parse(fs.readFileSync(file, 'utf8'));
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// 按谱子的时间唱（真人：每个音 ±6 音分自然偏差、开口小滑音、长音颤音）
function sing(pi, o) {
  const mel = CH.toMelody(song, pi), r = rng(o.seed), male = song.parts[pi].oct < 0;
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return (s - 3) / Math.sqrt(0.5); };
  const harm = male ? [0.7, 1, 0.6, 0.45, 0.25, 0.15] : [1, 0.55, 0.3, 0.15, 0.08];
  const N = Math.ceil(mel.duration * SR), x = new Float32Array(N); let ph = 0;
  const lag = o.lag || 0.15; // 人总会比拍子晚一点点
  for (const e of mel.notes) {
    if (e.midi == null) continue;
    const m0 = e.midi + ((o.off[e.phrase] || 0) + gauss() * 6) / 100, dur = e.t1 - e.t0 - (e.breath ? 0.15 : 0.04);
    const vibA = dur > 0.55 ? 0.25 + r() * 0.15 : 0, vibF = 5 + r();
    const s0 = Math.floor((e.t0 + lag) * SR), s1 = Math.floor((e.t0 + lag + dur) * SR);
    for (let s = s0; s < s1 && s < N; s++) {
      const u = (s - s0) / SR, scoop = u < 0.06 ? -0.35 * (1 - u / 0.06) : 0;
      const m = m0 + scoop + vibA * Math.sin(2 * Math.PI * vibF * u) * Math.min(1, u / 0.25);
      ph += 2 * Math.PI * 440 * Math.pow(2, (m - 69) / 12) / SR;
      const env = Math.min(1, u / 0.03, (dur - u) / 0.05) * (0.8 + 0.2 * Math.sin(u * 3));
      let v = 0; harm.forEach((w, h) => v += w * Math.sin((h + 1) * ph)); x[s] = 0.22 * env * v;
    }
  }
  for (let s = 0; s < N; s++) x[s] += 0.003 * (r() - 0.5);
  if (o.leakDb != null) { // 手机喇叭放的"其他声部小声 + 打拍子"漏进麦克风
    const acc = CH.synth(song, pi, o.others, SR).data; let ex = 0, ea = 0;
    for (let i = 0; i < N && i < acc.length; i++) { ex += x[i] * x[i]; ea += acc[i] * acc[i]; }
    const g = Math.sqrt(ex / ea) * Math.pow(10, -o.leakDb / 20);
    for (let i = 0; i < N && i < acc.length; i++) x[i] += g * acc[i];
  }
  return { x, mel };
}
// 和测试集一样的判法：这句里有没有被标"高/低/唱错"
function verdict(res, t0, t1) {
  const ns = res.notes.filter(z => z.dur > 0.12 && z.t1 > t0 && z.t0 < t1);
  if (!ns.length) return { heard: false };
  const has = k => ns.some(z => (z.issues || []).includes(k));
  return { heard: true, hi: has('高'), lo: has('低'), wrong: ns.some(z => z.wrong) };
}
function judge(v, off) {
  if (!v.heard) return false;
  if (off >= 30) return v.hi && !v.lo;
  if (off <= -30) return v.lo && !v.hi;
  return !v.hi && !v.lo && !v.wrong;
}

if (require.main !== module) module.exports = { sing, song };
else (async () => {
  const nPh = Math.max(...song.parts.map(p => p.phrases.length)), rows = [], byPart = {}, byVar = {}, errs = [];
  for (let pi = 0; pi < song.parts.length; pi++) {
    const P = song.parts[pi].name;
    const V = [['唱准', {}]];
    for (let k = 0; k < nPh; k++) { V.push([`第${k + 1}句偏高50`, { off: { [k]: 50 } }]); V.push([`第${k + 1}句偏低50`, { off: { [k]: -50 } }]); }
    const LDB = +(process.env.LDB || 10); // 外放：喇叭比人声小 10 分贝（手机拿在手里、音量调小一点）
    V.push(['外放只放我的 · 唱准', { leakDb: LDB, others: 0 }]); V.push(['外放只放我的 · 第2句偏低50', { leakDb: LDB, others: 0, off: { 1: -50 } }]);
    V.push(['外放加其他声部 · 唱准', { leakDb: LDB, others: 0.35 }]); V.push(['外放加其他声部 · 第3句偏高50', { leakDb: LDB, others: 0.35, off: { 2: 50 } }]);
    V.push(['蓝牙耳机晚0.3秒 · 第3句偏高50', { lag: 0.45, off: { 2: 50 } }]);
    for (const [vn, o0] of V) {
      const o = Object.assign({ off: {}, seed: pi * 97 + vn.length * 13 + 1 }, o0);
      const { x, mel } = sing(pi, o);
      let res = await SC.analyze(x, SR);
      if (res.error) { errs.push(P + '/' + vn + ': ' + res.error); continue; }
      res.refCuts = mel.phrases.map(p => p.t0); res = SC.compareWithRef(res, mel, 'sync');
      mel.phrases.forEach(ph => {
        const f = res.phrases.find(q => q.no === ph.idx), off = o.off[ph.idx] || 0;
        const v = f ? verdict({ notes: f.notes }, -1e9, 1e9) : { heard: false }, ok = judge(v, off);
        rows.push(ok); (byPart[P] = byPart[P] || []).push(ok);
        const vk = vn.replace(/第\d句/, '某句'); (byVar[vk] = byVar[vk] || []).push(ok);
        if (!ok && process.env.V) console.log('  错', P, vn, '第' + (ph.idx + 1) + '句', JSON.stringify(v));
      });
    }
  }
  const rate = a => a.filter(Boolean).length / a.length, pc = v => (v * 100).toFixed(1) + '%';
  console.log(`《${song.title}》${song.parts.length} 个声部，共判断 ${rows.length} 句`);
  console.log('逐句判断正确率：' + pc(rate(rows)));
  Object.entries(byPart).forEach(([k, v]) => console.log('  ' + k.padEnd(4) + pc(rate(v))));
  Object.entries(byVar).forEach(([k, v]) => console.log('  ' + (rate(v) < 0.9 ? '✗ ' : '  ') + k.padEnd(18) + pc(rate(v))));
  if (errs.length) console.log('分析失败：', errs);
  if (process.argv.includes('--gate')) { if (rate(rows) < 0.9 || errs.length) { console.log('✗ 合唱声部测试没过'); process.exit(1); } console.log('合唱声部测试：通过'); }
})();
