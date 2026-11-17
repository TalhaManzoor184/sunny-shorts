import React from "react";
import type { Expression, MouthShape } from "../../shared/episode";
import { COLORS as SUN, Mouth, type MouthKey } from "../sunny/Sunny";

/**
 * Moon — Sunny's roommate. A round, pale-lavender full moon in a floppy nightcap, permanently
 * tired, deadpan, quietly sarcastic. Floats (no legs). Origin is the centre of the body, radius 118.
 * Shares Sunny's outline colour and mouth shapes so the two look like one show.
 */

export const MOON_COLORS = {
  light: "#F1EFFF",
  body: "#D9D3F7",
  deep: "#B2A8E6",
  crater: "#C3BAEE",
  cap: "#3E3591",
  capLight: "#5B50C4",
  pom: "#FFFFFF",
  iris: "#2B2560",
  bags: "#9C90D6",
  cheek: "#C9A9F0",
} as const;

const O = SUN.outline;
const R = 118;

type EyeLook = { lidL: number; lidR: number; closedL?: "arc" | "line"; closedR?: "arc" | "line"; browL: number; browR: number; tilt: number; mouth: MouthKey };

/** lid: 0 = wide open … 1 = shut. Moon's resting state is half-lidded. */
const LOOKS: Record<Expression, EyeLook> = {
  deadpan: { lidL: 0.55, lidR: 0.55, browL: 0, browR: 0, tilt: 0, mouth: "A" },
  annoyed: { lidL: 0.6, lidR: 0.6, browL: -2, browR: -2, tilt: 9, mouth: "frown" },
  surprised: { lidL: 0, lidR: 0, browL: 10, browR: 10, tilt: 0, mouth: "F" },
  smirk: { lidL: 0.35, lidR: 0.62, browL: 6, browR: -1, tilt: 0, mouth: "smirk" },
  happy: { lidL: 0.3, lidR: 0.3, browL: 3, browR: 3, tilt: 0, mouth: "smirk" },
  wink: { lidL: 1, lidR: 0.4, closedL: "arc", browL: 0, browR: 4, tilt: 0, mouth: "smirk" },
  laughing: { lidL: 1, lidR: 1, closedL: "arc", closedR: "arc", browL: 4, browR: 4, tilt: 0, mouth: "D" },
};

const MoonEye: React.FC<{ side: "l" | "r"; lid: number; closed?: "arc" | "line"; lookX: number }> = ({ side, lid, closed, lookX }) => {
  const cx = side === "l" ? -38 : 38;
  const cy = -14;
  const rx = 23;
  const ry = 26;
  if (closed === "arc" || lid >= 0.98) {
    const d =
      closed === "arc"
        ? `M ${cx - 20} ${cy + 5} Q ${cx} ${cy - 14} ${cx + 20} ${cy + 5}`
        : `M ${cx - 20} ${cy + 2} Q ${cx} ${cy + 9} ${cx + 20} ${cy + 2}`;
    return <path d={d} fill="none" stroke={O} strokeWidth={6} strokeLinecap="round" />;
  }
  const clip = `moonEye-${side}`;
  const lidY = cy - ry + lid * 2 * ry; // where the eyelid edge sits
  const ix = cx + (side === "l" ? 2 : -2) + lookX;
  const iy = cy + 5;
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
        </clipPath>
      </defs>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#FFFFFF" />
      <g clipPath={`url(#${clip})`}>
        <circle cx={ix} cy={iy} r={13} fill={MOON_COLORS.iris} />
        <circle cx={ix - 4.5} cy={iy - 4.5} r={4.2} fill="#FFFFFF" />
        <rect x={cx - rx - 2} y={cy - ry - 2} width={rx * 2 + 4} height={Math.max(0, lidY - (cy - ry) + 2)} fill={MOON_COLORS.body} />
      </g>
      {lid > 0.05 && <path d={`M ${cx - rx} ${lidY} L ${cx + rx} ${lidY}`} stroke={O} strokeWidth={5} strokeLinecap="round" />}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={O} strokeWidth={5} />
      {/* tired bags */}
      <path d={`M ${cx - 13} ${cy + ry + 6} Q ${cx} ${cy + ry + 12} ${cx + 13} ${cy + ry + 6}`} fill="none" stroke={MOON_COLORS.bags} strokeWidth={3.5} strokeLinecap="round" />
    </g>
  );
};

