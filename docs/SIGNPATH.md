# SignPath Windows 程式碼簽章啟用手冊

## 目前狀態

MQTTape 已送出 SignPath 開源專案申請，目前仍等待核准。核准前的 Windows Release 都是未簽章套件；Release Workflow 不會把未簽章檔標示成已簽章，也不會要求任何私密金鑰。

Microsoft Store MSIX 是獨立管道：Store 認證通過後會替 MSIX 重新簽章，但不會替 GitHub Release 的 Setup 或 Portable 簽章。Store 的設定與送審步驟見 [Microsoft Store MSIX 發布手冊](MICROSOFT_STORE.zh-TW.md)。

## 核准後需要取得的資料

- SignPath Organization ID
- Project Slug
- Signing Policy Slug
- Artifact Configuration Slug（未使用預設設定時）
- 具備 Submitter 權限的 API Token

API Token 必須存成 GitHub Actions Secret `SIGNPATH_API_TOKEN`，不可放在 Repository Variable、Workflow、原始碼、Issue 或 PR。其餘識別資料可存成下列 Repository Variables：

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`

還需要在 SignPath Organization 中加入預先定義的 GitHub.com Trusted Build System、連結 MQTTape Project，並依 SignPath 指示安裝 SignPath GitHub App。

## Release Workflow 接線條件

正式啟用前必須完成以下檢查：

1. Windows x64 與 ARM64 都在 GitHub-hosted Runner 建置。
2. 未簽章輸出先透過 `actions/upload-artifact` 上傳，取得不可自行偽造的 Artifact ID。
3. 使用 `signpath/github-action-submit-signing-request@v2`、`github-artifact-id` 與上方的 SignPath 設定送出要求，並等待 Approver 核准。
4. Artifact Configuration 必須簽到封裝內的 MQTTape 應用程式執行檔，以及 Portable／NSIS 最終執行檔；不能只簽外層安裝程式。
5. 只從 SignPath 回傳目錄上傳 Release 資產，並在 Windows Runner 以 `Get-AuthenticodeSignature` 驗證所有應簽檔案。
6. 簽章會改變檔案雜湊，因此必須在簽章後重新產生並驗證 electron-updater metadata／blockmap；在這項驗證完成前，不得讓已簽章檔沿用未簽章檔的更新 metadata。
7. Release 的 `SHA256SUMS.txt` 必須在所有簽章與 metadata 工作完成後才產生。

官方 Action 的核心輸入如下；這段是接線參考，不是目前會執行的 Workflow：

```yaml
- name: Submit SignPath signing request
  uses: signpath/github-action-submit-signing-request@v2
  with:
    api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
    organization-id: ${{ vars.SIGNPATH_ORGANIZATION_ID }}
    project-slug: ${{ vars.SIGNPATH_PROJECT_SLUG }}
    signing-policy-slug: ${{ vars.SIGNPATH_SIGNING_POLICY_SLUG }}
    artifact-configuration-slug: ${{ vars.SIGNPATH_ARTIFACT_CONFIGURATION_SLUG }}
    github-artifact-id: ${{ steps.upload-unsigned-artifact.outputs.artifact-id }}
    wait-for-completion: true
    output-artifact-directory: signed-release
```

在 SignPath 尚未提供 Project 與 Artifact Configuration 前，MQTTape 不把這段加入可執行的 Release Workflow，避免發布只簽到部分檔案或更新雜湊失效的套件。

## 核准後的驗收

- Windows x64 Setup、x64 Portable、ARM64 Setup、ARM64 Portable 均能通過 Authenticode 驗證。
- 簽章主體、時間戳記與 SignPath Foundation 憑證鏈符合核准內容。
- 新安裝與覆蓋安裝都能正常啟動、保留設定檔並解除安裝。
- x64 自動更新使用簽章後產生的 metadata；ARM64 在獨立更新 Feed 完成前維持手動下載。
- GitHub Release 只包含已驗證的最終資產與最後產生的 Checksum Manifest。

參考：[SignPath GitHub Trusted Build System 官方文件](https://docs.signpath.io/trusted-build-systems/github)
