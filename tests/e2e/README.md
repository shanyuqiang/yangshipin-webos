# Browser interaction checks

Run `npm ci` then `npm run test:e2e`. The default uses an installed Google Chrome; select a different installed Playwright channel with `PLAYWRIGHT_CHANNEL`. These are development dependencies only.

The fixture provides official-style DOM selectors and a minimal channel click handler. Tests load the production adapter and bootstrap unmodified. Direction/Enter use trusted `page.keyboard` input. webOS Back has no desktop keyboard equivalent, so it uses Chromium's trusted CDP input pipeline with keyCode 461. Fullscreen uses the browser's real API; only window.close is replaced to observe exit without losing the test page.

Each test saves Chromium's raw V8 coverage as `test-results/<test>/browser-v8-coverage.json` and an attachment. This is separate from Node coverage: do not add the percentages or describe it as a merged 80% gate. The fixture does not prove official API availability, television decoding, login, or long-running live playback.
