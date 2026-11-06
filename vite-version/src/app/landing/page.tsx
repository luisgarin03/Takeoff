import { Ecosystem } from "@/components/ecosystem"
"use client"

import React from "react"
import { LandingNavbar } from "./components/navbar"
import { HeroSection } from "./components/hero-section"
import { LogoCarousel } from "./components/logo-carousel"
import { StatsSection } from "./components/stats-section"
import { FeaturesSection } from "./components/features-section"
import { TeamSection } from "./components/team-section"
import { TestimonialsSection } from "./components/testimonials-section"
import { BlogSection } from "./components/blog-section"
import { PricingSection } from "./components/pricing-section"
import { CTASection } from "./components/cta-section"
import { ContactSection } from "./components/contact-section"
import { FaqSection } from "./components/faq-section"
import { LandingFooter } from "./components/footer"
import {
  LandingThemeCustomizer,
  LandingThemeCustomizerTrigger,
} from "./components/landing-theme-customizer"
import { AboutSection } from "./components/about-section"
import { SiteContentProvider, useSiteContent } from "@/lib/site-content"

export function LandingPageContent({preview=false}:{preview?:boolean}) {
  const [themeCustomizerOpen, setThemeCustomizerOpen] = React.useState(false)
  const content = useSiteContent()
  const isVisible = (id: string) => content.sections.find(section => section.id === id)?.visible !== false

  return (
    <div className="estimating-landing min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <LandingNavbar preview={preview} />

      {/* Main Content */}
      <main>
        <HeroSection />
        <Ecosystem />
        {isVisible("logos") && <LogoCarousel />}
        {isVisible("stats") && <StatsSection />}
        {isVisible("about") && <AboutSection />}
        {isVisible("features") && <FeaturesSection />}
        {isVisible("team") && <TeamSection />}
        {isVisible("pricing") && <PricingSection />}
        {isVisible("testimonials") && <TestimonialsSection />}
        {isVisible("blog") && <BlogSection />}
        {isVisible("faq") && <FaqSection />}
        {isVisible("cta") && <CTASection />}
        {isVisible("contact") && <ContactSection />}
      </main>

      {/* Footer */}
      {isVisible("footer") && <LandingFooter />}

      {/* Theme Customizer */}
      {preview && <><LandingThemeCustomizerTrigger
        onClick={() => setThemeCustomizerOpen(true)}
      />
      <LandingThemeCustomizer
        open={themeCustomizerOpen}
        onOpenChange={setThemeCustomizerOpen}
      /></>}
    </div>
  )
}
export default function LandingPage({preview=false}:{preview?:boolean}) { return <SiteContentProvider><LandingPageContent preview={preview}/></SiteContentProvider> }
