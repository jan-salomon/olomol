// node show.mjs out pattern: the repro (model, compact) and first detail of each kind matching
import { readFileSync, existsSync } from 'node:fs';
const [dir, pattern] = process.argv.slice(2);
const res = JSON.parse(readFileSync(`${dir}/results.json`, 'utf8'));
for (const k of res.kinds.filter((k) => new RegExp(pattern).test(k.sig))) {
  console.log(`=== ${k.sig} (${k.count})  ${k.case}`);
  console.log('detail:', k.detail?.slice(0, 500));
  if (k.file && existsSync(`${dir}/${k.file}.json`)) {
    const j = JSON.parse(readFileSync(`${dir}/${k.file}.json`, 'utf8'));
    const strip = (o) => Object.fromEntries(Object.entries(o).filter(([key, v]) => v !== null && v !== '' && !(key === 'charge' && v === 0) && !(key === 'radical' && v === 0) && !(key === 'order' && v === 1)).map(([key, v]) => [key, typeof v === 'number' ? +v.toFixed(3) : v]));
    console.log('ids:', JSON.stringify(j.ids));
    for (const [kind, list] of Object.entries(j.doc)) if (Array.isArray(list) && list.length) console.log(` ${kind}:`, list.map((o) => JSON.stringify(strip(o))).join('\n   '));
  } else if (k.file && existsSync(`${dir}/${k.file}.olom`)) console.log(readFileSync(`${dir}/${k.file}.olom`, 'utf8').slice(0, 1500));
}
