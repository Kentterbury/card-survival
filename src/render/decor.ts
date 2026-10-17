import * as THREE from 'three';
import { loadGltf, useSynty } from './assets';

/**
 * Board decorations: Synty Polygon Dungeon and Polygon Nature props (synty/decor/, exported by the
 * private asset repo) that fill the edges of the boards the side and isometric cameras show.
 * The KayKit set has no such pieces, so there they are simply left out.
 */
const FILES = {
  // dungeon
  bonePile: 'SM_Env_BonePile_01',
  bonesSmall: 'SM_Env_BonePile_Small_01',
  bonesSmall2: 'SM_Env_BonePile_Small_02',
  beastSkull: 'SM_Env_Bone_Skull_01',
  ribs: 'SM_Env_Bone_Ribs_01',
  brazier: 'SM_Prop_Brazier_01',
  candleStand: 'SM_Prop_Candle_Stand_01',
  candles: 'SM_Prop_Candles_02',
  coffin: 'SM_Prop_Coffin_01',
  cage: 'SM_Prop_Toture_Cage_01',
  skeletonSitting: 'SM_Prop_Skeleton_Slave_Wall_Sitting_01',
  skeletonLying: 'SM_Prop_Skeleton_Slave_Lying_01',
  statue: 'SM_Env_Statue_01',
  vases: 'SM_Prop_Vase_Group_01',
  vaseBroken: 'SM_Prop_Vase_Broken_01',
  barrel: 'SM_Prop_Barrel_01',
  barrelBroken: 'SM_Prop_Barrel_Broken_01',
  crate: 'SM_Prop_Crate_Wood_03',
  weaponRack: 'SM_Prop_WeaponRack_01',
  rug: 'SM_Prop_Rug_01',
  wallBanner: 'SM_Prop_Wall_Banner_02',
  pillarRubble: 'SM_Env_Pillar_Broken_Pile_01',
  brickRubble: 'SM_Env_Brick_Rubble_02',
  pillarStump: 'SM_Env_Pillar_Broken_01',
  chain: 'SM_Prop_Chain_03',
  // forest
  fern: 'SM_Plant_Fern_01',
  flowers: 'SM_Plant_Flowers_01',
  grassTuft: 'SM_Plant_Grass_01',
  grass: 'SM_Plant_Grass_03',
  mushroomsRed: 'SM_Plant_Mushrooms_02',
  plant: 'SM_Plant_01',
  rockSmall: 'SM_Rock_Small_01',
  rockPile: 'SM_Rock_Pile_03',
  rockCluster: 'SM_Rock_Cluster_Large_01',
  log: 'SM_Tree_Log_02',
  skeletonGround: 'SM_Prop_Skeleton_Ground_01',
  fence: 'SM_Prop_Fence_02',
  roadSign: 'SM_Prop_RoadSign_01',
  ruinPillar: 'SM_Prop_Pillar_Broken_02',
  chest: 'SM_Prop_Chest_Wood_01',
  arrow: 'SM_Prop_Arrow_01',
  // caves, the sorcerer's library, the crypt
  stalagmite: 'SM_Env_Stalagmite_01',
  stalagmiteTall: 'SM_Env_Stalagmite_03',
  rockPillar: 'SM_Env_Rock_Pillar_02',
  rockSpike: 'SM_Env_Rock_Spike_01',
  gem: 'SM_Env_Gem_Large_01',
  gemSpike: 'SM_Env_Gem_Spike_01',
  mushroomGiant: 'SM_Env_Mushroom_Giant_01',
  mushroomSmall: 'SM_Env_Mushroom_Small_01',
  bookcase: 'SM_Prop_Bookcase_01',
  bookcase2: 'SM_Prop_Bookcase_02',
  cauldron: 'SM_Prop_Cauldron_01',
  roundTable: 'SM_Prop_Table_Round_01',
  candlesTable: 'SM_Prop_Candles_04',
  statue2: 'SM_Env_Statue_02',
  obelisk: 'SM_Env_Obelisk_01',
  bonePileBig: 'SM_Env_BonePile_02',
  boneSpike: 'SM_Env_Bone_Spike_01',
} as const;

export type DecorKind = keyof typeof FILES;

/**
 * A decoration standing on the floor at the origin, `size` tall (or wide for `fit: 'width'`),
 * or null when the Synty set is not in use.
 */
export async function decorPiece(kind: DecorKind, size: number, fit: 'height' | 'width' = 'height'): Promise<THREE.Object3D | null> {
  if (!useSynty) return null;
  const gltf = await loadGltf(`decor/${FILES[kind]}.glb`, `${import.meta.env.BASE_URL}synty/`);
  const obj = gltf.scene.clone(true);
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  const k = size / Math.max(0.001, fit === 'height' ? dims.y : Math.max(dims.x, dims.z));
  obj.scale.multiplyScalar(k);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  const root = new THREE.Group();
  root.add(obj);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat.map) mat.map.magFilter = THREE.NearestFilter;
  });
  return root;
}
