import * as THREE from 'three';
import type { CreatureModel } from '../game/types';
import { ease, tween } from './tween';

/**
 * Forest beasts built in code (no asset needed, same in the KayKit and Synty sets): a hopping
 * jelly slime and a low-poly wolf. Each look is a colour and a few extras; the animation is a
 * small hand-written rig driven by `update`.
 */
export interface CreatureLook {
  color: number;
  /** Eye colour (glowing for the meaner ones). */
  eyes?: number;
  /** 산성 슬라임: spikes on the jelly. */
  spikes?: boolean;
  /** 슬라임 왕 / 늑대 우두머리: a crown or a mane of bone. */
  crown?: boolean;
  /** Belly / muzzle colour for wolves. */
  belly?: number;
}

const SLIME = (color: number, extra: Partial<CreatureLook> = {}): CreatureLook => ({ color, ...extra });
const WOLF = (color: number, belly: number, extra: Partial<CreatureLook> = {}): CreatureLook => ({ color, belly, ...extra });

/** Looks by card id or `boss:<name>`. */
export const CREATURE_LOOKS: Record<string, CreatureLook> = {
  slime: SLIME(0x4fcf4a),
  slime_small_token: SLIME(0x8ff07a),
  slime_mid_token: SLIME(0x3fae45),
  slime_big: SLIME(0x2a8f3a, { eyes: 0xfff27a }),
  slime_venom: SLIME(0x9b4fe0, { eyes: 0xd8ff5a }),
  slime_acid: SLIME(0xc9d83a, { spikes: true }),
  'boss:슬라임 왕': SLIME(0x3fc6a0, { crown: true, eyes: 0xfff6c0 }),
  wolf_pup: WOLF(0x9b8a78, 0xd9cbb8),
  wolf: WOLF(0x7b7f88, 0xc9ccd2),
  wolf_hunter: WOLF(0x7a5634, 0xc9a77e),
  wolf_dire: WOLF(0x2c2c33, 0x55555e, { eyes: 0xff4a2a }),
  'boss:늑대 우두머리': WOLF(0xdfe3ea, 0xffffff, { eyes: 0x6ad8ff, crown: true }),
};

export interface CreatureRig {
  root: THREE.Group;
  /** Every material, for hit flashes. */
  mats: THREE.MeshStandardMaterial[];
  update(dt: number): void;
  setWalking(on: boolean): void;
  /** Resolves at the moment of impact. */
  attack(): Promise<void>;
  hit(): void;
  die(): Promise<void>;
  spawn(): Promise<void>;
  /** Frozen solid: the rig stops moving. */
  setPaused(on: boolean): void;
}

export function makeCreature(model: CreatureModel, key?: string): CreatureRig {
  const look = (key && CREATURE_LOOKS[key]) || (model === 'wolf' ? CREATURE_LOOKS.wolf : CREATURE_LOOKS.slime);
  const rig = model === 'wolf' ? makeWolf(look) : makeSlime(look);
  rig.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return rig;
}

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true, ...extra });

function eyes(color: number | undefined, at: THREE.Vector3, spread: number, size: number, mats: THREE.MeshStandardMaterial[]) {
  const g = new THREE.Group();
  const white = mat(color ?? 0xffffff, { emissive: color ?? 0x000000, emissiveIntensity: color ? 0.9 : 0, roughness: 0.2 });
  const pupil = mat(0x101014, { roughness: 0.2 });
  mats.push(white, pupil);
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), white);
    e.position.set(at.x + side * spread, at.y, at.z);
    g.add(e);
    if (!color) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 8, 6), pupil);
      p.position.set(at.x + side * spread, at.y, at.z + size * 0.6);
      g.add(p);
    }
  }
  return g;
}

function crownMesh(mats: THREE.MeshStandardMaterial[]) {
  const gold = mat(0xffcf3a, { metalness: 0.7, roughness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.4 });
  mats.push(gold);
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.18, 10, 1, true), gold);
  g.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), gold);
    spike.position.set(Math.sin(a) * 0.42, 0.22, Math.cos(a) * 0.42);
    g.add(spike);
  }
  return g;
}

// ── Slime ────────────────────────────────────────────────────

