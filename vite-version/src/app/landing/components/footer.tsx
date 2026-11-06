import { getAppUrl } from "@/lib/utils"
"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"
import { Field, FieldError, FieldGroup } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Logo } from "@/components/logo"
import { Heart } from "lucide-react"
import { useSiteSection, useSiteContent } from "@/lib/site-content"
import { useState } from "react"

const newsletterSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
})

const footerLinks = {
  product: [
    { name: "Features", href: "#features" },
    { name: "Pricing", href: "#pricing" },
  ],
  learn: [
    { name: "About ESTIMATING", href: "#about" },
    { name: "Field notes", href: "#blog" },
  ],
  support: [
    { name: "Help & FAQs", href: "#faq" },
    { name: "Contact us", href: "#contact" },
  ],
  legal: [
    { name: "Privacy", href: getAppUrl("/legal/privacy") },
    { name: "Terms", href: getAppUrl("/legal/terms") },
    { name: "Security", href: getAppUrl("/legal/security") },
    { name: "Status", href: getAppUrl("/legal/status") },
  ],
}

export function LandingFooter() {
  const section = useSiteSection("footer")
  const content = useSiteContent()
  const [submissionNotice, setSubmissionNotice] = useState("")
  const form = useForm<z.infer<typeof newsletterSchema>>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: {
      email: "",
    },
  })

  function onSubmit(values: z.infer<typeof newsletterSchema>) {
    const subject = encodeURIComponent("ESTIMATING product updates")
    const body = encodeURIComponent(`Please add ${values.email} to the ESTIMATING product updates list.`)
    window.location.href = `mailto:fernando@estimating.studio?subject=${subject}&body=${body}`
    setSubmissionNotice("Your email app should open with a request to receive product updates. Send the email to subscribe. If it does not open, email fernando@estimating.studio.")
  }

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Newsletter Section */}
        <div className="mb-16">
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="text-2xl font-bold mb-4">Product updates from ESTIMATING</h3>
            <p className="text-muted-foreground mb-6">
              Get occasional notes about plan review, takeoffs, and estimating. Your address is only added after you send the email request.
            </p>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-2 max-w-md mx-auto sm:flex-row"
            >
              <FieldGroup>
                <Controller
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="flex-1">
                      <Input
                        id="footer-email"
                        aria-invalid={fieldState.invalid}
                        type="email"
                        placeholder="Enter your email"
                        {...field}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
              <Button type="submit" className="cursor-pointer">
                Request updates
              </Button>
            </form>
            {submissionNotice && <p className="mt-3 text-sm text-muted-foreground" role="status" aria-live="polite">{submissionNotice}</p>}
          </div>
        </div>

        {/* Main Footer Content */}
        <div className="grid gap-8 grid-cols-4 lg:grid-cols-5">
          {/* Brand Column */}
          <div className="col-span-4 lg:col-span-2 max-w-2xl">
            <div className="flex items-center gap-2 mb-4 max-lg:justify-center">
              <a
                href="/"
                className="flex items-center gap-2 cursor-pointer"
              >
                <Logo size={32} />
                <span className="font-bold text-xl brand-text-shimmer">{content.brand}</span>
              </a>
            </div>
            <p className="text-muted-foreground mb-6 max-lg:text-center max-lg:flex max-lg:justify-center">
              {section.description}
            </p>
          </div>

          {/* Links Columns */}
          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="flex flex-col gap-3">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="font-semibold mb-4">Learn</h4>
            <ul className="flex flex-col gap-3">
              {footerLinks.learn.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="flex flex-col gap-3">
              {footerLinks.support.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="flex flex-col gap-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Bottom Footer */}
        <div className="flex flex-col lg:flex-row justify-between items-center gap-2">
          <div className="flex flex-col sm:flex-row items-center gap-2 text-muted-foreground text-sm">
            <div className="flex items-center gap-1">
              <span>Made with</span>
              <Heart className="size-4 text-destructive fill-current" />
              <span>by</span>
              <a
                href="/"
                className="font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
              >
                {content.brand}
              </a>
            </div>
            <span className="hidden sm:inline">•</span>
            <span>
              {section.copyrightLine || "Built for construction takeoffs and estimates."}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-4 md:mt-0">
            <a
              href={getAppUrl("/legal/privacy")}
              className="hover:text-foreground transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href={getAppUrl("/legal/terms")}
              className="hover:text-foreground transition-colors"
            >
              Terms of Service
            </a>
            <a
              href={getAppUrl("/legal/privacy")}
              className="hover:text-foreground transition-colors"
            >
              Cookies & storage
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
