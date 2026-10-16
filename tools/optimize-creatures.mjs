// Converts Quaternius models (CC0, https://quaternius.com) to compressed GLBs for the game:
// public/assets/creatures/<Name>.glb. The sources live in the cardproject repository
// (Assets/Quaternius/Animal and Assets/Quaternius/Monsters, .gltf with embedded buffers).
//
// Usage: node tools/optimize-creatures.mjs <Quaternius dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Models the game uses (folder/name) and the animation clips it keeps of each. */
const ANIMAL = ['Attack', 'Death', 'Gallop', 'Idle', 'Idle_HitReact1', 'Walk'];
const BLOB = ['Bite_Front', 'Death', 'HitRecieve', 'Idle', 'Jump', 'Walk'];
export const CREATURES = { 'Animal/Wolf': ANIMAL, 'Monsters/GreenBlob': BLOB, 'Monsters/GreenSpikyBlob': BLOB, 'Monsters/PinkBlob': BLOB };

const src = process.argv[2] && resolve(process.argv[2]);
if (!src) {
  console.error('usage: node tools/optimize-creatures.mjs <Quaternius dir>');
  process.exit(1);
}
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const out = resolve('public/assets/creatures');
mkdirSync(out, { recursive: true });
for (const [c, keep] of Object.entries(CREATURES)) {
  const file = join(src, `${c}.gltf`);
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) if (!keep.includes(a.getName())) a.dispose();
  await doc.transform(dedup(), resample(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const name = c.split('/')[1];
  await io.write(join(out, `${name}.glb`), doc);
  console.log(name, `${(statSync(file).size / 1024).toFixed(0)} KB -> ${(statSync(join(out, `${name}.glb`)).size / 1024).toFixed(0)} KB`);
}
