"use client";

import { useEffect } from "react";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/**
 * Page-wide motion layer, driven by data attributes in the markup:
 * - data-parallax="0.2"  moves an element vertically against the scroll
 * - data-depth="16"      shifts an element with the cursor (negative = opposite way)
 * - data-px="0.3"        slides an element sideways as it scrolls past
 * - data-progress        exposes --p (0 → 1) while the element crosses the viewport
 * - data-magnetic        pulls an element toward the cursor on hover
 * - data-tilt="6"        tilts a card in 3D toward the cursor (max degrees)
 * - data-marquee         a ticker track whose speed and direction follow the scroll
 * It also adds a scroll progress bar and, on mouse devices, a trailing cursor ring.
 * Everything here uses the `translate` property, so it never fights the elements' own CSS transforms.
 */
export default function Motion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof WindowEventMap>(t: Window | HTMLElement, ev: K, fn: (e: WindowEventMap[K]) => void) => {
      t.addEventListener(ev, fn as EventListener, { passive: true });
      cleanups.push(() => t.removeEventListener(ev, fn as EventListener));
    };

    // Cursor position, normalized and smoothed for depth effects.
    let mx = window.innerWidth / 2, my = window.innerHeight / 2, nx = 0, ny = 0;
    on(window, "mousemove", (e) => { mx = e.clientX; my = e.clientY; });

    const moving = [...document.querySelectorAll<HTMLElement>("[data-parallax],[data-depth],[data-px]")].map((el) => ({
      el,
      p: parseFloat(el.dataset.parallax || "0"),
      d: parseFloat(el.dataset.depth || "0"),
      x: parseFloat(el.dataset.px || "0"),
      ty: 0,
    }));
    const progress = [...document.querySelectorAll<HTMLElement>("[data-progress]")];

    // Ticker: take over from the CSS animation.
    const tracks = [...document.querySelectorAll<HTMLElement>("[data-marquee]")].map((el) => {
      const t = { el, x: 0, hover: false };
      el.style.animation = "none";
      const host = el.parentElement ?? el;
      on(host, "mouseenter", () => (t.hover = true));
      on(host, "mouseleave", () => (t.hover = false));
      return t;
    });

    // Magnetic buttons.
    document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
      on(el, "mousemove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.28}px ${(e.clientY - r.top - r.height / 2) * 0.35}px`;
      });
      on(el, "mouseleave", () => (el.style.translate = "0 0"));
    });

    // 3D tilt with a moving glare (--gx/--gy).
    document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) => {
      const max = parseFloat(el.dataset.tilt || "6");
      on(el, "mousemove", (e) => {
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--rx", `${(0.5 - py) * max}deg`);
        el.style.setProperty("--ry", `${(px - 0.5) * max * 1.2}deg`);
        el.style.setProperty("--gx", `${px * 100}%`);
        el.style.setProperty("--gy", `${py * 100}%`);
      });
      on(el, "mouseleave", () => {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
      });
    });

    const bar = document.createElement("div");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    cleanups.push(() => bar.remove());

    let ring: HTMLDivElement | null = null, rx = mx, ry = my;
    if (fine) {
      ring = document.createElement("div");
      ring.className = "cursor-ring";
      ring.setAttribute("aria-hidden", "true");
      document.body.appendChild(ring);
      const r = ring;
      cleanups.push(() => r.remove());
      on(window, "mouseover", (e) => {
        const t = e.target as Element | null;
        r.classList.toggle("on", !!t?.closest?.("a, button, [data-cursor]"));
      });
      on(document.documentElement, "mouseleave", () => r.classList.add("gone"));
      on(document.documentElement, "mouseenter", () => r.classList.remove("gone"));
    }

    let lastY = window.scrollY, vel = 0, dir = 1, raf = 0;
    const frame = () => {
      const vh = window.innerHeight, sy = window.scrollY;
      vel += (sy - lastY - vel) * 0.12;
      lastY = sy;
      if (vel > 0.5) dir = 1;
      else if (vel < -0.5) dir = -1;
      nx += ((mx / window.innerWidth) * 2 - 1 - nx) * 0.06;
      ny += ((my / vh) * 2 - 1 - ny) * 0.06;

      const max = document.documentElement.scrollHeight - vh;
      bar.style.transform = `scaleX(${max > 0 ? sy / max : 0})`;

      for (const m of moving) {
        const r = m.el.getBoundingClientRect();
        if (r.bottom < -300 || r.top > vh + 300) continue;
        const c = r.top - m.ty + r.height / 2 - vh / 2; // distance from viewport center, without our own offset
        m.ty = -c * m.p + ny * m.d;
        m.el.style.translate = `${(nx * m.d + c * m.x).toFixed(1)}px ${m.ty.toFixed(1)}px`;
      }
      for (const el of progress) {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--p", clamp((vh - r.top) / (vh + r.height)).toFixed(3));
      }
      for (const t of tracks) {
        const half = t.el.scrollWidth / 2;
        const speed = (0.55 + Math.min(14, Math.abs(vel)) * 0.45) * (t.hover ? 0.3 : 1);
        t.x -= speed * dir;
        if (t.x <= -half) t.x += half;
        if (t.x > 0) t.x -= half;
        t.el.style.translate = `${t.x.toFixed(1)}px 0`;
      }
      if (ring) {
        rx += (mx - rx) * 0.2;
        ry += (my - ry) * 0.2;
        ring.style.translate = `${rx.toFixed(1)}px ${ry.toFixed(1)}px`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    document.documentElement.classList.add("motion");

    return () => {
      cancelAnimationFrame(raf);
      cleanups.forEach((c) => c());
      document.documentElement.classList.remove("motion");
    };
  }, []);

  return null;
}
