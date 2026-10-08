// The intro film's picture. drawFilm(ctx, t, w, h) paints the frame for
// second t and keeps no state, so the film can be paused, resized or
// screenshotted at any moment and always shows the same thing.
//
// Everything is drawn around the middle of the screen in a space whose
// shorter side is 720 units: 1280×720 on a laptop, 720×1558 on a phone held
// upright. The action stays within 340 units of the centre so it fits both;
// backgrounds stretch to the edges.
import {
  cue,
  captionAt,
  sceneAt,
  DURATION,
  type SceneId,
} from "./intro-script";

let c: CanvasRenderingContext2D;
let W = 1280;
let H = 720;

const INK = "#263447";
const NIGHT = "#202c3f";
const LIME = "#bafa67";
const CREAM = "#f8f5e9";
const SAGE = "#889464";
const TAN = "#e2c790";
const CORAL = "#ee7a5c";
const SUN = "#ffd25e";
const SKY = "#7cc4f0";
const SKIN = "#f6c9a1";
const HAIR = "#5b4636";
const CAT = "#d39460";
const TYRE = "#2c3440";
const FONT = 'Fredoka, "DM Sans", sans-serif';
const TAU = Math.PI * 2;
const HORIZON = -40;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
/** How far t is from a to b, as 0 to 1. */
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeIn = (p: number) => p ** 3;
const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
const overshoot = (p: number) =>
  1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;
/** 0 before `at`, then springs up to 1. */
const pop = (t: number, at: number, length = 0.3) =>
  t < at ? 0 : overshoot(span(t, at, at + length));
/** 1 on every beat, falling away before the next. */
const pulse = (t: number) => (1 - (t % 0.5) / 0.5) ** 3;
const rnd = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function paint(fill?: string, line = 0, stroke = INK) {
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (line) {
    c.lineWidth = line;
    c.strokeStyle = stroke;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.stroke();
  }
}
function oval(
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill?: string,
  line = 0,
  stroke = INK,
) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
  paint(fill, line, stroke);
}
const circle = (
  x: number,
  y: number,
  r: number,
  fill?: string,
  line = 0,
  stroke = INK,
) => oval(x, y, r, r, fill, line, stroke);
function box(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  line = 0,
  stroke = INK,
) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  paint(fill, line, stroke);
}
function poly(points: number[], fill?: string, line = 0, stroke = INK) {
  c.beginPath();
  for (let i = 0; i < points.length; i += 2)
    c[i ? "lineTo" : "moveTo"](points[i], points[i + 1]);
  c.closePath();
  paint(fill, line, stroke);
}
function stroke(points: number[], width: number, colour = INK) {
  c.beginPath();
  for (let i = 0; i < points.length; i += 2)
    c[i ? "lineTo" : "moveTo"](points[i], points[i + 1]);
  paint(undefined, width, colour);
}
function label(
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  line = 0,
  align: CanvasTextAlign = "center",
  outline = INK,
) {
  c.font = `700 ${size}px ${FONT}`;
  c.textAlign = align;
  c.textBaseline = "middle";
  if (line) {
    c.lineWidth = line;
    c.strokeStyle = outline;
    c.lineJoin = "round";
    c.strokeText(text, x, y);
  }
  c.fillStyle = fill;
  c.fillText(text, x, y);
}
function at(
  x: number,
  y: number,
  scale: number,
  turn: number,
  draw: () => void,
) {
  c.save();
  c.translate(x, y);
  c.rotate(turn);
  c.scale(scale, scale);
  draw();
  c.restore();
}
function alpha(a: number, draw: () => void) {
  if (a <= 0) return;
  const before = c.globalAlpha;
  c.globalAlpha = before * clamp(a);
  draw();
  c.globalAlpha = before;
}
// Backdrops overshoot the screen so a camera shake never shows an edge.
function backdrop(fill: string) {
  c.fillStyle = fill;
  c.fillRect(-W / 2 - 60, -H / 2 - 60, W + 120, H + 120);
}
function sky(top: number, bottom: number, stops: string[]) {
  const g = c.createLinearGradient(0, top, 0, bottom);
  stops.forEach((colour, i) => g.addColorStop(i / (stops.length - 1), colour));
  c.fillStyle = g;
  c.fillRect(-W / 2 - 60, top - 60, W + 120, bottom - top + 60);
}
function glow(x: number, y: number, r: number, colour: string, strength = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, colour + "00");
  alpha(strength, () => {
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  });
}
function rays(x: number, y: number, colour: string, turn: number, count = 12) {
  c.fillStyle = colour;
  for (let i = 0; i < count; i++) {
    const a = turn + (i / count) * TAU;
    const b = a + TAU / count / 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * 1900, y + Math.sin(a) * 1900);
    c.lineTo(x + Math.cos(b) * 1900, y + Math.sin(b) * 1900);
    c.fill();
  }
}
/** A word that slams onto the screen, holds, and leaves. */
function sting(
  text: string,
  x: number,
  y: number,
  t: number,
  from: number,
  to: number,
  fill: string,
  size = 92,
  tilt = -0.07,
) {
  if (t < from || t >= to) return;
  const scale = pop(t, from, 0.22) * (1 - easeIn(span(t, to - 0.15, to)));
  at(x, y, scale, tilt, () => label(text, 0, 0, size, fill, size * 0.22));
}
function confetti(t: number, from: number, x: number, y: number, count = 46) {
  const age = t - from;
  if (age < 0 || age > 3) return;
  const colours = [LIME, CORAL, SUN, SKY, CREAM];
  for (let i = 0; i < count; i++) {
    const a = rnd(i) * TAU;
    const speed = 240 + rnd(i + 50) * 520;
    const px = x + Math.cos(a) * speed * easeOut(clamp(age / 1.2));
    const py =
      y + Math.sin(a) * speed * easeOut(clamp(age / 1.2)) + 190 * age * age;
    at(px, py, 1, age * (4 + rnd(i + 9) * 8), () =>
      box(-9, -5, 18, 10, 2, colours[i % colours.length]),
    );
  }
}

// ---------------------------------------------------------------- the cast

