const defaultBaseUrl = "https://sales-ai-seven.vercel.app";
const baseUrl =
  process.argv[2] ??
  process.env.SMOKE_BASE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  defaultBaseUrl;

async function main() {
  const url = new URL("/leads", normalizeBaseUrl(baseUrl));
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`GET ${url.toString()} failed with ${response.status}`);
  }

  const html = await response.text();
  const text = html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ");
  const rangeMatch = text.match(/(\d+)件中\s*(\d+)-(\d+)件を表示/);
  const legacyMatch = text.match(/(\d+)件中\s*(\d+)件を表示/);
  const totalCount = Number(rangeMatch?.[1] ?? legacyMatch?.[1] ?? 0);
  const pageStart = Number(rangeMatch?.[2] ?? (legacyMatch ? 1 : 0));
  const pageEnd = Number(rangeMatch?.[3] ?? legacyMatch?.[2] ?? 0);

  if (!rangeMatch && !legacyMatch) {
    throw new Error("Could not find the Lead CRM count text on /leads.");
  }

  if (totalCount <= 0 || pageStart <= 0 || pageEnd <= 0) {
    throw new Error(
      `/leads is reachable but does not show any rows: total=${totalCount}`,
    );
  }

  console.log(
    `Production smoke passed: /leads shows ${pageStart}-${pageEnd} of ${totalCount} leads.`,
  );
}

function normalizeBaseUrl(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

void main();
