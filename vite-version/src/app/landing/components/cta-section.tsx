"use client"

import { ArrowRight, TrendingUp, Package } from "lucide-react"
import { Github } from "@/components/icons/brand-icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useSiteSection, useSiteContent } from "@/lib/site-content"

export function CTASection() {
  const section = useSiteSection("cta")
  const content = useSiteContent()
  const href = (value: unknown) => String(value || "#features") === "app" ? content.appUrl : String(value || "#features")
  return (
    <section className="py-16 lg:py-24 bg-muted/80">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <div className="flex flex-col gap-8">
              {/* Badge and Stats */}
              <div className="flex flex-col items-center gap-4">
                <Badge variant="outline" className="flex items-center gap-2">
                  <TrendingUp />
                  {section.eyebrow}
                </Badge>

                <div className="text-muted-foreground flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <div className="size-2 rounded-full bg-success" />
                    {String(section.items[0]?.label || "Start your next project")}
                  </span>
                  <Separator orientation="vertical" className="h-4! data-vertical:self-center" />
                  <span>{String(section.items[1]?.label || "Plans, takeoffs, estimates")}</span>
                  <Separator orientation="vertical" className="h-4! data-vertical:self-center" />
                  <span>{String(section.items[2]?.label || "In one workspace")}</span>
                </div>
              </div>

              {/* Main Content */}
              <div className="flex flex-col gap-6">
                <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                  {section.title}
                </h1>

                <p className="text-muted-foreground mx-auto max-w-2xl text-balance lg:text-xl">
                  {section.description}
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col justify-center gap-4 sm:flex-row sm:gap-6">
                <Button
                  size="lg"
                  className="cursor-pointer px-8 py-6 text-lg font-medium"
                  nativeButton={false}
                  render={
                    <a
                      href={href(section.items[0]?.href)}
                    />
                  }
                >
                  <Package className="size-5" data-icon="inline-start" />
                  {String(section.items[0]?.label || "Launch ESTIMATING")}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="cursor-pointer px-8 py-6 text-lg font-medium group"
                  nativeButton={false}
                  render={
                    <a
                      href={href(section.items[1]?.href)}
                    />
                  }
                >
                  <Github className="size-5" data-icon="inline-start" />
                  {String(section.items[1]?.label || "Explore features")}
                  <ArrowRight
                    className="transition-transform group-hover:translate-x-1"
                    data-icon="inline-end"
                  />
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-success me-1" />

                  <span>{String(section.items[2]?.label || "Built for construction work")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-info me-1" />

                  <span>{String(section.items[3]?.label || "Plans, takeoffs, estimates")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-warning me-1" />

                  <span>{String(section.items[4]?.label || "Made for your workflow")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
