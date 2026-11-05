import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, ArrowUpRight, Sparkles, FileText, Ruler, Calculator, PencilRuler, PanelsTopLeft, CalendarDays, Building2, Users, User, Ticket, CalendarRange, ClipboardCheck, Newspaper, CircleHelp, Mail, Heart, Layers, Workflow, CheckCircle, Shield, BookOpen, Image, Star, Package, type LucideIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { defaultSiteContent, mergeSiteContent, type SiteContent, type SiteItem, type SiteSection } from "@/lib/site-content"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"

const iconMap: Record<string, LucideIcon> = { Sparkles, FileText, Ruler, Calculator, PencilRuler, PanelsTopLeft, CalendarDays, Building2, Users, User, Ticket, CalendarRange, ClipboardCheck, Newspaper, CircleHelp, Mail, Heart, Layers, Workflow, CheckCircle, Shield, BookOpen, Image, Star, Package }
function Icon({ name, className = "size-5" }: { name: string; className?: string }) {
  const Component = iconMap[name] || Sparkles
  return <Component className={className} aria-hidden />
}

export function LiveSite({ preview = false, content: override }: { preview?: boolean; content?: SiteContent }) {
  const [stored, setStored] = useState<SiteContent>(defaultSiteContent)
  const content = override || stored
  useEffect(() => {
    if (override) return
    document.title = content.pageTitle
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!description) { description = document.createElement("meta"); description.name = "description"; document.head.append(description) }
    description.content = content.metaDescription
  }, [content, override])
  useEffect(() => {
    let active = true
    const load = async () => {
      if (!supabase || override) return
      const { data } = await supabase.from("otk_website_content").select("content").eq("id", "published").maybeSingle()
      if (active && data?.content) setStored(mergeSiteContent(data.content))
    }
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    window.addEventListener("focus", load)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", load) }
  }, [override])
  return <div className="estimating-landing min-h-screen bg-background text-foreground">
    <header className="estimating-topbar"><div className="estimating-toolbar-main">
      <Link to="/" className="estimating-wordmark brand-text-shimmer">{content.brand}</Link>
      <nav className="estimating-section-links estimating-section-toggle" aria-label="Website navigation">{content.nav.map((item, i) => <a key={i} href={String(item.href || "#hero")}>{String(item.label || "Link")}</a>)}</nav>
      <div className="estimating-toolbar-actions"><ModeToggle /><Button variant="outline" nativeButton={false} render={<a href={content.appUrl + "/auth"}>{content.signInLabel}</a>} /><Button nativeButton={false} render={<a href={content.appUrl}>{content.appLabel} <ArrowUpRight size={14}/></a>} /></div>
    </div></header>
    {preview && <div className="border-b bg-muted px-4 py-2 text-center text-sm">Admin preview · Save changes in Website Content to publish.</div>}
    <main>{content.sections.filter(section => section.visible).map(section => <section key={section.id} id={section.id} className="py-20 sm:py-28">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        {section.id === "hero" ? <Hero section={section} appUrl={content.appUrl}/> : section.id === "footer" ? null : <>
          <header className="mx-auto mb-12 max-w-3xl text-center">
            {section.eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">{section.eyebrow}</p>}
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">{section.title}</h2>
            {section.description && <p className="text-lg text-muted-foreground">{section.description}</p>}
          </header>
          {section.id === "features" && section.image && <img src={section.image} alt={section.imageAlt} className="mb-10 max-h-[34rem] w-full rounded-2xl border object-cover" loading="lazy"/>}
          {section.id === "faq" ? <div className="mx-auto max-w-4xl space-y-3">{section.items.map((item, i) => <details key={i} className="rounded-lg border px-5 py-4"><summary className="cursor-pointer font-semibold">{String(item.question || "Question")}</summary><p className="pt-3 text-muted-foreground">{String(item.answer || "")}</p></details>)}</div>
          : section.items.length > 0 && <div className={`grid gap-5 ${section.id === "team" || section.id === "pricing" ? "md:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>{(section.id === "blog" ? section.items.filter(item => item.published !== false) : section.items).map((item, i) => <SiteCard key={i} item={item} section={section}/>)}</div>}
        </>}
      </div>
    </section>)}</main>
    {content.sections.find(s => s.id === "footer" && s.visible) && <footer className="border-t py-10"><div className="container mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-4"><div><Link to="/" className="font-bold">{content.sections.find(s => s.id === "footer")?.title || content.brand}</Link><p className="mt-1 text-sm text-muted-foreground">{content.sections.find(s => s.id === "footer")?.description}</p></div><nav className="flex flex-wrap gap-4">{(content.sections.find(s => s.id === "footer")?.items || []).map((item, i) => <a key={i} href={String(item.href || "#")}>{String(item.label || "Link")}</a>)}</nav></div></footer>}
    {!preview && <Link to="/dashboard" className="sr-only focus:not-sr-only">Admin</Link>}
  </div>
}

function Hero({ section, appUrl }: { section: SiteSection; appUrl: string }) {
  return <div className="grid items-center gap-10 lg:grid-cols-2">
    <div><p className="mb-4 text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">{section.eyebrow}</p><h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">{section.title}</h1><p className="mb-8 text-lg text-muted-foreground">{section.description}</p><div className="flex flex-wrap gap-3">{section.items.map((item, i) => <Button key={i} variant={i ? "outline" : "default"} size="lg" nativeButton={false} render={<a href={String(item.href) === "app" ? appUrl : String(item.href || "#features")}>{String(item.label || "Learn more")} {i ? <ArrowRight size={17}/> : null}</a>}/>)}</div></div>
    {section.image && <img src={section.image} alt={section.imageAlt} className="w-full rounded-2xl border shadow-2xl"/>}
  </div>
}

function SiteCard({ item, section }: { item: SiteItem; section: SiteSection }) {
  const image = String(item.image || "")
  return <article className="overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
    {image && <img src={image} alt={String(item.imageAlt || item.title || "")} className={`mb-5 w-full rounded-lg object-cover ${section.id === "team" ? "mx-auto size-28 rounded-full" : "max-h-56"}`} loading="lazy"/>}
    {item.icon && <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon name={String(item.icon)}/></div>}
    {item.category && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{String(item.category)}</p>}
    <h3 className="mb-2 text-xl font-semibold">{String(item.name || item.title || item.question || item.label || "")}</h3>
    {item.role && <p className="mb-2 font-medium text-primary">{String(item.role)}</p>}
    {item.price !== undefined && <p className="mb-3 text-3xl font-bold">${String(item.price)} <span className="text-sm font-normal text-muted-foreground">{String(item.period || "")}</span></p>}
    {item.description && <p className="text-muted-foreground">{String(item.description)}</p>}
    {item.content && <details className="mt-4"><summary className="cursor-pointer font-medium">Read article</summary><div className="mt-3 whitespace-pre-wrap text-muted-foreground">{String(item.content)}</div></details>}
    {item.href && section.id !== "hero" && <a className="mt-4 inline-flex items-center gap-2 font-medium text-primary hover:underline" href={String(item.href)}>{String(item.linkLabel || item.label || "Learn more")} <ArrowRight size={16}/></a>}
  </article>
}
