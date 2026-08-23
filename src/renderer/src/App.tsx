import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ConnectionPanel } from './components/ConnectionPanel'
import {
  DownloadIcon,
  DownlinkIcon,
  GithubIcon,
  PacketFlowIcon,
  PlayIcon,
  SearchIcon,
  TapeIcon,
  TimelineIcon,
  TopicTreeIcon,
  TrashIcon,
  XIcon
} from './components/icons'
import { CaptureExportDialog } from './components/CaptureExportDialog'
import { MessageTimeline } from './components/MessageTimeline'
import { LoRaWanDownlinkTracker } from './components/LoRaWanDownlinkTracker'
import { PacketFlowViewer } from './components/PacketFlowViewer'
import { PublishComposer } from './components/PublishComposer'
import { ReplayDialog } from './components/ReplayDialog'
import { SubscriptionPanel } from './components/SubscriptionPanel'
import { ThemeMenu } from './components/ThemeMenu'
import { TopicExplorer } from './components/TopicExplorer'
import { UpdateControl } from './components/UpdateControl'
import { useMqttSession } from './hooks/use-mqtt-session'
import { filterMessages, formatBytes } from '../../shared/message'
import type {
  CaptureFile,
  ConnectionConfig,
  ConnectionState,
  StatusEvent
} from '../../shared/contracts'
import { isCaptureFile } from '../../shared/capture'
import { useI18n } from './i18n'
import type { TranslationKey } from './lib/i18n'
import type { LoRaWanDownlinkHistoryFile } from '../../shared/lorawan-downlink-history'

const statusLabelKeys: Record<ConnectionState, TranslationKey> = {
  disconnected: 'status.disconnected',
  connecting: 'status.connecting',
  connected: 'status.connected',
  reconnecting: 'status.reconnecting',
  offline: 'status.offline',
  error: 'status.error'
}

type SessionView = 'timeline' | 'packets' | 'topics' | 'downlinks'

const sessionTitleKeys: Record<SessionView, TranslationKey> = {
  timeline: 'session.timeline',
  packets: 'session.packetFlows',
  topics: 'session.topicTree',
  downlinks: 'session.downlinks'
}

const sessionFilterPlaceholderKeys: Record<SessionView, TranslationKey> = {
  timeline: 'session.filterMessagesPlaceholder',
  packets: 'session.filterPacketFlowsPlaceholder',
  topics: 'session.filterTopicsPlaceholder',
  downlinks: 'session.filterDownlinksPlaceholder'
}

const sessionFilterLabelKeys: Record<SessionView, TranslationKey> = {
  timeline: 'session.filterMessages',
  packets: 'session.filterPacketFlows',
  topics: 'session.filterTopics',
  downlinks: 'session.filterDownlinks'
}

const MAX_BROKER_SESSIONS = 8

interface BrokerSessionSummary {
  id: string
  config: ConnectionConfig
  status: StatusEvent
  isDesktop: boolean
  totalMessageCount: number
}

interface BrokerSessionTab {
  id: string
  unread: number
  lastMessageCount: number
}

interface BrokerWorkspaceProps {
  sessionId: string
  onSummary: (summary: BrokerSessionSummary) => void
}

function createSessionId(): string {
  return `session_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
    .replace(/-/g, '_')
}

function downlinkEndpointNamespace(config: ConnectionConfig): string {
  if (!config.host.trim()) return ''
  return `endpoint:${config.protocol}://${config.host.trim().toLocaleLowerCase()}:${config.port}${config.path}`
}

