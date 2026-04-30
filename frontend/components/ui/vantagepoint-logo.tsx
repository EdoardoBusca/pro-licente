interface VantagePointLogoProps {
  size?: number
  className?: string
  /** White version for dark backgrounds */
  inverted?: boolean
}

export function VantagePointLogo({ size = 32, className = "", inverted = false }: VantagePointLogoProps) {
  const color = inverted ? "#FFFFFF" : "#0F172A"
  const fadeColor = inverted ? "rgba(255,255,255,0)" : "rgba(15,23,42,0)"

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={`vp-grad-${inverted ? "inv" : "std"}`} x1="50" y1="90" x2="50" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="65%" stopColor={color} stopOpacity="0.6" />
          <stop offset="100%" stopColor={fadeColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── V-shaped strokes, outermost → innermost ───────────────────────── */}
      {/* Each pair of arms fans from the apex (50, 92) outward */}
      {[
        { lx: 5,  ly: 10, rx: 95, ry: 10 },
        { lx: 14, ly: 10, rx: 86, ry: 10 },
        { lx: 23, ly: 10, rx: 77, ry: 10 },
        { lx: 32, ly: 10, rx: 68, ry: 10 },
        { lx: 41, ly: 10, rx: 59, ry: 10 },
        { lx: 50, ly: 5,  rx: 50, ry: 5  },  // center arrow
      ].map(({ lx, ly, rx, ry }, i) => (
        <path
          key={i}
          d={`M ${lx} ${ly} L 50 92 L ${rx} ${ry}`}
          stroke={`url(#vp-grad-${inverted ? "inv" : "std"})`}
          strokeWidth={i === 5 ? 3.5 : 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* ── Arrow tips ────────────────────────────────────────────────────── */}
      {/* Left tip */}
      <polyline
        points="0,18 5,10 12,14"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Center tip */}
      <polyline
        points="44,12 50,5 56,12"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Right tip */}
      <polyline
        points="88,14 95,10 100,18"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
