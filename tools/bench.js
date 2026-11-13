// 音准评测集（阶段一）：20 段原创旋律 × 多种唱法，每句都有标准答案。
// 用法：node tools/bench.js            → 打印成绩，写 tools/bench_result.json
//       node tools/bench.js --quick    → 只跑前 6 段（改算法时先快速看）
// 说明：为了不碰版权，旋律是程序按中国民歌五声音阶“作”出来的，不是真歌；
//       真人录音版要 Frank 和爸妈录（见 ROADMAP.md「待 Frank 处理」）。
const SC = require('../analysis.js');
const fs = require('fs');
const SR = 16000;
const GATE = process.argv.includes('--gate');
const QUICK = process.argv.includes('--quick') || GATE;

// ---------- 随机数（固定种子，每次跑结果一样） ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- 作曲：4 句，每句 5~8 个音，五声音阶，句尾长音 ----------
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
function compose(seed) {
  const r = rng(seed * 7919), phrases = [];
  let idx = 2 + Math.floor(r() * 3);
  for (let p = 0; p < 4; p++) {
    const n = 5 + Math.floor(r() * 4), notes = [];
    for (let k = 0; k < n; k++) {
      idx = Math.max(0, Math.min(PENTA.length - 1, idx + [-2, -1, -1, 0, 1, 1, 2][Math.floor(r() * 7)]));
      const last = k === n - 1;
      const d = last ? 0.9 + r() * 0.5 : [0.3, 0.45, 0.45, 0.6, 0.6, 0.9][Math.floor(r() * 6)];
      notes.push([PENTA[idx], d]);
    }
    phrases.push(notes);
  }
  return phrases;
}

// ---------- 唱：人声合成（谐波 + 颤音 + 每个音的小偏差 + 起音小滑音） ----------
// opt: base(起调 midi), off{句号:音分}, shift{句号:秒}, voice:'m'|'f', room:bool, seed
function sing(mel, opt) {
  const o = Object.assign({ base: 57, off: {}, shift: {}, room: false, seed: 1, gap: 0.6, transpose: 0 }, opt);
  const r = rng(o.seed * 104729 + 3);
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return (s - 3) / Math.sqrt(0.5); };
  const harm = o.voice === 'm' ? [0.7, 1, 0.6, 0.45, 0.25, 0.15] : [1, 0.55, 0.3, 0.15, 0.08];
  const total = 0.8 + mel.reduce((s, ph) => s + ph.reduce((a, n) => a + n[1], 0) + o.gap, 0) + 1.5;
  const N = Math.floor(total * SR), x = new Float32Array(N);
  const ref = [], truth = [];
  let t = 0.8, ph = 0;
  mel.forEach((notes, p) => {
    const sh = o.shift[p] || 0, t0 = t;
    let tt = t + sh;
    notes.forEach(([d, dur], k) => {
      const natural = gauss() * 6;                         // 真人每个音都有 ±6 音分的自然偏差
      const cents = (o.off[p] || 0) + natural;
      const midi = o.base + o.transpose + d + cents / 100;
      const vibA = dur > 0.55 ? 0.25 + r() * 0.15 : 0, vibF = 5 + r();
      const s0 = Math.floor(tt * SR), s1 = Math.floor((tt + dur) * SR);
      for (let s = s0; s < s1 && s < N; s++) {
        const u = (s - s0) / SR;
        const scoop = u < 0.06 ? -0.35 * (1 - u / 0.06) : 0;   // 开口轻微从下往上
        const m = midi + scoop + vibA * Math.sin(2 * Math.PI * vibF * u) * Math.min(1, u / 0.25);
        ph += 2 * Math.PI * 440 * Math.pow(2, (m - 69) / 12) / SR;
        const env = Math.min(1, u / 0.03, (dur - u) / 0.05) * (0.8 + 0.2 * Math.sin(u * 3));
        let v = 0; harm.forEach((w, h) => v += w * Math.sin((h + 1) * ph));
        x[s] = 0.22 * env * v;
      }
      // 参考旋律（原唱）：按标准时间、标准音高
      ref.push([t, t + dur, o.base + d]);
      t += dur; tt += dur;
    });
    truth.push({ t0: t0 + sh, t1: t + sh, off: o.off[p] || 0, shift: sh });
    t += o.gap;
  });
  for (let s = 0; s < N; s++) x[s] += 0.003 * (r() - 0.5);
  if (o.room) room(x, r);
  if (o.leak) leak(x, mel, o, r);
  return { x, ref, truth, dur: total };
}