const BrokerWorkspace = memo(function BrokerWorkspace({
  sessionId,
  onSummary
}: BrokerWorkspaceProps) {
  const { t, translateMessage, formatNumber } = useI18n()
  const session = useMqttSession(sessionId)
  const [query, setQuery] = useState('')
  const [activeView, setActiveView] = useState<SessionView>('timeline')
  const [captureToExport, setCaptureToExport] = useState<CaptureFile | null>(null)
  const [replayCapture, setReplayCapture] = useState<CaptureFile | null>(null)
  const captureInputRef = useRef<HTMLInputElement>(null)
  const connected = session.status.state === 'connected'
  const connecting = session.status.state === 'connecting' || session.status.state === 'reconnecting'
  const visibleMessages = useMemo(
    () => filterMessages(session.messages, query),
    [query, session.messages]
  )
  // Deriving the endpoint namespace from the live config would remount the
  // tracker (and fork its stored history) on every keystroke in the host
  // field, so it follows the config that actually connected.
  const downlinkStorageNamespace = session.selectedProfileId
    ? `profile:${session.selectedProfileId}`
    : session.lastConnectedConfig
      ? downlinkEndpointNamespace(session.lastConnectedConfig)
      : ''

  useEffect(() => {
    onSummary({
      id: sessionId,
      config: session.config,
      status: session.status,
      isDesktop: session.isDesktop,
      totalMessageCount: session.totalMessageCount
    })
  }, [onSummary, session.config, session.isDesktop, session.totalMessageCount, session.status, sessionId])

  const saveCapture = async (capture: CaptureFile): Promise<boolean> => {
    try {
      if (window.mqttape) return window.mqttape.saveCapture(capture)

      const blob = new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `mqttape-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      return true
    } catch (reason) {
      session.reportError(reason instanceof Error ? reason.message : String(reason))
      return false
    }
  }

  const saveDownlinkHistory = async (
    history: LoRaWanDownlinkHistoryFile
  ): Promise<boolean> => {
    try {
      if (window.mqttape) return window.mqttape.saveDownlinkHistory(history)

      const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `mqttape-downlinks-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      return true
    } catch (reason) {
      session.reportError(reason instanceof Error ? reason.message : String(reason))
      return false
    }
  }

  const importAndReplay = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isCaptureFile(parsed)) {
        session.reportError('The selected file is not a supported MQTTape v1 capture.')
        return
      }
      session.resetReplay()
      setReplayCapture(parsed)
    } catch (reason) {
      session.reportError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <>
      <div className="workspace">
        <aside className="sidebar">
          <ConnectionPanel
            config={session.config}
            connected={connected}
            connecting={connecting}
            busy={session.busy}
            isDesktop={session.isDesktop}
            profiles={session.profiles}
            selectedProfileId={session.selectedProfileId}
            onChange={session.setConfig}
            onConnect={session.connect}
            onDisconnect={session.disconnect}
            onSelectProfile={session.selectProfile}
            onSaveProfile={() => void session.saveProfile()}
            onDeleteProfile={() => void session.deleteProfile()}
            onSelectTlsFile={session.selectTlsFile}
          />
          <SubscriptionPanel
            connected={connected && !session.busy}
            subscriptions={session.subscriptions}
            onSubscribe={session.subscribe}
            onUnsubscribe={session.unsubscribe}
          />
        </aside>

        <main className="stage">
          <section className="metrics" aria-label={t('stats.label')}>
            <div className="metric">
              <span className="metric-label">{t('common.incoming')}</span>
              <strong className="metric-value">{formatNumber(session.stats.incoming)}</strong>
              <small className="metric-note">{t('stats.messages')}</small>
            </div>
            <div className="metric">
              <span className="metric-label">{t('common.outgoing')}</span>
              <strong className="metric-value">{formatNumber(session.stats.outgoing)}</strong>
              <small className="metric-note">{t('stats.messages')}</small>
            </div>
            <div className="metric">
              <span className="metric-label">{t('stats.captured')}</span>
              <strong className="metric-value">{formatBytes(session.stats.bytes)}</strong>
              <small className="metric-note">{t('stats.inSession')}</small>
            </div>
            <div className="metric">
              <span className="metric-label">{t('stats.recorder')}</span>
              <strong className="metric-value metric-state">
                <i className={`rec-dot ${connected ? 'recording' : ''}`} aria-hidden="true" />
                {t(connected ? 'stats.live' : 'stats.ready')}
              </strong>
              <small className="metric-note">{t('stats.limit')}</small>
            </div>
          </section>

          <section className="stage-panel" aria-labelledby="stage-title">
            <h2 className="sr-only" id="stage-title">
              {t(sessionTitleKeys[activeView])}
            </h2>
            <div className="stage-toolbar">
              <div className="segmented" role="group" aria-label={t('session.view')}>
                <button
                  className={activeView === 'timeline' ? 'active' : ''}
                  type="button"
                  aria-pressed={activeView === 'timeline'}
                  onClick={() => setActiveView('timeline')}
                >
                  <TimelineIcon width={15} height={15} />
                  <span>{t('session.timelineTab')}</span>
                </button>
                <button
                  className={activeView === 'packets' ? 'active' : ''}
                  type="button"
                  aria-pressed={activeView === 'packets'}
                  onClick={() => setActiveView('packets')}
                >
                  <PacketFlowIcon width={15} height={15} />
                  <span>{t('session.packetFlowsTab')}</span>
                </button>
                <button
                  className={activeView === 'topics' ? 'active' : ''}
                  type="button"
                  aria-pressed={activeView === 'topics'}
                  onClick={() => setActiveView('topics')}
                >
                  <TopicTreeIcon width={15} height={15} />
                  <span>{t('session.topicsTab')}</span>
                </button>
                <button
                  className={activeView === 'downlinks' ? 'active' : ''}
                  type="button"
                  aria-pressed={activeView === 'downlinks'}
                  onClick={() => setActiveView('downlinks')}
                >
                  <DownlinkIcon width={15} height={15} />
                  <span>{t('session.downlinksTab')}</span>
                </button>
              </div>

              <label className="search">
                <SearchIcon width={15} height={15} />
                <input
                  value={query}
                  placeholder={t(sessionFilterPlaceholderKeys[activeView])}
                  aria-label={t(sessionFilterLabelKeys[activeView])}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button type="button" aria-label={t('session.clearFilter')} onClick={() => setQuery('')}>
                    <XIcon width={14} height={14} />
                  </button>
                )}
              </label>

              <div className="toolbar-actions">
                <button
                  className="btn ghost icon"
                  type="button"
                  title={t(activeView === 'packets' ? 'session.clearPacketFlows' : 'session.clearMessages')}
                  aria-label={t(activeView === 'packets' ? 'session.clearPacketFlows' : 'session.clearMessages')}
                  disabled={activeView === 'packets' ? session.packetFlows.length === 0 : session.messages.length === 0}
                  onClick={activeView === 'packets' ? session.clearPacketFlows : session.clearMessages}
                >
                  <TrashIcon width={16} height={16} />
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  disabled={!connected || session.busy}
                  onClick={() => captureInputRef.current?.click()}
                >
                  <PlayIcon width={16} height={16} />
                  <span>{t('session.replay')}</span>
                </button>
                <input
                  ref={captureInputRef}
                  className="sr-only"
                  type="file"
                  accept="application/json,.json"
                  aria-label={t('session.captureFile')}
                  tabIndex={-1}
                  onChange={importAndReplay}
                />
                <button
                  className="btn ghost"
                  type="button"
                  disabled={session.messages.length === 0 || session.busy}
                  onClick={() => setCaptureToExport(session.makeCapture())}
                >
                  <DownloadIcon width={16} height={16} />
                  <span>{t('session.export')}</span>
                </button>
              </div>
            </div>

            {query && activeView === 'timeline' && (
              <p className="filter-note">
                {t('session.filterResult', {
                  visible: formatNumber(visibleMessages.length),
                  total: formatNumber(session.messages.length)
                })}
              </p>
            )}

            <div className={`stage-scroll ${activeView !== 'timeline' ? 'no-scroll' : ''}`}>
              {activeView === 'timeline' ? (
                <MessageTimeline messages={visibleMessages} />
              ) : activeView === 'packets' ? (
                <PacketFlowViewer flows={session.packetFlows} query={query} />
              ) : activeView === 'topics' ? (
                <TopicExplorer
                  messages={session.messages}
                  query={query}
                  onInspectTopic={(topic) => {
                    setQuery(topic)
                    setActiveView('timeline')
                  }}
                />
              ) : (
                <LoRaWanDownlinkTracker
                  key={downlinkStorageNamespace}
                  messages={session.messages}
                  query={query}
                  storageNamespace={downlinkStorageNamespace}
                  onExport={saveDownlinkHistory}
                />
              )}
            </div>
          </section>

          <PublishComposer
            connected={connected && !session.busy}
            mqttVersion={session.config.mqttVersion}
            onPublish={session.publish}
          />
        </main>
      </div>

      {session.error && (
        <div className="toast" role="alert">
          <div className="toast-copy">
            <strong>{t('error.operationFailed')}</strong>
            <span>{translateMessage(session.error)}</span>
          </div>
          <button type="button" aria-label={t('error.dismiss')} onClick={session.clearError}>
            <XIcon width={16} height={16} />
          </button>
        </div>
      )}

      {captureToExport && (
        <CaptureExportDialog
          capture={captureToExport}
          onExport={saveCapture}
          onClose={() => setCaptureToExport(null)}
        />
      )}

      {replayCapture && (
        <ReplayDialog
          capture={replayCapture}
          mqttVersion={session.config.mqttVersion}
          progress={session.replayProgress}
          onStart={(options) => void session.startReplay(replayCapture, options)}
          onPause={session.pauseReplay}
          onResume={session.resumeReplay}
          onCancel={session.cancelReplay}
          onClose={() => {
            session.resetReplay()
            setReplayCapture(null)
          }}
        />
      )}
    </>
  )
})

