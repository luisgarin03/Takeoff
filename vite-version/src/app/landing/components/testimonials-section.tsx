import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Benefit = {
  category: string
  title: string
  description: string
}

const benefits: Benefit[] = [
  {
    category: "Project organization",
    title: "Keep takeoff details together",
    description:
      "Keep drawings, measurements, markups, and project information together so details are easier to find and review.",
  },
  {
    category: "Easy to use",
    title: "A clear workspace for plan review",
    description:
      "Drawings, measurement tools, and project controls come together in one focused workspace.",
  },
  {
    category: "Speed",
    title: "Keep estimates moving",
    description:
      "Quick access to takeoff and markup tools helps keep everyday measuring and plan review moving.",
  },
  {
    category: "Growing toolkit",
    title: "More tools for the work",
    description:
      "An expanding set of measurement, markup, and project tools supports more of the takeoff workflow in one place.",
  },
  {
    category: "Engineering foundation",
    title: "Focused modules, built to evolve",
    description:
      "Feature-focused modules give developers a clear foundation for improving the product and adding tools over time.",
  },
  {
    category: "Engineering foundation",
    title: "Reusable patterns across the app",
    description:
      "Shared interface components help keep workflows consistent as new capabilities are added.",
  },
]

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-24 sm:py-32">
      <div className="container mx-auto px-8 sm:px-6">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <Badge variant="outline" className="mb-4">
            Built for construction work
          </Badge>
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Takeoffs that stay organized and moving
          </h2>
          <p className="text-lg text-muted-foreground">
            ESTIMATING brings plan review, measurements, and project tools into
            a straightforward workflow for construction professionals.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {benefits.map((benefit) => (
            <Card key={benefit.title} className="h-full shadow-none">
              <CardHeader>
                <CardDescription className="mb-2 text-xs font-medium uppercase tracking-wider">
                  {benefit.category}
                </CardDescription>
                <CardTitle>{benefit.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {benefit.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
