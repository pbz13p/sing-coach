// 把简谱文字做成练习链接：node tools/choir/link.js 谱子.txt
// 会先检查：每小节拍数、各声部总长、标了"没把握"的小节；有问题先列出来
const CH = require('../../choir.js'), fs = require('fs');
const file = process.argv[2]; if (!file) { console.log('用法：node tools/choir/link.js 谱子.txt'); process.exit(1); }
const text = fs.readFileSync(file, 'utf8').trim() + '\n', song = CH.parse(text);
console.log(`《${song.title}》 1=${song.key} ${song.num}/${song.den} 每分钟 ${song.bpm} 拍`);
song.parts.forEach(p => console.log(`  ${p.name}：${p.phrases.length} 句、${p.bars} 小节、${p.notes.filter(n => n.midi != null).length} 个音`));
if (song.warn.length) console.log('⚠ 要检查：\n  ' + song.warn.join('\n  '));
if (song.unsure.length) console.log('？ 读谱没把握的小节：\n  ' + song.unsure.map(u => u.part + ' 第 ' + u.bar + ' 小节').join('\n  '));
CH.encode(text).then(code => { const url = 'https://singokay.com/#c=' + code; console.log('\n链接（' + url.length + ' 个字）：\n' + url + '\n统计编号：' + CH.songId(text)); });
