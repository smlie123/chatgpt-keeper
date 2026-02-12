import { ChatGPTAdapter } from '../adapters/ChatGPTAdapter.js';
import { GeminiAdapter } from '../adapters/GeminiAdapter.js';
import { GrokAdapter } from '../adapters/GrokAdapter.js';
import { Sidebar } from '../components/Sidebar.js';

export async function mountSidebar() {
  let adapter = null;

  if (ChatGPTAdapter.isSupported()) {
    adapter = new ChatGPTAdapter();
  } else if (GeminiAdapter.isSupported()) {
    adapter = new GeminiAdapter();
  } else if (GrokAdapter.isSupported()) {
    adapter = new GrokAdapter();
  }

  if (!adapter) {
    console.log('Momory: Current platform not supported.');
    return;
  }

  try {
    await adapter.init();
    const sidebar = new Sidebar(adapter);
    await sidebar.init();
    console.log(`Momory: Sidebar mounted for ${adapter.name}`);
  } catch (e) {
    console.error('Momory: Failed to mount sidebar', e);
  }
}
