const SC=require('../analysis.js');const sr=16000;
const mel=[[7,.4],[7,.2],[9,.6],[7,.6],[12,.6],[11,1.2],[null,.5],[7,.4],[7,.2],[9,.6],[7,.6],[14,.6],[12,1.2],[null,.5],[7,.4],[7,.2],[19,.6],[16,.6],[12,.6],[11,.6],[9,1.4],[null,.5],[17,.4],[17,.2],[16,.6],[12,.6],[14,.6],[12,1.5]];
function tone(buf,s0,s1,midiFn,amp,harm,phObj){for(let s=s0;s<s1&&s<buf.length;s++){const tt=(s-s0)/sr,dur=(s1-s0)/sr;const f=440*Math.pow(2,(midiFn(tt,dur)-69)/12);phObj.p+=2*Math.PI*f/sr;const env=Math.min(1,tt/.02,(dur-tt)/.03);let v=0;harm.forEach((h,i)=>v+=h*Math.sin((i+1)*phObj.p));buf[s]+=env*amp*v}}
const total=mel.reduce((s,m)=>s+m[1],0)+2, N=Math.floor(total*sr);
// original: vocal center at tonic 65 (F4), chords
const Lc=new Float32Array(N),Rc=new Float32Array(N),voc=new Float32Array(N);
let t=0.5;const ph={p:0};
const chordOf=d=>{const r=[0,5,7,0][Math.floor(d/2)%4];return [r,r+4,r+7].map(x=>53+x)};
let bar=0;
for(const [d,dur] of mel){const s0=Math.floor(t*sr),s1=Math.floor((t+dur)*sr);if(d!==null)tone(voc,s0,s1,()=>65+d,0.25,[1,.6,.4,.3,.2],ph);t+=dur}
// chords every 1.2s
for(let c=0;c*1.2<total-1;c++){const notes=chordOf(c*2);notes.forEach((m,i)=>{const pp={p:0};const tmp=new Float32Array(N);tone(tmp,Math.floor(c*1.2*sr),Math.floor((c+1)*1.2*sr),()=>m,0.12,[1,.5,.25,.1],pp);for(let s=0;s<N;s++){Lc[s]+=tmp[s]*(i%2?0.8:0.3);Rc[s]+=tmp[s]*(i%2?0.3:0.8)}});
 const bp={p:0},tb=new Float32Array(N);tone(tb,Math.floor(c*1.2*sr),Math.floor((c+1)*1.2*sr),()=>notes[0]-12,0.15,[1,.3],bp);for(let s=0;s<N;s++){Lc[s]+=tb[s];Rc[s]+=tb[s]}}
for(let s=0;s<N;s++){Lc[s]+=voc[s];Rc[s]+=voc[s]}
// dad: octave lower (53), errors, latency 0.15, phrase3 late 0.4
function makeDad(shift,tempo,lat){const x=new Float32Array(Math.floor((total/tempo+1)*sr));let t=0.5/tempo+lat,idx=0;const p={p:0};
 for(const [d,dur0] of mel){const dur=dur0/tempo;let st=t;if(idx>=14&&idx<=20)st+=0.4;const s0=Math.floor(st*sr),s1=Math.floor((st+dur)*sr);
  if(d!==null){let dd=d;if(idx===9)dd=7+2; // wrong note: sings 6 instead of 6? orig idx9 is 9 -> make wrong
   if(idx===9)dd=11; const e=idx===3?-0.4:idx===11?0.35:0;tone(x,s0,s1,()=>53+shift+dd+e,0.3,[1,.5,.3,.15],p)}
  idx++;t+=dur}
 for(let s=0;s<x.length;s++)x[s]+=(Math.random()-.5)*.004;return x}
(async()=>{
 let t0=Date.now();const ref=await SC.extractMelody(Lc,Rc,sr);console.log('extract ms',Date.now()-t0,'voiced',Array.from(ref.midi).filter(v=>!isNaN(v)).length*0.02);
 // check ref accuracy vs truth (mod 12)
 let ok=0,c=0;{let t=0.5;for(const [d,dur] of mel){if(d!==null){for(let tt=t+0.1;tt<t+dur-0.05;tt+=0.02){const v=ref.midi[Math.round(tt/0.02)];c++;if(!isNaN(v)&&Math.abs(SC.wrap12(v-65-d))<0.5)ok++}}t+=dur}}
 console.log('ref melody frame acc',(ok/c).toFixed(2));
 for(const [mode,shift,tempo] of [['sync',0,1],['free',2,0.9]]){
  const dad=makeDad(shift,tempo,mode==='sync'?0.15:0.8);
  const r=await SC.analyze(dad,sr);SC.compareWithRef(r,ref,mode);
  console.log('\n==',mode,'latency',r.latency,'keyShift',r.keyShift.toFixed(2),'score',r.stats.score,'wrong',r.stats.wrongCount,'late',r.stats.lateCount,'cover',r.stats.refCover.toFixed(2));
  r.notes.forEach(z=>console.log(z.t0.toFixed(2),SC.jpLabel(z),'ref',z.refJp,z.refDev===undefined?'-':z.refDev.toFixed(0),z.lag===undefined?'':'lag'+z.lag.toFixed(2),z.issues.join(',')));
 }
})();
;(async()=>{const r=await SC.extractMelody(Lc,Rc,sr);console.log('REF 1.1-1.8',Array.from(r.midi.slice(55,90)).map(v=>isNaN(v)?'-':(v-65).toFixed(1)).join(' '));})();
