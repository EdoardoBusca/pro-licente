"use client"

import { useState } from "react"

export function InfoTip({ text, side = "top" }: { text: string; side?: "top" | "bottom" }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1.5 align-middle">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-[17px] h-[17px] rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center cursor-help text-[10px] font-bold select-none hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors shrink-0"
      >
        ?
      </span>
      {show && (
        <span
          className={`absolute left-1/2 -translate-x-1/2 w-64 rounded-lg bg-[#0F172A] text-white text-xs px-3 py-2.5 leading-relaxed shadow-xl z-50 pointer-events-none whitespace-normal ${
            side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          }`}
        >
          {text}
          <span
            className={`absolute left-1/2 -translate-x-1/2 border-[5px] border-transparent ${
              side === "bottom"
                ? "bottom-full border-b-[#0F172A]"
                : "top-full border-t-[#0F172A]"
            }`}
          />
        </span>
      )}
    </span>
  )
}
