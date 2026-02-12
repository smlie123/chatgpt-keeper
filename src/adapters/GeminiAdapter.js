import { ChatPlatformAdapter } from './ChatPlatformAdapter.js';

export class GeminiAdapter extends ChatPlatformAdapter {
  constructor() {
    super();
    this.name = 'gemini';
    this.observer = null;
  }

  static isSupported() {
    return window.location.hostname.includes('gemini.google.com');
  }

  async init() {
    console.log('Gemini Adapter Initialized');
    // Ensure we can find the main container for observation
    this.mainContainer = document.querySelector('main') || document.body;
  }

  getConversationId() {
    // Gemini uses URL params like /app/DOC_ID or just /app
    // We can use the pathname as ID, or generate one if it's just /app
    const path = window.location.pathname;
    if (path === '/app' || path === '/') {
      return 'gemini-session-' + Date.now(); // Fallback for new chats
    }
    return path.replace(/\//g, '-');
  }

  getQuestions() {
    try {
      const queries = document.querySelectorAll('user-query');
      const results = [];
      let indexCounter = 1;

      queries.forEach((queryEl, idx) => {
        // 2. 给每个提问元素添加一个唯一的 data-gemini-anchor 属性以便定位
        let anchorId = queryEl.getAttribute('data-gemini-anchor');
        if (!anchorId) {
            anchorId = `gemini-turn-${idx}-${Date.now()}`;
            queryEl.setAttribute('data-gemini-anchor', anchorId);
        }

        // 2. 提取提问的前 30 个字作为目录项标题
        const textContent = queryEl.textContent || '';
        // Remove "You said" prefix if present
        const cleanText = textContent.replace(/^You said\s*/i, '');
        const title = cleanText.trim().substring(0, 30);

        if (!title) return;

        results.push({
          index: indexCounter++,
          text: title,
          id: anchorId,
          originalIndex: idx,
          element: queryEl
        });
      });

      return results;
    } catch (e) {
      console.error('GeminiAdapter: Failed to extract questions', e);
      return [];
    }
  }

  scrollToMessage(id, index) {
    // 3. 点击目录项时，使用 element.scrollIntoView({ behavior: 'smooth', block: 'center' }) 定位
    const element = document.querySelector(`[data-gemini-anchor="${id}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Optional: Highlight effect
      element.style.transition = 'background-color 0.3s ease';
      const originalBg = element.style.backgroundColor;
      element.style.backgroundColor = 'rgba(239, 246, 255, 0.5)'; // Light blue tint
      setTimeout(() => {
        element.style.backgroundColor = originalBg;
      }, 2000);
    } else {
      console.warn(`GeminiAdapter: Element with anchor ${id} not found`);
    }
  }

  onUrlChange(callback) {
    let currentUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        callback();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  onContentChange(callback) {
    // 4. 使用 MutationObserver 监听 main 区域
    const main = document.querySelector('main') || document.body;
    
    // Debounce function
    let timeout;
    const debouncedCallback = () => {
        clearTimeout(timeout);
        timeout = setTimeout(callback, 1000);
    };

    this.observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // 当检测到新的 <user-query> 插入时
          for (const node of mutation.addedNodes) {
             if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName && node.tagName.toLowerCase() === 'user-query') {
                    shouldUpdate = true;
                    break;
                }
                // Also check if user-query is inside the added node
                if (node.querySelector && node.querySelector('user-query')) {
                    shouldUpdate = true;
                    break;
                }
             }
          }
        }
        if (shouldUpdate) break;
      }

      if (shouldUpdate) {
        debouncedCallback();
      }
    });

    this.observer.observe(main, { childList: true, subtree: true });
  }

  // 3. 提供一个 getData(index) 函数
  // 要求能同时获取对应序号的提问文本和回答区域内的全文（包括隐藏的代码块内容）
  getData(index) {
    const questions = this.getQuestions();
    const questionItem = questions.find(q => q.index === index);
    if (!questionItem) return null;
    return this._getData(questionItem.id);
  }

  _getData(anchorId) {
    const queryEl = document.querySelector(`[data-gemini-anchor="${anchorId}"]`);
    if (!queryEl) return null;

    // Get full question text
    let questionText = (queryEl.textContent || '').trim();
    // Remove "You said" prefix
    questionText = questionText.replace(/^You said\s*/i, '');

    // Find response: 识别提问后紧邻的 <model-response> 作为回答来源
    let responseEl = queryEl.nextElementSibling;
    // Simple check for next sibling, loop if there are spacer elements?
    // User instruction says "紧邻" (immediately following), but usually good to be slightly robust
    while (responseEl && responseEl.tagName.toLowerCase() !== 'model-response') {
        responseEl = responseEl.nextElementSibling;
        // Safety break if we go too far or hit another user-query
        if (!responseEl || (responseEl.tagName && responseEl.tagName.toLowerCase() === 'user-query')) {
            responseEl = null;
            break;
        }
    }

    let answerText = '';
    if (responseEl) {
        // Clone the element to manipulate it without affecting the live DOM
        const clone = responseEl.cloneNode(true);
        
        // Remove unwanted elements: bard-avatar, footer, header, and hidden actions
        const unwantedSelectors = ['bard-avatar', '.response-container-footer', '.response-container-header', 'div.hide-from-message-actions'];
        unwantedSelectors.forEach(selector => {
            const elements = clone.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        });

        // Remove "Gemini said" label if it exists as a standalone element
        const allElements = clone.querySelectorAll('*');
        allElements.forEach(el => {
            // Check for exact match or simple wrapper
            if (el.textContent && el.textContent.trim() === 'Gemini said') {
                el.remove();
            }
        });

        // Use innerHTML to preserve formatting (code blocks, bold, etc.)
        // We will mark this as type: 'html' so the renderer handles it correctly
        answerText = (clone.innerHTML || '').trim(); 
        
        // Final cleanup for "Gemini said" if it was just text not in a removable element
        // (Use a specific regex to avoid removing user content)
        // Matches "Gemini said" at the start of the string, allowing for HTML tags
        answerText = answerText.replace(/^(<[^>]+>)*\s*Gemini said\s*(<\/[^>]+>)*\s*/i, '$1$2'); 
    }

    return {
        question: questionText,
        answer: answerText,
        // Helper to format as 'html' since we are scraping raw DOM
        type: 'html' 
    };
  }

  async extractConversationContent(messageIds) {
    // Map IDs to content using the requested logic
    return messageIds.map(id => {
        const data = this._getData(id);
        if (!data) return null;

        return {
            id: id,
            title: data.question.substring(0, 100), // Full title for save
            answer: data.answer,
            type: data.type,
            originalId: id
        };
    }).filter(Boolean);
  }
}
