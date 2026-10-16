import * as THREE from 'three';
import { loadGltf, useSynty } from './assets';

/**
 * Pieces of the 1장 숲 board. With the Synty set they are Polygon Nature models (forest/*.glb,
 * scaled to a height); otherwise simple low-poly stand-ins built here.
 */
export type NatureKind =
  | 'pine' | 'pineSmall' | 'round' | 'tallRound' | 'bigTree' | 'swamp' | 'stump' | 'log'
  | 'rock' | 'boulder' | 'rockPile' | 'campfire' | 'fence' | 'torchStick' | 'mushrooms' | 'bush'
  | 'pillar' | 'arch' | 'grave' | 'skull';

/** Synty files per kind (one is picked by `variant`). */
const SYNTY_NATURE: Record<NatureKind, string[]> = {
  pine: ['SM_Tree_PolyPine_01', 'SM_Tree_PolyPine_02'],
  pineSmall: ['SM_Tree_PolyPine_03'],
  round: ['SM_Tree_Round_01', 'SM_Tree_Round_03', 'SM_Tree_Round_05'],
  tallRound: ['SM_Tree_TallRound_01'],
  bigTree: ['SM_Tree_Large_01'],
  swamp: ['SM_Tree_Swamp_01'],
  stump: ['SM_Tree_Stump_01'],
  log: ['SM_Tree_Log_01'],
  rock: ['SM_Rock_02', 'SM_Rock_04'],
  boulder: ['SM_Rock_Boulder_01'],
  rockPile: ['SM_Rock_Pile_01'],
  campfire: ['SM_Prop_CampFire_01'],
  fence: ['SM_Prop_Fence_01'],
  torchStick: ['SM_Prop_TorchStick_01'],
  mushrooms: ['SM_Plant_Mushrooms_01'],
  bush: ['SM_Plant_Bush_01', 'SM_Plant_Bush_02'],
  pillar: ['SM_Prop_Pillar_Broken_Moss_01'],
  arch: ['SM_Prop_Pillar_Arch_Moss_01'],
  grave: ['SM_Prop_Grave_03'],
  skull: ['SM_Prop_Skull_01'],
};

export const FOREST_FILES = [...new Set(Object.values(SYNTY_NATURE).flat())];

/** A piece standing on the floor at the origin, `height` tall (or `width` wide for flat pieces). */
export async function naturePiece(kind: NatureKind, size: number, variant = 0, fit: 'height' | 'width' = 'height'): Promise<THREE.Object3D> {
  const obj = useSynty ? await syntyPiece(kind, variant) : fallbackPiece(kind, variant);
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  const k = size / Math.max(0.001, fit === 'height' ? dims.y : Math.max(dims.x, dims.z));
  const root = new THREE.Group();
  obj.scale.multiplyScalar(k);
  obj.position.y -= box.min.y * k;
  root.add(obj);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}

async function syntyPiece(kind: NatureKind, variant: number) {
  const files = SYNTY_NATURE[kind];
  const gltf = await loadGltf(`forest/${files[variant % files.length]}.glb`, `${import.meta.env.BASE_URL}synty/`);
  const o = gltf.scene.clone(true);
  // Atlas swatches: keep them crisp like the other Synty pieces.
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.magFilter = THREE.NearestFilter;
    }
  });
  return o;
}

// ── Low-poly stand-ins (KayKit set) ──────────────────────────

