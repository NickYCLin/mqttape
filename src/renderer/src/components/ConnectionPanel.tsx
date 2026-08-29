import { useState, type FormEvent } from 'react'
import type {
  BrokerProfile,
  ConnectionConfig,
  MqttProtocol,
  MqttQos,
  MqttWebSocketAuthMode,
  MqttWebSocketNameValue,
  MqttWillPayloadFormat,
  TlsFileKind
} from '../../../shared/contracts'
import { defaultMqttLastWill } from '../../../shared/mqtt-will'
import {
  defaultMqttWebSocketAuth,
  MAX_WEBSOCKET_HEADERS,
  MAX_WEBSOCKET_QUERY_PARAMETERS
} from '../../../shared/websocket-auth'
import { PlugIcon, PowerIcon, XIcon } from './icons'
import { useI18n } from '../i18n'
import type { TranslationKey } from '../lib/i18n'

interface ConnectionPanelProps {
  config: ConnectionConfig
  connected: boolean
  connecting: boolean
  busy: boolean
  isDesktop: boolean
  profiles: BrokerProfile[]
  selectedProfileId: string
  onChange: (config: ConnectionConfig) => void
  onConnect: () => void
  onDisconnect: () => void
  onSelectProfile: (id: string) => void
  onSaveProfile: () => void
  onDeleteProfile: () => void
  onSelectTlsFile: (kind: TlsFileKind) => Promise<string | null>
}

const defaultPorts: Record<MqttProtocol, number> = {
  mqtt: 1883,
  mqtts: 8883,
  ws: 8083,
  wss: 8084
}

const protocolGuideKeys: Record<MqttProtocol, TranslationKey> = {
  mqtt: 'connection.protocolGuide.mqtt',
  mqtts: 'connection.protocolGuide.mqtts',
  ws: 'connection.protocolGuide.ws',
  wss: 'connection.protocolGuide.wss'
}

