const URLS = [
];

let workerTabId = null;
let isProcessing = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getRunning() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["isRunning"], (res) => {
      resolve(Boolean(res.isRunning));
    });
  });
}

async function setRunning(v) {
  return chrome.storage.local.set({ isRunning: v });
}

function getRandomDelay(minMs = 3000, maxMs = 7000) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function openOrReuseTab(url) {
  if (workerTabId !== null) {
    try {
      const tab = await chrome.tabs.update(workerTabId, { url, active: false });
      workerTabId = tab.id;
      return workerTabId;
    } catch (e) {
      workerTabId = null;
    }
  }

  const tab = await chrome.tabs.create({ url, active: false });
  workerTabId = tab.id;
  return tab.id;
}

async function waitForTabLoaded(tabId, timeoutMs = 30000) {
  const start = Date.now();

  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") return;

  return new Promise((resolve, reject) => {
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Tab load timeout"));
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function scrapeProjectUrls(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const anchors = document.querySelectorAll("a.ProjectCoverNeue-coverLink-U39");
      const urls = [];

      anchors.forEach((a) => {
        const href = a.getAttribute("href");
        if (!href) return;

        const absolute = href.startsWith("http")
          ? href
          : `https://www.behance.net${href}`;

        urls.push(absolute);
      });

      return Array.from(new Set(urls));
    }
  });

  return result || [];
}

async function openProjectForReview(url) {
  const tabId = await openOrReuseTab(url);
  await waitForTabLoaded(tabId);
  await sleep(getRandomDelay(2000, 4000));
  await input_data(tabId);

  console.log("Opened project:", url);
}

async function input_data(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const buttons = document.querySelectorAll('[aria-label="Appreciate"]');

      if (!buttons.length) {
        return { state: "Error", message: "Buttons not found." };
      }

      if (buttons.length < 3) {
        return { state: "Error", message: "Third button not found." };
      }
      const btn = buttons[2]; 
      btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); 
      btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); 
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return { state: "Success", message: "Element found." };
    }
  });

  console.log(result);
}

async function processProfile(profileUrl) {
  const running = await getRunning();
  if (!running) return;

  console.log("Opening profile:", profileUrl);

  const tabId = await openOrReuseTab(profileUrl);
  await waitForTabLoaded(tabId);
  await sleep(getRandomDelay(2000, 4000));

  const projectUrls = await scrapeProjectUrls(tabId);
  console.log(`Found ${projectUrls.length} projects on ${profileUrl}`);

  for (const projectUrl of projectUrls) {
    const stillRunning = await getRunning();
    if (!stillRunning) {
      console.log("Stopped during project loop");
      return;
    }

    try {
      await openProjectForReview(projectUrl);
      await sleep(getRandomDelay(4000, 8000));
    } catch (e) {
      console.error("Failed opening project:", projectUrl, e);
    }
  }
}

async function startProcessing() {
  if (isProcessing) {
    console.log("Already running");
    return;
  }

  isProcessing = true;

  try {
    for (const profileUrl of URLS) {
      const running = await getRunning();
      if (!running) {
        console.log("Stopped before next profile");
        break;
      }

      try {
        await processProfile(profileUrl);
        await sleep(getRandomDelay(5000, 10000));
      } catch (e) {
        console.error("Profile processing failed:", profileUrl, e);
      }
    }
  } finally {
    isProcessing = false;
    console.log("Processing finished");
  }
}

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === "START_MONITOR") {
    (async () => {
      await setRunning(true);
      await startProcessing();
      sendResponse({ running: true });
    })();

    return true;
  }

  if (msg.type === "STOP_MONITOR") {
    (async () => {
      await setRunning(false);
      sendResponse({ running: false });
    })();

    return true;
  }

  if (msg.type === "GET_STATUS") {
    (async () => {
      sendResponse({ running: await getRunning(), isProcessing });
    })();

    return true;
  }
});