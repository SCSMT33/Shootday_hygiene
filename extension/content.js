// Scrapes the currently-open Airtable grid view by auto-scrolling it and
// reading rendered rows. Airtable virtualizes the grid, so only rows in the
// viewport exist in the DOM at any moment — we scroll top to bottom in
// steps, harvesting rows after each step, until we've covered the full
// scroll height twice in a row without finding new rows.
//
// NOTE: Airtable does not expose a stable public DOM structure. The
// selectors below are best-effort and isolated here so they're the only
// thing that needs updating if Airtable changes their markup. Use the
// browser DevTools inspector on the grid to update these if scraping stops
// working.
const SELECTORS = {
  // Any element that behaves as a data row in the grid.
  row: '[role="row"]',
  // Cells within a row.
  cell: '[role="gridcell"], [role="cell"]',
  // Header cells, used to map field name -> column index.
  headerRow: '[role="row"][aria-rowindex="1"], [role="rowheader"]',
  headerCell: '[role="columnheader"]',
  // The scrollable element that contains the rows (closest scrollable
  // ancestor of a row is located dynamically instead of hardcoded).
};

const FIELD_NAMES = {
  name: "Name",
  nextHumanActionDate: "Next Human Action Date",
  sdrOwner: "SDR Owner",
  salesStatus: "Sales status",
};

function findScrollContainer(rowEl) {
  let el = rowEl.parentElement;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const scrollable = /(auto|scroll)/.test(style.overflowY);
    if (scrollable && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function getHeaderIndexMap() {
  const headerCells = Array.from(document.querySelectorAll(SELECTORS.headerCell));
  const map = {};
  headerCells.forEach((cell, index) => {
    const text = cell.textContent.trim();
    for (const [key, label] of Object.entries(FIELD_NAMES)) {
      if (text === label) map[key] = index;
    }
  });
  return map;
}

function rowKey(rowEl) {
  return (
    rowEl.getAttribute("data-rowid") ||
    rowEl.getAttribute("data-testid") ||
    rowEl.getAttribute("aria-rowindex") ||
    rowEl.textContent.slice(0, 120)
  );
}

function extractRow(rowEl, indexMap) {
  const cells = Array.from(rowEl.querySelectorAll(SELECTORS.cell));
  if (cells.length === 0) return null;
  const get = (key) => {
    const idx = indexMap[key];
    if (idx == null || !cells[idx]) return "";
    return cells[idx].textContent.trim();
  };
  const name = get("name");
  if (!name) return null;
  return {
    key: rowKey(rowEl),
    name,
    nextHumanActionDate: get("nextHumanActionDate"),
    sdrOwner: get("sdrOwner"),
    salesStatus: get("salesStatus"),
  };
}

function harvestVisibleRows(indexMap) {
  const rows = Array.from(document.querySelectorAll(SELECTORS.row));
  const results = [];
  for (const rowEl of rows) {
    if (rowEl.matches('[aria-rowindex="1"]')) continue; // header
    const data = extractRow(rowEl, indexMap);
    if (data) results.push(data);
  }
  return results;
}

async function scrapeAllRows() {
  const indexMap = getHeaderIndexMap();
  if (Object.keys(indexMap).length === 0) {
    throw new Error(
      "Could not find expected column headers. Confirm the Chase SDR View is open and visible, and that column names match exactly."
    );
  }

  const someRow = document.querySelector(SELECTORS.row);
  if (!someRow) {
    throw new Error("No grid rows found on the page.");
  }
  const container = findScrollContainer(someRow);

  const collected = new Map();
  container.scrollTop = 0;
  await sleep(300);

  let stableRounds = 0;
  const maxRounds = 500; // hard safety cap
  let round = 0;

  while (stableRounds < 2 && round < maxRounds) {
    const before = collected.size;
    for (const row of harvestVisibleRows(indexMap)) {
      collected.set(row.key, row);
    }
    const atBottom =
      container.scrollTop + container.clientHeight >= container.scrollHeight - 2;

    if (collected.size === before && atBottom) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }

    if (atBottom) {
      // one more harvest at the very bottom, then stop
      if (stableRounds >= 2) break;
    }

    container.scrollTop = Math.min(
      container.scrollTop + container.clientHeight * 0.8,
      container.scrollHeight
    );
    await sleep(350);
    round += 1;
  }

  return Array.from(collected.values());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SCRAPE_OVERDUE_VIEW") return undefined;
  scrapeAllRows()
    .then((rows) => sendResponse({ ok: true, rows }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // keep the message channel open for the async response
});
