import { createServer, type Server, type Socket } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Aedes } from 'aedes'
import { generate, parser, type Packet } from 'mqtt-packet'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWebSocketStream, WebSocketServer } from 'ws'
import type { ConnectionConfig, MqttMessageRecord, MqttPacketEvent, StatusEvent } from '../shared/contracts'
import { updateMqttPacketFlows } from '../shared/packet-flow'
import { MqttService } from './mqtt-service'

async function waitFor(
  predicate: () => boolean,
  timeoutMilliseconds = 4_000
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for MQTT event.')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function connectionConfig(port: number, clientId: string): ConnectionConfig {
  return {
    name: 'Integration broker',
    protocol: 'mqtt',
    host: '127.0.0.1',
    port,
    path: 'mqtt',
    clientId,
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
}

describe('MqttService integration', () => {
  let broker: Aedes
  let server: Server
  let port: number

  beforeAll(async () => {
    broker = await Aedes.createBroker()
    server = createServer(broker.handle)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await new Promise<void>((resolve) => broker.close(resolve))
  })

  it('connects, subscribes, publishes, and receives a TCP message', async () => {
    const statuses: StatusEvent[] = []
    const messages: MqttMessageRecord[] = []
    const packets: MqttPacketEvent[] = []
    const service = new MqttService(
      (status) => statuses.push(status),
      (message) => messages.push(message),
      (packet) => packets.push(packet)
    )

    await service.connect(connectionConfig(port, 'mqttape_test'))
    await service.subscribe({ topic: 'mqttape/integration', qos: 1 })
    await service.publish({
      topic: 'mqttape/integration',
      payload: '{"working":true}',
      qos: 1,
      retain: false
    })

    await waitFor(() => messages.some((message) => message.direction === 'incoming'))
    await waitFor(() => packets.filter(({ command }) => command === 'puback').length >= 2)

    expect(statuses.some((status) => status.state === 'connected')).toBe(true)
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: 'outgoing',
        topic: 'mqttape/integration',
        payloadText: '{"working":true}',
        qos: 1
      }),
      expect.objectContaining({
        direction: 'incoming',
        topic: 'mqttape/integration',
        payloadText: '{"working":true}',
        qos: 1
      })
    ]))
    expect(packets).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: 'sent', command: 'publish', qos: 1, topic: 'mqttape/integration' }),
      expect.objectContaining({ direction: 'received', command: 'puback' }),
      expect.objectContaining({ direction: 'received', command: 'publish', qos: 1, topic: 'mqttape/integration' }),
      expect.objectContaining({ direction: 'sent', command: 'puback' })
    ]))

    const binaryPayload = 'AEH/IH4K'
    await service.publish({
      topic: 'mqttape/integration',
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

    await service.disconnect()
  })

  it('settles a pending connection promptly when the session is disconnected', async () => {
    let accepted = false
    let stalledSocket: Socket | undefined
    const stalledServer = createServer((socket) => {
      accepted = true
      stalledSocket = socket
    })
    await new Promise<void>((resolve, reject) => {
      stalledServer.once('error', reject)
      stalledServer.listen(0, '127.0.0.1', resolve)
    })
    const stalledPort = (stalledServer.address() as AddressInfo).port
    const service = new MqttService(() => undefined, () => undefined)

    try {
      const connecting = service.connect(connectionConfig(stalledPort, 'mqttape_pending'))
      const rejected = expect(connecting).rejects.toThrow(
        'The MQTT session was closed before the connection started.'
      )
      await waitFor(() => accepted)
      await service.disconnect()
      await rejected
    } finally {
      await service.disconnect()
      stalledSocket?.destroy()
      await new Promise<void>((resolve) => stalledServer.close(() => resolve()))
    }
  })

  it('times out missing broker acknowledgements and lets disconnect cancel pending work', async () => {
    const sockets = new Set<Socket>()
    const receivedCommands: string[] = []
    const silentServer = createServer((socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      const packetParser = parser({ protocolVersion: 4 })
      socket.on('data', (data) => packetParser.parse(
        typeof data === 'string' ? Buffer.from(data) : data
      ))
      packetParser.on('packet', (packet: Packet) => {
        receivedCommands.push(packet.cmd)
        if (packet.cmd === 'connect') {
          socket.write(generate({
            cmd: 'connack',
            returnCode: 0,
            sessionPresent: false
          }, { protocolVersion: 4 }))
        } else if (packet.cmd === 'pingreq') {
          socket.write(generate({ cmd: 'pingresp' }, { protocolVersion: 4 }))
        }
        // SUBACK, UNSUBACK, and PUBACK are deliberately withheld.
      })
    })
    await new Promise<void>((resolve, reject) => {
      silentServer.once('error', reject)
      silentServer.listen(0, '127.0.0.1', resolve)
    })
    const silentPort = (silentServer.address() as AddressInfo).port
    const statuses: StatusEvent[] = []
    const messages: MqttMessageRecord[] = []
    const service = new MqttService(
      (status) => statuses.push(status),
      (message) => messages.push(message),
      () => undefined,
      100
    )

    try {
      await service.connect(connectionConfig(silentPort, 'mqttape_cancel_ack'))
      const subscribing = service.subscribe({ topic: 'mqttape/no-suback', qos: 1 })
      await waitFor(() => receivedCommands.includes('subscribe'))
      const disconnecting = service.disconnect()
      await expect(subscribing).rejects.toThrow(
        'The MQTT operation was cancelled because the session disconnected.'
      )
      await disconnecting

      await service.connect(connectionConfig(silentPort, 'mqttape_timeout_ack'))
      await expect(service.publish({
        topic: 'mqttape/no-puback',
        payload: 'pending',
        qos: 1,
        retain: false
      })).rejects.toThrow('Timed out waiting for the broker to acknowledge the MQTT publish.')

      expect(statuses.at(-1)).toEqual({
        state: 'error',
        detail: 'Timed out waiting for the broker to acknowledge the MQTT publish.'
      })
      expect(messages).toEqual([])
    } finally {
      await service.disconnect()
      sockets.forEach((socket) => socket.destroy())
      await new Promise<void>((resolve) => silentServer.close(() => resolve()))
    }
  })

  it('delivers and clears retained QoS 2 messages, then honors unsubscribe', async () => {
    const publisherPackets: MqttPacketEvent[] = []
    const publisher = new MqttService(
      () => undefined,
      () => undefined,
      (packet) => publisherPackets.push(packet)
    )
    const received: MqttMessageRecord[] = []
    const subscriber = new MqttService(() => undefined, (message) => received.push(message))
    const topic = 'mqttape/retained/qos2'

    await publisher.connect(connectionConfig(port, 'mqttape_publisher'))
    await publisher.publish({ topic, payload: 'retained-value', qos: 2, retain: true })
    const qos2Flow = publisherPackets
      .reduce(updateMqttPacketFlows, [])
      .find((flow) => flow.topic === topic && flow.qos === 2)
    expect(qos2Flow).toEqual(expect.objectContaining({
      messageDirection: 'outgoing',
      state: 'completed'
    }))
    expect(qos2Flow?.steps.map(({ direction, command }) => `${direction}:${command}`)).toEqual([
      'sent:publish',
      'received:pubrec',
      'sent:pubrel',
      'received:pubcomp'
    ])
    await publisher.disconnect()

    await subscriber.connect(connectionConfig(port, 'mqttape_subscriber'))
    await subscriber.subscribe({ topic, qos: 2 })
    await waitFor(() => received.some((message) => message.payloadText === 'retained-value'))

    expect(received).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic, qos: 2, retain: true, payloadText: 'retained-value' })
    ]))

    await subscriber.unsubscribe(topic)
    const receivedBeforePublish = received.length
    await publisher.connect(connectionConfig(port, 'mqttape_publisher_again'))
    await publisher.publish({ topic, payload: 'after-unsubscribe', qos: 1, retain: false })
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(received).toHaveLength(receivedBeforePublish)

    await publisher.publish({ topic, payload: '', qos: 1, retain: true })
    const afterClear: MqttMessageRecord[] = []
    const verifier = new MqttService(() => undefined, (message) => afterClear.push(message))
    await verifier.connect(connectionConfig(port, 'mqttape_retained_verifier'))
    await verifier.subscribe({ topic, qos: 1 })
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(afterClear).toEqual([])

    await verifier.disconnect()
    await publisher.disconnect()
    await subscriber.disconnect()
  })

  it('blocks MQTT 5 publish properties on an MQTT 3.1.1 connection', async () => {
    const service = new MqttService(() => undefined, () => undefined)
    await service.connect(connectionConfig(port, 'mqttape_property_guard'))

    await expect(service.publish({
      topic: 'mqttape/properties',
      payload: 'blocked',
      qos: 0,
      retain: false,
      properties: { contentType: 'text/plain' }
    })).rejects.toThrow('MQTT 5 publish properties require an MQTT 5 connection.')

    await service.disconnect()
  })

  it('sends desktop WebSocket auth headers and encoded query parameters', async () => {
    const webSocketBroker = await Aedes.createBroker()
    const httpServer = createHttpServer()
    const webSocketServer = new WebSocketServer({ server: httpServer, path: '/mqtt' })
    let authorization = ''
    let tenant = ''
    let requestUrl = ''
    webSocketServer.on('connection', (socket, request) => {
      authorization = request.headers.authorization ?? ''
      tenant = typeof request.headers['x-tenant-id'] === 'string'
        ? request.headers['x-tenant-id']
        : ''
      requestUrl = request.url ?? ''
      webSocketBroker.handle(createWebSocketStream(socket), request)
    })
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(0, '127.0.0.1', resolve)
    })
    const webSocketPort = (httpServer.address() as AddressInfo).port
    const service = new MqttService(() => undefined, () => undefined)

    try {
      await service.connect({
        ...connectionConfig(webSocketPort, 'mqttape_websocket_auth'),
        protocol: 'ws',
        websocketAuth: { mode: 'bearer', username: '', secret: 'bearer-secret' },
        websocketHeaders: [{ name: 'X-Tenant-ID', value: 'taipei' }],
        websocketQueryParameters: [{ name: 'access_token', value: 'query secret' }]
      })

      expect(authorization).toBe('Bearer bearer-secret')
      expect(tenant).toBe('taipei')
      expect(requestUrl).toBe('/mqtt?access_token=query+secret')
    } finally {
      await service.disconnect()
      await new Promise<void>((resolve) => webSocketServer.close(() => resolve()))
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      await new Promise<void>((resolve) => webSocketBroker.close(resolve))
    }
  })
})
