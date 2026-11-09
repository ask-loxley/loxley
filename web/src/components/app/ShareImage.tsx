"use client";

import { useState } from "react";
import { savePostImage, type PostImageSpec } from "@/lib/postImage";
import styles from "./AgentApp.module.css";

const LABEL = { idle: "Image for X", busy: "Making image…", done: "Image saved", error: "Couldn't make the image" } as const;

/** Turns a result card into a branded 1600×900 image, ready to attach to a post. */
export default function ShareImage({ make }: { make: () => PostImageSpec }) {
  const [state, setState] = useState<keyof typeof LABEL>("idle");

  async function run() {
    setState("busy");
    try {
      await savePostImage(make());
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div className={styles.cardActions}>
      <button type="button" className={styles.ghostBtn} onClick={run} disabled={state === "busy"} aria-live="polite">
        {LABEL[state]}
      </button>
    </div>
  );
}
