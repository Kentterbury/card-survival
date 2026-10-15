import * as THREE from 'three';
import type { ModelId, Side, Unit } from '../game/types';
import { animsFor, instantiateCharacter, instantiateStatic, useSynty, type AnimSet } from './assets';
import { deathClipsFor } from './syntySet';
import { ease, tween, wait } from './tween';

export type Facing = 'enemy' | 'player';

const UNIT_SCALE = 1.1;

export class UnitView {
  readonly group = new THREE.Group();
  /** Invisible box used for pointer picking. */
  readonly proxy: THREE.Mesh;
  readonly badge: HTMLDivElement;
  attack = 0;
  health = 0;
  maxHealth = 0;
  private model!: THREE.Object3D;
  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private anims: AnimSet | undefined;
  private current: THREE.AnimationAction | null = null;
  private ward: THREE.Mesh | null = null;
  private ice: THREE.Mesh | null = null;
  private flashMats: THREE.MeshStandardMaterial[] = [];
  dead = false;
  /** Flyers hover above the floor and bob gently. */
  private hover = 0;
  private bobT = Math.random() * 6;

  constructor(
    readonly uid: number,
    readonly side: Side | 'hero',
    readonly modelId: ModelId,
    readonly scale: number,
    badgeLayer: HTMLElement,
    /** Card id, `hero:<id>` or `boss:<name>`: picks the character look in the Synty set. */
    readonly look?: string,
  ) {
    this.proxy = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 2.9 * scale, 1.5),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.proxy.position.y = 1.45 * scale;
    this.proxy.userData.uid = uid;
    this.group.add(this.proxy);
    this.badge = document.createElement('div');
    this.badge.className = `unit-badge ${side}`;
    if (side !== 'hero') badgeLayer.appendChild(this.badge);
  }

  async load(facing: Facing) {
    if (this.modelId === 'barrier') {
      this.model = await instantiateStatic('barrier');
      this.model.scale.setScalar(0.58);
    } else {
      const inst = await instantiateCharacter(this.modelId, this.look);
      this.model = inst.root;
      this.mixer = inst.mixer;
      this.clips = inst.clips;
      this.anims = animsFor(this.modelId, this.look);
      // Synty: a per-concept death clip when the library has it (else die() topples the unit).
      const death = useSynty ? deathClipsFor(this.look).find((d) => this.clips.some((c) => c.name === d)) : undefined;
      if (this.anims && death) this.anims = { ...this.anims, death };
      this.model.scale.setScalar(UNIT_SCALE * this.scale);
      // Wide-brimmed mage hats read as a big disc from the top-down camera.
      const hat = this.model.getObjectByName('Mage_Hat');
      if (hat) hat.visible = false;
      this.model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Own the materials so hit flashes do not tint every clone.
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const owned = mats.map((m) => m.clone() as THREE.MeshStandardMaterial);
        mesh.material = Array.isArray(mesh.material) ? owned : owned[0];
        this.flashMats.push(...owned);
      });
      if (this.anims) this.loop(this.anims.idle, 0);
      if (this.mixer) this.mixer.setTime(Math.random() * 2);
    }
    this.model.rotation.y = facing === 'enemy' ? Math.PI : 0;
    this.group.add(this.model);
  }

  setStats(u: Pick<Unit, 'attack' | 'health' | 'maxHealth'>) {
    this.attack = u.attack;
    this.health = u.health;
    this.maxHealth = u.maxHealth;
    this.renderBadge();
  }

  renderBadge(extra = '') {
    if (this.side === 'hero') return;
    const hurt = this.health < this.maxHealth ? ' hurt' : '';
    const showAtk = this.modelId !== 'barrier';
    this.badge.innerHTML =
      (showAtk ? `<span class="atk">${this.attack}</span>` : '') +
      `<span class="hp${hurt}">${Math.max(0, this.health)}</span>${extra}`;
  }

  setWard(on: boolean) {
    if (on && !this.ward) {
      this.ward = new THREE.Mesh(
        new THREE.SphereGeometry(1.3 * this.scale, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      this.ward.position.y = 1.25 * this.scale;
      this.group.add(this.ward);
    } else if (!on && this.ward) {
      const w = this.ward;
      this.ward = null;
      const mat = w.material as THREE.MeshBasicMaterial;
      void tween(0.35, (k) => {
        w.scale.setScalar(1 + k * 0.6);
        mat.opacity = 0.35 * (1 - k);
      }).then(() => this.group.remove(w));
    }
  }

  setFrozen(on: boolean) {
    if (on && !this.ice) {
      this.ice = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.15 * this.scale, 0),
        new THREE.MeshStandardMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.2, emissive: 0x2a7bb0, emissiveIntensity: 0.5 }),
      );
      this.ice.scale.y = 1.4;
      this.ice.position.y = 1.25 * this.scale;
      this.group.add(this.ice);
      if (this.current) this.current.timeScale = 0;
    } else if (!on && this.ice) {
      this.group.remove(this.ice);
      this.ice = null;
      if (this.current) this.current.timeScale = 1;
    }
  }

  get frozen() {
    return this.ice !== null;
  }

  private clip(name: string) {
    return this.clips.find((c) => c.name === name);
  }

  loop(name: string, fade = 0.25) {
    if (!this.mixer) return;
    const clip = this.clip(name);
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    if (action === this.current) return;
    action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    action.timeScale = 1;
    if (this.current) action.crossFadeFrom(this.current, fade, false);
    this.current = action;
  }

  /** Plays a one-shot clip; resolves after `hitAt` of its length (the moment of impact). */
  playOnce(name: string, hitAt = 1, returnToIdle = true, speed = 1): Promise<void> {
    if (!this.mixer) return wait(0.2);
    const clip = this.clip(name);
    if (!clip) return wait(0.2);
    const action = this.mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopOnce, 1).play();
    action.timeScale = speed;
    action.clampWhenFinished = true;
    if (this.current && this.current !== action) action.crossFadeFrom(this.current, 0.12, false);
    this.current = action;
    const dur = clip.duration / speed;
    if (returnToIdle && this.anims) {
      void wait(dur * 0.92).then(() => {
        if (this.current === action && !this.dead) this.loop(this.anims!.idle, 0.2);
      });
    }
    return wait(dur * hitAt);
  }

  attackAnim(): Promise<void> {
    if (!this.anims) return this.bump();
    return this.playOnce(this.anims.attack, 0.45);
  }

  hitAnim() {
    this.flash(0xff3b30);
    if (this.anims && !this.frozen) void this.playOnce(this.anims.hit, 1);
    else void this.bump();
  }

  flash(color: number) {
    for (const m of this.flashMats) {
      if (!('emissive' in m)) continue;
      m.emissive.setHex(color);
    }
    void tween(0.3, (k) => {
      for (const m of this.flashMats) if ('emissiveIntensity' in m) m.emissiveIntensity = 1.2 * (1 - k);
    });
  }

  private bump(): Promise<void> {
    const base = this.model.position.y;
    return tween(0.25, (k) => { this.model.position.y = base + Math.sin(k * Math.PI) * 0.25; });
  }

  async spawnAnim() {
    if (this.anims?.spawn) {
      // Skeletons climbing out of the ground, played 1.5x faster than authored.
      await this.playOnce(this.anims.spawn, 0.85, true, 1.5);
    } else if (this.anims && this.modelId.startsWith('Skeleton')) {
      // No authored spawn clip (the Synty set): the skeleton climbs out of the floor instead.
      const y = this.model.position.y;
      this.loop(this.anims.walk, 0);
      await tween(0.55, (k) => { this.model.position.y = y - 2.6 * (1 - ease.outCubic(k)); });
      this.loop(this.anims.idle, 0.3);
    } else {
      const s = this.model.scale.x;
      await tween(0.35, (k) => this.model.scale.setScalar(s * ease.outBack(k)));
    }
  }

  async moveTo(target: THREE.Vector3, duration: number, walk = true) {
    const from = this.group.position.clone();
    if (walk && this.anims) this.loop(this.anims.walk, 0.15);
    await tween(duration, (k) => this.group.position.lerpVectors(from, target, ease.inOutSine(k)));
    if (walk && this.anims && !this.frozen) this.loop(this.anims.idle, 0.2);
  }

  /** Melee strike: step toward the target, swing, step back. */
  async lunge(target: THREE.Vector3) {
    const home = this.group.position.clone();
    const dir = target.clone().sub(home);
    const dist = dir.length();
    const reach = home.clone().add(dir.multiplyScalar(Math.max(0, (dist - 1.2) / dist)));
    await tween(0.18, (k) => this.group.position.lerpVectors(home, reach, ease.outCubic(k)));
    await this.attackAnim();
    void tween(0.3, (k) => this.group.position.lerpVectors(reach, home, ease.inOutSine(k)));
  }

  async die() {
    this.dead = true;
    this.badge.remove();
    this.setFrozen(false);
    if (this.anims?.death) {
      // Mixamo deaths run 2–5 s; keep every death to about 1.6 s of game time.
      const len = this.clip(this.anims.death)?.duration ?? 1;
      await this.playOnce(this.anims.death, 0.92, false, Math.max(1, len / 1.6));
    } else if (this.anims) {
      // No authored death clip (the Synty set): freeze the current pose (stopping the actions
      // would snap the rig to its T-pose) and topple backwards from the feet.
      if (this.mixer) this.mixer.timeScale = 0;
      this.model.rotation.order = 'YXZ';
      await tween(0.45, (k) => { this.model.rotation.x = -(k ** 3) * Math.PI * 0.5; });
    }
    const y = this.group.position.y;
    await tween(0.6, (k) => {
      this.group.position.y = y - k * 1.2;
    });
  }

  setFlying(on: boolean) {
    this.hover = on ? 0.9 : 0;
    if (this.model) this.model.position.y = this.hover;
  }

  update(dt: number) {
    this.mixer?.update(dt);
    if (this.hover && this.model && !this.dead) {
      this.bobT += dt * 2.2;
      this.model.position.y = this.hover + Math.sin(this.bobT) * 0.15;
    }
    if (this.ward) this.ward.rotation.y += dt;
  }

  headPosition(): THREE.Vector3 {
    return this.group.position.clone().add(new THREE.Vector3(0, 2.25 * this.scale * UNIT_SCALE + 0.15 + this.hover, 0));
  }

  dispose() {
    this.badge.remove();
    this.group.removeFromParent();
  }
}