const MoonBrow: React.FC<{ side: "l" | "r"; lift: number; tilt: number }> = ({ side, lift, tilt }) => {
  const cx = side === "l" ? -38 : 38;
  const y = -54 - lift;
  const inner = side === "l" ? 1 : -1;
  const x1 = cx - 14;
  const x2 = cx + 14;
  const y1 = y + (inner === -1 ? tilt : -tilt * 0.3);
  const y2 = y + (inner === 1 ? tilt : -tilt * 0.3);
  return <path d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke={O} strokeWidth={5.5} strokeLinecap="round" />;
};

const MoonArm: React.FC<{ rot: number }> = ({ rot }) => (
  <g transform={`rotate(${rot.toFixed(2)})`}>
    <path d="M 0 0 Q 22 6 34 -10" fill="none" stroke={O} strokeWidth={16} strokeLinecap="round" />
    <path d="M 0 0 Q 22 6 34 -10" fill="none" stroke={MOON_COLORS.body} strokeWidth={9} strokeLinecap="round" />
    <circle cx={37} cy={-14} r={11} fill={MOON_COLORS.body} stroke={O} strokeWidth={5} />
  </g>
);

export const MoonDefs: React.FC = () => (
  <defs>
    <radialGradient id="moonFill" gradientUnits="userSpaceOnUse" cx={-40} cy={-50} r={190}>
      <stop offset="0" stopColor={MOON_COLORS.light} />
      <stop offset=".6" stopColor={MOON_COLORS.body} />
      <stop offset="1" stopColor={MOON_COLORS.deep} />
    </radialGradient>
  </defs>
);

export type MoonPose = {
  expression?: Expression;
  mouth?: MouthShape | null;
  blink?: boolean;
  armL?: number;
  armR?: number;
  lookX?: number;
};

export const Moon: React.FC<MoonPose> = ({ expression = "deadpan", mouth = null, blink = false, armL = 20, armR = 20, lookX = 0 }) => {
  const e = LOOKS[expression];
  const lidL = blink ? 1 : e.lidL;
  const lidR = blink ? 1 : e.lidR;
  return (
    <g>
      <g transform={`translate(-${R - 8} 34) scale(-1 1)`}>
        <MoonArm rot={armL} />
      </g>
      <g transform={`translate(${R - 8} 34)`}>
        <MoonArm rot={armR} />
      </g>
      {/* body */}
      <circle r={R} fill="url(#moonFill)" stroke={O} strokeWidth={6} />
      <ellipse cx={-62} cy={44} rx={16} ry={12} fill={MOON_COLORS.crater} />
      <ellipse cx={70} cy={58} rx={11} ry={8} fill={MOON_COLORS.crater} />
      <ellipse cx={58} cy={-60} rx={9} ry={7} fill={MOON_COLORS.crater} />
      <ellipse cx={-20} cy={86} rx={8} ry={6} fill={MOON_COLORS.crater} />
      <ellipse cx={-48} cy={-62} rx={18} ry={8} transform="rotate(-30 -48 -62)" fill="#FFFFFF" opacity={0.55} />
      {/* face */}
      <ellipse cx={-64} cy={20} rx={13} ry={8} fill={MOON_COLORS.cheek} opacity={0.55} />
      <ellipse cx={64} cy={20} rx={13} ry={8} fill={MOON_COLORS.cheek} opacity={0.55} />
      <MoonBrow side="l" lift={e.browL} tilt={e.tilt} />
      <MoonBrow side="r" lift={e.browR} tilt={e.tilt} />
      <MoonEye side="l" lid={lidL} closed={blink && !e.closedL ? "line" : e.closedL} lookX={lookX} />
      <MoonEye side="r" lid={lidR} closed={blink && !e.closedR ? "line" : e.closedR} lookX={lookX} />
      <g transform="translate(0 2) scale(1)">
        <Mouth shape={mouth ?? e.mouth} />
      </g>
      {/* floppy nightcap, flopping to the right */}
      <path
        d="M -86 -78 C -70 -150 40 -170 96 -120 C 130 -92 150 -60 168 -40 L 150 -28 C 128 -52 104 -76 86 -84 C 30 -104 -30 -100 -86 -78 Z"
        fill={MOON_COLORS.cap}
        stroke={O}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <path d="M -40 -118 C 0 -140 50 -136 86 -112" fill="none" stroke={MOON_COLORS.capLight} strokeWidth={8} strokeLinecap="round" opacity={0.8} />
      <path d="M -92 -84 Q 0 -112 92 -84 Q 96 -70 88 -64 Q 0 -90 -88 -66 Q -98 -72 -92 -84 Z" fill="#FFFFFF" stroke={O} strokeWidth={5} strokeLinejoin="round" />
      <circle cx={166} cy={-30} r={17} fill={MOON_COLORS.pom} stroke={O} strokeWidth={5} />
    </g>
  );
};
