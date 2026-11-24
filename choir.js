// ===== 合唱团声部练习 =====
// 简谱文字格式（一行 = 一句，方括号开始一个声部）：
//   歌名：欢乐颂（试点）
//   调：1=D        （1 是哪个音；中音区 1 落在 C4～B4 之间）
//   拍：4/4
//   速度：72       （每分钟几拍，拍按拍号的分母算）
//   [女高]
//   3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3. 2_ 2 - |
//   [男低 低八度]  （男声按高音谱写、实际低八度唱时加"低八度"）
// 音：0～7（0 是休止），前面可加 # 或 b；后面 ' 高八度、, 低八度（可重复）；
//     _ 时值减半（__ 再减半），. 附点（×1.5）。
// -  前一个音再延长一拍     v  换气（不占时间，前一个音提前收一点）
// |  小节线（检查拍数用）    |? 这一小节读谱时没把握（会列出来问人）
// #  开头的行是备注
(function (root) {
  const DEG = [0, 2, 4, 5, 7, 9, 11];
  const TONIC = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };

  function parse(text) {
    const song = { title: "", key: "C", tonic: 60, num: 4, den: 4, bpm: 72, parts: [], warn: [], unsure: [] };
    let part = null, lineNo = 0;
    for (let raw of String(text).split(/\r?\n/)) {
      lineNo++;
      const line = raw.replace(/\s+$/, "");
      if (!line.trim() || /^\s*#/.test(line)) continue;
      let m;
      if ((m = line.match(/^\s*歌名\s*[:：]\s*(.+)$/))) { song.title = m[1].trim(); continue; }
      if ((m = line.match(/^\s*调\s*[:：]\s*1\s*=\s*([#b]?)([A-G])\s*$/i))) {
        const L = m[2].toUpperCase(); song.key = (m[1] || "") + L;
        let t = TONIC[L] + (m[1] === "#" ? 1 : m[1] === "b" ? -1 : 0);
        if (t > 71) t -= 12; if (t < 60) t += 12; song.tonic = t; continue;
      }
      if ((m = line.match(/^\s*拍\s*[:：]\s*(\d+)\s*\/\s*(\d+)\s*$/))) { song.num = +m[1]; song.den = +m[2]; continue; }
      if ((m = line.match(/^\s*速度\s*[:：]\s*(\d+)\s*$/))) { song.bpm = +m[1]; continue; }
      if ((m = line.match(/^\s*\[([^\]]+)\]\s*$/))) {
        const nm = m[1].trim(), oct = /低八度/.test(nm) ? -12 : /高八度/.test(nm) ? 12 : 0;
        part = { name: nm.replace(/\s*(低八度|高八度)\s*/, "").trim(), oct, phrases: [] }; song.parts.push(part); continue;
      }
      if (!part) { song.warn.push(`第 ${lineNo} 行：还没写 [声部] 就出现了音符`); continue; }
      part.phrases.push({ src: line.trim(), line: lineNo });
    }
    // 把每一句拆成音符，算时值，按小节核对拍数
    for (const p of song.parts) {
      let bar = 1, inBar = 0, first = true;
      p.notes = []; // {deg, midi|null(休止), beats, phrase, bar, breath}
      p.phrases.forEach((ph, pi) => {
        const toks = ph.src.split(/\s+/).filter(Boolean);
        for (const tk of toks) {
          if (tk === "|" || tk === "|?" || tk === "||") {
            if (tk === "|?") song.unsure.push({ part: p.name, bar });
            if (Math.abs(inBar - song.num) > 1e-6 && !(first && inBar < song.num)) song.warn.push(`${p.name} 第 ${bar} 小节是 ${+inBar.toFixed(2)} 拍，应该是 ${song.num} 拍`);
            if (inBar > 0) { bar++; first = false; } inBar = 0; continue;
          }
          if (tk === "v" || tk === "V") { if (p.notes.length) p.notes[p.notes.length - 1].breath = true; continue; }
          if (tk === "-") {
            const last = p.notes[p.notes.length - 1];
            if (!last) { song.warn.push(`${p.name} 第 ${bar} 小节开头的 - 前面没有音`); continue; }
            last.beats += 1; inBar += 1; continue;
          }
          const mm = tk.match(/^([#b]?)([0-7])([',]*)(_*)(\.?)$/);
          if (!mm) { song.warn.push(`${p.name} 第 ${ph.line} 行看不懂「${tk}」`); continue; }
          const d = +mm[2];
          let beats = Math.pow(0.5, mm[4].length) * (mm[5] ? 1.5 : 1);
          let midi = null;
          if (d > 0) {
            midi = song.tonic + DEG[d - 1] + (mm[1] === "#" ? 1 : mm[1] === "b" ? -1 : 0) + p.oct;
            for (const c of mm[3]) midi += c === "'" ? 12 : -12;
          }
          p.notes.push({ midi, beats, phrase: pi, bar });
          inBar += beats;
        }
        if (p.notes.length) p.notes[p.notes.length - 1].breath = true; // 一句完了就换气
      });
      if (inBar > 1e-6 && Math.abs(inBar - song.num) > 1e-6) song.warn.push(`${p.name} 最后一小节是 ${+inBar.toFixed(2)} 拍`);
      p.bars = bar - (inBar > 1e-6 ? 0 : 1);
      p.beats = p.notes.reduce((s, n) => s + n.beats, 0);
    }
    const lens = song.parts.map(p => p.beats);
    if (lens.length > 1 && Math.max(...lens) - Math.min(...lens) > 1e-6) song.warn.push("各声部总拍数不一样：" + song.parts.map(p => p.name + " " + p.beats + " 拍").join("，"));
    return song;
  }

  const beatS = song => 60 / song.bpm;
  const countInS = song => song.num * beatS(song); // 先打一小节拍子，再开始

  // 一个声部 → App 的参考旋律（和导入 mp3 算出来的一样：每 20 毫秒一个音高，没声音是 NaN）
  // range：只练其中几句时 [第一句, 最后一句]
  function toMelody(song, pi, range) {
    const p = song.parts[pi], hopS = 0.02, bs = beatS(song);
    const ev = timeline(song, p, range);
    const dur = ev.end + 1.0, n = Math.ceil(dur / hopS), midi = new Float64Array(n).fill(NaN);
    for (const e of ev.notes) {
      if (e.midi == null) continue;
      const a = Math.round(e.t0 / hopS), b = Math.round((e.t1 - (e.breath ? 0.12 : 0.03)) / hopS);
      for (let i = a; i < b && i < n; i++) midi[i] = e.midi;
    }
    return { hopS, midi, duration: dur, notes: ev.notes, phrases: ev.phrases, countIn: ev.t0, bs };
  }
  function timeline(song, p, range) {
    const bs = beatS(song), lo = range ? range[0] : 0, hi = range ? range[1] : 1e9;
    let t = countInS(song); const notes = [], phrases = [];
    for (const nt of p.notes) {
      if (nt.phrase < lo || nt.phrase > hi) continue;
      const d = nt.beats * bs;
      notes.push({ midi: nt.midi, t0: t, t1: t + d, breath: !!nt.breath, phrase: nt.phrase });
      const ph = phrases[phrases.length - 1];
      if (!ph || ph.idx !== nt.phrase) phrases.push({ idx: nt.phrase, t0: t, t1: t + d }); else ph.t1 = t + d;
      t += d;
    }
    return { notes, phrases, end: t, t0: countInS(song) };
  }

  // 合成声音：自己的声部响、其他声部小声（others=0 就不放）；开头一小节"嗒嗒嗒嗒"打拍子
  function synth(song, pi, others, sr, range, mine) {
    if (mine == null) mine = 1;
    sr = sr || 22050;
    const bs = beatS(song), tl = song.parts.map(p => timeline(song, p, range));
    const end = Math.max(...tl.map(x => x.end)) + 1.0, out = new Float32Array(Math.ceil(end * sr));
    for (let b = 0; b < song.num; b++) { // 打拍子：第一拍重
      const s0 = Math.round(b * bs * sr), f = b ? 1200 : 1800, L = Math.round(0.05 * sr);
      for (let i = 0; i < L && s0 + i < out.length; i++) out[s0 + i] += 0.35 * Math.sin(2 * Math.PI * f * i / sr) * Math.exp(-i / (0.012 * sr));
    }
    tl.forEach((ev, k) => {
      const g = k === pi ? mine * 0.32 : others * 0.32;
      if (g <= 0) return;
      for (const e of ev.notes) {
        if (e.midi == null) continue;
        const f0 = 440 * Math.pow(2, (e.midi - 69) / 12);
        const t1 = e.t1 - (e.breath ? 0.12 : 0.03), n0 = Math.round(e.t0 * sr), n1 = Math.round(t1 * sr);
        let ph = 0;
        for (let i = n0; i < n1 && i < out.length; i++) {
          const tt = (i - n0) / sr, left = (n1 - i) / sr;
          const env = Math.min(1, tt / 0.04) * Math.min(1, left / 0.06);
          const vib = tt > 0.35 ? 1 + 0.004 * Math.sin(2 * Math.PI * 5 * tt) : 1; // 长音带一点颤音，像人唱
          ph += 2 * Math.PI * f0 * vib / sr;
          // "呜"的音色：基音为主，几个泛音
          out[i] += g * env * (Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.22 * Math.sin(3 * ph) + 0.1 * Math.sin(4 * ph)) / 1.77;
        }
      }
    });
    let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v));
    if (pk > 0.95) for (let i = 0; i < out.length; i++) out[i] *= 0.95 / pk;
    return { data: out, sr };
  }

  // ===== 放进链接：文字 → (压缩) → base64url。"t" 开头没压缩，"z" 开头是 deflate-raw =====
  const b64u = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const unb64u = str => { const s = atob(str.replace(/-/g, "+").replace(/_/g, "/")); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };

  // 小型解压（deflate-raw），不依赖浏览器自带功能：老手机、安卓微信里也能打开
  function inflate(src) {
    let pos = 0, bit = 0, bc = 0; const out = [];
    const bits = n => { while (bc < n) { if (pos >= src.length) throw new Error("eof"); bit |= src[pos++] << bc; bc += 8; } const v = bit & ((1 << n) - 1); bit >>>= n; bc -= n; return v; };
    function build(lens) { const cnt = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(lens.length);
      for (const l of lens) cnt[l]++; cnt[0] = 0; for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + cnt[i - 1];
      lens.forEach((l, s) => { if (l) sym[offs[l]++] = s; }); return { cnt, sym }; }
    function dec(h) { let code = 0, first = 0, idx = 0; for (let l = 1; l < 16; l++) { code |= bits(1); const c = h.cnt[l]; if (code - c < first) return h.sym[idx + code - first]; idx += c; first += c; first <<= 1; code <<= 1; } throw new Error("huff"); }
    const LB = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258], LE = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
    const DB_ = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577], DE = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
    let last = 0;
    while (!last) {
      last = bits(1); const type = bits(2);
      if (type === 0) { bit = 0; bc = 0; const len = src[pos] | src[pos + 1] << 8; pos += 4; for (let i = 0; i < len; i++) out.push(src[pos++]); continue; }
      let lit, dist;
      if (type === 1) { const l = new Array(288).fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288); lit = build(l); dist = build(new Array(30).fill(5)); }
      else if (type === 2) {
        const hl = bits(5) + 257, hd = bits(5) + 1, hc = bits(4) + 4, ord = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15], cl = new Array(19).fill(0);
        for (let i = 0; i < hc; i++) cl[ord[i]] = bits(3);
        const ch = build(cl), ls = [];
        while (ls.length < hl + hd) { const sy = dec(ch);
          if (sy < 16) ls.push(sy); else if (sy === 16) { const p = ls[ls.length - 1], r = 3 + bits(2); for (let i = 0; i < r; i++) ls.push(p); }
          else if (sy === 17) { const r = 3 + bits(3); for (let i = 0; i < r; i++) ls.push(0); } else { const r = 11 + bits(7); for (let i = 0; i < r; i++) ls.push(0); } }
        lit = build(ls.slice(0, hl)); dist = build(ls.slice(hl));
      } else throw new Error("type");
      for (;;) { const sy = dec(lit); if (sy < 256) out.push(sy); else if (sy === 256) break;
        else { const k = sy - 257, len = LB[k] + bits(LE[k]), dk = dec(dist), d = DB_[dk] + bits(DE[dk]); const st = out.length - d; for (let i = 0; i < len; i++) out.push(out[st + i]); } }
    }
    return new Uint8Array(out);
  }
  async function pipe(bytes, Stream, fmt) { const r = new Response(new Blob([bytes]).stream().pipeThrough(new Stream(fmt))); return new Uint8Array(await r.arrayBuffer()); }
  async function encode(text) {
    const raw = new TextEncoder().encode(text);
    if (typeof CompressionStream !== "undefined") { try { return "z" + b64u(await pipe(raw, CompressionStream, "deflate-raw")); } catch (e) {} }
    return "t" + b64u(raw);
  }
  async function decode(code) {
    const kind = code[0], bytes = unb64u(code.slice(1));
    if (kind === "t") return new TextDecoder().decode(bytes);
    if (kind === "z") {
      return new TextDecoder().decode(inflate(bytes));
    }
    throw new Error("bad");
  }
  // 链接的短编号（统计用）：歌名 + 内容的小指纹，同一份谱子永远是同一个号
  function songId(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  const CH = { inflate, parse, toMelody, synth, encode, decode, songId, countInS, beatS };
  if (typeof module !== "undefined") module.exports = CH; else root.CH = CH;
})(typeof window !== "undefined" ? window : globalThis);
