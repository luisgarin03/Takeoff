import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useSiteSection } from "@/lib/site-content"

type Benefit = {
  category: string
  title: string
  description: string
}

export function TestimonialsSection() {
  const section = useSiteSection("testimonials")
  const benefits = section.items as Array<Benefit>
  return (
    <section id="testimonials" className="py-24 sm:py-32">
      <div className="container mx-auto px-8 sm:px-6">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <Badge variant="outline" className="mb-4">
            {section.eyebrow}
          </Badge>
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {section.title}
          </h2>
          <p className="text-lg text-muted-foreground">
            {section.description}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {benefits.map((benefit, index) => (
            <Card key={index} className="h-full shadow-none">
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
