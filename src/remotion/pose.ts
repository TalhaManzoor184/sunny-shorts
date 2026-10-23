import type { Action } from "../shared/episode";

export type BodyPose = {
  y: number; // vertical offset (negative = up)
  tilt: number; // degrees
  scaleX: number; // for the fake 2D spin
  armL: number;
  armR: number;
  legL: number;
  legR: number;
};

const IDLE = (t: number): BodyPose => ({
  y: Math.sin(t * Math.PI) * 3,
  tilt: Math.sin(t * Math.PI * 0.5) * 1.5,
  scaleX: 1,
  armL: -8 + Math.sin(t * Math.PI) * 4,
  armR: -8 - Math.sin(t * Math.PI) * 4,
  legL: 0,
  legR: 0,
});

/** Body pose for an action at `t` seconds into the beat. Beats run at ~120 BPM (one bounce per 0.5 s). */
export function poseFor(action: Action, t: number): BodyPose {
  switch (action) {
    case "dance": {
      const s = Math.sin(t * Math.PI * 2);
      return {
        y: -Math.abs(s) * 16,
        tilt: Math.sin(t * Math.PI) * 6,
        scaleX: 1,
        armL: -22 - s * 32,
        armR: -22 + s * 32,
        legL: Math.max(0, s),
        legR: Math.max(0, -s),
      };
    }
    case "wave": {
      const w = Math.sin(t * Math.PI * 4);
      return { ...IDLE(t), armR: -62 + w * 22, armL: -6 };
    }
    case "jump": {
      const p = (t % 0.9) / 0.9; // one hop every 0.9 s
      const h = Math.sin(p * Math.PI);
      return {
        y: -h * 70,
        tilt: 0,
        scaleX: 1,
        armL: -40 - h * 50,
        armR: -40 - h * 50,
        legL: h * 0.8,
        legR: h * 0.8,
      };
    }
    case "spin": {
      // one full turn in the first 0.8 s, then a happy dance
      if (t < 0.8) {
        const p = t / 0.8;
        return { ...IDLE(t), scaleX: Math.cos(p * Math.PI * 2), y: -Math.sin(p * Math.PI) * 30, armL: -50, armR: -50 };
      }
      return poseFor("dance", t - 0.8);
    }
    case "idle":
    default:
      return IDLE(t);
  }
}

/** Blend from idle into the action over the first 0.2 s so beat changes don't pop. */
export function blendedPose(action: Action, t: number): BodyPose {
  const target = poseFor(action, t);
  const b = Math.min(1, t / 0.2);
  if (b >= 1) return target;
  const base = IDLE(t);
  const mix = (a: number, c: number) => a + (c - a) * b;
  return {
    y: mix(base.y, target.y),
    tilt: mix(base.tilt, target.tilt),
    scaleX: target.scaleX,
    armL: mix(base.armL, target.armL),
    armR: mix(base.armR, target.armR),
    legL: mix(base.legL, target.legL),
    legR: mix(base.legR, target.legR),
  };
}
