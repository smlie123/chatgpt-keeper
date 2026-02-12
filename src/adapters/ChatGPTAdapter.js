import { ChatPlatformAdapter } from './ChatPlatformAdapter.js';

export class ChatGPTAdapter extends ChatPlatformAdapter {
  constructor() {
    super();
    this.name = 'chatgpt';
    this.messageCountCheckInterval = null;
    this.isLoading = false;
    this.lastDataHash = null;
    this.lastMessageCount = 0;
  }

  static isSupported() {
    return window.location.hostname.includes('chatgpt.com') || 
           window.location.hostname.includes('chat.openai.com');
  }

  async init() {
    console.log('ChatGPT Adapter Initialized');
    // Any specific initialization logic
  }

  getConversationId() {
    const url = window.location.href;
    const match = url.match(/\/c\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  getQuestions() {
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
          id: turnId, // Normalized to 'id'
          originalIndex: idx,
          element: article
        });
      });

      return results;
    } catch (e) {
      console.error('Failed to extract questions from DOM:', e);
      return [];
    }
  }

  scrollToMessage(id, index) {
    let targetElement = document.querySelector(`article[data-turn-id="${id}"]`);
    
    if (!targetElement) {
      const selectors = [
        `[data-message-id="${id}"]`,
        `[id*="${id}"]`
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
    
    // Fallback search by text content would go here if we had access to the text
    // For now, let's rely on ID and index
    
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
    } else {
      console.log('Target element not found');
    }
  }

  onUrlChange(callback) {
    let currentUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        console.log('URL changed');
        callback();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  onContentChange(callback) {
    let debounceTimer = null;
    
    // Initial fetch to set the baseline
    const initialQuestions = this.getQuestions();
    this.lastDataHash = JSON.stringify(initialQuestions.map(q => ({id: q.id, text: q.text})));

    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      mutations.forEach((mutation) => {
        // Ignore changes inside our own sidebar
        let target = mutation.target;
        if (target.nodeType === Node.TEXT_NODE) {
            target = target.parentElement;
        }
        if (target && target.closest && target.closest('.chatgpt-sidebar')) {
            return;
        }

        // Only care if nodes are added/removed
        if (mutation.type === 'childList') {
            shouldCheck = true;
        }
      });
      
      if (shouldCheck) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        debounceTimer = setTimeout(() => {
          // Perform deep check
          const currentQuestions = this.getQuestions();
          const currentHash = JSON.stringify(currentQuestions.map(q => ({id: q.id, text: q.text})));
          
          if (currentHash !== this.lastDataHash) {
             console.log('Content effectively changed, reloading sidebar');
             this.lastDataHash = currentHash;
             callback();
          }
        }, 1000);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Helper to read from IndexedDB (copied from content.js)
  readConversationFromIndexedDB(conversationId) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ConversationsDatabase');
      
      request.onerror = () => {
        console.error('Cannot open IndexedDB');
        reject(new Error('Cannot open database'));
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const possibleStoreNames = ['conversations', 'conversation', 'messages'];
        let storeName = null;
        
        for (const name of possibleStoreNames) {
          if (db.objectStoreNames.contains(name)) {
            storeName = name;
            break;
          }
        }
        
        if (!storeName) {
            // Fallback to first store
            if (db.objectStoreNames.length > 0) {
                storeName = db.objectStoreNames[0];
            } else {
                reject(new Error('No object stores found'));
                return;
            }
        }
        
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const getRequest = store.get(conversationId);
        
        getRequest.onsuccess = () => {
          if (getRequest.result) {
            resolve(getRequest.result);
          } else {
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
              const allData = getAllRequest.result;
              const conversation = allData.find(item => 
                item.id === conversationId || 
                (item[conversationId] && item[conversationId].id === conversationId)
              );
              
              if (conversation) {
                const actualData = conversation[conversationId] || conversation;
                resolve(actualData);
              } else {
                resolve(null);
              }
            };
          }
        };
        
        getRequest.onerror = () => reject(new Error('Read failed'));
      };
    });
  }

  async extractConversationContent(messageIds) {
    // Logic to extract content for specific messages
    // This combines logic from addToFavorites and batchSaveSelectedItems
    const results = [];
    const allArticles = Array.from(document.querySelectorAll('article'));
    const conversationId = this.getConversationId();
    
    let conversationData = null;
    try {
        conversationData = await this.readConversationFromIndexedDB(conversationId);
    } catch (e) {
        console.warn('Could not read from IndexedDB', e);
    }
    
    const messages = conversationData ? conversationData.messages : [];

    for (const messageId of messageIds) {
        // Find the article element
        let firstArticle = document.querySelector(`article[data-turn-id="${messageId}"]`);
        
        // If not found by ID, try to find by index if passed or search
        if (!firstArticle) {
            // Try finding by internal message ID if available
             firstArticle = document.querySelector(`[data-message-id="${messageId}"]`)?.closest('article');
        }

        if (!firstArticle) continue;

        const firstIdx = allArticles.indexOf(firstArticle);
        const secondArticle = firstIdx >= 0 ? allArticles[firstIdx + 1] || null : null;
        
        if (!secondArticle) continue;

        const firstTurnId = firstArticle.getAttribute('data-turn-id') || messageId;
        const secondTurnId = secondArticle.getAttribute('data-turn-id');

        // Extract Title
        let title = '';
        const titleMsg = messages.find(m => m.id === firstTurnId);
        if (titleMsg) {
            title = titleMsg.text || '';
        } else {
            // DOM Fallback for title
            const srYou = firstArticle.querySelector('h5.sr-only');
            if (srYou) {
                let nextEl = srYou.nextElementSibling;
                if (!nextEl) {
                     nextEl = srYou.parentElement && srYou.parentElement.nextElementSibling
                        ? srYou.parentElement.nextElementSibling
                        : firstArticle.querySelector('h5.sr-only + *');
                }
                title = nextEl ? (nextEl.innerText || nextEl.textContent || '').trim() : '';
            }
        }

        // Extract Answer
        let contentAnswer = '';
        let answerType = 'markdown';
        
        // Try IndexedDB for answer
        if (secondTurnId) {
            const answerMsg = messages.find(m => m.id === secondTurnId);
            if (answerMsg && answerMsg.text) {
                contentAnswer = answerMsg.text;
                // Check if it's just "ChatGPT said:" or empty, then fallback to DOM image
                 const trimmed = (contentAnswer || '').trim();
                 const looksLikeHeaderOnly = /^chatgpt\s*said:?$/i.test(trimmed) || trimmed.length <= 12;
                 if (looksLikeHeaderOnly) {
                     const firstImg = secondArticle.querySelector('img');
                     if (firstImg) {
                         contentAnswer = `<img src="${firstImg.src}" alt="${firstImg.alt || ''}">`;
                         answerType = 'img';
                     }
                 }
            }
        }

        // DOM Fallback for answer
        if (!contentAnswer) {
            const firstImg = secondArticle.querySelector('img');
            if (firstImg) {
                contentAnswer = `<img src="${firstImg.src}" alt="${firstImg.alt || ''}">`;
                answerType = 'img';
            } else {
                contentAnswer = (secondArticle.innerHTML || '').trim();
                answerType = 'html';
            }
        }

        results.push({
            id: firstTurnId,
            title,
            answer: contentAnswer,
            type: answerType,
            originalId: messageId
        });
    }

    return results;
  }
}
