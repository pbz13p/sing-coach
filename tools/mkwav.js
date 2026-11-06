// 合成 ~40 秒"老人唱歌"：音准大多还行，有几句偏低、句尾掉、颤音
const fs=require('fs');const sr=48000;
const phrase=[[0,.5],[2,.5],[4,1],[7,.5],[4,.5],[2,1.5],[null,.6],[4,.5],[5,.5],[7,1],[9,.5],[7,.5],[4,1.8],[null,.8]];
let mel=[];for(let k=0;k<3;k++)mel=mel.concat(phrase);
let total=mel.reduce((s,m)=>s+m[1],0)+2;const N=Math.floor(total*sr);const x=new Float32Array(N);
let t=1,ph=0,idx=0;
for(const [d,dur] of mel){const s0=Math.floor(t*sr),s1=Math.floor((t+dur)*sr);
 if(d!==null){for(let s=s0;s<s1;s++){const tt=(s-s0)/sr,frac=tt/dur;
  let midi=55+d-(idx>14&&idx<22?0.45:0)+(frac>0.8&&dur>1.4?-(frac-0.8)*4:0)+0.25*Math.sin(2*Math.PI*5*tt)*(dur>1?1:0);
  const f=440*Math.pow(2,(midi-69)/12);ph+=2*Math.PI*f/sr;const env=Math.min(1,tt/0.05,(dur-tt)/0.05);
  x[s]=env*0.25*(Math.sin(ph)+0.5*Math.sin(2*ph)+0.3*Math.sin(3*ph));}}
 idx++;t+=dur;}
for(let s=0;s<N;s++)x[s]+=(Math.random()-.5)*0.004;
const b=Buffer.alloc(44+N*2);b.write('RIFF',0);b.writeUInt32LE(36+N*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*2,40);
for(let i=0;i<N;i++)b.writeInt16LE(Math.max(-32767,Math.min(32767,x[i]*32767|0)),44+i*2);
fs.writeFileSync(__dirname+'/sing.wav',b);console.log('sec',total.toFixed(1));
