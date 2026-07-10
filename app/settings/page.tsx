import { AppShell } from "@/components/app-shell";
import { Badge, SectionCard } from "@/components/ui";

const services = [
  {
    name: "PostgreSQL",
    status: "later",
    detail: "Prisma schema is ready. Local database can be connected later.",
  },
  {
    name: "Gmail API",
    status: "planned",
    detail: "OAuth variables are listed in .env.example.",
  },
  {
    name: "SearXNG",
    status: "planned",
    detail: "Will power public company search.",
  },
  {
    name: "AI provider",
    status: "planned",
    detail: "Ollama or OpenAI-compatible API can generate research and emails.",
  },
];

export default function SettingsPage() {
  return (
    <AppShell
      eyebrow="Configuration"
      title="Settings"
      description="Preview the integration status area. Nothing here requires secrets or a running database yet."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {services.map((service) => (
          <SectionCard key={service.name} title={service.name}>
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm leading-6 text-slate-600">{service.detail}</p>
              <Badge tone="amber">{service.status}</Badge>
            </div>
          </SectionCard>
        ))}
      </div>
    </AppShell>
  );
}
