"use client";

import { useEffect, useRef, useCallback } from "react";

interface HeroProps {
  onEnterDashboard: () => void;
}

const FRAME_COUNT = 74;
const FRAME_PATH  = (i: number) =>
  `/incercare3/ezgif-frame-${String(i + 1).padStart(3, "0")}.png`;

const PHASES = [
  {
    id: "phase-1",
    start: 0,
    end: 22,
    pill: "Step 1: Ingest",
    heading: "See the whole\npicture.",
    body: "VantagePoint unifies raw property data, cash flows, and market trends into a single, clean dashboard.",
    cta: false,
  },
  {
    id: "phase-2",
    start: 23,
    end: 54,
    pill: "Step 2: Train",
    heading: "Predict future\nvaluations.",
    body: "Run our AI models against your unique data to expose the hidden signals driving local real estate prices.",
    cta: false,
  },
  {
    id: "phase-3",
    start: 50,
    end: 73,
    pill: "Step 3: Profit",
    heading: "Invest with\nconviction.",
    body: "Upload your dataset, train your custom AI, and start finding underpriced deals in minutes.",
    cta: true,
  },
];

export function Hero({ onEnterDashboard }: HeroProps) {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const imagesRef       = useRef<HTMLImageElement[]>([]);
  const frameRef        = useRef(0);       // current displayed frame (integer)
  const smoothRef       = useRef(0);       // floating lerp target
  const rafRef          = useRef(false);   // rAF loop running
  const phaseRefs       = useRef<(HTMLDivElement | null)[]>([]);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const scrollHintRef   = useRef<HTMLDivElement>(null);

  // ── Draw one frame with object-fit: cover ──────────────────────────────────
  // Coordinates are in logical (CSS) pixels; the context transform handles dpr.
  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = imagesRef.current[index];
    if (!img?.complete || img.naturalWidth === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const cw  = canvas.width  / dpr;   // logical width
    const ch  = canvas.height / dpr;   // logical height
    const iw  = img.naturalWidth;
    const ih  = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const sw    = iw * scale;
    const sh    = ih * scale;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - sw) / 2, (ch - sh) / 2, sw, sh);
  }, []);

  // ── Update phase visibility ─────────────────────────────────────────────────
  const updatePhases = useCallback((frameIndex: number) => {
    PHASES.forEach((phase, i) => {
      const el = phaseRefs.current[i];
      if (!el) return;
      const active = frameIndex >= phase.start && frameIndex <= phase.end;
      el.style.opacity      = active ? "1" : "0";
      el.style.transform    = active ? "translateY(0)" : "translateY(18px)";
    });
  }, []);

  // ── Resize canvas to device pixels ─────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = window.innerWidth;
    const h   = window.innerHeight;
    canvas.width        = Math.round(w * dpr);
    canvas.height       = Math.round(h * dpr);
    canvas.style.width  = w + "px";
    canvas.style.height = h + "px";
    // Scale the context so every drawImage call works in logical CSS pixels
    // while the underlying buffer has full physical-pixel resolution.
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFrame(frameRef.current);
  }, [drawFrame]);

  // ── Render loop — lerp smoothing at 60fps ──────────────────────────────────
  // `smoothRef` holds the floating frame position; each tick it eases toward
  // the scroll-mapped target. The displayed integer frame only redraws when it
  // actually changes, keeping GPU work minimal.
  const render = useCallback(() => {
    const scrollTop    = window.scrollY;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress     = Math.min(Math.max(scrollTop / scrollHeight, 0), 1);
    const target       = progress * (FRAME_COUNT - 1);

    // Ease factor: 0.12 = smooth but responsive; raise toward 1 for snappier feel
    smoothRef.current += (target - smoothRef.current) * 0.12;

    const frameIndex = Math.min(Math.round(smoothRef.current), FRAME_COUNT - 1);

    if (frameIndex !== frameRef.current) {
      frameRef.current = frameIndex;
      drawFrame(frameIndex);
    }

    updatePhases(frameRef.current);

    if (progressFillRef.current) {
      progressFillRef.current.style.width = (progress * 100).toFixed(1) + "%";
    }
    if (scrollHintRef.current) {
      scrollHintRef.current.style.opacity = scrollTop > 40 ? "0" : "1";
    }

    // Keep the loop alive while still catching up to target
    if (Math.abs(target - smoothRef.current) > 0.01) {
      requestAnimationFrame(render);
    } else {
      rafRef.current = false;
    }
  }, [drawFrame, updatePhases]);

  const onScroll = useCallback(() => {
    if (!rafRef.current) {
      rafRef.current = true;
      requestAnimationFrame(render);
    }
  }, [render]);

  useEffect(() => {
    // Preload all frames
    const imgs: HTMLImageElement[] = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = FRAME_PATH(i);
      img.onload = () => {
        // Redraw first frame once it loads
        if (i === 0) drawFrame(0);
      };
      imgs.push(img);
    }
    imagesRef.current = imgs;

    resizeCanvas();
    updatePhases(0);

    window.addEventListener("scroll",  onScroll, { passive: true });
    window.addEventListener("resize",  resizeCanvas);
    return () => {
      window.removeEventListener("scroll",  onScroll);
      window.removeEventListener("resize",  resizeCanvas);
    };
  }, [resizeCanvas, onScroll, drawFrame, updatePhases]);

  return (
    <>
      <style>{`
        .vp-scroll-container { height: 500vh; position: relative; }

        .vp-sticky {
          position: sticky;
          top: 0;
          height: 100vh;
          width: 100%;
          overflow: hidden;
          background: #000;
        }

        .vp-canvas {
          display: block;
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        /* Header bar */
        .vp-header {
          position: absolute;
          top: 0; left: 0; right: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 2rem;
          z-index: 20;
          background: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%);
        }
        .vp-logo {
          height: 2rem;
          width: auto;
          filter: brightness(0) invert(1);
        }
        .vp-launch-btn {
          padding: 0.55em 1.4em;
          border-radius: 999px;
          background: #fff;
          color: #000;
          font-size: 0.875rem;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
          letter-spacing: 0.01em;
        }
        .vp-launch-btn:hover { background: #e5e5e5; transform: scale(1.03); }

        /* Overlay */
        .vp-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 10;
        }

        /* Phase text blocks */
        .vp-phase {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 0 8vw;
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.55s cubic-bezier(0.22,1,0.36,1),
                      transform 0.55s cubic-bezier(0.22,1,0.36,1);
          will-change: opacity, transform;
        }

        .vp-pill {
          display: inline-block;
          margin-bottom: 1rem;
          padding: 0.3em 0.9em;
          border-radius: 999px;
          background: rgba(34,197,94,0.18);
          border: 1px solid rgba(34,197,94,0.4);
          color: #4ade80;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          width: fit-content;
        }

        .vp-heading {
          font-size: clamp(2.2rem, 5.5vw, 5rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.05;
          color: #fff;
          text-shadow: 0 2px 40px rgba(0,0,0,0.5);
          white-space: pre-line;
          max-width: 12ch;
        }

        .vp-body {
          margin-top: 1.1rem;
          font-size: clamp(0.9rem, 1.5vw, 1.15rem);
          color: rgba(255,255,255,0.68);
          max-width: 40ch;
          line-height: 1.7;
          text-shadow: 0 1px 20px rgba(0,0,0,0.5);
        }

        .vp-cta {
          pointer-events: all;
          margin-top: 2rem;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.85em 2em;
          border-radius: 999px;
          background: #22c55e;
          color: #000;
          font-size: 0.95rem;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: background 0.2s, transform 0.2s;
          box-shadow: 0 0 30px rgba(34,197,94,0.4);
          width: fit-content;
        }
        .vp-cta:hover { background: #4ade80; transform: scale(1.04); }

        /* Progress bar */
        .vp-progress {
          position: absolute;
          bottom: 2.2rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.45rem;
          z-index: 20;
          pointer-events: none;
        }
        .vp-track {
          width: 100px;
          height: 2px;
          background: rgba(255,255,255,0.12);
          border-radius: 2px;
          overflow: hidden;
        }
        .vp-fill {
          height: 100%;
          width: 0%;
          background: #22c55e;
          border-radius: 2px;
          transition: width 0.08s linear;
        }

        /* Scroll hint */
        .vp-scroll-hint {
          position: absolute;
          bottom: 2.5rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          z-index: 20;
          pointer-events: none;
          transition: opacity 0.4s;
        }
        .vp-scroll-hint span {
          font-size: 0.62rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
        }
        .vp-arrow {
          width: 18px; height: 18px;
          border-right: 2px solid rgba(255,255,255,0.3);
          border-bottom: 2px solid rgba(255,255,255,0.3);
          transform: rotate(45deg);
          animation: vp-bounce 1.6s ease-in-out infinite;
        }
        @keyframes vp-bounce {
          0%,100% { transform: rotate(45deg) translateY(0); }
          50%      { transform: rotate(45deg) translateY(5px); }
        }
      `}</style>

      <div className="vp-scroll-container">
        <div className="vp-sticky">

          {/* Canvas */}
          <canvas ref={canvasRef} className="vp-canvas" />

          {/* Header */}
          <header className="vp-header">
            <img src="/logo-vantagepoint.png" alt="VantagePoint" className="vp-logo" />
            <button className="vp-launch-btn" onClick={onEnterDashboard}>
              Launch App
            </button>
          </header>

          {/* Overlay phases */}
          <div className="vp-overlay">
            {PHASES.map((phase, i) => (
              <div
                key={phase.id}
                className="vp-phase"
                ref={(el) => { phaseRefs.current[i] = el; }}
                style={{ opacity: i === 0 ? 1 : 0, transform: i === 0 ? "translateY(0)" : "translateY(18px)" }}
              >
                <span className="vp-pill">{phase.pill}</span>
                <h1 className="vp-heading">{phase.heading}</h1>
                <p className="vp-body">{phase.body}</p>
                {phase.cta && (
                  <button className="vp-cta" onClick={onEnterDashboard}>
                    Get started
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8h10M9 4l4 4-4 4"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Scroll hint */}
          <div className="vp-scroll-hint" ref={scrollHintRef}>
            <span>Scroll</span>
            <div className="vp-arrow" />
          </div>

          {/* Progress */}
          <div className="vp-progress">
            <div className="vp-track">
              <div className="vp-fill" ref={progressFillRef} />
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
