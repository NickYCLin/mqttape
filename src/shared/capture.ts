import type { CaptureFile, MqttMessageRecord } from './contracts'
import { MAX_MQTT_KEEPALIVE, MAX_MQTT_RECONNECT_PERIOD } from './connection-config'
import { decodePayload, decodePayloadBytes, filterMessages } from './message'
import { isMqttMessageProperties } from './mqtt-properties'
import { publishTopicError } from './mqtt-topic'

export const MAX_CAPTURE_MESSAGES = 5_000

export interface CaptureTrimOptions {
  includeIncoming: boolean
  includeOutgoing: boolean
  query: string
  fromTimestamp?: string
  toTimestamp?: string
}

export interface CaptureTrimPlan {
  messages: MqttMessageRecord[]
  error?: string
}

const CAPTURE_CONNECTION_FIELDS = new Set([
  'name',
  'protocol',
  'host',
  'port',
  'path',
  'clientId',
  'username',
  'mqttVersion',
  'clean',
  'keepalive',
  'reconnectPeriod',
  'rejectUnauthorized'
])

function isCaptureConnection(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const connection = value as Record<string, unknown>
  if (Object.keys(connection).some((field) => !CAPTURE_CONNECTION_FIELDS.has(field))) return false
  const optionalStringFields = ['name', 'host', 'path', 'clientId', 'username'] as const
  if (optionalStringFields.some((field) =>
    connection[field] !== undefined && typeof connection[field] !== 'string'
  )) return false
  if (
    connection.protocol !== undefined &&
    connection.protocol !== 'mqtt' &&
    connection.protocol !== 'mqtts' &&
    connection.protocol !== 'ws' &&
    connection.protocol !== 'wss'
  ) return false
  if (
    connection.port !== undefined &&
    (!Number.isInteger(connection.port) || Number(connection.port) < 1 || Number(connection.port) > 65_535)
  ) return false
  if (
    connection.mqttVersion !== undefined &&
    connection.mqttVersion !== 4 &&
    connection.mqttVersion !== 5
  ) return false
  if (connection.clean !== undefined && typeof connection.clean !== 'boolean') return false
  if (
    connection.keepalive !== undefined &&
    (!Number.isInteger(connection.keepalive) ||
      Number(connection.keepalive) < 0 ||
      Number(connection.keepalive) > MAX_MQTT_KEEPALIVE)
  ) return false
  if (
    connection.reconnectPeriod !== undefined &&
    (!Number.isInteger(connection.reconnectPeriod) ||
      Number(connection.reconnectPeriod) < 0 ||
      Number(connection.reconnectPeriod) > MAX_MQTT_RECONNECT_PERIOD)
  ) return false
  if (
    connection.rejectUnauthorized !== undefined &&
    typeof connection.rejectUnauthorized !== 'boolean'
  ) return false
  return true
}

function captureBoundary(value: string | undefined, label: string): { time?: number; error?: string } {
  if (!value) return {}
  const time = Date.parse(value)
  return Number.isFinite(time)
    ? { time }
    : { error: `${label} is not a valid date and time.` }
}

export function createCaptureTrimPlan(
  messages: MqttMessageRecord[],
  options: CaptureTrimOptions
): CaptureTrimPlan {
  const from = captureBoundary(options.fromTimestamp, 'Start time')
  if (from.error) return { messages: [], error: from.error }
  const to = captureBoundary(options.toTimestamp, 'End time')
  if (to.error) return { messages: [], error: to.error }
  if (from.time !== undefined && to.time !== undefined && from.time > to.time) {
    return { messages: [], error: 'Start time must be before or equal to end time.' }
  }

  const selected = messages.filter((message) => {
    if (message.direction === 'incoming' && !options.includeIncoming) return false
    if (message.direction === 'outgoing' && !options.includeOutgoing) return false
    const timestamp = Date.parse(message.timestamp)
    if (from.time !== undefined && timestamp < from.time) return false
    if (to.time !== undefined && timestamp > to.time) return false
    return true
  })

  return { messages: filterMessages(selected, options.query) }
}

export function isCaptureFile(value: unknown): value is CaptureFile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CaptureFile>
  if (candidate.format !== 'mqttape-capture' || candidate.version !== 1) return false
  if (typeof candidate.exportedAt !== 'string' || !Number.isFinite(Date.parse(candidate.exportedAt))) {
    return false
  }
  if (
    !isCaptureConnection(candidate.connection) ||
    !Array.isArray(candidate.messages) ||
    candidate.messages.length > MAX_CAPTURE_MESSAGES
  ) {
    return false
  }

  const messageIds = new Set<string>()

  return candidate.messages.every((message) => {
    const timestamp = Date.parse(message?.timestamp ?? '')
    const validShape = Boolean(
      message &&
      typeof message.id === 'string' &&
      message.id.trim() &&
      !messageIds.has(message.id) &&
      (message.direction === 'incoming' || message.direction === 'outgoing') &&
      typeof message.topic === 'string' &&
      !publishTopicError(message.topic) &&
      Number.isFinite(timestamp) &&
      (message.qos === 0 || message.qos === 1 || message.qos === 2) &&
      typeof message.retain === 'boolean' &&
      typeof message.duplicate === 'boolean' &&
      typeof message.payloadBase64 === 'string' &&
      typeof message.payloadText === 'string' &&
      typeof message.size === 'number' &&
      message.size >= 0 &&
      (message.properties === undefined || isMqttMessageProperties(message.properties))
    )
    if (!validShape) return false
    messageIds.add(message.id)

    try {
      return decodePayloadBytes(message.payloadBase64).byteLength === message.size &&
        decodePayload(message.payloadBase64) === message.payloadText
    } catch {
      return false
    }
  })
}
