import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/ui";

export function DatabaseUnavailable({
  eyebrow = "Workspace",
  message,
}: {
  eyebrow?: string;
  message: string;
}) {
  return (
    <AppShell
      eyebrow={eyebrow}
      title="Database connection needed"
      description="SalesAI reads the outreach workflow from PostgreSQL. Start the local database, apply migrations, then refresh this page."
      action={{ label: "Open Leads", href: "/leads" }}
    >
      <SectionCard title="PostgreSQL is unavailable">
        <div className="space-y-4 text-sm text-slate-600">
          <p>{message}</p>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-700">
            <p>npm run dev:up</p>
            <p>npm run db:migrate</p>
            <p>npm run db:seed</p>
          </div>
          <p>
            The default local URL expects PostgreSQL on port 5433 with a
            database named salesai.
          </p>
        </div>
      </SectionCard>
    </AppShell>
  );
}
