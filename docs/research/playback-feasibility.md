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

## Current programme refresh

The standalone guide now keeps the start and end times from the upstream response and updates the active programme locally as server-adjusted time advances. It preserves the selected row and does not reload the schedule or player at a programme boundary. Desktop and LG tests advanced only the page clock across a real CCTV1 programme boundary: the label changed from episode 7 to episode 8 and the focused row remained selected. The test clock was restored. The LG was decoding at 720p. This refresh covers the loaded date; it does not fetch a different date automatically when crossing midnight.

## Quality response ordering

A desktop test against the live upstream held a 540p playback-address response, selected 720p and started decoding, then released the older response. The original build reverted to 540p. The corrected build stayed at 720p and continued decoding. Manual choices now replace the player instance with an explicit requested definition, preserving the upstream explicit selection parameter and isolating old responses. The last loaded quality menu for the same channel remains available until its new player has options. On the LG, quickly choosing 540p then 720p selected revision 2, retained focus on the quality control, and decoded at width 1280 with one video element. The delayed-response injection was performed on desktop; the LG test used real requests without injected delay.

## Five-minute foreground smoothness checks

| LG CX playback | Window | Media advance | Decoded frames | Dropped frames | Waiting / stalled events |
| --- | ---: | ---: | ---: | ---: | ---: |
| CCTV1 720p, TV layout, dd82b5c | 302.1 s | 301.2 s | 7,480 | 16 | 1 / 7 |
| Hunan TV 720p, fullscreen, build with the retired desktop route removed | 301.5 s | 301.1 s | 7,481 | 14 | 0 / 3 |

Both observations fail the zero-drop requirement. CCTV1 had 14.36 seconds buffered at its waiting event. Several stalled notifications occurred while playback continued across adjacent samples. Page sampling gaps and Chromium 68's absence of presentation-frame telemetry limit claims about exact visible freeze durations. The test tool distinguishes decoding progress from the stricter smoothness result and rejects an incomplete sampling window as evidence of smoothness.

The same installed build returned 404 for the retired local desktop route. A normal foreground launch reached the standalone interface without an official app entry script or desktop navigation DOM. Remote inputs switched from CCTV1 to Hunan TV and opened fullscreen at 720p.

In desktop Chrome against live endpoints, the stock HLS Worker failed with a missing bundle dependency and fell back to the main thread. A temporary experiment supplied the missing Worker globals and reached a running Worker, but the video reported media decode error 3 and produced no decoded frames. That experiment was discarded. It does not establish the cause of each stall on the TV.

A follow-up 720p fullscreen run on Hunan TV captured main-thread tasks lasting roughly 2.6–4.6 seconds. The CPU profile included the official CMG demux and audio WebAssembly calls, and Vue 2 observation of the HLS instance's nested objects. A temporary prototype tag prevented Vue from observing a replacement HLS instance. The replacement still decoded, and Vue observation disappeared from the largest sampled stacks. Long tasks still reached 3.9 seconds, and six stalled events occurred in 69 seconds. The temporary adjustment was removed. This comparison excludes reactive observation as the sole cause of the long tasks.

At 540p fullscreen on Hunan TV, the original XHR loader produced no dropped frames, but observed seven clock stalls with at least 16.56 seconds buffered. The foreground watch recorded 310.7 seconds after startup grace and failed strict smoothness. The in-page 310.3-second sample advanced 310.5 seconds overall, with 7,728 additional frames, nine stalled events and no waiting event.

Enabling the pinned SDK's progressive mode selected its FetchLoader on the LG and spread fragment processing across streamed response chunks. In the 309.9-second stable Hunan TV 540p comparison, the clock advanced 309.9 seconds and no drops, waits, seeks or clock stalls were observed. Five inspection gaps exceeded 1.5 seconds, so strict acceptance remained unverified. The longest browser long task seen in the comparison was 76 ms. The packaged change enables this mode where the Fetch streaming APIs exist. The package installed on the LG, started in the standalone UI at 540p, and switched to 720p through the TV controls with the FetchLoader active.

The installed progressive build played CCTV1 at 720p fullscreen. In-page observation passed the strict checks over 314.7 seconds after startup grace, with zero drops, waits or seeks and a maximum sample gap of 1.313 seconds. The separate remote inspector run recorded zero drops, waits, seeks or clock stalls but remained unverified because one inspection gap was 1.505 seconds. A blocked live-address request then reproduced a player error. Removing the debugger rule and pressing Retry restored CCTV1 at 720p while retaining its programme guide and focus. The app subsequently switched to Hunan TV at 720p.