export default function App() {
  const { language, setLanguage, t, formatNumber } = useI18n()
  const [initialSessionId] = useState(createSessionId)
  const [sessions, setSessions] = useState<BrokerSessionTab[]>([
    { id: initialSessionId, unread: 0, lastMessageCount: 0 }
  ])
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId)
  const [summaries, setSummaries] = useState<Record<string, BrokerSessionSummary>>({})
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)

  const handleSummary = useCallback((summary: BrokerSessionSummary): void => {
    setSummaries((current) => {
      const previous = current[summary.id]
      if (
        previous &&
        previous.config === summary.config &&
        previous.status === summary.status &&
        previous.isDesktop === summary.isDesktop &&
        previous.totalMessageCount === summary.totalMessageCount
      ) {
        return current
      }
      return { ...current, [summary.id]: summary }
    })
    setSessions((current) => {
      let changed = false
      const next = current.map((tab) => {
        if (tab.id !== summary.id) return tab
        const addedMessages = Math.max(0, summary.totalMessageCount - tab.lastMessageCount)
        const unread = summary.id === activeSessionId ? 0 : tab.unread + addedMessages
        if (unread === tab.unread && tab.lastMessageCount === summary.totalMessageCount) return tab
        changed = true
        return { ...tab, unread, lastMessageCount: summary.totalMessageCount }
      })
      return changed ? next : current
    })
  }, [activeSessionId])

  const selectSession = (sessionId: string): void => {
    setActiveSessionId(sessionId)
    setSessions((current) => current.map((tab) => (
      tab.id === sessionId ? { ...tab, unread: 0 } : tab
    )))
  }

  const addSession = (): void => {
    if (sessions.length >= MAX_BROKER_SESSIONS) {
      setSessionNotice(t('sessions.limit', { count: MAX_BROKER_SESSIONS }))
      return
    }
    const id = createSessionId()
    setSessions((current) => [...current, { id, unread: 0, lastMessageCount: 0 }])
    setActiveSessionId(id)
    setSessionNotice(null)
  }

  const closeSession = (sessionId: string): void => {
    if (sessions.length <= 1) return
    const closingIndex = sessions.findIndex(({ id }) => id === sessionId)
    const remaining = sessions.filter(({ id }) => id !== sessionId)
    setSessions(remaining)
    setSummaries((current) => {
      const next = { ...current }
      delete next[sessionId]
      return next
    })
    if (activeSessionId === sessionId) {
      setActiveSessionId(remaining[Math.min(closingIndex, remaining.length - 1)].id)
    }
  }

  const activeSummary = summaries[activeSessionId]
  const activeStatus = activeSummary?.status ?? { state: 'disconnected' as const }
  const activeConfig = activeSummary?.config
  const activeEndpoint = activeConfig?.host.trim()
    ? `${activeConfig.host}:${activeConfig.port}`
    : ''
  const activeStatusDetail = activeStatus.detail
    || activeEndpoint
    || t(activeSummary?.isDesktop ? 'mode.desktopFull' : 'mode.webSocketLite')

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><TapeIcon width={20} height={20} /></span>
          <span className="brand-text">
            <strong>MQTTape</strong>
            <small>{t('app.tagline')}</small>
          </span>
        </div>

        <div className={`status status-${activeStatus.state}`}>
          <span className="status-dot" aria-hidden="true" />
          <span className="status-text">
            <strong>{t(statusLabelKeys[activeStatus.state])}</strong>
            <small title={activeStatusDetail}>{activeStatusDetail}</small>
          </span>
        </div>

        <div className="topbar-actions">
          <UpdateControl />
          <ThemeMenu />
          <label className="select-inline">
            <span className="sr-only">{t('language.label')}</span>
            <select
              aria-label={t('language.label')}
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'en' | 'zh-TW')}
            >
              <option value="zh-TW">{t('language.traditionalChinese')}</option>
              <option value="en">{t('language.english')}</option>
            </select>
          </label>
          <a
            className="btn ghost icon"
            href="https://github.com/NickYCLin/mqttape"
            target="_blank"
            rel="noreferrer"
            title={t('app.github')}
            aria-label={t('app.github')}
          >
            <GithubIcon width={16} height={16} />
          </a>
        </div>
      </header>

      <nav className="session-tabs" aria-label={t('sessions.label')}>
        <div className="session-tabs-scroll" role="tablist">
          {sessions.map((tab, index) => {
            const summary = summaries[tab.id]
            const label = summary?.config.name.trim()
              || summary?.config.host.trim()
              || t('sessions.untitled', { count: index + 1 })
            const state = summary?.status.state ?? 'disconnected'
            return (
              <div className={`session-tab status-${state}`} key={tab.id} role="presentation">
                <button
                  className={activeSessionId === tab.id ? 'active' : ''}
                  id={`tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeSessionId === tab.id}
                  aria-controls={`workspace-${tab.id}`}
                  title={label}
                  onClick={() => selectSession(tab.id)}
                >
                  <span className="status-dot" aria-hidden="true" />
                  <span>{label}</span>
                  {tab.unread > 0 && (
                    <small aria-label={t('sessions.unread', { count: tab.unread })}>
                      {formatNumber(tab.unread)}
                    </small>
                  )}
                </button>
                {sessions.length > 1 && (
                  <button
                    className="session-tab-close"
                    type="button"
                    aria-label={t('sessions.close', { name: label })}
                    title={t('sessions.close', { name: label })}
                    onClick={() => closeSession(tab.id)}
                  >
                    <XIcon width={13} height={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button
          className="btn ghost session-add"
          type="button"
          disabled={sessions.length >= MAX_BROKER_SESSIONS}
          title={sessions.length >= MAX_BROKER_SESSIONS
            ? t('sessions.limit', { count: MAX_BROKER_SESSIONS })
            : t('sessions.add')}
          aria-label={t('sessions.add')}
          onClick={addSession}
        >
          <span aria-hidden="true">＋</span>
          <span>{t('sessions.add')}</span>
        </button>
      </nav>

      <div className="session-host">
        {sessions.map((tab) => (
          <section
            className="session-workspace"
            id={`workspace-${tab.id}`}
            key={tab.id}
            role="tabpanel"
            aria-labelledby={`tab-${tab.id}`}
            aria-hidden={activeSessionId !== tab.id}
            hidden={activeSessionId !== tab.id}
          >
            <BrokerWorkspace sessionId={tab.id} onSummary={handleSummary} />
          </section>
        ))}
      </div>

      {sessionNotice && (
        <div className="toast" role="alert">
          <div className="toast-copy">
            <strong>{t('sessions.label')}</strong>
            <span>{sessionNotice}</span>
          </div>
          <button type="button" aria-label={t('error.dismiss')} onClick={() => setSessionNotice(null)}>
            <XIcon width={16} height={16} />
          </button>
        </div>
      )}
    </div>
  )
}
