"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import projectLogo from "../../../image/project.png";

function closeMobileNav() {
  const toggle = document.getElementById("mobile-nav-toggle") as HTMLInputElement | null;
  if (toggle) toggle.checked = false;
}

function isInternalNavigation(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const target = event.target as HTMLElement | null;
  const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return false;

  try {
    const next = new URL(anchor.href, window.location.href);
    const current = new URL(window.location.href);
    if (next.origin !== current.origin) return false;
    if (next.pathname === current.pathname && next.search === current.search) return false;
    if (next.pathname === current.pathname && next.search === current.search && next.hash !== current.hash) return false;
    return true;
  } catch {
    return false;
  }
}

export default function PortalNavigationBehavior() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    setIsNavigating(false);
    closeMobileNav();
  }, [routeKey]);

  useEffect(() => {
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;

    const start = () => {
      setIsNavigating(true);
      if (safetyTimer) clearTimeout(safetyTimer);
      safetyTimer = setTimeout(() => setIsNavigating(false), 12000);
    };

    const handleClick = (event: MouseEvent) => {
      if (!isInternalNavigation(event)) return;
      closeMobileNav();
      start();
    };

    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.target === "_blank") return;
      const action = form.action ? new URL(form.action, window.location.href) : new URL(window.location.href);
      if (action.origin === window.location.origin && form.method.toLowerCase() === "get") start();
    };

    const handlePopState = () => start();

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("popstate", handlePopState);
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, []);

  function goBack() {
    setIsNavigating(true);
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (referrer?.origin === window.location.origin) {
        router.back();
        return;
      }
    } catch {}
    router.push("/portal");
  }

  return (
    <>
      {isNavigating && (
        <div className="route-transition-overlay" role="status" aria-live="polite" aria-label="Loading page" aria-busy="true">
          <div className="route-transition-card">
            <span className="route-transition-logo">
              <Image src={projectLogo} alt="" priority />
            </span>
            <div className="route-transition-copy">
              <strong>Hamdan Studio</strong>
              <span>Loading workspace…</span>
            </div>
            <div className="route-transition-track" aria-hidden="true"><i /></div>
          </div>
        </div>
      )}

      {pathname !== "/portal" && (
        <div className="portal-back-row">
          <button className="portal-back-button" type="button" onClick={goBack} aria-label="Go back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18 9 12l6-6" />
            </svg>
            <span>Back</span>
          </button>
        </div>
      )}
    </>
  );
}
