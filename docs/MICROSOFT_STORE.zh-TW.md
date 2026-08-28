# Microsoft Store MSIX 發布手冊

MQTTape 的 Microsoft Store 管道會建立 x64 與 ARM64 兩份 MSIX，並合併成一個 `msixbundle` 供 Partner Center 送審。這條管道獨立於 GitHub Release；既有的 Setup 與 Portable 套件仍照原流程發布。

## 一次性設定

1. 從 [Microsoft Store 開發人員註冊入口](https://storedeveloper.microsoft.com/)建立帳號。Microsoft 目前的新註冊流程不收個人或公司帳號註冊費，但仍會進行身分驗證。
2. 在 Partner Center 的 **Apps and games** 選擇 **New product > MSIX or PWA app**，保留 `MQTTape` 這個名稱。名稱保留後若三個月內沒有開始送審，可能會失效。
3. 打開 **Product management > Product identity**，複製下列三個值。大小寫與標點必須完全相同，不能自行猜測：

   | GitHub Repository variable | Partner Center 欄位 |
   | --- | --- |
   | `MS_STORE_IDENTITY_NAME` | Package/Identity/Name |
   | `MS_STORE_PUBLISHER` | Package/Identity/Publisher |
   | `MS_STORE_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName |

4. 到 GitHub Repository 的 **Settings > Secrets and variables > Actions > Variables** 建立上述三個變數。這些是產品識別資料，不是簽章私鑰；仍不要把尚未確認的測試值寫進程式碼。

Partner Center 的正式識別值可參考 [Microsoft 的產品識別說明](https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details)。

## 建立 Store 套件

在 GitHub Actions 手動執行 **Microsoft Store MSIX** workflow。平常留空三個輸入欄位，工作流程會讀取 Repository variables；需要做一次性測試時，也可在執行畫面輸入臨時產品識別值而不修改 Repository 設定。它會：

1. 確認三個 Partner Center 變數都已設定。
2. 在原生 x64 與 ARM64 Windows Runner 分別建置 MSIX。
3. 檢查兩份套件的 manifest、架構、執行檔與圖示資產。
4. 使用 Windows SDK `MakeAppx.exe` 合併 `MQTTape-<version>-store.msixbundle`，並檢查 bundle 內容。
5. 上傳 `MQTTape-Microsoft-Store` workflow artifact 與 SHA-256 清單。

正式送審時上傳 `.msixbundle` 即可。Partner Center 接受 `.msix`、`.msixbundle` 與 `.msixupload`；多架構應用使用 bundle，可讓 Store 只派送裝置需要的架構。詳見 [Microsoft Store 套件上傳說明](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/upload-app-packages)。

### 本機建立

本機需要 Windows 10/11 SDK，並且能找到 `MakeAppx.exe`。一台主機只建立與自己相同架構的 MSIX；完整 bundle 由 GitHub Actions 的兩種原生 Runner 組合。PowerShell 範例：

```powershell
$env:MS_STORE_IDENTITY_NAME = '<Package/Identity/Name>'
$env:MS_STORE_PUBLISHER = '<Package/Identity/Publisher>'
$env:MS_STORE_PUBLISHER_DISPLAY_NAME = '<Package/Properties/PublisherDisplayName>'
$env:MS_STORE_ARCH = 'x64' # ARM64 主機改為 arm64
npm ci
npm run package:store
```

單一架構產物位於 `release/store/`。兩種架構的 MSIX 都齊全時，可執行 `npm run package:store:bundle` 建立 bundle。Electron Builder 26 的穩定版仍將這個 Windows 封裝器命名為 `appx` target，但底層同樣呼叫 Microsoft `MakeAppx.exe`；設定明確使用 `.msix` 副檔名，最後再由 `MakeAppx.exe` 建立 `.msixbundle`。這樣不需要依賴 Electron Builder 27 的 alpha 版。

## 送審前檢查

- 用 Windows App Certification Kit 測試 bundle。`MakeAppx` 建置成功與 manifest 檢查不能取代 WACK 與實際功能測試。
- 在 x64 與 ARM64 裝置確認啟動、MQTT TCP/TLS/WebSocket、檔案匯入匯出及安全儲存行為。
- 準備 Store 說明、隱私權政策 URL、支援 URL、年齡分級與實際畫面截圖。
- 確認套件版本高於已送審版本；Store 不允許重複使用相同版本覆蓋舊套件。
- 先以 package flight 或隱藏可用性完成驗收，再公開上架。

[Windows App Certification Kit 官方說明](https://learn.microsoft.com/en-us/windows/uwp/debug-test-perf/windows-app-certification-kit)列出安裝位置與測試流程。

## 簽章與更新邊界

送進 Microsoft Store 的 MSIX 不需要自備 CA 憑證；通過認證後，Store 會使用 Microsoft 憑證重新簽章並負責 CDN 與更新派送。MQTTape 偵測到自己從 Microsoft Store 執行時會停用 `electron-updater`，避免 Store 版誤抓 GitHub 的 NSIS 安裝檔。

這不會替 GitHub Release 的 `.exe` 補上 Authenticode。Setup 與 Portable 是否完成簽章仍以 [SignPath 手冊](SIGNPATH.md)與實際 `Get-AuthenticodeSignature` 驗證結果為準。Microsoft 對 Store 自動簽章的說明見 [Microsoft Store 入門文件](https://learn.microsoft.com/en-us/windows/apps/publish/get-started)。
