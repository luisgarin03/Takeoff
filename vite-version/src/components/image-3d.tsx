"use client"

import { cn, assetUrl } from "@/lib/utils"

interface Image3DProps {
  lightSrc: string
  darkSrc: string
  alt: string
  className?: string
  direction?: "left" | "right"
}

export function Image3D({
  lightSrc,
  darkSrc,
  alt,
  className,
  direction = "left",
}: Image3DProps) {
  const isRight = direction === "right"
  const source = (value: string) => /^https?:\/\//i.test(value) ? value : assetUrl(value)

  return (
    <div className={cn("group relative aspect-[4/3] w-full", className)}>
      <div className="size-full perspective-distant transform-3d">
        {/* Animated background glow */}
        <div className={cn("panel-light", isRight && "panel-light-reverse")} aria-hidden="true"><span /><span /></div>

        {/* Main 3D container */}
        <div className="relative size-full transform-3d group-hover:rotate-x-8 group-hover:rotate-y-12 group-hover:translate-z-16 transition-all duration-700 ease-out">
          {/* Depth layers for 3D effect */}
          <div className="absolute inset-0 translate-y-4 translate-x-2 -translate-z-8 rounded-2xl">
            <div className="size-full rounded-2xl bg-gradient-to-br from-primary/10 via-background/40 to-secondary/10 shadow-xl" />
          </div>

          {/* Main image container */}
          <div className="relative z-10 size-full rounded-2xl overflow-hidden bg-card shadow-2xl shadow-primary/20">
            {/* Shimmer effect */}
            <div
              className={cn(
                "absolute inset-0 z-20 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 transition-transform duration-1000 ease-out pointer-events-none",
                isRight
                  ? "translate-x-full group-hover:-translate-x-full"
                  : "-translate-x-full group-hover:translate-x-full"
              )}
            />

            {/* Content fade mask */}
            <div
              className={cn(
                "absolute inset-0 z-15 pointer-events-none",
                isRight
                  ? "bg-linear-to-l from-background from-0% via-background/30 via-2% to-transparent to-6%"
                  : "bg-linear-to-r from-background from-0% via-background/30 via-2% to-transparent to-6%"
              )}
            />

            {/* Theme-aware images */}
            <img
              src={source(lightSrc)}
              alt={`${alt} - Light Mode`}
              className={cn(
                "block size-full object-contain scale-90 dark:hidden transition-transform duration-700 group-hover:scale-95",
                "object-center"
              )}
              loading="lazy"
              decoding="async"
            />

            <img
              src={source(darkSrc)}
              alt={`${alt} - Dark Mode`}
              className={cn(
                "hidden dark:block size-full object-contain scale-90 transition-transform duration-700 group-hover:scale-95",
                "object-center"
              )}
              loading="lazy"
              decoding="async"
            />

            {/* Border highlight */}
            <div className="absolute inset-0 rounded-2xl ring-1 ring-white/20 dark:ring-white/10 group-hover:ring-primary/40 transition-all duration-500" />
          </div>
        </div>
      </div>
    </div>
  )
}
