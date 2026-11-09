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
    { id: "logos", label: "Logo carousel", visible: false, eyebrow: "", title: "", description: "", icon: "Star", image: "", imageAlt: "", items: [] },
    { id: "stats", label: "Statistics", visible: false, eyebrow: "", title: "", description: "", icon: "Star", image: "", imageAlt: "", items: [] },
    { id: "about", label: "About", visible: true, eyebrow: "About ESTIMATING", title: "Built around the work you do", description: "ESTIMATING brings PDF plans, takeoffs, markups, and material estimates into one workspace. Move from sheet review to measured quantities while keeping your project details close at hand.", closingLine: "From the first sheet to the final quantity, keep the work moving.", primaryButton: "", primaryHref: "", secondaryButton: "", secondaryHref: "", icon: "Building2", image: "", imageAlt: "", items: [{ icon: "FileText", title: "Start with the plan set", description: "Open PDF drawings and navigate sheets while you review the project." }, { icon: "Ruler", title: "Measure what matters", description: "Record length, area, and count takeoffs directly against your plans." }, { icon: "Calculator", title: "Build from quantities", description: "Use measured quantities as the basis for material calculations and estimates." }, { icon: "PanelsTopLeft", title: "Keep references together", description: "Arrange PDFs, images, and notes on Whiteboard for a broader project view." }] },
    { id: "features", label: "Features", visible: true, eyebrow: "Project Whiteboard", title: "Organize your files. See the whole picture.", description: "Bring PDFs, images, and notes into one visual workspace so your project files are easier to organize and view.", icon: "PanelsTopLeft", image: assetUrl("whiteboard-workspace.png"), imageAlt: "ESTIMATING Whiteboard with controls to add PDFs, images, and notes, and pan or zoom the workspace", primaryTitle: "A visual home for your project files", primaryDescription: "Use Whiteboard to organize files and view them together. Add PDFs and images, paste text, and arrange your references across the board. Pan, zoom, or fit the view to move from individual details to the bigger picture.", primaryButton: "Open ESTIMATING", primarySecondaryButton: "Ask about Whiteboard", primarySecondaryHref: "#contact", items: [{ icon: "Package", title: "PDFs & Images", description: "Add PDFs and images to keep your project references together." }, { icon: "Crown", title: "Organize Your Files", description: "Arrange files on the board in a way that makes sense for your project." }, { icon: "Layout", title: "View Files Together", description: "View your documents and images in one visual workspace." }, { icon: "Zap", title: "Notes & Navigation", description: "Paste text or add notes, then pan and zoom to explore the board." }], secondaryTitle: "Keep your schedule in view", secondaryDescription: "Bring your Google Calendar into ESTIMATING to view your calendars and upcoming events while you work. Keep meetings, site visits, and deadlines in view without switching away from your estimating workspace.", secondaryButton: "Open ESTIMATING", secondarySecondaryButton: "Ask about Calendar", secondarySecondaryHref: "#contact", secondaryImage: assetUrl("calendar-preview.svg"), secondaryImageAlt: "Illustrative monthly calendar with example drawing review, site visit, and bid deadline events", secondaryItems: [{ icon: "CalendarDays", title: "Your Calendar List", description: "See your connected Google calendars and choose which schedule to view." }, { icon: "ListChecks", title: "Events in Context", description: "Review upcoming events alongside your estimating workflow." }, { icon: "Eye", title: "Read-Only Access", description: "View Google Calendar events without changing the originals." }, { icon: "Link2", title: "Google Calendar Connection", description: "Connect your Google account and authorize access to your calendars and events." }] },
    { id: "team", label: "Team", visible: true, eyebrow: "Our Team", title: "Meet our team", description: "Meet the people building ESTIMATING across product development, engineering, marketing, and finance.", icon: "Users", image: "", imageAlt: "", items: [{ name: "Luis Garin", role: "Founder · Developer / Engineer", description: "Founder building the ESTIMATING platform.", image: "", imageAlt: "", icon: "User" }, { name: "Marcus Coleman", role: "Developer", description: "Develops features for the ESTIMATING platform.", image: "", imageAlt: "", icon: "User" }, { name: "Lauren Lee", role: "Marketer / Finance", description: "Supports ESTIMATING's marketing and finance.", image: "", imageAlt: "", icon: "User" }] },
    { id: "pricing", label: "Pricing", visible: true, eyebrow: "YOUR PASS TO ESTIMATING", title: "Pick your pass. Start your next project.", description: "The same estimating tools. Choose the subscription that fits your workflow. Prices are in USD; applicable tax is calculated at checkout. Subscriptions renew for the same term until canceled. Contact support to cancel. Live payments are not available yet; checkout is preview-only and will not charge your card.", icon: "Ticket", image: "", imageAlt: "", features: ["PDF plans and sheet navigation", "Length, area, and count takeoffs", "Drawing markups and annotations", "Material calculations and estimates"], items: [{ title: "Pass for 30 days", price: 40, period: "per month", code: "30D", badge: "FLEXIBLE ACCESS", description: "For a month of plan review and estimating work.", billing: "$40 USD billed monthly, plus applicable tax. Renews monthly until canceled.", popular: false, href: "/checkout?plan=monthly" }, { title: "Pass for a year", price: 400, period: "per year", code: "01Y", badge: "BEST VALUE", description: "A full year of ESTIMATING. Save $80 compared with paying monthly.", billing: "$400 USD billed yearly, plus applicable tax. Renews yearly until canceled.", popular: true, href: "/checkout?plan=yearly" }] },
    { id: "testimonials", label: "Benefits", visible: true, eyebrow: "Built for construction work", title: "A practical workflow from plans to quantities", description: "Keep the drawing, the measurement, and the estimate connected as you work through a project.", icon: "ClipboardCheck", image: "", imageAlt: "", items: [{ category: "Plan review", title: "Find the sheet you need", description: "Keep PDF plans together and move between sheets as you review the scope." }, { category: "Takeoffs", title: "Measure by quantity type", description: "Record lengths, areas, and counts against the construction drawings." }, { category: "Markups", title: "Make details visible", description: "Add drawing markups and annotations to capture notes during plan review." }, { category: "Estimating", title: "Carry quantities into estimates", description: "Use measured quantities for material calculations and project estimates." }, { category: "Project workspace", title: "Keep working files together", description: "Use Whiteboard to arrange PDFs, images, and notes for a clear project overview." }, { category: "Scheduling", title: "Keep dates in view", description: "Connect Google Calendar to view schedules alongside your estimating work." }] },
    { id: "blog", label: "Blog", visible: true, eyebrow: "Field Notes", title: "Ideas for a clearer takeoff", description: "Practical notes on reviewing plans, measuring scope, and turning quantities into estimates.", icon: "Newspaper", image: "", imageAlt: "", items: [
      { image: assetUrl("estimating-blueprint.png"), imageAlt: "Construction plan open in the ESTIMATING workspace", category: "Plan review", title: "Start a takeoff with a clean plan set", description: "A simple review routine helps keep sheet references and scope decisions clear before measuring begins.", content: "Before measuring, gather the current drawing set and take a moment to understand how the sheets relate.\n\nStart with the sheet index and identify the drawings that describe the scope you are pricing. Keep the relevant PDFs together, then move between sheets as you review details.\n\nAs you work, record questions and markups close to the drawing that raised them. This makes it easier to revisit an assumption and helps keep the path from plan review to takeoff visible.\n\nESTIMATING gives you a workspace for PDF plans, sheet navigation, takeoffs, and markups. Always confirm you are using the current project documents before relying on quantities.", linkLabel: "Read article", href: "#blog-plan-set", published: true },
      { image: assetUrl("whiteboard-workspace.png"), imageAlt: "Documents arranged on a project Whiteboard", category: "Takeoff basics", title: "Length, area, or count: choose the takeoff that fits", description: "Match the measurement type to the item you are quantifying, then keep the drawing reference with the result.", content: "A useful takeoff begins with a clear question: are you measuring a run, a surface, or individual items?\n\nUse a length quantity for linear scope, an area quantity for surfaces, and a count for repeated objects. Check the drawing scale and units before measuring, and review the result against the plan so the quantity matches the intended scope.\n\nKeep notes about inclusions, exclusions, and assumptions with your project references. Those details make it easier to explain how a quantity was assembled when the estimate is reviewed.\n\nESTIMATING supports length, area, and count takeoffs on construction drawings. Verify scale, units, and scope independently before using a quantity for a bid or order.", linkLabel: "Read article", href: "#blog-measurement", published: true },
      { image: assetUrl("calendar-preview.svg"), imageAlt: "Project schedule displayed alongside takeoff work", category: "Estimating workflow", title: "Turn measured quantities into a reviewable estimate", description: "A clear estimate connects each quantity to its source and makes assumptions easier to revisit.", content: "Once quantities are measured, keep each one tied to the sheet and scope it came from. Group related items, note material assumptions, and review calculations before carrying totals into a proposal.\n\nA second pass can catch missed areas, duplicate counts, or scope that changed between drawing revisions. When possible, compare the estimate with the plan set and document any exclusions or allowances clearly.\n\nESTIMATING brings takeoffs, markups, and material calculations into the same project workflow. Treat software results as a starting point and verify every quantity and calculation before bidding, ordering, or construction.", linkLabel: "Read article", href: "#blog-estimate", published: true }
    ] },
    { id: "faq", label: "FAQ", visible: true, eyebrow: "FAQ", title: "Frequently Asked Questions", description: "Answers about plan takeoffs, project files, calendar connections, and subscription passes.", icon: "CircleHelp", image: "", imageAlt: "", items: [{ question: "What can I do with ESTIMATING?", answer: "Bring PDF plans into one workspace, move between sheets, take off lengths, areas, and counts, add drawing markups, and turn measured quantities into material calculations and estimates." }, { question: "Which takeoff tools are included?", answer: "ESTIMATING includes length, area, and count takeoffs, plus drawing markups and material calculations. You can keep the quantities and plan references together as you work through the project." }, { question: "What can I put on the Whiteboard?", answer: "Add PDFs, images, and text notes, arrange them on the board, and pan or zoom to review your references together." }, { question: "Does Google sign-in give ESTIMATING access to Gmail or Calendar?", answer: "No. Google sign-in is for your ESTIMATING account. Connecting Google Calendar is a separate, optional step that asks for calendar permissions when you choose that feature." }, { question: "How much does ESTIMATING cost, and how does billing work?", answer: "The 30-day pass is $40 USD per month, and the annual pass is $400 USD per year. Both include PDF plans and sheet navigation, length, area, and count takeoffs, markups, and material calculations. Each subscription renews for the same term until canceled. Applicable tax is calculated at checkout, where Stripe shows the final total before confirmation. Live payments are not available yet; checkout is preview-only and will not charge your card." }] },
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
    const allItemText = merged.items.map(item => Object.values(item).join(" ")).join(" ").toLowerCase()
    if (base.id === "logos" && /shopify|netflix|spotify|airbnb|dropbox|stripe|google|apple|meta|tesla|salesforce/.test(allItemText)) return base
    if (base.id === "stats" && /500\+|25k\+|10k\+|developers|downloads|components ready|user satisfaction/.test(allItemText)) return base
    if (base.id === "about" && /marketplace|shadcn|developer first|components and templates|admin interfaces/.test(`${merged.title} ${merged.description} ${allItemText}`.toLowerCase())) return base
    if (base.id === "testimonials" && /engineering foundation|built for developers|developer community|reusable patterns/.test(allItemText)) return base
    if (base.id === "blog" && /ai development catalysts|minimalist living guide|accessible ui trends|lifestyle|technology/.test(allItemText)) return base
    if (base.id === "team") merged.items = merged.items.map(item => /images\.unsplash\.com/i.test(String(item.image || "")) ? { ...item, image: "", imageAlt: "" } : item)
    if (base.id === "faq") {
      const current = defaultSiteContent.sections.find(section => section.id === "faq")!
      merged.items = merged.items.map((item, index) => /test mode|test payments only/i.test(String(item.answer || "")) ? current.items[index] || item : item)
    }
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
