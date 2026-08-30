# Microsoft Store 上架文字資產

本目錄保存可貼入 Partner Center 的純文字草稿與送審檢查清單。這些檔案代表「已準備上架資料」，不代表 MQTTape 已通過 Microsoft 認證、已由 Microsoft 簽章，或已在 Store 公開上架。

## 檔案

- [`zh-TW/listing.md`](zh-TW/listing.md)：繁體中文 Store listing、認證備註與 `runFullTrust` 說明。
- [`en-US/listing.md`](en-US/listing.md)：英文 Store listing、認證備註與 `runFullTrust` 說明。
- [`common/submission-checklist.md`](common/submission-checklist.md)：套件、列表、受限制功能與正式認證的逐項 gate。
- `zh-TW/screenshots/`、`en-US/screenshots/`：各 4 張 1600×934、已檢查不含敏感資訊的本地化實際應用程式截圖，仍須人工上傳到對應 listing。
- [`scripts/capture-store-screenshots.mjs`](../scripts/capture-store-screenshots.mjs)：在功能或 UI 更新後重現上述 8 張截圖。

## 固定公開連結

- 隱私權政策：<https://nickyclin.github.io/mqttape/privacy/>
- 支援：<https://github.com/NickYCLin/mqttape/issues>
- 專案網站與原始碼：<https://github.com/NickYCLin/mqttape>

隱私權頁由 `src/renderer/public/privacy/index.html` 隨 Web Lite 部署，不載入外部追蹤程式、分析服務或 CDN 資產。

## 使用原則

1. 上傳當次正式 workflow 產生的 `.msixbundle`，不要使用本機臨時識別值建立的測試套件。
2. 貼上 listing 前，依實際提交版本更新「此版本的新功能」，並逐一確認文案仍符合當前功能。
3. `runFullTrust` 說明要放在 Partner Center 的 **Submission options > Restricted capabilities**；實際上傳套件中的 manifest 才是 capability 的最終依據。
4. 截圖檔已準備，但截圖與 Store listing logo 上傳、年齡分級問卷、價格與市場、flight／可見性設定仍須在 Partner Center 人工完成。
5. 只有 Partner Center 顯示 certification 通過，而且實際 Store／flight 安裝驗收成功後，才能把公開文件改成「已上架」。

## Partner Center 文字限制

下列限制依 Microsoft 目前的 [MSIX Store listing 說明](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info)與 [Keywords 說明](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-additional-information)：

| 欄位 | 限制與格式 |
| --- | --- |
| Description | 必填，純文字，最多 10,000 字元；不要在內容欄放 HTML、程式碼或 URL。 |
| What's new | 最多 1,500 字元；第一次 submission 應留白。 |
| Product features | 最多 20 項，每項最多 200 字元；在 Partner Center 逐項輸入，不自行加入 bullet。 |
| Short description | 最多 1,000 字元；部分 Store 畫面只顯示前 270 字元，因此本專案以 270 字元為自動檢查上限。 |
| Keywords | 最多 7 項，每項最多 40 字元，全部合計最多 21 個以空白分隔的 words；逐項輸入。 |
| Additional system requirements | 最多 11 項，每項最多 200 字元；沒有額外硬體需求時可不填。 |

`src/build/store-listing-assets.test.ts` 會機械檢查兩個語系的簡短描述、完整描述、features 與 keywords；Partner Center 仍可能在介面或政策更新後增加其他驗證，因此送出前要再看當下欄位提示。
