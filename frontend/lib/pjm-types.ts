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
