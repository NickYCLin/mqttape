# MQTTape — MQTT 流量擷取、檢視與重播工具

**桌面版與 Web Lite 都能用的開源 MQTT 除錯工具。**

MQTTape is an open-source MQTT traffic recorder, packet inspector, topic explorer, and replay tool for MQTT 3.1.1 and MQTT 5.0. It runs on Windows, macOS, Linux, and in the browser over WebSocket.

[![CI](https://github.com/NickYCLin/mqttape/actions/workflows/ci.yml/badge.svg)](https://github.com/NickYCLin/mqttape/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/NickYCLin/mqttape?display_name=tag&sort=semver)](https://github.com/NickYCLin/mqttape/releases/latest)
[![License: MIT](https://img.shields.io/github/license/NickYCLin/mqttape)](LICENSE)

[立即使用 Web Lite](https://nickyclin.github.io/mqttape/) · [下載桌面版](https://github.com/NickYCLin/mqttape/releases/latest) · [比較桌面版與 Web Lite](#桌面版與-web-lite) · [查看程式碼導覽](docs/PROJECT_OVERVIEW.md)

MQTTape 保留早期 Chrome MQTT 工具即開即用的便利性，並加入可搜尋的訊息時間軸、Topic 樹、可攜式擷取檔及 LoRaWAN 輔助功能。

## 適合用來

- 即時檢查 MQTT 訊息、Topic、QoS 封包流程與 MQTT 5 Publish Properties
- 擷取測試流量，裁切敏感或無關資料後，在另一個 Broker 安全預覽及重播
- 檢視 JSON、Hex、CBOR、Protobuf 與 Sparkplug B Payload
- 除錯 The Things Stack 或 ChirpStack 的 LoRaWAN MQTT Uplink／Downlink

## 目前功能

- 支援 MQTT 3.1.1 與 MQTT 5.0
- 桌面版支援 MQTT over TCP、TLS、WebSocket 與 Secure WebSocket
- Web Lite 支援 `ws://` 與 `wss://` Broker
- WebSocket URL Query Parameters；桌面版另支援 HTTP Basic、Bearer Token 與自訂握手 Header
- 最多同時開啟 8 個相互隔離的 Broker 工作階段，並以分頁顯示連線狀態與背景未讀訊息
- 支援 QoS 0、1、2 的發布與訂閱
- 即時檢視 QoS 0、1、2 的控制封包流程、方向、Packet ID、DUP、Reason Code 與等待狀態
- 建立、檢視及重播 MQTT 5 Publish Properties，包含 Content Type、Payload Format、Message Expiry、Response Topic、Correlation Data 與可重複的 User Properties
- 接收時另會顯示 Topic Alias 與 Subscription Identifier；重播時會基於 MQTT 語意安全略過這兩項連線／訂閱中繼資料
- 支援 Retained Message、Clean Session 與自動重新連線
- 支援文字、Hex、Base64 MQTT Last Will，以及 MQTT 5 Will Delay、Message Expiry 與 Content Type
- 可搜尋傳入與傳出訊息的時間軸
- 依工作階段建立 Topic 階層、流量統計及最新 Payload
- Retained Value 快照，並能辨識空白 Retained Message Tombstone
- 自動以文字、格式化 JSON、Hex Offset／ASCII 檢視 Payload
- 自動辨識或依 MQTT 5 Content Type 解碼 CBOR，並以保留資料型別的樹狀結構檢視
- 可匯入一個或多個 `.proto` Schema、選擇 Message Type，並以 CSP 安全的樹狀檢視解碼 Protobuf
- 自動辨識 `spBv1.0` Topic，使用 Eclipse Tahu 官方 Schema 顯示 Sparkplug B Topic 識別資料、Metric 與完整 Payload
- 偵測二進位 Payload，並可無損下載原始資料
- 自動辨識 The Things Stack 與 ChirpStack LoRaWAN Uplink
- 顯示 LoRaWAN 裝置、訊框、頻率、Data Rate、RSSI 與 SNR 摘要
- 解碼 LoRaWAN Base64 訊框，並可無損下載原始訊框
- 引導式 The Things Stack 與 ChirpStack MQTT Downlink 建立器
- 追蹤 Downlink 的提出、排入佇列、送出、裝置確認、未確認及失敗狀態
- 工作階段統計與以 Base64 儲存的二進位安全擷取格式
- 匯出前可依方向、Topic／Payload 及時間範圍裁切擷取內容
- 匯出不含密碼或本機 TLS 路徑的 MQTTape 擷取檔
- 重播前可預覽擷取內容、選擇訊息方向並控制速度
- 可儲存重播方向、速度與 Topic Remap 的本機預設
- 以變更前後預覽安全替換完整 Topic Prefix
- 重播期間可暫停、繼續或取消，並維持原始訊息順序
- 桌面版 Broker 設定檔會以作業系統加密機制保存秘密
- 桌面版支援自訂 CA 與 Client Certificate／Key 的 mTLS
- 預設使用繁體中文介面；使用者可自行切換成英文，並在本機記住偏好
- 已安裝的 Windows 與支援的 Linux 套件可在背景檢查及下載更新
- 提供 Windows 免安裝版，以及 Windows、macOS、Linux 安裝套件
- 提供跟隨系統、Midnight、Tape、Magenta、高對比、Daylight 與 Paper 外觀主題

> MQTTape 是 MQTT Client，不是 Broker。請將它連線至你管理的 Mosquitto、EMQX、HiveMQ 或其他 MQTT Broker；不要把帳號、密碼或敏感資料送到公開測試 Broker。

## 桌面版與 Web Lite

| 功能 | 桌面版 | Web Lite |
| --- | ---: | ---: |
| MQTT TCP（`mqtt://`） | 支援 | 不支援 |
| MQTT TLS（`mqtts://`） | 支援 | 不支援 |
| WebSocket（`ws://`） | 支援 | 支援 |
| Secure WebSocket（`wss://`） | 支援 | 支援 |
| 本機擷取匯出／重播 | 支援 | 支援 |
| 儲存連線設定檔 | 秘密會加密 | 不儲存秘密 |
| 自訂 CA 與 mTLS | 支援 | 不支援 |
| 應用程式自動更新 | 支援的安裝套件 | 由瀏覽器處理 |
| CBOR／Protobuf／Sparkplug B Viewer | 支援 | 支援 |
| 多 Broker 同時連線 | 最多 8 個 | 最多 8 個 |
| WebSocket 進階認證 | Basic／Bearer／Header／Query | Query Parameters |

瀏覽器無法開啟任意 TCP Socket，因此 Web Lite 的通訊協定選單只提供 WebSocket Transport。

MQTT over TCP 通常使用登記連接埠 `1883`，MQTT over TLS 通常使用 `8883`。`8083` 與 `8084` 則是部分 Broker 分別提供 `ws://` 與 `wss://` MQTT Endpoint 時採用的常見預設，並非 MQTT 強制規定；Mosquitto 等部署也常使用其他連接埠。MQTTape 切換通訊協定時填入的 Port 只是起始建議值，請一律以 Broker 管理者提供的 Host、Port 與 WebSocket Path 為準。

Web Lite 發布於 <https://nickyclin.github.io/mqttape/>。由於 GitHub Pages 使用 HTTPS，遠端 Broker 通常必須提供具有受信任憑證的 `wss://` Endpoint；瀏覽器會阻擋 HTTPS 頁面連線至不安全的 `ws://`。

## 多 Broker 工作階段

使用標題列下方的「新增 Broker」可以同時開啟最多 8 個工作階段。每個分頁都有自己的 MQTT Client、連線狀態、訂閱、訊息時間軸、QoS 封包流程、Topic 樹、Downlink 狀態與重播進度；切換分頁時，背景工作階段仍會維持連線並繼續收訊息，分頁上的數字會標示新增的未讀訊息。

設定檔是全域共用的，因此可在任一分頁儲存後從其他分頁載入；載入同一個設定檔不代表共用 MQTT 連線，各分頁仍需使用不衝突的 Client ID。LoRaWAN Downlink 歷史會依設定檔或 Broker Endpoint 分開保存，避免不同環境的事件互相關聯。關閉工作階段時，MQTTape 會正常送出 MQTT `DISCONNECT` 並清除該分頁的執行期資料，因此不會把正常關閉誤判為需要發布 Last Will 的異常斷線。

## WebSocket 進階認證

MQTT over WebSocket 可能先經過 Reverse Proxy、API Gateway 或雲端服務的 HTTP 驗證，再進入 MQTT `CONNECT`。桌面版可在「進階設定」中選擇 HTTP Basic、Bearer Token，或加入最多 32 個自訂握手 Header；`Host`、`Connection`、`Upgrade` 與 `Sec-WebSocket-*` 等協定 Header 仍由 WebSocket Client 管理，MQTTape 不允許覆寫。這組 HTTP 認證與一般 MQTT 使用者名稱／密碼互相獨立。

桌面版與 Web Lite 都可以加入最多 32 個 URL Query Parameters，名稱和值會經過 URL 編碼。瀏覽器的 WebSocket API 不允許網頁自行加入握手 Header，因此 Web Lite 無法使用 Basic、Bearer 或自訂 Header；若 Broker 支援 Query Token，可改用 Query Parameters，否則請使用桌面版。

Authorization 秘密、自訂 Header 值與 Query 值都不會顯示在狀態列或寫入 MQTTape 擷取檔。桌面設定檔會使用作業系統安全儲存空間加密這些值；Web Lite 只保存欄位名稱，不保存秘密值，載入設定檔後必須重新輸入。靜態 Token 在自動重新連線時會重複使用；需要動態更新或重新簽署的短效 URL，請在外部取得新值後重新連線。

## LoRaWAN MQTT

MQTTape 連接的是 LoRaWAN 平台的 MQTT 介面，不會直接接收 LoRa 無線電訊號。當 Uplink 符合 [The Things Stack](https://www.thethingsindustries.com/docs/integrations/data-formats/) 或 [ChirpStack](https://www.chirpstack.io/docs/chirpstack/integrations/events/) 的官方 JSON Envelope 時，Payload Inspector 會自動顯示裝置識別資料、FPort、Frame Counter、頻率、Data Rate、Gateway RSSI／SNR、已解碼的應用資料與內嵌二進位訊框。

常見 Uplink 訂閱 Topic：

```text
The Things Stack: v3/<application-id>/devices/+/up
ChirpStack:      application/<application-id>/device/+/event/up
```

Broker Host、認證資料、Tenant 後綴與 Topic 結構可能因部署方式而不同，請以 LoRaWAN Network Operator 提供的值為準。

引導式 Downlink 建立器遵循 [The Things Stack MQTT](https://www.thethingsindustries.com/docs/integrations/other-integrations/mqtt/) 與 [ChirpStack MQTT](https://www.chirpstack.io/docs/chirpstack/integrations/mqtt.html) 的預設格式。你可以輸入 UTF-8 文字、Hex 位元組、Base64 或已解碼 JSON；MQTTape 會先產生並顯示平台 Topic 與 JSON Envelope，再讓你發布。Downlink 命令一律使用非 Retained MQTT Message；自訂伺服器 Topic Template 仍可使用一般發布工具送出。

### Downlink 狀態追蹤

在「Downlinks」頁籤中，MQTTape 會整理實際觀察到的 Downlink 要求與平台回報，並將最多 1,000 筆解析後事件保存在這台裝置，讓要求與後續 ACK 可以跨程式重啟繼續關聯。請同時訂閱狀態 Topic：

```text
The Things Stack: v3/<application-id>/devices/+/down/#
ChirpStack:      application/<application-id>/device/+/event/+
```

- The Things Stack：MQTTape 建立的命令會加入唯一 `correlation_ids`，用來精確關聯 `queued`、`sent`、`ack`、`nack` 與 `failed`。
- ChirpStack：`txack` 與 `ack` 會以 `queueItemId` 精確關聯；由於原始 MQTT Downlink 命令不含平台產生的 Queue Item ID，首次把命令連到 `txack` 時只能依同一裝置的事件順序推定，畫面會明確標示。
- 本機歷史會依設定檔或 Broker Endpoint 隔離，只包含解析後的狀態中繼資料，不會保存原始 MQTT Payload 或 Broker 憑證；可以隨時在 Downlinks 頁籤匯出版本化 JSON 或清除。
- 狀態追蹤只使用 MQTTape 實際看見的訊息，不會查詢 LoRaWAN 平台的完整佇列，也不會在缺少回報事件時自行判定無線傳送成功。

匯出的 Downlink 歷史格式識別碼為 `mqttape-downlink-history`、版本為 `1`。它適合保存與檢查狀態事件，但不包含可重新發布的完整 Downlink Payload；需要無損重播時仍應使用 MQTTape 擷取檔。

## 📥 下載與安裝 (Downloads)

你可以直接前往 [GitHub Releases](https://github.com/NickYCLin/mqttape/releases/latest) 取得最新發行版本的安裝檔、可攜式執行檔與 Checksum Manifest：

| 平台 | 支援架構 | 安裝包格式 | 更新機制 |
|---|---|---|---|
| **Windows** | x64 (Intel / AMD) | NSIS 安裝檔 (`Setup.exe`) / Portable 免安裝版 | 🟢 安裝版支援背景自動更新 / 免安裝版手動下載 |
| **Windows** | ARM64 | NSIS 安裝檔 (`Setup.exe`) / Portable 免安裝版 | ⚪ 手動下載更新 |
| **macOS** | Apple Silicon (M 系列) | DMG 映像檔 (`.dmg`) / ZIP 壓縮檔 | ⚪ 手動下載更新 |
| **macOS** | Intel x64 | DMG 映像檔 (`.dmg`) / ZIP 壓縮檔 | ⚪ 手動下載更新 |
| **Linux** | x64 (AMD64) | AppImage / Debian 套件 (`.deb`) | 🟢 支援背景自動更新 |
| **Linux** | ARM64 (aarch64) | AppImage / Debian 套件 (`.deb`) | ⚪ 手動下載更新 |
| **Web Lite** | 跨平台瀏覽器 | 靜態 Web 應用 ([線上使用](https://nickyclin.github.io/mqttape/)) | 🟢 瀏覽器即時載入最新版 |

> [!TIP]
> 歡迎至 [Releases 列表](https://github.com/NickYCLin/mqttape/releases) 下載各平台安裝檔或檢視 [更新日誌 (Changelog)](CHANGELOG.md)。
> 維護者可參考 [Release 自動化與版本規則](docs/RELEASE_AUTOMATION.zh-TW.md)；依 SemVer 與 Conventional Commits 準備版本並建立 Tag 後，系統會自動打包發布。
> Microsoft Store 尚未公開上架；維護者可依 [Microsoft Store MSIX 發布手冊](docs/MICROSOFT_STORE.zh-TW.md)完成 Partner Center 設定與送審。

## 程式碼簽章政策

免費程式碼簽章由 [SignPath.io](https://about.signpath.io/) 提供，憑證由 [SignPath Foundation](https://signpath.org/) 提供。

- Committer 與 Reviewer：[NickYCLin](https://github.com/NickYCLin)
- Approver：[NickYCLin](https://github.com/NickYCLin)
- 每次 Release 的簽章要求都必須由 Approver 手動核准
- 隱私權政策：[PRIVACY.md](PRIVACY.md)
- 核准後接線與驗收手冊：[docs/SIGNPATH.md](docs/SIGNPATH.md)

SignPath 開源專案申請已送出但仍在等待核准。在申請與簽章流程完成之前發布的 Windows 套件仍未簽章；執行前請先使用 Release 中的 Checksum Manifest 驗證下載檔案。

Microsoft Store 是另一條獨立發布管道。MSIX 通過 Store 認證後會由 Microsoft 重新簽章；這不會讓 GitHub Release 的 Setup 或 Portable 自動取得 Authenticode 簽章。

## 設定檔與 mTLS

桌面版設定檔會存放在 Electron User Data 目錄。密碼、Private Key Passphrase、WebSocket Authorization、自訂 Header 值與 Query 值會透過 Electron `safeStorage` 使用作業系統加密；MQTTape 不會退回以純文字儲存秘密。Web Lite 可以保存非敏感的連線設定與 Query 名稱，但會刻意捨棄密碼、Query 值與憑證路徑。

啟用 Last Will 時，桌面版也會把 Will Payload 放入同一份作業系統加密資料，而不會以純文字寫入設定檔。Web Lite 只保存 Will 的 Topic、格式、QoS、Retain 與 MQTT 5 屬性，不保存 Will Payload；載入設定檔後需要重新輸入。Will 設定不會寫入 MQTTape 擷取檔。

TLS 檔案必須使用 MQTTape 的檔案選擇器指定。Client Certificate 與 Private Key 必須成對設定，自訂 CA 則可選填。擷取匯出不會包含密碼、Passphrase 或任何本機憑證路徑。

## 自動更新

Windows x64 `Setup` 安裝版與支援的 Linux x64 套件會在啟動後及每六小時檢查 GitHub Releases。更新會在背景下載；準備完成後，可在標題列選擇「重新啟動以更新」。若正常關閉程式，已下載的更新也會在結束時套用。

Windows Portable、所有 ARM64 套件與未簽章的 macOS Build 目前維持手動更新。ARM64 版標題列會明確顯示「ARM64・下載更新」，不會讀取 x64 的差分更新檔。若目前安裝的是導入自動更新之前的 Windows x64 版本，需要最後一次手動安裝新版 `Setup`；之後即可直接更新，不必先解除安裝。

Microsoft Store MSIX 由 Store 管理更新，不會啟動 MQTTape 的 GitHub Release 更新程式。

## MQTT Last Will

在連線面板的「進階設定」中啟用 Last Will 後，可以設定 Topic、UTF-8／Hex／Base64 Payload、QoS 與 Retain。MQTT 5.0 連線還可設定 Will Delay Interval、Message Expiry Interval 與 Content Type；UTF-8 會自動加入 Payload Format Indicator，Hex／Base64 則標示為二進位。Will Payload 最多 1 MB，Topic 不允許發布用萬用字元。

Last Will 是 Client 在 `CONNECT` 時交給 Broker 的遺囑：只有連線在沒有正常送出 `DISCONNECT` 的情況下中斷，Broker 才會依設定發布。正常按 MQTTape「中斷連線」不會觸發 Will；應用程式崩潰、網路斷線或裝置失去連線才是典型觸發情境。MQTT 5 的 Will Delay 會再延後發布，但 Client 在期限內以可延續的 Session 重新連線時，Broker 可能取消這次 Will，實際行為也受 Broker 支援能力與 Session 設定影響。

## 開發

環境需求：

- Node.js 20 以上
- npm 10 以上

```bash
npm install
npm run dev
```

只啟動 Web Lite：

```bash
npm run dev:web
```

若要在本機測試 Web Lite，可在另一個 Terminal 啟動內附的暫時性 Broker，接著以 MQTT 3.1.1 連線至 `ws://127.0.0.1:9001/mqtt`：

```bash
npm run broker:dev
```

品質檢查：

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run build:web
```

`npm run test:e2e` 會建立桌面版與 Web Lite，接著以 Chromium 驗證 Web Lite 啟動、語系保存、多 Broker 工作階段、Downlink 歷史匯出／清除，以及 Electron 限制型 Preload Bridge。第一次執行前若本機尚未安裝測試瀏覽器，請先執行 `npx playwright install chromium`。

建立本機桌面套件：

```bash
npm run package
```

Microsoft Store 的多架構 MSIX bundle 需先取得 Partner Center 產品識別值，請依 [Store 發布手冊](docs/MICROSOFT_STORE.zh-TW.md)設定後執行 `npm run package:store`。

未簽章的下載檔可能觸發 Windows SmartScreen 或 macOS Gatekeeper，請參考各版本的 Release Notes。

## 擷取格式

擷取檔是版本化 JSON 文件，格式識別碼為 `mqttape-capture`，且永遠不包含連線密碼。Payload 以 Base64 儲存，因此二進位資料也能無損重播；接收與傳送的 MQTT 5 Publish Properties 也會一併保存，其中 Correlation Data 以 Base64 表示。

重播預覽預設只選擇傳出訊息；你可以明確加入傳入訊息，並在發布前查看 Retained Message 數量。重播會維持訊息順序與相對延遲，提供 0.25x 到 4x 速度，且可暫停或取消。每段延遲最多兩秒，完整時序則壓縮在 30 秒內，避免舊擷取檔意外等待數小時。

Topic Prefix Remap 可以在重播前把擷取內容從 Production Topic 導向其他環境。MQTTape 只替換完整 Prefix Boundary，會預覽變更結果，並阻擋空白、包含萬用字元、Null Character 或超過長度限制的發布 Topic。

使用 MQTT 5.0 連線時，重播會保留 Payload Format Indicator、Message Expiry、Content Type、Response Topic、Correlation Data 與同名重複的 User Properties。Topic Alias 只適用於原始連線，Subscription Identifier 則是 Broker 傳給訂閱端的資訊，因此兩者會在重播時略過。Response Topic 會保留原值，不會套用 Topic Prefix Remap，重播到其他環境前應在預覽中確認。若目前是 MQTT 3.1.1 連線，MQTTape 會在開始前阻擋含有 MQTT 5 發布屬性的重播，避免產生不相容封包。

## QoS Packet Flow 檢視

「封包流程」頁籤會把 MQTTape 在目前連線實際傳送與接收的控制封包組成發布交握。QoS 0 顯示單一 `PUBLISH`；QoS 1 顯示 `PUBLISH → PUBACK`；QoS 2 顯示 `PUBLISH → PUBREC → PUBREL → PUBCOMP`。每筆流程會標示訊息方向、Topic、QoS、Packet ID、TX／RX、DUP 重送、耗時，以及 MQTT 5 回覆中的 Reason Code。

如果確認封包尚未抵達，流程會維持「等待中」並明確顯示下一個預期封包；Reason Code 大於或等於 `0x80` 時則標示為失敗，方便分辨網路延遲、Broker 拒絕與未完成的交握。封包流程最多保留本次工作階段最近 1,000 筆，只保存控制封包中繼資料，不會另外複製 Payload，也不會寫入擷取檔或本機儲存空間。

## Topic 檢視器

「Topics」頁籤會把本次工作階段觀察到的流量整理成 MQTT Topic 階層。每一層會顯示傳入／傳出數量、最新 Payload 與 Retained 狀態；點選 Topic 可開啟對應的時間軸訊息。

Retained 面板是刻意設計成「依工作階段產生的快照」，不是 Broker 的完整清單，因為 MQTT 沒有列出 Broker 所有 Topic 的標準指令。MQTTape 會加入它觀察或發布的 Retained Value，也會在看見空白 Retained Publish（MQTT Retained Message Tombstone）時移除該值。

## Payload Inspector

展開時間軸訊息即可檢視 MQTT 5 Publish Properties 與原始 Payload 位元組。MQTTape 會保留同名且重複出現的 User Properties，並把有效 JSON 顯示成格式化 JSON、可列印 UTF-8 顯示成文字、二進位資料顯示成 Offset／ASCII Hex Dump；適用時也可在文字、JSON 與 Hex 間切換比較。

「Raw」會下載 `payloadBase64` 中儲存的原始位元組，不會重新編碼已解碼文字。為維持介面流暢，大型 Payload 的畫面預覽最多顯示前 256 KB，但原始下載仍保留完整資料。若匯入擷取檔的 Base64 格式錯誤，或解碼後長度與記錄的 Byte Size 不符，MQTTape 會拒絕匯入。

### CBOR Viewer

當 MQTT 5 Content Type 是 `application/cbor`、`application/cbor-seq` 或 `+cbor` 結尾的媒體類型時，Payload Inspector 會明確啟用 CBOR 頁籤；沒有 Content Type 時，只會自動辨識具有 Map、Array 等明顯結構的 CBOR，避免把一般二進位資料誤判為 CBOR。解碼遵循 RFC 8949，並在樹狀檢視中保留 Map、Set、Tag、Byte String、Date 與 BigInt 等型別。

結構化預覽最多處理前 256 KB、5,000 個節點、32 層深度及每個集合 200 個子項目。超過限制或解碼失敗時，原本的 Hex 與 Raw 仍可使用，原始 Payload 不會被修改。

### Protobuf Viewer

二進位訊息或 MQTT 5 Content Type 為 `application/protobuf`、`application/x-protobuf`、`application/vnd.google.protobuf`、`+protobuf`／`+proto` 時會提供 Protobuf 頁籤。Protobuf wire data 本身不包含完整 Message Schema，因此 MQTTape 不會猜測資料結構；請匯入最多 16 個彼此相依的 `.proto` 檔案，再選擇實際的 Message Type。

最多可在目前裝置保存 8 組 Schema。Schema 原始碼只會寫入應用程式或瀏覽器的本機儲存空間，不包含 Broker 憑證或擷取的 Payload。解碼器支援 Varint、ZigZag、32／64 位元 Fixed、Float、Double、String、Bytes、Enum、巢狀 Message、Packed Repeated 與 Map；64 位元整數會保留為 BigInt，未知欄位也會列出 Field Number 與 Wire Type，避免靜默遺失診斷線索。

MQTTape 使用 `protobufjs` 解析 Schema 的反射資訊，但以內建的直譯式 wire decoder 處理 Payload，不需要動態產生 JavaScript，因此正式版的 CSP 仍維持 `script-src 'self'`，不開放 `unsafe-eval`。結構化預覽同樣限制在 256 KB、5,000 個欄位與 32 層深度；即使 Schema 不符或解碼失敗，Hex 與 Raw 仍可使用。

### Sparkplug B Viewer

當 Topic 符合 `spBv1.0/<group_id>/<message_type>/<edge_node_id>[/<device_id>]`，且 Message Type 是 `NBIRTH`、`NDEATH`、`NDATA`、`NCMD`、`DBIRTH`、`DDEATH`、`DDATA` 或 `DCMD` 時，MQTTape 會自動開啟 Sparkplug B Viewer。畫面會拆出 Group、Edge Node、Device、Message Type、Sequence、Timestamp 與 UUID，並以表格顯示 Metric Name、Alias、DataType、Value、Historical／Transient／Null 旗標；巢狀 DataSet、Template、Properties 與完整 Payload 仍可在樹狀檢視展開。

內建 Payload Schema 取自 [Eclipse Tahu](https://github.com/eclipse-tahu/tahu/blob/master/sparkplug_b/sparkplug_b.proto)，依 EPL-2.0 使用並保留原始授權標頭，詳細資訊見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。MQTTape 只負責檢視已收到的 Sparkplug B 訊息，不會替 Broker、Edge Node 或 Primary Host 實作 Sparkplug 狀態機。

## 安全性

- Electron Renderer 不啟用 Node.js Integration
- MQTT 操作只能透過範圍受限且啟用 Context Isolation 的 Preload API
- Broker 密碼只保留在記憶體，且不會寫入擷取匯出
- 桌面版秘密使用作業系統支援的加密，不提供純文字備援
- TLS 檔案只能使用使用者明確選擇，或從設定檔載入的路徑
- 預設啟用 TLS 憑證驗證

若要回報安全性問題，請依照 [SECURITY.md](SECURITY.md) 說明處理。

## Roadmap

- Microsoft Store MSIX 上架（封裝管道已完成，待 Partner Center 產品識別與送審）
- Windows 安裝程式程式碼簽章（SignPath 申請已送出，等待核准與專案參數）

## 參與貢獻

提出 Pull Request 前請先閱讀 [CONTRIBUTING.md](CONTRIBUTING.md)。Commit Subject 使用繁體中文，並遵循本專案的 Conventional Commits 格式。

## 授權

[MIT](LICENSE) © 2026 NickYCLin