// 客厅：混响（0.45 秒衰减）+ 一次回声 + 电视声（带语调起伏的噪声，信噪比约 15 dB）
function room(x, r) {
  const N = x.length, L = Math.floor(0.45 * SR), ir = new Float32Array(L);
  for (let i = 0; i < L; i++) ir[i] = (r() - 0.5) * Math.exp(-6.9 * i / L) * 0.5;
  ir[0] = 1; ir[Math.floor(0.09 * SR)] += 0.35;
  const y = new Float32Array(N), step = 8;   // 稀疏卷积，够用又快
  for (let i = 0; i < N; i++) { const v = x[i]; if (!v) continue; for (let j = 0; j < L && i + j < N; j += step) y[i + j] += v * ir[j] * (j ? step : 1); }
  let lp = 0, ph = 0, e = 0; for (let i = 0; i < N; i++) e += y[i] * y[i]; const sig = Math.sqrt(e / N);
  const tv = new Float32Array(N); let te = 0;
  for (let i = 0; i < N; i++) {
    lp = 0.9 * lp + 0.1 * (r() - 0.5);
    ph += 2 * Math.PI * (140 + 60 * Math.sin(i / SR * 0.7)) / SR;   // 电视里有人说话：起伏的音调
    const talk = (Math.sin(i / SR * 2 * Math.PI * 3.1) > 0.2 ? 1 : 0.2);
    tv[i] = lp * 3 + talk * 0.4 * Math.sin(ph) * Math.sin(ph * 2.03);
    te += tv[i] * tv[i];
  }
  const g = sig / Math.sqrt(te / N) * Math.pow(10, -15 / 20);
  for (let i = 0; i < N; i++) x[i] = y[i] + g * tv[i];
}

// 外放：手机喇叭放的伴奏（和弦 + 低音 + 鼓点）漏进麦克风。leak = 伴奏比人声低多少分贝
function leak(x, mel, o, r) {
  const N = x.length, acc = new Float32Array(N);
  let t = 0.8; const chordOf = d => [0, 4, 7].map(k => o.base + o.transpose - 12 + (d % 12 < 5 ? 0 : 5) + k);
  mel.forEach(notes => { const dur = notes.reduce((a, n) => a + n[1], 0); const ch = chordOf(notes[0][0]);
    for (let s = Math.floor(t * SR); s < Math.min(N, (t + dur + o.gap) * SR); s++) { const u = s / SR;
      let v = 0; ch.forEach(m => v += Math.sin(2 * Math.PI * 440 * Math.pow(2, (m - 69) / 12) * u));
      v += 1.5 * Math.sin(2 * Math.PI * 440 * Math.pow(2, (ch[0] - 12 - 69) / 12) * u);
      const beat = (u * 2) % 1; v += beat < 0.03 ? (r() - 0.5) * 6 : 0;
      acc[s] = v; }
    t += dur + o.gap; });
  let ex = 0, ea = 0; for (let i = 0; i < N; i++) { ex += x[i] * x[i]; ea += acc[i] * acc[i]; }
  const g = Math.sqrt(ex / ea) * Math.pow(10, -o.leak / 20);
  for (let i = 0; i < N; i++) x[i] += g * acc[i];
}

function refMelody(ref, dur) {
  const hop = 0.02, n = Math.ceil(dur / hop), midi = new Float64Array(n).fill(NaN);
  ref.forEach(([a, b, m]) => { for (let i = Math.ceil(a / hop); i < Math.floor(b / hop) && i < n; i++) midi[i] = m; });
  return { hopS: hop, midi, duration: dur };
}

