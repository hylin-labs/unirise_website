// Sites 執行環境無法直接連至 api.groq.com，因此統一經由 Unirise 專用 Worker。
export const GROQ_CHAT_ENDPOINT =
  'https://unirise-groq-proxy.hungyu.workers.dev/v1/chat/completions';
