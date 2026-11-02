import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function Page() {
 const [email,setEmail]=useState("")
 const [password,setPassword]=useState("")
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState("")
 const navigate=useNavigate()
 const [params]=useSearchParams()
 const requested=params.get("returnTo") || "/dashboard"
 const destination=requested.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/auth") ? requested : "/dashboard"
 async function submit(event:FormEvent) {
  event.preventDefault()
  if (!supabase) {setError("Supabase is not configured. Run the startup script.");return}
  setBusy(true);setError("")
  try {
   const result=await supabase.auth.signInWithPassword({email,password})
   if(result.error) throw result.error
   navigate(destination,{replace:true})
  } catch(error) {setError(error instanceof Error ? error.message : "Sign in failed")}
  finally {setBusy(false)}
 }
 async function google() {
  if (!supabase) {setError("Supabase is not configured.");return}
  setBusy(true);setError("")
  const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo: new URL((import.meta.env.VITE_BASENAME || "") + destination,window.location.origin).href}})
  if(error){setError(error.message);setBusy(false)}
 }
 return <main className="min-h-svh flex items-center justify-center bg-muted p-5"><section className="w-full max-w-md rounded-xl border bg-card p-7 space-y-6">
 <Link to="/landing" className="block text-center text-xl font-bold brand-text-shimmer">ESTIMATING</Link>
 <div><h1 className="text-2xl font-semibold">Admin sign in</h1><p className="mt-2 text-muted-foreground">Use your existing OpenTakeoff account. Administrator access is checked after sign in.</p></div>
 <Button className="w-full" disabled={busy} onClick={()=>void google()}>Continue with Google</Button>
 <form onSubmit={submit} className="space-y-4">
 <div className="space-y-2"><label htmlFor="admin-email">Email</label><Input id="admin-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
 <div className="space-y-2"><label htmlFor="admin-password">Password</label><Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></div>
 {error && <p role="alert" className="text-red-500 break-words">{error}</p>}
 <Button className="w-full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button></form>
 <Link to="/landing" className="block text-sm underline">Back to website</Link>
 </section></main>
}
