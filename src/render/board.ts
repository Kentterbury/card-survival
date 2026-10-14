import * as THREE from 'three';
import { LANES, SPAWN_ROW } from '../game/types';
import { instantiateStatic } from './assets';

export const LANE_W = 2.6;
export const ROW_D = 2.35;
/** Where hero spells and the hero power are cast from (the hero itself is the HUD portrait). */
export const HERO_POS = new THREE.Vector3(-5.2, 0, 3.4);

export function laneX(lane: number): number {
  return (lane - (LANES - 1) / 2) * LANE_W;
}

/** Row 0 is the defense line (minion slots); monsters occupy rows 1..SPAWN_ROW. */
export function rowZ(row: number): number {
  return -row * ROW_D;
}

export function cellPos(lane: number, row: number): THREE.Vector3 {
  return new THREE.Vector3(laneX(lane), 0, rowZ(row));
}

export type CellHighlight = 'none' | 'valid' | 'hover' | 'danger' | 'lane';

export class Board {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly cells: THREE.Mesh[][] = [];
  private readonly torches: { light: THREE.PointLight; base: number; phase: number }[] = [];
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
      jobs.push(add('torch_mounted', -9.0, z - 4, Math.PI / 2, 2.2));
      jobs.push(add('torch_mounted', 9.0, z - 4, -Math.PI / 2, 2.2));
      // Real lights only on every other torch to keep the shader light count low.
      if (z !== -6) {
        this.addTorchLight(-8.2, z - 4);
        this.addTorchLight(8.2, z - 4);
      }
    }
    jobs.push(add('banner_patternA_red', -9.0, -6, Math.PI / 2));
    jobs.push(add('banner_shield_blue', 9.0, -6, -Math.PI / 2));
    // The gate monsters pour out of.
    jobs.push(add('wall', -6, -17.5));
    jobs.push(add('wall_gated', -2, -17.5));
    jobs.push(add('wall_gated', 2, -17.5));
    jobs.push(add('wall', 6, -17.5));
    jobs.push(add('rubble_large', -6.5, -16, 0.3));
    this.addTorchLight(0, -16.2, 0x7cff9a, 9);
    // The defenders' side.
    jobs.push(add('barrier_column', -6.5, 1.6));
    jobs.push(add('barrier_column', 6.5, 1.6));
    jobs.push(add('barrel_large', -7.6, 4.5));
    jobs.push(add('crates_stacked', 7.4, 4.8, 0.4));
    jobs.push(add('chest_gold', -5.8, 5.2, 0.5));
    jobs.push(add('sword_shield', -8.9, -2, Math.PI / 2, 2.2));
    await Promise.all(jobs);
  }

  private addTorchLight(x: number, z: number, color = 0xff9a3c, intensity = 14) {
    const light = new THREE.PointLight(color, intensity, 11, 1.6);
    light.position.set(x, 2.9, z);
    this.scene.add(light);
    this.torches.push({ light, base: intensity, phase: Math.random() * 10 });
  }

  private buildCells() {
    const geo = new THREE.PlaneGeometry(LANE_W * 0.92, ROW_D * 0.9);
    geo.rotateX(-Math.PI / 2);
    for (let lane = 0; lane < LANES; lane++) {
      this.cells.push([]);
      for (let row = 0; row <= SPAWN_ROW; row++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(cellPos(lane, row)).setY(0.07);
        m.renderOrder = 1;
        this.cells[lane].push(m);
        this.scene.add(m);
      }
    }
    // A faint line marking the defense line and the slots behind it.
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(LANE_W * LANES, 0.08).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.55 }),
    );
    line.position.set(0, 0.08, -ROW_D / 2);
    this.scene.add(line);
    // Lane dividers running down the hall.
    const depth = ROW_D * (SPAWN_ROW + 1);
    const dividerMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    for (let i = 0; i <= LANES; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.06, depth).rotateX(-Math.PI / 2), dividerMat);
      d.position.set(laneX(i) - LANE_W / 2, 0.075, -depth / 2 + ROW_D / 2);
      this.scene.add(d);
    }
  }

  /** Base look of the grid: slots are outlined, everything else invisible. */
  clearHighlights() {
    for (let lane = 0; lane < LANES; lane++) {
      for (let row = 0; row <= SPAWN_ROW; row++) this.setCell(lane, row, row === 0 ? 'lane' : 'none');
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
      danger: [0xff4a3d, 0.18],
    };
    mat.color.setHex(style[kind][0]);
    mat.opacity = style[kind][1];
  }

  /** Ground point under the pointer, in board coordinates. */
  pickGround(ndc: THREE.Vector2): { lane: number; row: number } | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    const lane = Math.round(hit.x / LANE_W + (LANES - 1) / 2);
    const row = Math.round(-hit.z / ROW_D);
    if (lane < 0 || lane >= LANES || row < 0 || row > SPAWN_ROW + 1) return null;
    return { lane, row: Math.min(row, SPAWN_ROW) };
  }

  addShake(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt: number, time: number) {
    for (const t of this.torches) {
      t.light.intensity = t.base * (0.85 + 0.15 * Math.sin(time * 9 + t.phase) * Math.sin(time * 3.7 + t.phase * 2));
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
