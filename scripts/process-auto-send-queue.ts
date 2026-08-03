import "dotenv/config";
import { processDueAutoSendQueue } from "@/lib/outreach/auto-send-queue";

async function main() {
  const args = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value = "true"] = arg.replace(/^--/, "").split("=");
      return [key, value];
    }),
  );
  const limit = Number(args.get("limit") ?? "10");

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("limit must be a positive number.");
  }

  const results = await processDueAutoSendQueue(limit);

  if (results.length === 0) {
    console.log("No queue items were due.");
    return;
  }

  for (const result of results) {
    console.log(
      [
        result.ok ? "sent" : "failed",
        result.item.companyName,
        result.item.recipientEmail,
        result.message,
      ].join(" | "),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
