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

type FaqItem = {
  value: string
  question: string
  answer: string
}

const faqItems: FaqItem[] = [
  {
    value: "item-1",
    question: "What can I do with ESTIMATING?",
    answer:
      "Bring PDF plans into one workspace, move between sheets, take off lengths, areas, and counts, add drawing markups, and turn measured quantities into material calculations and estimates.",
  },
  {
    value: "item-2",
    question: "Which takeoff tools are included?",
    answer:
      "ESTIMATING includes length, area, and count takeoffs, plus drawing markups and material calculations. You can keep the quantities and plan references together as you work through the project.",
  },
  {
    value: "item-3",
    question: "What can I put on the Whiteboard?",
    answer:
      "Add PDFs, images, and text notes, arrange them on the board, and pan or zoom to review your references together.",
  },
  {
    value: "item-4",
    question: "Can I save a project and come back to it later?",
    answer:
      "Yes. Cloud Projects are included with ESTIMATING passes. Sign in to your account to return to saved project work. Keep your own backup of important project records as well.",
  },
  {
    value: "item-5",
    question: "Does Google sign-in give ESTIMATING access to Gmail or Calendar?",
    answer:
      "No. Google sign-in is for your ESTIMATING account. Connecting Google Calendar is a separate, optional step that asks for calendar permissions when you choose that feature.",
  },
  {
    value: "item-6",
    question: "What does a pass cost, and can I make a live payment?",
    answer:
      "The 30-day pass is $40 per month, and the annual pass is $400 per year. Both include PDF plans and sheet navigation, takeoffs, markups, material calculations, and Cloud Projects. Subscriptions renew; checkout shows the terms and total. Checkout is currently in test mode and does not accept live payments.",
  },
]

const FaqSection = () => {
  return (
    <section id="faq" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">
            FAQ
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-muted-foreground">
            Answers about plan takeoffs, project files, calendar connections,
            and subscription passes.
          </p>
        </div>

        {/* FAQ Content */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-transparent">
            <div className="p-0">
              <Accordion className="gap-5">
                {faqItems.map((item) => (
                  <AccordionItem
                    key={item.value}
                    value={item.value}
                    className="rounded-md border! bg-transparent"
                  >
                    <AccordionTrigger className="cursor-pointer items-center gap-4 rounded-none bg-transparent py-2 ps-3 pe-4 hover:no-underline data-panel-open:border-b">
                      <div className="flex items-center gap-4">
                        <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                          <CircleHelp className="size-5" />
                        </div>
                        <span className="text-start font-semibold">
                          {item.question}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 bg-transparent">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>

          {/* Contact Support CTA */}
          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">
              Still have questions? We're here to help.
            </p>
            <Button
              className="cursor-pointer"
              nativeButton={false}
              render={<a href="#contact" />}
            >
              Contact Support
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export { FaqSection }
