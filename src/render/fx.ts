import * as THREE from 'three';
import type { SpellIcon } from '../game/cards';
import { LANE_W, ROW_D } from './board';
import { ease, tween } from './tween';
import { LAST_ROW } from '../game/types';

const COLORS: Record<SpellIcon | 'arrow' | 'hero', number> = {
  fire: 0xff7a1a, bolt: 0xfff36a, storm: 0x9ad8ff, frost: 0x8fe9ff, wave: 0xd6c2ff,
  heart: 0x7dffb0, shield: 0xffe29a, scroll: 0xffffff, meteor: 0xff4a1a, sword: 0xffd34d,
  skull: 0x9dff7a, arrows: 0xffd890, potion: 0x7ab8ff, arrow: 0xe8d6b0, curse: 0x6dff8a, hero: 0x8fd0ff,
};

type Kind = keyof typeof COLORS;

/**
 * Particle textures from the Kenney Particle Pack (CC0, public/assets/fx/, built by tools/build-fx.py):
 * white shapes whose alpha is their brightness, tinted per effect.
 */
const TEX = ['glow', 'ring', 'star', 'shard', 'flare', 'flame', 'fire', 'jet', 'smoke', 'bolt', 'zap', 'rune', 'slash', 'twirl', 'scorch', 'trace', 'sparkle'] as const;
type Tex = (typeof TEX)[number];

interface EmitOpts {
  color?: number;
  size?: number;
  /** Size multiplier reached at the end of its life. */
  grow?: number;
  life?: number;
  vel?: THREE.Vector3;
  gravity?: number;
  spin?: number;
  rotation?: number;
  opacity?: number;
  /** Plain transparency instead of additive light (smoke). */
  normal?: boolean;
}

interface Particle {
  obj: THREE.Sprite | THREE.Mesh;
  mat: THREE.SpriteMaterial | THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  gravity: number;
  spin: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  opacity: number;
  flat: boolean;
}

/** Trail particles left by a projectile of each kind. */
const TRAIL: Partial<Record<Kind, Tex>> = {
  fire: 'flame', meteor: 'flame', frost: 'shard', bolt: 'zap', storm: 'zap', skull: 'smoke', curse: 'smoke',
  heart: 'sparkle', potion: 'sparkle', arrow: 'trace', arrows: 'trace',
};

