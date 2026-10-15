import type { SpellIcon } from '../game/cards';
import { SPELL_ART } from './spellArt';

/** Hand-drawn style SVG glyphs for spell art. */
const PATHS: Record<SpellIcon, string> = {
  fire: '<path d="M50 8c6 18 26 26 26 50a26 26 0 0 1-52 0c0-12 6-20 12-26 0 10 4 16 10 18-4-16 0-30 4-42z" fill="url(#g)"/><path d="M50 52c4 8 12 10 12 22a12 12 0 0 1-24 0c0-6 4-10 6-12 0 4 2 6 4 6-2-6 0-12 2-16z" fill="#fff6c8"/>',
  bolt: '<path d="M58 6 22 56h22l-8 38 40-54H54z" fill="url(#g)" stroke="#fff8c0" stroke-width="3" stroke-linejoin="round"/>',
  storm: '<circle cx="50" cy="50" r="30" fill="none" stroke="url(#g)" stroke-width="6" stroke-dasharray="18 10"/><path d="M54 18 36 52h14l-6 30 22-38H52z" fill="#eaf7ff"/>',
  frost: '<g stroke="url(#g)" stroke-width="7" stroke-linecap="round"><path d="M50 10v80M15 30l70 40M15 70l70-40"/></g><g stroke="#eaffff" stroke-width="3" stroke-linecap="round"><path d="M42 18l8 8 8-8M42 82l8-8 8 8"/></g><circle cx="50" cy="50" r="9" fill="#eaffff"/>',
  wave: '<path d="M8 62c14-18 26-18 40 0s26 18 44 0" fill="none" stroke="url(#g)" stroke-width="8" stroke-linecap="round"/><path d="M8 42c14-18 26-18 40 0s26 18 44 0" fill="none" stroke="#f3ecff" stroke-width="5" stroke-linecap="round" opacity=".8"/>',
  heart: '<path d="M50 86 16 52a20 20 0 0 1 34-26 20 20 0 0 1 34 26z" fill="url(#g)"/><path d="M50 34v32M34 50h32" stroke="#fff" stroke-width="7" stroke-linecap="round"/>',
  shield: '<path d="M50 8 84 20v26c0 22-14 38-34 46-20-8-34-24-34-46V20z" fill="url(#g)" stroke="#fff3c8" stroke-width="3"/><path d="M50 22v58M28 40h44" stroke="#5a3a14" stroke-width="5" opacity=".6"/>',
  scroll: '<rect x="22" y="16" width="56" height="68" rx="6" fill="url(#g)"/><path d="M32 32h36M32 44h36M32 56h28M32 68h20" stroke="#6b4a24" stroke-width="4" stroke-linecap="round"/>',
  meteor: '<path d="M14 14l40 40" stroke="#ffb070" stroke-width="10" stroke-linecap="round" opacity=".7"/><path d="M28 10l32 32M10 30l32 32" stroke="#ff7a3a" stroke-width="5" stroke-linecap="round" opacity=".6"/><circle cx="64" cy="64" r="22" fill="url(#g)"/>',
  sword: '<path d="M50 6l8 14v44H42V20z" fill="url(#g)"/><path d="M30 64h40v8H30z" fill="#d9a441"/><path d="M46 72h8v18h-8z" fill="#7a4a1e"/>',
  skull: '<path d="M50 12c-20 0-32 14-32 30 0 10 5 17 12 21v13h40V63c7-4 12-11 12-21 0-16-12-30-32-30z" fill="url(#g)"/><circle cx="38" cy="44" r="8" fill="#1a2a12"/><circle cx="62" cy="44" r="8" fill="#1a2a12"/><path d="M44 66v10M50 66v10M56 66v10" stroke="#1a2a12" stroke-width="3"/>',
  arrows: '<g stroke="url(#g)" stroke-width="6" stroke-linecap="round"><path d="M20 84 72 32M36 88 84 40M14 66 62 18"/></g><g fill="#fff4d6"><path d="M72 32l-4-16 16 4zM84 40l-4-16 16 4zM62 18l-4-14 14 4z"/></g>',
  potion: '<path d="M40 10h20v18l18 30a22 22 0 0 1-56 0l18-30z" fill="url(#g)" stroke="#e8f4ff" stroke-width="3"/><path d="M28 64h44" stroke="#ffffff" stroke-width="3" opacity=".6"/><circle cx="44" cy="74" r="4" fill="#fff" opacity=".7"/>',
  curse: '<path d="M50 8c10 16 30 22 30 46a30 30 0 0 1-60 0c0-24 20-30 30-46z" fill="url(#g)"/><circle cx="50" cy="56" r="10" fill="#0c2410"/><circle cx="50" cy="56" r="4" fill="#bfff9a"/>',
};

