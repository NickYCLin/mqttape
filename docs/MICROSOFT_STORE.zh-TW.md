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

Workflow 顯示成功，只能證明這次 artifact 已完成專案內的封裝與結構檢查；它不代表套件已上傳 Partner Center、`runFullTrust` 已獲准、已通過 Store certification，或已由 Microsoft 正式簽章。

Store 套件使用獨立的四段式版本，規則是將 MQTTape 的 SemVer 主版號加 1，並將第四段固定為 0。例如 App `0.12.1` 對應 Store `1.12.1.0`，未來 App `1.0.0` 會對應 Store `2.0.0.0`。這是為了符合 [Microsoft Store 套件版本規則](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)中第一段不得為 0、第四段必須為 0 的限制，同時維持升版順序；不會改變程式內顯示的 App 版本或 GitHub Release 檔名。

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

## `runFullTrust` 受限制 capability

MQTTape 是 Electron／Win32 桌面應用程式。MSIX 內的桌面執行程序以 `mediumIL` 執行，因此套件需要 `runFullTrust` restricted capability；這不等於要求系統管理員權限，也不代表應用程式會進行 UAC 提升。實際 capability 必須以當次 bundle 解開後的 manifest 為準，不能只看 `electron-builder.store.config.mjs` 的一般網路 capability 陣列。

上傳套件後，Partner Center 會偵測 restricted capabilities，並要求在 **Submission options > Restricted capabilities** 說明用途。可直接使用 [`store-listing/zh-TW/listing.md`](../store-listing/zh-TW/listing.md) 或 [`store-listing/en-US/listing.md`](../store-listing/en-US/listing.md) 內已準備的說明；送審前仍須逐字核對當次功能與 manifest。

說明重點是：`runFullTrust` 用於啟動一般 medium-integrity Electron 桌面程序，提供使用者操作的 MQTT TCP／TLS／WebSocket 連線、檔案選擇與匯入匯出，以及本機安全儲存。MQTTape 不要求管理員權限、不安裝驅動或 Windows 服務、不自行讀取無關檔案，也不以這項 capability 繞過 Windows 安全控制。Microsoft 的 [`runFullTrust` 與 restricted capability 核准流程](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)明確要求在 Store submission 內提供必要性說明；核准是 certification 的一部分。

## Store listing 與公開連結

可貼入 Partner Center 的繁中、英文 listing 與完整人工檢查清單放在 [`store-listing/`](../store-listing/README.md)。固定連結為：

- 隱私權政策：<https://nickyclin.github.io/mqttape/privacy/>
- 支援：<https://github.com/NickYCLin/mqttape/issues>
- 網站與原始碼：<https://github.com/NickYCLin/mqttape>

隱私權頁會隨 Web Lite 部署，內容對應 repository 的 [`PRIVACY.md`](../PRIVACY.md)，並提供繁中與英文。Partner Center 仍需人工填寫價格與市場、年齡分級、discoverability／publishing hold、Store listing logo，並上傳至少一張符合規格的實際應用程式截圖。文案與隱私頁就緒不等於完成 submission。

## 送審前檢查

- Windows App Certification Kit（WACK）已被 Microsoft 標示為 deprecated 且不再維護；若目前環境仍可使用，只把它當作選擇性的本機 preflight，不把 WACK 結果當成正式上架 gate。Microsoft 的[現行 MSIX 封裝說明](https://learn.microsoft.com/en-us/windows/msix/package/packaging-uwp-apps#validate-your-app-package)指出，正式 certification 會在送交 Partner Center 後自動執行。
- 把 Partner Center 套件 preprocessing／validation、restricted capability 審查與最終 certification report 當成正式 gate。GitHub Actions、`MakeAppx` 與本機 WACK 都不能取代這些結果。
- 在 x64 與 ARM64 裝置確認啟動、MQTT TCP/TLS/WebSocket、檔案匯入匯出及安全儲存行為。
- 使用 [`store-listing/common/submission-checklist.md`](../store-listing/common/submission-checklist.md)逐項準備 Store 說明、隱私權政策 URL、支援 URL、年齡分級、認證備註、實際畫面截圖與 listing logo。
- 確認套件版本高於已送審版本；Store 不允許重複使用相同版本覆蓋舊套件。正式 artifact 的兩份 MSIX 與 bundle 必須使用相同版本。
- 第一次提交若尚不能建立 package flight，使用適合的 discoverability 或 publishing hold 控制公開時點；已有基礎版本後，優先以 [package flight](https://learn.microsoft.com/en-us/windows/apps/publish/package-flights)派送給指定測試群組。Flight 同樣會經過 certification，不能當作繞過審核的管道。
- 從 Store／flight 實際安裝 Microsoft 重新簽章的套件，於 x64 與 ARM64 完成驗收後，才解除公開發佈 hold 或擴大可見性。

[Partner Center MSIX submission checklist](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission)與 [MSIX certification 流程](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process)是送審狀態的依據。

## 簽章與更新邊界

送進 Microsoft Store 的 MSIX 不需要自備 CA 憑證；通過認證後，Store 會使用 Microsoft 憑證重新簽章並負責 CDN 與更新派送。MQTTape 偵測到自己從 Microsoft Store 執行時會停用 `electron-updater`，避免 Store 版誤抓 GitHub 的 NSIS 安裝檔。

這不會替 GitHub Release 的 `.exe` 補上 Authenticode。Setup 與 Portable 是否完成簽章仍以 [SignPath 手冊](SIGNPATH.md)與實際 `Get-AuthenticodeSignature` 驗證結果為準。Microsoft 對 Store 自動簽章的說明見 [Microsoft Store 入門文件](https://learn.microsoft.com/en-us/windows/apps/publish/get-started)。
