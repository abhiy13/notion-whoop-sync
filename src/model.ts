import * as Builder from "@notionhq/workers/builder";
import type { WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout } from "./types.js";

export interface DailySummary {
  cycleId: string;
  upstreamUpdatedAt: string;
  properties: {
    "Cycle ID": ReturnType<typeof Builder.richText>;
    [name: string]: ReturnType<typeof Builder.richText>;
  };
}

function numberProperty(name: string, value: number | undefined) {
  return value === undefined || !Number.isFinite(value)
    ? {}
    : { [name]: Builder.number(value) };
}

function dateTimeProperty(name: string, value: string | undefined) {
  return value ? { [name]: Builder.dateTime(value) } : {};
}

export function hours(milliseconds: number | undefined): number | undefined {
  return milliseconds === undefined
    ? undefined
    : Math.round((milliseconds / 3_600_000) * 1000) / 1000;
}

export function calories(kilojoules: number | undefined): number | undefined {
  return kilojoules === undefined
    ? undefined
    : Math.round((kilojoules / 4.184) * 10) / 10;
}

export function cycleLocalDate(start: string, offset = "+00:00"): string {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  const direction = match?.[1] === "-" ? -1 : 1;
  const offsetMinutes = match
    ? direction * (Number(match[2]) * 60 + Number(match[3]))
    : 0;
  return new Date(Date.parse(start) + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function workoutsForCycle(
  cycle: WhoopCycle,
  workouts: WhoopWorkout[],
  now = new Date(),
): WhoopWorkout[] {
  const start = Date.parse(cycle.start);
  const end = cycle.end ? Date.parse(cycle.end) : now.getTime();
  return workouts.filter((workout) => {
    const workoutStart = Date.parse(workout.start);
    return workoutStart >= start && workoutStart < end;
  });
}

export function buildSummary(
  cycle: WhoopCycle,
  recovery: WhoopRecovery | null,
  sleep: WhoopSleep | null,
  workouts: WhoopWorkout[],
  syncedAt = new Date(),
): DailySummary {
  const cycleScore = cycle.score ?? {};
  const recoveryScore = recovery?.score ?? {};
  const sleepScore = sleep?.score ?? {};
  const stages = sleepScore.stage_summary ?? {};
  const date = cycleLocalDate(cycle.start, cycle.timezone_offset);
  const workoutKilojoules = workouts.reduce(
    (sum, workout) => sum + (workout.score?.kilojoule ?? 0),
    0,
  );
  const workoutStrain = workouts.reduce(
    (sum, workout) => sum + (workout.score?.strain ?? 0),
    0,
  );
  const activities = [
    ...new Set(workouts.map((workout) => workout.sport_name ?? `Sport ${workout.sport_id}`)),
  ];
  const totalSleep = [
    stages.total_light_sleep_time_milli,
    stages.total_slow_wave_sleep_time_milli,
    stages.total_rem_sleep_time_milli,
  ].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const updatedCandidates = [
    cycle.updated_at,
    recovery?.updated_at,
    sleep?.updated_at,
    ...workouts.map((workout) => workout.updated_at),
  ].filter((value): value is string => Boolean(value));
  const upstreamUpdatedAt = updatedCandidates.sort().at(-1) ?? syncedAt.toISOString();

  return {
    cycleId: String(cycle.id),
    upstreamUpdatedAt,
    properties: {
      Name: Builder.title(`WHOOP — ${date}`),
      Date: Builder.date(date),
      "Cycle ID": Builder.richText(String(cycle.id)),
      "Cycle Start": Builder.dateTime(cycle.start),
      ...dateTimeProperty("Cycle End", cycle.end),
      "Cycle Status": Builder.richText(cycle.score_state),
      ...numberProperty("Day Strain", cycleScore.strain),
      ...numberProperty("Calories", calories(cycleScore.kilojoule)),
      ...numberProperty("Average HR", cycleScore.average_heart_rate),
      ...numberProperty("Max HR", cycleScore.max_heart_rate),
      "Recovery Status": Builder.richText(recovery?.score_state ?? "Not available"),
      ...numberProperty("Recovery Score", recoveryScore.recovery_score),
      ...numberProperty("Resting HR", recoveryScore.resting_heart_rate),
      ...numberProperty("HRV (ms)", recoveryScore.hrv_rmssd_milli),
      ...numberProperty("SpO2 (%)", recoveryScore.spo2_percentage),
      ...numberProperty("Skin Temp (C)", recoveryScore.skin_temp_celsius),
      "Sleep ID": Builder.richText(sleep?.id ?? ""),
      "Sleep Status": Builder.richText(sleep?.score_state ?? "Not available"),
      ...dateTimeProperty("Sleep Start", sleep?.start),
      ...dateTimeProperty("Sleep End", sleep?.end),
      ...numberProperty("Sleep Performance (%)", sleepScore.sleep_performance_percentage),
      ...numberProperty("Sleep Efficiency (%)", sleepScore.sleep_efficiency_percentage),
      ...numberProperty("Sleep Consistency (%)", sleepScore.sleep_consistency_percentage),
      ...numberProperty("Respiratory Rate", sleepScore.respiratory_rate),
      ...numberProperty("Time in Bed (h)", hours(stages.total_in_bed_time_milli)),
      ...numberProperty("Sleep Duration (h)", sleep ? hours(totalSleep) : undefined),
      ...numberProperty("Light Sleep (h)", hours(stages.total_light_sleep_time_milli)),
      ...numberProperty("Deep Sleep (h)", hours(stages.total_slow_wave_sleep_time_milli)),
      ...numberProperty("REM Sleep (h)", hours(stages.total_rem_sleep_time_milli)),
      ...numberProperty("Awake (h)", hours(stages.total_awake_time_milli)),
      ...numberProperty("Sleep Cycles", stages.sleep_cycle_count),
      ...numberProperty("Disturbances", stages.disturbance_count),
      "Workout Count": Builder.number(workouts.length),
      "Workout Activities": Builder.richText(activities.join(", ")),
      "Workout Strain Total": Builder.number(Math.round(workoutStrain * 100) / 100),
      "Workout Calories": Builder.number(calories(workoutKilojoules) ?? 0),
      "Synced At": Builder.dateTime(syncedAt.toISOString()),
    },
  };
}
