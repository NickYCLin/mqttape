import { describe, expect, it } from 'vitest'
import { MAX_CAPTURE_MESSAGES, createCaptureTrimPlan, isCaptureFile } from './capture'
import type { MqttMessageRecord } from './contracts'

function message(
  id: string,
  direction: MqttMessageRecord['direction'],
  timestamp: string,
  topic: string,
  payloadText: string
): MqttMessageRecord {
  return {
    id,
    direction,
    timestamp,
    topic,
    qos: 0,
    retain: false,
    duplicate: false,
    payloadBase64: btoa(payloadText),
    payloadText,
    size: payloadText.length
  }
}

describe('capture validation', () => {
  it('accepts a version 1 MQTTape capture', () => {
    expect(isCaptureFile({
      format: 'mqttape-capture',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      connection: {},
      messages: [{
        id: 'one',
        direction: 'incoming',
        topic: 'demo/topic',
        timestamp: '2026-01-01T00:00:00.000Z',
        qos: 1,
        retain: false,
        duplicate: false,
        payloadBase64: 'aGVsbG8=',
        payloadText: 'hello',
        size: 5
      }]
    })).toBe(true)
  })

  it('accepts optional MQTT 5 properties without breaking version 1 captures', () => {
    const capture = {
      format: 'mqttape-capture',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      connection: {},
      messages: [{
        id: 'mqtt5',
        direction: 'incoming',
        topic: 'demo/mqtt5',
        timestamp: '2026-01-01T00:00:00.000Z',
        qos: 0,
        retain: false,
        duplicate: false,
        payloadBase64: 'e30=',
        payloadText: '{}',
        size: 2,
        properties: {
          payloadFormatIndicator: true,
          messageExpiryInterval: 120,
          responseTopic: 'demo/replies',
          correlationDataBase64: '3q2+7w==',
          userProperties: [{ name: 'source', value: 'test' }],
          subscriptionIdentifiers: [7],
          contentType: 'application/json'
        }
      }]
    }

    expect(isCaptureFile(capture)).toBe(true)
    expect(isCaptureFile({
      ...capture,
      messages: [{
        ...capture.messages[0],
        properties: { correlationDataBase64: 'not base64!' }
      }]
    })).toBe(false)
  })

  it('rejects unknown formats and malformed messages', () => {
    expect(isCaptureFile({ format: 'other', version: 1, messages: [] })).toBe(false)
    expect(isCaptureFile({
      format: 'mqttape-capture',
      version: 1,
      connection: {},
      messages: [{ topic: 42 }]
    })).toBe(false)
  })

  it('rejects malformed metadata, duplicate IDs, and captures above the retained limit', () => {
    const validMessage = message(
      'unique',
      'incoming',
      '2026-01-01T00:00:00.000Z',
      'demo/topic',
      'payload'
    )
    const capture = {
      format: 'mqttape-capture',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      connection: {},
      messages: [validMessage]
    }

    expect(isCaptureFile({ ...capture, exportedAt: 'not-a-date' })).toBe(false)
    expect(isCaptureFile({ ...capture, connection: [] })).toBe(false)
    expect(isCaptureFile({ ...capture, messages: [{ ...validMessage, id: '  ' }] })).toBe(false)
    expect(isCaptureFile({ ...capture, messages: [validMessage, validMessage] })).toBe(false)
    expect(isCaptureFile({
      ...capture,
      messages: Array.from(
        { length: MAX_CAPTURE_MESSAGES + 1 },
        (_, index) => ({ ...validMessage, id: `message-${index}` })
      )
    })).toBe(false)
  })

  it('rejects malformed Base64 and payload sizes that do not match the original bytes', () => {
    const capture = {
      format: 'mqttape-capture',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      connection: {},
      messages: [{
        id: 'binary',
        direction: 'incoming',
        topic: 'demo/binary',
        timestamp: '2026-01-01T00:00:00.000Z',
        qos: 0,
        retain: false,
        duplicate: false,
        payloadBase64: 'AEH/IH4K',
        payloadText: '\u0000A� ~\n',
        size: 6
      }]
    }

    expect(isCaptureFile(capture)).toBe(true)
    expect(isCaptureFile({
      ...capture,
      messages: [{ ...capture.messages[0], payloadBase64: 'not base64!' }]
    })).toBe(false)
    expect(isCaptureFile({
      ...capture,
      messages: [{ ...capture.messages[0], size: 5 }]
    })).toBe(false)
  })

  it('trims captures by direction and a case-insensitive topic or payload query', () => {
    const messages = [
      message('one', 'incoming', '2026-01-01T00:00:00.000Z', 'factory/Line-A', 'running'),
      message('two', 'outgoing', '2026-01-01T00:00:01.000Z', 'factory/line-b', 'STOPPED'),
      message('three', 'outgoing', '2026-01-01T00:00:02.000Z', 'office/line-a', 'running')
    ]

    expect(createCaptureTrimPlan(messages, {
      includeIncoming: false,
      includeOutgoing: true,
      query: 'stopped'
    }).messages.map(({ id }) => id)).toEqual(['two'])
  })

  it('keeps messages on inclusive time boundaries while preserving their order', () => {
    const messages = [
      message('one', 'incoming', '2026-01-01T00:00:00.000Z', 'demo/one', '1'),
      message('two', 'incoming', '2026-01-01T00:00:01.000Z', 'demo/two', '2'),
      message('three', 'incoming', '2026-01-01T00:00:02.000Z', 'demo/three', '3')
    ]
    const original = [...messages]

    const plan = createCaptureTrimPlan(messages, {
      includeIncoming: true,
      includeOutgoing: true,
      query: '',
      fromTimestamp: '2026-01-01T00:00:01.000Z',
      toTimestamp: '2026-01-01T00:00:02.000Z'
    })

    expect(plan.messages.map(({ id }) => id)).toEqual(['two', 'three'])
    expect(messages).toEqual(original)
    expect(plan.messages).not.toBe(messages)
  })

  it('rejects invalid or reversed capture time ranges', () => {
    const messages = [message('one', 'incoming', '2026-01-01T00:00:00.000Z', 'demo', '1')]
    const options = { includeIncoming: true, includeOutgoing: true, query: '' }

    expect(createCaptureTrimPlan(messages, {
      ...options,
      fromTimestamp: 'not-a-date'
    })).toEqual({ messages: [], error: 'Start time is not a valid date and time.' })
    expect(createCaptureTrimPlan(messages, {
      ...options,
      fromTimestamp: '2026-01-02T00:00:00.000Z',
      toTimestamp: '2026-01-01T00:00:00.000Z'
    })).toEqual({ messages: [], error: 'Start time must be before or equal to end time.' })
  })
})
