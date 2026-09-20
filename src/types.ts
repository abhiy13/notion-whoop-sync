export type ScoreState = "SCORED" | "PENDING_SCORE" | "UNSCORABLE" | string;

export interface WhoopCycle {
  id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end?: string;
  timezone_offset?: string;
  score_state: ScoreState;
  score?: {
    strain?: number;
    kilojoule?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
  };
}

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string;
  created_at: string;
  updated_at: string;
  score_state: ScoreState;
  score?: {
    user_calibrating?: boolean;
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}

export interface WhoopSleep {
  id: string;
  cycle_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset?: string;
  nap: boolean;
  score_state: ScoreState;
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_no_data_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
      sleep_cycle_count?: number;
      disturbance_count?: number;
    };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
}

export interface WhoopWorkout {
  id: string;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  sport_id: number;
  sport_name?: string;
  score_state: ScoreState;
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
  };
}

export interface WhoopCollection<T> {
  records: T[];
  next_token?: string;
}
