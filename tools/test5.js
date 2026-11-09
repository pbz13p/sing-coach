// 分数可信度自测：同一遍录音重复分析分数要一样；唱得差不多的两遍（每个音有一点自然的偏差、快慢、噪声不同）
// 总分差距要在 ±3 分内；故意唱差一点要明显掉分。清唱（自己的调）和跟原唱比两种都测。失败退出码 1。
const SC = require('../analysis.js'); const sr = 16000;
const base = [[0,.5],[2,.5],[4,.5],[5,.5],[7,.8],[4,.5],[2,.5],[0,1.0],[null,.5],[7,.5],[9,.5],[7,.5],[4,.5],[5,.5],[2,.5],[0,1.2],[null,.5],[4,.6],[7,.6],[12,1.0],[9,.6],[7,.6],[4,.6],[0,1.2],[null,.6]];
const mel = base.concat(base.map(([d, s]) => [d == null ? null : d + (d === 12 ? -3 : 0), s])); // 两段，约 30 秒
// take: seed 决定这一遍的“自然误差”；err: {音序号: 偏差(半音)}；dev: 每个音随机偏差上限（半音）
function take(o) {
  o = Object.assign({ seed: 1, dev: .08, jit: .04, base: 55, lead: .5, err: {}, noise: .004, vib: 0, amp: 1, bleed: 0 }, o);
  let seed = o.seed * 7919 + 13; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - .5; };
  const total = mel.reduce((s, m) => s + m[1], 0) + o.lead + 1, x = new Float32Array(Math.floor(total * sr));
  let t = o.lead, ph = 0, ni = -1; const truth = [];
  for (const [d, dur0] of mel) {
    const dur = dur0 * (1 + rnd() * 2 * o.jit); if (d === null) { t += dur; continue; } ni++;
    const off = rnd() * 2 * o.dev + (o.err[ni] || 0), s0 = Math.floor(t * sr), s1 = Math.floor((t + dur) * sr);
    truth.push([t, t + dur, o.base + d]);
    for (let s = s0; s < s1; s++) { const tt = (s - s0) / sr, midi = o.base + d + off + o.vib * Math.sin(2 * Math.PI * 5.5 * tt);
      ph += 2 * Math.PI * 440 * Math.pow(2, (midi - 69) / 12) / sr;
      const env = Math.min(1, tt / .04, (dur - tt) / .03); x[s] = env * .3 * o.amp * (Math.sin(ph) + .5 * Math.sin(2 * ph) + .3 * Math.sin(3 * ph) + .15 * Math.sin(4 * ph)); }
    t += dur; }
  for (let s = 0; s < x.length; s++) x[s] += o.noise * rnd();
  if (o.bleed) for (let s = 0; s < x.length; s++) { const tt = s / sr, ch = Math.floor(tt / 2) % 2 ? [53, 57, 60] : [48, 52, 55]; // 外放伴奏漏进麦克风：两个和弦轮流
    for (const m of ch) x[s] += o.bleed * Math.sin(2 * Math.PI * 440 * Math.pow(2, (m - 69) / 12) * tt) / 3; }
  x.truth = truth; x.total = total; return x;
}
// 原唱旋律（20ms 一帧），按标准节奏
const ref = (() => { const H = 0.02, total = mel.reduce((s, m) => s + m[1], 0) + 1.5, midi = new Float32Array(Math.ceil(total / H)).fill(NaN); let t = .5;
  for (const [d, dur] of mel) { if (d !== null) for (let j = Math.ceil(t / H); j < (t + dur - .02) / H; j++) midi[j] = 55 + d; t += dur; }
  return { hopS: H, midi, duration: total }; })();
let bad = 0; const check = (name, ok, info) => { console.log((ok ? "通过 " : "失败 ") + name + (info ? "  " + info : "")); if (!ok) bad++; };
const score = async (x, withRef) => { const r = await SC.analyze(x, sr); if (r.error) return NaN; if (withRef) SC.compareWithRef(r, ref, "sync"); return r.stats.score; };
const spread = a => Math.max(...a) - Math.min(...a);
(async () => {
  for (const withRef of [false, true]) {
    const tag = withRef ? "【跟原唱比】" : "【清唱】";
    const x1 = take({ seed: 1 });
    const a = await score(x1, withRef), b = await score(x1, withRef);
    check(tag + "同一遍录音分析两次：分数一样", a === b, a + " / " + b);
    const same = []; for (let s = 1; s <= 6; s++) same.push(await score(take({ seed: s }), withRef));
    check(tag + "唱得差不多的 6 遍：分数差距在 3 分内", spread(same) <= 3, same.join(" "));
    const mid = []; for (let s = 1; s <= 6; s++) mid.push(await score(take({ seed: s, dev: .35, jit: .08 }), withRef));
    const mm = mid.reduce((s, v) => s + v, 0) / mid.length;
    check(tag + "唱得一般（每个音随便偏 ±35 音分）的 6 遍：都在平均分 ±3 分内", mid.every(v => Math.abs(v - mm) <= 3), mid.join(" ") + "（平均 " + mm.toFixed(1) + "）");
    const vib = []; for (let s = 1; s <= 4; s++) vib.push(await score(take({ seed: s, vib: .3 }), withRef));
    check(tag + "带颤音唱得差不多的 4 遍：分数差距在 3 分内", spread(vib) <= 3, vib.join(" "));
    // 真实情况：离手机远近不同（声音大小）、屋里有点杂音，同一种唱法分数不能乱跳
    const env = []; for (const v of [{}, { amp: .3 }, { amp: 1.6 }, { noise: .03 }, { amp: .4, noise: .02 }]) env.push(await score(take(Object.assign({ seed: 3, dev: .35 }, v)), withRef));
    check(tag + "离手机远近不同、屋里有点杂音：分数差距在 3 分内", spread(env) <= 3, env.join(" "));
    const bl = []; for (const v of [0, .03, .06]) bl.push(await score(take({ seed: 3, dev: .35, bleed: v }), withRef));
    check(tag + "没戴耳机、伴奏漏进麦克风一点：分数差距在 3 分内", spread(bl) <= 3, bl.join(" "));
    const lead = []; for (const l of [.3, .45, .62]) lead.push(await score(take({ seed: 2, lead: withRef ? .5 : l }), withRef));
    check(tag + "开口早晚差一点：分数差距在 3 分内", spread(lead) <= 3, lead.join(" "));
    const good = Math.round(same.reduce((s, v) => s + v, 0) / same.length);
    check(tag + "唱准的时候分数高（≥85，鼓励为主）", Math.min(...same) >= 85, "平均 " + good);
    const err = {}; [4, 7, 15, 19, 23, 30].forEach((k, i) => err[k] = i % 2 ? -.55 : .55); // 6 个音唱偏 55 音分
    const worse = []; for (let s = 1; s <= 3; s++) worse.push(await score(take({ seed: s, err }), withRef));
    const drop = good - Math.max(...worse);
    check(tag + "6 个音唱偏半个音：明显掉分（至少 8 分）", drop >= 8, "唱准 " + good + " → 唱偏 " + worse.join(" "));
    const err2 = {}; for (let k = 0; k < 40; k += 3) err2[k] = (k % 2 ? -1 : 1) * .55;
    const worst = await score(take({ seed: 1, err: err2 }), withRef);
    check(tag + "更多音唱偏：分数更低", worst < Math.min(...worse), "唱偏 " + Math.max(...worse) + " → 更多唱偏 " + worst);
  }
  console.log(bad ? "有 " + bad + " 项失败" : "全部通过"); process.exit(bad ? 1 : 0);
})();
