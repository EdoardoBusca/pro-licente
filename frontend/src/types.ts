// ─── Backend result shape ─────────────────────────────────────────────────────
// Mirrors the dict returned by engine.py → train_logic()

export interface LeaderboardEntry {
  name:    string;
  r2:      number;
  mae:     number;
  rmse:    number;
  mape:    number;
  cv_mape: number | null;
}

export interface FeatureImportanceEntry {
  feature:    string;
  importance: number;
}

export interface DominanceVerification {
  sq_ft_total_in_top5: boolean;
  zip_code_in_top5:    boolean;
  status:              'PASS' | 'CHECK';
  message:             string;
}

export interface FeatureEngineering {
  total_features:              number;
  temporal_features:           number;
  categorical_features_onehot: number;
  leakage_removed:             string[];
  categorical_encoding:        string;
  allowed_input_features:      string[];
  dominance_verification:      DominanceVerification;
}

export interface ResidualStats {
  mean:   number;
  std:    number;
  min:    number;
  max:    number;
  q1:     number;
  median: number;
  q3:     number;
}

export interface ModelDiagnostics {
  data_density:        string;
  confidence_level:    'High' | 'Medium' | 'Low';
  sample_size:         number;
  residual_stats:      ResidualStats;
  feature_engineering: FeatureEngineering;
}

export interface SalesVelocity {
  expected_days_to_sell: number | null;
  liquidity_score:       number | null;
  market_label:          string;
  narrative:             string;
}

export interface RoiHeatmapEntry {
  feature_x:  string;
  feature_y:  string;
  sales_lift: number;
}

export interface PriceDiscoveryEntry {
  name:   string;
  change: number;
  kind:   'baseline' | 'impact' | 'final';
}

export interface LeadLagEntry {
  lag:         number;
  correlation: number;
}

export interface YoyMetric {
  year:             number;
  price_avg:        number;
  yoy_appreciation: number;
  sample_count:     number;
}

export interface MarketDynamics {
  roi_heatmap:      RoiHeatmapEntry[];
  sales_velocity:   SalesVelocity;
  price_discovery:  PriceDiscoveryEntry[];
  lead_lag:         LeadLagEntry[];
  temporal_analysis: {
    market_cycle:              string;
    yoy_appreciation_metrics:  YoyMetric[];
    temporal_weighting:        string;
  };
}

export interface ValuationDeltaStats {
  mean_delta_pct:   number;
  median_delta_pct: number;
  min_delta_pct:    number;
  max_delta_pct:    number;
}

export interface ArbitrageSignal {
  property_idx:    number;
  delta_pct:       number;
  list_price:      number;
  ai_value:        number;
  potential_gain?: number;
  potential_loss?: number;
  alert:           string;
}

export interface Arbitrage {
  undervalued_count:     number;
  overpriced_count:      number;
  buy_signals:           ArbitrageSignal[];
  risk_signals:          ArbitrageSignal[];
  valuation_delta_stats: ValuationDeltaStats;
}

export interface DataQuality {
  total_rows:          number;
  train_rows?:         number;
  test_rows?:          number;
  split_ratio?:        string;
  warnings:            string[];
  outlier_row_numbers: number[];
  excluded_outliers:   number;
}

export interface ProjectionPoint {
  day:           string;
  val:           number;
  is_historical: boolean;
}

export interface PredictRequest {
  sq_ft_total: number;
  bedrooms?: number;
  bathrooms?: number;
  condition_score?: number;
  zip_code?: string;
  property_type?: string;
}

export interface PredictResult {
  predicted_price: number;
}

export interface TrainingResult {
  winner:                  string;
  r2_score:                number;
  mae:                     number;
  rmse:                    number;
  mape:                    number;
  residuals:               number[];
  train_size:              number;
  test_size:               number;
  split_ratio:             string;
  leaderboard:             LeaderboardEntry[];
  model_failures:          string[];
  insights:                { feature: string; influence: number }[];
  feature_importance:      FeatureImportanceEntry[];
  correlation_matrix:      { feature: string; correlation: number }[];
  correlation_lookup:      Record<string, number>;
  prediction_std:          number;
  composite_confidence_score: number;
  stratified_accuracy:     number;
  primary_metric:          string;
  ai_precision_label:      string;
  market_sentiment_monthly: number;
  projection:              ProjectionPoint[];
  historical_data:         ProjectionPoint[];
  full_chart_data:         ProjectionPoint[];
  model_diagnostics:       ModelDiagnostics;
  market_dynamics:         MarketDynamics;
  arbitrage:               Arbitrage;
  data_quality:            DataQuality;
}
