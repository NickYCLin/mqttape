import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  BrokerProfile,
  ConnectionConfig,
  MqttLastWillConfig,
  MqttWebSocketAuth,
  MqttWebSocketNameValue,
  SaveBrokerProfileRequest
} from '../shared/contracts'
import { isConnectionConfigCore, MAX_BROKER_PROFILES } from '../shared/connection-config'

interface SecretProtector {
  isAvailable(): boolean
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
}

type StoredLastWill = Omit<MqttLastWillConfig, 'payload'>
type StoredWebSocketAuth = Omit<MqttWebSocketAuth, 'secret'>
type StoredWebSocketNameValue = Omit<MqttWebSocketNameValue, 'value'>
type StoredConnectionConfig = Omit<
  ConnectionConfig,
  | 'password'
  | 'clientKeyPassphrase'
  | 'websocketAuth'
  | 'websocketHeaders'
  | 'websocketQueryParameters'
  | 'will'
> & {
  websocketAuth?: StoredWebSocketAuth
  websocketHeaders?: StoredWebSocketNameValue[]
  websocketQueryParameters?: StoredWebSocketNameValue[]
  will?: StoredLastWill
}

interface StoredProfile {
  id: string
  config: StoredConnectionConfig
  encryptedSecrets?: string
}

interface StoredProfileFile {
  version: 1
  profiles: StoredProfile[]
}

interface ProfileSecrets {
  password: string
  clientKeyPassphrase: string
  willPayload: string
  websocketAuthSecret: string
  websocketHeaderValues: string[]
  websocketQueryParameterValues: string[]
}

const MAX_BROKER_PROFILE_ID_LENGTH = 128

function withoutSecrets(
  config: ConnectionConfig
): StoredConnectionConfig {
  const safeConfig: Partial<ConnectionConfig> = { ...config }
  delete safeConfig.password
  delete safeConfig.clientKeyPassphrase
  delete safeConfig.websocketAuth
  delete safeConfig.websocketHeaders
  delete safeConfig.websocketQueryParameters
  if (safeConfig.will) {
    const safeWill: Partial<MqttLastWillConfig> = { ...safeConfig.will }
    delete safeWill.payload
    safeConfig.will = safeWill as MqttLastWillConfig
  }
  return {
    ...(safeConfig as StoredConnectionConfig),
    ...(config.websocketAuth
      ? {
          websocketAuth: {
            mode: config.websocketAuth.mode,
            username: config.websocketAuth.username
          }
        }
      : {}),
    websocketHeaders: (config.websocketHeaders ?? []).map(({ name }) => ({ name })),
    websocketQueryParameters: (config.websocketQueryParameters ?? []).map(({ name }) => ({ name }))
  }
}

function normalizeStoredNameValues(value: unknown): StoredWebSocketNameValue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => (
    item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
      ? [{ name: (item as { name: string }).name }]
      : []
  ))
}

function normalizeStoredWebSocketAuth(value: unknown): StoredWebSocketAuth | undefined {
  if (!value || typeof value !== 'object') return undefined
  const auth = value as Partial<StoredWebSocketAuth>
  if (auth.mode !== 'none' && auth.mode !== 'basic' && auth.mode !== 'bearer') return undefined
  return {
    mode: auth.mode,
    username: typeof auth.username === 'string' ? auth.username : ''
  }
}

function normalizeStoredProfile(value: unknown): StoredProfile | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StoredProfile>
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  if (!id || id.length > MAX_BROKER_PROFILE_ID_LENGTH || !candidate.config) return null
  if (!isConnectionConfigCore(candidate.config)) return null

  return {
    id,
    config: {
      ...candidate.config,
      caPath: typeof candidate.config.caPath === 'string' ? candidate.config.caPath : '',
      clientCertificatePath: typeof candidate.config.clientCertificatePath === 'string'
        ? candidate.config.clientCertificatePath
        : '',
      clientKeyPath: typeof candidate.config.clientKeyPath === 'string'
        ? candidate.config.clientKeyPath
        : '',
      websocketAuth: normalizeStoredWebSocketAuth(candidate.config.websocketAuth),
      websocketHeaders: normalizeStoredNameValues(candidate.config.websocketHeaders),
      websocketQueryParameters: normalizeStoredNameValues(
        candidate.config.websocketQueryParameters
      )
    },
    encryptedSecrets: typeof candidate.encryptedSecrets === 'string'
      ? candidate.encryptedSecrets
      : undefined
  } as StoredProfile
}

export class ProfileStore {
  constructor(
    private readonly filePath: string,
    private readonly protector: SecretProtector
  ) {}

  async list(): Promise<BrokerProfile[]> {
    const profiles = await this.readStoredProfiles()
    return profiles.map((profile) => this.toBrokerProfile(profile))
  }

