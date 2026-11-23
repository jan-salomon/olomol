// Line icons, 24×24, drawn in the current text colour.

const Icon = ({ children, size = 20, ...rest }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

const hexagon = (cx, cy, r, extra = {}) => {
  const points = Array.from({ length: 6 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 3;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return <polygon points={points} {...extra} />;
};

// The inner lines of benzene's three double bonds: every other edge of the
// hexagon (corner at the top), moved towards the middle and shortened.
function benzeneInner() {
  const corner = (k) => [12 + 8 * Math.cos(-Math.PI / 2 + (k * Math.PI) / 3), 12 + 8 * Math.sin(-Math.PI / 2 + (k * Math.PI) / 3)];
  const inward = (p, t) => [12 + (p[0] - 12) * t, 12 + (p[1] - 12) * t];
  return [0, 2, 4].map((k) => {
    const [p, q] = [inward(corner(k), 0.7), inward(corner(k + 1), 0.7)];
    const [a, b] = [[p[0] + (q[0] - p[0]) * 0.15, p[1] + (q[1] - p[1]) * 0.15], [q[0] - (q[0] - p[0]) * 0.15, q[1] - (q[1] - p[1]) * 0.15]];
    return `M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
  }).join('');
}

export const polygonPoints = (n, cx, cy, r) => Array.from({ length: n }, (_, k) => {
  const start = n === 4 || n === 8 ? -Math.PI / 2 + Math.PI / n : -Math.PI / 2;
  const a = start + (2 * Math.PI * k) / n;
  return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

export const icons = {
  select: <Icon><path d="M5 3.5l13 6.2-5.6 1.7-2.2 5.6z" /><path d="M12.6 11.6l5 5" /></Icon>,
  lasso: <Icon><path d="M6.5 15.5c-2.6-1.4-3.6-3.6-2.6-5.9C5.3 6.4 10 4.5 14.6 5.3c4.6.8 6.6 3.9 4.9 6.7-1.6 2.6-6.3 3.9-10.6 3.4" strokeDasharray="2.4 2.2" /><path d="M7 15.4c-.5 1.6.3 3.1 2 3.6" /></Icon>,
  erase: <Icon><path d="M8.5 19.5h11" /><path d="M4.6 14.7l9.2-9.2a1.8 1.8 0 012.6 0l3.1 3.1a1.8 1.8 0 010 2.6l-7.9 7.9H8.4z" /><path d="M9.3 10l5.7 5.7" /></Icon>,
  single: <Icon><path d="M5 18L19 6" /></Icon>,
  double: <Icon><path d="M4.4 15.8L16.6 5.4M7.4 19.4L19.6 9" /></Icon>,
  triple: <Icon><path d="M3.8 14.4L15.2 4.6M5.9 17.4L18.1 7M8.9 20.4L20.2 10.6" /></Icon>,
  wedge: <Icon><path d="M5 18.5L17.2 4.6l2.6 2.4z" fill="currentColor" /></Icon>,
  hash: <Icon><path d="M6.3 16.9l.9.9M8.5 13.9l2 1.9M10.8 10.9l3 2.8M13.1 7.9l4 3.8M15.4 4.9l4.9 4.6" /></Icon>,
  wavy: <Icon><path d="M4 19c1.3-2.2 2.9-.1 4.2-2.2s1-3.6 2.4-5.4 3-.3 4.4-2.1 1-3.6 2.4-5.4" /></Icon>,
  partial: <Icon><path d="M5 18L19 6" strokeDasharray="3 2.6" /></Icon>,
  hbond: <Icon><path d="M5 18L19 6" strokeDasharray="0 3.6" strokeWidth="2.4" /></Icon>,
  dative: <Icon><path d="M5 18l10.5-9" /><path d="M19.5 5.5l-6.6 1.6 3.4 3.9z" fill="currentColor" /></Icon>,
  chain: <Icon><path d="M3 15l4.5-6 4.5 6 4.5-6 4.5 6" /></Icon>,
  benzene: <Icon>{hexagon(12, 12, 8)}<path d={benzeneInner()} /></Icon>,
  aromatic: <Icon>{hexagon(12, 12, 8)}<circle cx="12" cy="12" r="4.3" /></Icon>,
  ring: <Icon>{hexagon(12, 12, 8)}</Icon>,
  atom: <Icon><circle cx="12" cy="12" r="8" /><text x="12" y="16" fontSize="10" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="600">C</text></Icon>,
  deltaPlus: <Icon><text x="3" y="17" fontSize="13" fill="currentColor" stroke="none">δ</text><path d="M14 10h7M17.5 6.5v7" /></Icon>,
  deltaMinus: <Icon><text x="3" y="17" fontSize="13" fill="currentColor" stroke="none">δ</text><path d="M14 10h7" /></Icon>,
  plusCharge: <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8.5v7M8.5 12h7" /></Icon>,
  minusCharge: <Icon><circle cx="12" cy="12" r="8" /><path d="M8.5 12h7" /></Icon>,
  radical: <Icon><path d="M15.5 9.2a5.2 5.2 0 1 0 0 7.6" /><circle cx="19" cy="6" r="2.1" fill="currentColor" stroke="none" /></Icon>,
  pairs: <Icon><circle cx="10.5" cy="13.5" r="4.6" /><circle cx="8.2" cy="5" r="1.4" fill="currentColor" stroke="none" /><circle cx="12.8" cy="5" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="11.2" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="15.8" r="1.4" fill="currentColor" stroke="none" /></Icon>,
  // orbitals: a p orbital (one lobe shaded), a hybrid (a big lobe, a small one behind), an s orbital round its atom
  orbitalP: <Icon><path d="M12 12C10.7 9.2 9.3 7.8 9.3 5.8a2.7 2.7 0 0 1 5.4 0c0 2-1.4 3.4-2.7 6.2z" fill="currentColor" /><path d="M12 12c-1.3 2.8-2.7 4.2-2.7 6.2a2.7 2.7 0 0 0 5.4 0c0-2-1.4-3.4-2.7-6.2z" /></Icon>,
  orbitalHybrid: <Icon><path d="M9 12c3-1.7 4.6-3.7 7.4-3.7a3.7 3.7 0 0 1 0 7.4c-2.8 0-4.4-2-7.4-3.7z" fill="currentColor" /><path d="M9 12c-1-.8-1.9-1.7-3-1.7a1.7 1.7 0 0 0 0 3.4c1.1 0 2-.9 3-1.7z" /></Icon>,
  orbitalOverlap: <Icon><path d="M6.5 11C5.2 9.4 4.4 8.3 4.4 7a2.1 2.1 0 0 1 4.2 0c0 1.3-.8 2.4-2.1 4z" fill="currentColor" /><path d="M17.5 13c1.3 1.6 2.1 2.7 2.1 4a2.1 2.1 0 0 1-4.2 0c0-1.3.8-2.4 2.1-4z" fill="currentColor" /><path d="M8.6 12.4l1.1 1M11.4 14.9l1.1 1" /></Icon>,
  orbitalS: <Icon><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /></Icon>,
  curve: <Icon><path d="M4.5 19.5C4 11 10.5 5 17.2 8.4" /><path d="M20.6 10.6l-5.3 1.1 1.9-5.3z" fill="currentColor" /></Icon>,
  fishhook: <Icon><path d="M4.5 19.5C4 11 10.5 5 17.2 8.4l2.6 2" /><path d="M19.8 10.4l-5.4.9" /></Icon>,
  rxn: <Icon><path d="M3.5 12h15" /><path d="M21 12l-5-3.2v6.4z" fill="currentColor" /></Icon>,
  equilibrium: <Icon><path d="M3.5 9.5h16l-4-3M20.5 14.5h-16l4 3" /></Icon>,
  // (lying one way: the other harpoon shorter)
  equilibriumForward: <Icon><path d="M3.5 9.5h16l-4-3M15.5 14.5h-7l4 3" /></Icon>,
  equilibriumBack: <Icon><path d="M8.5 9.5h7l-4-3M20.5 14.5h-16l4 3" /></Icon>,
  resonance: <Icon><path d="M6 12h12" /><path d="M21 12l-4-2.8v5.6zM3 12l4-2.8v5.6z" fill="currentColor" /></Icon>,
  failed: <Icon><path d="M3.5 12h15" /><path d="M21 12l-5-3.2v6.4z" fill="currentColor" /><path d="M8.6 8.4l3.6 7.2M12.2 8.4l-3.6 7.2" /></Icon>,
  same: <Icon><path d="M4 9.5h16M4 14.5h16" /></Icon>,
  multistep: <Icon><path d="M2.5 9h11.3M7 15h11.3" /><path d="M17 9l-3.6-2.6v5.2zM21.5 15l-3.6-2.6v5.2z" fill="currentColor" /></Icon>,
  retro: <Icon><path d="M3.5 9.6h13.5M3.5 14.4h13.5M14.5 6l6 6-6 6" /></Icon>,
  plus: <Icon><path d="M12 5v14M5 12h14" /></Icon>,
  dipole: <Icon><path d="M4 12h12.5M7 8.5v7" /><path d="M20.5 12l-4.6-2.8v5.6z" fill="currentColor" /></Icon>,
  bracket: <Icon><path d="M8 4.5H5v15h3M16 4.5h3v15h-3" /><text x="21.5" y="7" fontSize="6" fill="currentColor" stroke="none">‡</text></Icon>,
  text: <Icon><path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5" /></Icon>,
  // a text's lines from the left, centred, from the right
  alignLeft: <Icon size={18}><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /></Icon>,
  alignCentre: <Icon size={18}><path d="M4 6h16M7 10h10M4 14h16M7 18h10" /></Icon>,
  alignRight: <Icon size={18}><path d="M4 6h16M10 10h10M4 14h16M10 18h10" /></Icon>,
  paint: <Icon><path d="M4.5 13.5l7.8-7.8a1.5 1.5 0 012.1 0l3.9 3.9a1.5 1.5 0 010 2.1l-7.8 7.8z" /><path d="M8 10l6 6" /><path d="M19.5 15.5s1.7 2.1 1.7 3.2a1.7 1.7 0 01-3.4 0c0-1.1 1.7-3.2 1.7-3.2z" fill="currentColor" /></Icon>,
  highlighter: <Icon size={16}><path d="M9 15l-3 3h5l1.5-1.5M9 15l7.5-7.5a2 2 0 012.8 2.8L11.8 17.8z" /></Icon>,
  undo: <Icon><path d="M9 7L4.5 11.5 9 16" /><path d="M5 11.5h9.5a5 5 0 010 10H11" /></Icon>,
  redo: <Icon><path d="M15 7l4.5 4.5L15 16" /><path d="M19 11.5H9.5a5 5 0 000 10H13" /></Icon>,
  newDoc: <Icon><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M12 11v6M9 14h6" /></Icon>,
  open: <Icon><path d="M3.5 7.5v11h17v-9H12L10 7H3.5z" /><path d="M3.5 7.5V5.5h6l2 2" /></Icon>,
  save: <Icon><path d="M5 4h11.5L20 7.5V20H5z" /><path d="M8 4v5h7V4M8 20v-6h9v6" /></Icon>,
  export: <Icon><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" /><path d="M5 14v6h14v-6" /></Icon>,
  install: <Icon><rect x="3.5" y="4.5" width="17" height="12" rx="2" /><path d="M12 7.5v5.5M9.5 10.5L12 13l2.5-2.5M8.5 20h7" /></Icon>,
  layout: <Icon><polygon points="9.5,8.5 14.3,11.25 14.3,16.75 9.5,19.5 4.7,16.75 4.7,11.25" /><path d="M18 2.8c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3z" /><path d="M20.5 11v2.6M19.2 12.3h2.6" /></Icon>,
  align: <Icon><path d="M4 3.5v17" /><rect x="6.5" y="6" width="12" height="4" rx="1" /><rect x="6.5" y="14" width="7" height="4" rx="1" /></Icon>,
  alignReaction: <Icon><circle cx="5" cy="12" r="2.6" /><path d="M9.8 12h6.5" /><path d="M19 12l-3-2v4z" fill="currentColor" /><path d="M4 18.5h16" strokeDasharray="1.5 2" /></Icon>,
  turn3d: <Icon><path d="M12 3.5l7.5 4.3v8.4L12 20.5l-7.5-4.3V7.8z" /><path d="M4.5 7.8L12 12l7.5-4.2M12 12v8.5" /></Icon>,
  snap: <Icon><path d="M4 18L18 6" strokeDasharray="2 2.4" /><path d="M4 18h16" /><path d="M14 13.6a6 6 0 01.8 4.4" /></Icon>,
  flipH: <Icon><path d="M12 3v18" strokeDasharray="2 2" /><path d="M9 7L4 17h5zM15 7l5 10h-5z" /></Icon>,
  flipV: <Icon><path d="M3 12h18" strokeDasharray="2 2" /><path d="M7 9L17 4v5zM7 15l10 5v-5z" /></Icon>,
  // a bond as the axle, a part turning half a circle about it
  flipBond: <Icon><path d="M4 20L20 4" /><path d="M5.5 11.5L9 5.5l2 3.5zM12.5 18.5l6-3.5-3.5-2z" /><path d="M14 4.8a7 7 0 0 1 5.2 5.2" /><path d="M19.6 7.6l-.4 2.4-2.2-1" /></Icon>,
  // a chair (taller than drawn, to read at this size), and a two-way arrow over it
  chairTurn: <Icon><path d="M2.7 13l7.1 3.1 7.2-3.1 4.3 7.4-7.1-3.1-7.1 3.1z" /><path d="M12 10.2A7.5 3 0 1 1 19.5 7.2" /><path d="M17.6 6.3l1.9.9.9-1.9" /></Icon>,
  ringFlip: <Icon><path d="M2.7 12l7.1 3.1 7.2-3.1 4.3 7.4-7.1-3.1-7.1 3.1z" /><path d="M6 8a7.5 4.5 0 0 1 12 0" /><path d="M4.4 6.2l1.6 1.9 2.2-.9M19.6 6.2L18 8.1l-2.2-.9" /></Icon>,
  fischer: <Icon><path d="M12 2.5v19M6 7.5h12M6 12h12M6 16.5h12" /></Icon>,
  zigzag: <Icon><path d="M2.5 16l4.75-6 4.75 6 4.75-6 4.75 6" /><path d="M12 16l-1.4-9h2.8z" fill="currentColor" stroke="none" /></Icon>,
  zoomIn: <Icon><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20M10.5 8v5M8 10.5h5" /></Icon>,
  zoomOut: <Icon><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20M8 10.5h5" /></Icon>,
  fit: <Icon><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></Icon>,
  settings: <Icon><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></Icon>,
  debug: <Icon><rect x="7" y="7.5" width="10" height="12" rx="5" /><path d="M12 11v8M7 12.5H3.5M20.5 12.5H17M7.6 16.5l-3 2M16.4 16.5l3 2M7.6 9l-2.8-2M16.4 9l2.8-2M9.5 7.5a2.5 2.5 0 015 0" /></Icon>,
  keyboard: <Icon><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 9.5h.01M9.3 9.5h.01M12.6 9.5h.01M15.9 9.5h.01M18.2 9.5h.01M6 12.5h.01M18.2 12.5h.01M8.5 15h7" strokeWidth="2" /></Icon>,
  info: <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6v.4" /></Icon>,
  trash: <Icon><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" /></Icon>,
  close: <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>,
  // a video: a play triangle in a circle
  play: <Icon><circle cx="12" cy="12" r="9" /><path d="M10 8.3l5.6 3.7-5.6 3.7z" fill="currentColor" /></Icon>,
  chevron: <Icon><path d="M9 6l6 6-6 6" /></Icon>,
  swap: <Icon><path d="M4 8h13l-3-3M20 16H7l3 3" /></Icon>,
  cut: <Icon><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="6.5" cy="17.5" r="2.5" /><path d="M8.6 8l11 9.5M8.6 16l11-9.5" /></Icon>,
  paste: <Icon><rect x="5.5" y="5" width="13" height="15.5" rx="2" /><path d="M9 5V3.8h6V5M9 10.5h6M9 14h4" /></Icon>,
  present: <Icon><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v3M8 20.5h8M10 8.2v4.6l4-2.3z" /></Icon>,
  more: <Icon><circle cx="5.5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" /></Icon>,
  objects: <Icon><rect x="3.5" y="4.5" width="4" height="4" rx="1" /><rect x="3.5" y="15.5" width="4" height="4" rx="1" /><path d="M11 6.5h9.5M14 12h6.5M11 17.5h9.5M8.5 12h2.5" /><rect x="6.5" y="10" width="4" height="4" rx="1" /></Icon>,
  group: <Icon><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" strokeDasharray="3 2.5" /><rect x="7" y="7" width="5" height="5" rx="1" /><circle cx="15" cy="15" r="2.6" /></Icon>,
  ungroup: <Icon><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><circle cx="16.5" cy="16.5" r="3.5" /><path d="M14 5h5v5M5 14v5h5" strokeDasharray="2 2" /></Icon>,
  duplicate: <Icon><path d="M9 7.5h7l3.5 3.5v9.5H9z" /><path d="M6 16.5V4h7l1.5 1.5" /></Icon>,
  copy: <Icon><rect x="8" y="8" width="11.5" height="11.5" rx="2" /><path d="M5 15.5V5.5a1 1 0 011-1h9.5" /></Icon>,
  search: <Icon><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></Icon>,
  atomNumber: <Icon><path d="M3 18l5.5-3.5 5.5 3.5 5.5-3.5" /><text x="8.5" y="10.5" fontSize="8" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">1</text><text x="16" y="10.5" fontSize="8" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">2</text></Icon>,
  mail: <Icon><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></Icon>,
  // two molecules (a dot each) held by a dashed link
  link: <Icon><circle cx="6" cy="12" r="3" /><circle cx="18" cy="12" r="3" /><path d="M9.5 12h5" strokeDasharray="1.5 2" /></Icon>,
  external: <Icon><path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 14v4.5a1 1 0 01-1 1H5.5a1 1 0 01-1-1V8a1 1 0 011-1H10" /></Icon>,
  templates: <Icon><rect x="3" y="3" width="18" height="18" rx="4" /><polygon points="12,6.5 16.3,9 16.3,14 12,16.5 7.7,14 7.7,9" /></Icon>,
  table: <Icon><rect x="3" y="5" width="4" height="4" rx=".8" /><rect x="10" y="5" width="4" height="4" rx=".8" /><rect x="17" y="5" width="4" height="4" rx=".8" /><rect x="3" y="12" width="4" height="4" rx=".8" /><rect x="10" y="12" width="4" height="4" rx=".8" /><rect x="17" y="12" width="4" height="4" rx=".8" /><path d="M5 19.5h14" /></Icon>,
  sun: <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></Icon>,
  moon: <Icon><path d="M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z" /></Icon>,
};

export function RingIcon({ size: n, aromatic, px = 20 }) {
  if (aromatic) return icons.benzene;
  return (
    <Icon size={px}><polygon points={polygonPoints(n, 12, 12.5, n === 3 ? 8.5 : 8)} /></Icon>
  );
}
