import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { CARDS } from '../game/cards';
import { HEROES } from '../game/heroes';
import { STAGES } from '../game/stages';
import { isCreature, isStructure, type CharModel } from '../game/types';
import { applyGrip, instantiateCharacter, lookFor, preloadAll, useSynty } from '../render/assets';
import { DEFAULT_LOOKS, GRIP_PREVIEW_KEY, gripFor, type GripSpec } from '../render/syntySet';

/**
 * 무기 위치 편집기 (grip.html): pick a character, move / turn / resize what it holds, watch any
 * animation, and keep the result. Edits are saved in this browser (the game reads them as a
 * preview) and shown as JSON for gripOverrides.json.
 */

type Hand = 'r' | 'l';
type Table = { weapons: Record<string, GripSpec>; looks: Record<string, GripSpec> };
interface Entry { key: string; name: string; group: string; model: CharModel; r?: string; l?: string }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ── Characters with something in hand ────────────────────────

function entries(): Entry[] {
  const out: Entry[] = [];
  const add = (key: string, name: string, group: string, model: CharModel) => {
    const look = lookFor(key, model);
    if (look.r || look.l) out.push({ key, name, group, model, r: look.r, l: look.l });
  };
  for (const h of HEROES) add(`hero:${h.id}`, `${h.name} (영웅)`, '영웅', h.model as CharModel);
  for (const st of STAGES) if (!isCreature(st.hero.model)) add(`boss:${st.hero.name}`, `${st.hero.name} (지휘관)`, '지휘관', st.hero.model as CharModel);
  for (const c of Object.values(CARDS)) {
    if (c.type !== 'minion' || isStructure(c.model) || isCreature(c.model)) continue;
    add(c.id, c.name, c.enemy ? '적' : '아군', c.model as CharModel);
  }
  for (const m of Object.keys(DEFAULT_LOOKS) as CharModel[]) if (!out.some((e) => e.key === m)) add(m, `기본 ${m}`, '기본', m);
  return out;
}

// ── Saved edits (this browser) ───────────────────────────────

function loadTable(): Table {
  try {
    const t = JSON.parse(localStorage.getItem(GRIP_PREVIEW_KEY) ?? '') as Table;
    return { weapons: t.weapons ?? {}, looks: t.looks ?? {} };
  } catch {
    return { weapons: {}, looks: {} };
  }
}

const table = loadTable();

function saveTable() {
  try { localStorage.setItem(GRIP_PREVIEW_KEY, JSON.stringify(table)); } catch { /* storage blocked */ }
  $<HTMLTextAreaElement>('out').value = JSON.stringify(table, null, 2);
}

// ── Scene ────────────────────────────────────────────────────

const canvas = $<HTMLCanvasElement>('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2219);
scene.add(new THREE.HemisphereLight(0xfff6ea, 0x5a4a3a, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(3, 6, 4);
scene.add(sun);
const grid = new THREE.GridHelper(6, 12, 0x6a5a40, 0x3a3024);
scene.add(grid);
const camera = new THREE.PerspectiveCamera(35, 1, 0.02, 100);
camera.position.set(2.2, 2.2, 3.4);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 1.2, 0);
orbit.enableDamping = true;
const gizmo = new TransformControls(camera, canvas);
gizmo.setSize(0.8);
scene.add(gizmo.getHelper());
gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });

