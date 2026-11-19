"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <>
      {items.map((it) => {
        const on = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={on ? "on" : ""}>
            {it.label}
          </Link>
        );
      })}
    </>
  );
}
