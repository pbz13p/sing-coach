// 把某个声部"唱"成 wav，给浏览器走查当假麦克风：node tools/choir/mkwav.js 谱子.txt 声部序号 输出.wav
const { sing } = require('../choir_bench.js'), fs = require('fs');
const pi = +process.argv[3] || 0, out = process.argv[4] || '/tmp/choir_sing.wav';
const { x } = sing(pi, { off: {}, seed: 7 }), N = x.length, b = Buffer.alloc(44 + N * 2);
b.write('RIFF', 0); b.writeUInt32LE(36 + N * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
fs.writeFileSync(out, b); console.log('写好了', out, (N / 16000).toFixed(1) + ' 秒');
