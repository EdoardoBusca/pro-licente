"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

interface AnimatedTabItem {
  value: string
  label: string
  icon: ReactNode
}

interface AnimatedTabsListProps {
  items: AnimatedTabItem[]
  activeTab: string
}

// Sliding-pill tab bar: a single shared layoutId background morphs between
// whichever trigger is active, instead of each button toggling its own bg.
export function AnimatedTabsList({ items, activeTab }: AnimatedTabsListProps) {
  return (
    <TabsList className="mb-6 bg-card border border-border p-1.5 rounded-xl h-auto gap-1">
      {items.map(({ value, label, icon }) => {
        const isActive = activeTab === value
        return (
          <TabsTrigger
            key={value}
            value={value}
            className={cn(
              "relative isolate gap-2 px-4 py-2.5 rounded-lg transition-colors duration-200",
              "data-[state=active]:bg-transparent data-[state=active]:shadow-none",
              isActive ? "text-background" : "text-foreground/70 hover:text-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="active-tab-pill"
                className="absolute inset-0 rounded-lg bg-foreground -z-10"
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {icon}
              {label}
            </span>
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
