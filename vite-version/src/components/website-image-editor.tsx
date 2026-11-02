import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { useHeroImage } from "@/lib/website-media"
import { Button } from "@/components/ui/button"
export function WebsiteImageEditor(){
 const initialUrl=useHeroImage()
 const [saved,setSaved]=useState("")
 const [file,setFile]=useState<File|null>(null)
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState("")
 async function upload(){
  if(!file || !supabase)return
  setBusy(true);setMessage("")
  try{
   if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Choose a PNG, JPG, or WebP image.")
   if(file.size>10485760)throw new Error("Choose an image smaller than 10 MB.")
   const path=`hero/${crypto.randomUUID()}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`
   const result=await supabase.storage.from("website-media").upload(path,file,{contentType:file.type})
   if(result.error)throw result.error
   const {data}=supabase.storage.from("website-media").getPublicUrl(path)
   const update=await supabase.from("otk_website_media").upsert({id:"hero",url:data.publicUrl})
   if(update.error)throw update.error
   setSaved(data.publicUrl);setFile(null);setMessage("Website image updated. Visitors will see it when they reload the page.")
  }catch(error){setMessage(error instanceof Error ? error.message : "Image upload failed.")}
  finally{setBusy(false)}
 }
 return <section className="rounded-xl border bg-card p-5 space-y-4"><div><h2 className="font-semibold text-lg">Landing page image</h2><p className="text-sm text-muted-foreground">Upload a PNG, JPG, or WebP image, up to 10 MB.</p></div><img src={saved || initialUrl} alt="Current landing page image" className="max-w-lg w-full rounded-lg border"/><label className="block text-sm" htmlFor="hero-upload">Choose replacement image</label><input id="hero-upload" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{setFile(e.target.files?.[0] || null);setMessage("")}}/><Button onClick={()=>void upload()} disabled={!file || busy}>{busy ? "Uploading…" : "Upload and publish image"}</Button>{message && <p role="status" className="text-sm">{message}</p>}</section>
}
