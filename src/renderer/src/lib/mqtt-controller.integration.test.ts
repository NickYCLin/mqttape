import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Aedes } from 'aedes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWebSocketStream, WebSocketServer } from 'ws'
import mqtt from 'mqtt'
import type { ConnectionConfig, MqttMessageRecord, MqttPacketEvent, StatusEvent } from '../../../shared/contracts'
import { MqttController } from './mqtt-controller'
import { defaultMqttLastWill } from '../../../shared/mqtt-will'

async function waitFor(predicate: () => boolean, timeoutMilliseconds = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for WebSocket MQTT event.')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('MqttController Web Lite integration', () => {
  let broker: Aedes
  let server: Server
  let webSocketServer: WebSocketServer
  let port: number
  let latestRequestUrl = ''
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

  beforeAll(async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: globalThis
    })
    broker = await Aedes.createBroker()
    server = createServer()
    webSocketServer = new WebSocketServer({ server, path: '/mqtt' })
    webSocketServer.on('connection', (socket, request) => {
      latestRequestUrl = request.url ?? ''
      broker.handle(createWebSocketStream(socket), request)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => webSocketServer.close(() => resolve()))
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await new Promise<void>((resolve) => broker.close(resolve))
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  })

  it('connects, subscribes, and preserves text and binary payloads over WebSocket', async () => {
    const statuses: StatusEvent[] = []
    const messages: MqttMessageRecord[] = []
    const packets: MqttPacketEvent[] = []
    const controller = new MqttController()
    const removeStatus = controller.onStatus((status) => statuses.push(status))
    const removeMessage = controller.onMessage((message) => messages.push(message))
    const removePacket = controller.onPacket((packet) => packets.push(packet))
    const config: ConnectionConfig = {
      name: 'WebSocket broker',
      protocol: 'ws',
      host: '127.0.0.1',
      port,
      path: 'mqtt',
      clientId: 'mqttape_web_test',
      username: '',
      password: '',
      mqttVersion: 4,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 0,
      rejectUnauthorized: true,
      caPath: '',
      clientCertificatePath: '',
      clientKeyPath: '',
      clientKeyPassphrase: '',
      websocketQueryParameters: [{ name: 'access_token', value: 'web secret' }]
    }

    await controller.connect(config)
    await expect(controller.publish({
      topic: 'mqttape/websocket',
      payload: 'blocked',
      qos: 0,
      retain: false,
      properties: { contentType: 'text/plain' }
    })).rejects.toThrow('MQTT 5 publish properties require an MQTT 5 connection.')
    await controller.subscribe({ topic: 'mqttape/websocket', qos: 1 })
    await controller.publish({
      topic: 'mqttape/websocket',
      payload: '{"transport":"websocket"}',
      qos: 1,
      retain: false
    })
    await waitFor(() => messages.some((message) => message.direction === 'incoming'))

    expect(statuses.some((status) => status.state === 'connected')).toBe(true)
    expect(latestRequestUrl).toBe('/mqtt?access_token=web+secret')
    expect(statuses.find((status) => status.state === 'connected')?.detail)
      .not.toContain('access_token')
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: 'outgoing', topic: 'mqttape/websocket' }),
      expect.objectContaining({
        direction: 'incoming',
        topic: 'mqttape/websocket',
        payloadText: '{"transport":"websocket"}'
      })
    ]))
    expect(packets).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: 'sent', command: 'publish', qos: 1, topic: 'mqttape/websocket' }),
      expect.objectContaining({ direction: 'received', command: 'puback' }),
      expect.objectContaining({ direction: 'received', command: 'publish', qos: 1, topic: 'mqttape/websocket' }),
      expect.objectContaining({ direction: 'sent', command: 'puback' })
    ]))

    const binaryPayload = 'AEH/IH4K'
    await controller.publish({
      topic: 'mqttape/websocket',
      payload: '',
      payloadBase64: binaryPayload,
      qos: 1,
      retain: false
    })
    await waitFor(() => messages.some((message) =>
      message.direction === 'incoming' && message.payloadBase64 === binaryPayload
    ))
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: 'outgoing',
        payloadBase64: binaryPayload,
        size: 6
      }),
      expect.objectContaining({
        direction: 'incoming',
        payloadBase64: binaryPayload,
        size: 6
      })
    ]))

    await controller.disconnect()
    removeStatus()
    removeMessage()
    removePacket()
    controller.destroy()
  })

  it('keeps simultaneous Broker sessions and their messages isolated', async () => {
    const messagesA: MqttMessageRecord[] = []
    const messagesB: MqttMessageRecord[] = []
    const controllerA = new MqttController('session_a')
    const controllerB = new MqttController('session_b')
    const removeMessageA = controllerA.onMessage((message) => messagesA.push(message))
    const removeMessageB = controllerB.onMessage((message) => messagesB.push(message))
    const commonConfig: ConnectionConfig = {
      name: 'Parallel WebSocket broker',
      protocol: 'ws',
      host: '127.0.0.1',
      port,
      path: 'mqtt',
      clientId: 'mqttape_parallel_base',
      username: '',
      password: '',
      mqttVersion: 4,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 0,
      rejectUnauthorized: true,
      caPath: '',
      clientCertificatePath: '',
      clientKeyPath: '',
      clientKeyPassphrase: ''
    }

    try {
      await Promise.all([
        controllerA.connect({ ...commonConfig, clientId: 'mqttape_parallel_a' }),
        controllerB.connect({ ...commonConfig, clientId: 'mqttape_parallel_b' })
      ])
      await Promise.all([
        controllerA.subscribe({ topic: 'mqttape/parallel/a', qos: 1 }),
        controllerB.subscribe({ topic: 'mqttape/parallel/b', qos: 1 })
      ])

      const publisher = mqtt.connect(`ws://127.0.0.1:${port}/mqtt`, {
        protocolVersion: 4,
        reconnectPeriod: 0
      })
      await new Promise<void>((resolve, reject) => {
        publisher.once('connect', () => resolve())
        publisher.once('error', reject)
      })
      await Promise.all([
        new Promise<void>((resolve, reject) => publisher.publish(
          'mqttape/parallel/a',
          'only-a',
          { qos: 1 },
          (error) => error ? reject(error) : resolve()
        )),
        new Promise<void>((resolve, reject) => publisher.publish(
          'mqttape/parallel/b',
          'only-b',
          { qos: 1 },
          (error) => error ? reject(error) : resolve()
        ))
      ])
      await waitFor(() => messagesA.length === 1 && messagesB.length === 1)

      expect(messagesA).toEqual([
        expect.objectContaining({ topic: 'mqttape/parallel/a', payloadText: 'only-a' })
      ])
      expect(messagesB).toEqual([
        expect.objectContaining({ topic: 'mqttape/parallel/b', payloadText: 'only-b' })
      ])

      await new Promise<void>((resolve, reject) => publisher.end(false, {}, (error) => {
        if (error) reject(error)
        else resolve()
      }))
    } finally {
      await Promise.all([controllerA.disconnect(), controllerB.disconnect()])
      removeMessageA()
      removeMessageB()
      controllerA.destroy()
      controllerB.destroy()
    }
  })

  it('does not create a hidden connection after a Web Lite workspace is destroyed', async () => {
    const statuses: StatusEvent[] = []
    const controller = new MqttController('closed_during_connect')
    const removeStatus = controller.onStatus((status) => statuses.push(status))
    const config: ConnectionConfig = {
      name: 'Closing WebSocket broker',
      protocol: 'ws',
      host: '127.0.0.1',
      port,
      path: 'mqtt',
      clientId: 'mqttape_closed_during_connect',
      username: '',
      password: '',
      mqttVersion: 4,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 0,
      rejectUnauthorized: true,
      caPath: '',
      clientCertificatePath: '',
      clientKeyPath: '',
      clientKeyPassphrase: ''
    }

    const connecting = controller.connect(config)
    controller.destroy(true)

    await expect(connecting).rejects.toThrow(
      'The MQTT session was closed before the connection started.'
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(statuses.some(({ state }) => state === 'connected')).toBe(false)
    expect(broker.connectedClients).toBe(0)
    removeStatus()
  })

  it('publishes Last Will only after an ungraceful Web Lite disconnect', async () => {
    const observer = mqtt.connect(`ws://127.0.0.1:${port}/mqtt`, {
      protocolVersion: 4,
      reconnectPeriod: 0
    })
    const received: string[] = []
    observer.on('message', (_topic, payload) => received.push(payload.toString()))
    await new Promise<void>((resolve, reject) => {
      observer.once('connect', () => resolve())
      observer.once('error', reject)
    })
    await new Promise<void>((resolve, reject) => {
      observer.subscribe('mqttape/will/#', (error) => error ? reject(error) : resolve())
    })

    const baseConfig: ConnectionConfig = {
      name: 'Will test',
      protocol: 'ws',
      host: '127.0.0.1',
      port,
      path: 'mqtt',
      clientId: 'mqttape_will_test',
      username: '',
      password: '',
      mqttVersion: 4,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 0,
      rejectUnauthorized: true,
      caPath: '',
      clientCertificatePath: '',
      clientKeyPath: '',
      clientKeyPassphrase: '',
      will: {
        ...defaultMqttLastWill(),
        enabled: true,
        topic: 'mqttape/will/client',
        payload: '{"online":false}',
        qos: 1,
        retain: false
      }
    }

    const graceful = new MqttController()
    await graceful.connect({ ...baseConfig, clientId: 'mqttape_will_graceful' })
    await graceful.disconnect()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(received).toEqual([])
    graceful.destroy()

    const ungraceful = new MqttController()
    await ungraceful.connect({ ...baseConfig, clientId: 'mqttape_will_ungraceful' })
    ungraceful.destroy(true)
    await waitFor(() => received.includes('{"online":false}'))

    await new Promise<void>((resolve, reject) => observer.end(false, {}, (error) => {
      if (error) reject(error)
      else resolve()
    }))
  })
})
