import Link from "next/link";

export type Tab = { href: string; label: string; count?: number | null; on?: boolean; hidden?: boolean };

/** Server-rendered tab bar; pass `on` for the active tab. */
export default function Tabs({ tabs, small }: { tabs: Tab[]; small?: boolean }) {
  return (
    <nav className={small ? "tabs sm" : "tabs"}>
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <Link key={t.href + t.label} href={t.href} className={t.on ? "on" : ""}>
            {t.label}
            {t.count ? <span className="cnt">{t.count}</span> : null}
          </Link>
        ))}
    </nav>
  );
}
