"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { workflowSteps } from "@/lib/navigation";

const STORAGE_KEY = "salesai-sidebar-collapsed";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCollapsedSnapshot() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    // Default collapsed so Lead CRM nav stays out of the way.
    if (value === null) {
      return true;
    }
    return value === "1";
  } catch {
    return true;
  }
}

function getServerCollapsedSnapshot() {
  return true;
}

function setCollapsedPreference(next: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Ignore storage errors.
  }
  emit();
}

type AppShellProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  dense?: boolean;
  action?: {
    label: string;
    href: string;
  };
  children: React.ReactNode;
};

export function AppShell({
  eyebrow,
  title,
  description,
  dense = false,
  action,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribe,
    getCollapsedSnapshot,
    getServerCollapsedSnapshot,
  );
  const showHeader = Boolean(title || description || action);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 md:flex md:flex-col ${
            collapsed ? "w-14" : "w-64"
          }`}
        >
          <div
            className={`flex items-start justify-between gap-2 border-b border-slate-100 ${
              collapsed ? "px-2 py-3" : "px-4 py-4"
            }`}
          >
            {collapsed ? (
              <Link
                className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold text-emerald-700 hover:bg-slate-100"
                href="/leads"
                title="SalesAI"
              >
                SA
              </Link>
            ) : (
              <Link href="/leads" className="block min-w-0">
                <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                  SalesAI
                </p>
                <h1 className="mt-1 text-lg font-semibold leading-6 text-slate-950">
                  IT sales workspace
                </h1>
              </Link>
            )}
            <button
              aria-label={collapsed ? "メニューを開く" : "メニューを閉じる"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              onClick={() => setCollapsedPreference(!collapsed)}
              title={collapsed ? "メニューを開く" : "メニューを閉じる"}
              type="button"
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>

          <nav
            className={`mt-3 flex-1 space-y-1 overflow-y-auto ${
              collapsed ? "px-1.5" : "px-3"
            }`}
          >
            {workflowSteps.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const short = item.label
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              if (collapsed) {
                return (
                  <Link
                    className={`flex h-9 items-center justify-center rounded-md text-[11px] font-semibold ${
                      active
                        ? "bg-emerald-50 text-emerald-800"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                    href={item.href}
                    key={item.href}
                    title={item.label}
                  >
                    {short}
                  </Link>
                );
              }

              return (
                <Link
                  className={`block rounded-md px-3 py-2 text-sm font-medium ${
                    active
                      ? "bg-emerald-50 text-emerald-800"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section
          className={`min-w-0 flex-1 ${
            dense ? "px-4 py-3 sm:px-5" : "px-4 py-5 sm:px-6 lg:px-8"
          }`}
        >
          <div className="mb-3 flex items-center gap-2 md:hidden">
            <details className="relative">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
                メニュー
              </summary>
              <div className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                {workflowSteps.map((item) => (
                  <Link
                    className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
          </div>

          {showHeader ? (
            <div
              className={`flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-end sm:justify-between ${
                dense ? "mb-3 pb-3" : "mb-6 gap-4 pb-5"
              }`}
            >
              <div>
                {eyebrow ? (
                  <p className="text-sm font-medium text-emerald-700">{eyebrow}</p>
                ) : null}
                {title ? (
                  <h2
                    className={`font-semibold text-slate-950 ${
                      dense ? "text-xl" : "text-2xl"
                    } ${eyebrow ? "mt-1" : ""}`}
                  >
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <p
                    className={`max-w-3xl text-sm text-slate-600 ${
                      dense ? "mt-1 leading-5" : "mt-2 leading-6"
                    }`}
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              {action ? (
                <Link
                  className={`inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 ${
                    dense ? "h-9" : "h-10"
                  }`}
                  href={action.href}
                >
                  {action.label}
                </Link>
              ) : null}
            </div>
          ) : null}
          {children}
        </section>
      </div>
    </main>
  );
}
