import { useEffect, useState } from 'react'
import type { AppUpdateStatus } from '../../../shared/contracts'
import { useI18n } from '../i18n'
import { DownloadIcon, RefreshIcon } from './icons'

const RELEASES_URL = 'https://github.com/NickYCLin/mqttape/releases/latest'

export function UpdateControl() {
  const { t } = useI18n()
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)

  useEffect(() => {
    const bridge = window.mqttape
    if (!bridge) return undefined

    let active = true
    const removeListener = bridge.onUpdateStatus((nextStatus) => {
      if (active) setStatus(nextStatus)
    })
    void bridge.getUpdateStatus().then((nextStatus) => {
      if (active) setStatus(nextStatus)
    })

    return () => {
      active = false
      removeListener()
    }
  }, [])

  if (!status || status.mode === 'disabled') return null

  if (status.mode === 'manual') {
    const labelKey = status.reason === 'portable'
      ? 'update.manualPortable'
      : status.reason === 'unsupported-architecture'
        ? 'update.manualArchitecture'
        : 'update.manual'
    return (
      <a
        className="btn ghost sm update-control"
        href={RELEASES_URL}
        target="_blank"
        rel="noreferrer"
        title={t(labelKey)}
      >
        <DownloadIcon width={15} height={15} />
        <span>{t(labelKey)}</span>
      </a>
    )
  }

  const progress = status.progress ?? 0
  const label = (() => {
    switch (status.state) {
      case 'checking': return t('update.checking')
      case 'available': return t('update.available', { version: status.targetVersion ?? '' })
      case 'downloading': return t('update.downloading', { progress })
      case 'downloaded': return t('update.downloaded')
      case 'up-to-date': return t('update.upToDate')
      case 'error': return t('update.error')
      default: return t('update.check')
    }
  })()
  const busy = ['checking', 'available', 'downloading'].includes(status.state)
  // Downloading is the only state where something is actually being fetched;
  // every other state is a check or a restart.
  const Icon = status.state === 'available' || status.state === 'downloading'
    ? DownloadIcon
    : RefreshIcon

  const handleClick = async (): Promise<void> => {
    const bridge = window.mqttape
    if (!bridge) return
    if (status.state === 'downloaded') {
      await bridge.installUpdate()
      return
    }
    await bridge.checkForUpdates()
  }

  return (
    <button
      className={`btn ghost sm update-control ${status.state}`}
      type="button"
      disabled={busy}
      aria-live="polite"
      aria-label={label}
      title={label}
      onClick={() => void handleClick()}
    >
      <Icon width={15} height={15} />
      <span>{label}</span>
    </button>
  )
}
