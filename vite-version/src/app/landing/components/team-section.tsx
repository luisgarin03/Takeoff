"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card"
import { CardDecorator } from "@/components/ui/card-decorator"
import { useSiteSection } from "@/lib/site-content"

export function TeamSection() {
  const section=useSiteSection("team")
  const team=section.items
  return (
    <section id="team" className="py-24 sm:py-32">
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

        {/* Team Grid */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
          {team.map((member, index) => (
            <Card key={index} className="shadow-xs py-2">
              <CardContent className="p-4">
                <div className="text-center">
                  {/* Avatar */}
                  <div className="flex justify-center mb-4">
                    <CardDecorator>
                      <Avatar className="size-24 border shadow-lg">
                        <AvatarImage
                          src={String(member.image)}
                          alt={String(member.imageAlt || member.name)}
                          className="object-cover"
                        />
                        <AvatarFallback aria-hidden="true" className="bg-muted text-muted-foreground">
                          <svg viewBox="0 0 100 100" className="size-full" fill="currentColor">
                            <circle cx="50" cy="33" r="16" />
                            <path d="M12 96c3-22 18-35 38-35s35 13 38 35H12Z" />
                          </svg>
                        </AvatarFallback>
                      </Avatar>
                    </CardDecorator>
                  </div>

                  {/* Name and Role */}
                  <CardTitle className="mb-1 text-lg">{String(member.name || "")}</CardTitle>
                  <CardDescription className="mb-3 font-medium text-primary">
                    {String(member.role || "")}
                  </CardDescription>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {String(member.description || "")}
                  </p>

                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
