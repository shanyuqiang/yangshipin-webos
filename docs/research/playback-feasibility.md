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

## Live upstream browser checks at a3dce1d

These checks used the packaged app's loopback proxy and the live official site in desktop Chrome. They supplement the fixtures and do not establish webOS results.

| Flow | Observed result |
| --- | --- |
| CCTV1 quality change | The menu marked 1080p as selected. Selecting 720p produced decoded video with width 1280, readyState 4 and a moving clock. |
| Satellite and fullscreen | The satellite list contained 24 entries. Hunan TV played at width 1920 and readyState 4. Fullscreen opened, and Back exited fullscreen with focus restored to the fullscreen button. |
| Account navigation | The official SMS form opened using the account entry and Enter. Back closed the form, and a second Back restored focus to the TV account button. No phone number or SMS code was submitted. |
| Rights | The channel list identified CCTV Fengyun Theatre as a member channel. The official player kept its message that higher quality required membership and was playing in super HD. |
| Official historical schedule | The first past date showed 35 entries. The first entry had no link or button and clicking it initiated no observed live or recorded playback request. A media seekable range alone does not establish a user-facing timeshift feature. |

LG checks still needed on this exact build: exit and relaunch, a sustained CCTV and satellite sample, fullscreen/Back, resolution change, network-failure recovery, and user-assisted sign-in and session retention across relaunch and upgrade. An HDMI source remained foreground during these desktop checks.

## Installed build and on-device service recovery at a2a1729

The package installed in the background while HDMI 3 remained foreground. The installed bootstrap and TV UI file hashes matched their packaged files. The installed service JavaScript passed syntax checks under the TV's Node 8.12.0.

An isolated instance of the installed loopback server was started on the TV with an ephemeral port. An injected upstream request failure produced HTTP 502 with the retry control. The next request used the real upstream transport and returned HTTP 200 with the player compatibility script and TV UI. The temporary server exited. This verifies service recovery on the device without changing its network or foreground input. Pressing retry in the actual app, and playback after that retry, still need foreground verification.

## Foreground LG validation at a2a1729

- Switched from HDMI 3 to the installed app after the user authorized the input change. Confirmed the app was foreground and reached the TV UI.
- CCTV1 decoded at 1920×1080. Fullscreen entered, and webOS Back exited fullscreen and restored the fullscreen button's focus. Selecting 720p produced width 1280, readyState 4 and a visible CCTV1 picture.
- Hunan TV decoded at 1920×1080. An in-page sample over 50.9 seconds recorded 1,185 additional decoded frames, 22 dropped frames, and no video error. The playback clock advanced 62.2 seconds, so this sample does not establish even cadence. External inspector polling timed out on earlier CCTV and satellite runs.
- Opened the official SMS form on the TV. Account authentication and persistence require a user login.

The completed Hunan TV in-page sample contained 13 observations across 60.1 seconds: the video clock advanced 67.8 seconds, 1,364 frames decoded, 55 frames dropped and one sampling interval showed no clock advance. No video error was reported. Subsequent observations at playback clocks 217.7 and 231.5 seconds also showed advancing decoded frames. This confirms continued decoding and identifies an interruption in cadence.

From the actual TV app origin, a read-only Luna loadSession call returned success and a valid generation with no saved cookies. The official SMS dialog remained open. This verifies the on-device app-to-service read path for an empty session. A signed-in account and its persistence remain unverified.

## Standalone document experiment

The local `/standalone` route serves its own HTML. The browser loads the published player SDKs and imports only the player and rendering modules from the pinned vendor asset. It does not fetch the official HTML or execute the official app entry. Channel catalogue, server time and programmes are read from their individual endpoints. The two catalogue groups contained 40 CCTV and 24 satellite entries.

On the LG, the standalone route decoded CCTV1 at 1920×1080 and then switched to Hunan TV at the same resolution. Hunan TV showed 34 guide entries and a single video element. The observed page contained none of the official header, channel panel or guide DOM. These samples establish initial decode and switching. The normal launch route still uses the previous build path pending standalone startup, recovery and account-entry integration. Real login testing is deferred at the user's request.

The normal restore flow now leads to the standalone document. A live desktop smoke test through /restore reached the standalone UI, switched to Hunan TV, played at width 1920 and returned from fullscreen. Resource timing showed no official app entry, and the DOM showed no desktop header, channel panel or guide. The SDK account dialog can be opened and closed from the standalone UI in desktop Chrome without sending SMS. The updated package installed on the LG. Final foreground launch on this build remains to be observed after exiting the TV's Bluetooth settings.

