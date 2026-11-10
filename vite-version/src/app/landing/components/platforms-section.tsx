import { ArrowUpRight } from "lucide-react"
import { assetUrl } from "@/lib/utils"

const appUrl = import.meta.env.VITE_ESTIMATING_APP_URL || "https://app.estimating.studio"

export function PlatformsSection() {
  return (
    <section id="platforms" className="border-y bg-muted/30 py-20 sm:py-28" aria-labelledby="platforms-title">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
        <div>
          <p className="mb-5 text-xs tracking-widest text-muted-foreground">ESTIMATING ON MOBILE AND DESKTOP</p>
          <h2 id="platforms-title" className="text-4xl font-semibold tracking-tight sm:text-5xl">Measure plans wherever you work.</h2>
          <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
            Access your plan files and take measurements on iPhone and Android. Back at your desk, open ESTIMATING on Mac or Windows to review drawings and work through your takeoffs and estimates.
          </p>
          <ul className="mt-7 flex flex-wrap gap-3 text-sm" aria-label="Supported platforms">
            <li className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"><span className="font-bold" aria-hidden="true">iOS</span><span className="sr-only">iOS</span></li>
            <li className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17a10 10 0 0 1 4.5-8.4L4.8 5.7a.6.6 0 0 1 1-.6l1.8 3a10.5 10.5 0 0 1 8.8 0l1.8-3a.6.6 0 0 1 1 .6l-1.7 2.9A10 10 0 0 1 22 17z"/><circle cx="7.5" cy="13" r="1" className="fill-card"/><circle cx="16.5" cy="13" r="1" className="fill-card"/></svg>
              Android
            </li>
            <li className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h11v11H0zm13 0h11v11H13zM0 13h11v11H0zm13 0h11v11H13z"/></svg>
              Windows
            </li>
            <li className="rounded-lg border bg-card px-3 py-2">Mac</li>
          </ul>
          <a href={appUrl} className="mt-8 inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-medium hover:bg-accent">Open ESTIMATING <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
        <figure className="relative mx-auto w-full max-w-[280px]">
          <div className="overflow-hidden rounded-[2.5rem] border-[6px] border-zinc-700 bg-zinc-950 p-3 text-zinc-100 shadow-2xl">
            <div className="mx-auto mb-5 h-5 w-20 rounded-full bg-zinc-800" aria-hidden="true" />
            <div className="mb-3 flex justify-between px-2 text-[10px]"><span className="font-bold">ESTIMATING</span><span>Takeoff</span></div>
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-zinc-800">
              <img src={assetUrl("estimating-blueprint.png")} alt="Construction floor plan in the ESTIMATING workspace" loading="lazy" className="size-full object-cover" />
              <svg aria-hidden="true" viewBox="0 0 200 250" className="absolute inset-0 size-full">
                <path d="M51 148L146 97" stroke="#225baf" strokeWidth="3" />
                <circle cx="51" cy="148" r="4" fill="#225baf" stroke="white" />
                <circle cx="146" cy="97" r="4" fill="#225baf" stroke="white" />
                <rect x="71" y="101" width="49" height="19" rx="4" fill="#172d4a" />
                <text x="95" y="114" textAnchor="middle" fill="white" fontSize="10">24′ 6″</text>
              </svg>
            </div>
            <div className="my-4 flex justify-around text-[10px] text-zinc-300"><span>Sheets</span><span className="font-bold text-white">Measure</span><span>Markups</span></div>
            <div className="mx-auto h-1 w-20 rounded-full bg-zinc-500" aria-hidden="true" />
          </div>
          <figcaption className="mt-4 text-center text-xs text-muted-foreground">Illustrative mobile takeoff preview</figcaption>
        </figure>
      </div>
    </section>
  )
}
