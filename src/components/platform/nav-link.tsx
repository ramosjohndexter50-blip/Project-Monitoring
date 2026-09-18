"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  return <Link href={href} aria-current={path === href.split("?")[0] ? "page" : undefined}>{children}</Link>;
}
