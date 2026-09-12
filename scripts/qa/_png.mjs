/* READ THE PIXELS OUT OF A SCREENSHOT, in node, with no dependency. Chrome's Page.captureScreenshot
   hands back a truecolour PNG, so this only has to handle colour types 6 and 2 — enough to answer
   "is this actually drawn on the screen", which is the one question a DOM measurement cannot.
   TWO PROBES NEEDED IT (the plaque's rope and the dock coin), which is why it is a file rather than
   a copy in each: the second consumer is what converges it. */
import zlib from "node:zlib";
export function decodePng(buf){
  let i=8,w=0,h=0,ct=0,idat=[];
  while(i<buf.length){ const len=buf.readUInt32BE(i), t=buf.toString("ascii",i+4,i+8), d=buf.slice(i+8,i+8+len);
    if(t==="IHDR"){w=d.readUInt32BE(0);h=d.readUInt32BE(4);ct=d[9];}
    else if(t==="IDAT")idat.push(d); else if(t==="IEND")break; i+=12+len; }
  const raw=zlib.inflateSync(Buffer.concat(idat)), ch=ct===6?4:3, stride=w*ch, out=Buffer.alloc(w*h*4);
  let prev=Buffer.alloc(stride), pos=0;
  for(let y=0;y<h;y++){ const f=raw[pos++], line=Buffer.from(raw.slice(pos,pos+stride)); pos+=stride;
    for(let x=0;x<stride;x++){ const a=x>=ch?line[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0; let v=line[x];
      if(f===1)v+=a; else if(f===2)v+=b; else if(f===3)v+=((a+b)>>1);
      else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c); v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);} line[x]=v&255; }
    prev=line;
    for(let x=0;x<w;x++){ const o=(y*w+x)*4; out[o]=line[x*ch];out[o+1]=line[x*ch+1];out[o+2]=line[x*ch+2];out[o+3]=255; } }
  return {w,h,px:out};
}
/* How many pixels inside a box differ between two shots of the same page, and by how much at most.
   The box is in DEVICE pixels — multiply CSS by devicePixelRatio before calling. */
export function boxDiff(a, b, x0, y0, w, h){
  let n = 0, worst = 0;
  for (let y=y0; y<y0+h; y++){
    if (y<0 || y>=a.h || y>=b.h) continue;
    for (let x=x0; x<x0+w; x++){
      if (x<0 || x>=a.w || x>=b.w) continue;
      const o=(y*a.w+x)*4, p=(y*b.w+x)*4;
      const d = Math.abs(a.px[o]-b.px[p]) + Math.abs(a.px[o+1]-b.px[p+1]) + Math.abs(a.px[o+2]-b.px[p+2]);
      if (d > 12){ n++; if (d > worst) worst = d; }
    }
  }
  return { changed: n, worst };
}
