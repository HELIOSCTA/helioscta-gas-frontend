export interface PjmLmpRow {
  datetime: string;
  date: string;
  hour_ending: number;
  hub: string;
  market: string; // "da" | "rt" | "dart"
  lmp_total: number;
  lmp_system_energy_price: number;
  lmp_congestion_price: number;
  lmp_marginal_loss_price: number;
}

export interface PjmLoadForecastRow {
  forecast_execution_datetime_utc: string;
  timezone: string;
  forecast_execution_datetime_local: string;
  forecast_rank: number;
  forecast_execution_date: string;
  forecast_datetime: string;
  forecast_date: string;
  hour_ending: number;
  region: string; // "RTO" | "MIDATL" | "WEST" | "SOUTH"
  forecast_load_mw: number;
}
