import React from "react";
import type { WordTiming } from "../shared/episode";
import { COLORS } from "./sunny/Sunny";

const MAX_CHARS_PER_ROW = 16;

function rows(words: WordTiming[]): WordTiming[][] {
  const out: WordTiming[][] = [];
  let cur: WordTiming[] = [];
  let len = 0;
  for (const w of words) {
    const add = (cur.length ? 1 : 0) + w.text.length;
    if (cur.length && len + add > MAX_CHARS_PER_ROW) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += (cur.length > 1 ? 1 : 0) + w.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Word-by-word captions in the upper safe zone (clear of the Shorts title overlay at the
 * bottom and the like/comment column on the right). Shows at most two rows at a time.
 */
export const Captions: React.FC<{
  words: WordTiming[];
  t: number;
  appear: number;
  /** Colour of the word being spoken (each character has its own). */
  activeColor?: string;
  /** Small name tag above the caption, e.g. "MOON". */
  label?: { text: string; fill: string };
}> = ({ words, t, appear, activeColor = COLORS.yellow, label }) => {
  if (!words.length) return null;
  const all = rows(words);
  // Page through the line two rows at a time, following the spoken word.
  let activeRow = all.findIndex((r) => r.some((w) => t < w.end));
  if (activeRow < 0) activeRow = all.length - 1;
  const page = Math.floor(activeRow / 2);
  const visible = all.slice(page * 2, page * 2 + 2);
  const size = 50;
  const lineH = 62;
  const top = 250 - ((visible.length - 1) * lineH) / 2;
  const s = 0.85 + 0.15 * appear;
  return (
    <g transform={`translate(255 ${top}) scale(${s})`} opacity={appear}>
      {label && (
        <g transform={`translate(0 ${-lineH + 2})`}>
          <rect x={-label.text.length * 9 - 14} y={-22} width={label.text.length * 18 + 28} height={30} rx={15} fill={label.fill} stroke={COLORS.outline} strokeWidth={4} />
          <text textAnchor="middle" y={1} fontFamily="Fredoka, 'Arial Rounded MT Bold', sans-serif" fontWeight={700} fontSize={20} letterSpacing={2} fill={COLORS.outline}>
            {label.text}
          </text>
        </g>
      )}
      {visible.map((row, ri) => (
        <text
          key={ri}
          x={0}
          y={ri * lineH}
          textAnchor="middle"
          fontFamily="Fredoka, 'Arial Rounded MT Bold', sans-serif"
          fontWeight={700}
          fontSize={size}
          paintOrder="stroke"
          stroke={COLORS.outline}
          strokeWidth={11}
          strokeLinejoin="round"
        >
          {row.map((w, wi) => {
            const active = t >= w.start && t < w.end + 0.05;
            return (
              <tspan key={wi} dx={wi === 0 ? 0 : 12} fill={active ? activeColor : "#FFFFFF"}>
                {w.text}
              </tspan>
            );
          })}
        </text>
      ))}
    </g>
  );
};
