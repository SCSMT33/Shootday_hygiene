const viewUrlInput = document.getElementById("viewUrl");
const webhookUrlInput = document.getElementById("webhookUrl");
const status = document.getElementById("status");

async function load() {
  const { viewUrl, slackWebhookUrl } = await chrome.storage.local.get([
    "viewUrl",
    "slackWebhookUrl",
  ]);
  if (viewUrl) viewUrlInput.value = viewUrl;
  if (slackWebhookUrl) webhookUrlInput.value = slackWebhookUrl;
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    viewUrl: viewUrlInput.value.trim(),
    slackWebhookUrl: webhookUrlInput.value.trim(),
  });
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 2000);
});

load();
