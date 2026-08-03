type BadgeTone = "slate" | "emerald" | "amber" | "rose" | "sky";

const badgeTones: Record<BadgeTone, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
};

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex h-7 items-center whitespace-nowrap rounded-md border px-2 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </section>
  );
}

export function SectionCard({
  title,
  children,
  compact = false,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col rounded-md border border-slate-200 bg-white shadow-sm ${
        compact ? "p-3" : "p-5"
      } ${className}`}
    >
      <h3
        className={`font-semibold text-slate-950 ${
          compact ? "text-sm" : "text-base"
        }`}
      >
        {title}
      </h3>
      <div
        className={`flex min-h-0 flex-1 flex-col ${compact ? "mt-2" : "mt-4"}`}
      >
        {children}
      </div>
    </section>
  );
}

export function statusTone(status: string): BadgeTone {
  if (
    ["contacted", "replied", "won", "sent", "done", "active"].includes(status)
  ) {
    return "emerald";
  }
  if (
    [
      "researched",
      "qualified",
      "follow_up",
      "approved",
      "open",
      "contact ready",
      "follow-up due",
    ].includes(status)
  ) {
    return "sky";
  }
  if (
    [
      "new",
      "draft",
      "needs research",
      "needs draft",
      "draft ready",
      "can follow-up",
    ].includes(status)
  ) {
    return "amber";
  }
  if (["failed", "skipped"].includes(status)) return "rose";
  return "slate";
}
