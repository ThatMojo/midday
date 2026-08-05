import { schedules } from "@trigger.dev/sdk";
import { syncStripeTransactions } from "./sync-transactions";

// One schedule per team (externalId), created via schedules.create the same
// way the bank sync scheduler is set up.
export const stripeSyncScheduler = schedules.task({
  id: "stripe-sync-scheduler",
  maxDuration: 60,
  run: async (payload) => {
    if (process.env.TRIGGER_ENVIRONMENT !== "production") return;

    const teamId = payload.externalId;

    if (!teamId) {
      throw new Error("teamId is required");
    }

    await syncStripeTransactions.trigger({ teamId });
  },
});
