import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.JUDGE0_BASE_URL;
  if (!baseUrl) return NextResponse.json({ configured: false, runtimes: [] });
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/languages`, { headers: process.env.JUDGE0_API_KEY ? { "X-Auth-Token": process.env.JUDGE0_API_KEY } : undefined });
    if (!response.ok) throw new Error("Runtime catalogue unavailable");
    return NextResponse.json({ configured: true, runtimes: await response.json() });
  } catch (error) {
    return NextResponse.json({ configured: false, runtimes: [], error: error instanceof Error ? error.message : "Unavailable" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const baseUrl = process.env.JUDGE0_BASE_URL;
  if (!baseUrl) return NextResponse.json({ error: "Judge0 is not configured. Browser runtimes remain available." }, { status: 503 });
  const { sourceCode, languageId, stdin = "" } = await request.json();
  if (typeof sourceCode !== "string" || sourceCode.length > 50_000) return NextResponse.json({ error: "Source code is missing or too large." }, { status: 400 });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.JUDGE0_API_KEY) headers["X-Auth-Token"] = process.env.JUDGE0_API_KEY;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({ source_code: sourceCode, language_id: languageId, stdin, cpu_time_limit: 3, wall_time_limit: 5, memory_limit: 131072 }),
  });
  const result = await response.json();
  return NextResponse.json({ output: result.stdout || result.compile_output || result.stderr || result.message || result.status?.description || "Finished" }, { status: response.ok ? 200 : response.status });
}
