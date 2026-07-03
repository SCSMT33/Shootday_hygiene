# Shootday Hygiene — Overdue Next Human Action Alert (Chrome Extension)

Watches an Airtable grid view in an open browser tab and posts a Slack alert
for any active record whose `Next Human Action Date` is more than an hour in
the past. No Airtable API access required (uses the page you already have
open), no server, no GitHub Actions — just a Chrome extension.

**This only works while Chrome is running and the target Airtable view is
open in a tab.** It doesn't need to be the focused/foreground tab, but the
tab must stay loaded (don't close it).

## How it works

- `content.js` runs on the Airtable page. When asked, it auto-scrolls the
  grid from top to bottom to force every row to render (Airtable virtualizes
  the grid — only visible rows exist in the DOM), reading `Name`,
  `Next Human Action Date`, `SDR Owner`, and `Sales status` from each row by
  matching column headers, so it's not dependent on column order.
- `background.js` is the extension's service worker. Every 30 minutes
  (`chrome.alarms`), it finds the monitored tab, asks the content script to
  scrape, filters for records overdue by more than 60 minutes (excluding
  `Closed` and `Disqualified`), and posts a summary to your Slack Incoming
  Webhook. It re-posts the full current overdue list every cycle, so
  anything unresolved keeps nagging until it's cleared.
- `options.html` stores the Airtable view URL to watch and your Slack
  webhook URL.
- `popup.html` has a "Run check now" button for manual testing.

## Setup

1. **Get a Slack Incoming Webhook URL**: in Slack, go to
   `Apps → Incoming Webhooks → Add to Slack`, pick the channel (or your own
   DM), and copy the generated webhook URL.
2. **Load the extension**:
   - Open `chrome://extensions`.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked**, select the `extension/` folder in this repo.
3. **Configure it**: click the extension icon → **Settings**, paste in:
   - The exact URL of the "Chase SDR View" (copy straight from the address
     bar while that view is open).
   - Your Slack webhook URL.
4. **Open the view**: navigate to that same view URL in a tab and leave it
   open. The extension checks it every 30 minutes automatically.
5. **Test it**: click the extension icon → **Run check now** to trigger a
   check immediately and confirm Slack receives a message (or "nothing
   overdue" if none currently qualify).

## Tuning

- Overdue leeway (default 60 min) and excluded statuses: top of
  `background.js`.
- Check interval (default 30 min): `ALARM_PERIOD_MINUTES` in
  `background.js`.
- If Airtable changes their page layout and scraping breaks, the DOM
  selectors to fix are isolated at the top of `content.js`.

## Known limitations

- Requires Chrome to stay running with the view tab loaded — fully closing
  Chrome stops the checks.
- DOM scraping is inherently fragile to Airtable UI changes; if alerts stop
  firing, first check the extension's service worker console
  (`chrome://extensions` → "service worker" link) for scrape errors.
- No business-hours filtering yet — alerts can fire at any time of day.