function makeSlime(look: CreatureLook): CreatureRig {
  const mats: THREE.MeshStandardMaterial[] = [];
  const root = new THREE.Group();
  /** Squashed and stretched; its base stays on the floor. */
  const body = new THREE.Group();
  root.add(body);
  const jelly = mat(look.color, {
    transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.05,
    emissive: look.color, emissiveIntensity: 0.18,
  });
  mats.push(jelly);
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 2), jelly);
  blob.scale.set(1, 0.78, 1);
  blob.position.y = 0.66;
  body.add(blob);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), mat(new THREE.Color(look.color).multiplyScalar(0.55).getHex()));
  mats.push(core.material as THREE.MeshStandardMaterial);
  core.position.set(0.12, 0.55, -0.1);
  body.add(core);
  body.add(eyes(look.eyes, new THREE.Vector3(0, 0.86, 0.68), 0.24, 0.13, mats));
  if (look.spikes) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 4), jelly);
      const r = 0.72;
      s.position.set(Math.sin(a) * r, 0.75 + (i % 2) * 0.25, Math.cos(a) * r * 0.9);
      s.lookAt(s.position.clone().multiplyScalar(2).setY(s.position.y + 0.6));
      s.rotateX(Math.PI / 2);
      body.add(s);
    }
  }
  if (look.crown) {
    const c = crownMesh(mats);
    c.position.y = 1.32;
    c.rotation.z = 0.12;
    body.add(c);
  }

  let t = Math.random() * 6;
  let walking = false;
  let paused = false;
  let hop = 0;
  const squash = (sy: number) => body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
  return {
    root, mats,
    update(dt) {
      if (paused) return;
      t += dt;
      if (walking) {
        hop = (hop + dt * 3.2) % 1;
        const up = Math.sin(hop * Math.PI);
        body.position.y = up * 0.55;
        squash(hop < 0.12 || hop > 0.88 ? 0.78 : 1 + up * 0.12);
      } else {
        body.position.y = 0;
        squash(1 + Math.sin(t * 3.1) * 0.05);
      }
    },
    setWalking(on) { walking = on; hop = 0; },
    async attack() {
      await tween(0.16, (k) => squash(1 - 0.3 * k));
      await tween(0.12, (k) => { squash(0.7 + 0.6 * k); body.position.z = 0.6 * k; });
      void tween(0.25, (k) => { squash(1.3 - 0.3 * k); body.position.z = 0.6 * (1 - k); });
    },
    hit() {
      void tween(0.3, (k) => squash(1 + Math.sin(k * Math.PI * 3) * 0.18 * (1 - k)));
    },
    async die() {
      paused = true;
      await tween(0.45, (k) => {
        body.scale.set(1 + k * 0.6, Math.max(0.05, 1 - k), 1 + k * 0.6);
        jelly.opacity = 0.82 * (1 - k * 0.6);
      });
    },
    async spawn() {
      body.position.y = 3;
      await tween(0.3, (k) => { body.position.y = 3 * (1 - ease.inOutSine(k)); });
      await tween(0.25, (k) => squash(0.6 + 0.4 * ease.outBack(k)));
    },
    setPaused(on) { paused = on; },
  };
}

// ── Wolf (stand-in until an animated wolf model is added) ────

