CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_login_codes (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts_remaining INTEGER NOT NULL DEFAULT 5,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX admin_sessions_active_idx ON admin_sessions (token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT REFERENCES admin_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE managed_news (
  id TEXT PRIMARY KEY,
  legacy_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  lead TEXT NOT NULL,
  image_url TEXT NOT NULL,
  highlights_json TEXT NOT NULL,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX managed_news_published_idx ON managed_news (status, published_at DESC);

CREATE TABLE managed_downloads (
  id TEXT PRIMARY KEY,
  legacy_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX managed_downloads_published_idx ON managed_downloads (status, published_at DESC);

CREATE TABLE chat_knowledge (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  href TEXT NOT NULL,
  body TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX chat_knowledge_published_idx ON chat_knowledge (status, published_at DESC);

CREATE TABLE chat_leads (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL CHECK (request_type IN ('quote', 'specialist')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  topic TEXT,
  message TEXT NOT NULL,
  source_path TEXT NOT NULL,
  visitor_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  email_delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX chat_leads_status_date_idx ON chat_leads (status, created_at DESC);

CREATE TABLE site_events (
  id TEXT PRIMARY KEY,
  visitor_hash TEXT,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX site_events_date_path_idx ON site_events (occurred_at DESC, path);

CREATE TABLE chat_question_log (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'unanswered')),
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX chat_question_log_outcome_date_idx ON chat_question_log (outcome, created_at DESC);

INSERT OR IGNORE INTO admin_users (id, email, role, enabled) VALUES ('hungyu@gmail.com', 'hungyu@gmail.com', 'admin', 1);

INSERT OR IGNORE INTO managed_news (id, legacy_id, title, lead, image_url, highlights_json, video_url, status, published_at) VALUES
  ('3944', '3944', '雞骨魚骨專用X光異物檢測機 Xavis', '專為魚刺、魚骨及雞骨等低密度異物設計的 X 光檢測系統。結合高解析 X 光成像與 AI 辨識技術，提升檢測精度與食品安全。', '/reference/original/59d79791614c286ba688923bb61c0027.jpg', '["可偵測魚刺、魚骨、雞骨等低密度異物，適用雞胸肉、雞腿肉、魚排、魚片、鮭魚與鱈魚。","高解析度感測器與 FSCAN AI 深度學習演算法，協助提高細小骨刺辨識率、降低漏檢與誤判。","IP69K 食品級衛生設計，可支援生鮮、冷藏、冷凍及熟食產品，並保存檢測影像與批次資料。"]', 'https://www.youtube.com/embed/3tIKwCNFBYU', 'published', CURRENT_TIMESTAMP),
  ('3943', '3943', 'M1 SF 皮帶稱重機和袋裝填充機 Manter', '專為易受損蔬果打造的自動化包裝系統。結合溫和秤重與自動袋裝填充，兼顧產品品質與包裝效率。', '/reference/original/832c31c5d6883b514158eb460ca7c076.jpg', '["皮帶式秤重減少產品落差，適用蘋果、梨子、柑橘、洋蔥與馬鈴薯等易碰傷產品。","精準控制每袋重量，降低超重填充與原料浪費，維持包裝的一致性。","可串接供料、分級、光學選別、封口、裝箱及棧板系統，形成完整自動化包裝產線。"]', 'https://www.youtube.com/embed/fp5eQ82bB3E', 'published', CURRENT_TIMESTAMP),
  ('3942', '3942', '多段式重量分級機 Xavis', '專為提升水產加工效率而設計的自動化分級設備。兼顧分級精度、作業效率與產品規格一致性。', '/reference/original/fc2a96f247a92a5c8f9c312cea0c60a9.jpg', '["產品置於托盤後即可自動秤重並依設定重量分級出料，降低人工分選時間。","可設定 3～7 個分級等級，最小可達 10 克級距，並以電子秤重系統與防水型電磁閥提升準確度。","快速拆裝射出成型托盤，配合下噴淋噴嘴與清潔刷，適合鮮魚、水產品與漁獲加工品。"]', 'https://www.youtube.com/embed/BMhuExZ65eM', 'published', CURRENT_TIMESTAMP),
  ('3941', '3941', '番茄自動包裝線 Manter', '專為番茄及易受損蔬果打造的自動化包裝系統。兼顧產品品質、包裝效率與產線彈性配置需求。', '/reference/original/163bb1825e00146110f9f80f0fe9a8ef.jpg', '["採用多頭組合秤進行高精度自動計量，減少產品損耗與重量誤差。","溫和輸送設計可降低碰撞、壓傷與果實破損，維持番茄與蔬果的新鮮外觀。","可支援網袋、PE 袋、立袋、透明盒與紙箱包裝，並整合自動棧板堆疊。"]', 'https://www.youtube.com/embed/tw9Dg7vM5Uk', 'published', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO managed_downloads (id, legacy_id, title, status, published_at) VALUES
  ('3853', '3853', 'NIHOT-回收再生', 'published', CURRENT_TIMESTAMP),
  ('77', '77', 'OPTIMUM-食材分選', 'published', CURRENT_TIMESTAMP),
  ('3854', '3854', 'PROMIX-塑膠化工', 'published', CURRENT_TIMESTAMP),
  ('78', '78', 'XAVIS-X光檢測', 'published', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO chat_knowledge (id, title, href, body, tags_json, status, published_at) VALUES
  ('catalog-services', '公司服務領域', '/', '合軒科技的公開服務領域為食品分選、X 光檢測、回收再生與塑膠化工。天然或加工食品原物料可依顏色或外觀瑕疵由自動化分選機完成品質等級分類。各類食品包裝型態可透過 X 光檢查，作為食品出廠前的安全把關。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-brands', '代理品牌', '/catalog?type=brand&id=89', '合軒科技網站列出的代理品牌為：OPTIMUM、XAVIS、Smart Grader、MEAF、PROMIX、SBI、NIR、NIHOT、Matthiessen、合軒。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-optimum', 'OPTIMUM 食材分選', '/catalog?type=brand&id=1', 'OPTIMUM 食材分選系列包括 NOVUS 皮帶式機型（適用新鮮、乾燥或冷凍產品）、VENTUS（適用堅果和乾果）、TRIPLUS 自由落體式機型（適用新鮮、乾燥或冷凍產品）及 MAGNUS（適用易碎水果）。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-xavis-xray', 'XAVIS 食品異物 X 光檢測', '/catalog?type=brand&id=2', 'XAVIS 食品 X 光檢測系列列有小包裝或未包裝、低密度中型包裝或散裝、高密度中型包裝、管道式、大型包裝、小型罐頭或瓶子包裝、大型罐頭或瓶子包裝，以及魚骨或雞骨專用的 X 光食品自動異物檢測機。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-xavis-weight', 'XAVIS 自動重量與重量分級檢測', '/catalog?type=brand&id=147', 'XAVIS 自動重量檢測機包括 CWF590W 輕量型、CWF590WR 滾輪式、CSCAN 自動重量檢測機及 CWIN69X 多列式重量檢測機。網站亦列有 XAVIS 重量分級機與 MDN-200AD、MDN-200AH 鋁箔金屬檢測機。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-smart-grader', 'Smart Grader 採樣分析', '/catalog?type=brand&id=111', 'Smart Grader 系列包括智慧採樣分析器與智慧分級機。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-meaf-promix', 'MEAF 與 PROMIX', '/catalog?type=brand&id=122', 'MEAF 提供板材押出生產線。PROMIX 物理發泡系列包括 P1 冷卻混合器與熔體混合器。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-sbi', 'SBI 測厚儀', '/catalog?type=brand&id=140', 'SBI 測厚儀系列包括 KAPA I 與 KAPA II 電容或渦流雙感測厚薄儀、KAPA IR 紅外線厚薄儀、XRS SOFT X-RAY 低能量 X 光厚薄儀、SHADOW 雷射陰影測量厚薄儀及 STG 雷射位移測量厚薄儀。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-nir', 'NIR 手持式分析儀', '/catalog?type=brand&id=112', 'NIR 系列包括手持式 NIR 分析儀（塑料用）、手持式 NIR 分析儀（紡織用）及手持螢幕 NIR 分析儀（塑料用）。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-nihot', 'NIHOT 回收再生', '/catalog?type=brand&id=7', 'NIHOT 回收再生系列包括 SDM 移動式風選機、SDI 風選機、WSF 風選機、DDS 風選機、SDX 風選機及碟篩。網站亦將回收再生列為公司服務領域。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-matthiessen', 'Matthiessen 與合軒設備', '/catalog?type=brand&id=137', 'Matthiessen 系列列有 SFIIIK3 破袋機。合軒設備列有渦電流分選機、磁滾筒、上吸式磁鐵及鋁罐分選機。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-contact', '聯絡與詢價', '/contact', '可使用網站的詢價系統提出產品詢問與資料索取。合軒科技電話為 06-3319283，Email 為 info-unirise@unirise.tw，地址為台南市東區裕義路598號。', '[]', 'published', CURRENT_TIMESTAMP),
  ('catalog-downloads', '下載專區', '/downloads?id=3853', '下載專區提供 NIHOT 回收再生、OPTIMUM 食材分選、PROMIX 塑膠化工及 XAVIS X 光檢測等分類的產品資料索取入口。', '[]', 'published', CURRENT_TIMESTAMP),
  ('news-3944', '最新消息：雞骨魚骨專用X光異物檢測機 Xavis', '/news?id=3944', '雞骨魚骨專用X光異物檢測機 Xavis。專為魚刺、魚骨及雞骨等低密度異物設計的 X 光檢測系統。結合高解析 X 光成像與 AI 辨識技術，提升檢測精度與食品安全。。可偵測魚刺、魚骨、雞骨等低密度異物，適用雞胸肉、雞腿肉、魚排、魚片、鮭魚與鱈魚。高解析度感測器與 FSCAN AI 深度學習演算法，協助提高細小骨刺辨識率、降低漏檢與誤判。IP69K 食品級衛生設計，可支援生鮮、冷藏、冷凍及熟食產品，並保存檢測影像與批次資料。', '[]', 'published', CURRENT_TIMESTAMP),
  ('news-3943', '最新消息：M1 SF 皮帶稱重機和袋裝填充機 Manter', '/news?id=3943', 'M1 SF 皮帶稱重機和袋裝填充機 Manter。專為易受損蔬果打造的自動化包裝系統。結合溫和秤重與自動袋裝填充，兼顧產品品質與包裝效率。。皮帶式秤重減少產品落差，適用蘋果、梨子、柑橘、洋蔥與馬鈴薯等易碰傷產品。精準控制每袋重量，降低超重填充與原料浪費，維持包裝的一致性。可串接供料、分級、光學選別、封口、裝箱及棧板系統，形成完整自動化包裝產線。', '[]', 'published', CURRENT_TIMESTAMP),
  ('news-3942', '最新消息：多段式重量分級機 Xavis', '/news?id=3942', '多段式重量分級機 Xavis。專為提升水產加工效率而設計的自動化分級設備。兼顧分級精度、作業效率與產品規格一致性。。產品置於托盤後即可自動秤重並依設定重量分級出料，降低人工分選時間。可設定 3～7 個分級等級，最小可達 10 克級距，並以電子秤重系統與防水型電磁閥提升準確度。快速拆裝射出成型托盤，配合下噴淋噴嘴與清潔刷，適合鮮魚、水產品與漁獲加工品。', '[]', 'published', CURRENT_TIMESTAMP),
  ('news-3941', '最新消息：番茄自動包裝線 Manter', '/news?id=3941', '番茄自動包裝線 Manter。專為番茄及易受損蔬果打造的自動化包裝系統。兼顧產品品質、包裝效率與產線彈性配置需求。。採用多頭組合秤進行高精度自動計量，減少產品損耗與重量誤差。溫和輸送設計可降低碰撞、壓傷與果實破損，維持番茄與蔬果的新鮮外觀。可支援網袋、PE 袋、立袋、透明盒與紙箱包裝，並整合自動棧板堆疊。', '[]', 'published', CURRENT_TIMESTAMP);
