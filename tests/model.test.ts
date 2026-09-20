import assert from "node:assert/strict";
import test from "node:test";
import { buildSummary, calories, cycleLocalDate, hours, workoutsForCycle } from "../src/model.js";
import type { WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout } from "../src/types.js";

const cycle: WhoopCycle = {
  id: 42,
  created_at: "2026-09-19T22:00:00.000Z",
  updated_at: "2026-09-20T22:00:00.000Z",
  start: "2026-09-19T22:00:00.000Z",
  end: "2026-09-20T22:00:00.000Z",
  timezone_offset: "+05:30",
  score_state: "SCORED",
  score: { strain: 12.4, kilojoule: 2092, average_heart_rate: 72 },
};

test("unit conversions and local cycle date", () => {
  assert.equal(hours(25_200_000), 7);
  assert.equal(hours(undefined), undefined);
  assert.equal(calories(2_092), 500);
  assert.equal(calories(undefined), undefined);
  assert.equal(cycleLocalDate(cycle.start, cycle.timezone_offset), "2026-09-20");
  assert.equal(cycleLocalDate("2026-09-20T01:00:00Z", "-05:00"), "2026-09-19");
  assert.equal(cycleLocalDate("2026-09-20T01:00:00Z", "invalid"), "2026-09-20");
});

test("workouts are assigned using WHOOP cycle boundaries", () => {
  const workouts = [
    { id: "before", start: "2026-09-19T21:59:00Z" },
    { id: "inside", start: "2026-09-20T12:00:00Z" },
    { id: "boundary", start: "2026-09-20T22:00:00Z" },
  ] as WhoopWorkout[];
  assert.deepEqual(
    workoutsForCycle(cycle, workouts).map((workout) => workout.id),
    ["inside"],
  );
});

test("summary maps WHOOP scores into one stable daily record", () => {
  const recovery = {
    cycle_id: 42,
    sleep_id: "sleep-1",
    created_at: "2026-09-20T06:00:00Z",
    updated_at: "2026-09-20T06:00:00Z",
    score_state: "SCORED",
    score: { recovery_score: 78, hrv_rmssd_milli: 52.1 },
  } satisfies WhoopRecovery;
  const sleep = {
    id: "sleep-1",
    cycle_id: 42,
    created_at: "2026-09-20T06:00:00Z",
    updated_at: "2026-09-20T06:00:00Z",
    start: "2026-09-19T22:30:00Z",
    end: "2026-09-20T06:30:00Z",
    nap: false,
    score_state: "SCORED",
    score: {
      sleep_performance_percentage: 91,
      stage_summary: {
        total_in_bed_time_milli: 28_800_000,
        total_light_sleep_time_milli: 14_400_000,
        total_slow_wave_sleep_time_milli: 5_400_000,
        total_rem_sleep_time_milli: 5_400_000,
        total_awake_time_milli: 3_600_000,
      },
    },
  } satisfies WhoopSleep;
  const workout = {
    id: "workout-1",
    created_at: "2026-09-20T12:00:00Z",
    updated_at: "2026-09-20T13:00:00Z",
    start: "2026-09-20T12:00:00Z",
    end: "2026-09-20T13:00:00Z",
    sport_id: 1,
    sport_name: "running",
    score_state: "SCORED",
    score: { strain: 8.5, kilojoule: 418.4 },
  } satisfies WhoopWorkout;

  const summary = buildSummary(
    cycle,
    recovery,
    sleep,
    [workout],
    new Date("2026-09-20T23:00:00Z"),
  );
  assert.equal(summary.cycleId, "42");
  assert.ok(summary.properties.Name);
  assert.ok(summary.properties["Recovery Score"]);
  assert.ok(summary.properties["Sleep Duration (h)"]);
  assert.ok(summary.properties["Workout Activities"]);
  assert.equal(summary.upstreamUpdatedAt, cycle.updated_at);
});

test("summary tolerates pending recovery and sleep data", () => {
  const summary = buildSummary(cycle, null, null, [], new Date("2026-09-20T23:00:00Z"));

  assert.equal(summary.cycleId, "42");
  assert.equal(summary.properties["Recovery Score"], undefined);
  assert.equal(summary.properties["Sleep Duration (h)"], undefined);
  assert.deepEqual(summary.properties["Recovery Status"], [["Not available"]]);
  assert.deepEqual(summary.properties["Sleep Status"], [["Not available"]]);
  assert.deepEqual(summary.properties["Workout Count"], [["0"]]);
});

test("summary aggregates workouts and keeps the latest upstream timestamp", () => {
  const workouts = [
    {
      id: "one",
      created_at: "2026-09-20T10:00:00Z",
      updated_at: "2026-09-20T11:00:00Z",
      start: "2026-09-20T10:00:00Z",
      end: "2026-09-20T11:00:00Z",
      sport_id: 1,
      sport_name: "running",
      score_state: "SCORED",
      score: { strain: 4.25, kilojoule: 209.2 },
    },
    {
      id: "two",
      created_at: "2026-09-20T14:00:00Z",
      updated_at: "2026-09-21T01:00:00Z",
      start: "2026-09-20T14:00:00Z",
      end: "2026-09-20T15:00:00Z",
      sport_id: 1,
      sport_name: "running",
      score_state: "SCORED",
      score: { strain: 3.75, kilojoule: 209.2 },
    },
  ] satisfies WhoopWorkout[];

  const summary = buildSummary(cycle, null, null, workouts);
  assert.deepEqual(summary.properties["Workout Count"], [["2"]]);
  assert.deepEqual(summary.properties["Workout Activities"], [["running"]]);
  assert.deepEqual(summary.properties["Workout Strain Total"], [["8"]]);
  assert.deepEqual(summary.properties["Workout Calories"], [["100"]]);
  assert.equal(summary.upstreamUpdatedAt, "2026-09-21T01:00:00Z");
});

test("an open cycle uses the supplied current time as its upper boundary", () => {
  const openCycle = { ...cycle };
  delete openCycle.end;
  const workouts = [
    { id: "inside", start: "2026-09-20T10:00:00Z" },
    { id: "future", start: "2026-09-21T10:00:00Z" },
  ] as WhoopWorkout[];

  assert.deepEqual(
    workoutsForCycle(openCycle, workouts, new Date("2026-09-20T12:00:00Z")).map(
      (workout) => workout.id,
    ),
    ["inside"],
  );
});
