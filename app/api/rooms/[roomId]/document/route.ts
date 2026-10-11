import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";

// Rehearsal storage only: files expire when the server process restarts.
type LessonPdf={id:string;bytes:Uint8Array;name:string};
const store=globalThis as typeof globalThis & {__lessonPdfs?:Map<string,LessonPdf>};
const files=store.__lessonPdfs??new Map<string,LessonPdf>();store.__lessonPdfs=files;
const MAX_BYTES=20*1024*1024;

export async function POST(request:NextRequest,context:{params:Promise<{roomId:string}>}){
  if(request.headers.get("x-classroom-role")!=="teacher")return NextResponse.json({error:"Only the teacher can upload a classroom PDF."},{status:403});
  if(Number(request.headers.get("content-length"))>MAX_BYTES)return NextResponse.json({error:"PDF limit is 20 MB."},{status:413});
  const reader=request.body?.getReader();if(!reader)return NextResponse.json({error:"Choose a PDF document."},{status:400});
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_BYTES){await reader.cancel();return NextResponse.json({error:"PDF limit is 20 MB."},{status:413});}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")return NextResponse.json({error:"Choose a valid PDF document."},{status:400});
  const {roomId}=await context.params;
  const id=randomUUID();let name="Lesson.pdf";
  try{name=decodeURIComponent(request.headers.get("x-document-name")??name).slice(0,160);}catch{/* Keep safe fallback. */}
  files.set(roomId,{id,bytes,name});
  return NextResponse.json({id,name});
}

export async function GET(request:NextRequest,context:{params:Promise<{roomId:string}>}){
  const {roomId}=await context.params,file=files.get(roomId);
  if(!file||request.nextUrl.searchParams.get("id")!==file.id)return NextResponse.json({error:"This PDF is no longer available. Ask the teacher to upload it again."},{status:404});
  return new NextResponse(file.bytes.slice().buffer,{headers:{"Content-Type":"application/pdf","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
