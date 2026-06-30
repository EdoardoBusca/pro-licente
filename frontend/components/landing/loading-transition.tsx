"use client";

import { useEffect, useState } from "react";

interface LoadingTransitionProps {
  onComplete: () => void;
}

export function LoadingTransition({ onComplete }: LoadingTransitionProps) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    // Fade in → brief hold → fade out → call onComplete
    const t1 = setTimeout(() => setPhase("hold"), 50);   // trigger fade-in immediately
    const t2 = setTimeout(() => setPhase("out"),  600);  // start fade-out after 600ms
    const t3 = setTimeout(() => onComplete(),     1050); // hand off after fade-out finishes

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "hsl(var(--foreground))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "in"
          ? "opacity 0.25s ease-out"
          : "opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: "none",
      }}
    >
      <img
        src="/logo-vantagepoint.png"
        alt="VantagePoint"
        style={{
          height: "3rem",
          width: "auto",
          filter: "brightness(0) invert(1)",
          opacity: phase === "out" ? 0 : 1,
          transform: phase === "out" ? "scale(0.96)" : "scale(1)",
          transition: "opacity 0.45s cubic-bezier(0.4,0,0.2,1), transform 0.45s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </div>
  );
}
