import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { assetUrl } from "@/lib/utils"
export function useHeroImage() {
 const [url,setUrl]=useState(assetUrl("estimating-blueprint.png"))
 useEffect(()=>{let active=true; void supabase?.from("otk_website_media").select("url").eq("id","hero").maybeSingle().then(({data})=>{if(active && data?.url)setUrl(data.url)}); return ()=>{active=false}},[])
 return url
}
