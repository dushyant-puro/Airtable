import { NextRequest, NextResponse } from "next/server";
import { CompilerFailure, createCompilerClient } from "../../livelab/judge0Provider";

export const dynamic = "force-dynamic";
const recentJobs = new Map<string,{since:number;count:number}>();

export async function GET() {
  const base = process.env.JUDGE0_BASE_URL;
  if (!base) return NextResponse.json({configured:false,healthy:false,runtimes:[],error:"No compiler connected. Configure JUDGE0_BASE_URL on the server to run C, C++ or Java."});
  try { const runtimes=await createCompilerClient(base,process.env.JUDGE0_API_KEY,fetch,undefined,process.env.JUDGE0_RAPIDAPI_HOST).listRuntimes();return NextResponse.json({configured:true,healthy:runtimes.length>0,runtimes,error:runtimes.length?undefined:"Compiler returned no available runtimes."}); }
  catch(error) { return NextResponse.json({configured:true,healthy:false,runtimes:[],error:error instanceof CompilerFailure?error.message:"Compiler unavailable. Check JUDGE0_BASE_URL and retry."},{status:502}); }
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length")) > 100000) return NextResponse.json({error:"Execution request is too large."},{status:413});
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({error:"Send a valid JSON execution request."},{status:400}); }
  const {sourceCode,languageId,stdin=""}=body??{};
  if(typeof sourceCode!=="string"||!sourceCode.trim()||sourceCode.length>50000||!Number.isInteger(languageId)||languageId<=0||typeof stdin!=="string"||stdin.length>10000) return NextResponse.json({error:"Provide source up to 50 KB, a valid language ID and input up to 10 KB."},{status:400});
  const base=process.env.JUDGE0_BASE_URL;
  if(!base)return NextResponse.json({error:"Configure JUDGE0_BASE_URL to run C, C++ or Java. Editing and source projection remain available."},{status:503});
  // Coarse prototype guard, not a replacement for authenticated per-user limits.
  const now=Date.now(),client=request.headers.get("x-forwarded-for")?.split(",")[0]??"local";
  for(const [id,value] of recentJobs)if(now-value.since>60000)recentJobs.delete(id);
  const window=recentJobs.get(client)??{since:now,count:0};
  if(window.count>=10)return NextResponse.json({error:"Execution limit reached. Wait one minute and retry."},{status:429});
  window.count++;recentJobs.set(client,window);
  try { return NextResponse.json(await createCompilerClient(base,process.env.JUDGE0_API_KEY,fetch,undefined,process.env.JUDGE0_RAPIDAPI_HOST).execute(sourceCode,languageId,stdin)); }
  catch(error){ return NextResponse.json({error:error instanceof CompilerFailure?error.message:"Compiler failed. Your source was not changed."},{status:error instanceof CompilerFailure?error.status:502}); }
}