export function ConnectionPanel({
  config,
  connected,
  connecting,
  busy,
  isDesktop,
  profiles,
  selectedProfileId,
  onChange,
  onConnect,
  onDisconnect,
  onSelectProfile,
  onSaveProfile,
  onDeleteProfile,
  onSelectTlsFile
}: ConnectionPanelProps) {
  const { t } = useI18n()
  const update = <Key extends keyof ConnectionConfig>(
    key: Key,
    value: ConnectionConfig[Key]
  ): void => onChange({ ...config, [key]: value })
  const will = config.will ?? defaultMqttLastWill()
  const websocketAuth = config.websocketAuth ?? defaultMqttWebSocketAuth()
  const websocketHeaders = config.websocketHeaders ?? []
  const websocketQueryParameters = config.websocketQueryParameters ?? []
  const websocketTransport = config.protocol === 'ws' || config.protocol === 'wss'
  const updateWill = <Key extends keyof typeof will>(
    key: Key,
    value: (typeof will)[Key]
  ): void => onChange({ ...config, will: { ...will, [key]: value } })

  const changeProtocol = (protocol: MqttProtocol): void => {
    onChange({ ...config, protocol, port: defaultPorts[protocol] })
  }

  const updateWebSocketValue = (
    field: 'websocketHeaders' | 'websocketQueryParameters',
    values: MqttWebSocketNameValue[],
    index: number,
    key: keyof MqttWebSocketNameValue,
    value: string
  ): void => {
    const next = values.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [key]: value } : item
    ))
    update(field, next)
  }

  // Header/query rows carry no identity of their own, and keying them purely
  // by array index makes React reuse a removed row's DOM (and focus) for the
  // row that slides into its place; bumping a version on removal remounts the
  // list only at that moment.
  const [websocketRowVersions, setWebsocketRowVersions] = useState({
    websocketHeaders: 0,
    websocketQueryParameters: 0
  })

  const removeWebSocketValue = (
    field: 'websocketHeaders' | 'websocketQueryParameters',
    values: MqttWebSocketNameValue[],
    index: number
  ): void => {
    setWebsocketRowVersions((current) => ({ ...current, [field]: current[field] + 1 }))
    update(field, values.filter((_item, itemIndex) => itemIndex !== index))
  }

  const chooseTlsFile = async (
    field: 'caPath' | 'clientCertificatePath' | 'clientKeyPath',
    kind: TlsFileKind
  ): Promise<void> => {
    const path = await onSelectTlsFile(kind)
    if (path) update(field, path)
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!connected && !connecting && !busy) onConnect()
  }

  return (
    <form className="panel" noValidate onSubmit={submit}>
      <div className="panel-head">
        <h2>{t('connection.title')}</h2>
        <span className="badge">{t(isDesktop ? 'mode.desktop' : 'mode.webLite')}</span>
      </div>

      <div className="panel-body">
        <div className="profile-row">
          <select
            aria-label={t('connection.savedProfile')}
            value={selectedProfileId}
            disabled={connected || connecting || busy}
            onChange={(event) => onSelectProfile(event.target.value)}
          >
            <option value="">{t('connection.newProfile')}</option>
            {profiles.map((profile) => (
              <option value={profile.id} key={profile.id}>{profile.config.name}</option>
            ))}
          </select>
          <button
            className="btn ghost sm"
            type="button"
            disabled={busy || !config.name.trim()}
            onClick={onSaveProfile}
          >
            {t('common.save')}
          </button>
          <button
            className="btn ghost sm"
            type="button"
            disabled={busy || !selectedProfileId}
            onClick={onDeleteProfile}
          >
            {t('common.delete')}
          </button>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>{t('connection.profileName')}</span>
            <input
              value={config.name}
              disabled={connected || connecting}
              placeholder={t('connection.localBroker')}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>

          <div className="row-3">
            <label className="field">
              <span>{t('connection.protocol')}</span>
              <select
                value={config.protocol}
                disabled={connected || connecting}
                onChange={(event) => changeProtocol(event.target.value as MqttProtocol)}
              >
                {isDesktop && <option value="mqtt">MQTT</option>}
                {isDesktop && <option value="mqtts">MQTTS</option>}
                <option value="ws">WS</option>
                <option value="wss">WSS</option>
              </select>
            </label>

            <label className="field">
              <span>{t('connection.host')}</span>
              <input
                className="mono"
                value={config.host}
                disabled={connected || connecting}
                placeholder="broker.example.com"
                spellCheck={false}
                onChange={(event) => update('host', event.target.value)}
              />
            </label>

            <label className="field">
              <span>{t('connection.port')}</span>
              <input
                className="mono"
                type="number"
                min="1"
                max="65535"
                value={config.port}
                disabled={connected || connecting}
                onChange={(event) => update('port', Number(event.target.value))}
              />
            </label>
          </div>

          <div className="protocol-guide" role="note" aria-live="polite">
            <strong>{t(protocolGuideKeys[config.protocol])}</strong>
            <span>{t('connection.portGuidance')}</span>
            {!isDesktop && <span>{t('connection.webLiteTransport')}</span>}
          </div>

          {(config.protocol === 'ws' || config.protocol === 'wss') && (
            <label className="field">
              <span>{t('connection.path')}</span>
              <input
                className="mono"
                value={config.path}
                disabled={connected || connecting}
                placeholder="mqtt"
                spellCheck={false}
                onChange={(event) => update('path', event.target.value)}
              />
            </label>
          )}

          <div className="row-2">
            <label className="field">
              <span>{t('connection.username')}</span>
              <input
                value={config.username}
                disabled={connected || connecting}
                autoComplete="username"
                placeholder={t('common.optional')}
                onChange={(event) => update('username', event.target.value)}
              />
            </label>

            <label className="field">
              <span>{t('connection.password')}</span>
              <input
                type="password"
                value={config.password}
                disabled={connected || connecting}
                autoComplete="current-password"
                placeholder={t('connection.notStored')}
                onChange={(event) => update('password', event.target.value)}
              />
            </label>
          </div>
        </div>

        <details className="advanced">
          <summary>{t('connection.advanced')}</summary>
          <div className="field-grid">
            <label className="field">
              <span>{t('connection.clientId')}</span>
              <input
                className="mono"
                value={config.clientId}
                disabled={connected || connecting}
                spellCheck={false}
                onChange={(event) => update('clientId', event.target.value)}
              />
            </label>
            <div className="row-2">
              <label className="field">
                <span>{t('connection.mqttVersion')}</span>
                <select
                  value={config.mqttVersion}
                  disabled={connected || connecting}
                  onChange={(event) => update('mqttVersion', Number(event.target.value) as 4 | 5)}
                >
                  <option value={5}>5.0</option>
                  <option value={4}>3.1.1</option>
                </select>
              </label>
              <label className="field">
                <span>{t('connection.keepAlive')}</span>
                <input
                  className="mono"
                  type="number"
                  min="0"
                  max="65535"
                  step="1"
                  value={config.keepalive}
                  disabled={connected || connecting}
                  onChange={(event) => update('keepalive', Number(event.target.value))}
                />
              </label>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={config.clean}
                disabled={connected || connecting}
                onChange={(event) => update('clean', event.target.checked)}
              />
              <span>{t('connection.cleanSession')}</span>
            </label>
            {websocketTransport && (
              <section className="websocket-auth-group">
                <div className="websocket-auth-head">
                  <div>
                    <span className="group-label">{t('connection.websocketHandshake')}</span>
                    <p>{t('connection.websocketHandshakeHelp')}</p>
                  </div>
                  <span className="tag">HTTP</span>
                </div>

                {isDesktop ? (
                  <>
                    <label className="field">
                      <span>{t('connection.websocketAuthMode')}</span>
                      <select
                        value={websocketAuth.mode}
                        disabled={connected || connecting}
                        onChange={(event) => update('websocketAuth', {
                          ...websocketAuth,
                          mode: event.target.value as MqttWebSocketAuthMode
                        })}
                      >
                        <option value="none">{t('connection.websocketAuthNone')}</option>
                        <option value="basic">{t('connection.websocketAuthBasic')}</option>
                        <option value="bearer">{t('connection.websocketAuthBearer')}</option>
                      </select>
                    </label>
                    {websocketAuth.mode === 'basic' && (
                      <label className="field">
                        <span>{t('connection.websocketAuthUsername')}</span>
                        <input
                          value={websocketAuth.username}
                          disabled={connected || connecting}
                          autoComplete="username"
                          onChange={(event) => update('websocketAuth', {
                            ...websocketAuth,
                            username: event.target.value
                          })}
                        />
                      </label>
                    )}
                    {websocketAuth.mode !== 'none' && (
                      <label className="field">
                        <span>{t(websocketAuth.mode === 'basic'
                          ? 'connection.websocketAuthPassword'
                          : 'connection.websocketAuthToken')}</span>
                        <input
                          type="password"
                          value={websocketAuth.secret}
                          disabled={connected || connecting}
                          autoComplete="off"
                          placeholder={t('connection.websocketSecretPlaceholder')}
                          onChange={(event) => update('websocketAuth', {
                            ...websocketAuth,
                            secret: event.target.value
                          })}
                        />
                      </label>
                    )}

                    <div className="websocket-value-list">
                      <div className="websocket-value-head">
                        <strong>{t('connection.websocketHeaders')}</strong>
                        <button
                          className="btn ghost sm"
                          type="button"
                          disabled={connected || connecting || websocketHeaders.length >= MAX_WEBSOCKET_HEADERS}
                          onClick={() => update('websocketHeaders', [
                            ...websocketHeaders,
                            { name: '', value: '' }
                          ])}
                        >
                          {t('connection.websocketAddHeader')}
                        </button>
                      </div>
                      {websocketHeaders.length === 0 && (
                        <p className="hint">{t('connection.websocketHeadersEmpty')}</p>
                      )}
                      {websocketHeaders.map((header, index) => (
                        <div className="websocket-value-row" key={`header-${websocketRowVersions.websocketHeaders}-${index}`}>
                          <input
                            className="mono"
                            aria-label={t('connection.websocketHeaderName', { count: index + 1 })}
                            value={header.name}
                            disabled={connected || connecting}
                            placeholder="X-Tenant-ID"
                            spellCheck={false}
                            onChange={(event) => updateWebSocketValue(
                              'websocketHeaders', websocketHeaders, index, 'name', event.target.value
                            )}
                          />
                          <input
                            className="mono"
                            type="password"
                            aria-label={t('connection.websocketHeaderValue', { count: index + 1 })}
                            value={header.value}
                            disabled={connected || connecting}
                            placeholder={t('connection.websocketSecretValue')}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) => updateWebSocketValue(
                              'websocketHeaders', websocketHeaders, index, 'value', event.target.value
                            )}
                          />
                          <button
                            className="btn ghost icon sm"
                            type="button"
                            disabled={connected || connecting}
                            aria-label={t('connection.websocketRemoveHeader', { count: index + 1 })}
                            onClick={() => removeWebSocketValue(
                              'websocketHeaders', websocketHeaders, index
                            )}
                          >
                            <XIcon width={13} height={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="notice info" role="note">
                    <strong>{t('connection.websocketBrowserLimit')}</strong>
                    <span>{t('connection.websocketBrowserLimitHelp')}</span>
                  </div>
                )}

                <div className="websocket-value-list">
                  <div className="websocket-value-head">
                    <strong>{t('connection.websocketQueryParameters')}</strong>
                    <button
                      className="btn ghost sm"
                      type="button"
                      disabled={connected || connecting || websocketQueryParameters.length >= MAX_WEBSOCKET_QUERY_PARAMETERS}
                      onClick={() => update('websocketQueryParameters', [
                        ...websocketQueryParameters,
                        { name: '', value: '' }
                      ])}
                    >
                      {t('connection.websocketAddQueryParameter')}
                    </button>
                  </div>
                  <p className="hint">{t('connection.websocketQueryHelp')}</p>
                  {websocketQueryParameters.map((parameter, index) => (
                    <div className="websocket-value-row" key={`query-${websocketRowVersions.websocketQueryParameters}-${index}`}>
                      <input
                        className="mono"
                        aria-label={t('connection.websocketQueryName', { count: index + 1 })}
                        value={parameter.name}
                        disabled={connected || connecting}
                        placeholder="access_token"
                        spellCheck={false}
                        onChange={(event) => updateWebSocketValue(
                          'websocketQueryParameters', websocketQueryParameters,
                          index, 'name', event.target.value
                        )}
                      />
                      <input
                        className="mono"
                        type="password"
                        aria-label={t('connection.websocketQueryValue', { count: index + 1 })}
                        value={parameter.value}
                        disabled={connected || connecting}
                        placeholder={t('connection.websocketSecretValue')}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => updateWebSocketValue(
                          'websocketQueryParameters', websocketQueryParameters,
                          index, 'value', event.target.value
                        )}
                      />
                      <button
                        className="btn ghost icon sm"
                        type="button"
                        disabled={connected || connecting}
                        aria-label={t('connection.websocketRemoveQueryParameter', { count: index + 1 })}
                        onClick={() => removeWebSocketValue(
                          'websocketQueryParameters', websocketQueryParameters, index
                        )}
                      >
                        <XIcon width={13} height={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="websocket-storage-note">
                  {t(isDesktop
                    ? 'connection.websocketStorageDesktop'
                    : 'connection.websocketStorageWeb')}
                </p>
              </section>
            )}
            <section className={`will-group ${will.enabled ? 'enabled' : ''}`}>
              <div className="will-group-head">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={will.enabled}
                    disabled={connected || connecting}
                    onChange={(event) => updateWill('enabled', event.target.checked)}
                  />
                  <span>{t('connection.willEnabled')}</span>
                </label>
                <span className="tag">LWT</span>
              </div>
              <p>{t('connection.willHelp')}</p>
              {will.enabled && (
                <div className="will-fields">
                  <label className="field">
                    <span>{t('connection.willTopic')}</span>
                    <input
                      className="mono"
                      value={will.topic}
                      disabled={connected || connecting}
                      placeholder="devices/gateway/status"
                      spellCheck={false}
                      onChange={(event) => updateWill('topic', event.target.value)}
                    />
                  </label>
                  <div className="will-options">
                    <label className="field">
                      <span>{t('connection.willPayloadFormat')}</span>
                      <select
                        value={will.payloadFormat}
                        disabled={connected || connecting}
                        onChange={(event) => updateWill(
                          'payloadFormat',
                          event.target.value as MqttWillPayloadFormat
                        )}
                      >
                        <option value="text">UTF-8</option>
                        <option value="hex">Hex</option>
                        <option value="base64">Base64</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{t('connection.willQos')}</span>
                      <select
                        value={will.qos}
                        disabled={connected || connecting}
                        onChange={(event) => updateWill('qos', Number(event.target.value) as MqttQos)}
                      >
                        <option value={0}>QoS 0</option>
                        <option value={1}>QoS 1</option>
                        <option value={2}>QoS 2</option>
                      </select>
                    </label>
                    <label className="checkbox will-retain">
                      <input
                        type="checkbox"
                        checked={will.retain}
                        disabled={connected || connecting}
                        onChange={(event) => updateWill('retain', event.target.checked)}
                      />
                      <span>{t('connection.willRetain')}</span>
                    </label>
                  </div>
                  <label className="field">
                    <span>{t('connection.willPayload')}</span>
                    <textarea
                      className="mono"
                      rows={3}
                      value={will.payload}
                      disabled={connected || connecting}
                      placeholder={will.payloadFormat === 'text'
                        ? '{ "online": false }'
                        : will.payloadFormat === 'hex'
                          ? 'DE AD BE EF'
                          : '3q2+7w=='}
                      spellCheck={false}
                      onChange={(event) => updateWill('payload', event.target.value)}
                    />
                  </label>
                  {config.mqttVersion === 5 && (
                    <>
                      <div className="row-2">
                        <label className="field">
                          <span>{t('connection.willDelay')}</span>
                          <input
                            className="mono"
                            type="number"
                            min="0"
                            max="4294967295"
                            value={will.willDelayInterval ?? ''}
                            disabled={connected || connecting}
                            placeholder="0"
                            onChange={(event) => updateWill(
                              'willDelayInterval',
                              event.target.value === '' ? undefined : Number(event.target.value)
                            )}
                          />
                        </label>
                        <label className="field">
                          <span>{t('connection.willExpiry')}</span>
                          <input
                            className="mono"
                            type="number"
                            min="0"
                            max="4294967295"
                            value={will.messageExpiryInterval ?? ''}
                            disabled={connected || connecting}
                            placeholder={t('common.optional')}
                            onChange={(event) => updateWill(
                              'messageExpiryInterval',
                              event.target.value === '' ? undefined : Number(event.target.value)
                            )}
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span>{t('connection.willContentType')}</span>
                        <input
                          className="mono"
                          value={will.contentType ?? ''}
                          disabled={connected || connecting}
                          placeholder="application/json"
                          spellCheck={false}
                          onChange={(event) => updateWill(
                            'contentType',
                            event.target.value || undefined
                          )}
                        />
                      </label>
                    </>
                  )}
                  <p className="will-storage-note">
                    {t(isDesktop ? 'connection.willStorageDesktop' : 'connection.willStorageWeb')}
                  </p>
                </div>
              )}
            </section>
            {isDesktop && (config.protocol === 'mqtts' || config.protocol === 'wss') && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={config.rejectUnauthorized}
                  disabled={connected || connecting}
                  onChange={(event) => update('rejectUnauthorized', event.target.checked)}
                />
                <span>{t('connection.verifyTls')}</span>
              </label>
            )}
            {isDesktop && (config.protocol === 'mqtts' || config.protocol === 'wss') && (
              <div className="tls-group">
                <span className="group-label">{t('connection.mtls')}</span>
                <div className="tls-row">
                  <label className="field">
                    <span>{t('connection.customCa')}</span>
                    <input className="mono" readOnly value={config.caPath} placeholder={t('connection.systemTrust')} />
                  </label>
                  <button className="btn ghost sm" type="button" disabled={connected || connecting} onClick={() => void chooseTlsFile('caPath', 'ca')}>{t('common.select')}</button>
                  {config.caPath && <button className="btn ghost sm" type="button" disabled={connected || connecting} onClick={() => update('caPath', '')}>{t('common.clear')}</button>}
                </div>
                <div className="tls-row">
                  <label className="field">
                    <span>{t('connection.clientCertificate')}</span>
                    <input className="mono" readOnly value={config.clientCertificatePath} placeholder={t('connection.optionalCertificate')} />
                  </label>
                  <button className="btn ghost sm" type="button" disabled={connected || connecting} onClick={() => void chooseTlsFile('clientCertificatePath', 'certificate')}>{t('common.select')}</button>
                  {config.clientCertificatePath && <button className="btn ghost sm" type="button" disabled={connected || connecting} onClick={() => update('clientCertificatePath', '')}>{t('common.clear')}</button>}
                </div>
                <div className="tls-row">
                  <label className="field">
                    <span>{t('connection.clientKey')}</span>
                    <input className="mono" readOnly value={config.clientKeyPath} placeholder={t('connection.optionalKey')} />
                  </label>
                  <button className="btn ghost sm" type="button" disabled={connected || connecting} onClick={() => void chooseTlsFile('clientKeyPath', 'key')}>{t('common.select')}</button>
                  {config.clientKeyPath && <button className="btn ghost sm" type="button" disabled={connected || connecting} onClick={() => update('clientKeyPath', '')}>{t('common.clear')}</button>}
                </div>
                <label className="field">
                  <span>{t('connection.keyPassphrase')}</span>
                  <input
                    type="password"
                    value={config.clientKeyPassphrase}
                    disabled={connected || connecting}
                    placeholder={t('connection.securePassphrase')}
                    onChange={(event) => update('clientKeyPassphrase', event.target.value)}
                  />
                </label>
              </div>
            )}
          </div>
        </details>

        <button
          className={`btn block ${connected ? 'danger' : 'primary'}`}
          type={connected ? 'button' : 'submit'}
          disabled={busy}
          onClick={connected ? onDisconnect : undefined}
        >
          {connected ? <PowerIcon width={16} height={16} /> : <PlugIcon width={16} height={16} />}
          {t(connecting ? 'connection.connecting' : connected ? 'connection.disconnect' : 'connection.connect')}
        </button>
      </div>
    </form>
  )
}