function makeWolf(look: CreatureLook): CreatureRig {
  const mats: THREE.MeshStandardMaterial[] = [];
  const fur = mat(look.color);
  const belly = mat(look.belly ?? look.color);
  const dark = mat(new THREE.Color(look.color).multiplyScalar(0.6).getHex());
  mats.push(fur, belly, dark);
  const root = new THREE.Group();
  /** Pitches for pounces; legs and head hang off it. */
  const body = new THREE.Group();
  body.position.y = 0.95;
  root.add(body);
  // A lean, tapering body: deep chest, narrow hips.
  const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), fur);
  torso.scale.set(0.72, 0.66, 1.55);
  body.add(torso);
  const chest = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), belly);
  chest.scale.set(0.95, 0.9, 1.1);
  chest.position.set(0, -0.16, 0.42);
  body.add(chest);
  const back = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), dark);
  back.scale.set(1.1, 0.5, 2.2);
  back.position.set(0, 0.24, -0.05);
  body.add(back);
  // Ruff around the neck (a bigger one for the pack leader).
  const ruff = new THREE.Mesh(new THREE.IcosahedronGeometry(look.crown ? 0.55 : 0.44, 0), fur);
  ruff.scale.set(1.05, 0.95, 0.75);
  ruff.position.set(0, 0.12, 0.62);
  body.add(ruff);

  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.92);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), fur);
  skull.scale.set(1, 0.85, 1);
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.45, 6), belly);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.08, 0.36);
  head.add(snout);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.08), mat(0x111114));
  mats.push(nose.material as THREE.MeshStandardMaterial);
  nose.position.set(0, -0.01, 0.64);
  head.add(nose);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 4), dark);
    ear.position.set(side * 0.16, 0.32, -0.06);
    head.add(ear);
  }
  head.add(eyes(look.eyes, new THREE.Vector3(0, 0.08, 0.26), 0.13, 0.065, mats));
  if (look.crown) {
    // The pack leader: a crown of antler-like bone spikes.
    const bone = mat(0xf2ead8, { roughness: 0.4 });
    mats.push(bone);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 5), bone);
      horn.position.set(side * 0.2, 0.36, -0.15);
      horn.rotation.set(-0.5, 0, side * -0.4);
      head.add(horn);
    }
  }

  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.24, 0.52], [0.24, 0.52], [-0.24, -0.55], [0.24, -0.55]]) {
    const hip = new THREE.Group();
    hip.position.set(x, -0.2, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.2), dark);
    leg.position.y = -0.38;
    hip.add(leg);
    body.add(hip);
    legs.push(hip);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.18, -0.75);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), dark);
  tailMesh.rotation.x = -Math.PI / 2 - 0.5;
  tailMesh.position.set(0, -0.12, -0.3);
  tail.add(tailMesh);
  body.add(tail);

  let t = Math.random() * 6;
  let walking = false;
  let paused = false;
  return {
    root, mats,
    update(dt) {
      if (paused) return;
      t += dt;
      const gait = walking ? Math.sin(t * 14) : 0;
      legs[0].rotation.x = gait * 0.6;
      legs[3].rotation.x = gait * 0.6;
      legs[1].rotation.x = -gait * 0.6;
      legs[2].rotation.x = -gait * 0.6;
      body.position.y = 0.95 + (walking ? Math.abs(gait) * 0.08 : Math.sin(t * 2.4) * 0.02);
      tail.rotation.y = Math.sin(t * (walking ? 10 : 4)) * 0.35;
      head.rotation.x = walking ? 0.1 : Math.sin(t * 1.3) * 0.06;
    },
    setWalking(on) { walking = on; },
    async attack() {
      // Crouch, then pounce with the jaws forward.
      await tween(0.14, (k) => { body.rotation.x = -0.25 * k; body.position.y = 0.95 - 0.15 * k; });
      await tween(0.12, (k) => { body.rotation.x = -0.25 + 0.55 * k; body.position.z = 0.7 * k; head.rotation.x = 0.4 * k; });
      void tween(0.28, (k) => { body.rotation.x = 0.3 * (1 - k); body.position.z = 0.7 * (1 - k); head.rotation.x = 0.4 * (1 - k); });
    },
    hit() {
      void tween(0.25, (k) => { body.rotation.z = Math.sin(k * Math.PI * 2) * 0.15 * (1 - k); });
    },
    async die() {
      paused = true;
      await tween(0.5, (k) => {
        body.rotation.z = ease.outCubic(k) * Math.PI * 0.5;
        body.position.y = 0.95 - 0.55 * k;
        for (const l of legs) l.rotation.x = 0.3 * k;
      });
    },
    async spawn() {
      // Leaps in from the tree line.
      body.position.z = -2;
      body.position.y = 2;
      walking = true;
      await tween(0.35, (k) => { body.position.z = -2 * (1 - k); body.position.y = 0.95 + 1.05 * (1 - k) * (1 - k) - Math.sin(k * Math.PI) * -0.4; });
      walking = false;
    },
    setPaused(on) { paused = on; },
  };
}
