// Angles for the debug view, as on a clock face of the screen: 0° right,
// 90° up (the drawing's y axis points down, so the sign flips).
export const DEGREE_TEXT = (angle) => `${Math.round((((-angle * 180) / Math.PI) % 360 + 360) % 360)}°`;
