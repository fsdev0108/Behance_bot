document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const statusEl = document.getElementById("status");

  if (!startBtn || !stopBtn || !statusEl) {
    console.error("Popup elements not found", { startBtn, stopBtn, statusEl });
    return;
  }

  function setStatus(running) {
    statusEl.innerHTML =
      "Status: <strong>" + (running ? "running" : "stopped") + "</strong>";
  }

  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
    if (res) setStatus(res.running);
  });

  startBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "START_MONITOR" }, (res) => {
      if (res) setStatus(res.running);
    });
  });

  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "STOP_MONITOR" }, (res) => {
      if (res) setStatus(res.running);
    });
  });
});