export class Fx {
  private readonly particles: Particle[] = [];
  private readonly textures = new Map<Tex, THREE.Texture>();

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera, private readonly textLayer: HTMLElement) {
    const loader = new THREE.TextureLoader();
    for (const t of TEX) {
      const tex = loader.load(`${import.meta.env.BASE_URL}assets/fx/${t}.png`);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(t, tex);
    }
  }

  // ── Building blocks ───────────────────────────────────────

  /** One camera-facing particle. */
  private emit(tex: Tex, at: THREE.Vector3, o: EmitOpts = {}) {
    const mat = new THREE.SpriteMaterial({
      map: this.textures.get(tex), color: o.color ?? 0xffffff, transparent: true, depthWrite: false, toneMapped: false,
      blending: o.normal ? THREE.NormalBlending : THREE.AdditiveBlending, rotation: o.rotation ?? Math.random() * Math.PI * 2,
      opacity: o.opacity ?? 1,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(at);
    const size = o.size ?? 0.4;
    sprite.scale.setScalar(size);
    this.scene.add(sprite);
    const life = o.life ?? 0.5;
    this.particles.push({
      obj: sprite, mat, vel: o.vel ?? new THREE.Vector3(), gravity: o.gravity ?? 0, spin: o.spin ?? 0,
      life, max: life, size, grow: o.grow ?? 1, opacity: o.opacity ?? 1, flat: false,
    });
  }

  /** A flat mark on the floor (magic circles, shock rings, scorch marks). */
  private decal(tex: Tex, at: THREE.Vector3, o: EmitOpts = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.textures.get(tex), color: o.color ?? 0xffffff, transparent: true, depthWrite: false, toneMapped: false,
      blending: o.normal ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: o.opacity ?? 1, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
    mesh.position.copy(at);
    mesh.rotation.y = o.rotation ?? Math.random() * Math.PI * 2;
    const size = o.size ?? 2;
    mesh.scale.setScalar(size);
    this.scene.add(mesh);
    const life = o.life ?? 0.6;
    this.particles.push({
      obj: mesh, mat, vel: new THREE.Vector3(), gravity: 0, spin: o.spin ?? 0,
      life, max: life, size, grow: o.grow ?? 1, opacity: o.opacity ?? 1, flat: true,
    });
  }

  private scatter(power: number, up = 1) {
    return new THREE.Vector3((Math.random() - 0.5) * power, Math.random() * power * up, (Math.random() - 0.5) * power);
  }

  // ── Effects ──────────────────────────────────────────────

  /** Glowing missile flying from `from` to `to` on an arc, leaving a trail in its element. */
  async projectile(from: THREE.Vector3, to: THREE.Vector3, kind: Kind, speed = 16, size = 0.22) {
    const color = COLORS[kind];
    const orb = new THREE.Group();
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.get('glow'), color, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(size * 7);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.get('flare'), color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    core.scale.setScalar(size * 5);
    orb.add(halo, core, new THREE.PointLight(color, 6, 5, 2));
    this.scene.add(orb);
    const trail = TRAIL[kind] ?? 'glow';
    const dist = from.distanceTo(to);
    const height = Math.min(2.2, dist * 0.18);
    await tween(Math.max(0.18, dist / speed), (k) => {
      orb.position.lerpVectors(from, to, k);
      orb.position.y += Math.sin(k * Math.PI) * height;
      core.material.rotation += 0.3;
      if (Math.random() < 0.8) {
        const smoke = trail === 'smoke';
        this.emit(trail, orb.position, {
          color: smoke ? 0x3a2a4a : color, size: size * (trail === 'trace' ? 3 : 4), grow: smoke ? 2.2 : 0.3,
          life: trail === 'zap' ? 0.15 : 0.4, vel: this.scatter(0.6), normal: smoke, opacity: smoke ? 0.7 : 1,
        });
      }
    });
    this.scene.remove(orb);
    halo.material.dispose();
    core.material.dispose();
    this.impact(to, kind);
  }

  /** The hit of a spell or missile, in its element. */
  impact(at: THREE.Vector3, kind: Kind) {
    const color = COLORS[kind];
    this.emit('glow', at, { color, size: 3, grow: 1.6, life: 0.3 });
    switch (kind) {
      case 'fire':
      case 'meteor':
        for (let i = 0; i < 7; i++) this.emit(i % 2 ? 'fire' : 'flame', at, { color: i % 3 ? 0xff8a2a : 0xffd04a, size: 1.2, grow: 2, life: 0.5, vel: this.scatter(3), gravity: -2 });
        for (let i = 0; i < 3; i++) this.emit('smoke', at, { color: 0x2a2220, size: 1, grow: 2.4, life: 0.9, vel: this.scatter(1.2).setY(1.6), normal: true, opacity: 0.6 });
        break;
      case 'frost':
        this.decal('ring', at.clone().setY(0.15), { color, size: 1, grow: 3.5, life: 0.45 });
        for (let i = 0; i < 8; i++) this.emit('shard', at, { color: i % 2 ? 0xffffff : color, size: 0.8, grow: 0.4, life: 0.55, vel: this.scatter(4), gravity: 6, spin: 4 });
        break;
      case 'bolt':
      case 'storm':
        this.emit('bolt', at.clone().setY(at.y + 1.8), { color: 0xffffff, size: 4.2, grow: 1, life: 0.22, rotation: 0 });
        for (let i = 0; i < 3; i++) this.emit('zap', at, { color, size: 1.4, grow: 1.4, life: 0.25 });
        break;
      case 'heart':
      case 'potion':
        for (let i = 0; i < 9; i++) this.emit('sparkle', at.clone().add(this.scatter(1.2, 0)), { color, size: 0.5, grow: 0.3, life: 0.9, vel: new THREE.Vector3(0, 1.6 + Math.random(), 0) });
        this.emit('twirl', at, { color, size: 1.6, grow: 1.4, life: 0.6, spin: 6 });
        break;
      case 'skull':
      case 'curse':
        this.emit('twirl', at, { color, size: 2, grow: 0.5, life: 0.6, spin: -7 });
        for (let i = 0; i < 4; i++) this.emit('smoke', at, { color: 0x2a1a3a, size: 0.9, grow: 2.2, life: 0.8, vel: this.scatter(1.4).setY(1), normal: true, opacity: 0.7 });
        break;
      default:
        for (let i = 0; i < 10; i++) this.emit('star', at, { color, size: 0.45, grow: 0.2, life: 0.5, vel: this.scatter(3), gravity: 5 });
    }
  }

  /** A shower of sparks (summons, buffs, small hits). */
  burst(at: THREE.Vector3, color: number, count = 18, power = 3) {
    this.emit('glow', at, { color, size: 0.6 + power * 0.25, grow: 2, life: 0.25 });
    for (let i = 0; i < count; i++) {
      this.emit(i % 3 ? 'star' : 'sparkle', at, { color, size: 0.3 + Math.random() * 0.25, grow: 0.2, life: 0.5 + Math.random() * 0.4, vel: this.scatter(power), gravity: 6, spin: (Math.random() - 0.5) * 6 });
    }
  }

  /** A sword stroke across a melee hit. */
  slash(at: THREE.Vector3, color = 0xfff1c8) {
    this.emit('slash', at.clone().setY(at.y + 0.2), { color, size: 2.2, grow: 1.3, life: 0.22 });
    for (let i = 0; i < 5; i++) this.emit('star', at, { color, size: 0.3, grow: 0.2, life: 0.35, vel: this.scatter(3), gravity: 6 });
  }

  /** A wave of light/fire down a whole lane. */
  async laneBlast(laneX: number, kind: SpellIcon) {
    const color = COLORS[kind];
    const len = ROW_D * (LAST_ROW + 1);
    const geo = new THREE.BoxGeometry(LANE_W * 0.85, 0.1, len);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const slab = new THREE.Mesh(geo, mat);
    slab.position.set(laneX, 0.15, -ROW_D * LAST_ROW / 2);
    this.scene.add(slab);
    const fiery = kind === 'fire' || kind === 'meteor';
    const rows: Promise<void>[] = [];
    for (let r = 0; r <= LAST_ROW; r++) {
      const p = new THREE.Vector3(laneX, 0.3, -r * ROW_D);
      rows.push(tween(0.07 * r, () => {}).then(() => {
        if (fiery) {
          for (let i = 0; i < 3; i++) this.emit('jet', p.clone().add(new THREE.Vector3((i - 1) * 0.7, 0.8, 0)), { color: i === 1 ? 0xffd04a : color, size: 1.8, grow: 1.3, life: 0.45, rotation: 0, vel: new THREE.Vector3(0, 1.5, 0) });
          this.emit('smoke', p.clone().setY(1.2), { color: 0x2a2220, size: 1.2, grow: 2, life: 0.8, vel: new THREE.Vector3(0, 1.2, 0), normal: true, opacity: 0.5 });
        } else {
          this.decal('ring', p.clone().setY(0.12), { color, size: 0.8, grow: 3, life: 0.4 });
          this.burst(p, color, 6, 3);
        }
      }));
    }
    await tween(0.55, (k) => {
      mat.opacity = Math.sin(k * Math.PI) * 0.45;
      slab.scale.y = 1 + k * 18;
    });
    await Promise.all(rows);
    this.scene.remove(slab);
    geo.dispose();
    mat.dispose();
  }

  /** A falling burning rock for the meteor spell, with a scorch mark where it lands. */
  async meteor(target: THREE.Vector3) {
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.8, 0),
      new THREE.MeshBasicMaterial({ color: 0xff5a1a, toneMapped: false }),
    );
    rock.add(new THREE.PointLight(0xff5a1a, 20, 12, 1.5));
    const from = target.clone().add(new THREE.Vector3(3, 14, 4));
    this.scene.add(rock);
    await tween(0.55, (k) => {
      rock.position.lerpVectors(from, target, ease.inQuad(k));
      rock.rotation.x += 0.2;
      this.emit('flame', rock.position, { color: Math.random() < 0.5 ? 0xff7a1a : 0xffc04a, size: 1.6, grow: 0.4, life: 0.35, vel: this.scatter(0.8) });
      if (Math.random() < 0.4) this.emit('smoke', rock.position, { color: 0x2a2220, size: 1.2, grow: 2, life: 0.7, normal: true, opacity: 0.5 });
    });
    this.scene.remove(rock);
    const ground = target.clone().setY(0.1);
    this.decal('scorch', ground, { color: 0x1a0a04, size: 3.6, grow: 1, life: 2.2, normal: true, opacity: 0.85 });
    this.decal('ring', ground.clone().setY(0.14), { color: 0xffa040, size: 1.2, grow: 5, life: 0.5 });
    this.emit('glow', target, { color: 0xffb04a, size: 4, grow: 1.6, life: 0.35 });
    for (let i = 0; i < 12; i++) this.emit(i % 2 ? 'fire' : 'flame', target, { color: i % 3 ? 0xff7a1a : 0xffd04a, size: 1.4, grow: 2, life: 0.55, vel: this.scatter(5), gravity: -1 });
    for (let i = 0; i < 6; i++) this.emit('smoke', target, { color: 0x2a2220, size: 1.6, grow: 2.4, life: 1.2, vel: this.scatter(2).setY(1.8), normal: true, opacity: 0.6 });
  }

  /** Whole-board wave for untargeted spells: a shock ring and a magic circle. */
  async nova(kind: SpellIcon) {
    const color = COLORS[kind];
    const centre = new THREE.Vector3(0, 0.2, -6);
    this.decal('rune', centre.clone().setY(0.16), { color, size: 5, grow: 1.4, life: 0.9, spin: 1.6, opacity: 0.9 });
    this.decal('ring', centre, { color, size: 2, grow: 12, life: 0.65 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.emit('sparkle', centre.clone().setY(0.6), { color, size: 0.6, grow: 0.3, life: 0.7, vel: new THREE.Vector3(Math.cos(a) * 9, 1, Math.sin(a) * 9) });
    }
    await tween(0.6, () => {});
  }

  /** Floating combat text, positioned in screen space. */
  floatText(world: THREE.Vector3, text: string, cls: string) {
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    this.textLayer.appendChild(el);
    const p = world.clone().project(this.camera);
    const x = (p.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    void tween(1.0, (k) => {
      el.style.transform = `translate(-50%, ${-50 - k * 70}%) scale(${1 + 0.35 * ease.outBack(Math.min(1, k * 4))})`;
      el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }).then(() => el.remove());
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      const k = Math.max(0, p.life / p.max);
      p.obj.scale.setScalar(p.size * (p.grow + (1 - p.grow) * k));
      // Quick fade-in, then fade out over the second half of the life.
      p.mat.opacity = p.opacity * Math.min(1, (1 - k) * 8, k * 2);
      if (p.flat) p.obj.rotation.y += p.spin * dt;
      else (p.mat as THREE.SpriteMaterial).rotation += p.spin * dt;
      if (p.life <= 0) {
        this.scene.remove(p.obj);
        p.mat.dispose();
        if (p.flat) (p.obj as THREE.Mesh).geometry.dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
