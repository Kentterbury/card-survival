// Compresses an exported Synty asset set (see docs/SYNTY.md) for the web:
// dedup + prune + meshopt geometry/animation compression, keeping the folder layout.
//
// Usage: node tools/optimize-synty.mjs <raw dir> <out dir>
// The Synty files themselves are licensed assets and never live in this repository.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const [src, dst] = process.argv.slice(2).map((p) => p && resolve(p));
if (!src || !dst) {
  console.error('usage: node tools/optimize-synty.mjs <raw dir> <out dir>');
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.glb') || name.endsWith('.png')) yield p;
  }
}

const files = [];
let before = 0;
let after = 0;
for (const file of walk(src)) {
  const out = join(dst, relative(src, file));
  mkdirSync(dirname(out), { recursive: true });
  if (file.endsWith('.png')) {
    // Colour-variant textures for the character packs: copied as is.
    copyFileSync(file, out);
  } else {
    const doc = await io.read(file);
    await doc.transform(dedup(), resample(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    await io.write(out, doc);
  }
  files.push(relative(dst, out).split('\\').join('/'));
  before += statSync(file).size;
  after += statSync(out).size;
  console.log(relative(src, file), `${(statSync(file).size / 1024).toFixed(0)} KB -> ${(statSync(out).size / 1024).toFixed(0)} KB`);
}
// The game only switches to the Synty set when this manifest is present.
writeFileSync(join(dst, 'manifest.json'), JSON.stringify({ version: 1, files: files.sort() }, null, 2) + '\n');
console.log(`total ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
