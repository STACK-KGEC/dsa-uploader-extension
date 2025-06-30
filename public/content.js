chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "extractLeetCodeData") {
    const rows = document.querySelectorAll('div[role="row"]');
    const problems = Array.from(rows).map(row => {
      const cells = row.querySelectorAll('div[role="cell"]');
      if (cells.length < 3) return null;

      // Date
      const dateDiv = cells[0].querySelector('.text-sd-muted-foreground');
      const date = dateDiv ? dateDiv.textContent.trim() : null;

      // Problem name and URL
      const problemLink = cells[1].querySelector('a.font-semibold');
      const name = problemLink ? problemLink.textContent.trim() : null;
      const url = problemLink ? 'https://leetcode.com' + problemLink.getAttribute('href') : null;

      // In your content script:
      const diffDivs = cells[1].querySelectorAll('div.text-\\[14px\\]');
      let difficulty = "";
      for (const div of diffDivs) {
        if (
          div.classList.contains("text-sd-easy") ||
          div.classList.contains("text-sd-medium") ||
          div.classList.contains("text-sd-hard")
        ) {
          difficulty = div.textContent.trim();
          break;
        }
      }
      // Status (third cell, always)
      const statusDiv = cells[2].querySelector('.text-sd-muted-foreground');
      const status = statusDiv ? statusDiv.textContent.trim() : null;

      return { date, name, url, difficulty, status };
    }).filter(Boolean);
    sendResponse({ problems });
  }
  return true;
});
