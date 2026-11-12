// 变调自测：升/降几个半音后，音高要跟着变、长度和节奏不变。
const SC=require('../analysis.js');const sr=44100;
const notes=[60,62,64,65,67,69,71,72];const dur=.4,N=Math.floor(notes.length*dur*sr);
const x=new Float32Array(N);let ph=0;
for(let s=0;s<N;s++){const i=Math.floor(s/(dur*sr)),tt=s/sr-i*dur,f=440*Math.pow(2,(notes[i]-69)/12);ph+=2*Math.PI*f/sr;
 const env=Math.min(1,tt/.02,(dur-tt)/.02);x[s]=env*.3*(Math.sin(ph)+.5*Math.sin(2*ph)+.25*Math.sin(3*ph));}
function down16k(a){const r=sr/16000,n=Math.floor(a.length/r),o=new Float32Array(n);for(let i=0;i<n;i++){const t=i*r,k=t|0,f=t-k;o[i]=(a[k]+(a[k+1]||0)*f-a[k]*f)}return o}
(async()=>{let bad=0;
 for(const semi of [-3,-1,2,4]){
  const t0=Date.now();const [y]=await SC.pitchShift([x],sr,semi);const ms=Date.now()-t0;
  const lenOk=y.length===x.length;
  const errs=[];for(let i=0;i<notes.length;i++){const s0=Math.floor((i*dur+.12)*16000),seg=down16k(y).subarray(s0,s0+Math.floor(.16*16000));
   const f=SC.yinAvg?SC.yinAvg(seg,16000):null;if(f>0)errs.push(12*Math.log2(f/440)+69-(notes[i]+semi));}
  const worst=errs.length?Math.max(...errs.map(Math.abs)):99;
  const pass=lenOk&&errs.length>=7&&worst<0.3;if(!pass)bad++;
  console.log((pass?'通过 ':'失败 ')+'变调 '+semi+' 个半音：测到 '+errs.length+' 个音，最大偏差 '+(worst*100).toFixed(0)+' 音分，用时 '+ms+'ms');}
 const [z]=await SC.pitchShift([x],sr,0);if(z.length!==x.length||z[1000]!==x[1000]){bad++;console.log('失败 原调应原样返回')}else console.log('通过 原调原样返回');
 process.exit(bad?1:0)})();
