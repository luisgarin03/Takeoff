"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, MessageCircle, BookOpen, LifeBuoy } from "lucide-react"
import { useSiteSection } from "@/lib/site-content"
import { useState } from "react"

const contactFormSchema = z.object({
  firstName: z.string().min(2, {
    message: "First name must be at least 2 characters.",
  }),
  lastName: z.string().min(2, {
    message: "Last name must be at least 2 characters.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  subject: z.string().min(5, {
    message: "Subject must be at least 5 characters.",
  }),
  message: z.string().min(10, {
    message: "Message must be at least 10 characters.",
  }),
})

export function ContactSection() {
  const section = useSiteSection("contact")
  const [submissionNotice, setSubmissionNotice] = useState("")
  const form = useForm<z.infer<typeof contactFormSchema>>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      subject: "",
      message: "",
    },
  })

  function onSubmit(values: z.infer<typeof contactFormSchema>) {
    const subject = encodeURIComponent(values.subject)
    const body = encodeURIComponent(`Name: ${values.firstName} ${values.lastName}\nEmail: ${values.email}\n\n${values.message}`)
    window.location.href = `mailto:fernando@estimating.studio?subject=${subject}&body=${body}`
    setSubmissionNotice("Your email app should open with your message. Send it there to reach the ESTIMATING team. If it does not open, email fernando@estimating.studio.")
  }

  return (
    <section id="contact" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
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

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Contact Options */}
          <div className="flex flex-col gap-6 order-2 lg:order-1">
            {section.items.filter(item => !/github|discord/i.test(`${item.title || ""} ${item.label || ""} ${item.href || ""}`)).map((item, index) => {
              const Icon = String(item.icon) === "BookOpen" ? BookOpen : String(item.icon) === "MessageCircle" ? MessageCircle : LifeBuoy
              return <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader><CardTitle className="flex items-center gap-2"><Icon className="size-5 text-primary" />{String(item.title || "Contact")}</CardTitle></CardHeader>
                <CardContent><p className="text-muted-foreground mb-3">{String(item.description || "")}</p><Button variant="outline" size="sm" className="cursor-pointer" nativeButton={false} render={<a href={/faq/i.test(String(item.title || item.label || "")) ? "/landing#faq" : String(item.href || "#contact")} />}>{String(item.label || "Contact")}</Button></CardContent>
              </Card>
            })}
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="size-5" />
                  Send us a message
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="flex flex-col gap-6"
                >
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <Controller
                      control={form.control}
                      name="firstName"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="contact-section-first-name">
                            First name
                          </FieldLabel>

                          <Input
                            id="contact-section-first-name"
                            aria-invalid={fieldState.invalid}
                            placeholder="John"
                            {...field}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="lastName"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="contact-section-last-name">
                            Last name
                          </FieldLabel>

                          <Input
                            id="contact-section-last-name"
                            aria-invalid={fieldState.invalid}
                            placeholder="Doe"
                            {...field}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                  </FieldGroup>
                  <FieldGroup>
                    <Controller
                      control={form.control}
                      name="email"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="contact-section-email">
                            Email
                          </FieldLabel>

                          <Input
                            id="contact-section-email"
                            aria-invalid={fieldState.invalid}
                            type="email"
                            placeholder="john@example.com"
                            {...field}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="subject"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="contact-section-subject">
                            Subject
                          </FieldLabel>

                          <Input
                            id="contact-section-subject"
                            aria-invalid={fieldState.invalid}
                            placeholder="Question about a takeoff, estimate, account, or something else..."
                            {...field}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="message"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="contact-section-message">
                            Message
                          </FieldLabel>

                          <Textarea
                            id="contact-section-message"
                            aria-invalid={fieldState.invalid}
                            placeholder="Tell us what you were working on and how we can help..."
                            rows={10}
                            className="min-h-50"
                            {...field}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                  </FieldGroup>
                  <Button type="submit" className="w-full cursor-pointer">
                    Continue in email app
                  </Button>
                  {submissionNotice && <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{submissionNotice}</p>}
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
