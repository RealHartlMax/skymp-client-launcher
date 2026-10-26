// Run after the client's constructors have installed their browser listeners.
const sp = require('skyrimPlatform');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
sp.once('tick', () => sp.once('tick', () => {
  const entry = path.resolve('Data/Platform/UI/index.html');
  if (!fs.existsSync(entry)) {
    sp.printConsole('SkyMP: multiplayer UI is missing. Prepare the complete client package again.');
    return;
  }
  // file:///Data/... points at the drive root on Windows, not the Skyrim folder.
  sp.browser.loadUrl(pathToFileURL(entry).href);
  sp.browser.setVisible(true);
}));
