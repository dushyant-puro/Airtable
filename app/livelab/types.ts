export type LessonMode = "document" | "code" | "logic" | "systems";
export type SpatialSubject = "semiconductor" | "maths" | "coding" | "os" | "coa";

export type RuntimeId = "javascript" | "typescript" | "html" | "python" | "sql" | string;

export interface SystemNode {
  id: string;
  type: string;
  label: string;
}

export interface LessonRoomState {
  version: number;
  activeMode: LessonMode;
  page: number;
  scale: number;
  inkSnapshots: Record<string, string>;
  highlights: unknown[];
  code: string;
  language: RuntimeId;
  codeOutput: string;
  stageCode: string;
  stageLanguage: import("./codeRuntimes").StageLanguage;
  stageCodeDrafts: Partial<Record<import("./codeRuntimes").StageLanguage, string>>;
  stageModelPose: {x:number;y:number;scale:number};
  stageBrightness: number;
  stageCodeOutput: string;
  stageFormula: string;
  stageSelectedPart: string;
  stageRemovedParts: string[];
  stageZoom: number;
  stageExplode: number;
  stageNotes: string[];
  stageModel: "semiconductor" | "pcb";
  stageSubject: SpatialSubject;
  stageGateOn: boolean;
  stageRotation: number;
  stageCodePose: {x:number;y:number;scale:number};
  stageMathPose: {x:number;y:number;scale:number};
  logicA: 0 | 1;
  logicB: 0 | 1;
  logicCarry: 0 | 1;
  logicOperation: "AND" | "OR" | "XOR" | "ADD";
  logicScene: "cpu" | "semiconductor";
  explodedAmount: number;
  selectedComponent: string;
  clock: 0 | 1;
  systemNodes: SystemNode[];
  systemScenario: "architecture" | "network" | "scheduler" | "paging";
  simulationStep: number;
  studentControl: boolean;
  updatedAt: number;
}

export interface RoomParticipant {
  id: string;
  role: "teacher" | "student";
  lastSeen: number;
}

export const defaultRoomState: LessonRoomState = {
  version: 0,
  activeMode: "document",
  page: 1,
  scale: 1,
  inkSnapshots: {},
  highlights: [],
  code: `# AirBoard LiveLab\n# Type or clean handwritten code, then run it.\n\ndef fibonacci(n):\n    a, b = 0, 1\n    values = []\n    for _ in range(n):\n        values.append(a)\n        a, b = b, a + b\n    return values\n\nprint(fibonacci(10))`,
  language: "python",
  codeOutput: "Ready. Choose a runtime and run the lesson.",
  stageCode: `const radius = 82;\nconst particles = 18;\nconsole.log("Orbit ready", radius, particles);`,
  stageCodeOutput: "Ready to execute",
  stageLanguage: "javascript",
  stageCodeDrafts: {},
  stageModelPose: {x:14,y:10,scale:1},
  stageBrightness: 1.2,
  stageFormula: "sin(x) + 0.45 * sin(3*x)",
  stageSelectedPart: "cpu",
  stageRemovedParts: [],
  stageZoom: 1,
  stageExplode: 36,
  stageNotes: [],
  stageModel: "semiconductor",
  stageSubject: "semiconductor",
  stageGateOn: true,
  stageRotation: .1,
  stageCodePose: {x:67,y:10,scale:1},
  stageMathPose: {x:68,y:58,scale:1},
  logicA: 1,
  logicB: 0,
  logicCarry: 0,
  logicOperation: "ADD",
  logicScene: "cpu",
  explodedAmount: 42,
  selectedComponent: "ALU",
  clock: 0,
  systemNodes: [
    { id: "client-1", type: "Client", label: "Student app" },
    { id: "gateway-1", type: "API Gateway", label: "Gateway" },
    { id: "service-1", type: "Service", label: "Lesson service" },
    { id: "cache-1", type: "Cache", label: "Redis cache" },
    { id: "database-1", type: "Database", label: "Postgres" },
  ],
  systemScenario: "architecture",
  simulationStep: 0,
  studentControl: false,
  updatedAt: Date.now(),
};

export interface ExecutionResult {
  output: string;
  error?: string;
}
