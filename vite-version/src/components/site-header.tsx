import * as React from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { CommandSearch } from "@/components/command-search"
import { EstimatingToolbar } from "@/components/estimating-toolbar"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
export function SiteHeader() {
  const [searchOpen,setSearchOpen]=React.useState(false)
  React.useEffect(()=>{const down=(e:KeyboardEvent)=>{if(e.key==='k'&&(e.metaKey||e.ctrlKey)){e.preventDefault();setSearchOpen(value=>!value)}};document.addEventListener('keydown',down);return()=>document.removeEventListener('keydown',down)},[])
  return <><EstimatingToolbar admin><SidebarTrigger/><Button variant="ghost" size="icon" aria-label="Search admin" onClick={()=>setSearchOpen(true)}><Search/></Button></EstimatingToolbar><CommandSearch open={searchOpen} onOpenChange={setSearchOpen}/></>
}
