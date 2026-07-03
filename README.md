# Shootday Hygiene — Overdue Next Human Action Alert

Checks the Airtable Bookings table every 30 minutes and posts a Slack alert
for any active record whose `Next Human Action Date` is more than an hour in
the past. Runs entirely on GitHub Actions — no server, no browser extension.

## How it works

`scripts/check_overdue.py`:
1. Fetches all records from the Bookings table via the Airtable API.
2. Skips records with `Sales status` of `Closed` or `Disqualified`.
3. Flags records where `Next Human Action Date` is more than
   `OVERDUE_LEEWAY_MINUTES` (default 60) in the past.
4. Posts one Slack message listing all currently-overdue records, with a
   link back to each Airtable record.
5. Posts nothing if there's nothing overdue.

`.github/workflows/overdue-check.yml` runs this on a `*/30 * * * *` cron
schedule (every 30 minutes, all day — business-hours filtering isn't
implemented yet) and can also be triggered manually from the Actions tab.

## Setup

Add these as GitHub repo secrets (Settings → Secrets and variables → Actions):

- `AIRTABLE_API_KEY` — Airtable Personal Access Token with read access to the base
- `AIRTABLE_BASE_ID` — the base ID (starts with `app`)
- `SLACK_WEBHOOK_URL` — a Slack Incoming Webhook URL for the target channel

Table name defaults to `Bookings`; override by adding an `AIRTABLE_TABLE_NAME`
secret/env var if needed.

## Local testing

```bash
cp .env.example .env
# fill in .env, then:
export $(grep -v '^#' .env | xargs)
pip install -r requirements.txt
python scripts/check_overdue.py
```

## Tuning

- Overdue leeway: `OVERDUE_LEEWAY_MINUTES` env var (default 60).
- Excluded statuses: `EXCLUDED_STATUSES` set in `scripts/check_overdue.py`.
- Check frequency / business hours: edit the `cron` schedule in
  `.github/workflows/overdue-check.yml`.
