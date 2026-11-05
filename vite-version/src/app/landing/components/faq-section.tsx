"use client"

import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { useSiteSection } from "@/lib/site-content"

const FaqSection = () => {
  const section = useSiteSection("faq")
  const faqItems = section.items
  return (
    <section id="faq" className="py-24 sm:py-32">
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

        {/* FAQ Content */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-transparent">
            <div className="p-0">
              <Accordion className="gap-5">
                {faqItems.map((item, index) => (
                  <AccordionItem
                    key={index}
                    value={`faq-${index}`}
                    className="rounded-md border! bg-transparent"
                  >
                    <AccordionTrigger className="cursor-pointer items-center gap-4 rounded-none bg-transparent py-2 ps-3 pe-4 hover:no-underline data-panel-open:border-b">
                      <div className="flex items-center gap-4">
                        <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                          <CircleHelp className="size-5" />
                        </div>
                        <span className="text-start font-semibold">
                  {String(item.question || "")}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 bg-transparent">
                      {String(item.answer || "")}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>

          {/* Contact Support CTA */}
          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">{section.contactPrompt || "Still have questions? We're here to help."}</p>
            <Button
              className="cursor-pointer"
              nativeButton={false}
              render={<a href={String(section.contactHref || "#contact")} />}
            >
              {section.contactLabel || "Contact Support"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export { FaqSection }
