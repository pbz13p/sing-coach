const SC=require('../analysis.js');
const sr=16000;
// F major, 1=F3 (midi 53). Happy-birthday-ish melody degrees (semitones from tonic)
const mel=[[7,.4],[7,.2],[9,.6],[7,.6],[12,.6],[11,1.2],[null,.5],
           [7,.4],[7,.2],[9,.6],[7,.6],[14,.6],[12,1.2],[null,.5],
           [7,.4],[7,.2],[19,.6],[16,.6],[12,.6],[11,.6],[9,1.4],[null,.5],
           [17,.4],[17,.2],[16,.6],[12,.6],[14,.6],[12,1.5]];
// errors: index 3 flat 40c, index 11 (high 2) sharp 35c, index 16 (high5) flat 45c, scoop on 5, tail drop on 20, vibrato on 27
const err={3:-40,11:35,16:-45};
let total=mel.reduce((s,m)=>s+m[1],0)+1;
const N=Math.floor(total*sr), x=new Float32Array(N);
let t=0.5, ph=0; let idx=0;
for(const [d,dur] of mel){
  const s0=Math.floor(t*sr), s1=Math.floor((t+dur)*sr);
  if(d!==null){
    for(let s=s0;s<s1;s++){
      const tt=(s-s0)/sr, frac=tt/dur;
      const songDrift=-0.6*(s/N); // global drift -60c
      let midi=53+d+(err[idx]||0)/100+songDrift;
      if(idx===5 && tt<0.12) midi-= (1-tt/0.12)*1.5;
      if(idx===20 && frac>0.85) midi-= (frac-0.85)/0.15*1.2;
      if(idx===27) midi+=0.3*Math.sin(2*Math.PI*5.5*tt);
      midi+= (Math.random()-0.5)*0.04;
      const f=440*Math.pow(2,(midi-69)/12);
      ph+=2*Math.PI*f/sr;
      const env=Math.min(1,tt/0.03,(dur-tt)/0.03);
      x[s]=env*0.3*(Math.sin(ph)+0.5*Math.sin(2*ph)+0.3*Math.sin(3*ph)+0.15*Math.sin(4*ph));
    }
    idx++;
  } else idx++;
  t+=dur;
}
for(let s=0;s<N;s++) x[s]+= (Math.random()-0.5)*0.005;
(async()=>{
  const t0=Date.now();
  const r=await SC.analyze(x,sr);
  console.log('ms',Date.now()-t0, r.keyName, r.key);
  console.log(JSON.stringify(r.stats,null,1));
  r.notes.forEach(z=>console.log(SC.fmtT(z.t0),z.t0.toFixed(2),z.dur.toFixed(2),SC.jpLabel(z),z.dev.toFixed(0),z.sd.toFixed(0),z.issues.join(',')));
  console.log('spots',r.spots.map(z=>z.t0.toFixed(1)+SC.jpLabel(z)+z.issues));
})();
