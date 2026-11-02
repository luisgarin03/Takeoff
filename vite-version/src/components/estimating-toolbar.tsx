import { useEffect, type ReactNode } from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"

const APP_URL = import.meta.env.VITE_ESTIMATING_APP_URL || "https://app.estimating.studio"
export function EstimatingToolbar({ admin = false, preview = false, children }: { admin?: boolean; preview?: boolean; children?: ReactNode }) {
 const management = admin || preview
 const websitePath = preview ? "/preview" : "/landing"
 const { hash, pathname } = useLocation()
 const selectedSection = pathname === websitePath ? hash.slice(1) || "features" : ""
 useEffect(() => {
  if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
 }, [hash])
 return <header className="estimating-topbar">
  <div className="estimating-toolbar-main">
   {children}
   <NavLink to={preview ? "/preview" : "/"} className="estimating-wordmark brand-text-shimmer" aria-label="ESTIMATING home">ESTIMATING</NavLink>
   {management && <><span className="estimating-toolbar-divider" aria-hidden="true" />
   <nav className="estimating-toolbar-tabs" aria-label="Main navigation">
    <NavLink to="/preview" className={({isActive})=>isActive?'active':''}>Website</NavLink>
    <NavLink to="/dashboard" className={({isActive})=>isActive?'active':''}>Admin</NavLink>
   </nav></>}
   {!admin && <nav className="estimating-section-links estimating-section-toggle" aria-label="Website navigation">
    <NavLink to="/" end className={({isActive}) => isActive ? "active" : undefined}>Home</NavLink>
    {[{ id: "features", label: "Features" }, { id: "pricing", label: "Pricing" }, { id: "faq", label: "FAQ" }].map(({ id, label }) => <Link key={id} to={websitePath + '#' + id} className={selectedSection === id ? "active" : undefined} aria-current={selectedSection === id ? "location" : undefined}>{label}</Link>)}
    <NavLink to="/legal" className={({isActive}) => isActive ? "active" : undefined}>Legal</NavLink>
   </nav>}
   <div className="estimating-toolbar-actions">
    <ModeToggle />
    {management ? <Button variant="outline" onClick={() => { void supabase?.auth.signOut({scope:"local"}) }}>Sign out</Button> : <Button variant="outline" nativeButton={false} render={<a href={APP_URL+'/auth'} />}>Sign in</Button>}
    <Button nativeButton={false} render={<a href={APP_URL} />}>Open app <ExternalLink size={14}/></Button>
   </div>
  </div>
 </header>
}
