export type StageLanguage = "javascript" | "c" | "cpp" | "java";
export type CompilerRuntime = { id: number; name: string };
export const stageLanguages: { id: StageLanguage; name: string }[] = [
  { id: "javascript", name: "JavaScript" }, { id: "c", name: "C" }, { id: "cpp", name: "C++" }, { id: "java", name: "Java" },
];
export const codeSamples: Record<StageLanguage, string> = {
  javascript: 'const values = [2, 4, 8, 16];\nconsole.log(values.join(" "));',
  c: '#include <stdio.h>\nint main(void) {\n  for (int n = 2; n <= 16; n *= 2) printf("%d ", n);\n  return 0;\n}',
  cpp: '#include <iostream>\nint main() {\n  for (int n : {2, 4, 8, 16}) std::cout << n << " ";\n  return 0;\n}',
  java: 'public class Main {\n  public static void main(String[] args) {\n    for (int n : new int[]{2, 4, 8, 16})\n      System.out.print(n + " ");\n  }\n}',
};
export function compilerFor(language: StageLanguage, runtimes: CompilerRuntime[]) {
  const pattern = { javascript: /^JavaScript\b/i, c: /^C(?:\s|\()/i, cpp: /^C\+\+(?:\s|\()/i, java: /^Java(?:\s|\()/i }[language];
  return runtimes.find(runtime => Number.isInteger(runtime.id) && runtime.id > 0 && pattern.test(runtime.name));
}
export function validRuntimes(value: unknown): CompilerRuntime[] {
  if (!Array.isArray(value)) return [];
  return value.filter((runtime): runtime is CompilerRuntime => runtime !== null && typeof runtime === "object" && Number.isInteger(runtime.id) && runtime.id > 0 && typeof runtime.name === "string");
}
