// ===== 练歌小老师 · 分析核心 =====
const SC = (() => {
  const PC_NAMES = ["C", "♭D", "D", "♭E", "E", "F", "♯F", "G", "♭A", "A", "♭B", "B"];
  const JP = { 0: "1", 1: "♯1", 2: "2", 3: "♭3", 4: "3", 5: "4", 6: "♯4", 7: "5", 8: "♭6", 9: "6", 10: "♭7", 11: "7" };
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const KMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KMIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const tick = () => new Promise(r => setTimeout(r, 0));
  const median = a => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const pct = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
  const mod12 = v => ((v % 12) + 12) % 12;
  const noteName = m => { const r = Math.round(m); return PC_NAMES[mod12(r)] + (Math.floor(r / 12) - 1); };

  // ---------- 1. 音高追踪 (YIN) ----------
  async function trackPitch(x, sr, onProgress) {
    const hop = Math.round(sr * 0.012), W = 400;
    const tauMin = Math.floor(sr / 900), tauMax = Math.ceil(sr / 70);
    const n = Math.max(0, Math.floor((x.length - W - tauMax - 2) / hop));
    const f0 = new Float32Array(n), rms = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0; const o = i * hop;
      for (let j = 0; j < W; j++) s += x[o + j] * x[o + j];
      rms[i] = Math.sqrt(s / W);
    }
    const rs = Array.from(rms);
    const peak = pct(rs, 0.98), floor = pct(rs, 0.1);
    const gate = Math.max(floor * 2.5, peak * 0.05, 1e-4);
    const d = new Float64Array(tauMax + 2), cm = new Float64Array(tauMax + 2);
    for (let i = 0; i < n; i++) {
      if (i % 400 === 0) { onProgress && onProgress(i / n); await tick(); }
      if (rms[i] < gate) continue;
      const o = i * hop;
      for (let tau = 1; tau <= tauMax + 1; tau++) {
        let s = 0;
        for (let j = 0; j < W; j++) { const df = x[o + j] - x[o + j + tau]; s += df * df; }
        d[tau] = s;
      }
      let run = 0; cm[0] = 1;
      for (let tau = 1; tau <= tauMax + 1; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
      let t = -1;
      for (let tau = tauMin; tau <= tauMax; tau++) {
        if (cm[tau] < 0.15) { while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau++; t = tau; break; }
      }
      if (t < 0) {
        let best = tauMin;
        for (let tau = tauMin; tau <= tauMax; tau++) if (cm[tau] < cm[best]) best = tau;
        if (cm[best] < 0.3) t = best;
      }
      if (t < 0) continue;
      const a = cm[t - 1], b = cm[t], c = cm[t + 1];
      const den = a - 2 * b + c;
      const shift = den !== 0 ? Math.max(-1, Math.min(1, (a - c) / (2 * den))) : 0;
      f0[i] = sr / (t + shift);
    }
    onProgress && onProgress(1);
    return { f0, rms, hop: hop / sr };
  }

  // ---------- 2. 清理音高曲线 ----------
  function cleanMidi(f0) {
    const n = f0.length, m = new Float64Array(n).fill(NaN);
    for (let i = 0; i < n; i++) if (f0[i] > 0) m[i] = 69 + 12 * Math.log2(f0[i] / 440);
    // 八度纠错
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        if (isNaN(m[i])) continue;
        const nb = [];
        for (let k = Math.max(0, i - 25); k <= Math.min(n - 1, i + 25); k++) if (!isNaN(m[k])) nb.push(m[k]);
        const ref = median(nb), df = m[i] - ref;
        if (df > 9) m[i] -= 12; else if (df < -9) m[i] += 12;
      }
    }
    // 5 点中值滤波
    const out = new Float64Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      if (isNaN(m[i])) continue;
      const nb = [];
      for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < n && !isNaN(m[k])) nb.push(m[k]);
      out[i] = median(nb);
    }
    // 去掉过短的发声段 (<60ms)
    let i = 0;
    while (i < n) {
      if (isNaN(out[i])) { i++; continue; }
      let j = i; while (j < n && !isNaN(out[j])) j++;
      if (j - i < 5) for (let k = i; k < j; k++) out[k] = NaN;
      i = j;
    }
    return out;
  }

  // ---------- 3. 局部基准（无伴奏时按自己的调判断） ----------
  function localOffset(m, rms, hopS) {
    const n = m.length, C = new Float64Array(n + 1), S = new Float64Array(n + 1), Wt = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      let c = 0, s = 0, w = 0;
      if (!isNaN(m[i]) && i > 0 && !isNaN(m[i - 1]) && Math.abs(m[i] - m[i - 1]) < 0.12) {
        const fr = m[i] - Math.round(m[i]);
        w = rms[i]; c = w * Math.cos(2 * Math.PI * fr); s = w * Math.sin(2 * Math.PI * fr);
      }
      C[i + 1] = C[i] + c; S[i + 1] = S[i] + s; Wt[i + 1] = Wt[i] + w;
    }
    const gAng = Math.atan2(S[n], C[n]) / (2 * Math.PI);
    const half = Math.round(6 / hopS);
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - half), b = Math.min(n, i + half);
      const cc = C[b] - C[a], ss = S[b] - S[a], ww = Wt[b] - Wt[a];
      raw[i] = (ww > 0 && Math.hypot(cc, ss) > 0.15 * ww) ? Math.atan2(ss, cc) / (2 * Math.PI) : gAng;
    }
    // 展开（允许越唱越低超过半个半音）
    const off = new Float64Array(n); off[0] = raw[0];
    for (let i = 1; i < n; i++) {
      let v = raw[i];
      while (v - off[i - 1] > 0.5) v -= 1;
      while (v - off[i - 1] < -0.5) v += 1;
      off[i] = v;
    }
    return { off, global: gAng };
  }

  // ---------- 4. 切分音符 ----------
  function segment(p, hopS) {
    const n = p.length, notes = [];
    let cur = null, cand = null, candN = 0, candStart = 0, gap = 0;
    const close = () => { if (cur && (cur.end - cur.start + 1) * hopS >= 0.14) notes.push(cur); cur = null; cand = null; candN = 0; };
    for (let i = 0; i < n; i++) {
      if (isNaN(p[i])) { gap++; if (gap > 3) close(); continue; }
      gap = 0;
      const q = Math.round(p[i]);
      if (!cur) { cur = { q, start: i, end: i }; continue; }
      if (q === cur.q) { cur.end = i; candN = 0; cand = null; continue; }
      if (q === cand) candN++; else { cand = q; candN = 1; candStart = i; }
      if (candN >= 4) { cur.end = candStart - 1; const nq = cand; close(); cur = { q: nq, start: candStart, end: i }; }
    }
    close();
    return notes;
  }

  function detectKey(notes, hopS) {
    const h = new Array(12).fill(0);
    notes.forEach(nt => h[mod12(nt.q)] += (nt.end - nt.start + 1) * hopS);
    const corr = (prof, rot) => {
      const a = h, b = prof.map((_, k) => prof[mod12(k - rot)]);
      const ma = mean(a), mb = mean(b);
      let num = 0, da = 0, db = 0;
      for (let k = 0; k < 12; k++) { num += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; }
      return num / Math.sqrt(da * db || 1);
    };
    let best = { r: -2 };
    for (let t = 0; t < 12; t++) {
      const r1 = corr(KMAJ, t); if (r1 > best.r) best = { r: r1, tonic: t, minor: false };
      const r2 = corr(KMIN, t); if (r2 > best.r) best = { r: r2, tonic: t, minor: true };
    }
    best.majorTonic = best.minor ? mod12(best.tonic + 3) : best.tonic;
    return best;
  }

  // ---------- 5. 主分析 ----------
  async function analyze(x, sr, onProgress) {
    const tr = await trackPitch(x, sr, onProgress);
    const hopS = tr.hop, n = tr.f0.length;
    const m = cleanMidi(tr.f0);
    const { off, global } = localOffset(m, tr.rms, hopS);
    const p = new Float64Array(n);
    for (let i = 0; i < n; i++) p[i] = m[i] - off[i];
    let voicedN = 0; for (let i = 0; i < n; i++) if (!isNaN(m[i])) voicedN++;
    if (voicedN * hopS < 4) return { error: "short", voicedSec: voicedN * hopS };

    const raw = segment(p, hopS);
    if (raw.length < 5) return { error: "few" };
    const key = detectKey(raw, hopS);
    const qMed = median(raw.map(r => r.q));
    let refTonic = Math.floor(qMed); while (mod12(refTonic) !== key.majorTonic) refTonic--;
    if (qMed - refTonic > 8) refTonic += 12; // 让中音区包住大部分音

    const owner = new Int32Array(n).fill(-1);
    raw.forEach((r, k) => { for (let i = r.start; i <= r.end; i++) owner[i] = k; });
    const notes = raw.map((r, k) => {
      const frames = []; for (let i = r.start; i <= r.end; i++) if (!isNaN(p[i])) frames.push(i);
      const L = frames.length, dur = (r.end - r.start + 1) * hopS;
      const aN = Math.min(7, Math.floor(L * 0.2)), tN = Math.min(7, Math.floor(L * 0.2));
      const mid = frames.slice(aN, L - tN).map(i => p[i]);
      const center = median(mid.length >= 3 ? mid : frames.map(i => p[i]));
      const q = Math.round(center), dev = (center - q) * 100;
      const cents = mid.map(v => (v - center) * 100);
      // 去趋势后看抖动
      let slope = 0;
      if (cents.length > 4) {
        const xs = cents.map((_, k) => k * hopS), mx = mean(xs), my = mean(cents);
        let nu = 0, de = 0; xs.forEach((xv, k) => { nu += (xv - mx) * (cents[k] - my); de += (xv - mx) ** 2; });
        slope = de ? nu / de : 0;
      }
      const det = cents.map((c, k) => c - slope * (k * hopS - (cents.length - 1) * hopS / 2));
      const sd = std(det);
      let zc = 0; for (let k = 1; k < det.length; k++) if ((det[k] > 0) !== (det[k - 1] > 0)) zc++;
      const midDur = cents.length * hopS;
      const rate = midDur > 0 ? zc / 2 / midDur : 0;
      const vibrato = midDur > 0.4 && rate >= 4 && rate <= 8 && sd >= 12 && sd <= 70;
      const atk = frames.slice(0, aN).map(i => p[i]), tl = frames.slice(L - tN).map(i => p[i]);
      // 起音前、收尾后不属于任何音符的滑音帧
      const pre = []; for (let i = r.start - 1; i >= Math.max(0, r.start - 12); i--) { if (isNaN(p[i]) || owner[i] >= 0) break; pre.push(p[i]); }
      const post = []; for (let i = r.end + 1; i <= Math.min(n - 1, r.end + 14); i++) { if (isNaN(p[i]) || owner[i] >= 0) break; post.push(p[i]); }
      const prev = k > 0 && raw[k - 1].end >= r.start - 15 ? raw[k - 1].q : null;
      const next = k < raw.length - 1 && raw[k + 1].start <= r.end + 15 ? raw[k + 1].q : null;
      const atkAll = pre.concat(atk), tlAll = tl.concat(post);
      const scoop = dur > 0.25 && atkAll.length >= 3 && Math.min(...atkAll) < center - 0.6 && (prev === null || prev >= center - 0.5) ;
      const tailDrop = dur > 0.25 && tlAll.length >= 3 && Math.min(...tlAll.slice(-6)) < center - 0.6 && (next === null || next >= center - 0.5);
      const drift = dur > 0.7 ? slope * midDur : 0;
      const rel = mod12(q - key.majorTonic);
      const octave = Math.floor((q - refTonic) / 12);
      const absMidi = center + off[r.start + (r.end - r.start >> 1)];
      return {
        t0: r.start * hopS, t1: (r.end + 1) * hopS, dur, q, center, dev, sd, vibrato, scoop, tailDrop, drift,
        rel, octave, jp: JP[rel], inScale: MAJOR.includes(rel), absMidi,
        rms: mean(frames.map(i => tr.rms[i])),
      };
    });

    const res = { globalOff: global, hopS, duration: n * hopS, m, p, off, notes, refTonic, key, keyName: "1=" + PC_NAMES[key.majorTonic], keyConf: key.r, voicedN, mode: "self" };
    summarize(res);
    return res;
  }

  function summarize(res) {
    const { notes, hopS, n0 } = res;
    const m = res.m, off = res.off, n = m.length, voicedN = res.voicedN, key = res.key;
    // 乐句
    const phrases = [];
    let ph = null;
    notes.forEach(nt => {
      if (!ph || nt.t0 - ph.t1 > 0.35) { ph = { t0: nt.t0, t1: nt.t1, notes: [nt] }; phrases.push(ph); }
      else { ph.t1 = nt.t1; ph.notes.push(nt); }
    });
    phrases.forEach(f => {
      const last = f.notes[f.notes.length - 1];
      const medR = median(f.notes.map(z => z.rms));
      f.dur = f.t1 - f.t0;
      f.weakEnd = f.dur > 2 && f.notes.length >= 3 && (last.tailDrop || last.dev < -28) && last.rms < medR * 0.7;
      f.flatEnd = last.dur > 0.3 && (last.tailDrop || last.dev < -28);
    });

    // 统计
    const totDur = notes.reduce((s, z) => s + z.dur, 0);
    const good = notes.filter(z => !z.wrong && Math.abs(z.dev) <= 25).reduce((s, z) => s + z.dur, 0);
    const okish = notes.filter(z => !z.wrong && Math.abs(z.dev) <= 40).reduce((s, z) => s + z.dur, 0);
    const accuracy = good / totDur;
    const wMean = (arr, f) => { const w = arr.reduce((s, z) => s + z.dur, 0); return w ? arr.reduce((s, z) => s + f(z) * z.dur, 0) / w : 0; };
    const meanDev = wMean(notes, z => z.dev);
    const meanAbs = wMean(notes, z => Math.abs(z.dev));
    const absList = notes.map(z => z.absMidi);
    const hiCut = pct(absList, 0.75), loCut = pct(absList, 0.25);
    const hiNotes = notes.filter(z => z.absMidi >= hiCut), loNotes = notes.filter(z => z.absMidi <= loCut);
    const hiDev = wMean(hiNotes, z => z.dev), loDev = wMean(loNotes, z => z.dev);
    const longN = notes.filter(z => z.dur > 0.25);
    const scoopRate = longN.length ? longN.filter(z => z.scoop).length / longN.length : 0;
    const sustain = notes.filter(z => z.dur > 0.45 && !z.vibrato);
    const unstable = sustain.filter(z => z.sd > 22);
    const unstableRate = sustain.length ? unstable.length / sustain.length : 0;
    const vibratoRate = notes.filter(z => z.dur > 0.45).length ? notes.filter(z => z.vibrato).length / notes.filter(z => z.dur > 0.45).length : 0;
    const driftNotes = notes.filter(z => z.dur > 0.7 && Math.abs(z.drift) > 30);
    const multiPh = phrases.filter(f => f.dur > 2 && f.notes.length >= 3);
    const flatEndRate = multiPh.length ? multiPh.filter(f => f.flatEnd).length / multiPh.length : 0;
    const weakEndRate = multiPh.length ? multiPh.filter(f => f.weakEnd).length / multiPh.length : 0;
    // 整体越唱越高/低
    const vIdx = []; for (let i = 0; i < n; i++) if (!isNaN(m[i])) vIdx.push(i);
    const k15 = Math.floor(vIdx.length * 0.15);
    const offStart = median(vIdx.slice(0, k15).map(i => off[i]));
    const offEnd = median(vIdx.slice(-k15).map(i => off[i]));
    const songDrift = (offEnd - offStart) * 100;
    const outKey = res.mode === "self" ? notes.filter(z => !z.inScale && z.dur > 0.3) : [];
    const rmsDb = notes.map(z => 20 * Math.log10(z.rms + 1e-9));
    const dynRange = pct(rmsDb, 0.9) - pct(rmsDb, 0.1);

    // 问题点
    notes.forEach(z => {
      const iss = [];
      if (z.wrong) iss.push("错音");
      else if (Math.abs(z.dev) > 25) iss.push(z.dev > 0 ? "高" : "低");
      if (res.mode === "self" && !z.inScale && z.dur > 0.3) iss.push("调外");
      if (z.lag !== undefined && z.dur > 0.2) { if (z.lag > 0.28) iss.push("慢"); else if (z.lag < -0.28) iss.push("快"); }
      if (z.scoop) iss.push("勾");
      if (z.tailDrop) iss.push("尾掉");
      if (z.dur > 0.45 && !z.vibrato && z.sd > 22) iss.push("抖");
      if (Math.abs(z.drift) > 30) iss.push(z.drift < 0 ? "长音往下" : "长音往上");
      z.issues = iss;
      z.sev = (Math.max(0, Math.abs(z.dev) - 20) + (iss.includes("调外") ? 35 : 0) + (z.wrong ? 60 : 0) + (iss.includes("慢") || iss.includes("快") ? 18 : 0) + (z.scoop ? 15 : 0) + (z.tailDrop ? 15 : 0) + (iss.includes("抖") ? 15 : 0)) * Math.min(1.5, z.dur + 0.3);
    });
    const ranked = notes.filter(z => z.sev > 8).sort((a, b) => b.sev - a.sev);
    const spots = [];
    for (const z of ranked) {
      const rhythmOnly = z.issues.every(x => x === "慢" || x === "快");
      if (spots.some(s => Math.abs(s.t0 - z.t0) < 0.9 || (rhythmOnly && s.issues.some(x => x === "慢" || x === "快") && Math.abs(s.t0 - z.t0) < 4))) continue;
      spots.push(z); if (spots.length >= 6) break;
    }
    // 拖拍/抢拍：指向这一段开始的那个音
    for (let q = 0; q < spots.length; q++) {
      const z = spots[q]; if (!z.issues.every(x => x === "慢" || x === "快")) continue;
      const tag = z.issues[0]; let k = notes.indexOf(z);
      while (k > 0 && notes[k - 1].issues.includes(tag) && z.t0 - notes[k - 1].t0 < 4 && notes[k].t0 - notes[k - 1].t1 < 1.5) k--;
      if (!spots.includes(notes[k])) spots[q] = notes[k];
    }
    spots.sort((a, b) => a.t0 - b.t0);

    const stabScore = 1 - Math.min(1, unstableRate * 1.2);
    const score = Math.round(100 * (0.6 * accuracy + 0.15 * (okish / totDur) + 0.15 * stabScore + 0.1 * (1 - flatEndRate)));

    res.phrases = phrases; res.spots = spots;
    res.stats = {
        score, accuracy, okRate: okish / totDur, meanDev, meanAbs, hiDev, loDev,
        hiCutName: noteName(hiCut), range: [noteName(pct(absList, 0.05)), noteName(pct(absList, 0.95))],
        scoopRate, unstableRate, vibratoRate, driftNoteCount: driftNotes.length,
        flatEndRate, weakEndRate, songDrift, outKeyCount: outKey.length,
        noteCount: notes.length, phraseCount: phrases.length, dynRange,
        voicedSec: voicedN * hopS, tuningVsA440: (res.globalOff || 0) * 100,
        wrongCount: notes.filter(z => z.wrong).length, refCover: notes.filter(z => z.refDev !== undefined).length / Math.max(1, notes.length),
        lateCount: notes.filter(z => z.issues.includes("慢")).length, earlyCount: notes.filter(z => z.issues.includes("快")).length,
        keyShift: res.keyShift || 0,
      };
  }


  // ================= 原唱：提取人声旋律 =================
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  // L、R 是 16k 采样的左右声道（单声道时 R=null）
  async function extractMelody(L, R, sr, onProgress) {
    const N = 2048, hop = Math.round(sr * 0.02), nb = N / 2;
    const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const frames = Math.max(0, Math.floor((L.length - N) / hop));
    const cands = []; for (let mm = 55; mm <= 86; mm += 0.1) cands.push(mm);
    const binOf = mm => 440 * Math.pow(2, (mm - 69) / 12) * N / sr;
    const cb = cands.map(binOf);
    const midi = new Float64Array(frames).fill(NaN), sal = new Float64Array(frames);
    const re = new Float64Array(N), im = new Float64Array(N), re2 = new Float64Array(N), im2 = new Float64Array(N), E = new Float64Array(nb);
    const maxBin = Math.floor(5000 * N / sr);
    for (let f = 0; f < frames; f++) {
      if (f % 300 === 0) { onProgress && onProgress(f / frames); await tick(); }
      const o = f * hop;
      for (let i = 0; i < N; i++) {
        const l = L[o + i], r = R ? R[o + i] : l;
        re[i] = (l + r) * 0.5 * win[i]; im[i] = 0; re2[i] = (l - r) * 0.5 * win[i]; im2[i] = 0;
      }
      fft(re, im); if (R) fft(re2, im2);
      let tot = 0;
      for (let k = 0; k < nb; k++) {
        const mg = Math.hypot(re[k], im[k]), sd = R ? Math.hypot(re2[k], im2[k]) : 0;
        E[k] = Math.sqrt(Math.max(0, mg - 0.9 * sd)); tot += E[k];
      }
      if (tot < 1e-6) continue;
      let best = -1, bs = 0;
      for (let c = 0; c < cb.length; c++) {
        let s = 0, w = 1;
        for (let h = 1; h <= 10; h++) {
          const bn = cb[c] * h; if (bn >= maxBin) break;
          const k = Math.round(bn);
          s += w * Math.max(E[k - 1] || 0, E[k], E[k + 1] || 0); w *= 0.84;
        }
        if (s > bs) { bs = s; best = c; }
      }
      midi[f] = cands[best]; sal[f] = bs;
    }
    onProgress && onProgress(1);
    // 有没有人声：显著度阈值
    const sv = Array.from(sal).filter(v => v > 0);
    const thr = 0.35 * pct(sv, 0.9);
    for (let f = 0; f < frames; f++) if (!(sal[f] > thr)) midi[f] = NaN;
    // 中值平滑（圈内）
    const out = new Float64Array(frames).fill(NaN);
    for (let f = 0; f < frames; f++) {
      if (isNaN(midi[f])) continue;
      const nbh = []; for (let k = f - 2; k <= f + 2; k++) if (k >= 0 && k < frames && !isNaN(midi[k])) nbh.push(midi[k]);
      out[f] = median(nbh);
    }
    return { hopS: hop / sr, midi: out, duration: L.length / sr };
  }

  // ================= 跟原唱比 =================
  const wrap12 = d => { let v = ((d % 12) + 12) % 12; if (v >= 6) v -= 12; return v; };
  // mode: "sync" = 跟着原唱一起唱（时间基本对齐）；"free" = 自己清唱的录音
  function compareWithRef(res, ref, mode) {
    const H = ref.hopS;
    const Nd = Math.floor(res.duration / H);
    const dad = new Float64Array(Nd);
    for (let j = 0; j < Nd; j++) { const i = Math.round(j * H / res.hopS); dad[j] = i < res.m.length ? res.m[i] : NaN; }
    const rf = ref.midi, Nr = rf.length;
    // 1) 调：音级直方图对一下（sync 模式默认同调）
    let k = 0;
    if (mode === "free") {
      const hd = new Array(12).fill(0), hr = new Array(12).fill(0);
      dad.forEach(v => { if (!isNaN(v)) hd[mod12(Math.round(v))]++; });
      rf.forEach(v => { if (!isNaN(v)) hr[mod12(Math.round(v))]++; });
      let bc = -1e9;
      for (let s = 0; s < 12; s++) { let c = 0; for (let q = 0; q < 12; q++) c += hd[mod12(q + s)] * hr[q]; if (c > bc) { bc = c; k = s; } }
      if (k > 6) k -= 12;
    }
    const cost = (dv, rv) => isNaN(dv) ? 0.3 : isNaN(rv) ? 1.5 : Math.min(Math.abs(wrap12(dv - rv - k)), 3);
    const map = new Int32Array(Nd).fill(-1);
    let L0 = 0;
    if (mode === "sync") {
      // 2a) 找整体延迟（蓝牙耳机等）
      let bestS = -1;
      for (let lag = -50; lag <= 50; lag++) {
        let hit = 0, cnt = 0;
        for (let j = 0; j < Nd; j += 2) { const i = j - lag; if (i < 0 || i >= Nr || isNaN(dad[j]) || isNaN(rf[i])) continue; cnt++; if (Math.abs(wrap12(dad[j] - rf[i])) < 0.6) hit++; }
        const sc = cnt > 50 ? hit / cnt : 0; if (sc > bestS) { bestS = sc; L0 = lag; }
      }
      // 2b) 窄带 DTW（±0.3 秒）
      const w = 28, Wd = 2 * w + 1, D = new Float64Array(Nd * Wd).fill(Infinity), B = new Int8Array(Nd * Wd);
      const at = (j, d) => j * Wd + d + w;
      for (let j = 0; j < Nd; j++) for (let d = -w; d <= w; d++) {
        const i = j - L0 + d; if (i < 0 || i >= Nr) continue;
        const c = cost(dad[j], rf[i]) + Math.abs(d) * 0.01;
        if (j === 0) { D[at(j, d)] = c; continue; }
        // 前驱: (j-1,i-1) -> d 不变；(j-1,i) -> d-1... i=j-L0+d，(j-1,i) 的 d' = d+1；(j,i-1) 的 d' = d-1
        let bv = D[at(j - 1, d)], bk = 0;
        if (d + 1 <= w && D[at(j - 1, d + 1)] + 0.4 < bv) { bv = D[at(j - 1, d + 1)] + 0.4; bk = 1; }
        if (d - 1 >= -w && D[at(j, d - 1)] + 0.4 < bv) { bv = D[at(j, d - 1)] + 0.4; bk = 2; }
        D[at(j, d)] = bv + c; B[at(j, d)] = bk;
      }
      let j = Nd - 1, d = 0, bv = Infinity;
      for (; j >= 0; j--) { for (let dd = -w; dd <= w; dd++) if (D[at(j, dd)] < bv) { bv = D[at(j, dd)]; d = dd; } if (isFinite(bv)) break; }
      while (j >= 0 && isFinite(bv)) {
        if (map[j] < 0) map[j] = j - L0 + d;
        const bk = B[at(j, d)];
        if (bk === 0) j--; else if (bk === 1) { j--; d++; } else d--;
        if (j < 0 || d < -w || d > w) break;
      }
    } else {
      // 2c) 自由清唱：100ms 网格上做子序列 DTW
      const S = 5, nd = Math.floor(Nd / S), nr = Math.floor(Nr / S);
      const ds = Float64Array.from({ length: nd }, (_, a) => { const v = []; for (let q = 0; q < S; q++) if (!isNaN(dad[a * S + q])) v.push(dad[a * S + q]); return v.length >= 2 ? median(v) : NaN; });
      const rs = Float64Array.from({ length: nr }, (_, a) => { const v = []; for (let q = 0; q < S; q++) if (!isNaN(rf[a * S + q])) v.push(rf[a * S + q]); return v.length >= 2 ? median(v) : NaN; });
      const D = new Float32Array(nd * nr), B = new Int8Array(nd * nr);
      for (let a = 0; a < nd; a++) for (let b = 0; b < nr; b++) {
        const c = cost(ds[a], rs[b]), idx = a * nr + b;
        if (a === 0) { D[idx] = c; continue; }
        let bv = b > 0 ? D[idx - nr - 1] : Infinity, bk = 0;
        if (D[idx - nr] + 0.6 < bv) { bv = D[idx - nr] + 0.6; bk = 1; }
        if (b > 0 && D[idx - 1] + 0.6 < bv) { bv = D[idx - 1] + 0.6; bk = 2; }
        D[idx] = bv + c; B[idx] = bk;
      }
      let a = nd - 1, b = 0, bv = Infinity;
      for (let q = 0; q < nr; q++) if (D[a * nr + q] < bv) { bv = D[a * nr + q]; b = q; }
      const pairs = [];
      while (a >= 0 && b >= 0) { pairs.push([a, b]); if (a === 0) break; const bk = B[a * nr + b]; if (bk === 0) { a--; b--; } else if (bk === 1) a--; else b--; }
      const mp = new Float64Array(nd).fill(-1); pairs.forEach(([x, y]) => { if (mp[x] < 0) mp[x] = y; });
      for (let j = 0; j < Nd; j++) { const x = Math.min(nd - 1, Math.floor(j / S)); if (mp[x] >= 0) map[j] = Math.min(Nr - 1, Math.round(mp[x] * S + (j % S))); }
    }
    // 3) 每个音和原唱比
    let allDev = [];
    res.notes.forEach(z => {
      const j0 = Math.ceil(z.t0 / H), j1 = Math.floor(z.t1 / H), L = j1 - j0 + 1;
      const a = j0 + Math.floor(L * 0.2), b = j1 - Math.floor(L * 0.2);
      const diffs = [];
      let rv = 0;
      for (let j = a; j <= b; j++) { if (j < 0 || j >= Nd) continue; const i = map[j]; if (i < 0 || isNaN(dad[j])) continue; if (!isNaN(rf[i])) { rv++; diffs.push(wrap12(dad[j] - rf[i] - k)); } }
      if (diffs.length >= 3 && rv >= 0.4 * Math.max(1, b - a + 1)) { const md = median(diffs); const stable = diffs.filter(v => Math.abs(v - md) < 0.5).length / diffs.length; if (stable >= 0.6) { z.refRaw = md; allDev.push([z.refRaw, z.dur]); } }
      if (mode === "sync" && j0 < Nd && map[j0] >= 0) z.lagRaw = (j0 - map[j0] - L0) * H;
    });
    // 清唱：允许整体起调不一样
    let fine = 0;
    if (mode === "free" && allDev.length) { const near = allDev.filter(x => Math.abs(x[0]) < 0.6).map(x => x[0]); fine = near.length ? median(near) : 0; }
    res.notes.forEach(z => {
      z.selfDev = z.selfDev ?? z.dev;
      if (z.refRaw === undefined) { delete z.refDev; z.wrong = false; return; }
      const dv = z.refRaw - fine;
      z.refDev = dv * 100;
      z.wrong = Math.abs(dv) > 0.7 && z.dur > 0.18;
      z.dev = z.wrong ? z.selfDev : dv * 100;
      const refP = z.center - dv;
      const rq = Math.round(refP);
      z.refJp = (Math.floor((rq - res.refTonic) / 12) < 0 ? "低音" : Math.floor((rq - res.refTonic) / 12) > 0 ? "高音" : "") + JP[mod12(rq - res.key.majorTonic)];
      if (z.lagRaw !== undefined) z.lag = z.lagRaw;
    });
    // 节奏：只看整句的平均快慢，单个音的抖动不算
    if (mode === "sync") {
      res.notes.forEach(z => { if (z.lag !== undefined) { const nb = res.notes.filter(y => y.lag !== undefined && Math.abs(y.t0 - z.t0) < 1.5).map(y => y.lag); z.lag = median(nb); } });
    }
    res.mode = mode; res.keyShift = k + fine; res.latency = L0 * H; res.refMap = map; res.refHop = H; res.ref = ref;
    summarize(res);
    return res;
  }

  function jpLabel(z) {
    const o = z.octave;
    return (o < 0 ? "低音" : o > 0 ? "高音" : "") + z.jp;
  }
  const fmtT = s => { s = Math.max(0, s); const mm = Math.floor(s / 60), ss = Math.floor(s % 60); return mm + ":" + String(ss).padStart(2, "0"); };

  return { analyze, summarize, extractMelody, compareWithRef, wrap12, jpLabel, fmtT, noteName, PC_NAMES, JP, MAJOR, mod12 };
})();
if (typeof module !== "undefined") module.exports = SC;
