document.getElementById("runNow").addEventListener("click", async () => {
  const resultEl = document.getElementById("result");
  resultEl.textContent = "Running...";
  const response = await chrome.runtime.sendMessage({ type: "RUN_CHECK_NOW" });
  if (!response) {
    resultEl.textContent = "No response from background worker.";
  } else if (response.ok) {
    resultEl.textContent =
      response.overdueCount === 0
        ? "Checked — nothing overdue."
        : `Checked — ${response.overdueCount} overdue record(s) posted to Slack.`;
  } else {
    resultEl.textContent = `Error: ${response.error}`;
  }
});
