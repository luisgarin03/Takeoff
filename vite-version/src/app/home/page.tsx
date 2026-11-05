import { Ecosystem } from "@/components/ecosystem"
import React from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, Ruler, Layers, FolderOpen } from "lucide-react"
import { EstimatingToolbar } from "@/components/estimating-toolbar"
import { WebsiteImage } from "@/components/website-image"
import { SiteContentProvider, useSiteContent, useSiteSection } from "@/lib/site-content"
import "./home.css"
function HomeContent(){
 const home=useSiteSection("home")
 const content=useSiteContent()
 const title=home.title.split("\n")
 const iconMap={FolderOpen,Ruler,Layers}
 return <div className="estimating-landing home-page"><EstimatingToolbar />
 <main>
 <section className="home-intro"><div className="home-eyebrow"><span /> {home.eyebrow}</div><h1>{title[0]}<br /><em>{title.slice(1).join(" ")}</em></h1><div className="home-intro-bottom"><p>{home.description.split("\n").map((line:string,i:number)=><React.Fragment key={i}>{i>0&&<br/>}{line}</React.Fragment>)}</p><a className="home-primary" href={content.appUrl}>{home.openLabel} <ArrowUpRight size={18}/></a></div></section>
 <section className="home-preview" aria-label={home.previewKicker}><div className="home-preview-caption"><span>{home.previewKicker}</span><span>{home.previewLabel}</span></div><WebsiteImage/></section>
 <Ecosystem />
 <section id="features" className="home-tools"><div className="home-section-heading"><span className="home-eyebrow">{home.toolsEyebrow}</span><h2>{home.toolsTitle.split("\n").map((line:string,i:number)=><React.Fragment key={i}>{i>0&&<br/>}{line}</React.Fragment>)}</h2></div><div className="home-tool-grid">{home.items.map((item,i)=>{const Icon=iconMap[item.icon as keyof typeof iconMap] || Ruler;return <article key={i}><div className="home-tool-top"><Icon size={23} strokeWidth={1.4}/><span>0{i+1}</span></div><h3>{item.title}</h3><p>{item.description}</p></article>})}</div></section>
 <section className="home-next"><div><span className="home-eyebrow">{home.nextEyebrow}</span><h2>{home.nextTitle}</h2></div><div className="home-next-links"><a className="home-primary" href={content.appUrl}>{home.launchLabel} <ArrowUpRight size={18}/></a><Link to="/landing">{home.exploreLabel} <ArrowUpRight size={16}/></Link></div></section>
 </main><footer className="home-footer"><Link to="/" className="estimating-wordmark">{content.brand}</Link><nav aria-label="Legal" className="flex flex-wrap gap-4">{["privacy","terms","security","status"].map(item => <Link key={item} to={"/legal/"+item} className="capitalize">{item}</Link>)}</nav><Link to="/landing">Explore the product <ArrowUpRight size={14}/></Link></footer></div>
}
export default function HomePage(){return <SiteContentProvider><HomeContent/></SiteContentProvider>}