type Face = {
  look?: [number, number];
  blink?: number;
  mouth?: "smile" | "smirk" | "talk" | "grin";
  open?: number;
  brow?: number;
  happy?: boolean;
  lids?: number;
};
/** Tea Alchemist from the chest up, with the middle of her face at 0,0. */
function tea(face: Face, t: number) {
  const [lx, ly] = face.look || [0, 0];
  const blink = face.blink ?? (t % 2.9 < 0.11 ? 1 : 0);
  // Hair behind, then the robe, long enough to run off any screen.
  oval(0, 26, 128, 124, HAIR, 6);
  c.beginPath();
  c.moveTo(-64, 76);
  c.quadraticCurveTo(-176, 104, -194, 270);
  c.lineTo(-214, 1200);
  c.lineTo(214, 1200);
  c.lineTo(194, 270);
  c.quadraticCurveTo(176, 104, 64, 76);
  c.closePath();
  paint(SAGE, 6);
  poly([-70, 80, 0, 168, 70, 80, 40, 74, 0, 122, -40, 74], TAN, 5);
  circle(0, 186, 12, SUN, 4);
  oval(0, 0, 108, 100, SKIN, 6);
  // A braid over one shoulder and a lock down the other cheek.
  c.beginPath();
  c.moveTo(-106, -30);
  c.quadraticCurveTo(-132, 40, -112, 120);
  c.quadraticCurveTo(-96, 60, -88, -10);
  c.closePath();
  paint(HAIR, 5);
  c.beginPath();
  c.moveTo(104, -30);
  c.quadraticCurveTo(140, 60, 120, 150);
  c.quadraticCurveTo(150, 200, 122, 236);
  c.quadraticCurveTo(96, 200, 104, 150);
  c.quadraticCurveTo(84, 70, 86, -10);
  c.closePath();
  paint(HAIR, 5);
  circle(122, 240, 11, TAN, 4);
  oval(-66, 46, 17, 9, "#f09a8a88");
  oval(66, 46, 17, 9, "#f09a8a88");
  for (const side of [-1, 1]) {
    const ex = side * 40 + lx * 8;
    const ey = 14 + ly * 6;
    const raise = side > 0 ? face.brow || 0 : 0;
    if (face.happy) {
      c.beginPath();
      c.arc(ex, ey + 8, 16, Math.PI * 1.12, Math.PI * 1.88);
      paint(undefined, 7);
    } else {
      oval(ex, ey, 15, 21 * (1 - blink * 0.9), INK);
      if (blink < 0.5) {
        circle(ex + 5 + lx * 2, ey - 8, 6, "#fff");
        circle(ex - 5, ey + 8, 3, "#ffffffaa");
      }
      if (face.lids) {
        box(ex - 20, ey - 26, 40, 8 + face.lids * 16, 0, SKIN);
        stroke(
          [
            ex - 17,
            ey - 18 + face.lids * 16,
            ex + 17,
            ey - 18 + face.lids * 16,
          ],
          5,
        );
      }
    }
    stroke(
      [ex + side * 20, -18 - raise * 6, ex - side * 14, -24 - raise * 16],
      6,
      HAIR,
    );
  }
  if (face.mouth === "talk") {
    oval(0, 56, 13, 4 + (face.open || 0) * 13, "#8a3b3b", 4);
  } else if (face.mouth === "grin") {
    c.beginPath();
    c.moveTo(-26, 46);
    c.lineTo(26, 46);
    c.quadraticCurveTo(0, 92, -26, 46);
    paint("#8a3b3b", 5);
    box(-16, 47, 32, 8, 2, "#fff");
  } else if (face.mouth === "smirk") {
    c.beginPath();
    c.moveTo(-18, 54);
    c.quadraticCurveTo(6, 68, 28, 44);
    paint(undefined, 5);
    stroke([28, 44, 33, 38], 5);
  } else {
    c.beginPath();
    c.arc(0, 44, 20, Math.PI * 0.2, Math.PI * 0.8);
    paint(undefined, 5);
  }
  // The hat: bent cone, tan band with a tea leaf, wide brim.
  c.beginPath();
  c.moveTo(-98, -74);
  c.quadraticCurveTo(-40, -196, 22, -254);
  c.quadraticCurveTo(74, -296, 126, -262);
  c.quadraticCurveTo(88, -238, 78, -200);
  c.quadraticCurveTo(94, -124, 98, -74);
  c.closePath();
  paint(SAGE, 6);
  c.beginPath();
  c.moveTo(-88, -96);
  c.quadraticCurveTo(0, -70, 90, -96);
  paint(undefined, 30);
  paint(undefined, 20, TAN);
  at(34, -98, 1, -0.5, () => oval(0, 0, 17, 9, LIME, 4));
  oval(0, -72, 176, 34, SAGE, 6);
  c.beginPath();
  c.ellipse(0, -80, 150, 20, 0, Math.PI * 0.1, Math.PI * 0.9);
  paint(undefined, 4, "#6f7a50");
}
/** Jelly the tea drop, Tea Alchemist's slime, resting at 0,0. */
function jelly(t: number) {
  const squish = Math.sin(t * TAU * 2) * 0.08;
  at(0, 0, 1, 0, () => {
    c.scale(1 + squish, 1 - squish);
    c.beginPath();
    c.moveTo(0, -46);
    c.bezierCurveTo(34, -12, 34, 0, 0, 0);
    c.bezierCurveTo(-34, 0, -34, -12, 0, -46);
    paint("#b7e39a", 5);
    circle(-9, -12, 3.5, INK);
    circle(9, -12, 3.5, INK);
    oval(-10, -26, 5, 8, "#ffffff99");
  });
}
/** Kopi the cat. Walking is a side view heading right; sitting faces us. */
function kopi(t: number, sitting: boolean, meow: boolean) {
  const sway = Math.sin(t * 5);
  if (!sitting) {
    const step = Math.sin(t * 13);
    stroke([-64, -8, -92, -40, -86 + sway * 8, -84], 22);
    stroke([-64, -8, -92, -40, -86 + sway * 8, -84], 14, CAT);
    for (const [x, phase] of [
      [-42, 1],
      [-26, -1],
      [30, -1],
      [46, 1],
    ]) {
      stroke([x, 22, x + step * phase * 16, 58], 19);
      stroke([x, 22, x + step * phase * 16, 58], 11, CAT);
    }
    oval(0, 0, 70, 36, CAT, 5);
    stroke([-20, -30, -14, -8], 6, "#b9774a");
    stroke([4, -32, 8, -10], 6, "#b9774a");
    poly([44, -58, 50, -92, 70, -64], "#cd875a", 5);
    poly([70, -64, 92, -90, 94, -52], "#cd875a", 5);
    circle(66, -32, 36, "#dba16d", 5);
    oval(78, -36, 4.5, meow ? 2 : 7, INK);
    poly([96, -26, 104, -26, 100, -20], "#af685a");
    if (meow) oval(92, -12, 6, 8, "#8a3b3b", 3);
    stroke([96, -18, 122, -24], 2.5);
    stroke([96, -14, 122, -10], 2.5);
    return;
  }
  stroke([36, 44, 78, 40, 86 + sway * 10, 2], 22);
  stroke([36, 44, 78, 40, 86 + sway * 10, 2], 14, CAT);
  oval(0, 12, 48, 56, CAT, 5);
  oval(0, 26, 24, 34, "#e8bb8f");
  oval(-16, 62, 15, 10, "#dba16d", 4);
  oval(16, 62, 15, 10, "#dba16d", 4);
  poly([-40, -76, -34, -116, -10, -90], "#cd875a", 5);
  poly([40, -76, 34, -116, 10, -90], "#cd875a", 5);
  circle(0, -58, 44, "#dba16d", 5);
  const blink = t % 3.3 < 0.12;
  oval(-17, -62, 6, blink ? 1.5 : 10, INK);
  oval(17, -62, 6, blink ? 1.5 : 10, INK);
  poly([-6, -48, 6, -48, 0, -40], "#af685a");
  stroke([-10, -38, 0, -34, 10, -38], 3);
  for (const side of [-1, 1]) {
    stroke([side * 24, -46, side * 58, -52], 2.5);
    stroke([side * 24, -40, side * 58, -36], 2.5);
  }
}
/** A kart seen from above, nose pointing up the screen. */
function kart(body: string, helmet: string, flame = 0) {
  if (flame > 0) {
    const flick = 0.75 + rnd(Math.floor(flame * 40)) * 0.5;
    poly([-12, 42, 0, 42 + 62 * flick, 12, 42], SUN, 4, CORAL);
  }
  for (const [x, y] of [
    [-30, -24],
    [30, -24],
    [-32, 26],
    [32, 26],
  ])
    box(x - 9, y - 14, 18, 28, 6, TYRE);
  box(-23, -44, 46, 86, 16, body, 4);
  box(-28, 34, 56, 11, 4, INK);
  box(-11, -40, 22, 16, 6, "#ffffff66");
  circle(0, 4, 16, helmet, 4);
  box(-11, -9, 22, 9, 4, INK);
}

