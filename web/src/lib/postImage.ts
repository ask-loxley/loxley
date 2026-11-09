// Branded 1600×900 post images for X, drawn in the browser on a canvas.
// Rendering client-side keeps server CPU at zero and means Loxley never hosts an image with arbitrary text on it.

export type Tone = "ok" | "md" | "hi" | "plain";

export type PostImageSpec = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  art: "blue" | "pink" | "orange";
  footnote: string;
  filename: string;
  body:
    | {
        type: "table";
        head: [string, string, string, string];
        rows: { label: string; sub?: string; c1: string; c2: string; pill: { text: string; tone: Tone } }[];
      }
    | { type: "stat"; value: string; unit?: string; verdict: string; tone: Tone; points: { text: string; tone: Tone }[] }
    | {
        type: "split";
        buyPct: number;
        buyLabel: string;
        sellLabel: string;
        left: { title: string; rows: { label: string; value: string }[] };
        right: { title: string; rows: { label: string; value: string }[] };
      };
};

const W = 1600, H = 900;
const C = {
  bg: "#F3F0E6",
  dot: "rgba(18,63,61,0.07)",
  teal: "#123F3D",
  muted: "#4A5A56",
  vermilion: "#E8542C",
  line: "#DDD6C4",
  tone: {
    ok: { fg: "#1F6E47", bg: "#DCEFE3" },
    md: { fg: "#8A5A00", bg: "#F6E7C4" },
    hi: { fg: "#B3261E", bg: "#F7D9D4" },
    plain: { fg: "#123F3D", bg: "#E9E4D6" },
  },
};
const ART = { blue: "/brand/loxley-hero-blue.png", pink: "/brand/loxley-hero-pink.png", orange: "/brand/loxley-hero-orange.png" };

function fontVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function pill(ctx: CanvasRenderingContext2D, x: number, yMid: number, text: string, tone: Tone, mono: string, size = 18) {
  ctx.font = `500 ${size}px ${mono}`;
  spaced(ctx, 1);
  const w = ctx.measureText(text).width + 28, h = size + 18;
  rounded(ctx, x, yMid - h / 2, w, h, h / 2);
  ctx.fillStyle = C.tone[tone].bg;
  ctx.fill();
  ctx.fillStyle = C.tone[tone].fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 14, yMid + 1);
  ctx.textBaseline = "alphabetic";
  spaced(ctx, 0);
  return w;
}

