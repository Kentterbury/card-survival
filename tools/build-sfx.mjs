// Picks the free (CC0) sounds and music the game uses and converts them to small MP3s in
// public/assets/sfx/ and public/assets/music/ (MP3 decodes in every browser, Safari included).
// Sources and authors are listed in public/assets/LICENSES.md.
//
// Usage: node tools/build-sfx.mjs <root>
//   <root>/kenney/<pack>/  unzipped Kenney packs (kenney.nl/assets/<pack>): rpg-audio, impact-sounds,
//                          interface-sounds, music-jingles, casino-audio
//   <root>/oga/            OpenGameArt downloads (see OGA below for the pages)
// Needs ffmpeg. Game sounds without a sample here stay synthesized (src/audio/sound.ts).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: node tools/build-sfx.mjs <root with kenney/ and oga/>');
  process.exit(1);
}

const RPG = 'kenney/rpg-audio/Audio';
const IMPACT = 'kenney/impact-sounds/Audio';
const UI = 'kenney/interface-sounds/Audio';
const JINGLE = 'kenney/music-jingles/Audio/Pizzicato jingles';
const CASINO = 'kenney/casino-audio/Audio';
// OpenGameArt (all CC0): 80-cc0-rpg-sfx (rubberduck), rpg-sound-pack (artisticdude), ice-spells (bart),
// freeze-spell-0 (artisticdude), cure-magic (Someoneman), magic-spell-sfx (JaggedStone),
// 3-dark-magic-spells (qubodup), fireball-1 (Julien Matthey).
const OGA = 'oga';

/**
 * Game sound → source files (each becomes <sound>_<n>.mp3; one is picked at random).
 * An entry is a path without extension, or [path, seconds] to cut a long one short (with a fade).
 */
const SFX = {
  click: [`${UI}/click_001`, `${UI}/select_001`, `${UI}/select_002`],
  card: [`${CASINO}/card-place-1`, `${CASINO}/card-place-2`, `${CASINO}/card-place-4`],
  draw: [`${CASINO}/card-slide-1`, `${CASINO}/card-slide-2`, `${CASINO}/card-slide-3`],
  shuffle: [[`${CASINO}/card-shuffle`, 1.2]],
  summon: [`${IMPACT}/impactSoft_medium_000`, `${IMPACT}/impactSoft_medium_001`, `${IMPACT}/impactSoft_medium_002`],
  swing: [`${OGA}/dl_rpg_sound_pack/RPG Sound Pack/battle/swing`, `${OGA}/dl_rpg_sound_pack/RPG Sound Pack/battle/swing2`, `${OGA}/dl_rpg_sound_pack/RPG Sound Pack/battle/swing3`],
  hit: [`${IMPACT}/impactPunch_medium_000`, `${IMPACT}/impactPunch_medium_001`, `${IMPACT}/impactPunch_medium_002`],
  heroHit: [`${IMPACT}/impactPunch_heavy_000`, `${IMPACT}/impactPunch_heavy_001`, `${IMPACT}/impactPunch_heavy_002`],
  wardBreak: [`${IMPACT}/impactGlass_medium_000`, `${IMPACT}/impactGlass_medium_001`, `${IMPACT}/impactGlass_medium_002`],
  death: [`${IMPACT}/impactSoft_heavy_000`, `${IMPACT}/impactSoft_heavy_001`, `${IMPACT}/impactSoft_heavy_002`],
  coin: [`${RPG}/handleCoins`, `${RPG}/handleCoins2`],
  error: [`${UI}/error_001`, `${UI}/error_002`],
  myTurn: [`${UI}/confirmation_002`],
  // Spells
  fire: [`${OGA}/rpg80/spell_fire_01`, `${OGA}/rpg80/spell_fire_02`, `${OGA}/rpg80/spell_fire_06`, [`${OGA}/dl_105016__julien-matthey__jm-fx-fireball-01`, 1.4]],
  frost: [[`${OGA}/dl_icespells/ice`, 1.2], [`${OGA}/dl_freeze`, 1.3], [`${OGA}/dl_icespells/coldsnap`, 1.3]],
  heal: [[`${OGA}/dl_curemagic/Cure2`, 1.2], [`${OGA}/dl_curemagic/Cure4`, 1.1], [`${OGA}/dl_curemagic/Cure3`, 1.3]],
  magic: [[`${OGA}/dl_magical_2`, 1.3], [`${OGA}/dl_magical_5`, 1.3], [`${OGA}/dl_magical_6_0`, 1.1]],
  curse: [[`${OGA}/dl_dark_magic/dark_magic/fout-02`, 1.2], [`${OGA}/dl_dark_magic/dark_magic/fout-01`, 1.4]],
  buff: [`${OGA}/rpg80/spell_01`, `${OGA}/rpg80/spell_02`],
  // Pizzicato jingles: 10 a short rise, 02 a longer rise, 14 a fall.
  stageClear: [`${JINGLE}/jingles_PIZZI10`],
  victory: [`${JINGLE}/jingles_PIZZI02`],
  defeat: [`${JINGLE}/jingles_PIZZI14`],
};

/** Background music (OpenGameArt, CC0): one track per mood. */
const MUSIC = {
  title: `${OGA}/music/Loop_The_Bards_Tale.wav`, // RandomMind — medieval-the-bards-tale
  forest: `${OGA}/music/GameMusic_ForestTheme_24_0.mp3`, // cynicmusic — dark-forest-theme
  dungeon: `${OGA}/music/dungeon.mp3`, // Katana — dungeon-theme-0
  cave: `${OGA}/music/S31-Going_Deep.ogg`, // section31 — going-deep
  boss: `${OGA}/music/Juhani_Junkala_-_Epic_Boss_Battle__Seamlessly_Looping_.wav`, // Juhani Junkala (SubspaceAudio) — boss-battle-music
};

const EXT = ['.ogg', '.wav', '.flac'];
function source(path) {
  for (const ext of EXT) {
    try {
      execFileSync('test', ['-f', join(root, path + ext)]);
      return join(root, path + ext);
    } catch { /* try the next */ }
  }
  throw new Error(`missing ${path}`);
}

function convert(input, output, { seconds, stereo = false, bitrate = '64k' } = {}) {
  const args = ['-v', 'error', '-y', '-i', input, '-ac', stereo ? '2' : '1', '-ar', '44100'];
  if (seconds) args.push('-t', String(seconds), '-af', `afade=t=out:st=${Math.max(0, seconds - 0.25)}:d=0.25`);
  args.push('-b:a', bitrate, output);
  execFileSync('ffmpeg', args);
}

const pub = new URL('../public/assets/', import.meta.url).pathname;
for (const dir of ['sfx', 'music']) {
  rmSync(join(pub, dir), { recursive: true, force: true });
  mkdirSync(join(pub, dir), { recursive: true });
}
const counts = {};
for (const [name, files] of Object.entries(SFX)) {
  files.forEach((entry, i) => {
    const [path, seconds] = Array.isArray(entry) ? entry : [entry];
    convert(source(path), join(pub, 'sfx', `${name}_${i}.mp3`), { seconds });
  });
  counts[name] = files.length;
}
for (const [name, file] of Object.entries(MUSIC)) {
  convert(join(root, file), join(pub, 'music', `${name}.mp3`), { stereo: true, bitrate: '96k' });
}
console.log(JSON.stringify(counts));
