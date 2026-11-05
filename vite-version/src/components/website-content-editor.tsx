import { useEffect, useMemo, useState } from "react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import { defaultSiteContent, mergeSiteContent, type SiteContent } from "@/lib/site-content"
import { LandingPageContent } from "@/app/landing/page"
import { SiteContentProvider } from "@/lib/site-content"
import { Link } from "react-router-dom"

const iconOptions = ["Sparkles", "FileText", "Ruler", "Calculator", "PencilRuler", "PanelsTopLeft", "CalendarDays", "Building2", "Users", "User", "Ticket", "CalendarRange", "ClipboardCheck", "Newspaper", "CircleHelp", "Mail", "Heart", "Layers", "Workflow", "CheckCircle", "Shield", "BookOpen", "Image", "Star", "Package", "ArrowRight", "Zap", "Eye", "Link2", "Code", "Palette", "Crown", "Download", "Github", "shopify", "netflix", "spotify", "airbnb", "dropbox", "stripe", "google", "apple", "meta", "tesla", "salesforce"]
function updateAt(value: any, path: (string | number)[], next: unknown): any {
  if (!path.length) return next
  const [head, ...tail] = path
  const copy = Array.isArray(value) ? [...value] : { ...value }
  copy[head] = updateAt(value[head], tail, next)
  return copy
}
const labelFor = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase())

