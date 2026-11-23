// What a run ran on: the olomol commit, the versions of Node, Chrome,
// Playwright and the chemistry engines, the date and the machine. Every
// results file carries it.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';

const root = new URL('../../', import.meta.url);
const packageVersion = (name) => {
  try {
    return JSON.parse(readFileSync(new URL(`node_modules/${name}/package.json`, root), 'utf8')).version;
  } catch {
    return null;
  }
};
const git = (args) => {
  try {
    return execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
};

let chromeVersion = null;
async function chrome() {
  if (chromeVersion) return chromeVersion;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
    chromeVersion = browser.version();
    await browser.close();
  } catch (error) {
    chromeVersion = `not available (${error.message.split('\n')[0]})`;
  }
  return chromeVersion;
}

export async function environment(RDKit = null) {
  const changed = git('status --porcelain --untracked-files=no -- src');
  return {
    olomol: JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version,
    commit: git('rev-parse HEAD'),
    commitShort: git('rev-parse --short HEAD'),
    commitDate: git('log -1 --format=%cI'),
    branch: git('rev-parse --abbrev-ref HEAD'),
    srcChanged: Boolean(changed), // src/ differs from the commit: the numbers are not that commit's
    tag: git('describe --tags --exact-match HEAD'),
    date: new Date().toISOString(),
    node: process.version,
    chrome: await chrome(),
    playwright: packageVersion('playwright'),
    rdkitJs: packageVersion('@rdkit/rdkit'),
    rdkitCore: RDKit?.version?.() ?? null,
    meganeRdkit: packageVersion('megane-rdkit'),
    indigo: packageVersion('indigo-ketcher'),
    openchemlib: packageVersion('openchemlib'),
    vite: packageVersion('vite'),
    machine: {
      cpu: os.cpus()[0]?.model ?? null,
      cores: os.cpus().length,
      ramGB: Math.round(os.totalmem() / 2 ** 30),
      os: `${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
    },
  };
}