// 把 App 的判断变成每句的“标签”：和结果页一样——这句里有唱高/唱低/错音/快/慢的字就算有这个毛病
function verdict(res, tr, useTiming) {
  const ns = res.notes.filter(z => z.dur > 0.12 && z.t1 > tr.t0 && z.t0 < tr.t1);
  if (!ns.length) return { heard: false };
  const has = k => ns.filter(z => (z.issues || []).includes(k)).reduce((s, z) => s + z.dur, 0);
  const tot = ns.reduce((s, z) => s + z.dur, 0);
  return { heard: true, hi: has('高') > 0, lo: has('低') > 0, wrong: ns.some(z => z.wrong),
    early: useTiming && has('快') > 0.25 * tot, late: useTiming && has('慢') > 0.25 * tot };
}

// 标准答案 vs App：这句判对了没有
function judge(v, tr, mode) {
  if (!v.heard) return false;
  const pitchBad = v.hi || v.lo || v.wrong;
  if (tr.off >= 90 || tr.off <= -90) return v.wrong || (tr.off > 0 ? v.hi && !v.lo : v.lo && !v.hi);
  if (tr.off >= 30) return v.hi && !v.lo;
  if (tr.off <= -30) return v.lo && !v.hi;
  if (mode === 'sync' && tr.shift <= -0.25) return v.early && !pitchBad;
  if (mode === 'sync' && tr.shift >= 0.25) return v.late && !pitchBad;
  return !pitchBad && !v.early && !v.late;   // 唱准的句子：不能被判错
}

const VARIANTS = [
  // [名字, 唱法, 适用模式]
  ['唱准', s => ({}), ['self', 'free', 'sync']],
  // 清唱没有原唱可比，只能和他自己的调比：偏 50 音分正好在两个音中间，分不出是高了还是低了，所以清唱用 35
  ['一句偏高35（清唱）', s => ({ off: { [s % 4]: 35 } }), ['self']],
  ['一句偏低35（清唱）', s => ({ off: { [(s + 1) % 4]: -35 } }), ['self']],
  ['一句偏高50', s => ({ off: { [s % 4]: 50 } }), ['free', 'sync']],
  ['一句偏低50', s => ({ off: { [(s + 1) % 4]: -50 } }), ['free', 'sync']],
  ['一句偏高半音', s => ({ off: { [(s + 2) % 4]: 100 } }), ['free', 'sync']],
  ['一句偏低半音', s => ({ off: { [(s + 3) % 4]: -100 } }), ['free', 'sync']],
  ['一句抢拍0.35秒', s => ({ shift: { [(s + 1) % 4]: -0.35 } }), ['sync']],
  ['一句拖拍0.35秒', s => ({ shift: { [(s + 2) % 4]: 0.35 } }), ['sync']],
  ['男声低八度', s => ({ voice: 'm', transpose: -12 }), ['self', 'free', 'sync']],
  ['女声高音区', s => ({ voice: 'f', base: 64 }), ['self']],
  ['整首唱低三度（自己的调）', s => ({ transpose: -4 }), ['self', 'free']],
  ['客厅（混响+电视声）', s => ({ room: true }), ['self', 'free', 'sync']],
  ['客厅+一句偏低50', s => ({ room: true, off: { [s % 4]: -50 } }), ['free', 'sync']],
  ['外放伴奏漏进来（-10dB）', s => ({ leak: 10 }), ['self', 'sync']],
  ['外放很响（伴奏和人声一样大）', s => ({ leak: 0 }), ['self', 'sync']],
  ['外放伴奏+一句偏低50', s => ({ leak: 10, off: { [(s + 2) % 4]: -50 } }), ['sync']],
  ['客厅+一句偏低35（清唱）', s => ({ room: true, off: { [s % 4]: -35 } }), ['self']],
];

