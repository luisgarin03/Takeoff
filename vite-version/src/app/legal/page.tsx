import { policies, policyContact } from "./policies"
import { useEffect } from "react"
import { NavLink, useParams } from "react-router-dom"
import { EstimatingToolbar } from "@/components/estimating-toolbar"
import "./legal.css"
const documents = {
 ...policies,
 security: { label: "Security", title: "Security information", description: "Information about account protection and reporting security concerns.", sections: [["Protect your account", "Use a unique password, protect your sign-in credentials, and sign out when using a shared device."], ["Reporting a concern", "A dedicated security reporting contact has not yet been published on this page. Do not post passwords, access tokens, or confidential project files in public reports."], ["Security documentation", "Verified information about security controls and data protection practices will be published here. No certification or compliance claim is made on this page."]] },
 status: { label: "Status", title: "Service status", description: "Availability information for the ESTIMATING website and application.", sections: [["Live monitoring is not connected", "This page does not currently receive automated uptime or incident data. Service availability is unknown; this page should not be interpreted as confirmation that all systems are operational."], ["Service updates", "Incident updates and maintenance notices will appear here when a status reporting source is connected."]] },
}
export default function LegalPage() {
 const { document = "privacy" } = useParams()
 const key = Object.hasOwn(documents, document) ? document as keyof typeof documents : "privacy"
 const content = documents[key]
 useEffect(() => { const previous = window.document.title; window.document.title = `${content.title} | ESTIMATING`; return () => { window.document.title = previous } }, [content.title])
 return <div className="estimating-landing legal-page"><EstimatingToolbar/><main className="legal-main"><header className="legal-header"><p className="legal-eyebrow">ESTIMATING / LEGAL & TRUST</p><h1>Clarity comes first.</h1><p>Policies, security information, and service updates in one place.</p></header><nav className="legal-switch" aria-label="Legal documents">{Object.entries(documents).map(([id, item]) => <NavLink key={id} to={`/legal/${id}`} className={key === id ? "selected" : undefined}>{item.label}</NavLink>)}</nav><article className="legal-document" aria-labelledby="document-title"><div className="legal-document-heading"><span className="legal-eyebrow">{key === "status" ? "SERVICE INFORMATION" : "EFFECTIVE NOVEMBER 1, 2026"}</span><h2 id="document-title">{content.title}</h2><p>{content.description}</p></div>{content.sections.map(([title,text]) => <section key={title}><h3>{title}</h3><p>{text}</p></section>)}</article><footer className="legal-note">{key === "privacy" || key === "terms" ? <>Questions or requests? <a href={"mailto:"+policyContact}>{policyContact}</a></> : "This page will be updated as verified information becomes available."}</footer></main></div>
}