export async function renderPostImage(spec: PostImageSpec): Promise<Blob> {
  const serif = fontVar("--font-serif", "Georgia, serif");
  const sans = fontVar("--font-sans", "system-ui, sans-serif");
  const mono = fontVar("--font-mono", "ui-monospace, monospace");
  await Promise.all([
    document.fonts.load(`italic 84px ${serif}`),
    document.fonts.load(`84px ${serif}`),
    document.fonts.load(`28px ${sans}`),
    document.fonts.load(`500 22px ${mono}`),
  ]).catch(() => null);
  const [art, logo] = await Promise.all([loadImage(ART[spec.art]), loadImage("/brand/loxley-logo-round.png")]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  // Paper with a fine dot grid, like the site background.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.dot;
  for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) ctx.fillRect(x, y, 1.6, 1.6);

  // Duotone statue panel on the right.
  const px = 1010, py = 60, pw = 530, ph = 750;
  ctx.save();
  rounded(ctx, px, py, pw, ph, 20);
  ctx.clip();
  const s = Math.max(pw / art.width, ph / art.height);
  const dw = art.width * s, dh = art.height * s;
  ctx.drawImage(art, px - (dw - pw) * 0.72, py - (dh - ph) * 0.25, dw, dh);
  ctx.restore();

  // Header.
  const left = 90, right = 950, maxW = right - left;
  ctx.fillStyle = C.vermilion;
  ctx.font = `500 22px ${mono}`;
  spaced(ctx, 4);
  ctx.fillText(spec.eyebrow.toUpperCase(), left, 132);
  spaced(ctx, 0);

  ctx.fillStyle = C.teal;
  ctx.font = `italic 84px ${serif}`;
  const titleLines = wrap(ctx, spec.title, maxW, 2);
  let y = 214;
  for (const l of titleLines) {
    ctx.fillText(l, left - 4, y);
    y += 84;
  }
  if (spec.subtitle) {
    ctx.fillStyle = C.muted;
    ctx.font = `28px ${sans}`;
    for (const l of wrap(ctx, spec.subtitle, maxW, 2)) {
      ctx.fillText(l, left, y - 18);
      y += 38;
    }
  }
  y += 24;

  const b = spec.body;
  if (b.type === "table") {
    ctx.fillStyle = C.muted;
    ctx.font = `500 16px ${mono}`;
    spaced(ctx, 2);
    ctx.fillText(b.head[0].toUpperCase(), left, y);
    ctx.textAlign = "right";
    ctx.fillText(b.head[1].toUpperCase(), 650, y);
    ctx.fillText(b.head[2].toUpperCase(), 810, y);
    ctx.textAlign = "left";
    ctx.fillText(b.head[3].toUpperCase(), 836, y);
    spaced(ctx, 0);
    y += 18;
    const rowH = 76;
    const room = Math.max(1, Math.floor((770 - y) / rowH));
    for (const r of b.rows.slice(0, room)) {
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      const mid = y + rowH / 2;
      ctx.fillStyle = C.teal;
      ctx.font = `40px ${serif}`;
      ctx.fillText(r.label, left, r.sub ? mid + 2 : mid + 13);
      if (r.sub) {
        ctx.fillStyle = C.muted;
        ctx.font = `17px ${sans}`;
        ctx.fillText(wrap(ctx, r.sub, 380, 1)[0], left, mid + 26);
      }
      ctx.fillStyle = C.teal;
      ctx.font = `28px ${sans}`;
      ctx.textAlign = "right";
      ctx.fillText(r.c1, 650, mid + 10);
      ctx.fillText(r.c2, 810, mid + 10);
      ctx.textAlign = "left";
      pill(ctx, 836, mid, r.pill.text, r.pill.tone, mono);
      y += rowH;
    }
  } else if (b.type === "stat") {
    // A big headline number with a verdict pill; facts go beside it, or below when the number is wide.
    const top = y + 10;
    ctx.fillStyle = C.teal;
    ctx.font = `180px ${serif}`;
    ctx.fillText(b.value, left - 6, top + 150);
    let w = ctx.measureText(b.value).width;
    if (b.unit) {
      ctx.fillStyle = C.muted;
      ctx.font = `52px ${serif}`;
      ctx.fillText(b.unit, left + w + 6, top + 150);
      w += ctx.measureText(b.unit).width + 6;
    }
    pill(ctx, left, top + 205, b.verdict.toUpperCase(), b.tone, mono, 20);
    const beside = w < 340;
    const x0 = beside ? 470 : left + 300;
    let py2 = beside ? top + 30 : top + 200;
    const room = beside ? 770 : 760;
    for (const p of b.points.slice(0, beside ? 4 : 3)) {
      if (py2 > room) break;
      ctx.fillStyle = C.tone[p.tone].fg;
      ctx.beginPath();
      ctx.arc(x0 - 22, py2 - 9, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.teal;
      ctx.font = `26px ${sans}`;
      const lines = wrap(ctx, p.text, right - x0, 2);
      lines.forEach((l, i) => ctx.fillText(l, x0, py2 + i * 34));
      py2 += lines.length * 34 + (beside ? 22 : 14);
    }
  } else {
    const barY = y + 44;
    ctx.font = `26px ${sans}`;
    ctx.fillStyle = C.tone.ok.fg;
    ctx.fillText(b.buyLabel, left, barY - 16);
    ctx.textAlign = "right";
    ctx.fillStyle = C.tone.hi.fg;
    ctx.fillText(b.sellLabel, right, barY - 16);
    ctx.textAlign = "left";
    rounded(ctx, left, barY, maxW, 22, 11);
    ctx.fillStyle = C.tone.hi.bg;
    ctx.fill();
    ctx.save();
    rounded(ctx, left, barY, maxW, 22, 11);
    ctx.clip();
    ctx.fillStyle = C.tone.ok.fg;
    ctx.fillRect(left, barY, (maxW * Math.max(0, Math.min(100, b.buyPct))) / 100, 22);
    ctx.restore();
    const listY = barY + 76;
    for (const [col, x0, x1, tone] of [
      [b.left, left, 500, "ok"],
      [b.right, 540, right, "hi"],
    ] as const) {
      ctx.fillStyle = C.muted;
      ctx.font = `500 16px ${mono}`;
      spaced(ctx, 2);
      ctx.fillText(col.title.toUpperCase(), x0, listY);
      spaced(ctx, 0);
      col.rows.slice(0, 4).forEach((r, i) => {
        const ry = listY + 48 + i * 50;
        ctx.fillStyle = C.teal;
        ctx.font = `500 22px ${mono}`;
        ctx.fillText(r.label, x0, ry);
        ctx.textAlign = "right";
        ctx.fillStyle = C.tone[tone].fg;
        ctx.font = `26px ${sans}`;
        ctx.fillText(r.value, x1, ry);
        ctx.textAlign = "left";
      });
    }
  }

  // Footer: wordmark, site, sources.
  ctx.drawImage(logo, left, 776, 64, 64);
  ctx.fillStyle = C.teal;
  ctx.font = `italic 46px ${serif}`;
  ctx.fillText("Loxley", left + 80, 818);
  ctx.fillStyle = C.vermilion;
  ctx.font = `500 13px ${mono}`;
  spaced(ctx, 3);
  ctx.fillText("ON-CHAIN AI AGENT", left + 82, 840);
  spaced(ctx, 1);
  ctx.textAlign = "right";
  ctx.fillStyle = C.teal;
  ctx.font = `500 24px ${mono}`;
  ctx.fillText("askloxley.com", right, 812);
  // Sources and time sit under the statue panel, clear of the wordmark.
  ctx.fillStyle = C.muted;
  ctx.font = `500 14px ${mono}`;
  ctx.fillText(spec.footnote, px + pw, py + ph + 34);
  ctx.textAlign = "left";
  spaced(ctx, 0);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the image."))), "image/png"),
  );
}

/** Shares the image on phones that support it (straight into the X app), otherwise downloads it. */
export async function savePostImage(spec: PostImageSpec): Promise<"shared" | "downloaded"> {
  const blob = await renderPostImage(spec);
  const file = new File([blob], spec.filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (window.matchMedia("(pointer: coarse)").matches && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch {
      /* cancelled: fall through to a download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = spec.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
  return "downloaded";
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
