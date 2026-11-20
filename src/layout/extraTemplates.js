// Ring-system templates of our own, in the same CXSMARTS format as
// ringTemplateData.js, for ring systems RDKit's set lacks.
export default [
  {
    // RDKit template #42 (4,5-epoxymorphinan, e.g. morphine) without the O
    // bridge: atom 6 removed, so it fits levorphanol, dextromethorphan etc.
    name: 'morphinan',
    template:
      '[!#200]1~[!#200]~[!#200&D3]2~[!#200&D3]3~[!#200](~[!#200]~1).[!#200]1~[!#200]~[!#200]~[!#200&D2]~[!#200&D3]4~[!#200](~[!#200]~2)~[!#200]~[!#200&D2]~[!#200&D2]~[!#200&D4]~3~1~4 |(-4.19,-0.81,;-3.47,0.44,;-2.03,0.44,;-1.31,-0.8,;-2.03,-2.05,;-3.47,-2.05,;0.85,-2.05,;2.29,-2.05,;3.01,-0.8,;2.29,0.45,;0.85,0.45,;0.13,1.69,;-1.31,1.69,;1.74,1.83,;2.59,0.45,;1.75,-0.93,;0.13,-0.8,;)|',
  },
];
