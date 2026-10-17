import * as THREE from 'three';
import { LANES, LAST_ROW, ROWS, type ZoneKind } from '../game/types';
import { instantiateStatic } from './assets';
import { decorPiece, type DecorKind } from './decor';
import { groundTexture, naturePiece, type NatureKind } from './forest';

export type EnvName = 'forest' | 'dungeon';

/**
 * Camera modes: `classic` looks down the lanes from behind the defenders, `side` watches the
 * two armies face off left to right from the flank (strategy-RPG battle screen), `iso` is a
 * near-orthographic three-quarter view from the defenders' right corner.
 */
export type CameraMode = 'classic' | 'side' | 'iso';
export const CAMERA_MODES: CameraMode[] = ['classic', 'side', 'iso'];

interface CamPose { pos: THREE.Vector3; target: THREE.Vector3; fov: number }

/** Scenery past this x stands between the side / iso cameras and the board, so it is hidden. */
const NEAR_SIDE_X = 6.2;

/** Sky, fog and light colours per board. */
const MOOD: Record<EnvName, { bg: number; fogNear: number; fogFar: number; sky: number; ground: number; hemi: number; moon: number; moonI: number }> = {
  dungeon: { bg: 0x110d14, fogNear: 20, fogFar: 42, sky: 0xbcc8ff, ground: 0x3a2a1e, hemi: 1.1, moon: 0xffe4c4, moonI: 1.9 },
  forest: { bg: 0x101c16, fogNear: 24, fogFar: 50, sky: 0xbcd6ff, ground: 0x34482a, hemi: 1.6, moon: 0xe4eeff, moonI: 2.4 },
};

