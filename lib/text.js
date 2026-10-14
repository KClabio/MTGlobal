// Plain-text content fields: admins type ordinary text; the site turns it into paragraphs.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&nbsp;': ' ' };

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

const BULLET = /^[-*•]\s+/;

// Plain text -> safe HTML: blank lines separate paragraphs, single line breaks become <br>,
// and consecutive lines starting with "- ", "* " or "• " become a bulleted list
function plainTextToHtml(text) {
  if (!text) return '';
  const blocks = String(text)
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length);

  const html = [];
  for (const lines of blocks) {
    // Group consecutive lines of the same kind (bullet vs. normal text)
    let group = null;
    const flush = () => {
      if (!group) return;
      html.push(group.list
        ? `<ul>${group.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
        : `<p>${group.lines.map(escapeHtml).join('<br>')}</p>`);
      group = null;
    };
    for (const line of lines) {
      const isBullet = BULLET.test(line);
      if (!group || group.list !== isBullet) { flush(); group = { list: isBullet, lines: [] }; }
      group.lines.push(isBullet ? line.replace(BULLET, '') : line);
    }
    flush();
  }
  return html.join('\n');
}

// Any input (including pasted HTML) -> plain text, keeping paragraphs, line breaks and list items ("- ")
function toPlainText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<\/(ul|ol)\s*>/gi, '\n\n')
    .replace(/<(ul|ol)[^>]*>/gi, '\n\n')
    .replace(/<\/(p|div|h[1-6]|blockquote)\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|nbsp|#0?39);/g, (entity) => ENTITIES[entity])
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(- .*)\n\n(?=- )/gm, '$1\n') // keep the items of one list together
    .trim();
}

// Short one-line preview (e.g. product cards): bullets and line breaks become spaces, cut at a word
function excerpt(text, max = 90) {
  const flat = toPlainText(text || '')
    .split('\n')
    .map((line) => line.replace(BULLET, '').trim())
    .filter(Boolean)
    .join(' ');
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, '')}…`;
}

module.exports = { escapeHtml, plainTextToHtml, toPlainText, excerpt };
