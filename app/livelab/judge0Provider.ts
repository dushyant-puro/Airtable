import { validRuntimes } from "./codeRuntimes.ts";

export class CompilerFailure extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}
export function createCompilerClient(baseUrl: string, key?: string, request: typeof fetch = fetch, pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const base = baseUrl.replace(/\/$/, ""), headers: Record<string,string> = { "Content-Type": "application/json" };
  if (key) headers["X-Auth-Token"] = key;
  const json = async (path: string, init?: RequestInit) => {
    let response: Response;
    try { response = await request(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(8000), cache: "no-store" }); }
    catch { throw new CompilerFailure("Compiler timed out or is unreachable. Retry without changing your source."); }
    if (!response.ok) throw new CompilerFailure(`Compiler returned HTTP ${response.status}. Check its configuration.`);
    try { return await response.json(); } catch { throw new CompilerFailure("Compiler returned an invalid response."); }
  };
  return {
    async listRuntimes() { return validRuntimes(await json("/languages")); },
    async execute(source: string, languageId: number, stdin = "") {
      const runtimes = validRuntimes(await json("/languages"));
      if (!runtimes.some(runtime => runtime.id === languageId)) throw new CompilerFailure("Choose an available compiler from the runtime catalogue.", 400);
      // Never compile in Next.js or accept client-supplied sandbox flags.
      let result = await json("/submissions?base64_encoded=false&wait=false", { method: "POST", body: JSON.stringify({ source_code: source, language_id: languageId, stdin, cpu_time_limit: 3, wall_time_limit: 5, memory_limit: 262144, max_file_size: 128, enable_network: false, number_of_runs: 1 }) });
      const token = result.token;
      if (typeof token !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(token)) throw new CompilerFailure("Compiler did not return a valid job token.");
      const deadline = Date.now() + 20000;
      for (let attempt = 0; attempt < 60 && Date.now() < deadline; attempt++) {
        result = await json(`/submissions/${encodeURIComponent(token)}?base64_encoded=false`);
        if (Number(result.status?.id) >= 3) {
          const output = [result.stdout, result.compile_output, result.stderr, result.message].filter(value => typeof value === "string" && value.length).join("\n");
          return { output: (output || result.status?.description || "Finished with no output.").slice(0,20000), status: result.status?.description ?? "Finished", success: result.status?.id === 3 };
        }
        await pause(250);
      }
      throw new CompilerFailure("Compiler job is still queued or exceeded the response deadline. Retry later.", 504);
    },
  };
}
