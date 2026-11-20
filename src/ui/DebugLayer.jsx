// Debug mode on the canvas: what the drawing rules decided. Label boxes
// (bonds stop at them), lone pair places (hidden ones dashed), atom ids,
// and for each curved arrow the next-best candidate curves with their
// costs, the chosen one bold.
const f = (v) => +v.toFixed(3);

export default function DebugLayer({ editor, scene }) {
  const show = editor.debugLayers ?? { boxes: true, slots: true, ids: true, arrows: true };
  const items = [];
  for (const info of scene.atoms.values()) {
    const [x, y] = info.pos;
    if (show.boxes) {
      for (const [k, b] of (info.label?.boxes ?? []).entries()) {
        items.push(<rect key={`b${info.atom.id}-${k}`} x={x + b.x1} y={y + b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1}
          fill="none" stroke="#06b6d4" strokeWidth={0.012} />);
      }
    }
    if (show.slots) {
      for (const [k, slot] of info.electrons.slots.entries()) {
        items.push(<line key={`s${info.atom.id}-${k}`} x1={x} y1={y} x2={slot.point[0]} y2={slot.point[1]}
          stroke="#f59e0b" strokeWidth={0.015} strokeDasharray={slot.shown ? undefined : '0.04 0.04'} />);
      }
    }
    if (show.ids) {
      items.push(<text key={`i${info.atom.id}`} x={x + 0.12} y={y + 0.32} fontSize={0.2} fill="#a855f7" fontFamily="monospace">{info.atom.id}</text>);
    }
  }
  if (show.arrows) {
    for (const geometry of scene.curves.values()) {
      const candidates = geometry.debug?.candidates ?? [];
      candidates.slice(1, 8).forEach((c, k) => {
        const { p0, p1, p2, p3 } = c.shape;
        items.push(<path key={`c${geometry.curve.id}-${k}`} d={`M${f(p0[0])} ${f(p0[1])} C${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])} ${f(p3[0])} ${f(p3[1])}`}
          fill="none" stroke="#ef4444" strokeWidth={0.012} opacity={0.6} />);
        items.push(<text key={`ct${geometry.curve.id}-${k}`} x={p3[0] + 0.05} y={p3[1] - 0.05} fontSize={0.13} fill="#ef4444" fontFamily="monospace">{c.cost.toFixed(2)}</text>);
      });
      const best = geometry.debug?.best;
      if (best) {
        const parts = Object.entries(best.parts).filter(([, v]) => v > 0.005).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
        items.push(<text key={`cb${geometry.curve.id}`} x={best.shape.p0[0]} y={best.shape.p0[1] - 0.12} fontSize={0.14} fill="#16a34a" fontFamily="monospace">
          {`${best.cost.toFixed(2)}: ${parts || 'ideal'}`}
        </text>);
      }
    }
  }
  return <g>{items}</g>;
}
