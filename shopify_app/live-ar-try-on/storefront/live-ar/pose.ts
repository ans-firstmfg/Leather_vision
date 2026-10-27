export interface Landmark { x: number; y: number; z?: number; visibility?: number }
export interface Torso { x: number; y: number; width: number; height: number; angle: number }

export function torsoFromPose(points: Landmark[], width: number, height: number): Torso | null {
  const anchors = [11, 12, 23, 24].map(index => points[index]);
  if (width <= 0 || height <= 0 || anchors.some(p => !p || !Number.isFinite(p.x) ||
    !Number.isFinite(p.y) || (p.visibility ?? 0) < 0.65 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return null;
  const [a, b, c, d] = anchors;
  const [left, right] = a.x < b.x ? [a, b] : [b, a];
  const shoulderWidth = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height);
  const topX = (a.x + b.x) * width / 2, topY = (a.y + b.y) * height / 2;
  const hipX = (c.x + d.x) * width / 2, hipY = (c.y + d.y) * height / 2;
  const torsoHeight = Math.hypot(hipX - topX, hipY - topY);
  const angle = Math.atan2((right.y - left.y) * height, (right.x - left.x) * width);
  // Reject profile views, inverted or severely cropped bodies instead of inventing alignment.
  if (shoulderWidth < width * 0.08 || torsoHeight < height * 0.12 || hipY <= topY ||
      shoulderWidth / torsoHeight < 0.45 || Math.abs(angle) > Math.PI / 4) return null;
  return { x: topX + (hipX - topX) * 0.48, y: topY + (hipY - topY) * 0.48,
    width: shoulderWidth * 1.28, height: torsoHeight * 1.18, angle };
}

export class PoseSmoother {
  private previous?: Torso;
  private time = 0;
  reset() { this.previous = undefined; this.time = 0; }
  update(value: Torso, now: number): Torso {
    const alpha = this.previous && now - this.time < 350 ? 1 - Math.exp(-Math.max(0, now - this.time) / 65) : 1;
    const previous = this.previous ?? value;
    const result = { ...value };
    for (const key of ["x", "y", "width", "height", "angle"] as const) {
      result[key] = previous[key] + (value[key] - previous[key]) * alpha;
    }
    this.previous = result; this.time = now;
    return result;
  }
}
