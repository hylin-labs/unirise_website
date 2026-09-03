export const visitorStatsSchema = {
  visitorDays: 'site_visitor_days',
  visitors: 'site_visitors',
  totals: 'site_visitor_totals',
} as const;

export type VisitorStats = {
  total: number;
  today: number;
};
