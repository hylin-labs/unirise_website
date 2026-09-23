# GitHub 到 Cloudflare 原生遷移

## 目標

讓 `hylin-labs/unirise_website` 的 `main` 成為唯一程式碼來源，以手動核准的 GitHub Actions 工作流程部署 Cloudflare Worker、D1 與 R2。公開網域在切換前維持指向現有 Sites，避免中斷服務。

## 建立目標環境

在確認的 Cloudflare 帳戶建立獨立的正式資源：

- 一個 D1 資料庫，供 `DB` 綁定使用。
- 一個私有 R2 bucket，供 `DOCUMENTS` 綁定使用。
- 一個 Worker；第一次發布時由 GitHub Actions 建立。

不要重用不明來源的資料庫或 bucket，也不要在此階段變更 `unirise.craniai.com` 的 DNS。

## GitHub 設定

在 GitHub 儲存庫的 Actions variables 設定下列非機密值：

- `CLOUDFLARE_WORKER_NAME`
- `CLOUDFLARE_D1_DATABASE_NAME`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_R2_BUCKET_NAME`

在 `cloudflare-production` environment 設定下列 secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

在新的 Cloudflare Worker 設定下列執行環境值；機密值只存於 Cloudflare，不要存入 GitHub 或儲存庫：

- `GROQ_API_KEY`
- `RESEND_API_KEY`
- `ADMIN_AUTH_PEPPER`
- `ADMIN_PASSWORD_HASH`
- `ANALYTICS_HASH_PEPPER`
- `RESEND_FROM_EMAIL`

不要把任何金鑰提交到 Git。GitHub Actions 工作流程只會在手動執行、且輸入 `DEPLOY` 後才會發布。

## 資料遷移範圍

必須保留的內容包括：公開內容、最新消息、下載資料、知識庫、英文翻譯、技術文件的中繼資料、擷取段落、結構化事實，以及 R2 中的原始技術文件。

登入驗證碼、登入工作階段、速率限制與暫時性訪客識別不搬遷；切換後管理員需要重新登入。客戶詢問與分析資料需先以正式匯出保存，再依資料保留需求匯入新 D1。

現有 Sites 資料庫只能由部署擁有者進行完整 D1 匯出，且 R2 文件必須另行匯出。遷移前需記錄每張內容資料表的筆數與 R2 物件清單；匯入 Cloudflare 測試環境後，以相同清單逐項核對。

## 切換與回復

1. 在新的 Cloudflare Worker URL 測試首頁、英文頁、後台登入、技術文件上傳、聊天與詢價。
2. 核對內容資料表、文件數量與公開頁面資料均完整。
3. 先保存目前 Sites 版本與 DNS 記錄，再把 `unirise.craniai.com` 切到新的 Worker。
4. 若驗證失敗，立即將 DNS 切回目前 Sites；新 D1 與 R2 保留供診斷，不執行刪除。
