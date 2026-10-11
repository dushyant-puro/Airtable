"use client";

import {useEffect,useRef} from "react";
import type {SpatialSubject} from "./types";
import {alu,formulaSamples,schedule} from "./lessonMath";

type Dot={x:number;y:number;z:number;color:string;layer:number};
type Label={x:number;y:number;z:number;text:string};
type Props={subject:SpatialSubject;formula:string;code:string;output:string;zoom:number;rotation:number;explode:number;tick:number;a:number;b:number;operation:string};
const cyan="#76f8ff",gold="#ffcf7d",ice="#dffcff";

function geometry(p:Props) {
  const dots:Dot[]=[],labels:Label[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string,layer=0)=>{
    for(let i=0;i<650;i++){const u=(i*.61803398875%1)-.5,v=(i*.41421356237%1)-.5,f=i%6;dots.push({x:x+(f<2?(f===0?-.5:.5):u)*w,y:y+(f>=2&&f<4?(f===2?-.5:.5):v)*h,z:z+(f>=4?(f===4?-.5:.5):f<2?u:v)*d,color,layer});}
  };
  if(p.subject==="maths") {
    try {for(const point of formulaSamples(p.formula)){if(!Number.isFinite(point.y)||Math.abs(point.y)>20)continue;for(let j=0;j<17;j++)dots.push({x:point.x*.25,y:-point.y*.26,z:(j-8)*.085,color:j===8?gold:cyan,layer:0});}
    }catch{/* The editor reports invalid functions; keep the canvas clear. */}
    labels.push({x:-1.6,y:1.05,z:0,text:"x ∈ [−2π, 2π]"},{x:0,y:-1.15,z:0,text:"y = "+p.formula.slice(0,55)});
    for(let i=0;i<180;i++){dots.push({x:-1.65+i/180*3.3,y:0,z:0,color:ice,layer:0});dots.push({x:0,y:-1.1+i/180*2.2,z:0,color:ice,layer:0});}
  } else if(p.subject==="coding") {
    const values=(p.output.match(/-?\d+(?:\.\d+)?/g)??[]).slice(0,10).map(Number);
    const max=Math.max(1,...values.map(Math.abs));
    values.forEach((n,i)=>{const h=.15+Math.abs(n)/max*.7,x=(i-(values.length-1)/2)*.55;box(x,.65-h/2,.1,.3,h,.24,i%2?gold:cyan);labels.push({x,y:.82,z:.1,text:String(n)});});
    if(!values.length)labels.push({x:0,y:.85,z:0,text:p.output.slice(0,65)});
  } else if(p.subject==="os") {
    const state=schedule(p.tick);
    box(0,-.7,0,1,.45,.7,gold);
    labels.push({x:0,y:-1.12,z:0,text:state.active<0?"CPU · ready":`CPU · P${state.active+1} at tick ${p.tick}`});
    state.remaining.forEach((n,i)=>{box((i-1)*1.1,.5,0,.8,.2+n*.12,.65,i===state.active?gold:cyan,i);labels.push({x:(i-1)*1.1,y:1.1,z:0,text:`P${i+1} · ${n} ticks left`});});
  } else {
    const result=alu(p.a,p.b,p.operation);
    box(0,.75,0,2.8,.12,1.5,"#4491be");
    box(-1,.1,0,.7,.32,.8,cyan,1);box(0,.1,0,.9,.42,.9,gold,2);box(1,.1,0,.7,.32,.8,ice,3);
    labels.push({x:-1,y:-.35,z:0,text:`REGISTERS · A=${p.a} B=${p.b}`},{x:0,y:-.65,z:0,text:`ALU · ${p.operation}`},{x:1,y:-.35,z:0,text:`RESULT ${result.result} · CARRY ${result.carry}`},{x:0,y:1.08,z:0,text:"CPU DATAPATH · input → compute → writeback"});
  }
  return {dots,labels};
}

export function SubjectHologram(props:Props) {
  const canvasRef=useRef<HTMLCanvasElement>(null),state=useRef(props),shape=useRef<{dots:Dot[];labels:Label[]}>({dots:[],labels:[]});
  useEffect(()=>{state.current=props;},[props]);
  useEffect(()=>{shape.current=geometry(props);},[props.subject,props.formula,props.output,props.tick,props.a,props.b,props.operation]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext("2d");if(!canvas||!ctx)return;
    let frame=0,previous=0;
    const render=(time:number)=>{frame=requestAnimationFrame(render);if(time-previous<32||document.hidden)return;previous=time;
      const {width:w,height:h}=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);if(!w||!h)return;
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const p=state.current,angle=p.rotation*.45,c=Math.cos(angle),s=Math.sin(angle),unit=(p.subject==="coding"?Math.min(w/6,h/1.2):Math.min(w/4.4,h/3.3))*p.zoom;
      const project=(x:number,y:number,z:number)=>{const rx=x*c+z*s,rz=-x*s+z*c,k=5/(5+rz);return {x:w/2+rx*unit*k,y:h*(p.subject==="coding"?.18:.47)+(y-rz*.18)*unit*k,k};};
      ctx.globalCompositeOperation="lighter";
      for(const dot of shape.current.dots){const v=project(dot.x,dot.y-dot.layer*p.explode/230,dot.z);ctx.globalAlpha=.55+.22*Math.sin(time/650+dot.x*2);ctx.fillStyle=dot.color;ctx.fillRect(v.x,v.y,1.8*v.k,1.8*v.k);}
      // A travelling probe shows the actual function's current sample.
      if(p.subject==="maths"){const samples=shape.current.dots;if(samples.length){const dot=samples[Math.floor(time/18)%samples.length],v=project(dot.x,dot.y,dot.z);ctx.globalAlpha=1;ctx.fillStyle=gold;ctx.shadowColor=gold;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(v.x,v.y,4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}}
      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
      ctx.textAlign="center";ctx.font="600 12px Segoe UI";
      for(const label of shape.current.labels){const v=project(label.x,label.y,label.z),width=Math.min(w-24,ctx.measureText(label.text).width),x=Math.max(width/2+10,Math.min(w-width/2-10,v.x)),y=Math.max(20,Math.min(h-12,v.y));ctx.fillStyle="#03151edb";ctx.fillRect(x-width/2-7,y-14,width+14,22);ctx.fillStyle=ice;ctx.fillText(label.text,x,y,w-24);}
    };frame=requestAnimationFrame(render);return()=>cancelAnimationFrame(frame);
  },[]);
  return <canvas className="hologram-model" ref={canvasRef} role="img" aria-label={`${props.subject} interactive particle visualization`}/>;
}
