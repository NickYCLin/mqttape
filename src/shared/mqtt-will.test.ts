import { describe, expect, it } from 'vitest'
import {
  defaultMqttLastWill,
  encodeMqttWillPayload,
  mqttLastWillError,
  mqttLastWillOptions
} from './mqtt-will'

describe('MQTT Last Will configuration', () => {
  it('keeps Last Will disabled by default', () => {
    expect(mqttLastWillOptions(defaultMqttLastWill(), 5)).toBeUndefined()
  })

  it('encodes text, Hex, and Base64 payloads without loss', () => {
    expect(encodeMqttWillPayload('離線', 'text')).toEqual(new TextEncoder().encode('離線'))
    expect(encodeMqttWillPayload('DE AD:BE_EF', 'hex')).toEqual(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]))
    expect(encodeMqttWillPayload('3q2+7w==', 'base64')).toEqual(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]))
  })

  it('rejects unknown payload formats instead of treating them as Base64', () => {
    expect(() => encodeMqttWillPayload('plain text', 'binary' as never))
      .toThrow('Last Will payload format is invalid.')
  })

  it('creates MQTT 5 Will properties and omits them for MQTT 3.1.1', () => {
    const will = {
      ...defaultMqttLastWill(),
      enabled: true,
      topic: 'devices/gateway/status',
      payload: '{"online":false}',
      qos: 1 as const,
      retain: true,
      willDelayInterval: 10,
      messageExpiryInterval: 300,
      contentType: 'application/json'
    }

    expect(mqttLastWillOptions(will, 5)).toMatchObject({
      topic: 'devices/gateway/status',
      qos: 1,
      retain: true,
      properties: {
        payloadFormatIndicator: true,
        willDelayInterval: 10,
        messageExpiryInterval: 300,
        contentType: 'application/json'
      }
    })
    expect(mqttLastWillOptions(will, 4)?.properties).toBeUndefined()
  })

  it('validates topics, binary input, and MQTT 5 intervals', () => {
    const enabled = { ...defaultMqttLastWill(), enabled: true }
    expect(mqttLastWillError(enabled, 5)).toBe('Last Will topic is required.')
    expect(mqttLastWillError({ ...enabled, topic: 'devices/+', payloadFormat: 'hex', payload: '0' }, 5))
      .toContain('wildcards')
    expect(mqttLastWillError({ ...enabled, topic: 'devices/status', payloadFormat: 'hex', payload: '0' }, 5))
      .toContain('complete byte pairs')
    expect(mqttLastWillError({ ...enabled, topic: 'devices/status', willDelayInterval: -1 }, 5))
      .toContain('whole number')
  })

  it('rejects malformed runtime Last Will fields without throwing during validation', () => {
    expect(mqttLastWillError(null, 5)).toBe('Last Will settings are invalid.')
    expect(mqttLastWillError({ enabled: 'yes' }, 5)).toBe('Last Will settings are invalid.')
    expect(mqttLastWillError({
      ...defaultMqttLastWill(),
      enabled: true,
      topic: 42
    }, 5)).toBe('Last Will settings are invalid.')
    expect(mqttLastWillError({
      ...defaultMqttLastWill(),
      enabled: true,
      topic: 'devices/status',
      payloadFormat: 'binary'
    }, 5)).toBe('Last Will settings are invalid.')
    expect(mqttLastWillError({
      ...defaultMqttLastWill(),
      enabled: true,
      topic: 'devices/status',
      retain: 'yes'
    }, 5)).toBe('Last Will settings are invalid.')
  })
})
