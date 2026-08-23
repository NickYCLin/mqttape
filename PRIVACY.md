# Privacy Policy

Last updated: August 17, 2026

MQTTape is an open-source MQTT client. It does not provide a project-operated
account service, analytics service, telemetry endpoint, or advertising service.
The MQTTape maintainers do not collect application usage data.

## Network communication

MQTTape communicates over the network in these situations:

- When you connect, subscribe, publish, or replay a capture, MQTTape exchanges
  MQTT data with the broker address you configured. That broker is controlled by
  you or its operator and is subject to the operator's privacy practices.
- Installed desktop builds periodically query GitHub Releases for application
  updates and may download an available update in the background. GitHub may
  receive standard connection metadata such as your IP address and user agent;
  see the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- Web Lite is delivered by GitHub Pages and connects only to the WebSocket broker
  you select. GitHub Pages requests are subject to the GitHub Privacy Statement.
- Links to external documentation or downloads are opened only when you choose
  them.

MQTTape does not send broker credentials, capture contents, saved profiles, or
TLS private keys to the maintainers.

## Local data

Desktop profiles are stored in Electron's local user-data directory. Passwords
and private-key passphrases are encrypted through the operating system with
Electron `safeStorage`; MQTTape does not fall back to plaintext secret storage.
Web Lite can store non-secret connection preferences in browser storage but does
not save passwords or certificate paths.

Captures are held locally and are exported only when you request an export.
Exported captures omit passwords, passphrases, and local certificate paths. You
can remove saved profiles and exported capture files from your device at any
time.

MQTTape stores up to 1,000 parsed LoRaWAN downlink status events on the local
device so requests and later acknowledgements can remain associated across app
restarts. This history can include device and application identifiers, topics,
correlation identifiers, timestamps, frame metadata, and platform error text. It
does not include raw MQTT payloads or broker credentials. You can export or clear
the history from the Downlinks view. Uninstalling the desktop application uses
your operating system's normal application removal controls; depending on the
operating system, local application data may need to be removed separately.

## Changes and questions

Material changes to this policy will be published in the source repository. For
questions, open an issue in the
[MQTTape repository](https://github.com/NickYCLin/mqttape/issues).
