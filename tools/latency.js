// 实时音高延迟：从“嘴里换了一个音”到“屏幕上的球跟过去”要多久。
// 模拟手机：麦克风每攒够 BLOCK 个采样（48kHz 下）才交给网页一次，网页用 SC.yinAvg 估音高，下一帧画出来。
// 用法：node tools/latency.js [每次交给网页的采样数，默认读 page.html 里的值]
const SC = require('../analysis.js');
const fs = require('fs');
const page = fs.readFileSync(__dirname + '/../page.html', 'utf8');
const m = page.match(/createScriptProcessor\((\d+)/);
const BLOCK48 = +(process.argv[2] || (m ? m[1] : 4096));
const SR = 16000, BLOCK = Math.round(BLOCK48 / 3), FRAME_MS = 1000 / 60;   // 按 60 帧算（最慢的情况）

function tone(seconds, f1, f2, tChange, phase0) {
  const N = Math.floor(seconds * SR), x = new Float32Array(N); let ph = phase0;
  for (let i = 0; i < N; i++) {
    const t = i / SR, f = t < tChange ? f1 : f2;
    ph += 2 * Math.PI * f / SR;
    x[i] = 0.3 * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) * (1 + 0.15 * Math.sin(2 * Math.PI * 5.5 * t));
  }
  return x;
}
const lat = [];
for (let k = 0; k < 40; k++) {
  const steps = [2, -2, 3, -4, 5, 1][k % 6];
  const f1 = 220 * Math.pow(2, (k % 7) / 12), f2 = f1 * Math.pow(2, steps / 12);
  const tChange = 1.0 + (k * 0.0137) % (BLOCK / SR);   // 换音的时刻落在一个块里的不同位置
  const x = tone(2, f1, f2, tChange, k);
  const target = 69 + 12 * Math.log2(f2 / 440);
  for (let end = BLOCK; end <= x.length; end += BLOCK) {
    const t = end / SR; if (t < tChange) continue;
    const f = SC.yinAvg(x.subarray(0, end), SR);
    if (f > 0 && Math.abs(69 + 12 * Math.log2(f / 440) - target) < 0.3) { lat.push((t - tChange) * 1000 + FRAME_MS / 2); break; }
  }
}
lat.sort((a, b) => a - b);
const avg = lat.reduce((a, b) => a + b, 0) / lat.length;
const out = { block48: BLOCK48, avgMs: Math.round(avg), p90Ms: Math.round(lat[Math.floor(lat.length * 0.9)]), maxMs: Math.round(lat[lat.length - 1]) };
console.log(`每次交给网页 ${BLOCK48} 个采样（${(BLOCK48 / 48).toFixed(0)} 毫秒）：平均 ${out.avgMs} 毫秒，90% 在 ${out.p90Ms} 毫秒内，最慢 ${out.maxMs} 毫秒`);
module.exports = out;