export function WebsiteContentEditor() {
  const [draft, setDraft] = useState<SiteContent>(defaultSiteContent)
  const [selected, setSelected] = useState("hero")
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const section = useMemo(() => draft.sections.find(item => item.id === selected) || draft.sections[0], [draft.sections, selected])
  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) { setMessage("Supabase is not configured."); return }
      const [{ data, error }, files] = await Promise.all([
        supabase.from("otk_website_content").select("content").eq("id", "published").maybeSingle(),
        supabase.storage.from("website-media").list("content", { limit: 100 }),
      ])
      if (!active) return
      if (error) setMessage("Could not load published content: " + error.message)
      else if (data?.content) setDraft(mergeSiteContent(data.content))
      setImages((files.data || []).filter(file => file.name && !file.name.startsWith("." )).map(file => supabase!.storage.from("website-media").getPublicUrl("content/" + file.name).data.publicUrl))
    }
    void load()
    return () => { active = false }
  }, [])
  function change(path: (string | number)[], value: unknown) { setDraft(current => updateAt(current, path, value)); setMessage("Unsaved edits") }
  async function publish() {
    if (!supabase) { setMessage("Supabase is not configured."); return }
    setBusy(true); setMessage("")
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) { setMessage("Sign in as an administrator to publish."); setBusy(false); return }
    const result = await supabase.from("otk_website_content").upsert({ id: "published", content: draft, updated_at: new Date().toISOString(), updated_by: authData.user.id })
    if (result.error) setMessage("Publish failed: " + result.error.message)
    else setMessage("Published. Visitors will see these changes when the site refreshes.")
    setBusy(false)
  }
  async function upload(path: (string | number)[], file?: File) {
    if (!file || !supabase) return
    if (!(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"].includes(file.type)) || file.size > 10485760) { setMessage("Choose PNG, JPG, WebP, GIF, or SVG under 10 MB."); return }
    setBusy(true); setMessage("")
    const ext = file.name.split(".").pop()?.toLowerCase() || "png"
    const key = `content/${crypto.randomUUID()}.${ext}`
    const result = await supabase.storage.from("website-media").upload(key, file, { contentType: file.type, cacheControl: "3600" })
    setBusy(false)
    if (result.error) { setMessage("Image upload failed: " + result.error.message); return }
    const url = supabase.storage.from("website-media").getPublicUrl(key).data.publicUrl
    setImages(current => [url, ...current]); change(path, url); setMessage("Image uploaded. Publish to make it live.")
  }
  function addBlogPost() {
    const posts = section.items
    const post = { title: "New article", category: "News", description: "Write a short introduction.", content: "Write your article here.", image: "", imageAlt: "", icon: "Newspaper", published: true, href: "" }
    change(["sections", draft.sections.indexOf(section), "items"], [...posts, post])
  }
  function addItem() {
    const template = section.items[0] ? structuredClone(section.items[0]) : { label: "New item", href: "#" }
    const item = Object.fromEntries(Object.entries(template).map(([key, value]) => [key, typeof value === "boolean" ? false : typeof value === "number" ? 0 : ""]))
    if (section.id === "blog") Object.assign(item, { title: "New article", category: "News", description: "Write a short introduction.", content: "Write your article here.", image: "", imageAlt: "", published: true, href: "" })
    change(["sections", draft.sections.indexOf(section), "items"], [...section.items, item])
  }
  if (!section) return null
  return <BaseLayout title="Website Content" description="Edit and publish the public website">
    <div className="space-y-6 p-4 lg:p-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
        <div><h2 className="text-lg font-semibold">Website Content</h2><p className="text-sm text-muted-foreground">Edit any section, then publish it to the live website.</p></div>
        <div className="flex gap-2"><Button variant="outline" nativeButton={false} render={<Link to="/preview">Preview website</Link>}/><Button onClick={() => void publish()} disabled={busy}>{busy ? "Publishing…" : "Publish to live website"}</Button></div>
      </section>
      {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-2 rounded-xl border bg-card p-4"><h3 className="mb-3 font-semibold">Choose a section</h3>{draft.sections.map(item => <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{item.label}</button>)}<button type="button" onClick={() => setSelected("site-settings")} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected === "site-settings" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>Site navigation</button></aside>
        <section className="min-w-0 space-y-5 rounded-xl border bg-card p-5">
          {selected === "site-settings" ? <><h3 className="text-lg font-semibold">Site navigation and app link</h3><Fields value={{brand:draft.brand,appUrl:draft.appUrl,signInLabel:draft.signInLabel,appLabel:draft.appLabel,pageTitle:draft.pageTitle,metaDescription:draft.metaDescription,nav:draft.nav}} path={[]} onChange={change} images={images} onUpload={upload}/></> : <>
            <div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-lg font-semibold">{section.label}</h3><p className="text-sm text-muted-foreground">Every text field, image, and icon in this section can be changed.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={section.visible} onChange={e => change(["sections", draft.sections.indexOf(section), "visible"], e.target.checked)}/> Show on website</label></div>
            <Fields value={section} path={["sections", draft.sections.indexOf(section)]} onChange={change} images={images} onUpload={upload}/>
            {section.id === "blog" && <Button variant="outline" onClick={addBlogPost}>Create blog post</Button>}
            {section.id !== "blog" && <Button variant="outline" onClick={addItem}>Add item</Button>}
            {section.id === "blog" && section.items.length > 0 && <p className="text-sm text-muted-foreground">New articles are displayed on the public page as soon as they are published.</p>}
          </>}
        </section>
      </div>
      <section className="overflow-hidden rounded-xl border"><div className="border-b bg-card p-3 font-medium">Live content preview</div><div className="max-h-[70vh] overflow-auto"><SiteContentProvider value={draft}><LandingPageContent preview/></SiteContentProvider></div></section>
    </div>
  </BaseLayout>
}

function Fields({ value, path, onChange, images, onUpload }: { value: any; path: (string | number)[]; onChange: (path: (string | number)[], value: unknown) => void; images: string[]; onUpload: (path: (string | number)[], file?: File) => void }) {
  if (Array.isArray(value)) return <div className="space-y-4">{value.map((item, index) => <details key={index} open={path.at(-1) === "sections" || undefined} className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">{String(item?.title || item?.name || item?.label || item?.question || `Item ${index + 1}`)}</summary><div className="mt-4 space-y-4"><Fields value={item} path={[...path, index]} onChange={onChange} images={images} onUpload={onUpload}/><Button type="button" variant="outline" size="sm" onClick={() => onChange(path, value.filter((_: unknown, i: number) => i !== index))}>Remove item</Button></div></details>)}<Button type="button" variant="outline" size="sm" onClick={() => onChange(path, [...value, value.length ? structuredClone(value[value.length - 1]) : { label: "New link", href: "#" }])}>Add item</Button></div>
  if (value && typeof value === "object") return <div className="grid gap-4 md:grid-cols-2">{Object.entries(value).map(([key, child]) => <div key={key} className={key === "description" || key === "content" || key === "answer" || key === "items" || key === "image" || key === "nav" ? "md:col-span-2" : ""}><Fields value={child} path={[...path, key]} onChange={onChange} images={images} onUpload={onUpload}/></div>)}</div>
  const key = String(path.at(-1) || "value")
  const label = labelFor(key)
  if (key === "id" || key === "visible") return key === "id" ? null : <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(path, e.target.checked)}/>{label}</label>
  if (key === "icon") return <label className="block space-y-2 text-sm"><span>{label}</span><select className="h-10 w-full rounded-md border bg-background px-3" value={String(value || "Sparkles")} onChange={e => onChange(path, e.target.value)}>{iconOptions.map(icon => <option key={icon} value={icon}>{icon}</option>)}</select></label>
  if (key === "image") return <div className="space-y-2"><label className="block text-sm font-medium">Image selector</label>{typeof value === "string" && value && <img src={value} alt="Selected" className="max-h-52 max-w-full rounded-md border object-contain"/>}<select className="h-10 w-full rounded-md border bg-background px-3" value={String(value || "")} onChange={e => onChange(path, e.target.value)}><option value="">No image</option>{images.map(url => <option key={url} value={url}>{decodeURIComponent(url.split("/").pop() || "Uploaded image")}</option>)}{typeof value === "string" && value && !images.includes(value) && <option value={value}>Current image</option>}</select><Input aria-label="Image URL" placeholder="Or paste an image URL" value={String(value || "")} onChange={e => onChange(path, e.target.value)}/><input aria-label="Upload image" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" disabled={false} onChange={e => onUpload(path, e.target.files?.[0])}/></div>
  if (typeof value === "boolean") return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value} onChange={e => onChange(path, e.target.checked)}/>{label}</label>
  return <label className="block space-y-2 text-sm"><span>{label}</span>{typeof value === "number" ? <Input type="number" value={value} onChange={e => onChange(path, Number(e.target.value))}/> : (String(value || "").length > 90 || ["description", "content", "answer", "imageAlt"].includes(key)) ? <Textarea value={String(value ?? "")} onChange={e => onChange(path, e.target.value)} rows={key === "content" ? 10 : 4}/> : <Input value={String(value ?? "")} onChange={e => onChange(path, e.target.value)}/>}</label>
}
