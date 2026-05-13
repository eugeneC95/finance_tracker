document.getElementById('open-btn').addEventListener('click', function() {
  var appUrl = chrome.runtime.getURL('app.html');
  chrome.tabs.query({ url: appUrl }, function(tabs) {
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: appUrl });
    }
  });
});