After a channel switch on the same installed build, Hunan TV at 720p fullscreen passed the strict in-page checks over 312.7 seconds after startup grace. The clock advanced 312.7 seconds. The full sample included 8,083 additional decoded frames, zero drops, zero waits and zero seeks. The maximum sampling gap was 1.125 seconds, and the longest interval without observed clock advancement was 0.485 seconds. This verifies the two sampled 720p fullscreen windows on this LG. Chrome 68 provides no presentation-frame callback, so screen output was not measured frame by frame.

The packaged progressive build also passed CCTV1 at 1920×1080 fullscreen. The page-timed strict CLI returned exit 0 and `acceptancePassed: true` after 310.0 stable seconds, with zero drops, waits or seeks and no media error. All 1,114 samples had width 1920. A separate page probe covering an overlapping 313.0-second stable window also passed. The strict CLI now samples on the television's clock, and still treats page sampling gaps above 1.5 seconds as unverified.

The strict report now lists the decoded resolutions observed after startup grace. A resolution change makes fixed-resolution acceptance unverified while a confirmed stall or drop still fails the test.

An anonymous desktop recheck of the public TV page showed a 35-item past schedule. Clicking the first past programme made no observed playback-address or player-authorization request. The hovered live player exposed no seek slider or native controls in the inspected UI. These checks describe the tested public page only. They do not establish capabilities available in a signed-in session.

Hunan TV also passed a 600-second fullscreen run on the installed progressive build. After startup grace, all samples stayed at 1920×1080 for 589.8 seconds. The clock advanced 589.8 seconds, with 14,749 additional decoded frames, zero drops, zero waits and zero seeks. The CLI exited 0, and reanalysis with the fixed-resolution check also passed.

## Programme-guide Back and membership prompt on LG

The installed guide update was exercised on CCTV1 with the 11/11 schedule. Confirm on a historical programme showed the replay/timeshift limitation. The webOS Back key event moved focus from the programme to the selected date, then to the fullscreen control. A debugger-injected repeated Back event left focus on the date. The original video element kept decoding and the selected date stayed 11/11. The browser regression also checked that a further Back from the toolbar closes the app.

Switching to CCTV Fengyun Theatre showed the membership badge on the focused channel. The player displayed the official membership message for higher resolution while the stream decoded at width 1280. No account or purchase action was taken.

## Picture-quality persistence on LG

With CCTV1 playing at 720p, the TV's private service returned the saved quality `shd`. After replacing the installed app with the same 0.0.1 package in place and launching it again, the service still returned `shd`, the application restored the preference, and CCTV1 advanced at width 1280 without a new quality selection. Back then closed the application, leaving no page in its debugger. A separate launch again restored `shd` and decoded at width 1280 with readyState 4. This covers an in-place same-version reinstall and a full app exit/relaunch. Signed-in account migration and a version-changing upgrade remain unverified.

The LG also accepted a version-changing in-place installation from 0.0.1 to 0.0.2 using the same app and service IDs. A temporary QA package changed both manifests' versions and used the existing playback build. Installed inventory reported 0.0.2 after the upgrade. The service still returned `shd`, the app restored it into session storage, and CCTV1 reached readyState 4, 208 decoded frames and media time 4.82 seconds at width 1280 without manual selection. This verifies the saved quality across this upgrade. Real signed-in state was outside the run.

## Programme guide across midnight on LG

With the revised package installed, a debugger test moved the application clock across Beijing midnight while CCTV1 was decoding. The guide changed from November 14 to November 15, fetched 35 programme rows and selected the new date. Focus stayed on the previously focused November 14 button. The original player and video element remained active and decoded 150 additional frames during the transition. Selecting November 14 as a historical date and advancing the application clock another day preserved the requested date and video element. The test restored the application clock. Neither the television system clock nor the live source was changed.

The tracked app and service manifests now match the installed 0.0.2 QA package. Both source directories were compared byte for byte against its packaging inputs. SHA-256 digests for the installed app's served standalone and TV shell scripts matched those extracted from the IPK. The app remained at 720p and the retired desktop route returned 404. The packaged files are minified by the webOS packager.
