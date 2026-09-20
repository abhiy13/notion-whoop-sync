import { Worker } from "@notionhq/workers";
import * as Schema from "@notionhq/workers/schema";
import { buildSummary, workoutsForCycle } from "./model.js";
import type { WhoopCycle, WhoopWorkout } from "./types.js";
import { createWhoopClient } from "./whoop.js";

const worker = new Worker();
export default worker;

const whoopAuth = worker.oauth("whoopAuth", {
  name: "WHOOP",
  authorizationEndpoint: "https://api.prod.whoop.com/oauth/oauth2/auth",
  tokenEndpoint: "https://api.prod.whoop.com/oauth/oauth2/token",
  scope: "offline read:cycles read:recovery read:sleep read:workout",
  clientId: process.env.WHOOP_CLIENT_ID ?? "",
  clientSecret: process.env.WHOOP_CLIENT_SECRET ?? "",
  accessTokenExpireMs: 3_600_000,
});

const whoopApi = worker.pacer("whoopApi", {
  allowedRequests: 90,
  intervalMs: 60_000,
});

const dailyHealth = worker.database("dailyHealth", {
  type: "managed",
  initialTitle: "WHOOP Daily Health",
  primaryKeyProperty: "Cycle ID",
  schema: {
    properties: {
      Name: Schema.title(),
      Date: Schema.date(),
      "Cycle ID": Schema.richText(),
      "Cycle Start": Schema.date(),
      "Cycle End": Schema.date(),
      "Cycle Status": Schema.richText(),
      "Day Strain": Schema.number(),
      Calories: Schema.number(),
      "Average HR": Schema.number(),
      "Max HR": Schema.number(),
      "Recovery Status": Schema.richText(),
      "Recovery Score": Schema.number(),
      "Resting HR": Schema.number(),
      "HRV (ms)": Schema.number(),
      "SpO2 (%)": Schema.number(),
      "Skin Temp (C)": Schema.number(),
      "Sleep ID": Schema.richText(),
      "Sleep Status": Schema.richText(),
      "Sleep Start": Schema.date(),
      "Sleep End": Schema.date(),
      "Sleep Performance (%)": Schema.number(),
      "Sleep Efficiency (%)": Schema.number(),
      "Sleep Consistency (%)": Schema.number(),
      "Respiratory Rate": Schema.number(),
      "Time in Bed (h)": Schema.number(),
      "Sleep Duration (h)": Schema.number(),
      "Light Sleep (h)": Schema.number(),
      "Deep Sleep (h)": Schema.number(),
      "REM Sleep (h)": Schema.number(),
      "Awake (h)": Schema.number(),
      "Sleep Cycles": Schema.number(),
      Disturbances: Schema.number(),
      "Workout Count": Schema.number(),
      "Workout Activities": Schema.richText(),
      "Workout Strain Total": Schema.number(),
      "Workout Calories": Schema.number(),
      "Synced At": Schema.date(),
    },
  },
});

async function enrichCycles(
  cycles: WhoopCycle[],
  workouts: WhoopWorkout[] | null,
  now: Date,
) {
  const accessToken = await whoopAuth.accessToken();
  const api = createWhoopClient(accessToken, () => whoopApi.wait());
  const changes = [];

  for (const cycle of cycles) {
    const [recovery, sleep, cycleWorkouts] = await Promise.all([
      api.recovery(cycle.id),
      api.sleep(cycle.id),
      workouts
        ? Promise.resolve(workoutsForCycle(cycle, workouts, now))
        : api.allWorkouts({ start: cycle.start, end: cycle.end ?? now.toISOString() }),
    ]);
    const summary = buildSummary(cycle, recovery, sleep, cycleWorkouts, now);
    changes.push({
      type: "upsert" as const,
      key: summary.cycleId,
      properties: summary.properties,
      upstreamUpdatedAt: summary.upstreamUpdatedAt,
    });
  }
  return changes;
}

worker.sync("whoopDaily", {
  database: dailyHealth,
  mode: "incremental",
  schedule: "1d",
  execute: async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const accessToken = await whoopAuth.accessToken();
    const api = createWhoopClient(accessToken, () => whoopApi.wait());
    const [cycles, workouts] = await Promise.all([
      api.allCycles({ start, end: now.toISOString() }),
      api.allWorkouts({ start, end: now.toISOString() }),
    ]);
    return {
      changes: await enrichCycles(cycles, workouts, now),
      hasMore: false,
    };
  },
});

interface BackfillState {
  nextToken?: string;
}

worker.sync("whoopBackfill", {
  database: dailyHealth,
  mode: "replace",
  schedule: "manual",
  execute: async (state: BackfillState | undefined) => {
    const now = new Date();
    const accessToken = await whoopAuth.accessToken();
    const api = createWhoopClient(accessToken, () => whoopApi.wait());
    const page = await api.cycles(
      state?.nextToken ? { nextToken: state.nextToken, limit: 10 } : { limit: 10 },
    );
    const changes = await enrichCycles(page.records, null, now);
    if (page.next_token) {
      return {
        changes,
        hasMore: true,
        nextState: { nextToken: page.next_token },
      };
    }
    return { changes, hasMore: false };
  },
});
