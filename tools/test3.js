// 难情况自测：颤音、气声、慢起音、八度。每项有断言，失败会退出码 1。
const SC=require('../analysis.js');const sr=16000;
const mel=[[0,.5],[2,.5],[4,.5],[5,.5],[7,.8],[4,.5],[2,.5],[0,1.0],[null,.4],[7,.5],[9,.5],[7,.5],[4,.5],[5,.5],[2,.5],[0,1.2],[null,.4],[4,.6],[7,.6],[12,1.0],[9,.6],[7,.6],[4,.6],[0,1.2]];
function sing(o){o=Object.assign({base:53,vib:0,vibHz:5.5,noise:0,onset:0,det:0},o);
 const total=mel.reduce((s,m)=>s+m[1],0)+1;const N=Math.floor(total*sr),x=new Float32Array(N);let t=0.5,ph=0,seed=1;
 const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647-.5};
 for(const [d,dur] of mel){const s0=Math.floor(t*sr),s1=Math.floor((t+dur)*sr);
  if(d!==null)for(let s=s0;s<s1;s++){const tt=(s-s0)/sr;let midi=o.base+d+o.det+o.vib*Math.sin(2*Math.PI*o.vibHz*tt);
   const f=440*Math.pow(2,(midi-69)/12);ph+=2*Math.PI*f/sr;
   const rise=Math.max(.03,o.onset);const env=Math.min(1,tt/rise,(dur-tt)/0.03);
   x[s]=env*0.3*(Math.sin(ph)+.5*Math.sin(2*ph)+.3*Math.sin(3*ph)+.15*Math.sin(4*ph))+o.noise*rnd();}
  t+=dur}
 for(let s=0;s<N;s++)x[s]+=0.004*rnd();return x}
const cases=[
 ['基准（唱准）',{},r=>r.stats.score>=80],
 ['颤音±40分',{vib:.4},r=>r.stats.score>=70],
 ['颤音±80分(大颤音)',{vib:.8},r=>r.stats.score>=55],
 ['气声（噪声很大）',{noise:.12},r=>r.stats.score>=65&&r.stats.noteCount>=14],
 ['慢起音150ms',{onset:.15},r=>r.stats.score>=75],
 ['低八度唱',{base:41},r=>r.stats.score>=75],
 ['整体偏低半音',{det:-.5},r=>r.stats.score>=70],
];
(async()=>{let bad=0;
 for(const [name,o,ok] of cases){const r=await SC.analyze(sing(o),sr);
  const pass=!r.error&&ok(r);if(!pass)bad++;
  console.log((pass?'通过 ':'失败 ')+name,r.error||('分数'+r.stats.score+' 音数'+r.stats.noteCount+' 准确率'+(r.stats.accuracy*100).toFixed(0)+'%'));}
 if(bad){console.log(bad+' 项失败');process.exit(1)}console.log('全部通过')})();
