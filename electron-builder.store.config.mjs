import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { URL } from 'node:url'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
)

function requireStoreIdentity(name) {
  const value = globalThis.process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `${name} is required. Copy the exact value from Partner Center > Product identity.`
    )
  }
  return value
}

const base = packageJson.build
const storeArch = globalThis.process.env.MS_STORE_ARCH?.trim() || globalThis.process.arch
if (!['x64', 'arm64'].includes(storeArch)) {
  throw new Error(`MS_STORE_ARCH must be x64 or arm64, received: ${storeArch}`)
}

function toStoreVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`Microsoft Store packages require a stable SemVer version, received: ${version}`)
  }

  const [, majorText, minorText, patchText] = match
  const parts = [Number(majorText) + 1, Number(minorText), Number(patchText), 0]
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 65535)) {
    throw new Error(`Microsoft Store version is out of range: ${parts.join('.')}`)
  }
  return parts.join('.')
}

const storeVersion = toStoreVersion(packageJson.version)

async function setStoreManifestVersion(manifestPath) {
  const manifest = await readFile(manifestPath, 'utf8')
  let replacements = 0
  const updated = manifest.replace(/(<Identity\b[^>]*\bVersion=")[^"]+("[^>]*>)/, (...args) => {
    replacements += 1
    return `${args[1]}${storeVersion}${args[2]}`
  })
  if (replacements !== 1) {
    throw new Error(`Expected one Identity Version in AppxManifest.xml, found: ${replacements}`)
  }
  await writeFile(manifestPath, updated, 'utf8')
}

export default {
  ...base,
  appxManifestCreated: setStoreManifestVersion,
  publish: null,
  directories: {
    ...base.directories,
    output: 'release/store'
  },
  toolsets: {
    ...base.toolsets,
    winCodeSign: '1.1.0'
  },
  win: {
    ...base.win,
    target: [
      {
        // The stable builder calls this target appx, but MakeAppx chooses the
        // modern MSIX container from this explicit .msix artifact extension.
        target: 'appx',
        arch: [storeArch]
      }
    ]
  },
  appx: {
    applicationId: 'MQTTape',
    identityName: requireStoreIdentity('MS_STORE_IDENTITY_NAME'),
    publisher: requireStoreIdentity('MS_STORE_PUBLISHER'),
    publisherDisplayName: requireStoreIdentity('MS_STORE_PUBLISHER_DISPLAY_NAME'),
    displayName: 'MQTTape',
    artifactName: '${productName}-${version}-store-${arch}.msix',
    backgroundColor: '#6b5ae8',
    languages: ['zh-TW', 'en-US'],
    capabilities: ['internetClient', 'privateNetworkClientServer'],
    minVersion: '10.0.17763.0',
    maxVersionTested: '10.0.26100.0'
  }
}
