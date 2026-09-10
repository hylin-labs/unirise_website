export const visitorStatsSchema = {
  chatRateLimits: 'site_chat_rate_limits',
  visitorDays: 'site_visitor_days',
  visitors: 'site_visitors',
  totals: 'site_visitor_totals',
} as const;

export const uniriseSchema = {
  adminUsers: 'admin_users',
  adminLoginCodes: 'admin_login_codes',
  adminSessions: 'admin_sessions',
  adminAuditLog: 'admin_audit_log',
  managedNews: 'managed_news',
  managedDownloads: 'managed_downloads',
  chatKnowledge: 'chat_knowledge',
  chatLeads: 'chat_leads',
  siteEvents: 'site_events',
  chatQuestions: 'chat_question_log',
  publicContent: 'public_content',
  contentTranslations: 'content_translations',
  translationJobs: 'translation_jobs',
  translationJobItems: 'translation_job_items',
} as const;

export type VisitorStats = {
  total: number;
  today: number;
};
