import React from "react";
import type { Expression, MouthShape } from "../../shared/episode";

/**
 * Sunny the Dancing Star — the locked character rig.
 * Never change shapes or colours per episode; only pose props change.
 * Coordinate origin is the centre of the star body. Body outer radius 150.
 */

export const COLORS = {
  outline: "#2A1E3B",
  yellow: "#FFD21F",
  yellowLight: "#FFF07A",
  yellowDeep: "#F6B10E",
  cap: "#1F55D6",
  capDark: "#1642B0",
  iris: "#2E7BEF",
  irisDark: "#0D3E9E",
  pupil: "#11163A",
  cheek: "#FF8FA3",
  mouth: "#7A1E2C",
  tongue: "#FF6F86",
  white: "#FFFFFF",
} as const;

const O = COLORS.outline;

export function starPath(R: number, r: number, cx = 0, cy = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

const BODY = starPath(150, 74);
const BADGE = starPath(17, 7.5, 0, -112);

type EyeMode = "open" | "wide" | "blink" | "arc";

const EXPRESSIONS: Record<
  Expression,
  { l: EyeMode; r: EyeMode; browL: number; browR: number; tilt?: number; mouth: MouthShape | "smile" | "frown" | "smirk" }
> = {
  happy: { l: "open", r: "open", browL: 0, browR: 0, mouth: "smile" },
  wink: { l: "arc", r: "open", browL: -2, browR: 6, mouth: "X" },
  surprised: { l: "wide", r: "wide", browL: 9, browR: 9, mouth: "E" },
  laughing: { l: "arc", r: "arc", browL: 2, browR: 2, mouth: "D" },
  deadpan: { l: "open", r: "open", browL: -3, browR: -3, mouth: "A" },
  annoyed: { l: "open", r: "open", browL: -2, browR: -2, tilt: 8, mouth: "frown" },
  smirk: { l: "open", r: "arc", browL: 4, browR: -2, mouth: "smirk" },
};

const Eye: React.FC<{ side: "l" | "r"; mode: EyeMode; lookX: number }> = ({ side, mode, lookX }) => {
  const cx = side === "l" ? -34 : 34;
  const cy = -14;
  if (mode === "blink")
    return <path d={`M ${cx - 18} ${cy} Q ${cx} ${cy + 7} ${cx + 18} ${cy}`} fill="none" stroke={O} strokeWidth={6} strokeLinecap="round" />;
  if (mode === "arc")
    return <path d={`M ${cx - 18} ${cy + 5} Q ${cx} ${cy - 18} ${cx + 18} ${cy + 5}`} fill="none" stroke={O} strokeWidth={6.5} strokeLinecap="round" />;
  const wide = mode === "wide";
  const rx = wide ? 23 : 21;
  const ry = wide ? 31 : 27;
  const ir = wide ? 12.5 : 16;
  const ix = cx + (side === "l" ? 3 : -3) + lookX;
  const iy = cy + (wide ? 2 : 4);
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={COLORS.white} stroke={O} strokeWidth={5} />
      <circle cx={ix} cy={iy} r={ir} fill={COLORS.irisDark} />
      <circle cx={ix} cy={iy} r={ir - 3} fill={COLORS.iris} />
      <circle cx={ix} cy={iy} r={ir * 0.5} fill={COLORS.pupil} />
      <circle cx={ix - ir * 0.35} cy={iy - ir * 0.42} r={ir * 0.34} fill={COLORS.white} />
      <circle cx={ix + ir * 0.38} cy={iy + ir * 0.36} r={ir * 0.15} fill={COLORS.white} />
    </g>
  );
};

/** `tilt` > 0 pulls the inner end of the brow down (annoyed). */
const Brow: React.FC<{ cx: number; lift: number; tilt?: number }> = ({ cx, lift, tilt = 0 }) => {
  const y = -56 - lift;
  const inner = cx < 0 ? 1 : -1; // inner end points towards the nose
  const yl = y + 3 + (inner === -1 ? tilt : -tilt * 0.3);
  const yr = y + 3 + (inner === 1 ? tilt : -tilt * 0.3);
  return <path d={`M ${cx - 13} ${yl} Q ${cx} ${y - 6} ${cx + 13} ${yr}`} fill="none" stroke={O} strokeWidth={5} strokeLinecap="round" />;
};

type MouthDef = {
  line?: string;
  d?: string;
  ell?: [number, number, number, number];
  tongue?: [number, number, number, number];
  teeth?: string;
};

