(async function() {
  'use strict';

  try {
    const src = chrome.runtime.getURL('src/utils/mountSidebar.js');
    const { mountSidebar } = await import(src);
    await mountSidebar();
  } catch (e) {
    console.error('Momory: Failed to load sidebar modules', e);
  }
})();