After the TV returned to its input screen, a normal LG app launch entered the foreground standalone UI. CCTV1 decoded at 1920 pixels wide, reached readyState 4, and advanced from 121 to 251 decoded frames. The guide contained 37 rows. No desktop navigation, channel panel or guide was present, and resource timing showed no official app entry script. A network remote Down press moved focus to CCTV2 while CCTV1 continued playing.

## Standalone recovery and channel isolation

On the LG, the catalogue request was blocked in the app debugger and the app reloaded. Re-inspection showed the standalone failure screen with focus on Retry. After the debugging connection closed, an SSAP Enter press recovered the standalone UI and CCTV1 decoded at 1080p. The TV network configuration was unchanged. An in-page CCTV1 sample after recovery registered 42 observations spanning 151.8 seconds, 149.7 seconds of clock progress, 3,557 additional decoded frames, 103 dropped frames, three intervals without clock advancement, and no media error.

The pinned SDK's old playback-address response can update the same player instance after switching. The client now remounts the player by channel, cleans up the old HLS instance and its timer, and discards decoder initialization callbacks from an old channel or a superseded decoder. In a desktop test using live endpoints, a delayed CCTV1 response was released after CCTV2 had started. The old instance remained destroyed, only one video element was present, and CCTV2's clock continued advancing. Decoder callback ordering has dedicated unit regressions.

## Foreground comparison after the OLED update

CCTV1 on the same LG and installed build showed distinct symptoms at both resolutions. At 1080p, a 68-second sample recorded 1,604 decoded and 115 dropped frames. Buffer ahead fell to 0.24 seconds in one observation, while another interval showed no clock advance with 12.64 seconds buffered. At 720p, a 33-second sample recorded 691 decoded and one dropped frame, but the clock advanced only 19.6 seconds and one approximately five-second sample interval showed no advance despite 4.53 seconds buffered. The page reported foreground visibility throughout both observations. The irregular samples and different live programme moments prevent a controlled causal conclusion. The default remains unchanged.

The playback monitor now reports buffer depth at observed stalls and rejects samples taken in a background page. Buffer depth and clock measurements indicate where to investigate, without proving a network or decoder root cause by themselves.

A foreground CCTV1 pause was traced to the pinned official player's `onPvTotal → playVideo` readiness handler, which synchronously calls `pause()` on every video before playing its own video. The standalone adapter now bypasses that synchronous pause only for its already-playing video. It restores the original method immediately and retains the SDK's remaining readiness behavior, including independent pause and playback restriction paths. Desktop live playback and fullscreen smoke checks passed after the fix.

The installed 1080p CCTV1 player was observed for 77 seconds with HLS fragment events and media samples. Fifteen fragment loads and fifteen buffer completions were observed, with no HLS error events. Several clock samples repeated while readyState was 4 and approximately 13–17 seconds of media remained buffered. Media clock advanced 80.5 seconds overall. Irregular debugger-independent page timer intervals prevent treating these repeated samples as an exact display freeze duration. The samples do exclude an empty buffer for those observations. A sustained media waiting event now displays a TV-side buffering message without changing focus and clears on recovery or channel change.

Fullscreen CCTV1 observation still included waiting events. In the first 30.1 seconds, the media clock advanced 30.6 seconds, 628 additional frames decoded and none dropped. This does not establish that fullscreen removes every stall. During the same session, the player retained old media by default (backBufferLength Infinity). A temporary 24-second retention target caused active eviction: at media time 85.23, the first buffered range began at 56.91, with the current time still inside it. During the following 29-second sample, the media clock advanced and no flat samples or HLS errors were recorded. The app now applies the same retention target before creating its live player. This reduces retention of already played media; the samples do not establish causation or a stable playback improvement.

The installed 24-second retention build was observed on CCTV1 at 1080p for 125.6 seconds. The playback clock advanced 122.8 seconds, with 2,966 additional decoded frames and 203 dropped frames. There were 15 waiting events, three stalled events, and no media error or background sample. At waiting events the measured buffer ahead ranged from 5.8 to 15.0 seconds. The longest observed interval without clock advancement was 3.6 seconds, with 21 irregular sampling gaps above 1.5 seconds across the run. This verifies sustained decoding but fails smoothness validation. An empty buffer is not supported as the explanation for these events.

Pressing Confirm on a programme entry now explains that the guide is for browsing and that replay or timeshift is currently unavailable. The key preserves focus and does not request another stream.

