import * as THREE from 'three';
import { LANES, LAST_ROW, ROWS } from '../game/types';
import { instantiateStatic } from './assets';

export const LANE_W = 2.6;
export const ROW_D = 2.35;
/** Where the player's spells and hero power are cast from (the hero itself is the HUD portrait). */
export const HERO_POS = new THREE.Vector3(-5.2, 0, 3.4);
/** The enemy hero stands in front of the gate, past the last row. */
export const ENEMY_HERO_POS = new THREE.Vector3(0, 0, -(ROWS + 0.35) * ROW_D);

export function laneX(lane: number): number {
  return (lane - (LANES - 1) / 2) * LANE_W;
}

/** Row 0 is the player's home row, LAST_ROW the enemy's. Row -1 / ROWS are the heroes' edges. */
export function rowZ(row: number): number {
  return -row * ROW_D;
}

export function cellPos(lane: number, row: number): THREE.Vector3 {
  return new THREE.Vector3(laneX(lane), 0, rowZ(row));
}

export type CellHighlight = 'none' | 'valid' | 'hover' | 'danger' | 'lane' | 'enemyHome';

export class Board {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly cells: THREE.Mesh[][] = [];
  /** Floor marker under the enemy hero, lit when it is a valid or hovered target. */
  private heroMarker!: THREE.Mesh;
  private readonly torches: { light: THREE.PointLight; base: number; phase: number }[] = [];
  private readonly flames: { sprite: THREE.Sprite; phase: number }[] = [];
  private shake = 0;
  private readonly camBase = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    // Phones: fewer pixels and a smaller shadow map keep the frame rate up.
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile || window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(0x0d0a10);
    this.scene.fog = new THREE.Fog(0x0d0a10, 18, 38);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.resize();

