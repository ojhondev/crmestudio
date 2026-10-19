"use client";

import { useEffect, useRef, useState } from "react";
import { SlideView } from "./slide-view";
import type { Slide } from "@/lib/docs/types";

/** Mostra o slide de 1280×720 reduzido para caber na largura disponível (mesmo desenho do PDF). */
export function ScaledSlide({ slide, map, index, total, studioName, className }: { slide: Slide; map: Record<string, string>; index: number; total: number; studioName: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = w / 1280;
  return (
    <div ref={ref} className={className} style={{ position: "relative", width: "100%", height: w ? w * (9 / 16) : undefined, aspectRatio: "16 / 9", overflow: "hidden" }}>
      {w > 0 && (
        <div style={{ position: "absolute", left: 0, top: 0, width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <SlideView slide={slide} map={map} index={index} total={total} studioName={studioName} />
        </div>
      )}
    </div>
  );
}
