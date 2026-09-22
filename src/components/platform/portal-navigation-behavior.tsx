"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

function closeMobileNav() {
  const toggle = document.getElementById("mobile-nav-toggle") as HTMLInputElement | null;
  if (toggle) toggle.checked = false;
}

export default function PortalNavigationBehavior() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    closeMobileNav();
  }, [pathname]);

  useEffect(() => {
    const sidebar = document.querySelector(".platform-sidebar");
    if (!sidebar) return;

    const closeFromLink = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("a")) closeMobileNav();
    };

    sidebar.addEventListener("click", closeFromLink);
    return () => sidebar.removeEventListener("click", closeFromLink);
  }, []);

  if (pathname === "/portal") return null;

  function goBack() {
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
    <div className="portal-back-row">
      <button className="portal-back-button" type="button" onClick={goBack} aria-label="Go back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18 9 12l6-6" />
        </svg>
        <span>Back</span>
      </button>
    </div>
  );
}
