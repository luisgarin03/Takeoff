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
}
export type SiteContent = {
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
    { id: "hero", label: "Hero", visible: true, eyebrow: "PLANS · TAKEOFFS · ESTIMATES", title: "Better takeoffs. More confident estimates.", description: "Bring PDF construction plans into one workspace. Navigate sheets, measure lengths, areas, and counts, add markups, and work through material calculations.", icon: "Ruler", image: assetUrl("estimating-blueprint.png"), imageAlt: "ESTIMATING workspace showing a construction blueprint", items: [{ label: "Open ESTIMATING", href: "app" }, { label: "Explore the workflow", href: "#features" }] },
    { id: "features", label: "Features", visible: true, eyebrow: "A CLEARER WAY TO WORK", title: "From drawings to quantities", description: "Tools for reviewing plans and carrying out construction takeoffs.", icon: "Layers", image: assetUrl("whiteboard-workspace.png"), imageAlt: "ESTIMATING Whiteboard workspace", items: [{ icon: "FileText", title: "PDF plans", description: "Open construction drawings and navigate between sheets." }, { icon: "Ruler", title: "Length, area, and count", description: "Measure quantities on your plans." }, { icon: "PencilRuler", title: "Markups", description: "Add drawing markups while reviewing plans." }, { icon: "Calculator", title: "Material calculations", description: "Use measured quantities in material calculations and estimates." }, { icon: "PanelsTopLeft", title: "Whiteboard", description: "Arrange PDFs, images, and notes, then pan and zoom." }, { icon: "CalendarDays", title: "Calendar connection", description: "Optionally connect Google Calendar to view calendars and events." }] },
    { id: "workflow", label: "Workflow", visible: true, eyebrow: "THE WORKFLOW", title: "Keep your work moving", description: "Move from plan sheets to measurements and estimates in a focused workflow.", icon: "Workflow", image: "", imageAlt: "", items: [{ icon: "FileText", title: "Open your plans", description: "Bring PDF drawings into the workspace and navigate sheets." }, { icon: "Ruler", title: "Measure the work", description: "Record lengths, areas, and counts directly from the drawings." }, { icon: "Calculator", title: "Review quantities", description: "Use takeoff quantities to work through materials and estimates." }] },
    { id: "about", label: "About", visible: true, eyebrow: "ABOUT ESTIMATING", title: "Built around construction takeoffs", description: "ESTIMATING brings plan review, measurements, markups, and material calculations into one focused tool for construction professionals.", icon: "Building2", image: "", imageAlt: "", items: [] },
    { id: "team", label: "Team", visible: true, eyebrow: "OUR TEAM", title: "Meet our team", description: "People building ESTIMATING across product development and engineering.", icon: "Users", image: "", imageAlt: "", items: [{ name: "Luis Garin", role: "Founder · Developer / Engineer", description: "Founder building the ESTIMATING platform.", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=240&auto=format&fit=crop", imageAlt: "Portrait of Luis Garin", icon: "User" }, { name: "Marcus Coleman", role: "Developer", description: "Develops features for the ESTIMATING platform.", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=240&auto=format&fit=crop", imageAlt: "Portrait of Marcus Coleman", icon: "User" }, { name: "Lauren Lee", role: "Marketing / Finance", description: "Supports ESTIMATING's marketing and finance.", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=240&auto=format&fit=crop", imageAlt: "Portrait of Lauren Lee", icon: "User" }] },
    { id: "pricing", label: "Pricing", visible: true, eyebrow: "YOUR PASS TO ESTIMATING", title: "Choose the pass that fits", description: "Both passes include access to the estimating tools. Checkout currently runs in test mode.", icon: "Ticket", image: "", imageAlt: "", items: [{ title: "Pass for 30 days", price: 40, period: "per month", description: "A flexible pass for your estimating work.", href: "/checkout?plan=monthly", icon: "CalendarDays" }, { title: "Pass for a year", price: 400, period: "per year", description: "Save $80 compared with monthly billing.", href: "/checkout?plan=yearly", icon: "CalendarRange" }] },
    { id: "testimonials", label: "Benefits", visible: true, eyebrow: "BUILT FOR CONSTRUCTION WORK", title: "Takeoffs that stay organized and moving", description: "Plan review, measurements, and project tools in a straightforward workflow.", icon: "ClipboardCheck", image: "", imageAlt: "", items: [{ category: "Plan review", title: "Keep takeoff details together", description: "Review drawings, measurements, and markups as you work." }, { category: "Easy to use", title: "A clear workspace for plan review", description: "Drawing tools and project controls in one focused workspace." }, { category: "Estimating", title: "Keep estimates moving", description: "Work from measured quantities toward material calculations." }] },
    { id: "blog", label: "Blog", visible: true, eyebrow: "LATEST INSIGHTS", title: "From our blog", description: "Guidance and updates from ESTIMATING.", icon: "Newspaper", image: "", imageAlt: "", items: [] },
    { id: "faq", label: "FAQ", visible: true, eyebrow: "FAQ", title: "Frequently asked questions", description: "Answers about plan takeoffs, project files, calendar connections, and subscription passes.", icon: "CircleHelp", image: "", imageAlt: "", items: [{ question: "What can I do with ESTIMATING?", answer: "Bring PDF plans into one workspace, move between sheets, take off lengths, areas, and counts, add drawing markups, and work through material calculations and estimates." }, { question: "What can I put on the Whiteboard?", answer: "Add PDFs, images, and text notes, arrange them on the board, and pan or zoom to review your references together." }, { question: "Does Google sign-in give ESTIMATING access to Gmail or Calendar?", answer: "No. Google sign-in is for your ESTIMATING account. Connecting Google Calendar is a separate, optional step." }, { question: "Can I make a live payment?", answer: "Checkout is currently in test mode and does not accept live payments." }] },
    { id: "contact", label: "Contact", visible: true, eyebrow: "GET IN TOUCH", title: "Questions about ESTIMATING?", description: "Contact our team for help with the app, subscriptions, or your account.", icon: "Mail", image: "", imageAlt: "", items: [{ label: "Email our team", href: "mailto:fernando@estimating.studio", icon: "Mail" }] },
    { id: "footer", label: "Footer", visible: true, eyebrow: "", title: "ESTIMATING", description: "Plan takeoffs and material estimates.", icon: "Heart", image: "", imageAlt: "", items: [{ label: "Privacy", href: "/legal/privacy" }, { label: "Terms", href: "/legal/terms" }, { label: "Contact", href: "#contact" }] },
  ],
}

export function mergeSiteContent(value: unknown): SiteContent {
  if (!value || typeof value !== "object") return defaultSiteContent
  const incoming = value as Partial<SiteContent>
  const sections = Array.isArray(incoming.sections) ? incoming.sections : defaultSiteContent.sections
  return { ...defaultSiteContent, ...incoming, nav: Array.isArray(incoming.nav) ? incoming.nav : defaultSiteContent.nav, sections: defaultSiteContent.sections.map(base => {
    const found = sections.find(section => section?.id === base.id)
    return found ? { ...base, ...found, items: Array.isArray(found.items) ? found.items : base.items } : base
  }) }
}