// ---------------------------------------------------------------- the sets

/** The estate at dusk: blocks, a path running away from us, lamps. */
function neighbourhood(t: number, late: number) {
  sky(-H / 2, HORIZON, [
    late ? "#161c3d" : "#272d5c",
    late ? "#3d3670" : "#6d4f8d",
    late ? "#a25c82" : "#f3a376",
  ]);
  for (let i = 0; i < 46; i++) {
    const twinkle = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
    alpha((0.25 + late * 0.5) * twinkle, () =>
      circle(
        (rnd(i) - 0.5) * W,
        -H / 2 + rnd(i + 80) * (H / 2 - 190),
        1.5 + rnd(i + 30) * 2,
        "#fff",
      ),
    );
  }
  glow(-250, HORIZON - 20, 300, late ? "#f7b8a0" : "#ffd9a0", 0.55);
  const blocks = Math.ceil(W / 430) + 1;
  for (let i = -blocks; i <= blocks; i++) {
    const tall = 190 + rnd(i + 20) * 200;
    const wide = 170 + rnd(i + 40) * 40;
    const x = i * 214 - wide / 2 + 30;
    box(
      x,
      HORIZON - tall,
      wide,
      tall + 4,
      6,
      ["#2b3355", "#343d63", "#3a3866"][(i + 99) % 3],
    );
    box(x, HORIZON - tall, wide, 12, 6, [CORAL, TAN, SAGE][(i + 99) % 3]);
    for (let row = 0; row * 30 < tall - 50; row++)
      for (let col = 0; col * 26 < wide - 34; col++) {
        const lit = rnd(i * 31 + row * 7 + col * 13) > 0.52;
        box(
          x + 16 + col * 26,
          HORIZON - tall + 28 + row * 30,
          14,
          16,
          2,
          lit ? "#ffd98a" : "#4a5480",
        );
      }
  }
  sky(HORIZON, H / 2, ["#3d6a58", "#284a45"]);
  const depth = H / 2 - HORIZON + 60;
  poly(
    [
      -44,
      HORIZON,
      44,
      HORIZON,
      44 + depth * 0.78,
      HORIZON + depth,
      -44 - depth * 0.78,
      HORIZON + depth,
    ],
    "#55627c",
  );
  for (let i = 0; i < 9; i++) {
    const y0 = HORIZON + 560 / (i + 0.7);
    const y1 = HORIZON + 560 / (i + 1.05);
    const w0 = (y0 - HORIZON) * 0.03;
    const w1 = (y1 - HORIZON) * 0.03;
    if (y1 < H / 2 + 60) poly([-w0, y0, w0, y0, w1, y1, -w1, y1], "#8894ad");
  }
  for (const [y, side] of [
    [-12, -1],
    [-12, 1],
    [70, -1],
    [70, 1],
  ]) {
    const scale = (y - HORIZON) / 120 + 0.25;
    const x = side * (44 + (y - HORIZON) * 0.78 + 46 * scale);
    stroke(
      [x, y, x, y - 250 * scale, x - side * 34 * scale, y - 262 * scale],
      9 * scale,
      "#1c2438",
    );
    glow(x - side * 34 * scale, y - 256 * scale, 150 * scale, "#ffe9a8", 0.75);
    circle(x - side * 34 * scale, y - 256 * scale, 11 * scale, "#fff3c9");
  }
  // A string of festival lights across the top of the frame.
  const hang = Math.max(-H / 2 + 70, -330);
  c.beginPath();
  c.moveTo(-W / 2 - 60, hang - 40);
  c.quadraticCurveTo(0, hang + 70, W / 2 + 60, hang - 40);
  paint(undefined, 3, "#1c2438");
  for (let i = -11; i <= 11; i++) {
    const p = (i + 11) / 22;
    const x = lerp(-W / 2 - 60, W / 2 + 60, p);
    const y = hang - 40 + 110 * 2 * p * (1 - p) + 8;
    const colour = [SUN, CORAL, LIME, SKY][(i + 12) % 4];
    glow(x, y, 26, colour, 0.5 + 0.3 * Math.sin(t * 3 + i));
    circle(x, y, 6, colour);
  }
}
/** Tea Alchemist's kart, seen from the front with her at the wheel. */
function kartFront(t: number, lean: number, face: Face) {
  box(-190, -18, 76, 112, 20, TYRE, 5);
  box(190 - 76, -18, 76, 112, 20, TYRE, 5);
  for (const x of [-170, -152, -134, 134, 152, 170])
    stroke([x, -4, x, 80], 4, "#454f61");
  box(-66, -150, 132, 150, 26, "#56627c", 5);
  c.save();
  c.beginPath();
  c.rect(-500, -900, 1000, 880);
  c.clip();
  at(0, -150 - lean * 22, lerp(0.78, 1.05, lean), lean * 0.09, () => {
    tea(face, t);
    at(128, -86, 0.8, 0.2, () => jelly(t));
  });
  c.restore();
  circle(0, -34, 50, undefined, 12, TYRE);
  circle(-48, -40, 17, SKIN, 5);
  circle(48, -40, 17, SKIN, 5);
  poly([-112, -34, 112, -34, 156, 66, -156, 66], SAGE, 6);
  box(-58, -18, 116, 34, 10, "#6f7a50");
  box(-172, 48, 344, 42, 16, TAN, 6);
  box(-48, 54, 96, 30, 6, CREAM, 4);
  label("T34", 0, 70, 24, INK);
  for (const x of [-104, 104]) {
    glow(x, 14, 110, "#fff1b0", 0.4);
    circle(x, 14, 24, "#fff6cf", 5);
  }
}
/** Palm Bay from above: one left-hand bend with tyres on the outside. */
const BEND = { x: -120, y: 110, r: 240 };
/** Where a kart is after d units of road, `off` units towards the outside. */
function road(d: number, off = 0): [number, number, number] {
  const straight = 400 - BEND.y;
  const curve = (BEND.r * Math.PI) / 2;
  if (d < straight) return [120 + off, 400 - d, 0];
  if (d < straight + curve) {
    const a = (d - straight) / BEND.r;
    const r = BEND.r + off;
    return [BEND.x + r * Math.cos(a), BEND.y - r * Math.sin(a), -a];
  }
  return [BEND.x - (d - straight - curve), BEND.y - BEND.r - off, -Math.PI / 2];
}
function track(scatter: number) {
  backdrop("#58c1d9");
  for (let i = 0; i < 26; i++)
    alpha(0.35, () =>
      box((rnd(i) - 0.5) * W, (rnd(i + 60) - 0.5) * H, 46, 5, 3, "#fff"),
    );
  c.beginPath();
  c.arc(BEND.x, BEND.y, 474, 0, TAU);
  c.rect(-W / 2 - 60, BEND.y - 474, W / 2 + 60 + BEND.x, 474);
  c.rect(-W / 2 - 60, BEND.y, W / 2 + 60 + 474, H);
  paint("#ffffffaa", 22, "#ffffffaa");
  paint("#efd9a3");
  c.beginPath();
  c.moveTo(45, H / 2 + 60);
  c.lineTo(45, BEND.y);
  c.arc(BEND.x, BEND.y, 165, 0, -Math.PI / 2, true);
  c.lineTo(-W / 2 - 60, BEND.y - 165);
  c.lineTo(-W / 2 - 60, H / 2 + 60);
  c.closePath();
  paint("#8ecf7c");
  const line = () => {
    c.beginPath();
    c.moveTo(120, H / 2 + 60);
    c.lineTo(120, BEND.y);
    c.arc(BEND.x, BEND.y, BEND.r, 0, -Math.PI / 2, true);
    c.lineTo(-W / 2 - 60, BEND.y - BEND.r);
  };
  line();
  paint(undefined, 166, "#fff");
  paint(undefined, 150, "#4a5568");
  c.setLineDash([26, 30]);
  paint(undefined, 5, "#ffffff77");
  c.beginPath();
  c.arc(BEND.x, BEND.y, 163, 0, -Math.PI / 2, true);
  c.setLineDash([22, 22]);
  paint(undefined, 16, CORAL);
  c.setLineDash([]);
  for (const [x, y, s] of [
    [330, 250, 1],
    [-420, -290, 0.9],
    [-250, 270, 1.1],
    [-60, 170, 0.8],
  ])
    at(x, y, s, x, () => {
      for (let i = 0; i < 7; i++)
        at(0, 0, 1, (i / 7) * TAU, () =>
          oval(30, 0, 34, 11, "#3f9b6a", 3, "#2b7550"),
        );
      circle(0, 0, 9, "#7a5a3c");
    });
  for (let i = 0; i < 10; i++) {
    const a = 0.3 + i * 0.105;
    const hit = clamp(1 - Math.abs(a - 1) / 0.3) * scatter;
    const r = 347 + hit * (90 + rnd(i) * 90);
    const wobble = (rnd(i + 5) - 0.5) * hit * 1.4;
    at(
      BEND.x + r * Math.cos(a + wobble * 0.2),
      BEND.y - r * Math.sin(a + wobble * 0.2),
      1,
      hit * 5,
      () => {
        circle(0, 0, 23, i % 2 ? TYRE : "#f4f1e6", 4);
        circle(0, 0, 9, "#56627c", 3);
      },
    );
  }
}
/** Hoops Court as the shooter sees it. `sway` swings the net. */
function court(flash: number) {
  sky(-H / 2, 30, ["#ff9a76", "#ffc98a", "#ffe6b0"]);
  for (let i = -5; i <= 5; i++) {
    const tall = 110 + rnd(i + 7) * 150;
    box(i * 190 - 80, 30 - tall, 150, tall, 4, "#f0a078");
  }
  sky(30, H / 2, ["#3e9c8f", "#2f7f76"]);
  const depth = H / 2 - 30 + 60;
  poly(
    [
      -130,
      30,
      130,
      30,
      130 + depth * 0.5,
      30 + depth,
      -130 - depth * 0.5,
      30 + depth,
    ],
    "#d9775a",
    6,
    "#fff",
  );
  box(-12, -80, 24, 112, 4, INK);
  box(-158, -272, 316, 196, 16, flash > 0 ? LIME : "#fff", 7);
  box(-146, -260, 292, 172, 10, "#f8f5e9");
  box(-54, -178, 108, 82, 4, undefined, 6, CORAL);
}
function hoop(sway: number, bulge: number, front: boolean) {
  c.beginPath();
  c.ellipse(0, -95, 62, 16, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
  paint(undefined, 10, "#f0752e");
  if (!front) return;
  for (let i = 0; i <= 6; i++) {
    const p = i / 6 - 0.5;
    stroke(
      [
        p * 120,
        -92 + (1 - Math.abs(p) * 2) * 12,
        p * (70 + bulge * 40) + sway * 22,
        -40,
        p * 62 + sway * 34,
        -6 + bulge * 10,
      ],
      3,
      "#fff",
    );
  }
  stroke([-36 + sway * 22, -40, 36 + sway * 22, -40], 3, "#fff");
}
function ball(x: number, y: number, r: number, spin: number) {
  at(x, y, r / 50, spin, () => {
    circle(0, 0, 50, "#f0752e", 5);
    stroke([-50, 0, 50, 0], 4);
    c.beginPath();
    c.arc(-58, 0, 46, -0.9, 0.9);
    paint(undefined, 4);
    c.beginPath();
    c.arc(58, 0, 46, Math.PI - 0.9, Math.PI + 0.9);
    paint(undefined, 4);
  });
}
function hands(lift: number) {
  const y = H / 2 - 40 - lift * 210;
  for (const side of [-1, 1])
    at(side * (118 - lift * 40), y, 1, side * (0.3 - lift * 0.5), () => {
      box(-34, -10, 68, 400, 30, SKIN, 6);
      box(-40, 60, 80, 400, 12, LIME, 6);
    });
}
/** A Brick Bash cabinet. `screen` paints inside the glass, centred on 0,0. */
function cabinet(t: number, zoom: number, screen: () => void) {
  backdrop("#1a1633");
  for (let i = 0; i < 9; i++)
    box(
      -W / 2 - 60,
      -H / 2 + i * 190,
      W + 120,
      5,
      0,
      i % 2 ? "#ff5fa233" : "#7cc4f033",
    );
  glow(0, -60, 620, "#7c5cff", 0.45);
  at(0, 24 - 66 * zoom, 1.12 + zoom * 0.9, 0, () => {
    box(-312, -322, 624, 1500, 30, "#3a2f6b", 7);
    box(-286, -306, 572, 44, 12, "#241d45");
    label("BRICK BASH", 0, -283, 30, t % 0.5 < 0.25 ? SUN : "#fff");
    box(-268, -250, 536, 500, 22, "#080a1c", 7);
    c.save();
    c.beginPath();
    c.roundRect(-252, -234, 504, 468, 12);
    c.clip();
    c.fillStyle = "#101538";
    c.fillRect(-252, -234, 504, 468);
    screen();
    c.fillStyle = "#00000030";
    for (let y = -234; y < 234; y += 6) c.fillRect(-252, y, 504, 2);
    c.restore();
    box(-312, 268, 624, 150, 0, "#2c2354", 7);
    stroke([-130, 330, -130, 300], 12);
    circle(-130, 292, 24, CORAL, 6);
    circle(70, 326, 26, LIME, 6);
    circle(150, 306, 26, SUN, 6);
  });
}
function crowd(t: number, cheer: number) {
  const count = Math.ceil(W / 120) + 1;
  for (let i = 0; i < count; i++) {
    const x = -W / 2 + i * 120 + (rnd(i) - 0.5) * 30;
    const hop = Math.abs(Math.sin(t * TAU + i)) * (10 + cheer * 26);
    const y = H / 2 - 20 - hop;
    if (cheer > 0)
      stroke(
        [x + 34, y - 20, x + 52, y - 96 - cheer * 30],
        9,
        [LIME, SUN, SKY, CORAL][i % 4],
      );
    circle(x, y, 58, "#0e1226");
  }
}

// -------------------------------------------------------------- the scenes

function arrival(t: number) {
  neighbourhood(t, 0);
  const near = easeInOut(span(t, 0.15, cue.brake));
  const scale = 1 / lerp(16, 1, near);
  const dip =
    t < cue.brake
      ? 0
      : Math.sin((t - cue.brake) * 22) *
        16 *
        (1 - span(t, cue.brake, 2.5)) ** 2;
  const lean = easeOut(span(t, 2.2, 2.6));
  const line = captionAt(t);
  const talking = line?.who === "tea";
  for (let i = 0; i < 8; i++) {
    const age = t - (cue.brake - 0.35) - i * 0.04;
    if (age > 0 && age < 1.1)
      alpha((1 - age / 1.1) * 0.6, () =>
        circle(
          (i % 2 ? 1 : -1) * (160 + age * 190 + i * 9),
          220 - age * 70 - (i % 3) * 22,
          26 + age * 60,
          "#d8d2c8",
        ),
      );
  }
  at(0, HORIZON + (150 - HORIZON) * scale + dip, scale * 0.85, 0, () =>
    kartFront(t, lean, {
      look: [0, lean * 0.6],
      mouth: talking ? "talk" : t > 2.3 ? "smirk" : "smile",
      open: Math.abs(Math.sin(t * 19)),
      brow: lean,
      lids: lean * 0.35,
    }),
  );
}
function countdown(t: number) {
  const i = Math.min(2, Math.floor((t - 4.5) / 0.5));
  const age = t - cue.count[i];
  backdrop([CORAL, SUN, LIME][i]);
  alpha(0.16, () => rays(0, 0, "#fff", t * 0.8));
  at(0, 20, lerp(1.9, 1, easeOut(span(age, 0, 0.16))), (i - 1) * 0.06, () =>
    label(String(3 - i), 0, 0, 470, CREAM, 44),
  );
  for (let k = 0; k < 3; k++)
    circle((k - 1) * 110, -290, 34, k <= i ? INK : "#00000022", 6);
}
/** The line of a kart that braked too late: straight on, into the tyres. */
function skid(p: number): [number, number] {
  return [
    lerp(lerp(120, 126, p), lerp(126, 46, p), p),
    BEND.y + lerp(lerp(0, -150, p), lerp(-150, -254, p), p),
  ];
}
function raceFail(t: number) {
  const slide = span(t, 7, cue.crash);
  const after = t - cue.crash;
  track(after > 0 ? easeOut(span(after, 0, 0.6)) : 0);
  // Skid marks from where the back end let go.
  if (slide > 0)
    for (const side of [-15, 15]) {
      const marks: number[] = [];
      for (let k = 0; k <= 12; k++) {
        const p = (k / 12) * slide;
        marks.push(...skid(p).map((v, n) => (n ? v : v + side)));
      }
      stroke(marks, 8, "#2d334099");
    }
  [CORAL, SKY, SUN].forEach((colour, i) => {
    const [x, y, a] = road(
      100 + (t - cue.go) * 300 - [300, 400, 500][i],
      [-30, 26, -22][i],
    );
    at(x, y, 1.25, a, () => kart(colour, CREAM));
  });
  let x: number, y: number, turn: number;
  if (t < 7) [x, y, turn] = road(30 + (t - cue.go) * 260);
  else if (after < 0) {
    [x, y] = skid(slide);
    turn = -1.25 * easeOut(slide);
  } else {
    const back = easeOut(span(after, 0, 0.5));
    x = lerp(46, 66, back);
    y = BEND.y + lerp(-254, -208, back);
    turn = -1.25 - TAU * 1.5 * easeOut(span(after, 0, 0.9));
  }
  if (slide > 0 && after < 0)
    for (let i = 0; i < 5; i++)
      alpha(0.5, () =>
        circle(x + 30 + i * 12, y + 30 + i * 16, 14 + i * 5, "#e9dfc6"),
      );
  at(x, y, 1.35, turn, () => kart(LIME, INK));
  if (after > 0)
    for (let i = 0; i < 3; i++) {
      const a = t * 7 + (i * TAU) / 3;
      label("★", x + Math.cos(a) * 46, y - 54 + Math.sin(a) * 14, 34, SUN, 8);
    }
  sting("GO!", -200, 30, t, cue.go, 6.7, LIME, 170, -0.05);
  sting("TOO WIDE!", -110, 40, t, cue.crash + 0.05, 9, CORAL, 84);
  sting("8th", 262, 250, t, cue.crash + 0.3, 9, CREAM, 70, 0.06);
}
function hoops(t: number, win: boolean) {
  const start = win ? 16 : 9;
  const release = start + 0.6;
  const arrive = win ? 17.3 : cue.rim;
  const made = win ? t - cue.swish : -1;
  const clang = win ? -1 : t - cue.rim;
  court(made > 0 && made % 0.24 < 0.12 && made < 1 ? 1 : 0);
  const shake =
    clang > 0 ? Math.sin(clang * 40) * (1 - span(clang, 0, 0.6)) : 0;
  const swish =
    made > -0.1
      ? Math.sin(Math.max(0, made) * 16) * (1 - span(made, 0, 0.9))
      : 0;
  const flight = span(t, release, arrive);
  const endX = win ? 0 : 60;
  const endY = win ? -140 : -100;
  let x = lerp(0, endX, flight);
  let y =
    lerp(290, endY, flight) -
    250 * 4 * flight * (1 - flight) * 0.5 -
    (t < release ? Math.sin(t * 9) * 8 : 0);
  let r = lerp(112, 42, easeOut(flight));
  let inside = false;
  if (clang > 0) {
    x = 60 + 250 * clang;
    y = -100 - 330 * clang + 620 * clang * clang;
    r = 42 + clang * 46;
  } else if (win && t > arrive) {
    const drop = t - arrive;
    inside = true;
    y = Math.min(
      -140 + 1500 * drop * drop,
      150 -
        Math.abs(Math.sin((drop - 0.44) * 6)) *
          70 *
          (1 - span(drop, 0.44, 1.7)),
    );
  }
  at(shake * 5, 0, 1, shake * 0.02, () => hoop(0, 0, false));
  if (inside) ball(x, y, r, t * 5);
  at(shake * 5, 0, 1, shake * 0.02, () =>
    hoop(swish, clamp(1 - Math.abs(made) * 5), true),
  );
  if (!inside) ball(x, y, r, t * (clang > 0 ? -9 : 5));
  hands(
    easeOut(span(t, release - 0.15, release + 0.1)) *
      (1 - span(t, release + 0.7, release + 1.2)),
  );
  if (win) {
    confetti(t, cue.swish, 0, -120);
    sting("SWISH!", -175, -10, t, cue.swish + 0.02, 19, LIME, 96);
    sting(
      "+3",
      200,
      -40 - span(t, cue.swish, 19) * 60,
      t,
      cue.swish + 0.15,
      19,
      SUN,
      84,
      0.08,
    );
  } else {
    sting("CLANG!", -175, -10, t, cue.rim + 0.02, 11.5, CORAL, 92);
  }
}
function arcade(t: number) {
  const keys: [number, number, number][] = [
    [11.5, -100, 110],
    [12, -240, -30],
    [12.5, 60, -222],
    [13, 240, -50],
    [13.5, 130, 250],
  ];
  const over = t >= cue.gameOver;
  const retry = t >= 14.4;
  const pressed = t >= cue.retry;
  const zoom = easeIn(span(t, cue.retry, 16));
  cabinet(t, zoom, () => {
    label("SCORE 9950", -234, -204, 28, CREAM, 0, "left");
    label("♥", 232, -204, 32, CORAL, 0, "right");
    if (!retry) {
      box(104, -176, 92, 34, 6, CORAL, 4, "#fff");
      if (!over && t % 0.5 < 0.3) label("1 BRICK LEFT", 0, -110, 32, SUN);
    }
    if (!over) {
      let k = 0;
      while (k < keys.length - 2 && keys[k + 1][0] <= t) k++;
      const p = span(t, keys[k][0], keys[k + 1][0]);
      const bx = lerp(keys[k][1], keys[k + 1][1], p);
      const by = lerp(keys[k][2], keys[k + 1][2], p);
      for (let i = 1; i < 5; i++)
        alpha(0.5 - i * 0.1, () =>
          circle(
            lerp(bx, keys[k][1], i * 0.06),
            lerp(by, keys[k][2], i * 0.06),
            11,
            "#fff",
          ),
        );
      circle(bx, by, 12, "#fff");
      box(
        lerp(-130, 75, easeOut(span(t, 13.02, 13.42))) - 48,
        172,
        96,
        16,
        8,
        LIME,
      );
    } else if (!retry) {
      alpha(0.5 * (1 - span(t, cue.gameOver, 13.9)), () => {
        c.fillStyle = CORAL;
        c.fillRect(-252, -234, 504, 468);
      });
      if ((t - cue.gameOver) % 0.3 < 0.2)
        label("GAME OVER", 0, -20, 76, CORAL, 14, "center", "#fff");
      label("so close…", 0, 60, 30, CREAM);
    } else {
      label("GAME OVER", 0, -120, 44, "#ee7a5c88");
      label("TRY AGAIN?", 0, -30, 62, CREAM);
      const push = pressed ? 5 : 0;
      box(
        -190,
        40 + push,
        170,
        76,
        16,
        pressed || t % 0.4 < 0.25 ? LIME : "#8fbf52",
        6,
        "#fff",
      );
      label("YES", -105, 80 + push, 40, INK);
      box(20, 40, 170, 76, 16, "#2a3160", 6, "#56608f");
      label("NO", 105, 80, 40, "#8c94c0");
      if (pressed)
        alpha(1 - span(t, cue.retry, 15.8), () =>
          circle(-105, 78, 30 + (t - cue.retry) * 500, undefined, 8, "#fff"),
        );
    }
  });
  alpha(zoom, () => backdrop("#fff"));
}
function raceWin(t: number) {
  track(0);
  const speed = span(t, 20.4, 21);
  for (let i = 0; i < 14; i++) {
    const p = (rnd(i) + t * (1.2 + rnd(i + 3))) % 1;
    alpha(0.3 * speed, () =>
      box(lerp(W / 2, -W / 2, p), (rnd(i + 20) - 0.5) * 640, 120, 5, 3, "#fff"),
    );
  }
  for (const [lag, off, colour] of [
    [170, -24, SKY],
    [300, 22, SUN],
  ] as const) {
    const [x, y, a] = road(480 + (t - cue.pass) * 190 - lag, off);
    at(x, y, 1.25, a, () => kart(colour, CREAM));
  }
  const rival = road(480 + (t - cue.pass) * 200, 30);
  at(rival[0], rival[1], 1.25, rival[2], () => kart(CORAL, CREAM));
  const [x, y, a] = road(480 + (t - cue.pass) * 330, -40);
  at(x, y, 1.35, a - 0.12 * (1 - speed), () =>
    kart(LIME, INK, t > 20.3 ? t : 0),
  );
  const first = t >= cue.pass;
  at(
    272,
    290,
    1 + pop(t, cue.pass, 0.3) * 0.25 - (first ? 0.25 : 0) + pulse(t) * 0.05,
    0.06,
    () => {
      box(-74, -44, 148, 88, 24, first ? LIME : CREAM, 7);
      label(first ? "1st" : "2nd", 0, 2, 58, INK);
    },
  );
  sting("OVERTAKE!", -110, 160, t, cue.pass + 0.05, 22.7, SUN, 80);
}
function stage(t: number) {
  const lanes = [CORAL, SUN, LIME, SKY];
  const hits = [0, 1, 3];
  const posed = t - cue.pose;
  backdrop("#141733");
  sky(140, H / 2, ["#2a2f5e", "#1b1f44"]);
  box(
    -W / 2 - 60,
    -H / 2 - 60,
    W + 120,
    Math.max(60, H / 2 - 300) + 60,
    0,
    "#0c0e22",
  );
  const truss = Math.min(-300, -H / 2 + 40) + 20;
  box(-W / 2 - 60, truss - 14, W + 120, 28, 0, "#2b3055", 5);
  lanes.forEach((colour, i) => {
    const x = (i - 1.5) * 190;
    const hit = hits.indexOf(i);
    const lit =
      posed > 0
        ? 0.55 + pulse(t) * 0.2
        : hit >= 0 && t >= cue.perfect[hit]
          ? 0.3 + 0.5 * (1 - span(t, cue.perfect[hit], cue.perfect[hit] + 0.45))
          : 0.12;
    alpha(lit, () =>
      poly(
        [x - 22, truss, x + 22, truss, x * 0.4 + 150, 330, x * 0.4 - 150, 330],
        colour,
      ),
    );
    box(x - 30, truss - 6, 60, 44, 10, "#3a4070", 5);
    circle(x, truss + 30, 20, colour, 5);
  });
  alpha(0.5, () => oval(-90, 250, 250, 36, "#00000088"));
  // The dancer is the newcomer: a silhouette with a lime edge.
  const moves: [number, number, number, number][] = [
    [0.5, 0.5, 0.15, 0],
    [-2.3, 0.6, 0.15, 0],
    [-2.3, -2.3, 0.2, 0],
    [-1.3, -1.3, 0.5, 22],
    [-2.6, -0.4, 0.75, 46],
  ];
  const beats = [23, ...cue.perfect, cue.pose];
  let k = 0;
  while (k < beats.length - 1 && beats[k + 1] <= t) k++;
  const from = moves[Math.max(0, k - 1)];
  const into = easeOut(span(t, beats[k], beats[k] + 0.14));
  const [left, right, legs, hop] = moves[k].map((v, i) =>
    lerp(k ? from[i] : v, v, into),
  );
  const bob = pulse(t) * 8;
  at(-90, 80 - hop + bob, 1, posed > 0 ? -0.06 : 0, () => {
    for (const pass of [0, 1]) {
      const width = pass ? 34 : 46;
      const colour = pass ? "#0e1226" : LIME;
      stroke([-18, 96, -18 - legs * 80, 176 - bob], width, colour);
      stroke([18, 96, 18 + legs * 80, 176 - bob], width, colour);
      stroke(
        [
          -52,
          10,
          -52 + Math.cos(left + Math.PI / 2) * -96,
          10 + Math.sin(left + Math.PI / 2) * 96,
        ],
        width - 8,
        colour,
      );
      stroke(
        [
          52,
          10,
          52 + Math.cos(right + Math.PI / 2) * 96,
          10 + Math.sin(right + Math.PI / 2) * 96,
        ],
        width - 8,
        colour,
      );
      box(
        -56 - (pass ? 0 : 6),
        -18 - (pass ? 0 : 6),
        112 + (pass ? 0 : 12),
        130 + (pass ? 0 : 12),
        40,
        colour,
      );
      circle(0, -92, pass ? 70 : 76, colour);
    }
  });
  // The note highway: three arrows that reach the line exactly on the beat.
  at(244, 0, 1, 0, () => {
    box(-104, -250, 208, 440, 22, "#0c0e22cc", 5, "#3a4070");
    box(-96, 110, 192, 10, 5, CREAM);
    hits.forEach((lane, i) => {
      const due = cue.perfect[i];
      const x = (lane - 1.5) * 48;
      const y = 115 - (due - t) * 420;
      if (t < due && y > -240)
        at(x, y, 1, [Math.PI, Math.PI / 2, -Math.PI / 2, 0][lane], () =>
          poly(
            [-17, -9, 2, -9, 2, -20, 21, 0, 2, 20, 2, 9, -17, 9],
            lanes[lane],
            4,
          ),
        );
      else if (t >= due)
        alpha(1 - span(t, due, due + 0.4), () =>
          circle(x, 115, 14 + (t - due) * 150, undefined, 7, lanes[lane]),
        );
    });
  });
  cue.perfect.forEach((due, i) =>
    sting(
      i === 2 ? "PERFECT! ×3" : "PERFECT!",
      -90,
      -235 - i * 6,
      t,
      due,
      i === 2 ? cue.pose : due + 0.48,
      lanes[hits[i]],
      74,
    ),
  );
  confetti(t, cue.pose, -90, -120, 60);
  crowd(t, easeOut(span(posed, 0, 0.3)));
}
function praise(t: number) {
  backdrop(LIME);
  alpha(0.5, () => rays(0, 40, "#d9ffa0", t * 0.5, 14));
  const line = captionAt(t);
  at(-30, 110 - pulse(t) * 10, 1.25 * pop(t, 26, 0.3), -0.05, () => {
    tea({ mouth: line ? "grin" : "smile", happy: t < 27.2, brow: 0.4 }, t);
    at(128, -86, 0.8, 0.2, () =>
      at(0, -Math.abs(Math.sin(t * TAU)) * 26, 1, 0, () => jelly(t)),
    );
  });
  at(250, 140, pop(t, 26.3, 0.25), -0.2, () => {
    box(-30, -84, 46, 96, 22, SKIN, 6);
    box(-52, -14, 104, 96, 30, SKIN, 6);
    box(-70, 70, 140, 600, 14, SAGE, 6);
  });
}
function dare(t: number) {
  const push = easeInOut(span(t, 30.5, 31));
  const closer = easeInOut(span(t, cue.silence, 33));
  neighbourhood(t, 1);
  const walk = span(t, 28, 30.3);
  const catX = lerp(-W / 2 - 110, -250, easeOut(walk));
  const line = captionAt(t);
  const teaX = lerp(170, 40, push);
  const sly = span(t, cue.silence, 32.75);
  at(
    teaX,
    lerp(10, 60, push) + closer * 16,
    lerp(0.86, 1.36, push) + closer * 0.14,
    lerp(0, 0.05, push) - closer * 0.1,
    () => {
      tea(
        {
          look: t < 30.5 ? [clamp((catX - teaX) / 300, -1, 0.2), 0.8] : [0, 0],
          mouth: line ? "talk" : sly > 0 ? "smirk" : "smile",
          open: Math.abs(Math.sin(t * 19)),
          brow: sly,
          lids: sly * 0.4,
        },
        t,
      );
      at(128, -86, 0.8, 0.2, () => jelly(t));
    },
  );
  at(catX - push * 40, 150 + push * 20, 1 + push * 0.12, 0, () =>
    kopi(t, walk >= 1, t >= cue.meow && t < cue.meow + 0.45),
  );
  if (t >= cue.meow && t < cue.meow + 0.9)
    alpha(1 - span(t, cue.meow + 0.5, cue.meow + 0.9), () =>
      label("meow", catX + 110, 60 - (t - cue.meow) * 40, 40, CREAM, 9),
    );
}
const MARK = "M20 13h16a13.5 13.5 0 0 1 0 27h-6v11H20z";
const MARK_HOLE = "M30 22h6a4.5 4.5 0 0 1 0 9h-6z";
function logo(t: number) {
  backdrop(LIME);
  alpha(0.55, () => rays(0, -40, "#d9ffa0", t * 0.35, 16));
  for (let i = 0; i < 26; i++) {
    const p = (rnd(i) + (t - cue.logo) * (0.12 + rnd(i + 4) * 0.14)) % 1;
    at(
      (rnd(i + 9) - 0.5) * W,
      lerp(-H / 2 - 40, H / 2 + 40, p),
      1,
      t * 2 + i,
      () => box(-10, -6, 20, 12, 3, [CORAL, SUN, SKY, CREAM, INK][i % 5]),
    );
  }
  const beat =
    1 +
    pulse(t) * 0.035 +
    pop(t, cue.finale, 0.3) * 0.06 -
    (t >= cue.finale ? 0.06 : 0);
  const slam = lerp(3.4, 1, easeOut(span(t, cue.logo, cue.logo + 0.22)));
  at(0, -170, 3 * slam * beat, -0.05, () => {
    c.translate(-32, -32);
    box(-3, -3, 70, 70, 20, CREAM);
    box(0, 0, 64, 64, 18, NIGHT);
    c.fillStyle = LIME;
    c.fill(new Path2D(MARK));
    c.fillStyle = NIGHT;
    c.fill(new Path2D(MARK_HOLE));
  });
  const word = "Play Simi";
  const type = Math.min(150, W / 5.4);
  c.font = `700 ${type}px ${FONT}`;
  let x = -c.measureText(word).width / 2;
  for (let i = 0; i < word.length; i++) {
    const wide = c.measureText(word[i]).width;
    at(
      x + wide / 2,
      60,
      pop(t, cue.logo + 0.5 + i * 0.06, 0.25) * beat,
      0,
      () => label(word[i], 0, 0, type, INK, type * 0.17, "center", CREAM),
    );
    x += wide;
  }
  at(0, 210, pop(t, cue.tagline, 0.28) * beat, -0.03, () => {
    box(-210, -52, 420, 104, 52, INK);
    label("Your turn.", 0, 2, 66, LIME);
  });
  alpha(span(t, 37, 37.4), () =>
    label("Meet you downstairs.", 0, 310, 30, INK),
  );
  alpha(span(t, DURATION - 0.6, DURATION - 0.05), () => backdrop(NIGHT));
}

const painters: Record<SceneId, (t: number) => void> = {
  arrival,
  countdown,
  "race-fail": raceFail,
  "hoops-fail": (t) => hoops(t, false),
  "arcade-fail": arcade,
  retry: arcade,
  "hoops-win": (t) => hoops(t, true),
  "race-win": raceWin,
  stage,
  praise,
  dare,
  logo,
};
const knocks: [number, number][] = [
  [cue.brake, 10],
  [cue.crash, 20],
  [cue.rim, 9],
  [cue.gameOver, 12],
  [cue.logo, 16],
  [cue.finale, 9],
];

function caption(t: number) {
  const line = captionAt(t);
  if (!line) return;
  const you = line.who === "you";
  const y = Math.min(H / 2 - 96, 470);
  const wide = Math.min(W - 48, 760);
  const shown = line.text.slice(0, Math.ceil((t - line.from) / 0.03));
  let size = 46;
  c.font = `700 ${size}px ${FONT}`;
  size = Math.min(size, (size * (wide - 80)) / c.measureText(line.text).width);
  at(0, y, pop(t, line.from, 0.18), 0, () => {
    box(-wide / 2, -52, wide, 104, 28, you ? INK : CREAM, 7, you ? LIME : INK);
    const tag = you ? "YOU" : "TEA ALCHEMIST";
    c.font = `700 24px ${FONT}`;
    const tagWide = c.measureText(tag).width + 36;
    const tagX = you ? wide / 2 - tagWide - 30 : -wide / 2 + 30;
    box(tagX, -74, tagWide, 40, 14, you ? LIME : SAGE, 5, you ? INK : INK);
    label(tag, tagX + tagWide / 2, -53, 24, you ? INK : CREAM);
    c.font = `700 ${size}px ${FONT}`;
    label(
      shown,
      -c.measureText(line.text).width / 2,
      8,
      size,
      you ? LIME : INK,
      0,
      "left",
    );
  });
}

/** Paints second `t` of the film onto a canvas that is w×h pixels. */
export function drawFilm(
  ctx: CanvasRenderingContext2D,
  t: number,
  w: number,
  h: number,
) {
  c = ctx;
  t = clamp(t, 0, DURATION);
  const unit = Math.min(w, h) / 720;
  W = w / unit;
  H = h / unit;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.fillStyle = NIGHT;
  c.fillRect(0, 0, w, h);
  c.setTransform(unit, 0, 0, unit, w / 2, h / 2);
  const scene = sceneAt(t);
  c.save();
  for (const [when, size] of knocks) {
    const fade = (1 - span(t, when, when + 0.45)) ** 2;
    if (t >= when && fade > 0)
      c.translate(
        Math.sin(t * 95) * size * fade,
        Math.cos(t * 71) * size * fade,
      );
  }
  painters[scene.id](t);
  c.restore();
  // A short white flash on each cut.
  if (scene.start > 0)
    alpha(0.45 * (1 - span(t, scene.start, scene.start + 0.14)), () =>
      backdrop("#fff"),
    );
  caption(t);
}