export const LANE_W = 2.6;
export const ROW_D = 2.35;
/** The player's hero stands behind the home row, mid-board; spells and the hero power start here. */
export const HERO_POS = new THREE.Vector3(0, 0, 3.5);
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
  private readonly flames: { sprite: THREE.Sprite; phase: number; size: number }[] = [];
  /** One group per board (built on first use); only the current one is visible. */
  private readonly envs = new Map<EnvName, THREE.Group>();
  private env: EnvName | null = null;
  /** Where environment pieces go while a board is being built. */
  private building: THREE.Object3D = this.scene;
  private hemi!: THREE.HemisphereLight;
  private moon!: THREE.DirectionalLight;
  private shake = 0;
  private readonly camBase = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3(0, 0, -5.6);
  private camMode: CameraMode = 'classic';
  /** A running camera move between modes (eased over `dur` seconds). */
  private camMove: { from: CamPose; t: number; dur: number } | null = null;
  /** Scenery on the camera side of the board, per board (hidden in the side and iso views). */
  private readonly nearSide = new Map<EnvName, THREE.Object3D[]>();
  private fogBase = { near: 18, far: 38 };
  /** Scenery behind the defenders, one group per stage (built on first use). */
  private readonly sceneries = new Map<number, THREE.Group>();
  private sceneryStage: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // Phones: fewer pixels and a smaller shadow map keep the frame rate up.
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile || window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene.background = new THREE.Color(0x0d0a10);
    this.scene.fog = new THREE.Fog(0x0d0a10, 18, 38);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.resize();

    const hemi = new THREE.HemisphereLight(0xb8c4ff, 0x2a1a12, 0.85);
    this.scene.add(hemi);
    this.hemi = hemi;
    const moon = new THREE.DirectionalLight(0xffe2c0, 1.6);
    this.moon = moon;
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
    if (!this.camMove) this.applyPose(this.pose(this.camMode));
    this.camera.updateProjectionMatrix();
  }

  get cameraMode(): CameraMode {
    return this.camMode;
  }

  /** Switches the camera mode; the camera glides there unless `instant`. */
  setCameraMode(mode: CameraMode, instant = false) {
    if (mode === this.camMode && !instant) return;
    const from: CamPose = { pos: this.camBase.clone(), target: this.camLook.clone(), fov: this.camera.fov };
    this.camMode = mode;
    // Hide the near-side scenery before the camera swings past it, show it once back behind the lanes.
    if (mode !== 'classic') this.showNearSide(false);
    if (instant) {
      this.camMove = null;
      this.applyPose(this.pose(mode));
      this.showNearSide(mode === 'classic');
    } else {
      this.camMove = { from, t: 0, dur: 1.1 };
    }
  }

  /** Where each mode puts the camera for the current screen shape. */
  private pose(mode: CameraMode): CamPose {
    // Narrow (portrait) screens pull every camera back so the whole board stays in view.
    const portrait = Math.max(0, 1.5 - this.camera.aspect);
    switch (mode) {
      case 'classic':
        return { pos: new THREE.Vector3(0, 18.5 + portrait * 10, 10.5 + portrait * 6), target: new THREE.Vector3(0, 0, -5.6), fov: 42 };
      case 'side': {
        // From the right flank: the defenders on the left, the commander's gate on the right.
        const k = 1 + portrait * 1.1;
        return { pos: new THREE.Vector3(15 * k, 18 * k, -4.6), target: new THREE.Vector3(-0.4, -2.6, -6.6), fov: 42 };
      }
      case 'iso': {
        // A long lens from far away flattens the perspective into an isometric look.
        const yaw = Math.PI / 4;
        const pitch = Math.atan(1 / Math.SQRT2);
        const dist = 66 * (1 + portrait * 0.9);
        const target = new THREE.Vector3(0, -1.4, -6.4);
        const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        return { pos: target.clone().addScaledVector(dir, dist), target, fov: 17 };
      }
    }
  }

  private applyPose(p: CamPose) {
    this.camBase.copy(p.pos);
    this.camLook.copy(p.target);
    if (this.camera.fov !== p.fov) {
      this.camera.fov = p.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camLook);
    // Far cameras push the fog back by how much further away they are than the classic one.
    const fog = this.scene.fog as THREE.Fog;
    const classic = this.pose('classic');
    const extra = Math.max(0, this.camBase.distanceTo(this.camLook) - classic.pos.distanceTo(classic.target));
    fog.near = this.fogBase.near + extra;
    fog.far = this.fogBase.far + extra;
  }

  private showNearSide(show: boolean) {
    for (const o of this.nearSide.get(this.env!) ?? []) {
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh || (c as THREE.Sprite).isSprite) c.visible = show;
      });
    }
  }

  /** Shows a board, building it the first time, and sets its sky and light colours. */
  async setEnvironment(env: EnvName) {
    if (this.env === env) return;
    let group = this.envs.get(env);
    if (!group) {
      group = new THREE.Group();
      this.envs.set(env, group);
      this.scene.add(group);
      this.building = group;
      await (env === 'forest' ? this.buildForest() : this.buildDungeon());
      this.building = this.scene;
      this.nearSide.set(env, group.children.filter((o) => o.position.x > NEAR_SIDE_X && o.position.z > -16.5 && !(o as THREE.Light).isLight && !o.userData.keep));
    }
    for (const [name, g] of this.envs) g.visible = name === env;
    this.env = env;
    this.showNearSide(this.camMode === 'classic' && !this.camMove);
    const m = MOOD[env];
    (this.scene.background as THREE.Color).setHex(m.bg);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(m.bg);
    this.fogBase = { near: m.fogNear, far: m.fogFar };
    if (!this.camMove) this.applyPose(this.pose(this.camMode));
    this.hemi.color.setHex(m.sky);
    this.hemi.groundColor.setHex(m.ground);
    this.hemi.intensity = m.hemi;
    this.moon.color.setHex(m.moon);
    this.moon.intensity = m.moonI;
  }

  /** The board shown before any stage (the title screen): the forest the run starts in. */
  async buildEnvironment() {
    await this.setEnvironment('forest');
  }

  private async buildDungeon() {
    const add = async (name: string, x: number, z: number, rotY = 0, y = 0) => {
      const o = await instantiateStatic(name);
      o.position.set(x, y, z);
      o.rotation.y = rotY;
      this.building.add(o);
      return o;
    };
    const jobs: Promise<unknown>[] = [];
    // Floor: 4x4 tiles covering the hall.
    for (let x = -8; x <= 8; x += 4) {
      for (let z = 14; z >= -22; z -= 4) {
        const variant = (x * 7 + z * 13) & 7;
        const tile = z < -15 ? 'floor_dirt_large' : variant === 0 ? 'floor_tile_large_rocks' : variant === 3 && z < -4 ? 'floor_tile_big_grate' : 'floor_tile_large';
        // The floor never hides, even on the camera side.
        jobs.push(add(tile, x, z).then((o) => { o.userData.keep = true; }));
      }
    }
    // Side walls with pillars and torches.
    for (let z = 12; z >= -20; z -= 4) {
      const crack = ((z * 5) & 3) === 0;
      jobs.push(add(crack ? 'wall_cracked' : 'wall', -9.5, z, Math.PI / 2));
      jobs.push(add(crack ? 'wall' : 'wall_cracked', 9.5, z, -Math.PI / 2));
    }
    for (let z = 10; z >= -18; z -= 8) {
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
    // The hall's entrance behind the defenders' camp.
    jobs.push(add('wall', -6, 14.5, Math.PI));
    jobs.push(add('wall_doorway', -2, 14.5, Math.PI));
    jobs.push(add('wall', 2, 14.5, Math.PI));
    jobs.push(add('wall_cracked', 6, 14.5, Math.PI));
    jobs.push(this.addTorch(-9.0, 7, Math.PI / 2, 2.2, false));
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
    this.dungeonDecor(jobs);
    await Promise.all(jobs);
  }

  /**
   * 1장 숲: a clearing in a night forest. Tree lines stand where the dungeon walls are, a mossy
   * ruin and torches mark the enemy's end, a campfire burns on the defenders' side.
   */
  private async buildForest() {
    const g = this.building;
    // Grass all round, a trodden dirt clearing under the board.
    const grass = groundTexture('#2f4a24', ['#3d5e2c', '#26401e', '#4a6a30', '#1f3318']);
    grass.repeat.set(10, 12);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 52).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
    floor.position.set(0, -0.02, -8);
    floor.receiveShadow = true;
    g.add(floor);
    const dirtTex = groundTexture('#5a4630', ['#6a5338', '#4a3a26', '#3e5a2a', '#735c40']);
    dirtTex.repeat.set(4, 5);
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1, alphaMap: softEdge(), transparent: true, depthWrite: false }));
    dirt.position.set(0, 0.0, -6.2);
    dirt.receiveShadow = true;
    g.add(dirt);

    const jobs: Promise<unknown>[] = [];
    const put = (kind: NatureKind, size: number, x: number, z: number, rotY = 0, variant = 0, fit: 'height' | 'width' = 'height') =>
      jobs.push(naturePiece(kind, size, variant, fit).then((o) => {
        o.position.set(x, 0, z);
        o.rotation.y = rotY;
        g.add(o);
      }));
    // Tree lines on both sides, two staggered rows, a little random in size and kind.
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const side of [-1, 1]) {
      for (let z = 15.6; z >= -24; z -= 3.2) {
        const kinds: NatureKind[] = ['pine', 'round', 'pine', 'tallRound'];
        const k = kinds[Math.floor(rnd() * kinds.length)];
        put(k, 5.2 + rnd() * 2, side * (10.3 + rnd() * 0.8), z + rnd(), rnd() * 6, Math.floor(rnd() * 3));
        put(rnd() > 0.5 ? 'pine' : 'round', 6.5 + rnd() * 2.5, side * (13 + rnd() * 1.2), z - 1.6, rnd() * 6, Math.floor(rnd() * 3));
        if (rnd() > 0.45) put('bush', 1.2 + rnd() * 0.5, side * (8.6 + rnd() * 0.5), z - 0.8, rnd() * 6, Math.floor(rnd() * 2));
      }
    }
    // The deep woods the monsters come out of, with a mossy ruin standing in front.
    for (let x = -13; x <= 13; x += 2.6) {
      put(rnd() > 0.4 ? 'pine' : 'tallRound', 7.5 + rnd() * 3, x + rnd() * 0.8, -20 - rnd() * 2, rnd() * 6, Math.floor(rnd() * 3));
      put('pine', 8 + rnd() * 3, x + 1.3, -23.5 - rnd() * 1.5, rnd() * 6, Math.floor(rnd() * 3));
    }
    put('bigTree', 9, -8.5, -18.5, 0.8);
    put('swamp', 8, 8.6, -18.2, 2.2);
    put('arch', 4.2, 0, -18.2, 0, 0, 'width');
    put('pillar', 2.6, -3.6, -17.6, 0.4);
    put('pillar', 2.2, 3.7, -17.4, 2.1);
    put('rockPile', 6, -6.8, -16.6, 0.3, 0, 'width');
    put('boulder', 1.6, 7.3, -16.3, 1.2);
    put('grave', 1.1, 5.6, -15.8, -0.3);
    put('skull', 0.35, 4.9, -15.4, 0.6);
    // Torches on poles flanking the boss, lighting the enemy end like the defenders' end.
    for (const x of [-4.6, 4.6]) {
      put('torchStick', 2.4, x, -16.4);
      this.addFlame(new THREE.Vector3(x, 2.5, -16.4), 1.0);
      this.addTorchLight(new THREE.Vector3(x, 3, -15.9), 0xff9a3c, 18);
    }
    this.addTorchLight(new THREE.Vector3(0, 2.9, -16.2), 0x7cff9a, 8);
    // The defenders' line: fences, logs, stumps and a torch on a pole.
    put('fence', 2.9, -6.6, 1.7, 0.1, 0, 'width');
    put('fence', 2.9, 6.6, 1.7, -0.1, 0, 'width');
    put('torchStick', 2.4, -7.3, 4.4);
    this.addFlame(new THREE.Vector3(-7.3, 2.5, 4.4), 1.0);
    this.addTorchLight(new THREE.Vector3(-7.3, 2.9, 4.0), 0xff8a2c, 16);
    put('log', 3, -5.6, 5.4, 1.4, 0, 'width');
    put('stump', 0.8, 7.4, 4.6, 0.3);
    put('stump', 0.6, 6.4, 5.6, 1.1);
    put('log', 2.6, 7.6, -2.5, 0.2, 0, 'width');
    // Odds and ends along the edges of the clearing.
    for (const [x, z] of [[-8.1, -3.2], [8.0, -7.4], [-8.2, -11.5], [7.9, 0.4], [-7.9, 1.3]] as const) put('mushrooms', 0.55, x, z, rnd() * 6);
    for (const [x, z] of [[-8.3, -6.8], [8.4, -12.6], [8.2, -3.5], [-8.6, -14.2]] as const) put('rock', 0.7 + rnd() * 0.4, x, z, rnd() * 6, Math.floor(rnd() * 2));
    put('stump', 0.7, -8.4, -9.4, 2);
    // Deep woods behind the defenders (each stage dresses the ground in between, see buildScenery).
    for (let x = -14; x <= 8; x += 2.8) {
      put(rnd() > 0.5 ? 'pine' : 'round', 7 + rnd() * 3, x + rnd(), 17.5 + rnd() * 1.5, rnd() * 6, Math.floor(rnd() * 3));
    }
    this.forestDecor(jobs);
    await Promise.all(jobs);
  }

  /**
   * Puts a decoration on the board being built. `keep`: low pieces on the camera side that stay
   * visible in the side / iso views. `flame`: a glow sprite this high above the piece (braziers).
   */
  private decor(jobs: Promise<unknown>[], kind: DecorKind, size: number, x: number, z: number,
    o: { rotY?: number; fit?: 'height' | 'width'; y?: number; keep?: boolean; flame?: number } = {}) {
    const g = this.building;
    jobs.push(decorPiece(kind, size, o.fit).then((p) => {
      if (!p) return;
      p.position.set(x, o.y ?? 0, z);
      p.rotation.y = o.rotY ?? 0;
      p.userData.keep = !!o.keep;
      g.add(p);
      if (o.flame !== undefined) {
        const prev = this.building;
        this.building = g;
        this.addFlame(new THREE.Vector3(x, (o.y ?? 0) + o.flame, z), 1.1);
        this.building = prev;
      }
    }));
  }

  /** Dungeon dressing: bones, candles and a statue along the far wall, a crypt at the gate. */
  private dungeonDecor(jobs: Promise<unknown>[]) {
    const E = Math.PI / 2; // facing +x, away from the far wall
    // Far wall.
    this.decor(jobs, 'wallBanner', 3.2, -9.3, 1.0, { rotY: E, y: 0.6 });
    this.decor(jobs, 'candleStand', 1.6, -8.2, -0.2, { rotY: E });
    this.decor(jobs, 'bonePile', 1.0, -8.0, -4.2, { rotY: 0.4, fit: 'width' });
    this.decor(jobs, 'beastSkull', 1.1, -7.7, -7.4, { rotY: E + 0.3 });
    this.decor(jobs, 'skeletonSitting', 1.3, -8.9, -8.6, { rotY: E });
    this.decor(jobs, 'candles', 0.5, -7.6, -9.4);
    this.decor(jobs, 'barrelBroken', 0.9, -7.4, -11.0, { rotY: 1.1 });
    this.decor(jobs, 'statue', 3.6, -8.5, -12.0, { rotY: E });
    this.decor(jobs, 'bonesSmall', 1.4, -7.3, -13.6, { fit: 'width', rotY: 2.2 });
    this.decor(jobs, 'vases', 1.2, -8.3, -15.2, { rotY: E });
    this.decor(jobs, 'chain', 1.6, -9.3, -4.0, { rotY: E, y: 1.6 });
    this.decor(jobs, 'brazier', 1.0, -7.2, 2.9, { flame: 1.15 });
    // The crypt in front of the gate.
    this.decor(jobs, 'brazier', 1.0, -2.9, -15.7, { flame: 1.15 });
    this.decor(jobs, 'brazier', 1.0, 2.9, -15.7, { flame: 1.15 });
    this.decor(jobs, 'cage', 2.4, -6.0, -15.4, { rotY: 0.5 });
    this.decor(jobs, 'ribs', 2.6, 5.6, -16.2, { fit: 'width', rotY: -0.4 });
    this.decor(jobs, 'pillarStump', 1.2, -4.4, -14.6, { rotY: 0.7 });
    // Low pieces on the camera side, seen past the board in the side / iso views.
    this.decor(jobs, 'brickRubble', 1.0, 7.8, 3.6, { fit: 'width', keep: true });
    this.decor(jobs, 'skeletonLying', 2.0, 8.2, -0.2, { fit: 'width', rotY: 0.3, keep: true });
    this.decor(jobs, 'bonesSmall2', 1.3, 7.7, -4.0, { fit: 'width', keep: true });
    this.decor(jobs, 'candles', 0.45, 8.6, -6.0, { keep: true });
    this.decor(jobs, 'vaseBroken', 0.5, 7.6, -8.2, { keep: true });
    this.decor(jobs, 'pillarRubble', 1.4, 8.3, -11.0, { fit: 'width', rotY: 1.2, keep: true });
    this.decor(jobs, 'coffin', 2.2, 8.0, -14.4, { fit: 'width', rotY: 0.1, keep: true });
  }

  /** Forest dressing: ferns, flowers and the forest dead along the edges of the clearing. */
  private forestDecor(jobs: Promise<unknown>[]) {
    const E = Math.PI / 2;
    // Far edge of the clearing.
    this.decor(jobs, 'fern', 1.1, -8.0, -1.0, { rotY: 0.6 });
    this.decor(jobs, 'flowers', 0.9, -7.4, 2.6);
    this.decor(jobs, 'grassTuft', 0.7, -7.5, -3.8);
    this.decor(jobs, 'fern', 1.0, -8.2, -5.2, { rotY: 2.0 });
    this.decor(jobs, 'skeletonGround', 1.8, -7.5, -7.0, { fit: 'width', rotY: E + 0.4 });
    this.decor(jobs, 'arrow', 0.9, -7.0, -6.2, { rotY: 0.3 });
    this.decor(jobs, 'flowers', 0.9, -7.4, -9.2);
    this.decor(jobs, 'log', 2.2, -8.0, -11.6, { fit: 'width', rotY: 0.2 });
    this.decor(jobs, 'fern', 1.1, -7.6, -13.2, { rotY: 1.2 });
    this.decor(jobs, 'flowers', 0.8, -7.2, -14.6);
    this.decor(jobs, 'ruinPillar', 1.8, -8.6, -15.8, { rotY: 0.5 });
    // The enemy's end.
    this.decor(jobs, 'rockPile', 2.0, -5.6, -15.4, { fit: 'width', rotY: 0.8 });
    this.decor(jobs, 'mushroomsRed', 0.7, 2.6, -15.4);
    this.decor(jobs, 'skeletonGround', 1.6, 5.8, -15.2, { fit: 'width', rotY: -0.6 });
    // Low plants on the camera side.
    this.decor(jobs, 'grass', 0.8, 7.6, 3.0, { keep: true });
    this.decor(jobs, 'flowers', 0.8, 8.3, 0.4, { keep: true });
    this.decor(jobs, 'rockSmall', 0.7, 7.8, -2.4, { keep: true });
    this.decor(jobs, 'plant', 0.7, 8.6, -4.6, { keep: true });
    this.decor(jobs, 'mushroomsRed', 0.55, 7.5, -6.6, { keep: true });
    this.decor(jobs, 'grass', 0.7, 8.4, -8.8, { keep: true });
    this.decor(jobs, 'grassTuft', 0.6, 7.7, -11.0, { keep: true });
    this.decor(jobs, 'rockSmall', 0.6, 8.5, -13.2, { rotY: 1.4, keep: true });
    this.decor(jobs, 'flowers', 0.7, 7.6, -14.8, { keep: true });
  }

  /** Shows the scenery behind the defenders for a stage, building it the first time. */
  async setStageScenery(stage: number) {
    if (this.sceneryStage === stage) return;
    let group = this.sceneries.get(stage);
    if (!group) {
      group = new THREE.Group();
      this.sceneries.set(stage, group);
      this.scene.add(group);
      const prev = this.building;
      this.building = group;
      const jobs: Promise<unknown>[] = [];
      this.buildScenery(stage, jobs);
      this.building = prev;
      await Promise.all(jobs);
    }
    for (const [s, g] of this.sceneries) g.visible = s === stage;
    this.sceneryStage = stage;
  }

  private nature(jobs: Promise<unknown>[], kind: NatureKind, size: number, x: number, z: number, rotY = 0, variant = 0, fit: 'height' | 'width' = 'height') {
    const g = this.building;
    jobs.push(naturePiece(kind, size, variant, fit).then((o) => {
      o.position.set(x, 0, z);
      o.rotation.y = rotY;
      g.add(o);
    }));
  }

  /** A shallow glowing pool on the floor (the slime swamp). */
  private puddle(x: number, z: number, r: number, color: number) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    m.position.set(x, 0.03, z);
    m.scale.set(1, 1, 0.7);
    this.building.add(m);
  }

  /**
   * The ground behind the defenders (z 6–14), dressed for each stage's concept. Pieces stay within
   * x ≤ 6 so the side camera keeps them, and stay low near the board so the isometric one sees past them.
   */
  private buildScenery(stage: number, jobs: Promise<unknown>[]) {
    // Layouts are written for z 6–14; pull them in right behind the hero (z ≈ 4.6–9.4) so the side
    // camera shows them, keep the hero's own spot clear, and cap heights near the board so the
    // isometric camera (from the +x/+z corner) still sees the front row.
    const at = (x: number, z: number) => {
      const zz = 4.6 + (z - 6) * 0.6;
      return [Math.abs(x) < 1.8 && zz < 6.4 ? Math.sign(x || 1) * 1.8 : x, zz] as const;
    };
    const cap = (size: number, x: number, z: number, fit: 'height' | 'width' = 'height') => (fit === 'height' && x > -3 ? Math.min(size, Math.max(1, z - 1.8)) : size);
    const d = (kind: DecorKind, size: number, x: number, z: number, o: Parameters<Board['decor']>[5] = {}) => {
      const [xx, zz] = at(x, z);
      this.decor(jobs, kind, cap(size, xx, zz, o.fit), xx, zz, o);
    };
    const n = (kind: NatureKind, size: number, x: number, z: number, rotY = 0, variant = 0, fit: 'height' | 'width' = 'height') => {
      const [xx, zz] = at(x, z);
      this.nature(jobs, kind, cap(size, xx, zz, fit), xx, zz, rotY, variant, fit);
    };
    const flame = (x: number, y: number, z: number) => {
      const [xx, zz] = at(x, z);
      this.addFlame(new THREE.Vector3(xx, y, zz), 1.0);
    };
    const pool = (x: number, z: number, r: number, color: number) => {
      const [xx, zz] = at(x, z);
      this.puddle(xx, zz, r, color);
    };
    const E = Math.PI / 2;
    switch (stage) {
      case 0: // 1-1 숲 어귀 — the wolves' woods: dense pines, boulders, gnawed bones.
        n('pine', 7, -5.2, 10.5, 0.3, 0); n('pine', 6, -1.4, 12.6, 1.2, 1); n('pine', 7.5, 3.4, 11.2, 2.1, 2); n('pineSmall', 3.5, 5.4, 8.6, 0.5);
        n('pine', 6.5, -8.4, 13.4, 0.8, 1); n('pineSmall', 3, -3.2, 8.4, 1.4);
        n('boulder', 1.6, -2.4, 7.4, 0.4); n('boulder', 1.2, 2.6, 7.2, 2.2); n('rockPile', 3.2, -6.6, 7.6, 0.6, 0, 'width');
        n('log', 3, 1.4, 9.4, 1.2, 0, 'width'); n('stump', 0.8, -0.8, 8.8, 0.3);
        d('bonesSmall', 1.4, 0.4, 7.4, { fit: 'width', rotY: 0.8 }); d('beastSkull', 0.8, -1.2, 7.0, { rotY: 2.4 });
        d('fern', 1.1, -4.2, 7.0, { rotY: 0.4 }); d('fern', 1.0, 4.4, 7.8, { rotY: 2.6 }); d('grass', 0.8, 2.2, 8.2);
        break;
      case 1: // 1-2 이끼 늪 — the slime bog: glowing pools, giant mushrooms, swamp trees.
        pool(-2.6, 8.2, 1.4, 0x5fd16a); pool(2.8, 9.6, 1.2, 0x7ae07a); pool(-5.6, 11.2, 1.1, 0x4fc060);
        n('swamp', 6.5, -6.4, 9.0, 0.6); n('swamp', 7, 3.8, 12.6, 2.2);
        d('mushroomGiant', 3.2, -1.2, 11.6, { rotY: 0.4 }); d('mushroomGiant', 2.4, 5.0, 8.8, { rotY: 2.0 }); d('mushroomSmall', 1.4, -3.6, 9.8);
        d('mushroomSmall', 1.1, 1.0, 8.0, { rotY: 1.2 }); d('mushroomsRed', 0.8, -4.4, 7.2); d('mushroomsRed', 0.7, 3.4, 7.0); d('mushroomsRed', 0.7, -0.4, 13.4);
        n('rock', 1, 1.2, 10.6, 0.5, 1); n('rock', 0.8, -7.8, 7.4, 1.8); d('fern', 1.2, -7.2, 12.6); d('plant', 1, 0.2, 7.4, { rotY: 0.6 });
        break;
      case 2: // 1-3 버려진 사냥터 — the dead hunters' ground: graves, skeletons, broken pillars, a dead tree.
        for (const [x, z, r] of [[-4.2, 8.0, 0.2], [-1.8, 8.4, -0.1], [0.8, 8.1, 0.15], [3.2, 8.6, -0.2], [-3.0, 10.8, 0.1], [1.8, 11.0, -0.15]] as const) n('grave', 1.2, x, z, r);
        n('bigTree', 7.5, -6.6, 11.6, 1.0); n('stump', 0.9, 4.8, 10.4, 0.6); n('pillar', 2.6, 5.2, 13.2, 0.4); n('pillar', 2.0, -2.0, 13.6, 2.1);
        d('skeletonGround', 1.8, -0.4, 9.8, { fit: 'width', rotY: 0.6 }); d('skeletonGround', 1.6, 4.4, 8.0, { fit: 'width', rotY: 2.4 });
        d('arrow', 0.9, 0.0, 9.4, { rotY: 0.3 }); d('arrow', 0.9, 4.0, 7.6, { rotY: 1.9 }); d('roadSign', 2.2, -6.2, 7.0, { rotY: 0.5 });
        d('ruinPillar', 1.6, 2.6, 12.8, { rotY: 0.8 }); n('torchStick', 2.4, -0.4, 12.4); flame(-0.4, 2.5, 12.4);
        break;
      case 3: // 2-1 무너진 성문 — the fallen gate: rubble, broken pillars, scattered bones.
        d('pillarRubble', 2.4, -3.6, 8.0, { fit: 'width', rotY: 0.6 }); d('pillarRubble', 2.0, 3.2, 10.6, { fit: 'width', rotY: 2.2 });
        d('pillarStump', 1.6, -5.8, 10.4, { rotY: 0.3 }); d('pillarStump', 2.2, 4.8, 7.6, { rotY: 1.4 }); d('pillarStump', 1.2, -1.0, 12.4);
        d('brickRubble', 1.4, 1.6, 8.2, { fit: 'width' }); d('brickRubble', 1.2, -2.0, 10.8, { fit: 'width', rotY: 1 }); d('brickRubble', 1.0, 0.4, 13.0, { fit: 'width' });
        d('barrelBroken', 0.9, -7.2, 7.4, { rotY: 0.8 }); d('bonesSmall2', 1.3, 2.4, 12.6, { fit: 'width' }); d('vaseBroken', 0.5, 5.2, 12.8);
        break;
      case 4: // 2-2 횃불의 회랑 — the torch-lit corridor: braziers in pairs, weapon racks, guardian statues.
        for (const z of [7.2, 10.4, 13.2]) { d('brazier', 1.0, -3.4, z, { flame: 1.15 }); d('brazier', 1.0, 3.4, z, { flame: 1.15 }); }
        d('statue2', 3.0, -6.6, 9.0, { rotY: E }); d('statue2', 3.0, 5.6, 11.8, { rotY: -E });
        d('weaponRack', 1.6, -6.6, 12.6, { rotY: E }); d('weaponRack', 1.6, 5.6, 8.0, { rotY: -E });
        d('wallBanner', 3.2, -2.0, 14.2, { rotY: Math.PI, y: 0.6 }); d('wallBanner', 3.2, 2.0, 14.2, { rotY: Math.PI, y: 0.6 });
        break;
      case 5: // 2-3 주술사의 서고 — the sorcerer's library: bookcases, a reading table, a bubbling cauldron.
        for (const [x, z, r] of [[-6.6, 8.0, E], [-6.6, 10.0, E], [-6.6, 12.0, E], [5.4, 8.4, -E], [5.4, 10.4, -E], [-2.0, 13.8, Math.PI], [1.4, 13.8, Math.PI]] as const) {
          d(x < 0 && z < 11 ? 'bookcase' : 'bookcase2', 2.4, x, z, { rotY: r });
        }
        d('roundTable', 1.0, -2.4, 9.0); d('candlesTable', 0.4, -2.4, 9.0, { y: 0.95 }); d('candleStand', 1.6, -4.4, 8.0);
        d('cauldron', 1.1, 2.0, 9.6, { flame: 0.25 }); d('candles', 0.5, 3.4, 8.4); d('chain', 1.6, 0.4, 14.3, { y: 1.6 });
        break;
      case 6: // 3-1 뼈의 납골당 — the ossuary in the caves: coffins, bone heaps, bone spikes, stalagmites.
        d('coffin', 2.4, -4.0, 8.2, { fit: 'width', rotY: 0.2 }); d('coffin', 2.4, -0.6, 9.2, { fit: 'width', rotY: -0.1 }); d('coffin', 2.4, 3.0, 8.4, { fit: 'width', rotY: 0.15 });
        d('bonePileBig', 3.2, -5.8, 11.8, { fit: 'width', rotY: 0.6 }); d('bonePile', 2.2, 2.6, 12.0, { fit: 'width', rotY: 2 });
        d('boneSpike', 2.4, -1.6, 12.4, { rotY: 0.4 }); d('boneSpike', 2.0, 5.2, 10.2, { rotY: 2.6 }); d('beastSkull', 1, 0.8, 11.2, { rotY: 3 });
        d('stalagmiteTall', 3.4, -7.6, 8.4); d('stalagmite', 2.0, 5.6, 13.4); d('rockSpike', 2.6, -3.4, 13.6); d('candles', 0.5, 1.2, 7.4);
        break;
      case 7: // 3-2 군주의 왕좌 — the lord's throne hall deep underground: a long carpet, statues, obelisks, crystals.
        d('rug', 8.0, 0, 9.0, { fit: 'width', rotY: E });
        d('statue', 3.6, -4.6, 8.6, { rotY: E }); d('statue', 3.6, 4.0, 8.6, { rotY: -E });
        d('obelisk', 3.4, -4.6, 12.6, { rotY: 0.2 }); d('obelisk', 3.4, 4.0, 12.6, { rotY: -0.2 });
        d('brazier', 1.0, -2.0, 13.4, { flame: 1.15 }); d('brazier', 1.0, 2.0, 13.4, { flame: 1.15 });
        d('gemSpike', 2.6, -7.6, 10.8, { rotY: 0.5 }); d('gem', 1.6, 5.6, 7.2, { rotY: 1.2 }); d('stalagmiteTall', 3.0, -7.8, 7.0); d('rockPillar', 3.4, 5.8, 13.6);
        break;
    }
  }

  /** A burning flame sprite (campfires, torch poles). */
  private addFlame(at: THREE.Vector3, size: number) {
    const flame = new THREE.Sprite(this.flameMaterial());
    flame.position.copy(at);
    flame.scale.setScalar(size);
    this.building.add(flame);
    this.flames.push({ sprite: flame, phase: Math.random() * 10, size });
  }

  /** A wall torch with a visible flame; `lit` also gives it a real (flickering) light. */
  private async addTorch(x: number, z: number, rotY: number, y: number, lit: boolean, intensity = 14) {
    const o = await instantiateStatic('torch_mounted');
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    this.building.add(o);
    // The torch head sits up and out from the wall bracket.
    const head = new THREE.Vector3(0, 0.62, 0.42).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(o.position);
    const flame = new THREE.Sprite(this.flameMaterial());
    flame.position.copy(head);
    flame.scale.setScalar(0.9);
    this.building.add(flame);
    const phase = Math.random() * 10;
    this.flames.push({ sprite: flame, phase, size: 1 });
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
    this.building.add(light);
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
    // Lines marking each side's home row: ours green, the enemy's yellow.
    for (const [z, color] of [[-ROW_D / 2, 0x4dff7a], [-(LAST_ROW - 0.5) * ROW_D, 0xffd23a]] as const) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(LANE_W * LANES, 0.13).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false }),
      );
      line.position.set(0, 0.08, z);
      this.scene.add(line);
    }
    // Lane dividers running down the hall.
    const depth = ROW_D * ROWS;
    const dividerMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
    for (let i = 0; i <= LANES; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.06, depth).rotateX(-Math.PI / 2), dividerMat);
      d.position.set(laneX(i) - LANE_W / 2, 0.075, -depth / 2 + ROW_D / 2);
      this.scene.add(d);
    }
  }

  /** Base look of the grid: both home rows are tinted, everything else invisible. */
  private readonly wet = new Map<string, THREE.Mesh>();
  private wetMat: THREE.MeshStandardMaterial | null = null;

  /** 젖은 칸: a glossy puddle on the cell. */
  setWet(lane: number, row: number, on: boolean) {
    const key = `${lane},${row}`;
    const had = this.wet.get(key);
    if (!on) {
      had?.removeFromParent();
      this.wet.delete(key);
      return;
    }
    if (had) return;
    this.wetMat ??= new THREE.MeshStandardMaterial({
      color: 0x3a7fb0, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.0, 20).rotateX(-Math.PI / 2), this.wetMat);
    m.scale.set(LANE_W * 0.45, 1, ROW_D * 0.42);
    m.position.copy(cellPos(lane, row)).setY(0.06);
    m.renderOrder = 0;
    this.scene.add(m);
    this.wet.set(key, m);
  }

  /** Match the puddles to the game state. */
  syncWet(cells: { lane: number; row: number }[]) {
    const want = new Set(cells.map((c) => `${c.lane},${c.row}`));
    for (const key of [...this.wet.keys()]) if (!want.has(key)) {
      const [l, r] = key.split(',').map(Number);
      this.setWet(l, r, false);
    }
    for (const c of cells) this.setWet(c.lane, c.row, true);
  }

  private readonly zones = new Map<string, THREE.Group>();
  private smokeTex: THREE.CanvasTexture | null = null;

  /** 방어 진지 (a ring of stakes on a lit square) or 연막 (drifting smoke) over a 2×2 area. */
  setZone(kind: ZoneKind, lane: number, row: number, on: boolean) {
    const key = `${kind},${lane},${row}`;
    const had = this.zones.get(key);
    if (!on) {
      had?.removeFromParent();
      this.zones.delete(key);
      return;
    }
    if (had) return;
    const g = new THREE.Group();
    const center = cellPos(lane + 0.5, row + 0.5);
    g.position.copy(center);
    const w = LANE_W * 2 * 0.96;
    const d = ROW_D * 2 * 0.94;
    if (kind === 'fort') {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.16, depthWrite: false }));
      floor.position.y = 0.05;
      g.add(floor);
      const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9, flatShading: true });
      // Sharpened stakes along the edge.
      const n = 9;
      for (let i = 0; i <= n; i++) {
        for (const [x, z] of [[-w / 2 + (w * i) / n, -d / 2], [-w / 2 + (w * i) / n, d / 2], [-w / 2, -d / 2 + (d * i) / n], [w / 2, -d / 2 + (d * i) / n]]) {
          const stake = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 5), wood);
          stake.position.set(x, 0.35, z);
          stake.castShadow = true;
          g.add(stake);
        }
      }
    } else {
      this.smokeTex ??= smokeTexture();
      for (let i = 0; i < 14; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0xb8bcc4, transparent: true, opacity: 0.55, depthWrite: false }));
        sp.position.set((Math.random() - 0.5) * w * 0.8, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * d * 0.8);
        sp.scale.setScalar(2.2 + Math.random() * 1.4);
        sp.userData.drift = Math.random() * 6;
        sp.renderOrder = 4;
        g.add(sp);
      }
      g.userData.smoke = true;
    }
    this.scene.add(g);
    this.zones.set(key, g);
  }

  syncZones(zones: { kind: ZoneKind; lane: number; row: number }[]) {
    const want = new Set(zones.map((z) => `${z.kind},${z.lane},${z.row}`));
    for (const key of [...this.zones.keys()]) if (!want.has(key)) {
      const [k, l, r] = key.split(',');
      this.setZone(k as ZoneKind, Number(l), Number(r), false);
    }
    for (const z of zones) this.setZone(z.kind, z.lane, z.row, true);
  }

  private readonly traps = new Map<string, THREE.Object3D>();

  /** 덫: a bear trap on the cell. */
  setTrap(lane: number, row: number, on: boolean) {
    const key = `${lane},${row}`;
    const had = this.traps.get(key);
    if (!on) {
      had?.removeFromParent();
      this.traps.delete(key);
      return;
    }
    if (had) return;
    const t = makeBearTrap();
    t.position.copy(cellPos(lane, row)).setY(0.04);
    t.rotation.y = Math.random() * Math.PI;
    this.scene.add(t);
    this.traps.set(key, t);
  }

  syncTraps(cells: { lane: number; row: number }[]) {
    const want = new Set(cells.map((c) => `${c.lane},${c.row}`));
    for (const key of [...this.traps.keys()]) if (!want.has(key)) {
      const [l, r] = key.split(',').map(Number);
      this.setTrap(l, r, false);
    }
    for (const c of cells) this.setTrap(c.lane, c.row, true);
  }

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
      enemyHome: [0xffd23a, 0.07],
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
      f.sprite.scale.set(1.1 * k * f.size, 1.35 * k * f.size, 1);
    }
    for (const z of this.zones.values()) {
      if (!z.userData.smoke) continue;
      for (const sp of z.children) {
        sp.userData.drift += dt;
        sp.position.y = 0.8 + Math.sin(sp.userData.drift * 0.7) * 0.5 + 0.6;
        (sp as THREE.Sprite).material.rotation += dt * 0.15;
      }
    }
    if (this.camMove) {
      const mv = this.camMove;
      mv.t = Math.min(1, mv.t + dt / mv.dur);
      const k = mv.t < 0.5 ? 4 * mv.t ** 3 : 1 - (-2 * mv.t + 2) ** 3 / 2;
      const to = this.pose(this.camMode);
      // Swing round the board's centre rather than cutting straight through it.
      const centre = new THREE.Vector3(0, 0, -6);
      const a = mv.from.pos.clone().sub(centre);
      const b = to.pos.clone().sub(centre);
      const pos = new THREE.Vector3().lerpVectors(a, b, k).setLength(THREE.MathUtils.lerp(a.length(), b.length(), k)).add(centre);
      this.applyPose({
        pos,
        target: new THREE.Vector3().lerpVectors(mv.from.target, to.target, k),
        fov: THREE.MathUtils.lerp(mv.from.fov, to.fov, k),
      });
      if (mv.t >= 1) {
        this.camMove = null;
        if (this.camMode === 'classic') this.showNearSide(true);
      }
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

/** Fades the dirt clearing into the grass at its edges. */
function softEdge(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.7, '#ddd');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** An open bear trap: a toothed iron ring with a plate in the middle. */
function makeBearTrap(): THREE.Group {
  const iron = new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.75, roughness: 0.35, flatShading: true });
  const rust = new THREE.MeshStandardMaterial({ color: 0x6a3d22, metalness: 0.4, roughness: 0.7, flatShading: true });
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 5, 20), iron);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 4), iron);
    tooth.position.set(Math.sin(a) * 0.6, 0.16, Math.cos(a) * 0.6);
    tooth.rotation.set(Math.cos(a) * -0.5, 0, Math.sin(a) * 0.5);
    g.add(tooth);
  }
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 10), rust);
  plate.position.y = 0.04;
  g.add(plate);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.1), rust);
  bar.position.y = 0.04;
  g.add(bar);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

/** A soft puff for 연막. */
function smokeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