const GRADIENTS: Record<SpellIcon, [string, string]> = {
  fire: ['#ffd36b', '#ff4a12'], bolt: ['#fffbd0', '#ffc21a'], storm: ['#cdeeff', '#3c8dff'],
  frost: ['#e8fdff', '#46c3ff'], wave: ['#efe6ff', '#8c6bff'], heart: ['#c8ffd9', '#26c26b'],
  shield: ['#fff1c2', '#d29a2a'], scroll: ['#fff3d6', '#d6b47a'], meteor: ['#ffd27a', '#e2341a'], sword: ['#ffffff', '#9fb4c8'],
  skull: ['#f4ffe8', '#9dbf8a'], curse: ['#d6ffb0', '#2a9a3a'],
  arrows: ['#fff1c8', '#b8863a'], potion: ['#cfe8ff', '#3a6aff'],
};

export function spellIconSvg(icon: SpellIcon): string {
  const [a, b] = GRADIENTS[icon];
  // Gradient ids are global in the document, so make them unique per icon.
  const id = `g-${icon}`;
  const body = PATHS[icon].replaceAll('url(#g)', `url(#${id})`);
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>${body}</svg>`;
}

/**
 * A spell card's own picture (a game-icons.net glyph, see spellArt.ts) in its element's colours.
 * Falls back to the element glyph for a spell without one.
 */
export function spellArtSvg(cardId: string, icon: SpellIcon): string {
  const body = SPELL_ART[cardId];
  if (!body) return spellIconSvg(icon);
  const [a, b] = GRADIENTS[icon];
  const id = `ga-${cardId}`;
  return `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><g fill="url(#${id})">${body.replaceAll('currentColor', `url(#${id})`)}</g></svg>`;
}

export const SPELL_BACKDROP: Record<SpellIcon, string> = {
  fire: 'radial-gradient(circle at 50% 60%, #7a2a0c, #2a0e08)',
  bolt: 'radial-gradient(circle at 50% 40%, #6b5a12, #1c1808)',
  storm: 'radial-gradient(circle at 50% 50%, #1e4a7a, #0b1426)',
  frost: 'radial-gradient(circle at 50% 50%, #2a6a8a, #0b1c26)',
  wave: 'radial-gradient(circle at 50% 50%, #4a3a8a, #140e2a)',
  heart: 'radial-gradient(circle at 50% 50%, #1e6a42, #0b2014)',
  shield: 'radial-gradient(circle at 50% 50%, #6a4a1a, #22160a)',
  scroll: 'radial-gradient(circle at 50% 50%, #5a4a32, #1e1810)',
  meteor: 'radial-gradient(circle at 70% 70%, #8a2a0a, #1a0806)',
  sword: 'radial-gradient(circle at 50% 50%, #3a4a5a, #10161c)',
  skull: 'radial-gradient(circle at 50% 50%, #2a3a22, #0b100a)',
  curse: 'radial-gradient(circle at 50% 50%, #1e4a22, #081208)',
  arrows: 'radial-gradient(circle at 50% 50%, #5a4424, #1a120a)',
  potion: 'radial-gradient(circle at 50% 50%, #24306a, #0a0e22)',
};
