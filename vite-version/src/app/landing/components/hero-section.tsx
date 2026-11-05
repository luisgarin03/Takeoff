"use client"

import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DotPattern } from "@/components/dot-pattern"

import { useHeroImage } from "@/lib/website-media"
import { useSiteContent, useSiteSection } from "@/lib/site-content"
export function HeroSection() {
  const section = useSiteSection("hero")
  const content = useSiteContent()
  const fallbackImage = useHeroImage()
  const heroImage = section.image || fallbackImage
  const title = section.title.split("\n")
  return (
    <section
      id="hero"
      className="relative overflow-hidden bg-gradient-to-b from-background to-background/80 pt-16 sm:pt-20 pb-16"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0">
        {/* Dot pattern overlay using reusable component */}
        <DotPattern className="opacity-100" size="md" fadeStyle="ellipse" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="mx-auto max-w-4xl text-center">
          {/* Announcement Badge */}
          <div className="mb-8 flex justify-center">
            <Badge variant="outline" className="px-4 py-2 border-foreground">
              {section.eyebrow}
            </Badge>
          </div>

          {/* Main Headline */}
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            {title[0]}<br />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {title.slice(1).join(" ")}
            </span>
          </h1>

          {/* Subheading */}
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            {section.description}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="text-base cursor-pointer"
              nativeButton={false}
              render={<a href={String(section.items[0]?.href || "app") === "app" ? content.appUrl : String(section.items[0]?.href)} />}
            >
              {section.items[0]?.label || "Open ESTIMATING"}
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="text-base cursor-pointer"
              nativeButton={false}
              render={<a href={String(section.items[1]?.href || "#features")} />}
            >
              {section.items[1]?.label || "Explore the workflow"}
            </Button>
          </div>
        </div>

        {/* Hero Image/Visual */}
        <div className="mx-auto mt-20 max-w-6xl">
          <div className="relative group">
            {/* Top background glow effect - positioned above the image */}
            <div className="panel-light panel-light-hero" aria-hidden="true"><span /><span /></div>

            <div className="relative rounded-xl border bg-card shadow-2xl">
              <img
                src={heroImage}
                alt={section.imageAlt}


                className="w-full rounded-xl h-auto block"
              />

            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
