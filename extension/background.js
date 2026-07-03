const ALARM_NAME = "overdue-check";
const ALARM_PERIOD_MINUTES = 30;
const OVERDUE_LEEWAY_MINUTES = 60;
const EXCLUDED_STATUSES = new Set(["Closed", "Disqualified"]);

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runCheck();
});

// Manual trigger from the popup, for testing.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "RUN_CHECK_NOW") {
    runCheck().then((result) => sendResponse(result));
    return true;
  }
  return undefined;
});

async function getSettings() {
  const { slackWebhookUrl, viewUrl } = await chrome.storage.local.get([
    "slackWebhookUrl",
    "viewUrl",
  ]);
  return { slackWebhookUrl, viewUrl };
}

async function findTargetTab(viewUrl) {
  if (!viewUrl) return null;
  const tabs = await chrome.tabs.query({ url: "https://airtable.com/*" });
  return tabs.find((tab) => tab.url && tab.url.startsWith(viewUrl)) || null;
}

async function runCheck() {
  const { slackWebhookUrl, viewUrl } = await getSettings();

  if (!slackWebhookUrl || !viewUrl) {
    setBadge("!", "#f2994a");
    return { ok: false, error: "Missing Slack webhook URL or view URL in options." };
  }

  const tab = await findTargetTab(viewUrl);
  if (!tab) {
    setBadge("!", "#eb5757");
    return { ok: false, error: "Airtable view tab is not open. Open it and leave it loaded." };
  }

  let scrapeResult;
  try {
    scrapeResult = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_OVERDUE_VIEW" });
  } catch (err) {
    setBadge("!", "#eb5757");
    return { ok: false, error: `Could not reach the page: ${String(err)}` };
  }

  if (!scrapeResult?.ok) {
    setBadge("!", "#eb5757");
    return { ok: false, error: scrapeResult?.error || "Unknown scrape error." };
  }

  const overdue = findOverdue(scrapeResult.rows);

  if (overdue.length === 0) {
    setBadge("", "#27ae60");
    return { ok: true, overdueCount: 0 };
  }

  try {
    await postToSlack(slackWebhookUrl, overdue);
  } catch (err) {
    setBadge("!", "#eb5757");
    return { ok: false, error: `Slack post failed: ${String(err)}` };
  }

  setBadge(String(overdue.length), "#eb5757");
  return { ok: true, overdueCount: overdue.length };
}

function parseDate(text) {
  if (!text) return null;
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;
  return null;
}

function findOverdue(rows) {
  const threshold = Date.now() - OVERDUE_LEEWAY_MINUTES * 60 * 1000;
  const overdue = [];
  for (const row of rows) {
    if (EXCLUDED_STATUSES.has(row.salesStatus)) continue;
    const date = parseDate(row.nextHumanActionDate);
    if (!date) continue;
    if (date.getTime() < threshold) {
      overdue.push({ ...row, parsedDate: date });
    }
  }
  return overdue;
}

function formatOverdueDuration(date) {
  const ms = Date.now() - date.getTime();
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m overdue` : `${minutes}m overdue`;
}

async function postToSlack(webhookUrl, overdue) {
  const lines = [`*${overdue.length} overdue record(s) need action:*`];
  for (const row of overdue) {
    const sdr = row.sdrOwner || "Unassigned";
    lines.push(`• *${row.name}* — SDR: ${sdr} — ${formatOverdueDuration(row.parsedDate)}`);
  }
  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n") }),
  });
  if (!resp.ok) {
    throw new Error(`Slack responded with ${resp.status}`);
  }
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}
