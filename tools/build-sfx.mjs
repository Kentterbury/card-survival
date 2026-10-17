// Picks the Kenney (CC0, https://kenney.nl) sound effects the game uses and converts them to small
// mono MP3s in public/assets/sfx/ (MP3 decodes in every browser, Safari included).
//
// Usage: node tools/build-sfx.mjs <dir with the unzipped packs>
//   packs: rpg-audio, impact-sounds, interface-sounds, music-jingles (kenney.nl/assets/<name>)
// Needs ffmpeg. Game sounds without a sample here stay synthesized (src/audio/sound.ts).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-sfx.mjs <kenney packs dir>');
  process.exit(1);
}

const RPG = 'rpg-audio/Audio';
const IMPACT = 'impact-sounds/Audio';
const UI = 'interface-sounds/Audio';
const JINGLE = 'music-jingles/Audio/Pizzicato jingles';

/** Game sound → source files (each becomes <sound>_<n>.mp3; one is picked at random). */
const SFX = {
  click: [`${UI}/click_001`, `${UI}/select_001`, `${UI}/select_002`],
  card: [`${RPG}/bookPlace1`, `${RPG}/bookPlace2`, `${RPG}/bookPlace3`],
  draw: [`${RPG}/bookFlip1`, `${RPG}/bookFlip2`, `${RPG}/bookFlip3`],
  summon: [`${IMPACT}/impactSoft_medium_000`, `${IMPACT}/impactSoft_medium_001`, `${IMPACT}/impactSoft_medium_002`],
  swing: [`${RPG}/knifeSlice`, `${RPG}/knifeSlice2`],
  hit: [`${IMPACT}/impactPunch_medium_000`, `${IMPACT}/impactPunch_medium_001`, `${IMPACT}/impactPunch_medium_002`],
  heroHit: [`${IMPACT}/impactPunch_heavy_000`, `${IMPACT}/impactPunch_heavy_001`, `${IMPACT}/impactPunch_heavy_002`],
  wardBreak: [`${IMPACT}/impactGlass_medium_000`, `${IMPACT}/impactGlass_medium_001`, `${IMPACT}/impactGlass_medium_002`],
  death: [`${IMPACT}/impactSoft_heavy_000`, `${IMPACT}/impactSoft_heavy_001`, `${IMPACT}/impactSoft_heavy_002`],
  coin: [`${RPG}/handleCoins`, `${RPG}/handleCoins2`],
  error: [`${UI}/error_001`, `${UI}/error_002`],
  myTurn: [`${UI}/confirmation_002`],
  // Pizzicato jingles: 10 a short rise, 02 a longer rise, 14 a fall.
  stageClear: [`${JINGLE}/jingles_PIZZI10`],
  victory: [`${JINGLE}/jingles_PIZZI02`],
  defeat: [`${JINGLE}/jingles_PIZZI14`],
};

const out = new URL('../public/assets/sfx/', import.meta.url).pathname;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const counts = {};
for (const [name, files] of Object.entries(SFX)) {
  files.forEach((f, i) => {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(src, `${f}.ogg`), '-ac', '1', '-ar', '44100', '-b:a', '64k', join(out, `${name}_${i}.mp3`)]);
  });
  counts[name] = files.length;
}
console.log(JSON.stringify(counts));
