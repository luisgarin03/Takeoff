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

const team = [
  {
    id: 1,
    name: "Luis Garin",
    role: "Founder · Developer / Engineer",
    description: "Founder building the ESTIMATING platform.",
    image:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=240&auto=format&fit=crop",
    fallback: "LG",
  },
  {
    id: 2,
    name: "Marcus Coleman",
    role: "Developer",
    description: "Develops features for the ESTIMATING platform.",
    image:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=240&auto=format&fit=crop",
    fallback: "MC",
  },
  {
    id: 3,
    name: "Lauren Lee",
    role: "Marketer / Finance",
    description: "Supports ESTIMATING's marketing and finance.",
    image:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=240&auto=format&fit=crop",
    fallback: "LL",
  },
]

export function TeamSection() {
  return (
    <section id="team" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-4xl text-center mb-16">
          <Badge variant="outline" className="mb-4">
            Our Team
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
            Meet our team
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Meet the people building ESTIMATING across product development,
            engineering, marketing, and finance.
          </p>
        </div>

        {/* Team Grid */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
          {team.map((member) => (
            <Card key={member.id} className="shadow-xs py-2">
              <CardContent className="p-4">
                <div className="text-center">
                  {/* Avatar */}
                  <div className="flex justify-center mb-4">
                    <CardDecorator>
                      <Avatar className="size-24 border shadow-lg">
                        <AvatarImage
                          src={member.image}
                          alt={`Illustrative portrait; not a photo of ${member.name}`}
                          className="object-cover"
                        />
                        <AvatarFallback className="text-lg font-semibold">
                          {member.fallback}
                        </AvatarFallback>
                      </Avatar>
                    </CardDecorator>
                  </div>

                  {/* Name and Role */}
                  <CardTitle className="mb-1 text-lg">{member.name}</CardTitle>
                  <CardDescription className="mb-3 font-medium text-primary">
                    {member.role}
                  </CardDescription>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {member.description}
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
