// ChatGPT对话目录 - Content Script

(function() {
  'use strict';
  
  let sidebar = null;
  let isExpanded = false;
  let preventNextToggleClick = false;
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
    
    ensureIconfontStylesheet();
    
    sidebar = document.createElement('div');
    sidebar.className = 'chatgpt-sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-toggle">
        <img src="${chrome.runtime.getURL('icons/icon32.png')}" alt="Momory" class="sidebar-toggle-logo" />
        <svg class="sidebar-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15,18 9,12 15,6"></polyline>
        </svg>
      </div>
      <div class="sidebar-notice" id="sidebarNotice" style="display:none;">
        <span class="notice-text">saving...</span>
      </div>
      <div class="sidebar-header">
        <div class="view-more-btn" id="viewMoreBtn">
          <i class="iconfont icon-home"></i>
        </div>
        <div class="multi-select-controls">
          <button class="enter-multi-select-btn" id="enterMultiSelectBtn">Select</button>
          <div class="multi-select-actions" id="multiSelectActions" style="display: none;">
            <label class="select-all-container">
              <input type="checkbox" id="selectAllCheckbox" class="select-all-checkbox">
              <span class="select-all-text">All</span>
            </label>
            <button class="cancel-select-btn" id="cancelSelectBtn">Cancel</button>
            <button class="batch-save-btn" id="batchSaveBtn">Save</button>
          </div>
        </div>
      </div>
      <div class="questions-container">
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading conversation data...</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(sidebar);
    document.body.classList.add('chatgpt-sidebar-active');
    
    // 绑定切换事件
    const toggleBtn = sidebar.querySelector('.sidebar-toggle');
    toggleBtn.addEventListener('click', (e) => {
      if (preventNextToggleClick) {
        preventNextToggleClick = false;
        return;
      }
      toggleSidebar();
    });
    enableSidebarToggleDrag(toggleBtn);
    
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
  
  function ensureIconfontStylesheet() {
    const existing = document.getElementById('chatkeeper-iconfont-css');
    if (existing) return;
    const link = document.createElement('link');
    link.id = 'chatkeeper-iconfont-css';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('iconfont/iconfont.css');
    document.head.appendChild(link);
  }

  // 顶部通知栏开关：显示或隐藏“saving...”，用于图片保存过程
  function toggleSavingNotice(show) {
    if (!sidebar) return;
    const notice = sidebar.querySelector('#sidebarNotice');
    if (!notice) return;
    notice.style.display = show ? 'block' : 'none';
  }
  
  function enableSidebarToggleDrag(toggleBtn) {
    if (!sidebar || !toggleBtn) return;
    let startY = 0;
    let startTop = 0;
    let isDragging = false;
    let didMove = false;
    const storageKey = 'chatkeeper_sidebar_toggle_top';
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved !== null) {
        const val = parseFloat(saved);
        if (!Number.isNaN(val)) {
          toggleBtn.style.top = val + 'px';
          toggleBtn.style.bottom = 'auto';
          toggleBtn.style.transform = '';
        }
      }
    } catch (e) {}
    function onMouseDown(e) {
      if (e.button !== 0) return;
      isDragging = true;
      didMove = false;
      startY = e.clientY;
      startTop = toggleBtn.offsetTop;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (!isDragging) return;
      const deltaY = e.clientY - startY;
      if (Math.abs(deltaY) > 2) {
        didMove = true;
      }
      const sidebarRect = sidebar.getBoundingClientRect();
      const toggleHeight = toggleBtn.offsetHeight || 0;
      let newTop = startTop + deltaY;
      const minTop = 0;
      const maxTop = Math.max(0, sidebarRect.height - toggleHeight);
      if (newTop < minTop) newTop = minTop;
      if (newTop > maxTop) newTop = maxTop;
      toggleBtn.style.top = newTop + 'px';
      toggleBtn.style.bottom = 'auto';
      toggleBtn.style.transform = '';
    }
    function onMouseUp() {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (didMove) {
        preventNextToggleClick = true;
        const topValue = toggleBtn.offsetTop;
        try {
          window.localStorage.setItem(storageKey, String(topValue));
        } catch (e) {}
      }
    }
    toggleBtn.addEventListener('mousedown', onMouseDown);
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
      // 优先从HTML解析用户问题，不从IndexedDB获取
      const domQuestions = extractQuestionsFromDOM();
      if (domQuestions.length > 0) {
        const domData = { messages: domQuestions.map(q => ({ text: q.text })) };
        const newDataHash = calculateDataHash(domData);
        const currentMessageCount = domQuestions.length;

        if (newDataHash === lastDataHash && currentMessageCount === lastMessageCount) {
          console.log('DOM数据未变化，跳过更新');
          return;
        }

        lastDataHash = newDataHash;
        lastMessageCount = currentMessageCount;
        currentQuestions = domQuestions;
        displayQuestions();
        return;
      }

      // 如果DOM未解析到数据，则显示空状态（不从IndexedDB获取）
      showEmptyState('No user questions found on page');
    } catch (error) {
      console.error('加载对话数据失败:', error);
      showEmptyState('Error loading data');
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

  // 从HTML直接解析用户问题（You said: 的下一个元素）
  function extractQuestionsFromDOM() {
    try {
      const articles = document.querySelectorAll('article');
      const results = [];
      let indexCounter = 1;

      articles.forEach((article, idx) => {
        const srYou = article.querySelector('h5.sr-only');
        const isUser = !!(srYou && (srYou.textContent || '').trim().toLowerCase() === 'you said:');
        if (!isUser) return;

        let nextEl = srYou.nextElementSibling;
        if (!nextEl) {
          nextEl = srYou.parentElement && srYou.parentElement.nextElementSibling
            ? srYou.parentElement.nextElementSibling
            : article.querySelector('h5.sr-only + *');
        }

        const textRaw = nextEl ? (nextEl.innerText || nextEl.textContent || '') : '';
        const cleaned = textRaw.trim();
        if (!cleaned) return;

        const turnId = article.getAttribute('data-turn-id') || `turn-${idx}`;
        results.push({
          index: indexCounter++,
          text: cleaned,
          messageId: turnId,
          originalIndex: idx
        });
      });

      return results;
    } catch (e) {
      console.error('从HTML结构解析用户问题失败:', e);
      return [];
    }
  }
  
  // 提取并显示用户问题
  function extractAndDisplayQuestions(messages) {
    if (!Array.isArray(messages)) {
      showEmptyState('Message data format error');
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
      showEmptyState('No user questions found in current conversation');
      return;
    }
    
    const questionsHtml = currentQuestions.map(question => `
      <div class="question-item" data-message-id="${question.messageId}" data-index="${question.originalIndex}">
        <div class="favorite-btn" data-message-id="${question.messageId}" title="Favorite this Q&A">
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
    
    // 已移除收藏状态检查逻辑
  }
  
  // 滚动到指定问题
  function scrollToQuestion(messageId, index, retryIfNotFound) {
    if (typeof retryIfNotFound === 'undefined') {
      retryIfNotFound = true;
    }
    
    let targetElement = document.querySelector(`article[data-turn-id="${messageId}"]`);
    
    if (!targetElement) {
      const selectors = [
        `[data-message-id="${messageId}"]`,
        `[id*="${messageId}"]`
      ];
      for (const selector of selectors) {
        targetElement = document.querySelector(selector);
        if (targetElement) break;
      }
    }
    
    if (!targetElement && typeof index === 'number' && index >= 0) {
      const articles = document.querySelectorAll('article');
      if (index < articles.length) {
        targetElement = articles[index];
      }
    }
    
    if (!targetElement) {
      const question = currentQuestions.find(q => q.messageId === messageId);
      if (question && question.text) {
        const snippet = question.text.substring(0, 80);
        const candidates = document.querySelectorAll('article p, article div, article span');
        for (const el of candidates) {
          const text = el.textContent || '';
          if (text.includes(snippet)) {
            targetElement = el.closest('article') || el;
            break;
          }
        }
      }
    }
    
    if (targetElement) {
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
      targetElement.style.transition = 'background-color 0.3s ease';
      targetElement.style.backgroundColor = '#eff6ff';
      setTimeout(() => {
        targetElement.style.backgroundColor = '';
      }, 2000);
    } else if (retryIfNotFound) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        scrollToQuestion(messageId, index, false);
      }, 1200);
    } else {
      console.log('未找到目标元素');
    }
  }
  
  // 显示空状态
  function showEmptyState(message) {
    const container = sidebar.querySelector('.questions-container');
    container.innerHTML = `
      <div class="empty-state">
        <i class="empty-state-icon iconfont icon-empty"></i>
        <p class="empty-state-text">No conversation found. Start a chat in ChatGPT and an outline will appear here.</p>
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
      // 直接添加收藏，允许重复收藏
      const success = await addToFavorites(messageId);
      if (success) {
        btnElement.classList.add('favorited');
        showToast('Saved! View it now', 'success', true);
        console.log('已添加收藏:', messageId);
      } else {
        showToast('Failed to favorite, please try again', 'error');
      }
    } catch (error) {
      console.error('收藏操作失败:', error);
      showToast('Favorite operation failed', 'error');
    }
  }
  
  async function addToFavorites(messageId) {
    try {
      // 1) 从 sidebar 的 item 找到对应的 data-message-id（已作为入参 messageId）
      const itemEl = sidebar.querySelector(`.question-item[data-message-id="${messageId}"]`);
      const itemIndex = itemEl ? parseInt(itemEl.dataset.index) : null;
      
      // 2) 根据第一步解析的 id，从页面中解析对应的 article 及其下一个 article
      const articles = Array.from(document.querySelectorAll('article'));
      let firstArticle = null;
      if (itemIndex !== null && !Number.isNaN(itemIndex)) {
        firstArticle = articles[itemIndex] || null;
      }
      if (!firstArticle) {
        firstArticle = document.querySelector(`article[data-turn-id="${messageId}"]`);
      }
      if (!firstArticle) {
        throw new Error('未找到第一个 article 元素');
      }
      const firstIdx = articles.indexOf(firstArticle);
      const secondArticle = firstIdx >= 0 ? articles[firstIdx + 1] || null : null;
      if (!secondArticle) {
        throw new Error('未找到第二个 article 元素');
      }
      
      // 3) 从 article 的 data-turn-id 获取到对应的 id
      const firstTurnId = firstArticle.getAttribute('data-turn-id') || messageId;
      let secondTurnId = secondArticle.getAttribute('data-turn-id') || null;
      
      // 读取当前对话数据（messages: [{id, text}]）
      const convId = getCurrentConversationId();
      const conversationData = await readConversationFromIndexedDB(convId);
      if (!conversationData || !conversationData.messages) {
        throw new Error('无法获取对话数据');
      }
      const messages = conversationData.messages;
      
      // 标题：用第一个 article 的 id 对应的 text 作为标题
      let titleMsg = messages.find(m => m.id === firstTurnId);
      if (!titleMsg) {
        const altFirstId = firstArticle.querySelector('[data-message-id]')?.getAttribute('data-message-id')
          || firstArticle.id || null;
        if (altFirstId) {
          titleMsg = messages.find(m => m.id === altFirstId) || titleMsg;
        }
      }
      const title = titleMsg ? (titleMsg.text || '') : '';
      // 日志：如果能从IndexedDB按ID找到标题消息，输出该条及其next
      if (titleMsg) {
        const tIdx = messages.findIndex(m => m.id === firstTurnId);
        const tNext = tIdx >= 0 ? messages[tIdx + 1] : null;
        
        
      }
      if (!title) {
        throw new Error('未找到标题内容');
      }
      
      // 内容：优先用IndexedDB回答；否则按ID定位article，取第一个img；再兜底
      let contentAnswer = '';
      let answerType = 'markdown';
      if (secondTurnId) {
        let answerMsg = messages.find(m => m.id === secondTurnId);
        if (answerMsg && answerMsg.text) {
          // 日志：按ID命中回答，输出该条及其next
          const aIdx = messages.findIndex(m => m.id === secondTurnId);
          const aNext = aIdx >= 0 ? messages[aIdx + 1] : null;
          
          
          // 若文本仅包含辅助标题（如“ChatGPT said:”）或过短，优先尝试从DOM提取图片
          const trimmed = (answerMsg.text || '').trim();
          const looksLikeHeaderOnly = /^chatgpt\s*said:?$/i.test(trimmed) || trimmed.length <= 12;
          if (looksLikeHeaderOnly) {
            const targetArticle = document.querySelector(`article[data-turn-id="${secondTurnId}"]`) || secondArticle;
            const firstImg = targetArticle ? targetArticle.querySelector('img') : null;
            if (firstImg) {
              contentAnswer = `<img src="${firstImg.src}" alt="${escapeHtml(firstImg.alt || '')}">`;
              answerType = 'img';
            } else {
              contentAnswer = trimmed;
              answerType = 'markdown';
            }
          } else {
            contentAnswer = answerMsg.text;
            answerType = 'markdown';
          }
        } else {
          // 尝试使用article内部的其他ID匹配messages
          const altSecondId = secondArticle.querySelector('[data-message-id]')?.getAttribute('data-message-id')
            || secondArticle.id || null;
          if (altSecondId) {
            const altMsg = messages.find(m => m.id === altSecondId);
            if (altMsg && altMsg.text) {
              
              const aIdx2 = messages.findIndex(m => m.id === altSecondId);
              const aNext2 = aIdx2 >= 0 ? messages[aIdx2 + 1] : null;
              
              contentAnswer = altMsg.text;
              answerType = 'markdown';
            }
          }
          if (!contentAnswer) {
            const targetArticle = document.querySelector(`article[data-turn-id="${secondTurnId}"]`) || secondArticle;
            const firstImg = targetArticle ? targetArticle.querySelector('img') : null;
            if (firstImg) {
              contentAnswer = `<img src="${firstImg.src}" alt="${escapeHtml(firstImg.alt || '')}">`;
              answerType = 'img';
            }
          }
        }
      }
      if (!contentAnswer) {
        const firstImg = secondArticle.querySelector('img');
        if (firstImg) {
          contentAnswer = `<img src="${firstImg.src}" alt="${escapeHtml(firstImg.alt || '')}">`;
          answerType = 'img';
        } else {
          contentAnswer = (secondArticle.innerText || secondArticle.textContent || '').trim();
          answerType = 'markdown';
        }
      }
      
      // 创建文章数据，content 改为数组结构
      const contentArray = [{ id: firstTurnId, title: title, answer: contentAnswer, type: answerType }];
      const article = {
        title: title,
        content: contentArray,
        category: 'Uncategorized',
        create_at: new Date().toISOString(),
        messageId: messageId
      };

      // 在用户点击收藏的手势上下文中，尝试保存图片到本地授权文件夹
      const answersForDownload = Array.isArray(article.content)
        ? article.content.filter(e => e.type === 'img').map(e => e.answer).join('\n')
        : '';
      const hasImgInContent = /<img\s+/i.test(answersForDownload) || /!\[[^\]]*\]\([^\)]+\)/.test(answersForDownload);
      try {
        if (hasImgInContent) {
          toggleSavingNotice(true);
        }
        if (window.FileManager) {
          // 若尚未授权，会弹出目录选择窗口；已授权则直接写入
          await window.FileManager.ensureAuthorizedDirectory({ interactive: true });
          // 将内容中的 <img> 下载并写入授权目录，记录到 IndexedDB 的 images store
          const imgSaveResults = await window.FileManager.saveImagesFromHtml(answersForDownload);
          const imagesMeta = (imgSaveResults || []).filter(r => r && r.result && r.result.success && r.result.filename)
            .map(r => ({ originalSrc: r.src, filename: r.result.filename }));

          // 基于保存结果，尝试将内容数组中的图片引用替换为本地占位标识 ck-local://filename
          try {
            const transformHtml = (html) => {
              const wrapper = document.createElement('div');
              wrapper.innerHTML = html;
              const imgs = Array.from(wrapper.querySelectorAll('img'));
              for (const img of imgs) {
                const src = img.getAttribute('src') || '';
                const meta = imagesMeta.find(m => m.originalSrc === src);
                if (meta) {
                  img.setAttribute('data-src', `ck-local://${meta.filename}`);
                  img.setAttribute('data-local-filename', meta.filename);
                }
              }
              return wrapper.innerHTML;
            };
            const transformMarkdown = (text) => {
              let updated = text;
              if (imagesMeta.length > 0) {
                for (const meta of imagesMeta) {
                  const escaped = meta.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const mdRegex = new RegExp(`(!\\[[^\\]]*\\]\\()${escaped}(\\))`, 'g');
                  updated = updated.replace(mdRegex, `$1ck-local://${meta.filename}$2`);
                }
              }
              return updated;
            };
            article.content = article.content.map(entry => {
              if (entry.type !== 'img') return entry; // 仅处理 img 类型条目
              const hasHtmlImg = /<img\s+/i.test(entry.answer);
              const newAnswer = hasHtmlImg ? transformHtml(entry.answer) : transformMarkdown(entry.answer);
              return { ...entry, answer: newAnswer };
            });
          } catch (replaceErr) {
            console.warn('替换文章内容中的图片引用失败，继续保存原内容：', replaceErr);
          }

          // 在文章数据中存储 imagesMeta，便于后续渲染时解析
          article.imagesMeta = imagesMeta;
        } else {
          console.warn('FileManager 未加载，跳过图片保存。');
        }
      } catch (imgErr) {
        console.warn('保存图片到本地失败或被取消：', imgErr);
      } finally {
        toggleSavingNotice(false);
      }
      
      // 保存到文章表
      await saveArticle(article);
      
      
      
      return true;
    } catch (error) {
      console.error('添加收藏失败:', error);
      showToast(error.message || 'Favorite operation failed', 'error');
      return false;
    }
  }
  

  
  // 存储操作现在通过background script处理
  // initFavoriteDB函数已移除，数据存储由background管理
  
  async function saveArticle(article) {
    console.log('开始保存文章:', article.title);
    
    try {
      // 通过chrome.runtime.sendMessage发送数据给background
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'saveArticle',
          data: article
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (response.success) {
        console.log('文章保存成功，ID:', response.data);
        return response.data;
      } else {
        throw new Error(response.error || '保存失败');
      }
    } catch (error) {
      console.error('保存文章失败:', error.message || error);
      console.error('文章数据:', article);
      throw error;
    }
  }
  
  
  
  // checkIfFavorited函数已移除，不再检查收藏状态
  
  // removeFavorite函数已移除，不再支持取消收藏
  
  // Toast 提示功能
  function showToast(message, type = 'success', clickable = false) {
    // 移除已存在的toast
    const existingToast = document.querySelector('.ck-toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    // 创建新的toast
    const toast = document.createElement('div');
    toast.className = `ck-toast ${type === 'error' ? 'error' : ''} ${clickable ? 'clickable' : ''}`;
    toast.textContent = message;
    
    // 如果可点击，添加点击事件
    if (clickable) {
      toast.style.cursor = 'pointer';
      toast.addEventListener('click', () => {
        // 打开options页面
        chrome.runtime.sendMessage({action: 'openOptionsPage'});
        toast.remove();
      });
    }
    
    document.body.appendChild(toast);
    
    // 显示动画
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    // 自动隐藏
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }, 3000);
  }
  
  // showUnfavoritePopover函数已移除，不再需要取消收藏功能
  
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  // 多选模式相关变量
  let isMultiSelectMode = false;
  let selectedItems = new Set();
  
  // 初始化多选模式
  function initMultiSelectMode() {
    const enterMultiSelectBtn = sidebar.querySelector('#enterMultiSelectBtn');
    const batchSaveBtn = sidebar.querySelector('#batchSaveBtn');
    const cancelSelectBtn = sidebar.querySelector('#cancelSelectBtn');
    const selectAllCheckbox = sidebar.querySelector('#selectAllCheckbox');
    
    // 进入多选模式按钮事件
    enterMultiSelectBtn.addEventListener('click', () => {
      enterMultiSelectMode();
    });
    
    // 批量保存
    batchSaveBtn.addEventListener('click', () => {
      batchSaveSelectedItems();
    });
    
    // 取消选择
    cancelSelectBtn.addEventListener('click', () => {
      exitMultiSelectMode();
    });
    
    // 全选checkbox
    selectAllCheckbox.addEventListener('change', () => {
      handleSelectAll();
    });
  }
  
  // 进入多选模式
  function enterMultiSelectMode() {
    isMultiSelectMode = true;
    const multiSelectActions = sidebar.querySelector('#multiSelectActions');
    const enterMultiSelectBtn = sidebar.querySelector('.enter-multi-select-btn');
    const questionItems = sidebar.querySelectorAll('.question-item');
    
    // 隐藏进入多选按钮，显示多选操作按钮
    if (enterMultiSelectBtn) {
      enterMultiSelectBtn.style.display = 'none';
    }
    multiSelectActions.style.display = 'flex';
    
    // 为所有问题项添加多选样式
    questionItems.forEach(item => {
      item.classList.add('multi-select-mode');
      item.addEventListener('click', handleItemSelection);
    });
  }
  
  // 退出多选模式
  function exitMultiSelectMode() {
    isMultiSelectMode = false;
    selectedItems.clear();
    
    const multiSelectActions = sidebar.querySelector('#multiSelectActions');
    const selectAllCheckbox = sidebar.querySelector('#selectAllCheckbox');
    const enterMultiSelectBtn = sidebar.querySelector('.enter-multi-select-btn');
    const questionItems = sidebar.querySelectorAll('.question-item');
    
    // 隐藏多选操作按钮，显示进入多选按钮
    multiSelectActions.style.display = 'none';
    if (enterMultiSelectBtn) {
      enterMultiSelectBtn.style.display = 'inline-block';
    }
    selectAllCheckbox.checked = false;
    
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
    batchSaveBtn.textContent = `Save (${selectedItems.size}) in 1`;
    batchSaveBtn.disabled = selectedItems.size === 0;
    
    // 更新全选checkbox状态
    updateSelectAllCheckbox();
  }
  
  // 处理全选
  function handleSelectAll() {
    const selectAllCheckbox = sidebar.querySelector('#selectAllCheckbox');
    const questionItems = sidebar.querySelectorAll('.question-item.multi-select-mode');
    
    if (selectAllCheckbox.checked) {
      // 全选
      questionItems.forEach(item => {
        const messageId = item.dataset.messageId;
        if (messageId && !selectedItems.has(messageId)) {
          selectedItems.add(messageId);
          item.classList.add('selected');
        }
      });
    } else {
      // 取消全选
      selectedItems.clear();
      questionItems.forEach(item => {
        item.classList.remove('selected');
      });
    }
    
    // 更新批量保存按钮状态
    const batchSaveBtn = sidebar.querySelector('#batchSaveBtn');
    batchSaveBtn.textContent = `Save (${selectedItems.size}) in 1`;
    batchSaveBtn.disabled = selectedItems.size === 0;
  }
  
  // 更新全选checkbox状态
  function updateSelectAllCheckbox() {
    const selectAllCheckbox = sidebar.querySelector('#selectAllCheckbox');
    const questionItems = sidebar.querySelectorAll('.question-item.multi-select-mode');
    const totalItems = questionItems.length;
    
    if (totalItems === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (selectedItems.size === totalItems) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else if (selectedItems.size > 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
  }
  
  // 批量保存选中的项目
  async function batchSaveSelectedItems() {
    if (selectedItems.size === 0) {
      showToast('Please select conversations to save first', 'error');
      return;
    }
    
    try {
      const conversationId = getCurrentConversationId();
      if (!conversationId) {
        showToast('Unable to get current conversation ID', 'error');
        return;
      }
      
      // 从IndexedDB获取对话数据
      const conversationData = await readConversationFromIndexedDB(conversationId);
      if (!conversationData || !conversationData.messages) {
        showToast('Unable to get conversation data', 'error');
        return;
      }
      
      // 1. 点击合并保存时，按 sidebar DOM 中的显示顺序获取被勾选的 data-message-id
      const domOrderIds = Array.from(sidebar.querySelectorAll('.question-item'))
        .map(el => el.getAttribute('data-message-id'))
        .filter(Boolean);
      const selectedMessageIds = domOrderIds.filter(id => selectedItems.has(id));
      
      if (selectedMessageIds.length === 0) {
        showToast('No conversations selected', 'error');
        return;
      }
      
      // 2. 遍历每一个 data-message-id，解析出其对应的 article 及其下一条 article
      const selectedPairs = [];
      const allArticles = Array.from(document.querySelectorAll('article'));
      
      selectedMessageIds.forEach(messageId => {
        const itemEl = sidebar.querySelector(`.question-item[data-message-id="${messageId}"]`);
        const itemIndex = itemEl ? parseInt(itemEl.dataset.index) : null;
        let firstArticle = null;
        if (itemIndex !== null && !Number.isNaN(itemIndex)) {
          firstArticle = allArticles[itemIndex] || null;
        }
        if (!firstArticle) {
          firstArticle = document.querySelector(`article[data-turn-id="${messageId}"]`);
        }
        if (!firstArticle) {
          return; // 跳过未找到的项
        }
        const firstIdx = allArticles.indexOf(firstArticle);
        const secondArticle = firstIdx >= 0 ? allArticles[firstIdx + 1] || null : null;
        if (!secondArticle) {
          return; // 没有第二条则跳过
        }
        
        const firstTurnId = firstArticle.getAttribute('data-turn-id') || messageId;
        let secondTurnId = secondArticle.getAttribute('data-turn-id') || null;
        
        // 问题（标题部分）：用第一个 article 的 id 对应的 text
        let qMsg = conversationData.messages.find(m => m.id === firstTurnId);
        if (!qMsg) {
          const altFirstId = firstArticle.querySelector('[data-message-id]')?.getAttribute('data-message-id')
            || firstArticle.id || null;
          if (altFirstId) {
            qMsg = conversationData.messages.find(m => m.id === altFirstId) || qMsg;
          }
        }
        const questionText = qMsg ? (qMsg.text || '') : '';
        // 日志：如果能从IndexedDB按ID找到问题消息，输出该条及其next
        if (qMsg) {
          const qIdx = conversationData.messages.findIndex(m => m.id === firstTurnId);
          const qNext = qIdx >= 0 ? conversationData.messages[qIdx + 1] : null;
          
        }
        if (!questionText) {
          return; // 标题为空则不加入
        }
        
        // 回答（内容部分）：优先messages按ID；否则按ID定位article取首图；再兜底
        let answerText = '';
        let answerSource = 'unknown';
        if (secondTurnId) {
          let aMsg = conversationData.messages.find(m => m.id === secondTurnId);
          if (!aMsg) {
            const altSecondId = secondArticle.querySelector('[data-message-id]')?.getAttribute('data-message-id')
              || secondArticle.id || null;
            if (altSecondId) {
              aMsg = conversationData.messages.find(m => m.id === altSecondId) || aMsg;
              secondTurnId = altSecondId;
            }
          }
          if (aMsg && aMsg.text) {
            // 日志：按ID命中回答，输出该条及其next
            const aIdx = conversationData.messages.findIndex(m => m.id === secondTurnId);
            const aNext = aIdx >= 0 ? conversationData.messages[aIdx + 1] : null;
            
            const trimmed = (aMsg.text || '').trim();
            const looksLikeHeaderOnly = /^chatgpt\s*said:?$/i.test(trimmed) || trimmed.length <= 12;
            if (looksLikeHeaderOnly) {
              const targetArticle = document.querySelector(`article[data-turn-id="${secondTurnId}"]`) || secondArticle;
              const firstImg = targetArticle ? targetArticle.querySelector('img') : null;
              if (firstImg) {
                answerText = `<img src="${firstImg.src}" alt="${escapeHtml(firstImg.alt || '')}">`;
                answerSource = 'html';
              } else {
                answerText = trimmed;
                answerSource = 'indexeddb';
              }
            } else {
              answerText = aMsg.text;
              answerSource = 'indexeddb';
            }
          } else {
            const targetArticle = document.querySelector(`article[data-turn-id="${secondTurnId}"]`) || secondArticle;
            const firstImg = targetArticle ? targetArticle.querySelector('img') : null;
            if (firstImg) {
              answerText = `<img src="${firstImg.src}" alt="${escapeHtml(firstImg.alt || '')}">`;
              answerSource = 'html';
            }
          }
        }
        if (!answerText) {
          const firstImg = secondArticle.querySelector('img');
          if (firstImg) {
            answerText = `<img src="${firstImg.src}" alt="${escapeHtml(firstImg.alt || '')}">`;
            answerSource = 'html';
          } else {
            answerText = (secondArticle.innerText || secondArticle.textContent || '').trim();
            answerSource = 'html';
          }
        }
        
        // 记录类型：若由图片 DOM 构造则为 img，否则 markdown
        const pairType = /<img\s/i.test(answerText) ? 'img' : 'markdown';
        selectedPairs.push({ id: firstTurnId, questionText, answerText, type: pairType, source: answerSource });
      });
      
      if (selectedPairs.length === 0) {
        showToast('No valid message pairs found', 'error');
        return;
      }
      
      // 3. 构建数组内容并存储为一篇文章
      const title = selectedPairs[0].questionText;
      const contentArray = selectedPairs.map(pair => ({
        id: pair.id,
        title: pair.questionText,
        answer: pair.answerText,
        type: pair.type || (/<img\s/i.test(pair.answerText) ? 'img' : 'markdown')
      }));

      // 在批量保存的用户手势上下文中，逐项保存图片（仅 source=html 的 img 条目），并替换为本地占位标识
      let imagesMeta = [];
      try {
        let didEnsure = false;
        let anyNeedsSave = false;
        const sourceById = new Map(selectedPairs.map(p => [p.id, p.source]));

        const transformHtmlWithMeta = (html, metas) => {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = html;
          const imgs = Array.from(wrapper.querySelectorAll('img'));
          for (const img of imgs) {
            const src = img.getAttribute('src') || '';
            const meta = metas.find(m => m.originalSrc === src);
            if (meta) {
              img.setAttribute('data-src', `ck-local://${meta.filename}`);
              img.setAttribute('data-local-filename', meta.filename);
            }
          }
          return wrapper.innerHTML;
        };
        const transformMarkdownWithMeta = (text, metas) => {
          let updated = text;
          if (metas.length > 0) {
            for (const meta of metas) {
              const escaped = meta.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const mdRegex = new RegExp(`(!\\[[^\\]]*\\]\\()${escaped}(\\))`, 'g');
              updated = updated.replace(mdRegex, `$1ck-local://${meta.filename}$2`);
            }
          }
          return updated;
        };

        for (let i = 0; i < contentArray.length; i++) {
          const entry = contentArray[i];
          const srcType = sourceById.get(entry.id);
          if (entry.type !== 'img') continue;
          if (srcType !== 'html') continue; // 仅处理来自 HTML 解析的内容

          const hasImg = /<img\s+/i.test(entry.answer) || /!\[[^\]]*\]\([^\)]+\)/.test(entry.answer);
          if (!hasImg) continue;
          anyNeedsSave = true;

          if (window.FileManager) {
            if (!didEnsure) {
              await window.FileManager.ensureAuthorizedDirectory({ interactive: true });
              didEnsure = true;
            }
            const imgSaveResults = await window.FileManager.saveImagesFromHtml(entry.answer);
            const perMeta = (imgSaveResults || []).filter(r => r && r.result && r.result.success && r.result.filename)
              .map(r => ({ originalSrc: r.src, filename: r.result.filename }));
            imagesMeta.push(...perMeta);
            const hasHtmlImg = /<img\s+/i.test(entry.answer);
            contentArray[i].answer = hasHtmlImg
              ? transformHtmlWithMeta(entry.answer, perMeta)
              : transformMarkdownWithMeta(entry.answer, perMeta);
          } else {
            console.warn('FileManager 未加载，跳过本地图片保存。');
          }
        }
        if (anyNeedsSave) {
          toggleSavingNotice(true);
        }
      } catch (imgErr) {
        console.warn('逐项保存图片到本地失败或被取消：', imgErr);
      } finally {
        toggleSavingNotice(false);
      }
      
      // 保存到文章表
      await saveArticle({
        title: title,
        content: contentArray,
        category: 'Uncategorized',
        create_at: new Date().toISOString(),
        imagesMeta: imagesMeta,
        source: 'batch'
      });
      
      
      
      showToast('Saved! View it now', 'success', true);
      exitMultiSelectMode();
      
    } catch (error) {
      console.error('批量保存失败:', error);
      showToast('Save failed, please try again', 'error');
    }
  }
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkStatus') {
      sendResponse({status: 'active', questions: currentQuestions.length});
    } else if (request.action === 'reloadData') {
      loadConversationData();
      sendResponse({status: 'reloaded'});
    } else if (request.action === 'setDirectoryHandle') {
      (async () => {
        try {
          if (window.FileManager && request.handle) {
            await window.FileManager.saveDirectoryHandle(request.handle);
            const authorized = await window.FileManager.verifyPermission(request.handle, 'readwrite');
            showToast(authorized ? 'Save folder updated' : 'Save folder updated, permission required here', 'success');
            sendResponse({ ok: true, authorized });
          } else {
            sendResponse({ ok: false, error: 'No handle provided or FileManager missing' });
          }
        } catch (e) {
          console.warn('设置目录句柄失败:', e);
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    }
  });
  
  // 启动插件
  init();
  
})();
