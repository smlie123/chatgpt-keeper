// Background script for ChatGPT对话目录

// 导入 IndexedDB 和存储 API
importScripts('indexeddb.js', 'storage-api.js');

// Track the home tab ID
let homeTabId = null;

// Reusable function to open or focus the home tab
function openOrFocusHomeTab(sendResponse) {
  const optionsUrl = chrome.runtime.getURL('home.html');
  
  const createNewHomeTab = () => {
    chrome.tabs.create({ url: optionsUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        if (sendResponse) sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        homeTabId = tab.id; // Save the new tab ID
        if (sendResponse) sendResponse({ success: true });
      }
    });
  };

  if (homeTabId !== null) {
    // Check if the saved tab ID still exists
    chrome.tabs.get(homeTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        // Tab doesn't exist (user closed it), recreate it
        homeTabId = null;
        createNewHomeTab();
      } else {
        // Tab exists, activate and refresh it
        chrome.tabs.update(homeTabId, { active: true }, () => {
           if (chrome.runtime.lastError) {
              // If activation fails, fallback to create
              homeTabId = null;
              createNewHomeTab();
              return;
           }
           // Reload the tab to refresh data
           chrome.tabs.reload(homeTabId, () => {
             if (sendResponse) sendResponse({ success: true });
           });
        });
      }
    });
  } else {
    // No saved tab ID, create new one
    createNewHomeTab();
  }
}

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  openOrFocusHomeTab();
});

// Handle installation event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background收到消息:', request);
  
  if (request.action === 'saveArticle') {
    (async () => {
      try {
        const articleData = request.data || {};
        const result = await handleSaveArticle(request.data);
        sendResponse({ success: true, data: result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (request.action === 'broadcastDirectoryHandle') {
    (async () => {
      try {
        const dirHandle = request.handle;
        // Only broadcast to relevant tabs
        const targetUrls = [
          "https://chatgpt.com/*",
          "https://chat.openai.com/*"
        ];
        chrome.tabs.query({ url: targetUrls }, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              try {
                chrome.tabs.sendMessage(tab.id, { action: 'setDirectoryHandle', handle: dirHandle });
              } catch (e) {}
            }
          });
          sendResponse({ success: true });
        });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (request.action === 'saveCategory') {
    handleSaveCategory(request.data)
      .then(result => {
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.action === 'openOptionsPage') {
    openOrFocusHomeTab(sendResponse);
    return true;
  }
});
chrome.runtime.onInstalled.addListener((details) => {
  console.log('扩展已安装/更新:', details.reason);
});

chrome.runtime.onStartup.addListener(() => {
  console.log('ChatGPT对话目录扩展已启动');
});

// 处理保存文章的函数
async function handleSaveArticle(articleData) {
  try {
    // 初始化存储API
    await storageAPI.init();
    
    // 保存文章到IndexedDB
    const result = await storageAPI.saveArticle(articleData);
    return result;
  } catch (error) {
    console.error('Background保存文章失败:', error);
    throw error;
  }
}

// 处理保存分类的函数
async function handleSaveCategory(categoryData) {
  try {
    // 初始化存储API
    await storageAPI.init();
    
    // 获取现有分类
    const result = await storageAPI.get(['categories']);
    const categories = result.categories || [];
    
    // 添加新分类
    const maxId = categories.length > 0 ? Math.max(...categories.map(c => c.id || 0)) : 0;
    const newCategory = {
      id: maxId + 1,
      name: categoryData.name,
      order: categories.length,
      ...categoryData
    };
    
    categories.push(newCategory);
    
    // 保存分类
    await storageAPI.set({ categories });
    return newCategory;
  } catch (error) {
    console.error('Background保存分类失败:', error);
    throw error;
  }
}
