// ChatGPT对话目录 - Content Script

(function() {
  'use strict';
  
  let sidebar = null;
  let isExpanded = false;
  let currentQuestions = [];
  let conversationId = null;
  let lastDataHash = null;
  let isLoading = false;
  let lastMessageCount = 0;
  let messageCountCheckInterval = null;
  
  // 初始化插件
  function init() {
    console.log('ChatGPT对话目录插件已加载');
    
    // 清理可能存在的定时器
    stopMessageCountMonitoring();
    
    // 等待页面完全加载
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createSidebar);
    } else {
      createSidebar();
    }
    
    // 监听URL变化
    observeUrlChanges();
    
    // 监听页面内容变化
    observePageChanges();
  }
  
  // 创建侧栏
  function createSidebar() {
    if (sidebar) return;
    
    sidebar = document.createElement('div');
    sidebar.className = 'chatgpt-sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-toggle">
        <svg class="sidebar-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15,18 9,12 15,6"></polyline>
        </svg>
      </div>
      <div class="sidebar-header">
        <h3 class="sidebar-title">对话目录 <p class="sidebar-subtitle">点击问题快速定位</p></h3>
        <div class="multi-select-controls" style="display: none;">
          <button class="multi-select-toggle" id="multiSelectToggle">多选模式</button>
          <button class="batch-save-btn" id="batchSaveBtn" style="display: none;">合并保存</button>
          <button class="cancel-select-btn" id="cancelSelectBtn" style="display: none;">取消</button>
        </div>
      </div>
      <div class="questions-container">
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>正在加载对话数据...</p>
        </div>
      </div>
      <div class="sidebar-footer">
        <div class="view-more-btn" id="viewMoreBtn">
          <span>View More</span>
          <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9,18 15,12 9,6"></polyline>
          </svg>
        </div>
      </div>
    `;
    
    document.body.appendChild(sidebar);
    document.body.classList.add('chatgpt-sidebar-active');
    
    // 绑定切换事件
    const toggleBtn = sidebar.querySelector('.sidebar-toggle');
    toggleBtn.addEventListener('click', toggleSidebar);
    
    // 绑定view more按钮事件
    const viewMoreBtn = sidebar.querySelector('#viewMoreBtn');
    viewMoreBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({action: 'openOptionsPage'});
    });
    
    // 绑定多选模式事件
    initMultiSelectMode();
    
    // 延迟加载数据
    setTimeout(() => {
      loadConversationData();
    }, 1000);
  }
  
  // 切换侧栏展开/折叠
  function toggleSidebar() {
    isExpanded = !isExpanded;
    if (isExpanded) {
      sidebar.classList.add('expanded');
    } else {
      sidebar.classList.remove('expanded');
    }
  }
  
  // 获取当前对话ID
  function getCurrentConversationId() {
    const url = window.location.href;
    const match = url.match(/\/c\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }
  
  // 计算数据哈希值
  function calculateDataHash(data) {
    if (!data || !data.messages) return null;
    const messagesText = data.messages.map(m => m.text || '').join('|');
    // 使用更安全的编码方式处理Unicode字符
    try {
      return btoa(encodeURIComponent(messagesText)).substring(0, 20);
    } catch (e) {
      // 如果仍然失败，使用简单的哈希算法
      let hash = 0;
      for (let i = 0; i < messagesText.length; i++) {
        const char = messagesText.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
      }
      return Math.abs(hash).toString(36).substring(0, 20);
    }
  }
  
  // 启动消息数量监听
  function startMessageCountMonitoring() {
    // 清除之前的定时器
    if (messageCountCheckInterval) {
      clearInterval(messageCountCheckInterval);
    }
    
    // 每2秒检查一次消息数量变化
    messageCountCheckInterval = setInterval(async () => {
      if (!conversationId || isLoading) return;
      
      try {
        const conversationData = await readConversationFromIndexedDB(conversationId);
        if (conversationData && conversationData.messages) {
          const currentMessageCount = conversationData.messages.length;
          
          // 如果消息数量发生变化，立即更新
          if (currentMessageCount !== lastMessageCount) {
            console.log('检测到消息数量变化:', lastMessageCount, '->', currentMessageCount);
            loadConversationData();
          }
        }
      } catch (error) {
        console.error('检查消息数量时出错:', error);
      }
    }, 2000);
  }
  
  // 停止消息数量监听
  function stopMessageCountMonitoring() {
    if (messageCountCheckInterval) {
      clearInterval(messageCountCheckInterval);
      messageCountCheckInterval = null;
    }
  }
  
  // 加载对话数据
  async function loadConversationData() {
    if (isLoading) {
      console.log('数据正在加载中，跳过重复请求');
      return;
    }
    
    try {
      isLoading = true;
      conversationId = getCurrentConversationId();
      if (!conversationId) {
        showEmptyState('请打开一个具体的对话页面');
        return;
      }
      
      console.log('当前对话ID:', conversationId);
      
      // 读取IndexedDB数据
      const conversationData = await readConversationFromIndexedDB(conversationId);
      
      if (conversationData && conversationData.messages) {
        const currentMessageCount = conversationData.messages.length;
        
        // 计算新数据的哈希值
        const newDataHash = calculateDataHash(conversationData);
        
        // 检查数据是否真的发生了变化（消息数量或内容变化）
        if (newDataHash === lastDataHash && currentMessageCount === lastMessageCount) {
          console.log('数据未发生变化，跳过更新');
          return;
        }
        
        console.log('检测到数据变化，更新界面 - 消息数量:', currentMessageCount);
        lastDataHash = newDataHash;
        lastMessageCount = currentMessageCount;
        extractAndDisplayQuestions(conversationData.messages);
        
        // 启动消息数量监听
        startMessageCountMonitoring();
      } else {
        showEmptyState('未找到对话数据');
      }
    } catch (error) {
      console.error('加载对话数据失败:', error);
      showEmptyState('加载数据时出错');
    } finally {
      isLoading = false;
    }
  }
  
  // 从IndexedDB读取对话数据
  function readConversationFromIndexedDB(conversationId) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ConversationsDatabase');
      
      request.onerror = () => {
        console.error('无法打开IndexedDB');
        reject(new Error('无法打开数据库'));
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        
        // 尝试不同的对象存储名称
        const possibleStoreNames = ['conversations', 'conversation', 'messages'];
        let storeName = null;
        
        for (const name of possibleStoreNames) {
          if (db.objectStoreNames.contains(name)) {
            storeName = name;
            break;
          }
        }
        
        if (!storeName) {
          console.log('可用的对象存储:', Array.from(db.objectStoreNames));
          // 使用第一个可用的存储
          storeName = db.objectStoreNames[0];
        }
        
        if (!storeName) {
          reject(new Error('未找到对话数据存储'));
          return;
        }
        
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        // 尝试直接通过ID获取
        const getRequest = store.get(conversationId);
        
        getRequest.onsuccess = () => {
          if (getRequest.result) {
            resolve(getRequest.result);
          } else {
            // 如果直接获取失败，尝试遍历所有记录
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
              const allData = getAllRequest.result;
              console.log('所有对话数据:', allData);
              
              // 查找匹配的对话
              const conversation = allData.find(item => 
                item.id === conversationId || 
                (item[conversationId] && item[conversationId].id === conversationId)
              );
              
              if (conversation) {
                // 如果找到嵌套结构，提取实际数据
                const actualData = conversation[conversationId] || conversation;
                resolve(actualData);
              } else {
                resolve(null);
              }
            };
          }
        };
        
        getRequest.onerror = () => {
          reject(new Error('读取数据失败'));
        };
      };
    });
  }
  
  // 提取并显示用户问题
  function extractAndDisplayQuestions(messages) {
    if (!Array.isArray(messages)) {
      showEmptyState('消息数据格式错误');
      return;
    }
    
    currentQuestions = [];
    
    // 从第二个消息开始，每隔一个提取用户问题
    for (let i = 1; i < messages.length; i += 2) {
      const message = messages[i];
      if (message && message.text && message.text.trim()) {
        currentQuestions.push({
          index: Math.floor(i / 2) + 1,
          text: message.text.trim(),
          messageId: message.id,
          originalIndex: i
        });
      }
    }
    
    displayQuestions();
  }
  
  // 显示问题列表
  function displayQuestions() {
    const container = sidebar.querySelector('.questions-container');
    
    if (currentQuestions.length === 0) {
      showEmptyState('当前对话中没有找到用户问题');
      return;
    }
    
    const questionsHtml = currentQuestions.map(question => `
      <div class="question-item" data-message-id="${question.messageId}" data-index="${question.originalIndex}">
        <div class="favorite-btn" data-message-id="${question.messageId}" title="收藏此问答">
          <svg class="star-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
          </svg>
        </div>
        <p class="question-text"><span class="question-index">${question.index}.</span>${escapeHtml(question.text)}</p>
      </div>
    `).join('');
    
    container.innerHTML = questionsHtml;
    
    // 绑定点击事件
    container.querySelectorAll('.question-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // 如果点击的是收藏按钮，不触发问题跳转
        if (e.target.closest('.favorite-btn')) {
          return;
        }
        
        // 如果是多选模式，不触发滚动
        if (isMultiSelectMode) {
          return;
        }
        
        const messageId = item.dataset.messageId;
        const index = parseInt(item.dataset.index);
        scrollToQuestion(messageId, index);
        
        // 更新活跃状态
        container.querySelectorAll('.question-item').forEach(q => q.classList.remove('active'));
        item.classList.add('active');
      });
    });
    
    // 绑定收藏按钮点击事件
    container.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const messageId = btn.dataset.messageId;
        await handleFavoriteClick(messageId, btn);
      });
    });
    
    // 检查已收藏状态
    checkFavoriteStatus(container);
  }
  
  // 滚动到指定问题
  function scrollToQuestion(messageId, index) {
    // 尝试多种方式定位元素
    const selectors = [
      `[data-message-id="${messageId}"]`,
      `[id*="${messageId}"]`,
      `.group:nth-child(${index + 1})`,
      `[data-testid*="conversation-turn"]:nth-child(${index + 1})`
    ];
    
    let targetElement = null;
    
    for (const selector of selectors) {
      targetElement = document.querySelector(selector);
      if (targetElement) break;
    }
    
    // 如果还是找不到，尝试通过文本内容查找
    if (!targetElement) {
      const question = currentQuestions.find(q => q.messageId === messageId);
      if (question) {
        const allElements = document.querySelectorAll('div, p, span');
        for (const el of allElements) {
          if (el.textContent && el.textContent.includes(question.text.substring(0, 50))) {
            targetElement = el;
            break;
          }
        }
      }
    }
    
    if (targetElement) {
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      
      // 添加高亮效果
      targetElement.style.transition = 'background-color 0.3s ease';
      targetElement.style.backgroundColor = '#eff6ff';
      setTimeout(() => {
        targetElement.style.backgroundColor = '';
      }, 2000);
    } else {
      console.log('未找到目标元素，尝试滚动到页面顶部');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  
  // 显示空状态
  function showEmptyState(message) {
    const container = sidebar.querySelector('.questions-container');
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m9,9 6,6"></path>
          <path d="m15,9 -6,6"></path>
        </svg>
        <p class="empty-state-text">${message}</p>
      </div>
    `;
  }
  
  // 监听URL变化
  function observeUrlChanges() {
    let currentUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        console.log('URL变化，重新加载数据');
        
        // 停止之前的消息监听
        stopMessageCountMonitoring();
        
        // 重置数据哈希和消息数量，确保新对话能正确加载
        lastDataHash = null;
        lastMessageCount = 0;
        
        setTimeout(() => {
          loadConversationData();
        }, 1000);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // 监听页面内容变化
  function observePageChanges() {
    let debounceTimer = null;
    
    const observer = new MutationObserver((mutations) => {
      let shouldReload = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // 检查是否有新的消息添加
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 更精确地检测消息相关的DOM变化
              if (node.matches && (
                  node.matches('[data-message-id]') || 
                  node.matches('.group') ||
                  node.matches('[data-testid*="conversation"]') ||
                  (node.querySelector && (
                    node.querySelector('[data-message-id]') ||
                    node.querySelector('.group') ||
                    node.querySelector('[data-testid*="conversation"]')
                  ))
                )) {
                shouldReload = true;
                break;
              }
            }
          }
        }
      });
      
      if (shouldReload) {
        // 使用防抖机制，避免频繁触发
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        debounceTimer = setTimeout(() => {
          console.log('检测到新消息，重新加载数据');
          loadConversationData();
        }, 1000); // 增加延迟时间
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // 收藏功能相关函数
  async function handleFavoriteClick(messageId, btnElement) {
    try {
      // 检查是否已收藏
      const isFavorited = await checkIfFavorited(messageId);
      
      if (isFavorited) {
        // 取消收藏
        await removeFavorite(messageId);
        btnElement.classList.remove('favorited');
        console.log('已取消收藏:', messageId);
      } else {
        // 添加收藏
        const success = await addToFavorites(messageId);
        if (success) {
          btnElement.classList.add('favorited');
          console.log('已添加收藏:', messageId);
        }
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
    }
  }
  
  async function addToFavorites(messageId) {
    try {
      // 获取当前对话数据
      const conversationData = await readConversationFromIndexedDB(conversationId);
      if (!conversationData || !conversationData.messages) {
        throw new Error('无法获取对话数据');
      }
      
      // 找到当前消息和下一条消息
      const messages = conversationData.messages;
      const currentIndex = messages.findIndex(msg => msg.id === messageId);
      
      if (currentIndex === -1) {
        throw new Error('未找到指定消息');
      }
      
      const currentMessage = messages[currentIndex];
      const nextMessage = messages[currentIndex + 1];
      
      if (!nextMessage) {
        throw new Error('未找到回答消息');
      }
      
      // 创建文章数据
      const article = {
        title: currentMessage.text, // 保存完整标题
        content: nextMessage.text, // 只保存回答内容，不包含重复的问题
        category: '未分类',
        create_at: new Date().toISOString(),
        messageId: messageId
      };
      
      // 保存到文章表
      await saveArticle(article);
      
      // 保存到收藏信息表
      await saveFavoriteInfo(messageId);
      
      return true;
    } catch (error) {
      console.error('添加收藏失败:', error);
      return false;
    }
  }
  
  async function checkFavoriteStatus(container) {
    try {
      const favoriteButtons = container.querySelectorAll('.favorite-btn');
      for (const btn of favoriteButtons) {
        const messageId = btn.dataset.messageId;
        const isFavorited = await checkIfFavorited(messageId);
        if (isFavorited) {
          btn.classList.add('favorited');
        }
      }
    } catch (error) {
      console.error('检查收藏状态失败:', error);
    }
  }
  
  // Chrome Storage操作函数
  async function initFavoriteDB() {
    // 使用chrome.storage.local，无需初始化
    // 确保数据结构存在
    const result = await chrome.storage.local.get(['categories', 'articles', 'favorites']);
    
    if (!result.categories) {
      await chrome.storage.local.set({ categories: [] });
    }
    if (!result.articles) {
      await chrome.storage.local.set({ articles: [] });
    }
    if (!result.favorites) {
      await chrome.storage.local.set({ favorites: [] });
    }
    
    return true; // 返回成功标识
  }
  
  async function saveArticle(article) {
    await initFavoriteDB();
    
    // 获取当前文章列表
    const result = await chrome.storage.local.get(['articles']);
    const articles = result.articles || [];
    
    // 生成新的ID
    const maxId = articles.length > 0 ? Math.max(...articles.map(a => a.id || 0)) : 0;
    article.id = maxId + 1;
    
    // 添加文章
    articles.push(article);
    
    // 保存回storage
    await chrome.storage.local.set({ articles });
    
    return article.id;
  }
  
  async function saveFavoriteInfo(messageId) {
    await initFavoriteDB();
    
    // 获取当前收藏列表
    const result = await chrome.storage.local.get(['favorites']);
    const favorites = result.favorites || [];
    
    // 检查是否已存在
    if (!favorites.find(f => f.messageId === messageId)) {
      favorites.push({ messageId, timestamp: new Date().toISOString() });
      await chrome.storage.local.set({ favorites });
    }
    
    return true;
  }
  
  async function checkIfFavorited(messageId) {
    try {
      await initFavoriteDB();
      
      // 获取收藏列表
      const result = await chrome.storage.local.get(['favorites']);
      const favorites = result.favorites || [];
      
      return favorites.some(f => f.messageId === messageId);
    } catch (error) {
      console.error('检查收藏状态失败:', error);
      return false;
    }
  }
  
  async function removeFavorite(messageId) {
    await initFavoriteDB();
    
    // 获取当前数据
    const result = await chrome.storage.local.get(['favorites', 'articles']);
    let favorites = result.favorites || [];
    let articles = result.articles || [];
    
    // 从收藏列表中删除
    favorites = favorites.filter(f => f.messageId !== messageId);
    
    // 从文章列表中删除相关文章
    articles = articles.filter(a => a.messageId !== messageId);
    
    // 保存更新后的数据
    await chrome.storage.local.set({ favorites, articles });
  }
  
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  // 多选模式相关变量
  let isMultiSelectMode = false;
  let selectedItems = new Set();
  
  // 初始化多选模式
  function initMultiSelectMode() {
    const multiSelectToggle = sidebar.querySelector('#multiSelectToggle');
    const batchSaveBtn = sidebar.querySelector('#batchSaveBtn');
    const cancelSelectBtn = sidebar.querySelector('#cancelSelectBtn');
    const multiSelectControls = sidebar.querySelector('.multi-select-controls');
    
    // 显示多选控制按钮
    multiSelectControls.style.display = 'flex';
    
    // 切换多选模式
    multiSelectToggle.addEventListener('click', () => {
      toggleMultiSelectMode();
    });
    
    // 批量保存
    batchSaveBtn.addEventListener('click', () => {
      batchSaveSelectedItems();
    });
    
    // 取消选择
    cancelSelectBtn.addEventListener('click', () => {
      exitMultiSelectMode();
    });
  }
  
  // 切换多选模式
  function toggleMultiSelectMode() {
    isMultiSelectMode = !isMultiSelectMode;
    const multiSelectToggle = sidebar.querySelector('#multiSelectToggle');
    const batchSaveBtn = sidebar.querySelector('#batchSaveBtn');
    const cancelSelectBtn = sidebar.querySelector('#cancelSelectBtn');
    const questionItems = sidebar.querySelectorAll('.question-item');
    
    if (isMultiSelectMode) {
      multiSelectToggle.classList.add('active');
      multiSelectToggle.textContent = '退出多选';
      batchSaveBtn.style.display = 'inline-block';
      cancelSelectBtn.style.display = 'inline-block';
      
      // 为所有问题项添加多选样式
      questionItems.forEach(item => {
        item.classList.add('multi-select-mode');
        item.addEventListener('click', handleItemSelection);
      });
    } else {
      exitMultiSelectMode();
    }
  }
  
  // 退出多选模式
  function exitMultiSelectMode() {
    isMultiSelectMode = false;
    selectedItems.clear();
    
    const multiSelectToggle = sidebar.querySelector('#multiSelectToggle');
    const batchSaveBtn = sidebar.querySelector('#batchSaveBtn');
    const cancelSelectBtn = sidebar.querySelector('#cancelSelectBtn');
    const questionItems = sidebar.querySelectorAll('.question-item');
    
    multiSelectToggle.classList.remove('active');
    multiSelectToggle.textContent = '多选模式';
    batchSaveBtn.style.display = 'none';
    cancelSelectBtn.style.display = 'none';
    
    // 移除所有问题项的多选样式
    questionItems.forEach(item => {
      item.classList.remove('multi-select-mode', 'selected');
      item.removeEventListener('click', handleItemSelection);
    });
  }
  
  // 处理项目选择
  function handleItemSelection(event) {
    if (!isMultiSelectMode) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const item = event.currentTarget;
    const messageId = item.dataset.messageId;
    
    if (selectedItems.has(messageId)) {
      selectedItems.delete(messageId);
      item.classList.remove('selected');
    } else {
      selectedItems.add(messageId);
      item.classList.add('selected');
    }
    
    // 更新批量保存按钮状态
    const batchSaveBtn = sidebar.querySelector('#batchSaveBtn');
    batchSaveBtn.textContent = `合并保存 (${selectedItems.size})`;
    batchSaveBtn.disabled = selectedItems.size === 0;
  }
  
  // 批量保存选中的项目
  async function batchSaveSelectedItems() {
    if (selectedItems.size === 0) {
      alert('请先选择要保存的对话');
      return;
    }
    
    try {
      const conversationId = getCurrentConversationId();
      if (!conversationId) {
        alert('无法获取当前对话ID');
        return;
      }
      
      // 从IndexedDB获取对话数据
      const conversationData = await readConversationFromIndexedDB(conversationId);
      if (!conversationData || !conversationData.messages) {
        alert('无法获取对话数据');
        return;
      }
      
      // 收集选中的消息内容
      const selectedMessages = [];
      const messageIds = Array.from(selectedItems).sort((a, b) => parseInt(a) - parseInt(b));
      
      messageIds.forEach(messageId => {
        const messageIndex = parseInt(messageId);
        const currentMessage = conversationData.messages[messageIndex];
        const nextMessage = conversationData.messages[messageIndex + 1];
        
        if (currentMessage) {
          selectedMessages.push({
            question: currentMessage.text || '',
            answer: nextMessage ? nextMessage.text || '' : ''
          });
        }
      });
      
      if (selectedMessages.length === 0) {
        alert('没有找到有效的消息内容');
        return;
      }
      
      // 合并内容
      const title = `批量保存 - ${new Date().toLocaleDateString()}`;
      let content = '';
      selectedMessages.forEach((msg, index) => {
        content += `## 问题 ${index + 1}\n${msg.question}\n\n`;
        if (msg.answer) {
          content += `## 回答 ${index + 1}\n${msg.answer}\n\n`;
        }
        content += '---\n\n';
      });
      
      // 保存到文章表
      await saveArticle({
        title: title,
        content: content,
        category: 'batch-saved',
        create_at: new Date().toISOString()
      });
      
      // 保存收藏信息
      for (const messageId of selectedItems) {
        await saveFavoriteInfo(messageId);
      }
      
      alert(`成功保存 ${selectedMessages.length} 个对话到文章列表`);
      exitMultiSelectMode();
      
    } catch (error) {
      console.error('批量保存失败:', error);
      alert('保存失败，请重试');
    }
  }
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkStatus') {
      sendResponse({status: 'active', questions: currentQuestions.length});
    } else if (request.action === 'reloadData') {
      loadConversationData();
      sendResponse({status: 'reloaded'});
    }
  });
  
  // 启动插件
  init();
  
})();