CCTV1 at 720p fullscreen on the LG (build b176389) advanced 130.0 seconds over the 125.0-second sample, with 3,189 additional decoded frames and four dropped frames. No waiting or media error events were recorded; one stalled event occurred. The longest sampled interval without clock advance was 2.97 seconds; 25 sampling gaps exceeded 1.5 seconds, so this is not an exact display-freeze duration. Minimum observed buffer was 4.36 seconds. The sample had no background intervals or player replacement. This was a separate live window and display mode from the earlier 1080p test, so it supports 720p fullscreen as a viewing option without establishing a causal comparison. The device was left playing in that mode.

The monitor reports dropped-frame count divided by decoded-frame count during the stable window, with a warning at 5%. It reports unverified if counters are missing or go backwards. The warning is distinct from the existing decoding/progression verdict and does not certify smooth playback.

## Remembered quality

A manually selected resolution is saved in the television's private service record. Later channel and startup requests use the selection with upstream automatic adjustment enabled. A manual switch still goes through the official control with its original explicit request. Logout retains the playback preference.

On the LG, selecting 720p stored `shd`. Switching to Hunan TV then requested `shd` with adjustment enabled and decoded at width 1280. After fully closing and relaunching the app, CCTV1 restored the same preference and decoded at width 1280. The first relaunch was backgrounded by the TV UI; after returning it to foreground, the restored request and advancing frames were observed. These checks cover preference restoration, not long-run smoothness or signed-in account retention.

On the remembered-quality build (578b5b4), CCTV1 at 720p fullscreen advanced 124.5 seconds over the 122.5-second sample, with 3,060 decoded frames and none dropped. There was one waiting event (11.8 seconds buffered), two stalled events, and no media errors. Back restored focus to the fullscreen button. The observation confirms long playback and fullscreen navigation on that build, with occasional buffering events still present. The rapid-selection regression independently verifies that confirming the current channel cancels a pending switch before its animation-frame callback can run.

Hunan TV at 720p fullscreen on 578b5b4 advanced 123.8 seconds over the 129.4-second sample, with 3,202 decoded frames and 16 dropped. There was one waiting event with 11.9 seconds buffered, one stalled event, and no media error. Back again restored focus to the fullscreen button. The follow-up TV package includes the rapid-selection fix (4aff440); 86 unit and 30 browser tests passed. The sampling results establish continued playback for both channels at the saved quality, with isolated waiting events; they do not establish stall-free viewing.

## In-session stream retry

The standalone toolbar can retry the active stream without reloading the UI. Retry replaces the player and invalidates old decoder callbacks while retaining the current channel, programme date and remembered quality.

On the LG, a debugger rule blocked only the live-address request, and the SDK reported a playback error. After removing the rule, remote Enter on Retry recreated the player. The app retained CCTV1, its selected date and all 37 guide entries. It kept focus on Retry, held a single video element, and resumed 720p decoding without a media error. The TV network configuration was unchanged. The fault injection and recovery also passed on desktop with the live upstream.

The pinned player resets or replaces its heartbeat identifier during a source or quality change without cancelling the previous interval. The standalone adapter now clears that interval before either setup path and on teardown. A real-upstream desktop test instrumented interval cancellation before mounting and confirmed the old interval was cleared on both 1080p → 720p and 720p → 1080p. On the installed LG build, the adapter attached and the remote switched CCTV1 to 540p and back to its 720p preference. The on-device hook installed after mounting could not observe the captured cancellation function and is not evidence of timer counts. A separate on-device seek probe observed a stalled event without a JavaScript seek or write to the playback clock during that window. Neither check establishes a universal cause of stalls.

## Native playback comparison on LG

On installed build 7e28249, a short CPU profile of steady CCTV1 720p playback showed CMG HLS JavaScript and WebAssembly as the largest identifiable active sample groups. A separate seek probe recorded one stalled event with no JavaScript currentTime write or seeking event. These samples do not identify a specific cause for each pause.

A temporary native HTML video probe used the same already-authorized live HLS source through the allowlisted loopback proxy. The manifest returned 200 and contained no standard EXT-X-KEY tag. The native player reported width 1280 and readyState 4 and its clock reached 11.7 seconds without a media error, but the decoded frame counter remained zero and the TV screenshot showed corrupted video. The native path failed visual acceptance and was not added to the app. Retry Playback restored the official CMG player, a moving frame count and a valid CCTV1 picture. No signed URLs or screenshots were committed.
