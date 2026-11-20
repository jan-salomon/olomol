// What several drawing tools share.
export const DEGREE = Math.PI / 180;
export const rectOf = ([ax, ay], [bx, by]) => ({ x1: Math.min(ax, bx), y1: Math.min(ay, by), x2: Math.max(ax, bx), y2: Math.max(ay, by) });
