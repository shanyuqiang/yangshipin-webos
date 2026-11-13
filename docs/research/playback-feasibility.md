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
Isolated diagnostic application installed. Actual TV user agent reports Chrome/68.0.3440.106 and Web0S (zero). Official page remains on desktop /tv/home. CCTV1 decoded at 1920x1080; sampled currentTime advanced through 16.70, 21.71, 25.74 and later 168.06 seconds. Last sample readyState 4 and no media error. One CDP polling timeout occurred; no continuous smooth-playback claim is made. Remote-navigation injection entered the site successfully. Screenshot independently showed video output. A packaged app can run this official page without a Mac media server.

Next: test a TV-only loopback adapter for remote navigation and upstream requests. Login-domain cookies remain an unresolved constraint. Do not infer decoding from screenshots. If direct site use fails, identify compatibility, origin and authorization separately before selecting a client architecture.

## Sources
- https://www.yangshipin.cn/tv/home
- https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
- https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm

No captured tokens, signed media URLs, account identifiers or private device connection details are retained here.

## TV interface verification

The packaged app now presents its own channel list, CCTV and satellite categories, programme guide and player controls. It keeps the official live player and requests at runtime. Moving focus uses the TV control positions, with no search through the desktop page on each keypress. The account flow still uses the official login UI.

On the LG CX, the new UI reached CCTV1 live playback at 1920×1080. A network remote Down input moved focus to CCTV2 while CCTV1 remained selected. Confirm changed the selected channel, and a later sample showed CCTV2 video advancing at 1920×1080. One cold start stayed at zero while the official player loaded before producing frames. Remote focus responsiveness and upstream startup are separate checks.

The guide renders the available daily schedule and allows browsing dates. Earlier programmes on the observed official TV page were schedule entries without a working replay action. Live rewind and replay remain unverified. Actual SMS login, account persistence and WeChat login remain open.
