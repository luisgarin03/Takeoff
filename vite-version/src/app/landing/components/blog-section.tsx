"use client"

import { ArrowRight } from "lucide-react"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useSiteSection } from "@/lib/site-content"

export function BlogSection() {
  const section = useSiteSection("blog")
  const blogs = section.items.filter(blog => blog.published !== false)
  return (
    <section id="blog" className="py-24 sm:py-32 bg-muted/50">
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

        {/* Blog Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {blogs.map((blog, index) => (
            <Card key={index} className="overflow-hidden py-0">
              <div className="aspect-video">
                <img
                  src={String(blog.image || "")}
                  alt={String(blog.imageAlt || blog.title || "")}
                  className="size-full object-cover dark:invert dark:brightness-[0.95]"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <CardHeader className="gap-3 px-6 pt-6">
                <p className="text-xs tracking-widest text-muted-foreground uppercase">
                  {String(blog.category || "")}
                </p>
                <CardTitle className="text-xl font-bold">
                  {String(blog.title || "")}
                </CardTitle>
                <CardDescription className="text-base">
                  {String(blog.description || "")}
                </CardDescription>
              </CardHeader>
              <CardFooter className="px-6 pb-6">
                <a
                  href={String(blog.href || "#blog")}
                  onClick={blog.content ? (e) => { e.preventDefault(); const el=e.currentTarget.closest("article")?.querySelector("[data-blog-content]"); el?.classList.toggle("hidden") } : undefined}
                  className="inline-flex items-center gap-2 text-primary hover:underline cursor-pointer"
                >
                  {String(blog.linkLabel || (blog.content ? "Read Article" : "Learn More"))}
                  <ArrowRight className="size-4" />
                </a>
                {blog.content && <div data-blog-content className="hidden whitespace-pre-wrap px-6 pb-6 text-sm text-muted-foreground">{String(blog.content)}</div>}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
