import Link from "next/link";
import { workflowSteps } from "@/lib/navigation";

type PlaceholderPageProps = {
  title: string;
  description: string;
  phase: string;
  nextActions: string[];
};

export function PlaceholderPage({
  title,
  description,
  phase,
  nextActions,
}: PlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link className="text-sm font-medium text-emerald-700" href="/">
              SalesAI
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              {title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          </div>
          <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            {phase}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-md border border-slate-200 bg-white p-3">
            <nav className="space-y-1">
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

          <section className="rounded-md border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-950">
              Planned first controls
            </h2>
            <ul className="mt-4 grid gap-3">
              {nextActions.map((action) => (
                <li
                  className="rounded-md border border-slate-200 px-4 py-3 text-sm text-slate-700"
                  key={action}
                >
                  {action}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
