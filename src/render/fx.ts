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

export class Fx {
  private readonly particles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number }[] = [];
  private readonly sparkGeo = new THREE.SphereGeometry(0.09, 6, 4);

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera, private readonly textLayer: HTMLElement) {}

  /** Glowing orb flying from `from` to `to` on an arc. */
  async projectile(from: THREE.Vector3, to: THREE.Vector3, kind: keyof typeof COLORS, speed = 16, size = 0.22) {
    const color = COLORS[kind];
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(size, 12, 8),
      new THREE.MeshBasicMaterial({ color, toneMapped: false }),
    );
    const light = new THREE.PointLight(color, 6, 5, 2);
    orb.add(light);
    this.scene.add(orb);
    const dist = from.distanceTo(to);
    const height = Math.min(2.2, dist * 0.18);
    await tween(Math.max(0.18, dist / speed), (k) => {
      orb.position.lerpVectors(from, to, k);
      orb.position.y += Math.sin(k * Math.PI) * height;
      if (Math.random() < 0.6) this.spark(orb.position, color, 0.4, 0.6);
    });
    this.scene.remove(orb);
    this.burst(to, color, 14);
  }

  burst(at: THREE.Vector3, color: number, count = 18, power = 3) {
    for (let i = 0; i < count; i++) this.spark(at, color, power, 0.5 + Math.random() * 0.4);
  }

  private spark(at: THREE.Vector3, color: number, power: number, life: number) {
    const mesh = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false }));
    mesh.position.copy(at);
    const vel = new THREE.Vector3((Math.random() - 0.5) * power, Math.random() * power, (Math.random() - 0.5) * power);
    this.scene.add(mesh);
    this.particles.push({ mesh, vel, life, max: life });
  }

  /** A column of light/fire over a whole lane. */
  async laneBlast(laneX: number, kind: SpellIcon) {
    const color = COLORS[kind];
    const len = ROW_D * (LAST_ROW + 1);
    const geo = new THREE.BoxGeometry(LANE_W * 0.85, 0.1, len);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, toneMapped: false, depthWrite: false });
    const slab = new THREE.Mesh(geo, mat);
    slab.position.set(laneX, 0.15, -ROW_D * LAST_ROW / 2);
    this.scene.add(slab);
    const flames: Promise<void>[] = [];
    for (let r = 0; r <= LAST_ROW; r++) {
      const p = new THREE.Vector3(laneX, 0.4, -r * ROW_D);
      flames.push(tween(0.08 * r, () => {}).then(() => this.burst(p, color, 10, 4)));
    }
    await tween(0.55, (k) => {
      mat.opacity = Math.sin(k * Math.PI) * 0.55;
      slab.scale.y = 1 + k * 18;
    });
    await Promise.all(flames);
    this.scene.remove(slab);
  }

  /** A falling rock for the meteor spell. */
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
      this.spark(rock.position, 0xffa040, 1, 0.5);
    });
    this.scene.remove(rock);
    this.burst(target, 0xff6a1a, 40, 7);
  }

  /** Whole-board shimmer for untargeted spells. */
  async nova(kind: SpellIcon) {
    const color = COLORS[kind];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.position.set(0, 0.2, -6);
    this.scene.add(ring);
    await tween(0.6, (k) => {
      ring.scale.setScalar(1 + k * 12);
      (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
    this.scene.remove(ring);
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
      p.vel.y -= 6 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const k = Math.max(0, p.life / p.max);
      p.mesh.scale.setScalar(k);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = k;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
