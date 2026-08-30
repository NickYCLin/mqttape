# Microsoft Store listing (en-US)

The following text is ready to paste into Partner Center. The headings identify fields and should not be pasted with their Markdown formatting. Enter every Product features and Search keywords line as a separate Partner Center item.

## Product name

MQTTape

## Short description

Open-source MQTT 3.1.1 and 5.0 desktop debugger for capturing, inspecting, decoding, and replaying traffic over TCP, TLS, and WebSocket.

## Description

MQTTape is an open-source, local-first MQTT desktop debugging tool for developers and operators who need to observe broker traffic, inspect packet contents, and safely replay reviewed captures.

Connect to an MQTT 3.1.1 or MQTT 5.0 broker that you choose over TCP, TLS, WebSocket, or Secure WebSocket. Multiple broker sessions remain isolated in separate tabs. The searchable message timeline, topic hierarchy, retained snapshot, and QoS 0, 1, and 2 packet-flow views help you inspect message direction, packet identifiers, reason codes, pending states, and broker responses.

The payload inspector supports text, formatted JSON, hex, CBOR, Protobuf, and Sparkplug B. MQTTape also includes LoRaWAN helpers for The Things Stack and ChirpStack uplinks and downlinks. Versioned capture files can be imported, exported, trimmed, previewed, and replayed locally, including a preview of topics, directions, retained messages, and topic-prefix remapping before publish.

MQTTape requires no MQTTape account and contains no advertising, application analytics, or telemetry. Broker credentials and capture contents are not sent to the MQTTape maintainers. Desktop profiles stay on the local device. Passwords and private-key passphrases are encrypted through the operating system with Electron safeStorage, with no plaintext fallback.

MQTTape does not provide an MQTT broker. Availability, authorization, data handling, and any fees are controlled by the broker and operator you select.

## App features

- MQTT 3.1.1 and MQTT 5.0 over TCP, TLS, WebSocket, and Secure WebSocket.
- Up to eight isolated broker sessions with a searchable message timeline and topic hierarchy.
- QoS 0, 1, and 2 packet flows with packet identifiers, DUP flags, reason codes, and pending states.
- Text, JSON, hex, CBOR, Protobuf, Sparkplug B, and LoRaWAN payload inspection.
- Import, export, trim, preview, and replay versioned MQTT capture files.
- MQTT 5 publish properties, Last Will, retained messages, and topic-prefix remapping.
- Local profiles and operating-system-encrypted secret storage, with no MQTTape account, ads, analytics, or telemetry.

## Search keywords (enter separately)

- MQTT
- MQTT 5
- MQTT broker
- IoT debugging
- packet inspector
- traffic capture
- LoRaWAN

## What's new in this version

First submission: leave this Partner Center field blank.

For a later update, revise the following text to match that release:

> Native Windows x64 and ARM64 packages with Store-managed installation and updates. Features match the corresponding MQTTape desktop release.

## Links and suggested classification

- Privacy policy URL: <https://nickyclin.github.io/mqttape/privacy/>
- Support URL: <https://github.com/NickYCLin/mqttape/issues>
- Website: <https://github.com/NickYCLin/mqttape>
- Category: Developer tools
- License / pricing: MIT open-source software; suggested price is Free
- Minimum OS: Windows 10 version 1809 (build 17763)
- Supported architectures: x64 and ARM64

## Notes for certification (not public listing text)

MQTTape does not require a product account. It starts disconnected; testers need to use an MQTT broker and credentials they are authorized to access when testing connect, subscribe, and publish behavior. MQTTape does not include or proxy a broker, and it does not send broker credentials or message content to the maintainers.

Importing captures, Protobuf schemas, or TLS certificate files and exporting captures or payloads require an explicit user action or file selection. The Microsoft Store build disables the GitHub Releases auto-updater; Microsoft Store manages installation and updates.

## Restricted `runFullTrust` capability explanation (Submission options)

MQTTape is a Win32 desktop application built with Electron and packaged as MSIX. The package requires `runFullTrust` so that its normal medium-integrity Electron desktop process can launch and run. That process provides user-initiated MQTT TCP, TLS, and WebSocket connections; capture and schema import/export; TLS certificate file selection; and local profiles with operating-system-encrypted secret storage.

MQTTape does not request administrator privileges or UAC elevation, install drivers or Windows services, configure itself to start at boot, or scan or access unrelated files without user action. It has no account service, advertising, analytics, or telemetry. Broker credentials and MQTT content are not sent to the MQTTape maintainers. `runFullTrust` is used only to run the existing desktop functionality and not to bypass Windows security controls.
