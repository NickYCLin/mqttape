# MQTTape project guide

> MQTTape is an open-source MQTT 3.1.1 and MQTT 5.0 traffic recorder, packet inspector, topic explorer, payload viewer, and replay tool.

This page is a short map for engineers and coding agents. The user-facing feature list and installation links remain in the [README](../README.md).

## Choose a build

- **Desktop app:** Windows, macOS, and Linux. Use this for MQTT over TCP, TLS, WebSocket, custom CA certificates, mTLS, encrypted connection profiles, and application updates.
- **Web Lite:** Runs in a browser and connects through `ws://` or `wss://`. It does not store secrets and cannot open raw TCP sockets.

MQTTape is an MQTT client and diagnostics tool, not an MQTT broker. It connects to a broker such as Mosquitto, EMQX, or HiveMQ.

## What it handles

- MQTT 3.1.1 and MQTT 5.0 connections, subscriptions, publishing, Last Will, and multi-broker sessions
- Searchable traffic capture, binary-safe export, replay preview, speed control, and Topic prefix remapping
- QoS 0, 1, and 2 packet-flow inspection
- JSON, text, Hex, CBOR, Protobuf, and Sparkplug B payload inspection
- The Things Stack and ChirpStack LoRaWAN MQTT uplink decoding and guided downlink publishing

## Source map

| Area | Main entry points | Responsibility |
| --- | --- | --- |
| Electron main process | `src/main/index.ts`, `src/main/mqtt-service.ts` | Desktop windows, MQTT transports, profiles, updates, and privileged operations |
| Preload boundary | `src/preload/index.ts` | Narrow IPC API exposed to the isolated renderer |
| React interface | `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx` | Shared desktop and Web Lite user interface |
| Browser MQTT client | `src/renderer/src/lib/mqtt-controller.ts` | WebSocket MQTT connections used by Web Lite |
| Protocol and file formats | `src/shared/` | Capture, replay, MQTT properties, packet flows, payload trees, Protobuf, Sparkplug B, CBOR, and LoRaWAN logic |
| Unit and integration tests | `src/**/*.test.ts`, `src/**/*.integration.test.ts` | Protocol rules, storage, security boundaries, and MQTT behavior |
| End-to-end tests | `tests/e2e/desktop.spec.ts`, `tests/e2e/web-lite.spec.ts` | Electron bridge and browser workflow smoke tests |
| Build and release | `electron.vite.config.ts`, `vite.web.config.ts`, `.github/workflows/` | Desktop packages, Web Lite, CI, GitHub Pages, and releases |

## Local development

```bash
npm install
npm run dev
```

Use `npm run dev:web` for Web Lite. A temporary local WebSocket broker is available through `npm run broker:dev`.

Run the same core checks used by CI:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run build:web
npm run test:e2e:ci
```

The end-to-end command expects its browser and build artifacts to exist. See the [README development section](../README.md#開發) for the complete local workflow.

## Data and security boundaries

- Capture exports never include broker passwords or local TLS file paths.
- Web Lite deliberately drops passwords, token values, certificate paths, and Last Will payloads from saved profiles.
- The Electron renderer has no Node.js integration and reaches privileged operations through the preload API.
- Large or malformed payloads are bounded before structured inspection; raw bytes remain available when decoding fails.

Report vulnerabilities through the process in [SECURITY.md](../SECURITY.md). General contributions follow [CONTRIBUTING.md](../CONTRIBUTING.md).

## Public resources

- [Web Lite](https://nickyclin.github.io/mqttape/)
- [Latest release](https://github.com/NickYCLin/mqttape/releases/latest)
- [Changelog](../CHANGELOG.md)
- [Release automation](RELEASE_AUTOMATION.zh-TW.md)
