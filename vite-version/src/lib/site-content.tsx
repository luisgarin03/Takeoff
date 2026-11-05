import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import { assetUrl } from "@/lib/utils"

export type SiteItem = Record<string, string | number | boolean | null>
export type SiteSection = {
  id: string
  label: string
  visible: boolean
  eyebrow: string
  title: string
  description: string
  icon: string
  image: string
  imageAlt: string
  items: SiteItem[]
  [key: string]: any
}
export type SiteContent = {
  schemaVersion: number
  brand: string
  appUrl: string
  signInLabel: string
  appLabel: string
  pageTitle: string
  metaDescription: string
  nav: SiteItem[]
  sections: SiteSection[]
}

export const defaultSiteContent: SiteContent = {
  schemaVersion: 2,
  brand: "ESTIMATING",
  appUrl: import.meta.env.VITE_ESTIMATING_APP_URL || "https://app.estimating.studio",
  signInLabel: "Sign in",
  appLabel: "Open app",
  pageTitle: "ESTIMATING | Construction takeoffs and estimates",
  metaDescription: "Review PDF plans, measure quantities, add markups, and prepare material estimates with ESTIMATING.",
  nav: [
    { label: "Home", href: "#hero" }, { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" }, { label: "FAQ", href: "#faq" },
  ],
  sections: [
    { id: "hero", label: "Hero", visible: true, eyebrow: "Plans. Takeoffs. Estimates.", title: "Better takeoffs.\nMore confident estimates.", description: "Bring your drawings, measurements, and estimates into one workspace. Move from the first sheet to the final quantity with a clearer view of the work.", icon: "Ruler", image: assetUrl("estimating-blueprint.png"), imageAlt: "ESTIMATING workspace displaying a construction blueprint", items: [{ label: "Open ESTIMATING", href: "app" }, { label: "Explore the workflow", href: "#features" }] },
    { id: "ecosystem", label: "Workspace diagram", visible: true, eyebrow: "THE ESTIMATING ECOSYSTEM", title: "One workspace.\nEvery part of your project.", description: "Follow the connections from drawings to quantities, with your files and schedule close at hand. Select a tool to explore.", caption: "EXPLORE YOUR WORKSPACE", icon: "Sparkles", image: "", imageAlt: "", items: [{ name: "Plans", icon: "FileText", detail: "Start with your PDF drawings. Navigate sheets and keep the right plan in view.", x: 235, y: 175 }, { name: "Takeoff", icon: "Ruler", detail: "Measure lengths, areas, and counts directly on your construction drawings.", x: 500, y: 120 }, { name: "Estimates", icon: "Calculator", detail: "Work from measured quantities toward material calculations and project estimates.", x: 765, y: 225 }, { name: "Whiteboard", icon: "PanelsTopLeft", detail: "Organize PDFs, images, and notes on a visual board, then pan and zoom to review them.", x: 235, y: 395 }, { name: "Calendar", icon: "CalendarDays", detail: "Connect Google Calendar to view your calendars and upcoming events alongside your work.", x: 500, y: 470 }] },
    { id: "logos", label: "Logo carousel", visible: true, eyebrow: "", title: "Trusted by leading companies worldwide", description: "", icon: "Star", image: "", imageAlt: "", items: ["Shopify","Netflix","Spotify","Airbnb","Dropbox","Stripe","Google","Apple","Meta","Tesla","Salesforce"].map(name => ({ name, icon: name.toLowerCase() })) },
    { id: "stats", label: "Statistics", visible: true, eyebrow: "", title: "", description: "", icon: "Star", image: "", imageAlt: "", items: [{ icon: "Package", value: "500+", label: "Components", description: "Ready-to-use blocks" }, { icon: "Download", value: "25K+", label: "Downloads", description: "Trusted worldwide" }, { icon: "Users", value: "10K+", label: "Developers", description: "Active community" }, { icon: "Star", value: "4.9", label: "Rating", description: "User satisfaction" }] },
    { id: "about", label: "About", visible: true, eyebrow: "About ESTIMATING", title: "Built for developers, by developers", description: "We're passionate about creating the best marketplace for shadcn/ui components and templates. Our mission is to accelerate development and help developers build beautiful admin interfaces faster.", closingLine: "❤️ Made with love for the developer community", primaryButton: "", primaryHref: "", secondaryButton: "", secondaryHref: "", icon: "Building2", image: "", imageAlt: "", items: [{ icon: "Code", title: "Developer First", description: "Every component is built with the developer experience in mind, ensuring clean code and easy integration." }, { icon: "Palette", title: "Design Excellence", description: "We maintain the highest design standards, following shadcn/ui principles and modern UI patterns." }, { icon: "Layout", title: "Production Ready", description: "Battle-tested components used in real applications with proven performance and reliability across different environments." }, { icon: "Crown", title: "Premium Quality", description: "Hand-crafted with attention to detail and performance optimization, ensuring exceptional user experience and accessibility." }] },
    { id: "features", label: "Features", visible: true, eyebrow: "Project Whiteboard", title: "Organize your files. See the whole picture.", description: "Bring PDFs, images, and notes into one visual workspace so your project files are easier to organize and view.", icon: "PanelsTopLeft", image: assetUrl("whiteboard-workspace.png"), imageAlt: "ESTIMATING Whiteboard with controls to add PDFs, images, and notes, and pan or zoom the workspace", primaryTitle: "A visual home for your project files", primaryDescription: "Use Whiteboard to organize files and view them together. Add PDFs and images, paste text, and arrange your references across the board. Pan, zoom, or fit the view to move from individual details to the bigger picture.", primaryButton: "Open ESTIMATING", primarySecondaryButton: "Ask about Whiteboard", primarySecondaryHref: "#contact", items: [{ icon: "Package", title: "PDFs & Images", description: "Add PDFs and images to keep your project references together." }, { icon: "Crown", title: "Organize Your Files", description: "Arrange files on the board in a way that makes sense for your project." }, { icon: "Layout", title: "View Files Together", description: "View your documents and images in one visual workspace." }, { icon: "Zap", title: "Notes & Navigation", description: "Paste text or add notes, then pan and zoom to explore the board." }], secondaryTitle: "Keep your schedule in view", secondaryDescription: "Bring your Google Calendar into ESTIMATING to view your calendars and upcoming events while you work. Keep meetings, site visits, and deadlines in view without switching away from your estimating workspace.", secondaryButton: "Open ESTIMATING", secondarySecondaryButton: "Ask about Calendar", secondarySecondaryHref: "#contact", secondaryImage: assetUrl("calendar-preview.svg"), secondaryImageAlt: "Illustrative monthly calendar with example drawing review, site visit, and bid deadline events", secondaryItems: [{ icon: "CalendarDays", title: "Your Calendar List", description: "See your connected Google calendars and choose which schedule to view." }, { icon: "ListChecks", title: "Events in Context", description: "Review upcoming events alongside your estimating workflow." }, { icon: "Eye", title: "Read-Only Access", description: "View Google Calendar events without changing the originals." }, { icon: "Link2", title: "Google Calendar Connection", description: "Connect your Google account and authorize access to your calendars and events." }] },
    { id: "team", label: "Team", visible: true, eyebrow: "Our Team", title: "Meet our team", description: "Meet the people building ESTIMATING across product development, engineering, marketing, and finance.", icon: "Users", image: "", imageAlt: "", items: [{ name: "Luis Garin", role: "Founder · Developer / Engineer", description: "Founder building the ESTIMATING platform.", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=240&auto=format&fit=crop", imageAlt: "Portrait of Luis Garin", icon: "User" }, { name: "Marcus Coleman", role: "Developer", description: "Develops features for the ESTIMATING platform.", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=240&auto=format&fit=crop", imageAlt: "Portrait of Marcus Coleman", icon: "User" }, { name: "Lauren Lee", role: "Marketer / Finance", description: "Supports ESTIMATING's marketing and finance.", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=240&auto=format&fit=crop", imageAlt: "Portrait of Lauren Lee", icon: "User" }] },
    { id: "pricing", label: "Pricing", visible: true, eyebrow: "YOUR PASS TO ESTIMATING", title: "Pick your pass. Start your next project.", description: "The same estimating tools. Choose the subscription that fits your workflow.", icon: "Ticket", image: "", imageAlt: "", features: ["PDF plans and sheet navigation", "Length, area, and count takeoffs", "Drawing markups and annotations", "Material calculations and estimates"], items: [{ title: "Pass for 30 days", price: 40, period: "Monthly subscription", code: "30D", badge: "FLEXIBLE ACCESS", description: "A flexible pass for your estimating work.", popular: false, href: "/checkout?plan=monthly" }, { title: "Pass for a year", price: 400, period: "Yearly subscription", code: "01Y", badge: "BEST VALUE", description: "A full year of ESTIMATING. Save $80 compared with monthly billing.", popular: true, href: "/checkout?plan=yearly" }] },
    { id: "testimonials", label: "Benefits", visible: true, eyebrow: "Built for construction work", title: "Takeoffs that stay organized and moving", description: "ESTIMATING brings plan review, measurements, and project tools into a straightforward workflow for construction professionals.", icon: "ClipboardCheck", image: "", imageAlt: "", items: [{ category: "Project organization", title: "Keep takeoff details together", description: "Keep drawings, measurements, markups, and project information together so details are easier to find and review." }, { category: "Easy to use", title: "A clear workspace for plan review", description: "Drawings, measurement tools, and project controls come together in one focused workspace." }, { category: "Speed", title: "Keep estimates moving", description: "Quick access to takeoff and markup tools helps keep everyday measuring and plan review moving." }, { category: "Growing toolkit", title: "More tools for the work", description: "An expanding set of measurement, markup, and project tools supports more of the takeoff workflow in one place." }, { category: "Engineering foundation", title: "Focused modules, built to evolve", description: "Feature-focused modules give developers a clear foundation for improving the product and adding tools over time." }, { category: "Engineering foundation", title: "Reusable patterns across the app", description: "Shared interface components help keep workflows consistent as new capabilities are added." }] },
    { id: "blog", label: "Blog", visible: true, eyebrow: "Latest Insights", title: "From our blog", description: "Stay updated with the latest trends, best practices, and insights from our team of experts.", icon: "Newspaper", image: "", imageAlt: "", items: [{ image: "https://ui.shadcn.com/placeholder.svg", category: "Technology", title: "AI Development Catalysts", description: "Exploring how AI-driven tools are transforming software development workflows and accelerating innovation.", content: "", published: true }, { image: "https://ui.shadcn.com/placeholder.svg", category: "Lifestyle", title: "Minimalist Living Guide", description: "Minimalist living approaches that can help reduce stress and create more meaningful daily experiences.", content: "", published: true }, { image: "https://ui.shadcn.com/placeholder.svg", category: "Design", title: "Accessible UI Trends", description: "How modern UI trends are embracing accessibility while maintaining sleek, intuitive user experiences.", content: "", published: true }] },
    { id: "faq", label: "FAQ", visible: true, eyebrow: "FAQ", title: "Frequently Asked Questions", description: "Answers about plan takeoffs, project files, calendar connections, and subscription passes.", icon: "CircleHelp", image: "", imageAlt: "", items: [{ question: "What can I do with ESTIMATING?", answer: "Bring PDF plans into one workspace, move between sheets, take off lengths, areas, and counts, add drawing markups, and turn measured quantities into material calculations and estimates." }, { question: "Which takeoff tools are included?", answer: "ESTIMATING includes length, area, and count takeoffs, plus drawing markups and material calculations. You can keep the quantities and plan references together as you work through the project." }, { question: "What can I put on the Whiteboard?", answer: "Add PDFs, images, and text notes, arrange them on the board, and pan or zoom to review your references together." }, { question: "Does Google sign-in give ESTIMATING access to Gmail or Calendar?", answer: "No. Google sign-in is for your ESTIMATING account. Connecting Google Calendar is a separate, optional step that asks for calendar permissions when you choose that feature." }, { question: "What does a pass cost, and can I make a live payment?", answer: "The 30-day pass is $40 per month, and the annual pass is $400 per year. Both include PDF plans and sheet navigation, takeoffs, markups, and material calculations. Subscriptions renew; checkout shows the terms and total. Checkout is currently in test mode and does not accept live payments." }] },
    { id: "cta", label: "Call to action", visible: true, eyebrow: "YOUR NEXT PROJECT STARTS HERE", title: "Put your plans to work.", description: "Bring your drawings and measurements into one focused workspace.", icon: "ArrowRight", image: "", imageAlt: "", items: [{ label: "Launch ESTIMATING", href: "app" }, { label: "Explore features, pricing & FAQ", href: "/landing" }, { label: "Built for construction work", href: "#features" }, { label: "Plans, takeoffs, estimates", href: "#features" }, { label: "Made for your workflow", href: "#features" }] },
    { id: "contact", label: "Contact", visible: true, eyebrow: "Get In Touch", title: "Need help or have questions?", description: "Our team is here to help you get the most out of ESTIMATING. Choose the best way to reach out to us.", icon: "Mail", image: "", imageAlt: "", items: [{ icon: "BookOpen", title: "Frequently asked questions", description: "Find answers about plans, takeoffs, Whiteboard, calendar connections, and subscriptions.", label: "View FAQ", href: "#faq" }] },
    { id: "footer", label: "Footer", visible: true, eyebrow: "", title: "ESTIMATING", description: "Keep your drawings, measurements, and estimate close at hand. ESTIMATING helps you review plans and stay on top of the details.", copyrightLine: "Built for construction takeoffs and estimates.", icon: "Heart", image: "", imageAlt: "", items: [{ label: "Features", href: "#features" }, { label: "Pricing", href: "#pricing" }, { label: "About", href: "#about" }, { label: "Blog", href: "#blog" }, { label: "Privacy", href: "/legal/privacy" }, { label: "Terms", href: "/legal/terms" }] },
    { id: "home", label: "Home page", visible: true, eyebrow: "BUILT FOR THE WAY YOU ESTIMATE", title: "Every great build\nstarts with a plan.", description: "Your drawings. Your measurements. Your next project.\nBring your construction takeoff into one focused workspace.", icon: "Ruler", image: assetUrl("estimating-blueprint.png"), imageAlt: "ESTIMATING workspace showing a construction blueprint", previewKicker: "THE ESTIMATING WORKSPACE", previewLabel: "FROM DRAWINGS TO DETAILS", toolsEyebrow: "A CLEARER WAY TO WORK", toolsTitle: "Less switching tabs.\nMore moving forward.", nextEyebrow: "YOUR NEXT PROJECT STARTS HERE", nextTitle: "Put your plans to work.", openLabel: "Open your workspace", launchLabel: "Launch ESTIMATING", exploreLabel: "Explore features, pricing & FAQ", items: [{ title: "Start with your drawings", description: "Give your plans a place to live. Open your project and keep the work in view.", icon: "FolderOpen" }, { title: "Get into the details", description: "Explore your sheets and use the takeoff workspace to work through your measurements.", icon: "Ruler" }, { title: "Keep your project together", description: "Move between sheets and takeoff tools in a workspace designed around construction plans.", icon: "Layers" }] },
  ],
}

export function mergeSiteContent(value: unknown): SiteContent {
  if (!value || typeof value !== "object") return defaultSiteContent
  const incoming = value as Partial<SiteContent>
  if (incoming.schemaVersion !== 2) return defaultSiteContent
  const sections = Array.isArray(incoming.sections) ? incoming.sections : defaultSiteContent.sections
  return { ...defaultSiteContent, ...incoming, nav: Array.isArray(incoming.nav) ? incoming.nav : defaultSiteContent.nav, sections: defaultSiteContent.sections.map(base => {
    const found = sections.find(section => section?.id === base.id)
    if (!found) return base
    const merged: SiteSection = { ...base, ...found, items: Array.isArray(found.items) ? found.items : base.items }
    if (base.id === "contact") {
      merged.items = merged.items.filter(item => !/github|discord/i.test(`${item.title || ""} ${item.label || ""} ${item.href || ""}`))
      if (!merged.items.length) merged.items = base.items
      merged.items = merged.items.map(item => /faq/i.test(`${item.title || ""} ${item.label || ""}`) ? { ...item, href: "/landing#faq" } : item)
    }
    if (base.id === "logos") merged.items = merged.items.filter(item => !/github/i.test(`${item.name || ""} ${item.icon || ""}`))
    if (base.id === "about") for (const key of ["primaryButton", "primaryHref", "secondaryButton", "secondaryHref"]) if (/github|discord/i.test(String(merged[key] || ""))) merged[key] = ""
    if (base.id === "footer") {
      merged.items = merged.items.filter(item => !/github|discord/i.test(`${item.label || ""} ${item.href || ""}`))
      if (!String(merged.description || "").trim()) merged.description = base.description
      if (!String(merged.copyrightLine || "").trim()) merged.copyrightLine = base.copyrightLine
    }
    return merged
  }) }
}

const SiteContentContext = createContext<SiteContent>(defaultSiteContent)
export function SiteContentProvider({ children, value }: { children: ReactNode; value?: SiteContent }) {
  const [stored, setStored] = useState<SiteContent>(defaultSiteContent)
  useEffect(() => {
    if (value || !supabase) return
    let active = true
    const load = async () => {
      const { data } = await supabase!.from("otk_website_content").select("content").eq("id", "published").maybeSingle()
      if (active && data?.content) setStored(mergeSiteContent(data.content))
    }
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    window.addEventListener("focus", load)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", load) }
  }, [value])
  return <SiteContentContext.Provider value={value || stored}>{children}</SiteContentContext.Provider>
}
export function useSiteContent() { return useContext(SiteContentContext) }
export function useSiteSection(id: string) { return useSiteContent().sections.find(section => section.id === id) || defaultSiteContent.sections[0] }
