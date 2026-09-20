import type {
  WhoopCollection,
  WhoopCycle,
  WhoopRecovery,
  WhoopSleep,
  WhoopWorkout,
} from "./types.js";

const API_BASE = "https://api.prod.whoop.com/developer/v2";

export interface CollectionParams {
  start?: string;
  end?: string;
  nextToken?: string;
  limit?: number;
}

export interface WhoopClient {
  cycles(params?: CollectionParams): Promise<WhoopCollection<WhoopCycle>>;
  allCycles(params?: CollectionParams): Promise<WhoopCycle[]>;
  recovery(cycleId: number): Promise<WhoopRecovery | null>;
  sleep(cycleId: number): Promise<WhoopSleep | null>;
  allWorkouts(params?: CollectionParams): Promise<WhoopWorkout[]>;
}

type WaitForPacer = () => Promise<void>;

function queryString(params: CollectionParams): string {
  const query = new URLSearchParams();
  if (params.start) query.set("start", params.start);
  if (params.end) query.set("end", params.end);
  if (params.nextToken) query.set("nextToken", params.nextToken);
  query.set("limit", String(Math.min(params.limit ?? 25, 25)));
  return query.toString();
}

export function createWhoopClient(accessToken: string, wait: WaitForPacer): WhoopClient {
  async function get<T>(path: string, allowNotFound = false): Promise<T | null> {
    await wait();
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`WHOOP ${path} failed (${response.status}): ${body.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  }

  async function collection<T>(path: string, params: CollectionParams = {}) {
    return (await get<WhoopCollection<T>>(`${path}?${queryString(params)}`))!;
  }

  async function all<T>(path: string, params: CollectionParams = {}): Promise<T[]> {
    const records: T[] = [];
    let nextToken = params.nextToken;
    do {
      const page = await collection<T>(
        path,
        nextToken ? { ...params, nextToken } : params,
      );
      records.push(...page.records);
      nextToken = page.next_token;
    } while (nextToken);
    return records;
  }

  return {
    cycles: (params = {}) => collection<WhoopCycle>("/cycle", params),
    allCycles: (params = {}) => all<WhoopCycle>("/cycle", params),
    recovery: (cycleId) =>
      get<WhoopRecovery>(`/cycle/${encodeURIComponent(cycleId)}/recovery`, true),
    sleep: (cycleId) =>
      get<WhoopSleep>(`/cycle/${encodeURIComponent(cycleId)}/sleep`, true),
    allWorkouts: (params = {}) => all<WhoopWorkout>("/activity/workout", params),
  };
}
