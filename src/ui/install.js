// Installing the site as an app, where the browser offers it: Chrome and
// Edge do (index.html keeps their offer until the app is there); Safari has
// Share, Add to Home Screen; Firefox on Linux has no way.
const listeners = new Set();
const changed = () => {
  for (const listener of listeners) listener();
};
addEventListener('installoffer', changed);
addEventListener('appinstalled', () => {
  window.installOffer = null;
  changed();
});

export const installOffer = () => window.installOffer ?? null;

export function onInstallOffer(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// the browser's own question (an offer is good for one question)
export async function install() {
  const offer = installOffer();
  window.installOffer = null;
  changed();
  await offer?.prompt();
}
