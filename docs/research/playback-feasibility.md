# Playback feasibility — 2026-11-14

Status: investigation, not a playable-client release.

## Confirmed
- Official desktop page CCTV1 plays (video readyState 4, currentTime advancing).
- Official page loads cctvh5-openapi, hls.cmg.js and cmg.worker.js, including WebAssembly resources.
- Playback calls player/auth then get_live_info with dynamically generated authorization. No static stream URL is suitable as the app implementation.
- Official page has CSP frame-ancestors self. Cross-origin iframe embedding is not an option.
- File-origin desktop SDK experiment returns a signature field, but a token request fails. A signature alone is not proof of authenticated playback.
- TV service runtime queried through configured development connection: Node 8.12.0.

## Next acceptance gate
Install an isolated diagnostic application and observe actual TV navigation, browser errors and video time. Do not infer decoding from screenshots. If direct site use fails, identify compatibility, origin and authorization separately before selecting a client architecture.

## Sources
- https://www.yangshipin.cn/tv/home
- https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
- https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm

No captured tokens, signed media URLs, account identifiers or private device connection details are retained here.
