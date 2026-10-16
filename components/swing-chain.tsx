"use client";

import { useEffect, useRef } from "react";

/**
 * A chain hanging off the logo's last link. Verlet rope: it sways on its own, and the cursor
 * nudges it like a hand brushing a heavy chain.
 * 3D look: every ring is tilted (seen as a squashed ring, never a flat line), neighbours sit 90° apart
 * and slowly twist, and back halves are drawn first and darker so each ring passes through the next.
 */
const LINKS = 14; // ~210px: hangs to just above the cards
// Ring geometry in logo.png pixels (its rightmost ring: 78x51 outside, 14px wire).
const RING_LEN = 65; // centreline length
const RING_TALL = 38; // centreline height when seen face-on
const INNER = 52; // inner length = distance between joints
const S = 0.288; // logo.png px -> screen px (the logo itself shows at 0.224, the hanging links are a bit bigger)
const PITCH = INNER * S;
// The logo's wire, cut across (from logo.png, edge inwards): [stroke width, colour]. Painting widest
// first gives the same soft edge and pink as the logo once scaled down.
const WIRE: [number, string][] = [
  [14, "rgba(165,75,120,0.07)"],
  [12, "rgba(215,98,171,0.74)"],
  [10, "rgba(235,95,191,0.98)"],
  [8, "rgb(243,86,199)"],
  [6, "rgb(248,83,204)"],
  [4, "rgb(253,81,203)"],
  [2, "rgb(255,80,204)"],
];
const LEVELS = 16; // pre-drawn tilt steps
const SHADE = "rgba(13,10,14,0.4)"; // darkens the back half of each ring
const BASE_TILT = 1.0; // rad from face-on; alternate links are 90° off, so they show at ~57° and ~33°

const GRAVITY = 1100; // px/s²
const DAMPING = 0.993; // per 120Hz step: a swing loses about half its speed each second
const HAND = 18; // cursor radius that touches the chain
const HAND_PUSH = 0.35; // how much of the overlap one frame resolves: <1 makes the chain feel heavy
const MAX_KICK = 3.5; // px per step the hand can add (~420px/s), so a fast flick doesn't launch it
// Canvas box around the anchor: room to swing either way and hang down.
const BOX = { left: 360, top: 40, width: 720, height: 400 };

type P = { x: number; y: number; px: number; py: number };

/** One ring per tilt step, front and shaded-back versions, drawn big then scaled down like the logo image. */
function ringSprites(dpr: number) {
  const W = RING_LEN + 18, H = RING_TALL + 18;
  const make = (squash: number, back: boolean) => {
    const big = document.createElement("canvas");
    big.width = W;
    big.height = H;
    const b = big.getContext("2d")!;
    const h = RING_TALL * squash;
    b.lineJoin = b.lineCap = "round";
    for (const [width, colour] of WIRE) {
      b.beginPath();
      b.roundRect(W / 2 - RING_LEN / 2, H / 2 - h / 2, RING_LEN, h, h / 2);
      b.lineWidth = width;
      b.strokeStyle = colour;
      b.stroke();
    }
    if (back) {
      b.globalCompositeOperation = "source-atop";
      b.fillStyle = SHADE;
      b.fillRect(0, 0, W, H);
    }
    const small = document.createElement("canvas");
    small.width = Math.ceil(W * S * dpr);
    small.height = Math.ceil(H * S * dpr);
    const s = small.getContext("2d")!;
    s.imageSmoothingQuality = "high";
    s.drawImage(big, 0, 0, small.width, small.height);
    return small;
  };
  const steps = Array.from({ length: LEVELS }, (_, i) => i / (LEVELS - 1));
  return { w: W * S, h: H * S, front: steps.map((q) => make(q, false)), back: steps.map((q) => make(q, true)) };
}

