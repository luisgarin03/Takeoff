import { Link } from "react-router-dom"
import { Check, Scissors } from "lucide-react"
import { useSiteSection } from "@/lib/site-content"
import "./pricing-tickets.css"

export function PricingSection() {
  const section = useSiteSection("pricing")
  const features: string[] = section.features || []

  return (
    <section id="pricing" className="ticket-pricing py-24 sm:py-32 bg-muted/40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-2xl text-center mb-14">
          <p className="text-xs tracking-widest text-muted-foreground mb-4">{section.eyebrow}</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">{section.title}</h2>
          <p className="text-muted-foreground">{section.description}</p>
        </header>
        <div className="ticket-grid">
          {section.items.map((plan, index) => {
            const popular = Boolean(plan.popular)
            const code = String(plan.code || index)
            const amount = String(plan.price)
            const title = String(plan.title || "Pass")
            const checkout = String(plan.href || (popular ? "/checkout?plan=yearly" : "/checkout?plan=monthly"))
            const billing = String(plan.billing || `$${amount} billed ${popular ? "yearly" : "monthly"} · Subscription terms shown at checkout.`)

            return (
              <Link key={code} className="ticket-shadow ticket-link" to={checkout} aria-label={`Checkout: ${title}`}>
                <article className={popular ? "pricing-ticket pricing-ticket-year" : "pricing-ticket"} aria-labelledby={`pass-${code}`}>
                  <header className="ticket-header">
                    <div className="ticket-brand">
                      <span>{section.brand || "ESTIMATING"}</span>
                      <span>{String(plan.badge || (popular ? "BEST VALUE" : "FLEXIBLE ACCESS"))}</span>
                    </div>
                    <p className="ticket-title" aria-hidden="true">Subscription</p>
                    <div className="ticket-perforation" aria-hidden="true"><Scissors size={20} /></div>
                  </header>
                  <div className="ticket-body">
                    <h3 id={`pass-${code}`}>{title}</h3>
                    <p className="ticket-description">{String(plan.description || "")}</p>
                    <div className="ticket-price">${amount}<span>{String(plan.period || "")}</span></div>
                    <ul>
                      {features.map((feature, i) => (
                        <li key={i}><Check size={15} aria-hidden="true" />{feature}</li>
                      ))}
                    </ul>
                    <p className="ticket-billing">{billing}</p>
                  </div>
                  <footer className="ticket-stub">
                    <div><span>{String(section.stubLabel || "ACCESS PASS")}</span><strong>{code}</strong></div>
                    <div className="ticket-barcode" aria-hidden="true" />
                  </footer>
                </article>
              </Link>
            )
          })}
        </div>
        <p className="text-center text-muted-foreground text-sm mt-12">
          {section.contactPrompt || "Have questions?"} <a href="#contact" className="underline underline-offset-4">{section.contactLabel || "Contact our team"}</a>
        </p>
      </div>
    </section>
  )
}
