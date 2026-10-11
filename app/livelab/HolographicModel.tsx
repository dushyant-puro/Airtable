"use client";

import { useEffect, useRef } from "react";

type Dot = { x: number; y: number; z: number; layer: number; color: string };
// Surface samples describe actual spatial layers, rather than a rendered image.
function semiconductor(): Dot[] {
  const dots: Dot[] = [];
  const box = (cx:number, cy:number, sx:number, sy:number, sz:number, layer:number, color:string) => {
    for(let i=0;i<1050;i++) {
      const u=((i*0.61803398875)%1)-.5, v=((i*0.41421356237)%1)-.5;
      const face=i%6;
      dots.push({x:cx+(face<2?(face===0?-.5:.5):u)*sx,y:cy+(face>=2&&face<4?(face===2?-.5:.5):v)*sy,z:(face>=4?(face===4?-.5:.5):face<2?u:v)*sz,layer,color});
    }
  };
  box(0,.42,2.6,.7,1.55,0,"#64c5ff");
  box(-.83,.01,.8,.28,1.5,1,"#55ffff");
  box(.83,.01,.8,.28,1.5,1,"#55ffff");
  box(0,-.22,.98,.12,1.5,2,"#ffc76c");
  box(0,-.48,.83,.4,1.4,3,"#b1faff");
  return dots;
}

export function HolographicModel({explode,zoom,rotation,conducting}:{explode:number;zoom:number;rotation:number;conducting:boolean}) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const live=useRef({explode,zoom,rotation,conducting});
  useEffect(()=>{live.current={explode,zoom,rotation,conducting};},[explode,zoom,rotation,conducting]);
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext("2d");if(!canvas||!ctx)return;
    const dots=semiconductor();let frame=0,previous=0;
    const render=(time:number)=>{
      frame=requestAnimationFrame(render);if(time-previous<32)return;previous=time;
      const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);
      if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
      const w=rect.width,h=rect.height;if(!w||!h)return;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const state=live.current,angle=state.rotation+.35,c=Math.cos(angle),s=Math.sin(angle),tilt=-.3,unit=Math.min(w/4.2,h/3.3)*state.zoom;
      const project=(x:number,y:number,z:number)=>{const rx=x*c+z*s,rz=-x*s+z*c,ry=y*Math.cos(tilt)-rz*Math.sin(tilt),depth=y*Math.sin(tilt)+rz*Math.cos(tilt),p=5/(5+depth);return{x:w/2+rx*unit*p,y:h*.55+ry*unit*p,p,depth};};
      ctx.globalCompositeOperation="lighter";
      for(const dot of dots){const p=project(dot.x,dot.y-dot.layer*state.explode/180,dot.z);ctx.globalAlpha=.4+p.p*.3;ctx.fillStyle=dot.color;ctx.fillRect(p.x,p.y,1.65*p.p,1.65*p.p);}
      ctx.globalAlpha=1;
      if(state.conducting){ctx.fillStyle="#fff1a8";ctx.shadowColor="#ffd478";ctx.shadowBlur=12;for(let i=0;i<36;i++){const x=-1.1+((time/1200+i/36)%1)*2.2,p=project(x,-.04,(i%6-2.5)*.19);ctx.beginPath();ctx.arc(p.x,p.y,2.5*p.p,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;}
      ctx.globalCompositeOperation="source-over";
      const labels=[{text:"GATE · control electrode",x:.5,y:-.68-state.explode/60,z:0},{text:"OXIDE · insulating barrier",x:.55,y:-.25-state.explode/90,z:.7},{text:"SOURCE · electrons enter",x:-1,y:-.05-state.explode/180,z:.8},{text:"DRAIN · electrons exit",x:1,y:-.05-state.explode/180,z:.8},{text:"SILICON · p-type substrate",x:.4,y:.72,z:.8}];
      ctx.font="600 11px Segoe UI";for(const label of labels){const p=project(label.x,label.y,label.z),direction=p.x>w/2?1:-1;ctx.strokeStyle="rgba(170,243,255,.65)";ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+direction*28,p.y-15);ctx.lineTo(p.x+direction*74,p.y-15);ctx.stroke();ctx.fillStyle="#e5faff";ctx.textAlign=direction===1?"left":"right";ctx.fillText(label.text,p.x+direction*78,p.y-12);}
    };frame=requestAnimationFrame(render);return()=>cancelAnimationFrame(frame);
  },[]);
  return <canvas className="hologram-model" ref={canvasRef} aria-label="Rotatable exploded MOSFET semiconductor with gate, oxide, source, drain and silicon layers"/>;
}
