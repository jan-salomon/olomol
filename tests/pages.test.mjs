// The about page's questions as FAQPage JSON-LD (scripts/pages.mjs): plain text, its character references as
// the characters, an answer of two paragraphs whole; one it doesn't know stops the build
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitPage } from '../scripts/pages.mjs';

const page = (answers) => `<!doctype html>
<html lang="en">
<head>
<title lang="en">About</title><title lang="cs">O programu</title>
<script data-to-language></script>
</head>
<body>
<section id="faq">
  <div lang="en">
    <h3>Is it free?</h3>
    ${answers}
    <h3>Which files?</h3>
    <p>KET &amp; molfile; CO<sub>2</sub> drawn.</p>
  </div>
  <div lang="cs"><h3>Je zdarma?</h3><p>Ano.</p></div>
</section>
</body>
</html>`;
const faqOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test('the questions as FAQPage JSON-LD: plain text, references decoded, an answer of two paragraphs whole', () => {
  const out = splitPage(page('<p>Yes, <a href="LICENSE.txt">MIT</a>&nbsp;licence &#8211; no account.</p>\n<p>No adverts&#x2026;</p>'), 'about.html', 'en');
  const faq = faqOf(out);
  assert.equal(faq['@type'], 'FAQPage');
  assert.deepEqual(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), [
    ['Is it free?', 'Yes, MIT licence – no account. No adverts…'],
    ['Which files?', 'KET & molfile; CO2 drawn.'],
  ]);
  assert.ok(!out.includes('Je zdarma'), 'only the page\'s language');
});

test('a character reference pages.mjs doesn\'t know stops the build', () => {
  assert.throws(() => splitPage(page('<p>Yes &euro;</p>'), 'about.html', 'en'), /&euro;/);
});
