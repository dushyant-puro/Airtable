export type SpatialPose = { x: number; y: number; scale: number };
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function translatePose(pose: SpatialPose, dx: number, dy: number, stage: { width: number; height: number }, object: { width: number; height: number }): SpatialPose {
  return { ...pose, x: clamp(pose.x + dx / stage.width * 100, 0, Math.max(0, 100 - object.width * pose.scale / stage.width * 100)), y: clamp(pose.y + dy / stage.height * 100, 0, Math.max(0, 100 - object.height * pose.scale / stage.height * 100)) };
}

export function smoothZoom(current: number, base: number, distance: number, initial: number, min = .6, max = 2.4) {
  if (initial < .08 || !Number.isFinite(distance) || distance <= 0) return current;
  const ratio = distance / initial;
  const desired = clamp(base * (Math.abs(ratio - 1) < .025 ? 1 : ratio), min, max);
  return Math.abs(desired - current) < .003 ? current : current + (desired - current) * .35;
}

// A hold can fire only once until the pose is released, even if the pointer moves.
export class DockHold {
  private target: string | null = null;
  private since = 0;
  private fired = false;
  update(target: string | null, time: number) {
    if (this.fired) return { progress: 1, fire: false };
    if (!target) { this.reset(); return { progress: 0, fire: false }; }
    if (target !== this.target) { this.target = target; this.since = time; }
    const progress = clamp((time - this.since) / 1000, 0, 1);
    if (progress === 1) this.fired = true;
    return { progress, fire: progress === 1 };
  }
  reset() { this.target = null; this.since = 0; this.fired = false; }
}