export function SwingChain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOX.width * dpr;
    canvas.height = BOX.height * dpr;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rings = ringSprites(dpr);

    // Start tilted so it's already swinging on load (unless the user asked for less motion).
    const tilt = calm ? 0 : 0.3;
    const pts: P[] = Array.from({ length: LINKS + 1 }, (_, i) => {
      const x = Math.sin(tilt) * i * PITCH, y = Math.cos(tilt) * i * PITCH;
      return { x, y, px: x, py: y };
    });

    let mouse: { x: number; y: number } | null = null; // client coords
    let last: { x: number; y: number } | null = null; // previous frame, local coords
    const onMove = (e: PointerEvent) => (mouse = { x: e.clientX, y: e.clientY });
    const onLeave = () => (mouse = last = null);
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);

    const clamp = (v: number) => Math.max(-MAX_KICK, Math.min(MAX_KICK, v));

    function touch() {
      if (!mouse) return;
      const r = canvas.getBoundingClientRect();
      const m = { x: mouse.x - r.left - BOX.left, y: mouse.y - r.top - BOX.top };
      const from = last ?? m;
      last = m;
      // Sweep the cursor's path since last frame, so a fast flick can't skip over the chain.
      const sx = m.x - from.x, sy = m.y - from.y, len2 = sx * sx + sy * sy || 1;
      for (const p of pts.slice(1)) {
        const t = Math.max(0, Math.min(1, ((p.x - from.x) * sx + (p.y - from.y) * sy) / len2));
        const cx = from.x + sx * t, cy = from.y + sy * t;
        const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
        if (d >= HAND) continue;
        // Shove it part of the way out of the hand, in the hand's direction. Moving the position
        // (not the previous one) is what gives it speed; the cap keeps it from flying.
        const nx = d ? dx / d : 0, ny = d ? dy / d : 1, overlap = HAND - d;
        p.x += clamp(nx * overlap * HAND_PUSH + sx * 0.08);
        p.y += clamp(ny * overlap * HAND_PUSH + sy * 0.08);
      }
    }

    function step(dt: number, t: number) {
      const wind = calm ? 0 : 50 * Math.sin((t * 2 * Math.PI) / 3.2); // slow push near its natural period: ±28px at the tail
      pts.forEach((p, i) => {
        if (i === 0) return;
        const vx = (p.x - p.px) * DAMPING, vy = (p.y - p.py) * DAMPING;
        p.px = p.x;
        p.py = p.y;
        p.x += vx + wind * (i / LINKS) * dt * dt;
        p.y += vy + GRAVITY * dt * dt;
      });
      for (let k = 0; k < 16; k++) {
        for (let i = 0; i < LINKS; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          const f = (d - PITCH) / d;
          if (i === 0) {
            b.x -= dx * f;
            b.y -= dy * f;
          } else {
            a.x += dx * f * 0.5;
            a.y += dy * f * 0.5;
            b.x -= dx * f * 0.5;
            b.y -= dy * f * 0.5;
          }
        }
        pts[0].x = pts[0].y = 0;
      }
    }

    /** Half of ring i: its back half (shaded) or its front half. */
    function half(i: number, front: boolean, t: number) {
      const a = pts[i], b = pts[i + 1];
      // How far this ring is turned about its own long axis: neighbours 90° apart, plus a slow twist.
      const spin = BASE_TILT + (i * Math.PI) / 2 + (calm ? 0 : 0.3 * Math.sin(0.7 * t + 0.6 * i));
      const level = Math.round(Math.abs(Math.cos(spin)) * (LEVELS - 1));
      // Which screen side (above or below the long axis) is nearer the viewer.
      const topNear = Math.sin(2 * spin) < 0;
      ctx.save();
      ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      ctx.beginPath();
      ctx.rect(-rings.w, front === topNear ? -rings.h : 0, rings.w * 2, rings.h);
      ctx.clip();
      ctx.drawImage((front ? rings.front : rings.back)[level], -rings.w / 2, -rings.h / 2, rings.w, rings.h);
      ctx.restore();
    }

    function draw(t: number) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, BOX.width, BOX.height);
      ctx.imageSmoothingQuality = "high";
      ctx.translate(BOX.left, BOX.top);
      // All back halves, then all front halves: each ring then passes through its neighbours.
      for (let i = 0; i < LINKS; i++) half(i, false, t);
      for (let i = 0; i < LINKS; i++) half(i, true, t);
    }

    // ponytail: runs every frame even when scrolled away; pause with an IntersectionObserver if it ever matters.
    const H = 1 / 120;
    let raf = 0, prev = performance.now(), acc = 0;
    const frame = (now: number) => {
      acc += Math.min(0.05, (now - prev) / 1000);
      prev = now;
      touch();
      for (; acc >= H; acc -= H) step(H, now / 1000);
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute z-10"
      // Anchor = inside the logo's rightmost link (77%, 79% of the image).
      style={{ left: `calc(77.2% - ${BOX.left}px)`, top: `calc(78.8% - ${BOX.top}px)`, width: BOX.width, height: BOX.height }}
    />
  );
}
