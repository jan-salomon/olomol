// The page a "PubChem page" button opens (pubchem.html): it asks PubChem
// which compound the address names after # (inchikey=…, smiles=…, inchi=…,
// name=… or cid=…) and replaces itself with that compound's page, so Back
// skips it. With no compound of exactly that stereochemistry (an InChIKey),
// or a drawing without stereochemistry that PubChem also has with it, it
// says so and shows those with the same atoms and bonds as cards (PubChem's
// picture, name, number; shortest name first); with none at all it says so
// and links to PubChem's search.
import { t } from './i18n/i18n.js';
import { pageOf } from './io/pubchem.js';

try {
  const theme = localStorage.getItem('olomol-theme'); // as the drawing has it
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // the browser's
}

const query = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const message = document.getElementById('message');
message.textContent = t('Finding it on PubChem…');
pageOf(query).then(({ page, similar, exact, why }) => {
  if (page) {
    location.replace(page);
    return;
  }
  // a card for each compound: PubChem's picture of it, its name and number
  const card = (found, note) => {
    const link = document.createElement('a');
    link.className = 'card';
    link.href = found.page;
    const image = document.createElement('img');
    image.src = found.picture;
    image.alt = '';
    image.loading = 'lazy';
    image.onerror = () => { image.style.visibility = 'hidden'; }; // (no picture: the card keeps its shape)
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = found.title;
    name.title = found.title;
    const number = document.createElement('span');
    number.className = 'cid';
    number.textContent = note ? `CID ${found.cid} · ${note}` : `CID ${found.cid}`;
    link.append(image, name, number);
    return link;
  };
  // what matters, in bold, then what the cards are
  const heading = document.createElement('div');
  heading.className = 'notice';
  const strong = document.createElement('strong');
  strong.textContent = {
    open: t('Your drawing leaves stereochemistry open'),
    agreeing: t('Not with exactly this stereochemistry'),
    stereo: t("This stereoisomer isn't on PubChem"),
    isotopes: t('Not with exactly these isotopes'),
  }[why];
  const more = document.createElement('span');
  more.textContent = {
    open: t('The first card matches your drawing; the others agree with it and define more of its stereochemistry:'),
    agreeing: t('PubChem has no compound with exactly this stereochemistry. These agree with the stereocentres you drew (those you left open may be anything):'),
    stereo: t('PubChem has no compound with the stereochemistry you drew. These have the same atoms and bonds, with other stereochemistry:'),
    isotopes: t('PubChem has no compound with exactly these isotopes (and stereochemistry). These have the same atoms and bonds, with other isotopes or none:'),
  }[why];
  heading.append(strong, more);
  const cards = document.createElement('div');
  cards.className = 'cards';
  if (exact) cards.append(card(exact, t('as drawn')));
  for (const found of similar) cards.append(card(found));
  message.replaceChildren(heading, cards);
  message.classList.add('choice');
}, (error) => {
  const search = document.createElement('a');
  search.href = `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(Object.values(query)[0] ?? '')}`;
  search.textContent = t('Search PubChem');
  message.replaceChildren(`${error.message} `, search);
});