    const hemi = new THREE.HemisphereLight(0xb8c4ff, 0x2a1a12, 0.85);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xffe2c0, 1.6);
    moon.position.set(-6, 14, 6);
    moon.target.position.set(0, 0, -6);
    moon.castShadow = true;
    moon.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
    const sc = moon.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 40;
    moon.shadow.bias = -0.0008;
    this.scene.add(moon, moon.target);

    this.buildCells();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull the camera back on narrow screens so all five lanes stay visible.
    const portrait = Math.max(0, 1.5 - this.camera.aspect);
    this.camBase.set(0, 18.5 + portrait * 10, 10.5 + portrait * 6);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 0, -5.6);
    this.camera.updateProjectionMatrix();
  }

  async buildEnvironment() {
    const add = async (name: string, x: number, z: number, rotY = 0, y = 0) => {
      const o = await instantiateStatic(name);
      o.position.set(x, y, z);
      o.rotation.y = rotY;
      this.scene.add(o);
      return o;
    };
    const jobs: Promise<unknown>[] = [];
    // Floor: 4x4 tiles covering the hall.
    for (let x = -8; x <= 8; x += 4) {
      for (let z = 6; z >= -22; z -= 4) {
        const variant = (x * 7 + z * 13) & 7;
        const tile = z < -15 ? 'floor_dirt_large' : variant === 0 ? 'floor_tile_large_rocks' : variant === 3 && z < -4 ? 'floor_tile_big_grate' : 'floor_tile_large';
        jobs.push(add(tile, x, z));
      }
    }
    // Side walls with pillars and torches.
    for (let z = 4; z >= -20; z -= 4) {
      const crack = ((z * 5) & 3) === 0;
      jobs.push(add(crack ? 'wall_cracked' : 'wall', -9.5, z, Math.PI / 2));
      jobs.push(add(crack ? 'wall' : 'wall_cracked', 9.5, z, -Math.PI / 2));
    }
    for (let z = 2; z >= -18; z -= 8) {
      jobs.push(add('pillar', -8.7, z));
      jobs.push(add('pillar', 8.7, z));
    }
    // Side-wall torches; real lights only on the defenders' end to keep the shader light count low.
    for (const [z, lit] of [[-2, true], [-10, false]] as const) {
      jobs.push(this.addTorch(-9.0, z, Math.PI / 2, 2.2, lit));
      jobs.push(this.addTorch(9.0, z, -Math.PI / 2, 2.2, lit));
    }
    jobs.push(add('banner_patternA_red', -9.0, -6, Math.PI / 2));
    jobs.push(add('banner_shield_blue', 9.0, -6, -Math.PI / 2));
    // The gate monsters pour out of.
    jobs.push(add('wall', -6, -17.5));
    jobs.push(add('wall_gated', -2, -17.5));
    jobs.push(add('wall_gated', 2, -17.5));
    jobs.push(add('wall', 6, -17.5));
    jobs.push(add('rubble_large', -7.6, -16, 0.3));
    // Torches flanking the gate, lighting the enemy commander's end like the defenders' end. They
    // hang lower than the side ones so the flame and its pool of light stay on screen.
    jobs.push(this.addTorch(-4.6, -16.95, 0, 1.6, true, 20));
    jobs.push(this.addTorch(4.6, -16.95, 0, 1.6, true, 20));
    this.addTorchLight(new THREE.Vector3(0, 2.9, -16.2), 0x7cff9a, 9);
    // The defenders' side.
    jobs.push(add('barrier_column', -6.5, 1.6));
    jobs.push(add('barrier_column', 6.5, 1.6));
    jobs.push(add('barrel_large', -7.6, 4.5));
    jobs.push(add('crates_stacked', 7.4, 4.8, 0.4));
    jobs.push(add('chest_gold', -5.8, 5.2, 0.5));
    jobs.push(add('sword_shield', -8.9, -2, Math.PI / 2, 2.2));
    await Promise.all(jobs);
  }

  /** A wall torch with a visible flame; `lit` also gives it a real (flickering) light. */
  private async addTorch(x: number, z: number, rotY: number, y: number, lit: boolean, intensity = 14) {
    const o = await instantiateStatic('torch_mounted');
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    this.scene.add(o);
    // The torch head sits up and out from the wall bracket.
    const head = new THREE.Vector3(0, 0.62, 0.42).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(o.position);
    const flame = new THREE.Sprite(this.flameMaterial());
    flame.position.copy(head);
    flame.scale.setScalar(0.9);
    this.scene.add(flame);
    const phase = Math.random() * 10;
    this.flames.push({ sprite: flame, phase });
    if (lit) this.addTorchLight(head.clone().add(new THREE.Vector3(0, 0.3, 0)).addScaledVector(new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)), 0.4), 0xff9a3c, intensity, phase);
  }

  private flameMat: THREE.SpriteMaterial | null = null;

  /** A soft additive glow (white core, orange edge) drawn once on a canvas. */
  private flameMaterial() {
    if (!this.flameMat) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 36, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,250,220,1)');
      grad.addColorStop(0.25, 'rgba(255,200,90,.95)');
      grad.addColorStop(0.55, 'rgba(255,110,30,.45)');
      grad.addColorStop(1, 'rgba(255,60,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.flameMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    }
    return this.flameMat;
  }

  private addTorchLight(at: THREE.Vector3, color = 0xff9a3c, intensity = 14, phase = Math.random() * 10) {
    const light = new THREE.PointLight(color, intensity, 11, 1.6);
    light.position.copy(at);
    this.scene.add(light);
    this.torches.push({ light, base: intensity, phase });
  }

  private buildCells() {
    const geo = new THREE.PlaneGeometry(LANE_W * 0.92, ROW_D * 0.9);
    geo.rotateX(-Math.PI / 2);
    for (let lane = 0; lane < LANES; lane++) {
      this.cells.push([]);
      for (let row = 0; row <= LAST_ROW; row++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(cellPos(lane, row)).setY(0.07);
        m.renderOrder = 1;
        this.cells[lane].push(m);
        this.scene.add(m);
      }
    }
    this.heroMarker = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.heroMarker.position.set(ENEMY_HERO_POS.x, 0.09, ENEMY_HERO_POS.z);
    this.heroMarker.renderOrder = 1;
    this.scene.add(this.heroMarker);
    // Faint lines marking each side's home row.
    for (const [z, color] of [[-ROW_D / 2, 0xffc46b], [-(LAST_ROW - 0.5) * ROW_D, 0x7dff9a]] as const) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(LANE_W * LANES, 0.08).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
      );
      line.position.set(0, 0.08, z);
      this.scene.add(line);
    }
    // Lane dividers running down the hall.
    const depth = ROW_D * ROWS;
    const dividerMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    for (let i = 0; i <= LANES; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.06, depth).rotateX(-Math.PI / 2), dividerMat);
      d.position.set(laneX(i) - LANE_W / 2, 0.075, -depth / 2 + ROW_D / 2);
      this.scene.add(d);
    }
  }

  /** Base look of the grid: both home rows are tinted, everything else invisible. */
  clearHighlights() {
    this.setHeroHighlight('none');
    for (let lane = 0; lane < LANES; lane++) {
      for (let row = 0; row <= LAST_ROW; row++) this.setCell(lane, row, row === 0 ? 'lane' : row === LAST_ROW ? 'enemyHome' : 'none');
    }
  }

  setCell(lane: number, row: number, kind: CellHighlight) {
    const cell = this.cells[lane]?.[row];
    if (!cell) return;
    const mat = cell.material as THREE.MeshBasicMaterial;
    const style: Record<CellHighlight, [number, number]> = {
      none: [0xffffff, 0],
      lane: [0xc9b48a, 0.12],
      valid: [0x5cf2a3, 0.22],
      hover: [0xfff27a, 0.45],
      danger: [0xff4a3d, 0.2],
      enemyHome: [0x7dff9a, 0.06],
    };
    mat.color.setHex(style[kind][0]);
    mat.opacity = style[kind][1];
  }

  setHeroHighlight(kind: 'none' | 'valid' | 'hover') {
    const mat = this.heroMarker.material as THREE.MeshBasicMaterial;
    mat.color.setHex(kind === 'hover' ? 0xfff27a : 0x5cf2a3);
    mat.opacity = kind === 'hover' ? 0.5 : kind === 'valid' ? 0.25 : 0;
  }

  /**
   * Board cell under the pointer. Rows past the last row (the strip in front of
   * the gate, where the enemy hero stands) come back as `row: ROWS`.
   */
  pickGround(ndc: THREE.Vector2): { lane: number; row: number } | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    const lane = Math.round(hit.x / LANE_W + (LANES - 1) / 2);
    const row = Math.round(-hit.z / ROW_D);
    if (row < 0) return null;
    if (row > LAST_ROW) return Math.abs(hit.x) < (LANES / 2) * LANE_W + 1 ? { lane: Math.min(LANES - 1, Math.max(0, lane)), row: ROWS } : null;
    if (lane < 0 || lane >= LANES) return null;
    return { lane, row };
  }

  addShake(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt: number, time: number) {
    for (const t of this.torches) {
      t.light.intensity = t.base * (0.85 + 0.15 * Math.sin(time * 9 + t.phase) * Math.sin(time * 3.7 + t.phase * 2));
    }
    for (const f of this.flames) {
      const k = 0.9 + 0.12 * Math.sin(time * 11 + f.phase) * Math.sin(time * 4.3 + f.phase * 3);
      f.sprite.scale.set(1.1 * k, 1.35 * k, 1);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.35;
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * s,
        this.camBase.y + (Math.random() - 0.5) * s,
        this.camBase.z + (Math.random() - 0.5) * s,
      );
    } else {
      this.camera.position.copy(this.camBase);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