export type MouthKey = MouthShape | "smile" | "frown" | "smirk";

const MOUTHS: Record<MouthKey, MouthDef> = {
  frown: { line: "M -18 44 Q 0 32 18 44" },
  smirk: { line: "M -18 38 Q 4 42 20 30" },
  smile: { d: "M -26 28 Q 0 31 26 28 Q 24 62 0 62 Q -24 62 -26 28 Z", tongue: [0, 54, 12, 6] },
  X: { line: "M -22 30 Q 0 48 22 30" },
  A: { line: "M -16 37 Q 0 41 16 37" },
  B: { d: "M -22 30 Q 0 34 22 30 Q 18 48 0 48 Q -18 48 -22 30 Z", teeth: "M -18 31.6 Q 0 35 18 31.6 L 16 38 Q 0 40.5 -16 38 Z" },
  C: { d: "M -22 28 Q 0 32 22 28 Q 20 58 0 58 Q -20 58 -22 28 Z", tongue: [0, 51, 10, 5] },
  D: {
    d: "M -28 26 Q 0 30 28 26 Q 26 72 0 72 Q -26 72 -28 26 Z",
    tongue: [0, 63, 14, 7],
    teeth: "M -22 28 Q 0 31 22 28 L 20 34.5 Q 0 37.5 -20 34.5 Z",
  },
  E: { ell: [0, 44, 15, 17], tongue: [0, 54, 8, 4] },
  F: { ell: [0, 42, 8, 9] },
  G: { d: "M -20 32 Q 0 36 20 32 Q 16 46 0 46 Q -16 46 -20 32 Z", teeth: "M -14 33 Q 0 36 14 33 L 13 40.5 Q 0 42.5 -13 40.5 Z" },
  H: { d: "M -22 28 Q 0 32 22 28 Q 20 58 0 58 Q -20 58 -22 28 Z", tongue: [0, 40, 9, 6] },
};

export const Mouth: React.FC<{ shape: MouthKey }> = ({ shape }) => {
  const m = MOUTHS[shape];
  if (m.line) return <path d={m.line} fill="none" stroke={O} strokeWidth={6} strokeLinecap="round" />;
  return (
    <g>
      {m.d && <path d={m.d} fill={COLORS.mouth} />}
      {m.ell && <ellipse cx={m.ell[0]} cy={m.ell[1]} rx={m.ell[2]} ry={m.ell[3]} fill={COLORS.mouth} />}
      {m.tongue && <ellipse cx={m.tongue[0]} cy={m.tongue[1]} rx={m.tongue[2]} ry={m.tongue[3]} fill={COLORS.tongue} />}
      {m.teeth && <path d={m.teeth} fill={COLORS.white} />}
      {m.d && <path d={m.d} fill="none" stroke={O} strokeWidth={5} strokeLinejoin="round" />}
      {m.ell && <ellipse cx={m.ell[0]} cy={m.ell[1]} rx={m.ell[2]} ry={m.ell[3]} fill="none" stroke={O} strokeWidth={5} />}
    </g>
  );
};

const Arm: React.FC<{ rot: number }> = ({ rot }) => (
  <g transform={`rotate(${rot.toFixed(2)})`}>
    <path d="M 0 0 Q 24 -2 38 -24" fill="none" stroke={O} strokeWidth={17} strokeLinecap="round" />
    <path d="M 0 0 Q 24 -2 38 -24" fill="none" stroke={COLORS.yellow} strokeWidth={10} strokeLinecap="round" />
    <circle cx={41} cy={-29} r={12} fill={COLORS.yellow} stroke={O} strokeWidth={5} />
    <circle cx={31} cy={-35} r={5.5} fill={COLORS.yellow} stroke={O} strokeWidth={4} />
  </g>
);

const Shoe: React.FC = () => (
  <g>
    <path d="M -26 2 C -28 -16 -8 -22 8 -20 C 24 -18 34 -8 36 2 Z" fill={COLORS.cap} stroke={O} strokeWidth={5} strokeLinejoin="round" />
    <ellipse cx={25} cy={-4} rx={8} ry={6} fill={COLORS.white} />
    <path d="M -4 -17 L 5 -11 M 3 -20 L 12 -13" stroke={COLORS.white} strokeWidth={3} strokeLinecap="round" />
    <path d="M -30 2 H 38 Q 40 12 30 12 H -24 Q -32 12 -30 2 Z" fill={COLORS.white} stroke={O} strokeWidth={5} strokeLinejoin="round" />
  </g>
);

