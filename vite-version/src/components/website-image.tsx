import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { assetUrl } from "@/lib/utils"
import { useSiteSection } from "@/lib/site-content"
export function WebsiteImage({editable=false}:{editable?:boolean}) {
 const home=useSiteSection("home")
 const [url,setUrl]=useState(home.image || assetUrl("estimating-blueprint.png"))
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState("")
 useEffect(()=>{if(home.image)setUrl(home.image)},[home.image])
 return <div><img src={url} alt={home.imageAlt || "ESTIMATING workspace showing a construction blueprint"} className="w-full rounded-xl h-auto block" onError={()=>setUrl(assetUrl("estimating-blueprint.png"))}/>{editable && <div className="space-y-3 mt-4"><label htmlFor="homepage-image">Upload homepage image (PNG, JPEG or WebP, up to 10 MB)</label><input id="homepage-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>10485760){setMessage("Choose a PNG, JPEG or WebP image under 10 MB.");return}if(!supabase){setMessage("Supabase is not configured.");return}setBusy(true);setMessage("");try{const {error}=await supabase.storage.from("website-media").upload("homepage",file,{upsert:true,contentType:file.type,cacheControl:"0"});if(error)throw error;setUrl(supabase.storage.from("website-media").getPublicUrl("homepage").data.publicUrl+"?v="+Date.now());setMessage("Homepage image updated.")}catch(error){setMessage(error instanceof Error?error.message:"Upload failed. Check storage configuration and admin access.")}finally{setBusy(false);e.target.value=""}}}/><p role="status">{busy?"Uploading…":message}</p></div>}</div>
}
