"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

export function InfoTip({ text, side = "top" }: { text: string; side?: "top" | "bottom" }) {
  const [show, setShow] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLSpanElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleEnter = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setShow(true)
  }

  const tooltipStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
        zIndex: 99999,
        ...(side === "bottom"
          ? { top: rect.bottom + 8 }
          : { top: rect.top - 8, transform: "translateX(-50%) translateY(-100%)" }),
      }
    : { display: "none" }

  return (
    <span className="inline-flex items-center ml-1.5 align-middle">
      <span
        ref={btnRef}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
        className="w-[17px] h-[17px] rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center cursor-help text-[10px] font-bold select-none hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors shrink-0"
      >
        ?
      </span>
      {show && mounted && createPortal(
        <span
          style={tooltipStyle}
          className="w-64 rounded-lg bg-[#0F172A] text-white text-xs px-3 py-2.5 leading-relaxed shadow-xl pointer-events-none whitespace-normal"
        >
          {text}
          <span
            className={`absolute left-1/2 -translate-x-1/2 border-[5px] border-transparent ${
              side === "bottom" ? "bottom-full border-b-[#0F172A]" : "top-full border-t-[#0F172A]"
            }`}
          />
        </span>,
        document.body
      )}
    </span>
  )
}
