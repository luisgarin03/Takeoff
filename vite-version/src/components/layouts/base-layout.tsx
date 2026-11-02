"use client"

import * as React from "react"

import { useLocation } from "react-router-dom"

import { AppSidebar } from "@/components/app-sidebar"

import { SiteHeader } from "@/components/site-header"

import { SiteFooter } from "@/components/site-footer"

import {

  ThemeCustomizer,

  ThemeCustomizerTrigger,

} from "@/components/theme-customizer"

import { UpgradeToProButton } from "@/components/upgrade-to-pro-button"

import { useSidebarConfig } from "@/hooks/use-sidebar-config"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

interface BaseLayoutProps {

  children: React.ReactNode

  title?: string

  description?: string

}

export function BaseLayout({ children, title, description }: BaseLayoutProps) {

  const { pathname } = useLocation()

  const demo = !["/dashboard", "/users"].includes(pathname)

  const [themeCustomizerOpen, setThemeCustomizerOpen] = React.useState(false)

  const { config } = useSidebarConfig()

  return (

    <SidebarProvider

      style={

        {

          "--sidebar-width": "16rem",

          "--sidebar-width-icon": "3rem",

          "--header-height": "calc(var(--spacing) * 14)",

        } as React.CSSProperties

      }

      className={config.collapsible === "none" ? "sidebar-none-mode" : ""}

    >

      {config.side === "left" ? (

        <>

          <AppSidebar

            variant={config.variant}

            collapsible={config.collapsible}

            side={config.side}

          />

          <SidebarInset>

            <SiteHeader />

            {demo && <p className="mx-4 mt-3 rounded-lg border p-3 text-sm text-muted-foreground">Template demo — this screen is not connected to live data. Dashboard and Users show the live database.</p>}

            <div className="flex flex-1 flex-col">

              <div className="@container/main flex flex-1 flex-col gap-2">

                <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

                  {title && (

                    <div className="px-4 lg:px-6">

                      <div className="flex flex-col gap-2">

                        <h1 className="text-2xl font-bold tracking-tight">

                          {title}

                        </h1>

                        {description && (

                          <p className="text-muted-foreground">{description}</p>

                        )}

                      </div>

                    </div>

                  )}

                  {children}

                </div>

              </div>

            </div>

            <SiteFooter />

          </SidebarInset>

        </>

      ) : (

        <>

          <SidebarInset>

            <SiteHeader />

            {demo && <p className="mx-4 mt-3 rounded-lg border p-3 text-sm text-muted-foreground">Template demo — this screen is not connected to live data. Dashboard and Users show the live database.</p>}

            <div className="flex flex-1 flex-col">

              <div className="@container/main flex flex-1 flex-col gap-2">

                <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

                  {title && (

                    <div className="px-4 lg:px-6">

                      <div className="flex flex-col gap-2">

                        <h1 className="text-2xl font-bold tracking-tight">

                          {title}

                        </h1>

                        {description && (

                          <p className="text-muted-foreground">{description}</p>

                        )}

                      </div>

                    </div>

                  )}

                  {children}

                </div>

              </div>

            </div>

            <SiteFooter />

          </SidebarInset>

          <AppSidebar

            variant={config.variant}

            collapsible={config.collapsible}

            side={config.side}

          />

        </>

      )}

      {/* Theme Customizer */}

      <ThemeCustomizerTrigger onClick={() => setThemeCustomizerOpen(true)} />

      <ThemeCustomizer

        open={themeCustomizerOpen}

        onOpenChange={setThemeCustomizerOpen}

      />

      <UpgradeToProButton />

    </SidebarProvider>

  )

}
