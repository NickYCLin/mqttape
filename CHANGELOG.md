# 更新日誌 (Changelog)

本專案遵循語意化版本（Semantic Versioning）發布，所有更新內容均以繁體中文條列說明。

---

## 未發布

---

## [0.12.1](https://github.com/NickYCLin/mqttape/compare/v0.12.0...v0.12.1) (2026-08-26)

### 🛠️ 問題修正與優化
* **預設介面語言**：
  - 首次開啟、未儲存有效偏好或瀏覽器儲存不可用時，一律使用繁體中文介面與 `zh-TW` 文件語系。
  - 使用者主動切換成英文後仍會保存並還原英文偏好。
* **Web Lite 載入效能**：
  - 將 React、Protobuf 與 CBOR 拆成獨立 Vendor Chunk，避免主要應用程式 Bundle 超過 Vite 建議大小。
* **本機 UI 測試隔離**：
  - Playwright 改用專用預覽連接埠，且不再沿用其他專案已啟動的服務，避免測試誤判。

---

## [0.12.0](https://github.com/NickYCLin/mqttape/compare/v0.11.0...v0.12.0) (2026-08-21)

### 🚀 新增功能
* **跨平台原生 x64 與 ARM64 封裝發布**：
  - 針對 Windows、macOS (Apple Silicon) 與 Linux 提供 GitHub Actions 原生 Runner 編譯之 ARM64 獨立安裝包與可攜式二進位檔。
  - 建立架構中立的 CBOR 打包機制，使用純 JavaScript 解碼核心，不強制依賴或打包原生加速器 `cbor-extract`。
* **Protobuf 與 Sparkplug B 訊息解碼檢視器**：
  - 支援匯入一個或多個 `.proto` Schema 定義檔並選擇目標 Message Type，以 CSP 安全的樹狀結構呈現已解碼欄位與未識別欄位診斷。
  - 支援自動辨識 `spBv1.0` Sparkplug B 主題，內建 Eclipse Tahu 官方 Schema，自動解析 Topic Metadata、Metric 摘要指標與完整 Payload 階層樹。
* **CBOR 與 CBOR Sequence 深度檢查器**：
  - 支援依 MQTT 5 Content-Type 自動偵測與啟發式二進位特徵識別，保留原始資料型別並提供邊界預覽與樹狀節點展開。
* **最多 8 組獨立隔離的 Broker 多工作階段 (Multi-Session Tabs)**：
  - 支援最多 8 個分頁並行連線，各分頁具備獨立的 MQTT Client、訂閱清單、封包時間軸、QoS 流程與重播狀態。
  - 背景分頁支援未讀訊息計數，並能在分頁間即時同步連線設定檔。
* **QoS 0/1/2 控制封包流程即時追蹤 (Packet Flow Inspector)**：
  - 支援以工作階段為單位的封包流程圖，標示 TX/RX 方向、Packet ID、DUP 重傳旗標、MQTT 5 Reason Code、傳輸耗時與握手等待狀態診斷。
* **WebSocket 進階認證與自訂握手 Header**：
  - 桌面版支援 HTTP Basic 認證、Bearer Token 與最多 32 組自訂握手 Header；桌面版與 Web Lite 皆支援最多 32 組 URL Query Parameters。
  - 敏感認證秘密透過作業系統安全儲存區（Electron `safeStorage`）加密保護，Web Lite 刻意略過秘密值以防洩漏。
* **MQTT Last Will (遺囑訊息) 完整配置**：
  - 支援 UTF-8、Hex、Base64 格式的 Will Payload，支援 QoS 0/1/2、Retain 旗標。
  - 支援 MQTT 5.0 的 Will Delay Interval、Message Expiry Interval、Content Type 與 Payload Format Indicator 屬性。
  - 桌面版 Will Payload 納入作業系統加密保護，且於擷取匯出檔中自動排除以維護隱私。
* **LoRaWAN Downlink 歷史追蹤與版本化 JSON 匯出**：
  - 支援依 Broker 或設定檔隔離記錄最多 1,000 筆已解析的 Downlink 事件，支援跨程式重啟持續追蹤。
  - 提供版本化 JSON 歷史記錄匯出（`mqttape-downlink-history` v1）與一鍵清除本機事件功能。
* **MQTT 5 Publish Properties 擷取、編輯與無損重播**：
  - 支援擷取與檢視 Content Type、Message Expiry、Correlation Data、可重複 User Properties 等中繼資料。
  - 具備 MQTT 3.1.1 相容防呆與重播安全過濾（自動略過連線層級之 Topic Alias 與 Broker 指派之 Subscription Identifier）。
* **SignPath 程式碼簽章流程與驗收手冊**：
  - 建立 `docs/SIGNPATH.md` 規範，為後續 Windows 開源簽章核准後提供標準化部署與驗收指南。

