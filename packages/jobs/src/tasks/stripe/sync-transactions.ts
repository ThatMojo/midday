import { createClient } from "@midday/supabase/job";
import { logger, schemaTask } from "@trigger.dev/sdk";
import Stripe from "stripe";
import { z } from "zod";

// Only syncs the Stripe processor FEE portion of each balance transaction,
// not the gross charge/payout amount. The gross amount already lands in the
// team's real bank account as a payout, which the bank sync picks up
// separately - syncing it here too would double-count it as revenue. The
// fee is the one cost that never shows up anywhere else (Stripe deducts it
// before payout), so that's the only thing we book as an expense.
export const syncStripeTransactions = schemaTask({
  id: "sync-stripe-transactions",
  maxDuration: 300,
  queue: {
    concurrencyLimit: 5,
  },
  schema: z.object({
    teamId: z.string().uuid(),
  }),
  run: async ({ teamId }) => {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      logger.warn("STRIPE_SECRET_KEY not set, skipping Stripe sync");
      return;
    }

    const stripe = new Stripe(secretKey);
    const supabase = createClient();

    let startingAfter: string | undefined;
    let hasMore = true;
    let syncedCount = 0;

    while (hasMore) {
      const balanceTransactions = await stripe.balanceTransactions.list({
        limit: 100,
        starting_after: startingAfter,
      });

      const formatted = balanceTransactions.data
        .filter((bt) => bt.fee > 0)
        .map((bt) => ({
          name: `Stripe fee (${bt.description || bt.reporting_category || bt.type})`,
          description: bt.type,
          date: new Date(bt.created * 1000).toISOString().split("T")[0]!,
          amount: -(bt.fee / 100),
          currency: bt.currency.toUpperCase(),
          method: "fee" as const,
          category_slug: "processor-fees",
          internal_id: `stripe_fee_${teamId}_${bt.id}`,
          team_id: teamId,
          status: "posted" as const,
          manual: false,
          // The category is already known here, so there's nothing for the
          // AI enrichment job to add - mark it done up front so the
          // dashboard doesn't show a permanent "Analyzing" spinner.
          enrichment_completed: true,
        }));

      if (formatted.length > 0) {
        await supabase
          .from("transactions")
          .upsert(formatted, {
            onConflict: "internal_id",
            ignoreDuplicates: true,
          })
          .throwOnError();

        syncedCount += formatted.length;
      }

      hasMore = balanceTransactions.has_more;
      startingAfter = balanceTransactions.data.at(-1)?.id;
    }

    logger.info("Stripe transactions synced", { teamId, syncedCount });
  },
});
