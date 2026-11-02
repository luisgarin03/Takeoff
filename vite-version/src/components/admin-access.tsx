import { useEffect, useState, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

export function AdminAccess({ children }: { children: ReactNode }) {
 const [access, setAccess] = useState<"loading" | "allowed" | "signed-out" | "denied" | "error">("loading")
 const [message, setMessage] = useState("")
 const location = useLocation()
 useEffect(() => {
  const client = supabase
  if (!client) return
  let active = true
  let revision = 0
  async function check() {
   const current = ++revision
   setAccess("loading")
   const { data, error } = await client!.auth.getSession()
   if (!active || current !== revision) return
   if (error) { setMessage(error.message); setAccess("error"); return }
   if (!data.session) { setAccess("signed-out"); return }
   const result = await client!.rpc("otk_website_is_admin")
   if (!active || current !== revision) return
   if (result.error) { setMessage(result.error.message); setAccess("error") }
   else setAccess(result.data === true ? "allowed" : "denied")
  }
  void check()
  const { data: listener } = client.auth.onAuthStateChange(() => { setTimeout(() => { if (active) void check() }, 0) })
  return () => { active = false; listener.subscription.unsubscribe() }
 }, [])
 if (!supabase) return <AccessMessage title="Supabase setup required" message="Run Start-ESTIMATING.cmd after configuring vite-version/.env.local." />
 if (access === "loading") return <AccessMessage title="Checking administrator access…" />
 if (access === "allowed") return children
 return <AccessMessage title={access === "signed-out" ? "Admin sign in" : access === "denied" ? "Administrator access required" : "Unable to connect"}
  message={access === "error" ? message : access === "denied" ? "This account is not on the administrator allowlist. Sign in with your administrator account." : "Sign in to view live users, subscriptions, trials, and projects."}>
   <Button nativeButton={false} render={<Link to={"/auth/sign-in?returnTo=" + encodeURIComponent(location.pathname)} />}>Sign in</Button>
   {access !== "signed-out" && <Button variant="outline" onClick={() => { void supabase?.auth.signOut({scope:"local"}) }}>Sign out</Button>}
 </AccessMessage>
}
function AccessMessage({title,message,children}:{title:string;message?:string;children?:ReactNode}) {
 return <main className="min-h-svh flex items-center justify-center p-6"><section className="w-full max-w-lg rounded-xl border bg-card p-8 space-y-5"><Link to="/landing" className="font-bold brand-text-shimmer">ESTIMATING</Link><h1 className="text-2xl font-semibold">{title}</h1>{message && <p role="status" className="text-muted-foreground">{message}</p>}<div className="flex gap-3">{children}</div><Link to="/landing" className="block text-sm underline">Back to website</Link></section></main>
}
