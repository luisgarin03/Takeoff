import { Ecosystem } from "@/components/ecosystem"
import { Link } from "react-router-dom"
import { ArrowUpRight, Ruler, Layers, FolderOpen } from "lucide-react"
import { EstimatingToolbar } from "@/components/estimating-toolbar"
import { WebsiteImage } from "@/components/website-image"
import "./home.css"
const appUrl = import.meta.env.VITE_ESTIMATING_APP_URL || "https://app.estimating.studio"
export default function HomePage() {
 return <div className="estimating-landing home-page"><EstimatingToolbar />
 <main>
 <section className="home-intro"><div className="home-eyebrow"><span /> BUILT FOR THE WAY YOU ESTIMATE</div><h1>Every great build<br />starts with <em>a plan.</em></h1><div className="home-intro-bottom"><p>Your drawings. Your measurements. Your next project.<br />Bring your construction takeoff into one focused workspace.</p><a className="home-primary" href={appUrl}>Open your workspace <ArrowUpRight size={18}/></a></div></section>
 <section className="home-preview" aria-label="ESTIMATING application preview"><div className="home-preview-caption"><span>THE ESTIMATING WORKSPACE</span><span>FROM DRAWINGS TO DETAILS</span></div><WebsiteImage/></section>
 <Ecosystem />
 <section id="features" className="home-tools"><div className="home-section-heading"><span className="home-eyebrow">A CLEARER WAY TO WORK</span><h2>Less switching tabs.<br />More moving forward.</h2></div><div className="home-tool-grid">{[{Icon:FolderOpen,title:"Start with your drawings",text:"Give your plans a place to live. Open your project and keep the work in view."},{Icon:Ruler,title:"Get into the details",text:"Explore your sheets and use the takeoff workspace to work through your measurements."},{Icon:Layers,title:"Keep your project together",text:"Move between sheets and takeoff tools in a workspace designed around construction plans."}].map(({Icon,title,text},i)=><article key={title}><div className="home-tool-top"><Icon size={23} strokeWidth={1.4}/><span>0{i+1}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div></section>
 <section className="home-next"><div><span className="home-eyebrow">YOUR NEXT PROJECT STARTS HERE</span><h2>Put your plans to work.</h2></div><div className="home-next-links"><a className="home-primary" href={appUrl}>Launch ESTIMATING <ArrowUpRight size={18}/></a><Link to="/landing">Explore features, pricing & FAQ <ArrowUpRight size={16}/></Link></div></section>
 </main><footer className="home-footer"><Link to="/" className="estimating-wordmark">ESTIMATING</Link><nav aria-label="Legal" className="flex flex-wrap gap-4">{["privacy","terms","security","status"].map(item => <Link key={item} to={"/legal/"+item} className="capitalize">{item}</Link>)}</nav><Link to="/landing">Explore the product <ArrowUpRight size={14}/></Link></footer></div>
}