const M = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
const BARK = M(0x5a3d26);
const PINE = [M(0x2f5a34), M(0x2a5030), M(0x356a3a)];
const LEAF = [M(0x4a7d36), M(0x5c8a3a), M(0x3f6e33)];
const STONE = M(0x7d7f7a);
const MOSSY = M(0x6a7a5a);
const WOOD = M(0x7a5434);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function fallbackPiece(kind: NatureKind, v: number): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case 'pine':
    case 'pineSmall':
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.25, 1.4, 6), BARK, 0, 0.7));
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.ConeGeometry(1.4 - i * 0.35, 1.9, 7), PINE[(v + i) % 3], 0, 1.6 + i * 1.05));
      break;
    case 'round':
    case 'tallRound':
    case 'bigTree':
    case 'swamp': {
      const tall = kind === 'tallRound' ? 1.5 : 1;
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.32, 2 * tall, 6), BARK, 0, tall));
      const crowns = kind === 'bigTree' ? 5 : 3;
      for (let i = 0; i < crowns; i++) {
        const a = (i / crowns) * Math.PI * 2 + v;
        const c = mesh(new THREE.IcosahedronGeometry(0.9 + (i % 2) * 0.25, 0), kind === 'swamp' ? MOSSY : LEAF[(v + i) % 3],
          Math.sin(a) * 0.55, 2 * tall + 0.5 + (i % 2) * 0.4, Math.cos(a) * 0.55);
        g.add(c);
      }
      break;
    }
    case 'stump':
      g.add(mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 7), BARK, 0, 0.3));
      break;
    case 'log': {
      const l = mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 7), BARK, 0, 0.25);
      l.rotation.z = Math.PI / 2;
      g.add(l);
      break;
    }
    case 'rock':
    case 'boulder':
      g.add(mesh(new THREE.DodecahedronGeometry(0.6, 0), v % 2 ? MOSSY : STONE, 0, 0.45));
      break;
    case 'rockPile':
      for (let i = 0; i < 5; i++) g.add(mesh(new THREE.DodecahedronGeometry(0.5 + (i % 3) * 0.3, 0), i % 2 ? MOSSY : STONE, (i - 2) * 0.7, 0.4 + (i % 2) * 0.3, (i % 3) * 0.3));
      break;
    case 'campfire':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.add(mesh(new THREE.DodecahedronGeometry(0.16, 0), STONE, Math.sin(a) * 0.55, 0.1, Math.cos(a) * 0.55));
      }
      for (let i = 0; i < 3; i++) {
        const l = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 5), BARK, 0, 0.18);
        l.rotation.set(Math.PI / 2 - 0.3, (i / 3) * Math.PI * 2, 0);
        g.add(l);
      }
      break;
    case 'fence':
      for (const x of [-1.3, 0, 1.3]) g.add(mesh(new THREE.BoxGeometry(0.15, 1.1, 0.15), WOOD, x, 0.55));
      for (const y of [0.4, 0.8]) g.add(mesh(new THREE.BoxGeometry(2.9, 0.12, 0.1), WOOD, 0, y));
      break;
    case 'torchStick':
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.8, 5), WOOD, 0, 0.9));
      g.add(mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.22, 6), M(0x3a2a1a), 0, 1.85));
      break;
    case 'mushrooms':
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.15;
        g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.25 + i * 0.05, 5), M(0xeee2c8), x, 0.12));
        g.add(mesh(new THREE.SphereGeometry(0.1 + i * 0.02, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), M(0xc0392b), x, 0.25 + i * 0.05));
      }
      break;
    case 'bush':
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.55, 0), LEAF[(v + i) % 3], (i - 1) * 0.45, 0.45, (i % 2) * 0.2));
      break;
    case 'pillar':
      g.add(mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.6, 7), MOSSY, 0, 0.8));
      break;
    case 'arch': {
      for (const x of [-1.1, 1.1]) g.add(mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), MOSSY, x, 1.2));
      g.add(mesh(new THREE.BoxGeometry(2.8, 0.45, 0.55), STONE, 0, 2.6));
      break;
    }
    case 'grave':
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.9, 0.18), STONE, 0, 0.45));
      break;
    case 'skull':
      g.add(mesh(new THREE.IcosahedronGeometry(0.2, 1), M(0xe8e0cc), 0, 0.2));
      break;
  }
  return g;
}

/** A tiling grass (or dirt) floor texture drawn once on a canvas. */
export function groundTexture(base: string, specks: string[], size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * 6; i++) {
    g.fillStyle = specks[i % specks.length];
    const r = 1 + rnd() * 3.5;
    g.globalAlpha = 0.25 + rnd() * 0.5;
    g.beginPath();
    g.ellipse(rnd() * size, rnd() * size, r, r * (0.5 + rnd()), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
