#!/usr/bin/env python3
"""Alert Slack when Airtable Bookings records miss their Next Human Action Date.

Reads Airtable Bookings records, flags any where Next Human Action Date is
more than OVERDUE_LEEWAY_MINUTES in the past, and posts a summary to Slack.
Records with Sales status Closed or Disqualified are ignored.
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import requests

AIRTABLE_API_KEY = os.environ["AIRTABLE_API_KEY"]
AIRTABLE_BASE_ID = os.environ["AIRTABLE_BASE_ID"]
AIRTABLE_TABLE_NAME = os.environ.get("AIRTABLE_TABLE_NAME", "Bookings")
SLACK_WEBHOOK_URL = os.environ["SLACK_WEBHOOK_URL"]

OVERDUE_LEEWAY_MINUTES = int(os.environ.get("OVERDUE_LEEWAY_MINUTES", "60"))
EXCLUDED_STATUSES = {"Closed", "Disqualified"}

DATE_FIELD = "Next Human Action Date"
SDR_FIELD = "SDR Owner"
STATUS_FIELD = "Sales status"
NAME_FIELD = "Name"

AIRTABLE_API_URL = f"https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_NAME}"


def fetch_records():
    records = []
    params = {
        "fields[]": [NAME_FIELD, DATE_FIELD, SDR_FIELD, STATUS_FIELD],
        "pageSize": 100,
    }
    headers = {"Authorization": f"Bearer {AIRTABLE_API_KEY}"}
    offset = None
    while True:
        if offset:
            params["offset"] = offset
        resp = requests.get(AIRTABLE_API_URL, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
    return records


def parse_airtable_datetime(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def find_overdue(records):
    threshold = datetime.now(timezone.utc) - timedelta(minutes=OVERDUE_LEEWAY_MINUTES)
    overdue = []
    for record in records:
        fields = record.get("fields", {})
        status = fields.get(STATUS_FIELD)
        if status in EXCLUDED_STATUSES:
            continue
        raw_date = fields.get(DATE_FIELD)
        if not raw_date:
            continue
        try:
            action_date = parse_airtable_datetime(raw_date)
        except ValueError:
            continue
        if action_date < threshold:
            overdue.append((record, action_date))
    return overdue


def format_overdue_duration(action_date):
    delta = datetime.now(timezone.utc) - action_date
    hours, remainder = divmod(int(delta.total_seconds()), 3600)
    minutes = remainder // 60
    if hours:
        return f"{hours}h {minutes}m overdue"
    return f"{minutes}m overdue"


def build_slack_message(overdue):
    lines = [f"*{len(overdue)} overdue record(s) need action:*"]
    for record, action_date in overdue:
        fields = record.get("fields", {})
        name = fields.get(NAME_FIELD, "(unnamed)")
        sdr = fields.get(SDR_FIELD, "Unassigned")
        if isinstance(sdr, dict):
            sdr = sdr.get("name", "Unassigned")
        record_url = f"https://airtable.com/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_NAME}/{record['id']}"
        lines.append(
            f"• <{record_url}|{name}> — SDR: {sdr} — {format_overdue_duration(action_date)}"
        )
    return "\n".join(lines)


def post_to_slack(message):
    resp = requests.post(SLACK_WEBHOOK_URL, json={"text": message}, timeout=30)
    resp.raise_for_status()


def main():
    records = fetch_records()
    overdue = find_overdue(records)
    if not overdue:
        print("No overdue records found.")
        return
    message = build_slack_message(overdue)
    post_to_slack(message)
    print(f"Posted {len(overdue)} overdue record(s) to Slack.")


if __name__ == "__main__":
    try:
        main()
    except requests.exceptions.RequestException as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyError as exc:
        print(f"Missing required environment variable: {exc}", file=sys.stderr)
        sys.exit(1)
