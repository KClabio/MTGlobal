// Turns the posted solution-page editor (nested sections[i][…], items[j], media[k] + new files) into clean page data.
// Returns { page, errors, added }: errors are translated messages; added are the URLs of files uploaded with this save.
const path = require('path');
const crypto = require('crypto');
const { SECTION_KINDS, RATIOS, DISPLAYS } = require('../models/SolutionPage');
const { toPlainText } = require('./text');

const LIMITS = { sections: 40, items: 40, media: 60 };
const VIDEO_EXT = ['.mp4', '.webm', '.ogg'];
const KINDS_WITH_ITEMS = ['text', 'cards', 'steps', 'stats', 'buttons'];
const KINDS_WITH_MEDIA = ['text', 'gallery'];

const str = (v) => (typeof v === 'string' ? v : '');
const asList = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const plain = (v) => toPlainText(str(v));
const flag = (v) => str(v) === '1';
const isLink = (url) => /^\/(?!\/)/.test(url) || /^https?:\/\/[^\s]+$/i.test(url);

function parseSolutionPageForm(body, files, { existingMedia, fileUrl, prefix }, t) {
  const errors = [];
  const allowed = new Set(existingMedia); // only media already on this page may be kept (no arbitrary paths)
  const uploads = {}; // section uid -> [{ type, src }]
  const added = [];
  (files || []).forEach((file) => {
    if (!file.fieldname.startsWith(prefix)) return;
    const uid = file.fieldname.slice(prefix.length);
    const src = fileUrl(file);
    added.push(src);
    (uploads[uid] = uploads[uid] || []).push({
      type: VIDEO_EXT.includes(path.extname(file.originalname).toLowerCase()) ? 'video' : 'image',
      src, poster: '', captionVi: '', captionEn: '', contain: false,
    });
  });

  const sections = asList(body.sections).slice(0, LIMITS.sections).map((raw, i) => {
    const n = i + 1;
    const kind = SECTION_KINDS.includes(str(raw.kind)) ? raw.kind : 'text';
    const uid = /^[\w-]{4,40}$/.test(str(raw.uid)) ? raw.uid : crypto.randomUUID().slice(0, 8);
    const section = {
      uid, kind,
      titleVi: str(raw.titleVi).trim(), titleEn: str(raw.titleEn).trim(),
      navVi: str(raw.navVi).trim().slice(0, 40), navEn: str(raw.navEn).trim().slice(0, 40),
      subtitleVi: kind === 'text' ? '' : plain(raw.subtitleVi), subtitleEn: kind === 'text' ? '' : plain(raw.subtitleEn),
      textVi: kind === 'stats' || kind === 'buttons' ? '' : plain(raw.textVi),
      textEn: kind === 'stats' || kind === 'buttons' ? '' : plain(raw.textEn),
      columns: str(raw.columns) === '3' ? 3 : 2,
      ratio: RATIOS.includes(str(raw.ratio)) ? raw.ratio : '4/3',
      display: Object.prototype.hasOwnProperty.call(DISPLAYS, str(raw.display)) && DISPLAYS[raw.display].includes(kind) ? raw.display : '',
      continued: i > 0 && flag(raw.continued),
      items: [],
      media: [],
    };

    if (KINDS_WITH_ITEMS.includes(kind)) {
      const isButtons = kind === 'buttons' || kind === 'text';
      section.items = asList(raw.items).slice(0, LIMITS.items)
        .map((it) => ({
          titleVi: str(it.titleVi).trim(), titleEn: str(it.titleEn).trim(),
          textVi: isButtons ? '' : plain(it.textVi), textEn: isButtons ? '' : plain(it.textEn),
          url: isButtons ? str(it.url).trim() : '', primary: isButtons && flag(it.primary),
        }))
        .filter((it) => it.titleVi || it.titleEn || it.textVi || it.textEn || it.url);
      section.items.forEach((it, j) => {
        if (isButtons) {
          if (!it.titleVi && !it.titleEn) errors.push(t('admin.pages.errButtonLabel', { n, m: j + 1 }));
          if (!isLink(it.url)) errors.push(t('admin.pages.errButtonUrl', { n, m: j + 1 }));
        } else if (!it.titleVi && !it.titleEn) {
          errors.push(t(kind === 'stats' ? 'admin.pages.errStatValue' : 'admin.pages.errItemTitle', { n, m: j + 1 }));
        }
      });
    }

    if (KINDS_WITH_MEDIA.includes(kind)) {
      const kept = asList(raw.media)
        .filter((m) => allowed.has(str(m.src)))
        .map((m) => ({
          type: str(m.type) === 'video' ? 'video' : 'image',
          src: m.src,
          poster: allowed.has(str(m.poster)) ? str(m.poster) : '',
          captionVi: str(m.captionVi).trim(), captionEn: str(m.captionEn).trim(),
          contain: flag(m.contain),
        }));
      section.media = kept.concat(uploads[uid] || []).slice(0, kind === 'text' ? 1 : LIMITS.media);
      if (kind === 'text' && kept.length + (uploads[uid] || []).length > 1) errors.push(t('admin.pages.errTextOneImage', { n }));
    }

    const hasContent = section.titleVi || section.titleEn || section.textVi || section.textEn || section.items.length || section.media.length;
    if (!hasContent) errors.push(t('admin.pages.errEmptySection', { n }));
    if (kind === 'gallery' && !section.media.length) errors.push(t('admin.pages.errGalleryEmpty', { n }));
    return section;
  });

  return {
    page: { sections },
    errors,
    added,
  };
}

module.exports = { parseSolutionPageForm, LIMITS };
