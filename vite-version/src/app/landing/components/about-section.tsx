"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CardDecorator } from "@/components/ui/card-decorator"
import { Code, Palette, Layout, Crown } from "lucide-react"
import { Github } from "@/components/icons/brand-icons"
import { useSiteSection } from "@/lib/site-content"

export function AboutSection() {
  const section=useSiteSection("about")
  const iconMap:Record<string,typeof Code>={Code,Palette,Layout,Crown}
  const values=section.items.map(item=>({...item,icon:iconMap[String(item.icon)]||Code})) as Array<{title?:string;description?:string;icon:typeof Code}>
  return (
    <section id="about" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-4xl text-center mb-16">
          <Badge variant="outline" className="mb-4">
            {section.eyebrow}
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
            {section.title}
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            {section.description}
          </p>
        </div>

        {/* Modern Values Grid with Enhanced Design */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-4 mb-12">
          {values.map((value, index) => (
            <Card key={index} className="group shadow-xs py-2">
              <CardHeader className="items-center p-8 text-center">
                <CardDecorator>
                  <value.icon className="size-6" aria-hidden />
                </CardDecorator>
                <CardTitle className="mt-6 text-balance">
                  {value.title}
                </CardTitle>
                <CardDescription className="mt-3">
                  {value.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Call to Action */}
        <div className="mt-16 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="text-muted-foreground">
              {section.closingLine}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="cursor-pointer"
              nativeButton={false}
              render={
                <a
                  href={section.primaryHref}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Github data-icon="inline-start" />
              {section.primaryButton}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="cursor-pointer"
              nativeButton={false}
              render={
                <a
                  href={section.secondaryHref}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              {section.secondaryButton}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