### 🛠️ 問題修正與優化
* **工作階段生命週期與記憶體釋放**：
  - 修正連線建立中關閉分頁時殘留隱藏 MQTT Client 或永久佔用工作階段插槽的問題。
  - 修正連線失敗（缺少 TLS 憑證、非 TLS 協定使用憑證、Web Lite 不合法 Last Will）停留在「連線中」的狀態異常。
  - 退出桌面 App 時主動等待 MQTT `DISCONNECT` 封包發送完成，避免 Broker 誤判異常中斷而觸發發布所有分頁的 Last Will。
  - 修正孤立 Client 錯誤訊息污染活躍分頁狀態的問題。
* **訊息緩衝區與渲染防護**：
  - 訊息緩衝區新增保留 Payload 總位元組上限機制，防止大量大型封包耗盡渲染程序記憶體。
  - 修正背景分頁在 5,000 則緩衝區滿載後停止累加未讀角標的問題。
  - 避免訊息重新渲染時非預期連帶觸發其他隱藏分頁工作區的無效計算。
* **LoRaWAN 歷史與儲存隔離**：
  - 輸入 Broker 主機名稱時不再逐鍵建立暫存歷史項目，統一依連線端點或選用設定檔歸戶。
  - 修正清除 Downlink 歷史後切換檢視或重啟 App 仍可能被重新匯入的問題。
  - 修正兩個連線至同一 Broker 的分頁互相覆寫本機 Downlink 事件的競態條件。
* **介面焦點與操作體驗**：
  - 修正刪除 WebSocket Header 或 Query 參數列時鍵盤焦點與輸入狀態跳移至下方欄位的問題。
  - 修正單一檢視匯入 Protobuf Schema 時被另一個未重新整理的檢視覆寫的狀態衝突。
  - 重播完成時狀態標籤改以綠色成功徽章顯示。
  - Apple Silicon macOS 於介面清楚標示未簽章手動更新原因，取代原先易誤解的架構不相容提示。

---

## [0.11.0](https://github.com/NickYCLin/mqttape/compare/v0.10.0...v0.11.0) (2026-08-17)

### 🚀 新增功能
* **全新外觀色彩主題系統**：
  - 提供 Midnight、Tape、Magenta、高對比、Daylight、Paper 六種原創主題與「跟隨系統」選項。
  - 頂端導覽列提供即時色票切換器，依色彩配置分組並於各裝置持久化偏好設定。
* **LoRaWAN Downlink 狀態追蹤**：
  - 支援 The Things Stack 與 ChirpStack 的 Downlink 提出、排隊、送出、確認與失敗生命週期追蹤。
  - 支援 The Things Stack 唯一 `correlation_ids` 與 ChirpStack `queueItemId` 精確事件關聯。

### 🛠️ 問題修正與優化
* **Design Token 設計系統**：
  - 建立統一的 Design Tokens（涵蓋色彩、排版、間距與圓角標準）。
  - 基底字級提升為 11–20 px，等寬字體保留專用於 MQTT 原始資料展示。
  - 以共用元件層全面重構統計卡片、工作階段工具列、訊息列與對話框。
* **品牌識別全面重繪**：
  - 重新設計卡帶 App 圖示、Favicon 與品牌標誌，強化錄音卡帶細節並配搭主題色系。
* **操作圖示精準校正**：
  - 校正重播、中斷連線、檢查更新與 LoRaWAN 建立器之圖示語意，避免借用無關圖示。
* **繁體中文說明文件**：
  - 全篇以繁體中文重寫專案 README，詳細記錄 Downlink 狀態追蹤與訂閱邊界。

---

## [0.10.0](https://github.com/NickYCLin/mqttape/compare/v0.9.0...v0.10.0) (2026-08-17)

### 🚀 新增功能
* **引導式 LoRaWAN Downlink 建立器**：
  - 支援 The Things Stack 與 ChirpStack 官方標準 MQTT 格式。
  - 支援 UTF-8 文字、Hex 位元組、Base64 與已解碼 JSON，提供即時 Topic 與 JSON Envelope 預覽。
  - 內建平台特定識別碼、FPort 範圍校驗與強制非 Retained 發布保護機制。

---

## [0.9.0](https://github.com/NickYCLin/mqttape/compare/v0.8.0...v0.9.0) (2026-08-17)

### 🚀 新增功能
* **自動 LoRaWAN Uplink 辨識**：
  - 自動識別 The Things Stack 與 ChirpStack JSON 事件。
  - 即時解析並呈現裝置識別、訊框計數、頻率、Data Rate、RSSI 與 SNR 摘要。
  - 內嵌 Base64 訊框預覽，並支援一鍵無損下載原始二進位訊框檔。

---

## [0.8.0](https://github.com/NickYCLin/mqttape/compare/v0.7.0...v0.8.0) (2026-08-17)

### 🚀 新增功能
* **桌面版背景自動更新機制**：
  - 整合 `electron-updater`，支援 Windows x64 與 Linux x64 安裝版在背景檢查、下載與一鍵重啟更新。
  - 自動產出並上傳 GitHub Release 差分更新中繼資料（`latest.yml` / `latest-linux.yml`）。

---

## [0.7.0](https://github.com/NickYCLin/mqttape/compare/v0.6.0...v0.7.0) (2026-08-17)

