# Microsoft Store listing（zh-TW）

以下內容可貼入 Partner Center；標題只是欄位名稱，不要連同 Markdown 標記貼入。Product features 與 Keywords 的每一列都要在 Partner Center 當成獨立項目輸入。

## 產品名稱

MQTTape

## 簡短描述

開源 MQTT 3.1.1／5.0 桌面除錯工具，可擷取、搜尋、解析與重播流量，支援 TCP、TLS、WebSocket、QoS 封包流程、Protobuf、Sparkplug B 與 LoRaWAN。

## 描述

MQTTape 是一款開源、以本機處理為主的 MQTT 桌面除錯工具，協助開發者與維運人員觀察 Broker 流量、檢查封包內容，並以可預覽的流程安全重播擷取資料。

你可以連線至自己選擇的 MQTT 3.1.1 或 MQTT 5.0 Broker，使用 TCP、TLS、WebSocket 或 Secure WebSocket，同時開啟多個彼此隔離的 Broker 工作階段。訊息時間軸、Topic 階層、Retained 快照與 QoS 0／1／2 封包流程，能協助辨識訊息方向、Packet ID、Reason Code、等待狀態與 Broker 回應。

Payload 檢視器支援文字、格式化 JSON、Hex、CBOR、Protobuf 與 Sparkplug B，並提供 The Things Stack 與 ChirpStack 的 LoRaWAN Uplink／Downlink 輔助資訊。擷取檔可在本機匯入、匯出、裁切與重播；重播前會先顯示 Topic、方向、Retained Message 與 Prefix Remap 預覽。

MQTTape 不需要 MQTTape 帳號，也不含廣告、應用程式分析或遙測。Broker 憑證與擷取內容不會傳送給 MQTTape 維護者。桌面設定檔保存在本機；密碼與 Private Key Passphrase 會透過作業系統支援的 Electron safeStorage 加密，而且不會退回以純文字保存。

MQTTape 不提供 Broker 服務。連線可用性、權限、資料處理方式與費用由你選擇的 Broker 及其營運者決定。

## 應用程式功能

- MQTT 3.1.1 與 MQTT 5.0；支援 TCP、TLS、WebSocket 與 Secure WebSocket。
- 可同時開啟最多 8 個隔離的 Broker 工作階段，並搜尋訊息時間軸與 Topic 階層。
- 檢視 QoS 0／1／2 封包流程、Packet ID、DUP、Reason Code 與等待狀態。
- 解析文字、JSON、Hex、CBOR、Protobuf、Sparkplug B 與 LoRaWAN Payload。
- 匯入、匯出、裁切、預覽與重播版本化 MQTT 擷取檔。
- MQTT 5 Publish Properties、Last Will、Retained Message 與 Topic Prefix Remap。
- 本機設定檔與作業系統加密秘密儲存；不含 MQTTape 帳號、廣告、分析或遙測。

## 搜尋關鍵字（逐項輸入）

- MQTT
- MQTT 5
- MQTT Broker
- IoT
- 封包檢視
- 流量擷取
- LoRaWAN

## 此版本的新功能

第一次 submission：請將 Partner Center 的這個欄位留白。

後續更新可依實際版本改寫下列文字：

> 提供 Windows x64 與 ARM64 原生套件，並由 Microsoft Store 管理安裝與更新。功能與同版本 MQTTape 桌面版一致。

## 連結與分類建議

- 隱私權政策 URL：<https://nickyclin.github.io/mqttape/privacy/>
- 支援 URL：<https://github.com/NickYCLin/mqttape/issues>
- 網站：<https://github.com/NickYCLin/mqttape>
- 類別：Developer tools（開發人員工具）
- 授權／價格：MIT 開源軟體；建議免費
- 最低作業系統：Windows 10 version 1809（build 17763）
- 支援架構：x64、ARM64

## 認證備註（非公開 listing）

MQTTape 不需要產品帳號。應用程式啟動時維持未連線狀態，測試人員需使用自己可存取的 MQTT Broker 與授權資料測試連線、訂閱與發布。MQTTape 不內建或代理 Broker，也不把 Broker 憑證或訊息內容傳給維護者。

匯入擷取檔、Protobuf schema 與 TLS 憑證，以及匯出擷取檔或 Payload，都必須由使用者透過檔案選擇或明確操作觸發。Microsoft Store 版停用 GitHub Release 自動更新程式，安裝與更新由 Microsoft Store 管理。

## `runFullTrust` 受限制 capability 說明（貼入 Submission options）

MQTTape 是以 Electron 建立並封裝為 MSIX 的 Win32 桌面應用程式。套件需要 `runFullTrust`，才能啟動並執行其正常的 medium-integrity Electron 桌面程序。該程序提供使用者操作的 MQTT TCP／TLS／WebSocket 連線、擷取檔與 schema 匯入／匯出、TLS 憑證檔案選擇，以及本機設定檔與作業系統加密秘密儲存。

MQTTape 不會要求系統管理員權限或 UAC 提升，不會安裝驅動程式或 Windows 服務，不會設定開機自動執行，也不會在沒有使用者操作時掃描或存取無關檔案。應用程式不含帳號服務、廣告、分析或遙測；Broker 憑證與 MQTT 內容不會傳送給 MQTTape 維護者。`runFullTrust` 僅用於執行既有桌面功能，不用於繞過 Windows 安全控制。
