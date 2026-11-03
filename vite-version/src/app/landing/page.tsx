"use client"

import { Ecosystem } from "@/components/ecosystem"
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

export default function LandingPage({preview=false}:{preview?:boolean}) {
  const [themeCustomizerOpen, setThemeCustomizerOpen] = React.useState(false)

  return (
    <div className="estimating-landing min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <LandingNavbar preview={preview} />

      {/* Main Content */}
      <main>
        <HeroSection />
        <Ecosystem />
        <LogoCarousel />
        <StatsSection />
        <AboutSection />
        <FeaturesSection />
        <TeamSection />
        <PricingSection />
        <TestimonialsSection />
        <BlogSection />
        <FaqSection />
        <CTASection />
        <ContactSection />
      </main>

      {/* Footer */}
      <LandingFooter />

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