(async () => {
  const songs = QUICK ? 6 : 20, rows = [], byMode = {}, byVar = {}, errs = [];
  let cents = [];
  for (let s = 0; s < songs; s++) {
    const mel = compose(s + 1);
    for (const [vn, mk, modes] of VARIANTS) {
      const o = Object.assign({ seed: s * 31 + vn.length, voice: s % 2 ? 'f' : 'm', base: s % 2 ? 62 : 52 }, mk(s));
      const take = sing(mel, o);
      for (const mode of modes) {
        let res = await SC.analyze(take.x, SR);
        if (res.error) { errs.push(`${s + 1}/${vn}/${mode}: ${res.error}`); take.truth.forEach(() => rows.push({ ok: false, mode, vn })); continue; }
        if (mode !== 'self') res = SC.compareWithRef(res, refMelody(take.ref, take.dur), mode);
        // 音高误差：唱准的句子里每个音的 |dev|（理想接近我们加的 ±6 音分自然偏差）
        if (vn === '唱准') res.notes.forEach(z => { if (!z.wrong && z.dur > 0.2) cents.push(Math.abs(z.dev)); });
        take.truth.forEach((tr, p) => {
          const v = verdict(res, tr, mode === 'sync'), ok = judge(v, tr, mode);
          rows.push({ ok, mode, vn, song: s + 1, p });
          (byMode[mode] = byMode[mode] || []).push(ok); (byVar[vn + '｜' + mode] = byVar[vn + '｜' + mode] || []).push(ok);
          if (!ok && process.env.V) console.log(`  错 第${s + 1}段 ${vn} ${mode} 第${p + 1}句`, JSON.stringify(v), '标准', tr.off, tr.shift);
        });
      }
    }
    process.stdout.write('.');
  }
  const rate = a => a.filter(Boolean).length / a.length;
  cents.sort((a, b) => a - b);
  const out = {
    date: new Date().toISOString().slice(0, 10), songs,
    phraseAccuracy: rate(rows.map(r => r.ok)),
    byMode: Object.fromEntries(Object.entries(byMode).map(([k, v]) => [k, +rate(v).toFixed(3)])),
    byVariant: Object.fromEntries(Object.entries(byVar).map(([k, v]) => [k, +rate(v).toFixed(3)])),
    medianCentsErrorOnGoodTakes: cents[cents.length >> 1], p90CentsError: cents[Math.floor(cents.length * 0.9)],
    errors: errs,
  };
  console.log('\n句子级判断正确率：' + (out.phraseAccuracy * 100).toFixed(1) + '%');
  console.log('按模式：', out.byMode);
  Object.entries(out.byVariant).forEach(([k, v]) => console.log('  ' + (v < 0.9 ? '✗ ' : '  ') + k.padEnd(22) + (v * 100).toFixed(0) + '%'));
  console.log(`唱准时的音高误差：中位数 ${out.medianCentsErrorOnGoodTakes?.toFixed(1)} 音分，90% 在 ${out.p90CentsError?.toFixed(1)} 音分以内`);
  if (errs.length) console.log('分析失败：', errs.slice(0, 5));
  if (!QUICK) fs.writeFileSync(__dirname + '/bench_result.json', JSON.stringify(out, null, 1));
  // 关卡：改了算法，快速版成绩不能比记下的基准低（总的低 0.5 个百分点、或任何一项低 5 个百分点就不让合并）
  const BASE = __dirname + '/bench_baseline.json';
  if (process.argv.includes('--save-baseline')) { fs.writeFileSync(BASE, JSON.stringify(out, null, 1)); console.log('已存为基准'); }
  if (GATE) {
    const b = JSON.parse(fs.readFileSync(BASE, 'utf8')), bad = [];
    if (out.phraseAccuracy < b.phraseAccuracy - 0.005) bad.push(`总正确率 ${(b.phraseAccuracy * 100).toFixed(1)}% → ${(out.phraseAccuracy * 100).toFixed(1)}%`);
    Object.entries(b.byVariant).forEach(([k, v]) => { const n = out.byVariant[k]; if (n !== undefined && n < v - 0.05) bad.push(`${k} ${(v * 100).toFixed(0)}% → ${(n * 100).toFixed(0)}%`); });
    if (bad.length) { console.log('✗ 测试集分数下降，不能合并：\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('测试集关卡：通过');
  }
})();
