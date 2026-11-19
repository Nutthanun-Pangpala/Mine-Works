"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

export default function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <>
      {items.map((it) => {
        const on = it.href === "/" ? path === "/" : path === it.href || path.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href} className={on ? "on" : ""}>
            <span className="ico" aria-hidden>
              {it.icon}
            </span>
            <span className="lbl">{it.label}</span>
            {it.badge ? <span className="cnt">{it.badge}</span> : null}
          </Link>
        );
      })}
    </>
  );
}
