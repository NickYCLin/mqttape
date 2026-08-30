import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(resolve(repositoryRoot, path), 'utf8')
}

async function readRepositoryBytes(path: string): Promise<Buffer> {
  return readFile(resolve(repositoryRoot, path))
}

function markdownSection(markdown: string, heading: string): string {
  const marker = `## ${heading}\n`
  const start = markdown.indexOf(marker)
  if (start < 0) throw new Error(`Missing Markdown section: ${heading}`)

  const content = markdown.slice(start + marker.length)
  const nextHeading = content.search(/\n## /)
  return (nextHeading < 0 ? content : content.slice(0, nextHeading)).trim()
}

function markdownList(section: string): string[] {
  return section
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
}

function codePointLength(value: string): number {
  return Array.from(value).length
}

const listingLimits = {
  description: 10_000,
  feature: 200,
  featureCount: 20,
  keyword: 40,
  keywordCount: 7,
  keywordWords: 21,
  shortDescriptionRecommended: 270,
  whatsNew: 1_500
} as const

const expectedScreenshots = [
  'store-listing/zh-TW/screenshots/01-connection-settings.png',
  'store-listing/zh-TW/screenshots/02-live-capture.png',
  'store-listing/zh-TW/screenshots/03-json-inspector.png',
  'store-listing/zh-TW/screenshots/04-qos-packet-flow.png',
  'store-listing/en-US/screenshots/01-connection-settings.png',
  'store-listing/en-US/screenshots/02-live-capture.png',
  'store-listing/en-US/screenshots/03-json-inspector.png',
  'store-listing/en-US/screenshots/04-qos-packet-flow.png'
] as const

describe('Microsoft Store public and listing assets', () => {
  it('publishes a bilingual, script-free privacy page at the directory index path', async () => {
    const privacyPage = await readRepositoryFile('src/renderer/public/privacy/index.html')

    expect(privacyPage).toContain('MQTTape 隱私權政策')
    expect(privacyPage).toContain('MQTTape Privacy Policy')
    expect(privacyPage).toContain('不會收集應用程式使用資料')
    expect(privacyPage).toContain('do not collect application usage data')
    expect(privacyPage).not.toMatch(/<script\b/i)
    expect(privacyPage).not.toMatch(/<link\b[^>]*rel=["']stylesheet/i)
  })

  it('lists the stable privacy URL in the sitemap and both Store locales', async () => {
    const [sitemap, traditionalChinese, english, checklist] = await Promise.all([
      readRepositoryFile('src/renderer/public/sitemap.xml'),
      readRepositoryFile('store-listing/zh-TW/listing.md'),
      readRepositoryFile('store-listing/en-US/listing.md'),
      readRepositoryFile('store-listing/common/submission-checklist.md')
    ])
    const privacyUrl = 'https://nickyclin.github.io/mqttape/privacy/'

    expect(sitemap).toContain(privacyUrl)
    expect(traditionalChinese).toContain(privacyUrl)
    expect(english).toContain(privacyUrl)
    expect(checklist).toContain(privacyUrl)
    expect(traditionalChinese).toContain('runFullTrust')
    expect(english).toContain('runFullTrust')
  })

  it('keeps localized listing text within current Partner Center limits', async () => {
    const listings = [
      {
        markdown: await readRepositoryFile('store-listing/zh-TW/listing.md'),
        headings: {
          description: '描述',
          features: '應用程式功能',
          keywords: '搜尋關鍵字（逐項輸入）',
          shortDescription: '簡短描述',
          whatsNew: '此版本的新功能'
        }
      },
      {
        markdown: await readRepositoryFile('store-listing/en-US/listing.md'),
        headings: {
          description: 'Description',
          features: 'App features',
          keywords: 'Search keywords (enter separately)',
          shortDescription: 'Short description',
          whatsNew: "What's new in this version"
        }
      }
    ]

    for (const { markdown, headings } of listings) {
      const shortDescription = markdownSection(markdown, headings.shortDescription)
      const description = markdownSection(markdown, headings.description)
      const features = markdownList(markdownSection(markdown, headings.features))
      const keywords = markdownList(markdownSection(markdown, headings.keywords))
      const futureWhatsNew = markdownSection(markdown, headings.whatsNew)
        .split('\n')
        .find((line) => line.startsWith('> '))
        ?.slice(2)

      expect(codePointLength(shortDescription)).toBeLessThanOrEqual(
        listingLimits.shortDescriptionRecommended
      )
      expect(codePointLength(description)).toBeLessThanOrEqual(listingLimits.description)
      expect(description).not.toMatch(/https?:\/\//i)
      expect(features).not.toHaveLength(0)
      expect(features.length).toBeLessThanOrEqual(listingLimits.featureCount)
      expect(features.every((feature) => codePointLength(feature) <= listingLimits.feature)).toBe(
        true
      )
      expect(keywords).not.toHaveLength(0)
      expect(keywords.length).toBeLessThanOrEqual(listingLimits.keywordCount)
      expect(keywords.every((keyword) => codePointLength(keyword) <= listingLimits.keyword)).toBe(
        true
      )
      expect(
        keywords.reduce((count, keyword) => count + keyword.split(/\s+/u).length, 0)
      ).toBeLessThanOrEqual(listingLimits.keywordWords)
      expect(futureWhatsNew).toBeDefined()
      expect(codePointLength(futureWhatsNew ?? '')).toBeLessThanOrEqual(listingLimits.whatsNew)
    }
  })

  it('keeps all eight Store screenshots valid and submission-sized', async () => {
    for (const path of expectedScreenshots) {
      const screenshot = await readRepositoryBytes(path)

      expect(screenshot.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
      expect(screenshot.readUInt32BE(16)).toBeGreaterThanOrEqual(1366)
      expect(screenshot.readUInt32BE(20)).toBeGreaterThanOrEqual(768)
      expect(screenshot.byteLength).toBeLessThan(50 * 1024 * 1024)
    }
  })
})