function resize() {
  const r = canvas.parentElement!.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ── Current character ────────────────────────────────────────

let current: Entry | null = null;
let root: THREE.Object3D | null = null;
let mixer: THREE.AnimationMixer | null = null;
let clips: THREE.AnimationClip[] = [];
let action: THREE.AnimationAction | null = null;
let weapons: Partial<Record<Hand, THREE.Object3D>> = {};
let hand: Hand = 'r';
let scope: 'weapon' | 'look' = 'weapon';
let paused = false;
let speed = 1;

const weaponOf = (): THREE.Object3D | undefined => weapons[hand];
const fileOf = (): string | undefined => (hand === 'r' ? current?.r : current?.l);
const tableKey = () => (scope === 'weapon' ? `${fileOf()}|${hand}` : `${current!.key}|${hand}`);

async function select(e: Entry) {
  current = e;
  gizmo.detach();
  if (root) scene.remove(root);
  const inst = await instantiateCharacter(e.model, e.key);
  root = inst.root;
  mixer = inst.mixer;
  clips = inst.clips;
  scene.add(root);
  weapons = {};
  root.traverse((o) => { if (o.userData.heldWeapon) weapons[o.userData.hand as Hand] = o; });
  hand = weapons.r ? 'r' : 'l';
  // Start in whichever scope this character's grip already comes from.
  scope = table.looks[`${e.key}|${hand}`] ? 'look' : 'weapon';
  renderList();
  renderHands();
  pickClip($<HTMLSelectElement>('clip').value || 'Idle');
  attachGizmo();
  syncInputs();
}

function pickClip(name: string) {
  if (!mixer) return;
  mixer.stopAllAction();
  const clip = clips.find((c) => c.name === name) ?? clips[0];
  if (!clip) return;
  action = mixer.clipAction(clip);
  action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  action.paused = paused;
  $<HTMLInputElement>('time').max = String(clip.duration);
}

// ── Editing ──────────────────────────────────────────────────

const POS = { min: -40, max: 40, step: 0.5 };
const ROT = { min: -180, max: 180, step: 1 };
const fields: Record<string, { range: HTMLInputElement; num: HTMLInputElement }> = {};

function buildInputs() {
  const make = (box: string, id: string, label: string, lim: { min: number; max: number; step: number }) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label>${label}</label><input type="range" min="${lim.min}" max="${lim.max}" step="${lim.step}"><input type="number" step="${lim.step}">`;
    const [range, num] = row.querySelectorAll('input');
    range.addEventListener('input', () => { num.value = range.value; fromInputs(); });
    num.addEventListener('change', () => { range.value = num.value; fromInputs(); });
    fields[id] = { range, num };
    $(box).appendChild(row);
  };
  for (const [i, a] of ['X', 'Y', 'Z'].entries()) make('pos', `p${i}`, a, POS);
  for (const [i, a] of ['X', 'Y', 'Z'].entries()) make('rot', `r${i}`, a, ROT);
  make('scale', 's', '×', { min: 0.2, max: 3, step: 0.05 });
}

function currentSpec(): GripSpec | null {
  const w = weaponOf();
  if (!w) return null;
  const d = THREE.MathUtils.radToDeg;
  return {
    pos: [w.position.x, w.position.y, w.position.z].map((v) => Math.round(v * 10) / 10) as GripSpec['pos'],
    rot: [w.rotation.x, w.rotation.y, w.rotation.z].map((v) => Math.round(d(v))) as GripSpec['rot'],
    scale: Math.round((w.scale.x / 100) * 100) / 100,
  };
}

function syncInputs() {
  const g = currentSpec();
  const set = (id: string, v: number) => { fields[id].range.value = fields[id].num.value = String(v); };
  if (g) {
    g.pos.forEach((v, i) => set(`p${i}`, v));
    g.rot.forEach((v, i) => set(`r${i}`, v));
    set('s', g.scale);
  }
  for (const f of Object.values(fields)) f.range.disabled = f.num.disabled = !g;
  renderHud();
}

function fromInputs() {
  const w = weaponOf();
  if (!w) return;
  const v = (id: string) => Number(fields[id].num.value) || 0;
  applyGrip(w, { pos: [v('p0'), v('p1'), v('p2')], rot: [v('r0'), v('r1'), v('r2')], scale: v('s') || 1 });
  store();
}

function store() {
  const g = currentSpec();
  if (!g || !current) return;
  (scope === 'weapon' ? table.weapons : table.looks)[tableKey()] = g;
  saveTable();
  renderList();
  renderHud();
}

function resetGrip() {
  const w = weaponOf();
  const file = fileOf();
  if (!w || !file || !current) return;
  delete table.weapons[`${file}|${hand}`];
  delete table.looks[`${current.key}|${hand}`];
  saveTable();
  // gripFor reads the (now cleared) preview on top of the saved overrides.
  applyGrip(w, gripFor(current.key, file, hand));
  syncInputs();
  renderList();
}

function attachGizmo() {
  const w = weaponOf();
  if (w && gizmoMode !== 'off') {
    gizmo.attach(w);
    gizmo.setMode(gizmoMode);
    gizmo.setSpace('local');
  } else gizmo.detach();
}
let gizmoMode: 'translate' | 'rotate' | 'off' = 'translate';
gizmo.addEventListener('objectChange', () => { syncInputs(); store(); });

// ── Panels ───────────────────────────────────────────────────

const all = entries();
let group = '전체';

function edited(e: Entry): boolean {
  return [['r', e.r], ['l', e.l]].some(([h, f]) => f && (table.weapons[`${f}|${h}`] || table.looks[`${e.key}|${h}`]));
}

function renderList() {
  const q = $<HTMLInputElement>('search').value.trim();
  const list = $('list');
  list.innerHTML = '';
  for (const e of all) {
    if (group !== '전체' && e.group !== group) continue;
    if (q && !e.name.includes(q) && !e.key.includes(q)) continue;
    const li = document.createElement('li');
    li.className = e === current ? 'on' : '';
    const w = [e.r, e.l].filter(Boolean).map((f) => f!.replace(/^SM_(Wep|Prop)_/, '')).join(', ');
    li.innerHTML = `<span>${edited(e) ? '<span class="edited">● </span>' : ''}${e.name}</span><span class="w">${w}</span>`;
    li.addEventListener('click', () => void select(e));
    list.appendChild(li);
  }
}

function renderFilters() {
  const box = $('filters');
  for (const g of ['전체', '영웅', '지휘관', '아군', '적']) {
    const b = document.createElement('button');
    b.textContent = g;
    b.className = g === group ? 'on' : '';
    b.addEventListener('click', () => {
      group = g;
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      renderList();
    });
    box.appendChild(b);
  }
}

function renderHands() {
  const box = $('hands');
  box.innerHTML = '';
  for (const h of ['r', 'l'] as Hand[]) {
    const file = h === 'r' ? current?.r : current?.l;
    const b = document.createElement('button');
    b.className = `btn${h === hand ? ' on' : ''}`;
    b.textContent = `${h === 'r' ? '오른손' : '왼손'}: ${file ? file.replace(/^SM_(Wep|Prop)_/, '') : '없음'}`;
    b.disabled = !file;
    b.addEventListener('click', () => { hand = h; renderHands(); attachGizmo(); syncInputs(); });
    box.appendChild(b);
  }
  $('scopeWeapon').classList.toggle('on', scope === 'weapon');
  $('scopeLook').classList.toggle('on', scope === 'look');
  const file = fileOf();
  $('scopeNote').innerHTML = !file ? '' : scope === 'weapon'
    ? `<b>${file}</b>을(를) 든 모든 캐릭터에 적용됩니다.`
    : `<b>${current!.name}</b>에게만 적용됩니다(무기 전체 설정보다 우선).`;
}

function renderHud() {
  if (!current) {
    $('hud').innerHTML = '왼쪽에서 캐릭터를 고르세요';
    return;
  }
  const g = currentSpec();
  $('hud').innerHTML = `<b>${current.name}</b> · ${current.key}<br>${hand === 'r' ? '오른손' : '왼손'} ${fileOf() ?? '-'}`
    + (g ? `<br>위치 ${g.pos.join(', ')} · 회전 ${g.rot.join(', ')} · ×${g.scale}` : '');
}

function camTo(pos: THREE.Vector3, target: THREE.Vector3) {
  camera.position.copy(pos);
  orbit.target.copy(target);
}

function bindUi() {
  $('search').addEventListener('input', renderList);
  $('scopeWeapon').addEventListener('click', () => { scope = 'weapon'; renderHands(); store(); });
  $('scopeLook').addEventListener('click', () => { scope = 'look'; renderHands(); store(); });
  const modes: [string, typeof gizmoMode][] = [['gizmoMove', 'translate'], ['gizmoRotate', 'rotate'], ['gizmoOff', 'off']];
  for (const [id, mode] of modes) {
    $(id).addEventListener('click', () => {
      gizmoMode = mode;
      for (const [other] of modes) $(other).classList.toggle('on', other === id);
      attachGizmo();
    });
  }
  $('reset').addEventListener('click', resetGrip);
  const clipSel = $<HTMLSelectElement>('clip');
  clipSel.addEventListener('change', () => pickClip(clipSel.value));
  $('play').addEventListener('click', () => {
    paused = !paused;
    if (action) action.paused = paused;
    $('play').textContent = paused ? '▶ 재생' : '⏸ 멈춤';
  });
  for (const [id, s] of [['slow', 0.25], ['normal', 1]] as const) {
    $(id).addEventListener('click', () => {
      speed = s;
      $('slow').classList.toggle('on', s === 0.25);
      $('normal').classList.toggle('on', s === 1);
    });
  }
  $('time').addEventListener('input', () => {
    if (!action || !mixer) return;
    paused = true;
    action.paused = true;
    $('play').textContent = '▶ 재생';
    action.time = Number($<HTMLInputElement>('time').value);
    mixer.update(0);
  });
  $('camBody').addEventListener('click', () => camTo(new THREE.Vector3(2.2, 2.2, 3.4), new THREE.Vector3(0, 1.2, 0)));
  $('camFront').addEventListener('click', () => camTo(new THREE.Vector3(0, 1.4, 3.6), new THREE.Vector3(0, 1.2, 0)));
  $('camTop').addEventListener('click', () => camTo(new THREE.Vector3(0, 6.5, 4.2), new THREE.Vector3(0, 1, 0)));
  $('camHand').addEventListener('click', () => {
    const w = weaponOf();
    if (!w) return;
    const p = w.getWorldPosition(new THREE.Vector3());
    // Look at the hand from outside the body: out along the line from the chest to the hand.
    const out = p.clone().sub(new THREE.Vector3(0, p.y, 0)).setY(0);
    if (out.lengthSq() < 1e-4) out.set(0, 0, 1);
    out.normalize().add(new THREE.Vector3(0, 0, 0.6)).normalize();
    camTo(p.clone().addScaledVector(out, 2.6).add(new THREE.Vector3(0, 0.5, 0)), p);
  });
  $('copy').addEventListener('click', () => {
    void navigator.clipboard?.writeText($<HTMLTextAreaElement>('out').value);
    $('copy').textContent = '복사됨!';
    setTimeout(() => { $('copy').textContent = '복사'; }, 1200);
  });
  $('download').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([$<HTMLTextAreaElement>('out').value], { type: 'application/json' }));
    a.download = 'gripOverrides.json';
    a.click();
  });
  $('clear').addEventListener('click', () => {
    if (!confirm('이 브라우저에서 고친 무기 위치를 모두 지울까요?')) return;
    table.weapons = {};
    table.looks = {};
    saveTable();
    if (current) void select(current);
    renderList();
  });
}

// ── Start ────────────────────────────────────────────────────

let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mixer && !paused) mixer.update(dt * speed);
  if (action) {
    $<HTMLInputElement>('time').value = String(action.time);
    $('timeText').textContent = action.time.toFixed(2);
  }
  orbit.update();
  renderer.render(scene, camera);
}

async function main() {
  resize();
  buildInputs();
  bindUi();
  renderFilters();
  saveTable();
  loop();
  await preloadAll((done, total) => { $('loading').textContent = `에셋 불러오는 중… ${done}/${total}`; });
  if (!useSynty) {
    $('loading').innerHTML = '<div class="warn">이 편집기는 Synty 에셋이 있어야 합니다.<br>배포된 사이트(kentterbury.github.io/card-survival/grip.html)에서 열어 주세요.</div>';
    return;
  }
  $('loading').remove();
  renderList();
  const first = all.find((e) => e.key === 'hero:captain') ?? all[0];
  await select(first);
  const sel = $<HTMLSelectElement>('clip');
  sel.innerHTML = clips.map((c) => `<option ${c.name === 'Idle' ? 'selected' : ''}>${c.name}</option>`).join('');
  pickClip('Idle');
}

void main();
// For automated checks.
(window as unknown as { grip: unknown }).grip = { select: (key: string) => select(all.find((e) => e.key === key)!), table };
