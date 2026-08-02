"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ChevronDownIcon, LogoutIcon, UserIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/Logo";

/**
 * Application header.
 *
 * Logo and primary nav on the left, the account menu on the right. The nav gives
 * the bar structure so it doesn't read as an empty strip with a stray avatar, and
 * doubles as the way back to the case list from Account.
 */
export function TopBar({ email, username, imageUrl, children }: { email?: string | null; username?: string | null; imageUrl?: string | null; children?: ReactNode }) {
  const name = username?.trim() || email?.split("@")[0] || "Account";

  return (
    <header className="sticky top-0 z-30 border-b border-cream-300 bg-cream-50/95 backdrop-blur supports-[backdrop-filter]:bg-cream-50/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 rounded-md text-stone-800"
          aria-label="CaseBoard home"
        >
          <Logo size="sm" />
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Primary">
          <NavLink href="/dashboard">Cases</NavLink>
          <NavLink href="/account">Account</NavLink>
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">{children}</div>

        <AccountMenu email={email ?? ""} name={name} imageUrl={imageUrl} />
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-cream-200 font-medium text-stone-800"
          : "text-stone-500 hover:bg-cream-100 hover:text-stone-700"
      }`}
    >
      {children}
    </Link>
  );
}

function AccountMenu({ email, name, imageUrl }: { email: string; name: string; imageUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Open account menu for ${name}`}
        className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 transition-colors ${
          open
            ? "border-stone-400/40 bg-cream-200"
            : "border-cream-300 bg-cream-50 hover:bg-cream-200"
        }`}
      >
        <Avatar name={name} src={imageUrl} size="sm" />
        <ChevronDownIcon
          size={16}
          className={`text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="surface absolute right-0 top-full z-40 mt-1.5 w-60 overflow-hidden py-1 shadow-panel"
        >
          <div className="flex items-center gap-3 border-b border-cream-300 px-3 py-3">
            <Avatar name={name} src={imageUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-stone-800">{name}</p>
              <p className="truncate text-xs text-stone-500">{email}</p>
            </div>
          </div>

          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-stone-700 hover:bg-cream-200"
          >
            <UserIcon size={16} className="text-stone-500" />
            Account settings
          </Link>

          <button
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2.5 border-t border-cream-300 px-3 py-2 text-left text-sm text-stone-700 hover:bg-clay-500/10 hover:text-clay-600"
          >
            <LogoutIcon size={16} className="text-stone-500" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