### 🚀 新增功能
* **繁體中文與英文多語系即時切換**：
  - 支援執行期在繁體中文與英文介面間自由切換，並於本機記住語言偏好。

---

## [0.6.0](https://github.com/NickYCLin/mqttape/compare/v0.5.0...v0.6.0) (2026-08-17)

### 🚀 新增功能
* **可重複使用的重播預設設定**：
  - 支援保存訊息方向、播放倍速與主題前綴重對應（Topic Remapping）預設方案。

---

## [0.5.0](https://github.com/NickYCLin/mqttape/compare/v0.4.0...v0.5.0) (2026-08-17)

### 🚀 新增功能
* **彈性擷取裁切與匯出預覽**：
  - 支援依訊息方向、主題/Payload 關鍵字與時間範圍進行精確裁切。
  - 提供即時匯出摘要預覽（包含訊息筆數、Payload 總量、Retained 計數與範例主題）。

### 🛠️ 問題修正與優化
* **Web Lite 開發模式相容性**：
  - 修正 Web Lite 開發模式於保留生產環境 CSP 安全限制下的 Vite 樣式載入問題。
* **開發工具鏈更新**：
  - 更新 Electron、測試、Lint 與 TypeScript 型別工具，並將 Dependabot 重大版本更新分開提交以便逐項驗證相容性。

---

## [0.4.0](https://github.com/NickYCLin/mqttape/compare/v0.3.0...v0.4.0) (2026-08-15)

### 🚀 新增功能
* **Payload 智慧型別判定**：
  - 自動分類空白、JSON、文字與二進位 Payload。
  - 時間軸提供文字、格式化 JSON、Hex Offset / ASCII 多重視圖。
  - 支援依主題與時間戳命名無損下載原始二進位資料。
  - 限制 256 KB 畫面預覽以維持介面流暢度，同時確保下載資料之完整性。

### 🛠️ 問題修正與優化
* **二進位資料顯示與驗證**：
  - 二進位時間軸改用明確提示取代錯誤解碼文字；擷取匯入會拒絕無效 Base64 與不一致的 Payload 位元組大小。
* **測試與發布流程**：
  - 新增 TCP／WebSocket 二進位資料完整性測試，GitHub Actions 升級至 Node 24 相容版本，並修正 Release 說明殘留舊版本內容的問題。

---

## [0.3.0](https://github.com/NickYCLin/mqttape/compare/v0.2.0...v0.3.0) (2026-08-14)

### 🚀 新增功能
* **工作階段 Topic 樹狀資源瀏覽器**：
  - 階層化瀏覽所有接收主題，即時統計雙向流量與最新 Payload。
* **Retained 訊息狀態快照**：
  - 支援 Retained 訊息快照檢視與空白墓碑（Tombstone）辨識。
* **重播主題前綴置換 (Topic Remapping)**：
  - 提供置換前後對比預覽與受影響訊息計數。

### 🛠️ 問題修正與優化
* **發布 Topic 安全檢查**：
  - 一般發布與重播共用相同的 MQTT Topic 驗證；若重對應後的目的地不合法，會在傳送任何訊息前先行阻擋。
* **自動化測試補強**：
  - 新增 Topic 樹、重對應、Retained 刪除與真實 Broker 整合測試。

---

## [0.2.0](https://github.com/NickYCLin/mqttape/compare/v0.1.0...v0.2.0) (2026-08-14)

### 🚀 新增功能
* **擷取預覽與重播控制**：
  - 支援雙向訊息過濾、Retained 警示、倍速播放、暫停、繼續與取消。
* **作業系統層級加密設定檔**：
  - 桌面版使用系統安全儲存保護連線帳密，Web Lite 僅保存非機密設定。
* **自訂 CA 與 mTLS 雙向認證**：
  - 桌面版支援自訂根憑證與用戶端證書/金鑰對。
* **Web Lite 自動部署**：
  - GitHub Actions 自動部署網頁版至 GitHub Pages。
* **跨平台 macOS 封裝**：
  - 支援 Intel 與 Apple Silicon macOS 安裝檔與 SHA-256 雜湊清單。

### 🛠️ 問題修正與優化
* **憑證與機密保護**：
  - 限制 TLS 檔案只能存取經 MQTTape 選取或受信任設定檔引用的路徑；匯出擷取檔時自動剝除密碼、私鑰密語與本機 TLS 路徑。
* **明文儲存防護**：
  - 作業系統加密功能不可用時，不會將連線機密以明文寫入磁碟。
* **通訊協定測試補強**：
  - 新增 MQTT 5、WebSocket、QoS 2、Retained、取消訂閱與重新連線測試。

---

## [0.1.0](https://github.com/NickYCLin/mqttape/releases/tag/v0.1.0) (2026-08-14)

### 🚀 新增功能
* **初始版本發布**：
  - MQTTape 初始版本（Electron 桌面版與 Web Lite 網頁版）。
  - 支援 TCP、TLS、WebSocket 連線，支援 MQTT 3.1.1 / 5.0、QoS 0/1/2 與 Retained 訊息發布。
  - 提供可搜尋之訊息時間軸、JSON 格式化、流量擷取匯出與重播機制。
