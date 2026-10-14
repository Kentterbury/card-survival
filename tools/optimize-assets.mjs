// Copies the KayKit (CC0) source packs into public/assets, keeping only the
// animations the game uses and compressing geometry with meshopt.
//
// Usage: node tools/optimize-assets.mjs <dir containing the KayKit-* repos>
// Sources: https://github.com/KayKit-Game-Assets
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/optimize-assets.mjs <kaykit-source-dir>');
  process.exit(1);
}
const out = resolve('public/assets');

const ADV = 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf';
const SKL = 'KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons/Characters/gltf';
const DUN = 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf';

const CHARACTERS = [
  [ADV, 'Knight'], [ADV, 'Barbarian'], [ADV, 'Mage'], [ADV, 'Rogue'], [ADV, 'Rogue_Hooded'],
  [SKL, 'Skeleton_Minion'], [SKL, 'Skeleton_Warrior'], [SKL, 'Skeleton_Rogue'], [SKL, 'Skeleton_Mage'],
];

const KEEP_ANIMS = new Set([
  'Idle', 'Idle_Combat', '2H_Melee_Idle', 'Walking_A', 'Walking_D_Skeletons', 'Running_A',
  '1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop',
  'Dualwield_Melee_Attack_Stab', '1H_Ranged_Shoot', '2H_Ranged_Shoot', 'Spellcast_Shoot',
  'Spellcast_Raise', 'Hit_A', 'Hit_B', 'Death_A', 'Death_A_Pose', 'Cheer', 'Block',
  'Spawn_Ground_Skeletons', 'Taunt',
]);

const SKELETON_WEAPONS = [
  'Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Crossbow',
  'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_A',
];
const SKL_ASSETS = 'KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons/Assets/gltf';

const DUNGEON = [
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_dirt_large', 'floor_tile_big_grate',
  'wall', 'wall_cracked', 'wall_doorway', 'wall_gated', 'wall_corner', 'pillar', 'pillar_decorated', 'column',
  'torch_mounted', 'torch_lit', 'banner_patternA_red', 'banner_shield_blue', 'barrel_large',
  'crates_stacked', 'rubble_large', 'chest_gold', 'barrier', 'barrier_column', 'sword_shield',
];

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// All KayKit characters share one rig, so animations live in a separate
// library file and character files carry only the skinned meshes.
const IK_NODE = /IK|control-/;

function disposeAnimation(anim) {
  for (const ch of anim.listChannels()) ch.dispose();
  for (const sampler of anim.listSamplers()) sampler.dispose();
  anim.dispose();
}

async function convert(input, output, mode) {
  const doc = await io.read(input);
  const root = doc.getRoot();
  if (mode === 'mesh') {
    for (const anim of root.listAnimations()) disposeAnimation(anim);
  } else if (mode === 'anims') {
    for (const anim of root.listAnimations()) {
      if (!KEEP_ANIMS.has(anim.getName())) { disposeAnimation(anim); continue; }
      for (const ch of anim.listChannels()) {
        if (IK_NODE.test(ch.getTargetNode()?.getName() ?? '')) {
          ch.getSampler()?.dispose();
          ch.dispose();
        }
      }
    }
    for (const node of root.listNodes()) node.setMesh(null).setSkin(null);
  }
  await doc.transform(resample(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(output, doc);
  const kb = (statSync(output).size / 1024).toFixed(0);
  console.log(`${output.replace(out, 'public/assets')}  ${kb} KB`);
}

mkdirSync(join(out, 'characters'), { recursive: true });
mkdirSync(join(out, 'dungeon'), { recursive: true });
for (const [dir, name] of CHARACTERS) {
  await convert(join(src, dir, `${name}.glb`), join(out, 'characters', `${name}.glb`), 'mesh');
}
await convert(join(src, ADV, 'Knight.glb'), join(out, 'characters', 'anims_adventurer.glb'), 'anims');
await convert(join(src, SKL, 'Skeleton_Minion.glb'), join(out, 'characters', 'anims_skeleton.glb'), 'anims');
mkdirSync(join(out, 'weapons'), { recursive: true });
for (const name of SKELETON_WEAPONS) {
  await convert(join(src, SKL_ASSETS, `${name}.gltf`), join(out, 'weapons', `${name}.glb`), 'static');
}
for (const name of DUNGEON) {
  const base = join(src, DUN, name);
  let input = `${base}.gltf.glb`;
  try { statSync(input); } catch { input = `${base}.glb`; }
  await convert(input, join(out, 'dungeon', `${name}.glb`), 'static');
}
