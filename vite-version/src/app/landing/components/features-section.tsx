"use client"

import {
  CalendarDays,
  Zap,
  Eye,
  ArrowRight,
  Link2,
  Package,
  Crown,
  Layout,
  ListChecks,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Image3D } from "@/components/image-3d"
import { useSiteContent, useSiteSection } from "@/lib/site-content"


export function FeaturesSection() {
  const section = useSiteSection("features")
  const content = useSiteContent()
  const iconMap:Record<string,typeof Package>={CalendarDays,Zap,Eye,ArrowRight,Link2,Package,Crown,Layout,ListChecks}
  const mainFeatures = section.items.map(item=>({...item,icon:iconMap[String(item.icon)]||Package})) as Array<{title?:string;description?:string;icon:typeof Package}>
  const secondaryFeatures = section.secondaryItems.map((item:Record<string,any>)=>({...item,icon:iconMap[String(item.icon)]||CalendarDays})) as Array<{title?:string;description?:string;icon:typeof Package}>
  return (
    <section id="features" className="py-24 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">
            {section.eyebrow}
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            {section.title}
          </h2>
          <p className="text-lg text-muted-foreground">
            {section.description}
          </p>
        </div>

        {/* First Feature Section */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16 mb-24">
          {/* Left Image */}
          <Image3D lightSrc={section.image} darkSrc={section.image} alt={section.imageAlt} direction="left" />
          {/* Right Content */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                {section.primaryTitle}
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                {section.primaryDescription}
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {mainFeatures.map((feature, index) => (
                <li
                  key={index}
                  className="group hover:bg-accent/5 flex items-start gap-3 p-2 rounded-lg transition-colors"
                >
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon
                      className="size-5 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <h3 className="text-foreground font-medium">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {feature.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-4 pe-4 pt-2"><Button size="lg" nativeButton={false} render={<a href={content.appUrl} />}>{section.primaryButton} <ArrowRight className="ms-2 size-4" aria-hidden="true" /></Button><Button size="lg" variant="outline" nativeButton={false} render={<a href={section.primarySecondaryHref} />}>{section.primarySecondaryButton}</Button></div>

          </div>
        </div>

        {/* Second Feature Section - Flipped Layout */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          {/* Left Content */}
          <div className="flex flex-col gap-6 order-2 lg:order-1">
            <div className="flex flex-col gap-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                {section.secondaryTitle}
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                {section.secondaryDescription}
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {secondaryFeatures.map((feature, index) => (
                <li
                  key={index}
                  className="group hover:bg-accent/5 flex items-start gap-3 p-2 rounded-lg transition-colors"
                >
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon
                      className="size-5 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <h3 className="text-foreground font-medium">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {feature.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-4 pt-2"><Button size="lg" nativeButton={false} render={<a href={content.appUrl} />}>{section.secondaryButton} <ArrowRight className="ms-2 size-4" aria-hidden="true" /></Button><Button size="lg" variant="outline" nativeButton={false} render={<a href={section.secondarySecondaryHref} />}>{section.secondarySecondaryButton}</Button></div>
          </div>
          {/* Right Image */}
          <Image3D
            lightSrc={section.secondaryImage}
            darkSrc={section.secondaryImage}
            alt={section.secondaryImageAlt}
            direction="right"
            className="order-1 lg:order-2"
          />
        </div>
      </div>
    </section>
  )
}
