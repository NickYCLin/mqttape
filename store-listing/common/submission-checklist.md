# Microsoft Store 送審檢查清單

本清單把本機可選檢查、Partner Center 正式 gate 與人工上架資產分開。勾選項目必須有當次 submission 的實際證據；GitHub Actions 打包成功本身不等於 Store 認證或公開上架。

## 1. 帳號、產品與版本

- [ ] Partner Center 開發人員帳號已完成身分驗證，且 `MQTTape` 產品名稱仍有效。
- [ ] `MS_STORE_IDENTITY_NAME`、`MS_STORE_PUBLISHER`、`MS_STORE_PUBLISHER_DISPLAY_NAME` 與 **Product identity** 完全一致。
- [ ] 上傳產物來自預定提交 commit 的 **Microsoft Store MSIX** workflow，不是使用臨時 identity 的本機測試包。
- [ ] `.msixbundle`、x64 MSIX、ARM64 MSIX 的版本一致，且高於所有曾送交 Partner Center 的版本。
- [ ] `SHA256SUMS.txt` 與三個套件實際雜湊一致，並保存 workflow run URL、commit SHA 與 artifact 名稱。

## 2. Manifest 與受限制 capability

- [ ] 解開當次 bundle，確認 manifest 的 Identity、Publisher、版本、x64／ARM64 架構與執行檔正確。
- [ ] 逐項核對實際 manifest capability；目前預期包含網路能力，以及 Electron／Win32 桌面程序所需的 `runFullTrust`。不要只依賴 build config 推定。
- [ ] 在 **Submission options > Restricted capabilities** 貼上 zh-TW 或 en-US listing 內的 `runFullTrust` 說明。
- [ ] 說明明確指出：這是一般 medium-integrity Electron 桌面程序，不要求系統管理員／UAC 提升，不安裝驅動或服務，檔案存取由使用者選擇或操作觸發。
- [ ] Partner Center 沒有顯示其他未說明的 restricted capability；若有，先確認是否真的需要，再補充最小且可驗證的用途。

Microsoft 會在上傳套件後偵測 restricted capabilities，並於 certification 審查其必要性；未核准就不能視為可發布。

## 3. 上架資料

- [ ] zh-TW 與 en-US listing 已由對應檔案貼入，並重新核對當次版本功能。
- [ ] 隱私權政策 URL <https://nickyclin.github.io/mqttape/privacy/> 可在未登入狀態直接取得 HTTP 200，且頁面同時提供繁中與英文。
- [ ] 支援 URL <https://github.com/NickYCLin/mqttape/issues> 可開啟；網站填入 <https://github.com/NickYCLin/mqttape>。
- [ ] 類別、價格、可用市場、discoverability／publishing hold 已由產品擁有者確認。
- [ ] Partner Center 年齡分級問卷已依應用程式實際內容回答，不以 README 推定答案。
- [ ] `zh-TW/screenshots/` 與 `en-US/screenshots/` 各 4 張 1600×934 本地化實際應用程式截圖已逐張檢查，確認不含敏感資訊，並上傳至對應 Partner Center listing。
- [ ] Store listing logo 與 Partner Center 要求的其他圖片已上傳，且沒有使用尚未實作或第三方受限內容。
- [ ] Listing、截圖與認證備註沒有宣稱「已簽章」、「已通過認證」或「已上架」。

## 4. 測試與正式 gate

- [ ] GitHub workflow 的 bundle 結構驗證通過。
- [ ] Windows App Certification Kit（WACK）若仍可使用，可作為 deprecated、未維護的本機選擇性 preflight；結果不得取代 Partner Center。
- [ ] 在 x64 與 ARM64 Windows 實機測試啟動、TCP／TLS／WebSocket、檔案匯入匯出、safeStorage 與 Store 管理更新邊界。
- [ ] Partner Center 套件 preprocessing／validation 通過，且 restricted capability 欄位沒有遺漏。
- [ ] Submission 或 package flight 已送交 Partner Center，並取得 certification report；只有 certification 通過才算正式 gate 通過。
- [ ] 首次發布若尚不能建立 package flight，使用適當的 discoverability／publishing hold 控制公開時點；已有基礎版本後，更新優先送到指定測試群組的 flight。
- [ ] 從 Microsoft Store／flight 實際安裝 Microsoft 重新簽章的套件，於 x64 與 ARM64 各完成一次核心功能驗收。
- [ ] 公開前再次確認 Store listing、隱私頁、支援頁、版本、架構與認證報告一致。

## 5. 公開後

- [ ] Partner Center 狀態實際顯示已在 Store，且公開產品 URL 可在未登入視窗開啟。
- [ ] 驗證 Store 安裝與更新不會啟動 GitHub Release 的 `electron-updater`。
- [ ] 再以獨立 commit 更新 README 的「尚未公開上架」狀態與正式 Store 連結。
- [ ] 保存 submission ID、certification report、公開時間與實際驗收版本；不要把帳號憑證或敏感審核資料提交到 repository。

## 官方參考

- [建立 MSIX app submission](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission)
- [`runFullTrust` 與 restricted capability 核准流程](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)
- [MSIX app certification 流程](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process)
- [Package flights](https://learn.microsoft.com/en-us/windows/apps/publish/package-flights)
- [WACK deprecated 與選擇性本機檢查](https://learn.microsoft.com/en-us/windows/msix/package/packaging-uwp-apps#validate-your-app-package)
- [MSIX Store listing 欄位與字數限制](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info)
- [Keywords 數量、長度與 word 限制](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-additional-information)
