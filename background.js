// Background script for ChatGPT对话目录

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background收到消息:', request);
  
  if (request.action === 'openOptionsPage') {
    // 打开options页面
    chrome.tabs.create({
      url: chrome.runtime.getURL('options.html')
    }).then(() => {
      console.log('Options页面已打开');
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('打开Options页面失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // 返回true表示异步响应
    return true;
  }
  
  // 其他消息类型的处理可以在这里添加
  
});

// 扩展安装或更新时的处理
chrome.runtime.onInstalled.addListener((details) => {
  console.log('扩展已安装/更新:', details.reason);
  
  if (details.reason === 'install') {
    console.log('首次安装ChatGPT对话目录扩展');
  } else if (details.reason === 'update') {
    console.log('扩展已更新到版本:', chrome.runtime.getManifest().version);
  }
});

// 扩展启动时的处理
chrome.runtime.onStartup.addListener(() => {
  console.log('ChatGPT对话目录扩展已启动');
});