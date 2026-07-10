import Link from "next/link";
import { workflowSteps } from "@/lib/navigation";

type AppShellProps = {
  eyebrow?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
  children: React.ReactNode;
};

export function AppShell({
  eyebrow = "SalesAI",
  title,
  description,
  action,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl">
        <aside className="hidden w-64 border-r border-slate-200 bg-white px-5 py-6 md:block">
          <Link href="/" className="block">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              SalesAI
            </p>
            <h1 className="mt-2 text-xl font-semibold text-slate-950">
              IT sales workspace
            </h1>
          </Link>
          <nav className="mt-8 space-y-1">
            {workflowSteps.map((item) => (
              <Link
                className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">{eyebrow}</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                {title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {description}
              </p>
            </div>
            {action ? (
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
                href={action.href}
              >
                {action.label}
              </Link>
            ) : null}
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
