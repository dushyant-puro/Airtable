export type InkTool = "pointer" | "pen" | "highlighter" | "eraser";
export type InkPoint = { x: number; y: number };
export interface StageInkStroke {
  id: string;
  tool: "pen" | "highlighter";
  color: string;
  points: InkPoint[];
}
export interface StageInkObject {
  id: string;
  x: number;
  y: number;
  strokes: StageInkStroke[];
}

export function inkPath(points: InkPoint[]) {
  if (!points.length) return "";
  const xy = (p: InkPoint) => `${(p.x * 1000).toFixed(2)} ${(p.y * 1000).toFixed(2)}`;
  let path = `M ${xy(points[0])}`;
  if (points.length === 1) return path + ` l .01 .01`;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1], current = points[i];
    path += ` Q ${xy(previous)} ${xy({ x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 })}`;
  }
  return path + ` L ${xy(points[points.length - 1])}`;
}

export function inkBounds(object: StageInkObject) {
  let left = 1, top = 1, right = 0, bottom = 0;
  for (const stroke of object.strokes) for (const point of stroke.points) {
    left = Math.min(left, point.x); top = Math.min(top, point.y);
    right = Math.max(right, point.x); bottom = Math.max(bottom, point.y);
  }
  return { left, top, right, bottom };
}

export function moveInkObject(object: StageInkObject, dx: number, dy: number): StageInkObject {
  const bounds = inkBounds(object);
  return { ...object, x: Math.max(-bounds.left, Math.min(1 - bounds.right, object.x + dx)), y: Math.max(-bounds.top, Math.min(1 - bounds.bottom, object.y + dy)) };
}

export function canJoinInk(object: StageInkObject, point: InkPoint) {
  const bounds = inkBounds(object);
  return point.x >= bounds.left + object.x - .1 && point.x <= bounds.right + object.x + .1 && point.y >= bounds.top + object.y - .1 && point.y <= bounds.bottom + object.y + .1;
}

export function eraseInkAt(objects: StageInkObject[], point: InkPoint, width: number, height: number, radius = 18) {
  const hit = (object: StageInkObject, stroke: StageInkStroke) => stroke.points.some((b, i) => {
    const a = stroke.points[Math.max(0, i - 1)];
    const ax = (a.x + object.x) * width, ay = (a.y + object.y) * height;
    const dx = (b.x - a.x) * width, dy = (b.y - a.y) * height;
    const px = point.x * width - ax, py = point.y * height - ay;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - t * dx, py - t * dy) <= radius;
  });
  return objects.map(object => ({ ...object, strokes: object.strokes.filter(stroke => !hit(object, stroke)) })).filter(object => object.strokes.length);
}