const Leg: React.FC<{ side: "l" | "r"; lift: number }> = ({ side, lift }) => {
  const sx = side === "l" ? -1 : 1;
  const hx = 28 * sx;
  const fx = 34 * sx;
  const fy = 160 - 16 * lift;
  return (
    <g>
      <path d={`M ${hx} 86 L ${fx} ${fy}`} stroke={O} strokeWidth={17} strokeLinecap="round" />
      <path d={`M ${hx} 86 L ${fx} ${fy}`} stroke={COLORS.yellow} strokeWidth={10} strokeLinecap="round" />
      <g transform={`translate(${fx} ${fy + 8}) scale(${sx} 1)`}>
        <Shoe />
      </g>
    </g>
  );
};

export type SunnyPose = {
  expression?: Expression;
  /** Overrides the expression's resting mouth (lip sync). */
  mouth?: MouthShape | null;
  blink?: boolean;
  /** Arm rotations in degrees. Negative raises the arm. */
  armL?: number;
  armR?: number;
  /** 0..1 foot lift. */
  legL?: number;
  legR?: number;
  /** Pupil offset in px, -4..4. */
  lookX?: number;
};

export const SunnyDefs: React.FC = () => (
  <defs>
    <radialGradient id="sunnyFill" gradientUnits="userSpaceOnUse" cx={-45} cy={-70} r={240}>
      <stop offset="0" stopColor={COLORS.yellowLight} />
      <stop offset=".55" stopColor={COLORS.yellow} />
      <stop offset="1" stopColor={COLORS.yellowDeep} />
    </radialGradient>
  </defs>
);

export const Sunny: React.FC<SunnyPose> = ({
  expression = "happy",
  mouth = null,
  blink = false,
  armL = -10,
  armR = -10,
  legL = 0,
  legR = 0,
  lookX = 0,
}) => {
  const e = EXPRESSIONS[expression];
  const el: EyeMode = blink && e.l === "open" ? "blink" : e.l;
  const er: EyeMode = blink && e.r === "open" ? "blink" : e.r;
  return (
    <g>
      <Leg side="l" lift={legL} />
      <Leg side="r" lift={legR} />
      <g transform="translate(-128 -40) scale(-1 1)">
        <Arm rot={armL} />
      </g>
      <g transform="translate(128 -40)">
        <Arm rot={armR} />
      </g>
      {/* body */}
      <path d={BODY} fill={O} stroke={O} strokeWidth={30} strokeLinejoin="round" />
      <path d={BODY} fill="url(#sunnyFill)" stroke="url(#sunnyFill)" strokeWidth={18} strokeLinejoin="round" />
      <ellipse cx={-62} cy={-50} rx={20} ry={9} transform="rotate(-38 -62 -50)" fill={COLORS.white} opacity={0.5} />
      <circle cx={-84} cy={-30} r={4.5} fill={COLORS.white} opacity={0.5} />
      {/* face */}
      <ellipse cx={-62} cy={22} rx={16} ry={10} fill={COLORS.cheek} opacity={0.6} />
      <ellipse cx={62} cy={22} rx={16} ry={10} fill={COLORS.cheek} opacity={0.6} />
      <Brow cx={-34} lift={e.browL} tilt={e.tilt} />
      <Brow cx={34} lift={e.browR} tilt={e.tilt} />
      <Eye side="l" mode={el} lookX={lookX} />
      <Eye side="r" mode={er} lookX={lookX} />
      <Mouth shape={mouth ?? e.mouth} />
      {/* cap */}
      <path d="M -64 -66 C -66 -200 66 -200 64 -66 Z" fill={COLORS.cap} stroke={O} strokeWidth={6} strokeLinejoin="round" />
      <path d="M 14 -163 C 44 -150 58 -110 60 -70" fill="none" stroke={COLORS.capDark} strokeWidth={6} strokeLinecap="round" opacity={0.7} />
      <circle cx={0} cy={-165} r={7} fill={COLORS.capDark} stroke={O} strokeWidth={4} />
      <path d={BADGE} fill={COLORS.yellow} stroke={O} strokeWidth={4} strokeLinejoin="round" />
      <path
        d="M -66 -70 Q 20 -54 118 -84 Q 128 -68 108 -58 Q 10 -36 -68 -58 Z"
        fill={COLORS.capDark}
        stroke={O}
        strokeWidth={6}
        strokeLinejoin="round"
      />
    </g>
  );
};
