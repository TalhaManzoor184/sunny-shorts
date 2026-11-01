/**
 * Generates the show's sound effects and background music from code, so they are original and
 * free to use. Run once and commit the results:  npx tsx src/scripts/make-audio-assets.ts
 *
 *   assets/sfx/pop.wav     new line
 *   assets/sfx/whoosh.wav  scene change
 *   assets/sfx/boom.wav    punchline impact
 *   assets/sfx/boing.wav   jumps and spins
 *   assets/music/sunny-bounce.wav  ~16 s loop, 120 BPM
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../pipeline/config";

const SR = 44100;
const sfxDir = path.join(ROOT, "assets/sfx");
const musicDir = path.join(ROOT, "assets/music");
fs.mkdirSync(sfxDir, { recursive: true });
fs.mkdirSync(musicDir, { recursive: true });

function ffmpeg(filter: string, out: string, extra: string[] = []) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", filter, ...extra, "-ar", String(SR), "-ac", "1", out]);
}

// --- Sound effects -------------------------------------------------------
ffmpeg("aevalsrc='0.8*exp(-t*45)*sin(2*PI*(500*t+2500*t*t))':d=0.15", path.join(sfxDir, "pop.wav"));
ffmpeg("anoisesrc=d=0.45:color=pink:amplitude=0.9", path.join(sfxDir, "whoosh.wav"), [
  "-af",
  "highpass=f=500,lowpass=f=6000,afade=t=in:d=0.22:curve=qsin,afade=t=out:st=0.22:d=0.23:curve=qsin,volume=1.6",
]);
ffmpeg("aevalsrc='0.95*exp(-t*7)*sin(2*PI*(110*t-60*t*t))+0.35*exp(-t*30)*(random(0)*2-1)':d=0.6", path.join(sfxDir, "boom.wav"), [
  "-af",
  "lowpass=f=2500",
]);
ffmpeg("aevalsrc='0.6*exp(-t*5)*sin(2*PI*(260*t-(40/(2*PI*11))*cos(2*PI*11*t)))':d=0.5", path.join(sfxDir, "boing.wav"));

// --- Music: a light, bouncy loop (kick, hats, bass, chord stabs) ---------
const BPM = 120;
const beat = 60 / BPM;
const bars = 8;
const len = Math.round(bars * 4 * beat * SR);
const buf = new Float32Array(len);
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const add = (t0: number, dur: number, fn: (t: number) => number) => {
  const s0 = Math.round(t0 * SR);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n && s0 + i < len; i++) buf[s0 + i] += fn(i / SR);
};
// C – Am – F – G, twice
const chords = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

for (let bar = 0; bar < bars; bar++) {
  const t = bar * 4 * beat;
  const ch = chords[bar % 4];
  for (let b = 0; b < 4; b++) {
    const tb = t + b * beat;
    // kick on every beat
    add(tb, 0.25, (x) => 0.55 * Math.exp(-x * 18) * Math.sin(2 * Math.PI * (55 * x + 120 * (1 - Math.exp(-x * 30)) / 30)));
    // off-beat hats
    add(tb + beat / 2, 0.06, (x) => 0.08 * Math.exp(-x * 70) * rnd());
    // bass: root, octave bounce
    const root = midi(ch[0] - 24);
    add(tb, beat * 0.45, (x) => 0.22 * Math.exp(-x * 4) * Math.sign(Math.sin(2 * Math.PI * root * x)) * 0.6);
    add(tb + beat / 2, beat * 0.4, (x) => 0.16 * Math.exp(-x * 5) * Math.sin(2 * Math.PI * root * 2 * x));
    // chord stabs on 2 and 4 (soft, detuned triangle-ish)
    if (b % 2 === 1) {
      for (const n of ch) {
        const f = midi(n);
        add(tb, 0.22, (x) => 0.07 * Math.exp(-x * 9) * (Math.asin(Math.sin(2 * Math.PI * f * x)) + 0.5 * Math.asin(Math.sin(2 * Math.PI * f * 1.005 * x))));
      }
    }
  }
  // little melody blip at the start of every other bar
  if (bar % 2 === 0) {
    [ch[2] + 12, ch[1] + 12, ch[2] + 12].forEach((n, k) => {
      const f = midi(n);
      add(t + 2.5 * beat + k * beat * 0.25, 0.18, (x) => 0.06 * Math.exp(-x * 10) * Math.sin(2 * Math.PI * f * x));
    });
  }
}
// normalise and write 16-bit WAV
let peak = 0;
for (const v of buf) peak = Math.max(peak, Math.abs(v));
const pcm = Buffer.alloc(len * 2);
for (let i = 0; i < len; i++) pcm.writeInt16LE(Math.round((buf[i] / peak) * 0.85 * 32767), i * 2);
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
fs.writeFileSync(path.join(musicDir, "sunny-bounce.wav"), Buffer.concat([header, pcm]));

console.log("Wrote", fs.readdirSync(sfxDir).join(", "), "and sunny-bounce.wav");
