// Background script for ChatGPT对话目录

// 导入IndexedDB和存储API
importScripts('indexeddb.js', 'storage-api.js');

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background收到消息:', request);
  
  // 处理保存文章请求
  if (request.action === 'saveArticle') {
    handleSaveArticle(request.data)
      .then(result => {
        console.log('文章保存成功:', result);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('文章保存失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  }
  
  // 处理保存分类请求
  if (request.action === 'saveCategory') {
    handleSaveCategory(request.data)
      .then(result => {
        console.log('分类保存成功:', result);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('分类保存失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  }
  
  if (request.action === 'openOptionsPage') {
    // 检查是否已有options页面打开
    const optionsUrl = chrome.runtime.getURL('options.html');
    
    chrome.tabs.query({}, (tabs) => {
      const existingTab = tabs.find(tab => tab.url && tab.url.startsWith(optionsUrl));
      
      if (existingTab) {
        // 如果已有options页面，激活它并发送刷新数据消息
        chrome.tabs.update(existingTab.id, { active: true }, () => {
          // 发送消息给options页面刷新数据
          chrome.tabs.sendMessage(existingTab.id, { action: 'refreshData' }, (response) => {
            console.log('Options页面已激活并刷新数据');
            sendResponse({ success: true });
          });
        });
      } else {
        // 如果没有options页面，创建新的
        chrome.tabs.create({
          url: optionsUrl
        }).then(() => {
          console.log('Options页面已打开');
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('打开Options页面失败:', error);
          sendResponse({ success: false, error: error.message });
        });
      }
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