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


const mainFeatures = [
  {
    icon: Package,
    title: "PDFs & Images",
    description:
      "Add PDFs and images to keep your project references together.",
  },
  {
    icon: Crown,
    title: "Organize Your Files",
    description:
      "Arrange files on the board in a way that makes sense for your project.",
  },
  {
    icon: Layout,
    title: "View Files Together",
    description: "View your documents and images in one visual workspace.",
  },
  {
    icon: Zap,
    title: "Notes & Navigation",
    description: "Paste text or add notes, then pan and zoom to explore the board.",
  },
]

const secondaryFeatures = [
  {
    icon: CalendarDays,
    title: "Your Calendar List",
    description:
      "See your connected Google calendars and choose which schedule to view.",
  },
  {
    icon: ListChecks,
    title: "Events in Context",
    description: "Review upcoming events alongside your estimating workflow.",
  },
  {
    icon: Eye,
    title: "Read-Only Access",
    description: "View Google Calendar events without changing the originals.",
  },
  {
    icon: Link2,
    title: "Google Calendar Connection",
    description:
      "Connect your Google account and authorize access to your calendars and events.",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 sm:py-32 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">
            Project Whiteboard
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Organize your files. See the whole picture.
          </h2>
          <p className="text-lg text-muted-foreground">
            Bring PDFs, images, and notes into one visual workspace so your project files are easier to organize and view.
          </p>
        </div>

        {/* First Feature Section */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16 mb-24">
          {/* Left Image */}
          <Image3D lightSrc="whiteboard-workspace.png" darkSrc="whiteboard-workspace.png" alt="ESTIMATING Whiteboard with controls to add PDFs, images, and notes, and pan or zoom the workspace" direction="left" />
          {/* Right Content */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                A visual home for your project files
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                Use Whiteboard to organize files and view them together. Add PDFs and images, paste text, and arrange your references across the board. Pan, zoom, or fit the view to move from individual details to the bigger picture.
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

            <div className="flex flex-col sm:flex-row gap-4 pe-4 pt-2"><Button size="lg" nativeButton={false} render={<a href={import.meta.env.VITE_ESTIMATING_APP_URL || "https://app.estimating.studio"} />}>Open ESTIMATING <ArrowRight className="ms-2 size-4" aria-hidden="true" /></Button><Button size="lg" variant="outline" nativeButton={false} render={<a href="#contact" />}>Ask about Whiteboard</Button></div>

          </div>
        </div>

        {/* Second Feature Section - Flipped Layout */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          {/* Left Content */}
          <div className="flex flex-col gap-6 order-2 lg:order-1">
            <div className="flex flex-col gap-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Keep your schedule in view
              </h3>
              <p className="text-muted-foreground text-base text-pretty">
                Bring your Google Calendar into ESTIMATING to view your calendars and upcoming events while you work. Keep meetings, site visits, and deadlines in view without switching away from your estimating workspace.
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

            <div className="flex flex-wrap gap-4 pt-2"><Button size="lg" nativeButton={false} render={<a href={import.meta.env.VITE_ESTIMATING_APP_URL || "https://app.estimating.studio"} />}>Open ESTIMATING <ArrowRight className="ms-2 size-4" aria-hidden="true" /></Button><Button size="lg" variant="outline" nativeButton={false} render={<a href="#contact" />}>Ask about Calendar</Button></div>
          </div>
          {/* Right Image */}
          <Image3D
            lightSrc="calendar-preview.svg"
            darkSrc="calendar-preview.svg"
            alt="Illustrative monthly calendar with example drawing review, site visit, and bid deadline events"
            direction="right"
            className="order-1 lg:order-2"
          />
        </div>
      </div>
    </section>
  )
}