  async save(request: SaveBrokerProfileRequest): Promise<BrokerProfile> {
    const profileName = request.config.name.trim()
    if (!profileName) throw new Error('Profile name is required.')

    const profiles = await this.readStoredProfiles()
    const requestedId = request.id?.trim()
    if (request.id !== undefined && (
      !requestedId || requestedId.length > MAX_BROKER_PROFILE_ID_LENGTH
    )) {
      throw new Error('Profile identifier is invalid.')
    }
    const id = requestedId || randomUUID()
    const existingIndex = profiles.findIndex((profile) => profile.id === id)
    const secrets: ProfileSecrets = {
      password: request.config.password,
      clientKeyPassphrase: request.config.clientKeyPassphrase,
      willPayload: request.config.will?.payload ?? '',
      websocketAuthSecret: request.config.websocketAuth?.secret ?? '',
      websocketHeaderValues: (request.config.websocketHeaders ?? []).map(({ value }) => value),
      websocketQueryParameterValues: (request.config.websocketQueryParameters ?? [])
        .map(({ value }) => value)
    }
    const hasNewSecrets = Boolean(
      secrets.password ||
      secrets.clientKeyPassphrase ||
      secrets.willPayload ||
      secrets.websocketAuthSecret ||
      secrets.websocketHeaderValues.some(Boolean) ||
      secrets.websocketQueryParameterValues.some(Boolean)
    )
    let encryptedSecrets: string | undefined

    if (hasNewSecrets && this.protector.isAvailable()) {
      encryptedSecrets = this.protector.encrypt(JSON.stringify(secrets)).toString('base64')
    }

    const stored: StoredProfile = {
      id,
      config: withoutSecrets({ ...request.config, name: profileName }),
      encryptedSecrets
    }

    if (existingIndex >= 0) profiles[existingIndex] = stored
    else profiles.push(stored)
    if (profiles.length > MAX_BROKER_PROFILES) {
      throw new Error(`A maximum of ${MAX_BROKER_PROFILES} broker profiles is supported.`)
    }

    await this.writeStoredProfiles(profiles)
    return this.toBrokerProfile(stored)
  }

  async delete(id: string): Promise<void> {
    const profiles = await this.readStoredProfiles()
    const next = profiles.filter((profile) => profile.id !== id)
    if (next.length !== profiles.length) await this.writeStoredProfiles(next)
  }

  async isTrustedTlsPath(path: string): Promise<boolean> {
    if (!path) return true
    const profiles = await this.readStoredProfiles()
    return profiles.some(({ config }) =>
      config.caPath === path ||
      config.clientCertificatePath === path ||
      config.clientKeyPath === path
    )
  }

  private async readStoredProfiles(): Promise<StoredProfile[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      if (!parsed || typeof parsed !== 'object') return []
      const file = parsed as Partial<StoredProfileFile>
      if (file.version !== 1 || !Array.isArray(file.profiles)) return []
      const profiles: StoredProfile[] = []
      const ids = new Set<string>()
      for (const value of file.profiles) {
        const profile = normalizeStoredProfile(value)
        if (!profile || ids.has(profile.id)) continue
        ids.add(profile.id)
        profiles.push(profile)
        if (profiles.length === MAX_BROKER_PROFILES) break
      }
      return profiles
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new Error('Broker profiles could not be read.', { cause: reason })
    }
  }

  private async writeStoredProfiles(profiles: StoredProfile[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const file: StoredProfileFile = { version: 1, profiles }
    await writeFile(this.filePath, JSON.stringify(file, null, 2), { encoding: 'utf8', mode: 0o600 })
  }

  private toBrokerProfile(profile: StoredProfile): BrokerProfile {
    const secrets = this.decryptSecrets(profile.encryptedSecrets)
    const { will, ...storedConfig } = profile.config
    return {
      id: profile.id,
      config: {
        ...storedConfig,
        password: secrets.password,
        clientKeyPassphrase: secrets.clientKeyPassphrase,
        websocketAuth: storedConfig.websocketAuth
          ? { ...storedConfig.websocketAuth, secret: secrets.websocketAuthSecret }
          : undefined,
        websocketHeaders: (storedConfig.websocketHeaders ?? []).map(({ name }, index) => ({
          name,
          value: secrets.websocketHeaderValues[index] ?? ''
        })),
        websocketQueryParameters: (storedConfig.websocketQueryParameters ?? [])
          .map(({ name }, index) => ({
            name,
            value: secrets.websocketQueryParameterValues[index] ?? ''
          })),
        ...(will
          ? { will: { ...will, payload: secrets.willPayload } }
          : {})
      },
      secretsStored: Boolean(profile.encryptedSecrets && this.protector.isAvailable())
    }
  }

  private decryptSecrets(value: string | undefined): ProfileSecrets {
    if (!value || !this.protector.isAvailable()) {
      return {
        password: '',
        clientKeyPassphrase: '',
        willPayload: '',
        websocketAuthSecret: '',
        websocketHeaderValues: [],
        websocketQueryParameterValues: []
      }
    }

    try {
      const parsed: unknown = JSON.parse(this.protector.decrypt(Buffer.from(value, 'base64')))
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid secret payload.')
      const secrets = parsed as Partial<ProfileSecrets>
      return {
        password: typeof secrets.password === 'string' ? secrets.password : '',
        clientKeyPassphrase: typeof secrets.clientKeyPassphrase === 'string'
          ? secrets.clientKeyPassphrase
          : '',
        willPayload: typeof secrets.willPayload === 'string' ? secrets.willPayload : '',
        websocketAuthSecret: typeof secrets.websocketAuthSecret === 'string'
          ? secrets.websocketAuthSecret
          : '',
        websocketHeaderValues: Array.isArray(secrets.websocketHeaderValues)
          ? secrets.websocketHeaderValues.map((item) => typeof item === 'string' ? item : '')
          : [],
        websocketQueryParameterValues: Array.isArray(secrets.websocketQueryParameterValues)
          ? secrets.websocketQueryParameterValues.map((item) => typeof item === 'string' ? item : '')
          : []
      }
    } catch {
      return {
        password: '',
        clientKeyPassphrase: '',
        willPayload: '',
        websocketAuthSecret: '',
        websocketHeaderValues: [],
        websocketQueryParameterValues: []
      }
    }
  }
}
