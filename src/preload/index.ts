import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppUpdateStatus,
  BrokerProfile,
  CaptureFile,
  InterfaceLanguage,
  ConnectionConfig,
  MqttMessageRecord,
  MqttPacketEvent,
  MqttSessionId,
  MqttapeBridge,
  PublishRequest,
  SaveBrokerProfileRequest,
  StatusEvent,
  SubscribeRequest,
  TlsFileKind
} from '../shared/contracts'
import type { LoRaWanDownlinkHistoryFile } from '../shared/lorawan-downlink-history'

const bridge: MqttapeBridge = {
  connect: (sessionId: MqttSessionId, config: ConnectionConfig) =>
    ipcRenderer.invoke('mqttape:connect', sessionId, config),
  disconnect: (sessionId: MqttSessionId) =>
    ipcRenderer.invoke('mqttape:disconnect', sessionId),
  destroySession: (sessionId: MqttSessionId) =>
    ipcRenderer.invoke('mqttape:destroy-session', sessionId),
  subscribe: (sessionId: MqttSessionId, request: SubscribeRequest) =>
    ipcRenderer.invoke('mqttape:subscribe', sessionId, request),
  unsubscribe: (sessionId: MqttSessionId, topic: string) =>
    ipcRenderer.invoke('mqttape:unsubscribe', sessionId, topic),
  publish: (sessionId: MqttSessionId, request: PublishRequest) =>
    ipcRenderer.invoke('mqttape:publish', sessionId, request),
  saveCapture: (capture: CaptureFile) => ipcRenderer.invoke('mqttape:save-capture', capture),
  saveDownlinkHistory: (history: LoRaWanDownlinkHistoryFile) =>
    ipcRenderer.invoke('mqttape:save-downlink-history', history),
  listProfiles: (): Promise<BrokerProfile[]> => ipcRenderer.invoke('mqttape:list-profiles'),
  saveProfile: (request: SaveBrokerProfileRequest): Promise<BrokerProfile> =>
    ipcRenderer.invoke('mqttape:save-profile', request),
  deleteProfile: (id: string): Promise<void> => ipcRenderer.invoke('mqttape:delete-profile', id),
  selectTlsFile: (kind: TlsFileKind): Promise<string | null> =>
    ipcRenderer.invoke('mqttape:select-tls-file', kind),
  getUpdateStatus: (): Promise<AppUpdateStatus> =>
    ipcRenderer.invoke('mqttape:get-update-status'),
  checkForUpdates: (): Promise<AppUpdateStatus> =>
    ipcRenderer.invoke('mqttape:check-for-updates'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('mqttape:install-update'),
  setInterfaceLanguage: (language: InterfaceLanguage) =>
    ipcRenderer.send('mqttape:set-interface-language', language),
  onStatus: (listener: (sessionId: MqttSessionId, event: StatusEvent) => void) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      sessionId: MqttSessionId,
      status: StatusEvent
    ): void => listener(sessionId, status)
    ipcRenderer.on('mqttape:status', wrapped)
    return () => ipcRenderer.removeListener('mqttape:status', wrapped)
  },
  onMessage: (listener: (sessionId: MqttSessionId, message: MqttMessageRecord) => void) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      sessionId: MqttSessionId,
      message: MqttMessageRecord
    ): void => listener(sessionId, message)
    ipcRenderer.on('mqttape:message', wrapped)
    return () => ipcRenderer.removeListener('mqttape:message', wrapped)
  },
  onPacket: (listener: (sessionId: MqttSessionId, event: MqttPacketEvent) => void) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      sessionId: MqttSessionId,
      packet: MqttPacketEvent
    ): void => listener(sessionId, packet)
    ipcRenderer.on('mqttape:packet', wrapped)
    return () => ipcRenderer.removeListener('mqttape:packet', wrapped)
  },
  onUpdateStatus: (listener: (status: AppUpdateStatus) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus): void =>
      listener(status)
    ipcRenderer.on('mqttape:update-status', wrapped)
    return () => ipcRenderer.removeListener('mqttape:update-status', wrapped)
  }
}

contextBridge.exposeInMainWorld('mqttape', bridge)
