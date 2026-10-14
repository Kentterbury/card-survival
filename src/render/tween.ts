type Tween = { t: number; duration: number; step: (k: number) => void; resolve: () => void };

const tweens: Tween[] = [];
let timeScale = 1;

export function setTimeScale(scale: number) {
  timeScale = scale;
}

/** Runs `step(k)` with k going 0→1 over `duration` seconds. */
export function tween(duration: number, step: (k: number) => void): Promise<void> {
  return new Promise((resolve) => {
    if (duration <= 0) {
      step(1);
      resolve();
      return;
    }
    step(0);
    tweens.push({ t: 0, duration, step, resolve });
  });
}

export function wait(seconds: number): Promise<void> {
  return tween(seconds, () => {});
}

export function updateTweens(dt: number) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt * timeScale;
    const k = Math.min(1, tw.t / tw.duration);
    tw.step(k);
    if (k >= 1) {
      tweens.splice(i, 1);
      tw.resolve();
    }
  }
}

export const ease = {
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  inOutSine: (k: number) => -(Math.cos(Math.PI * k) - 1) / 2,
  outBack: (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
  inQuad: (k: number) => k * k,
};
