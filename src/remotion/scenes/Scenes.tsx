import React from "react";
import type { Scene } from "../../shared/episode";
import { COLORS, starPath } from "../sunny/Sunny";

/** All scenes draw into a 540×960 viewBox (scaled 2× to 1080×1920). */

const O = COLORS.outline;

const Cloud: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s }) => (
  <g transform={`translate(${x.toFixed(1)} ${y}) scale(${s})`} fill="#fff">
    <ellipse cx={0} cy={0} rx={46} ry={26} />
    <ellipse cx={-38} cy={10} rx={30} ry={20} />
    <ellipse cx={40} cy={10} rx={34} ry={20} />
    <ellipse cx={6} cy={-18} rx={30} ry={24} />
  </g>
);

const Park: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <defs>
      <linearGradient id="skyPark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5EC4FF" />
        <stop offset="1" stopColor="#D4F3FF" />
      </linearGradient>
    </defs>
    <rect width={540} height={960} fill="url(#skyPark)" />
    <g transform="translate(450 150)">
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={-4} y={-92} width={8} height={26} rx={4} fill="#FFE14D" transform={`rotate(${i * 30 + f * 0.6})`} />
      ))}
      <circle r={52} fill="#FFE14D" />
    </g>
    <Cloud x={((f * 0.5) % 760) - 110} y={170} s={1} />
    <Cloud x={((f * 0.3 + 380) % 760) - 110} y={300} s={0.75} />
    <path d="M -20 700 Q 120 560 300 660 Q 430 600 560 650 V 960 H -20 Z" fill="#8EDB6C" />
    <path d="M -20 760 Q 200 700 560 750 V 960 H -20 Z" fill="#5CC25A" />
    <rect y={790} width={540} height={170} fill="#4FAE4E" />
    {(
      [
        [60, 820, "#FF5FA2"],
        [140, 880, "#FFD21F"],
        [420, 830, "#fff"],
        [490, 900, "#FF9A1F"],
        [260, 920, "#FF5FA2"],
      ] as const
    ).map(([x, y, c], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        <circle r={9} fill={c} />
        <circle r={4} fill="#FFE14D" />
      </g>
    ))}
  </g>
);

const WALLSTARS = [
  [300, 90],
  [470, 140],
  [360, 330],
  [500, 420],
  [250, 500],
  [40, 470],
  [160, 90],
  [420, 620],
];

const Bedroom: React.FC<{ f: number }> = ({ f }) => (
  <g>
    <rect width={540} height={960} fill="#FFEFD6" />
    {WALLSTARS.map(([x, y], i) => (
      <path key={i} d={starPath(9, 4, x, y)} fill="#FFC94A" opacity={0.45 + 0.35 * Math.sin(f / 14 + i)} />
    ))}
    <g transform="translate(40 170)">
      <rect width={190} height={220} rx={14} fill="#8FDCFF" stroke="#C98A4B" strokeWidth={12} />
      <Cloud x={((f * 0.4) % 260) - 40} y={70} s={0.5} />
      <path d="M 95 0 V 220 M 0 110 H 190" stroke="#C98A4B" strokeWidth={9} />
    </g>
    <g transform="translate(468 470) scale(0.8)">
      <rect x={-58} y={-66} width={116} height={132} rx={8} fill="#fff" stroke="#E0B98A" strokeWidth={5} />
      <path d={starPath(36, 15, 0, -6)} fill="#FFD21F" stroke={O} strokeWidth={4} strokeLinejoin="round" />
      <rect x={-36} y={40} width={72} height={8} rx={4} fill="#1F55D6" />
    </g>
    <rect y={760} width={540} height={200} fill="#E9A86B" />
    {[800, 850, 900].map((y) => (
      <path key={y} d={`M 0 ${y} H 540`} stroke="#D08F55" strokeWidth={3} />
    ))}
    <g transform="translate(-30 650)">
      <rect width={200} height={120} rx={18} fill="#C98A4B" />
      <rect y={20} width={200} height={70} rx={16} fill="#4F86F0" />
      <rect x={18} y={0} width={90} height={34} rx={14} fill="#fff" />
    </g>
  </g>
);

const RAINBOW = ["#FF5A5A", "#FF9A1F", "#FFD21F", "#4CD07D", "#2E7BEF", "#9B6BFF"];
const SPARKS = [
  [70, 140],
  [480, 110],
  [420, 320],
  [110, 380],
  [300, 90],
];

const Rainbow: React.FC<{ f: number }> = ({ f }) => {
  const sw = Math.sin(f / 30) * 40;
  return (
    <g>
      <defs>
        <linearGradient id="skyRainbow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5B3FE6" />
          <stop offset="1" stopColor="#FF8AC9" />
        </linearGradient>
      </defs>
      <rect width={540} height={960} fill="url(#skyRainbow)" />
      {RAINBOW.map((c, i) => {
        const r = 440 - i * 36;
        return <path key={c} d={`M ${270 - r} 790 A ${r} ${r} 0 0 1 ${270 + r} 790`} fill="none" stroke={c} strokeWidth={34} opacity={0.9} />;
      })}
      {SPARKS.map(([x, y], i) => (
        <path key={i} d={starPath(10, 4, x, y)} fill="#fff" opacity={0.4 + 0.5 * Math.abs(Math.sin(f / 12 + i))} />
      ))}
      <path d={`M 60 0 L ${190 + sw} 800 L ${40 + sw} 800 Z`} fill="#fff" opacity={0.13} />
      <path d={`M 480 0 L ${500 - sw} 800 L ${350 - sw} 800 Z`} fill="#fff" opacity={0.13} />
      <rect y={785} width={540} height={175} fill="#3B2A8A" />
      <ellipse cx={270} cy={790} rx={300} ry={26} fill="#5A43C2" />
    </g>
  );
};

export const SceneBackground: React.FC<{ scene: Scene; f: number }> = ({ scene, f }) => {
  if (scene === "bedroom") return <Bedroom f={f} />;
  if (scene === "rainbow") return <Rainbow f={f} />;
  return <Park f={f} />;
};

/* Floating music notes, shared across scenes. */
const NOTES: [number, number, number, string, number, number][] = [
  [60, 0, 1.1, "#FF5FA2", 1.1, -10],
  [470, 180, 1.4, "#2EC27E", 1.0, 8],
  [110, 420, 0.9, "#FF9A1F", 0.9, -14],
  [430, 560, 1.2, "#7A5CFF", 1.2, 10],
  [300, 300, 1.0, "#2E7BEF", 0.8, -6],
];

export const MusicNotes: React.FC<{ f: number }> = ({ f }) => (
  <g>
    {NOTES.map(([x0, off, speed, c, s, r], i) => {
      const y = 760 - ((f * speed + off) % 680);
      const x = x0 + Math.sin((f + off) / 22) * 14;
      return (
        <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r}) scale(${s})`}>
          <path d="M 8 -2 V -36 Q 22 -30 24 -16" fill="none" stroke={O} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 8 -2 V -36 Q 22 -30 24 -16" fill="none" stroke={c} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx={0} cy={0} rx={11} ry={8.5} transform="rotate(-20)" fill={c} stroke={O} strokeWidth={3.5} />
        </g>
      );
    })}
  </g>
);
