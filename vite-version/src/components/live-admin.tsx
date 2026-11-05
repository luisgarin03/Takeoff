import { WebsiteImage } from "@/components/website-image"
import { WebsiteImageEditor } from "@/components/website-image-editor"
import { useCallback, useEffect, useState } from "react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

type AdminUser = {id:string;email:string;display_name:string;created_at:string;last_sign_in_at:string|null;subscription_status:string|null;plan_id:string|null;provider:string|null;current_period_end:string|null;trial_ends_at:string|null;projects:number}
type AdminData = {stats:{users:number;subscriptions:number;trials:number;projects:number};total:number;users:AdminUser[]}
const date=(value:string|null)=>value ? new Date(value).toLocaleDateString() : "—"
export function LiveAdmin({usersOnly=false}:{usersOnly?:boolean}) {
 const [data,setData]=useState<AdminData|null>(null)
 const [query,setQuery]=useState("")
 const [search,setSearch]=useState("")
 const [page,setPage]=useState(0)
 const [busy,setBusy]=useState(true)
 const [error,setError]=useState("")
 const [version,setVersion]=useState(0)
 const refresh=useCallback(()=>setVersion(v=>v+1),[])
 useEffect(()=>{
  let active=true
  async function load(){
   setBusy(true);setError("");setData(null)
   if(!supabase){setError("Supabase is not configured.");setBusy(false);return}
   try {
    const result=await supabase.rpc("otk_website_admin_data",{p_search:search,p_page:page})
    if(!active)return
    if(result.error)throw result.error
    setData(result.data as AdminData)
   } catch(error){if(active)setError(error instanceof Error ? error.message : "Unable to load live data")}
   finally {if(active)setBusy(false)}
  }
  void load()
  return ()=>{active=false}
 },[search,page,version])
 return <BaseLayout title={usersOnly ? "Users" : "Dashboard"} description="Live data from OpenTakeoff · Supabase">
 <div className="px-4 lg:px-6 space-y-6">{!usersOnly && <section className="rounded-xl border p-5 space-y-4"><h2 className="text-lg font-semibold">Homepage image</h2><WebsiteImage editable /></section>}
 {!usersOnly && <WebsiteImageEditor/>}
 <div className="flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground">Users, billing status, and trials</p><Button onClick={refresh} disabled={busy}>Refresh</Button></div>
 {error && <p role="alert" className="rounded-lg border border-red-500 p-4 text-red-500 break-words">{error}</p>}
 {busy && <p role="status">Loading live database…</p>}
 {data && <>
 <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{Object.entries(data.stats).map(([label,value])=><section key={label} className="rounded-xl border bg-card p-5"><h2 className="capitalize text-sm text-muted-foreground">{label === "subscriptions" ? "Active subscriptions" : label === "trials" ? "Active trials" : label}</h2><p className="text-3xl font-semibold mt-2">{value.toLocaleString()}</p></section>)}</div>
 </>}
 <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();setPage(0);setSearch(query.trim());refresh()}}><label htmlFor="user-search" className="sr-only">Search users</label><Input id="user-search" className="max-w-md" placeholder="Search name or email" maxLength={200} value={query} onChange={e=>setQuery(e.target.value)}/><Button type="submit" disabled={busy}>Search</Button></form>
 {data && <><div className="max-w-full overflow-auto rounded-xl border"><table className="w-full text-sm whitespace-nowrap"><thead className="bg-muted"><tr>{["User","Subscription","Trial ends","Projects","Joined","Last sign in"].map(label=><th key={label} className="p-3 text-left font-medium">{label}</th>)}</tr></thead><tbody>{data.users.map(user=><tr key={user.id} className="border-t"><td className="p-3"><div className="font-medium">{user.display_name || user.email}</div><div className="text-muted-foreground">{user.email}</div></td><td className="p-3"><div>{user.subscription_status || "No subscription"}</div><div className="text-xs text-muted-foreground">{user.plan_id}{user.provider ? " · "+user.provider : ""}</div></td><td className="p-3">{date(user.trial_ends_at)}</td><td className="p-3">{user.projects}</td><td className="p-3">{date(user.created_at)}</td><td className="p-3">{date(user.last_sign_in_at)}</td></tr>)}</tbody></table>{data.users.length===0 && <p className="p-6 text-muted-foreground">No users match this search.</p>}</div>
 <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{data.total} users · Page {page+1} of {Math.max(1,Math.ceil(data.total/50))}</span><div className="flex gap-2"><Button disabled={busy || page===0} onClick={()=>setPage(p=>p-1)}>Previous</Button><Button disabled={busy || (page+1)*50>=data.total} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div></>}
 </div></BaseLayout>
}
