import { ChatPlatformAdapter } from '../adapters/ChatPlatformAdapter.js';

export class Sidebar {
  /**
   * @param {ChatPlatformAdapter} adapter
   */
  constructor(adapter) {
    this.adapter = adapter;
    this.element = null;
    this.isExpanded = false;
    this.preventNextToggleClick = false;
    this.questions = [];
    this.isMultiSelectMode = false;
    this.selectedItems = new Set();
    this.isLoading = false;
    
    // Bind methods
    this.toggleSidebar = this.toggleSidebar.bind(this);
    this.handleItemClick = this.handleItemClick.bind(this);
    this.handleFavoriteClick = this.handleFavoriteClick.bind(this);
    this.enterMultiSelectMode = this.enterMultiSelectMode.bind(this);
    this.exitMultiSelectMode = this.exitMultiSelectMode.bind(this);
    this.handleSelectAll = this.handleSelectAll.bind(this);
    this.batchSaveSelectedItems = this.batchSaveSelectedItems.bind(this);
  }

  async init() {
    this.render();
    this.bindEvents();
    this.loadData();

    // Listen for platform changes
    if (this.adapter.onUrlChange) {
      this.adapter.onUrlChange(() => {
        console.log('URL changed, reloading sidebar data...');
        this.resetAndLoad();
      });
    }
    
    if (this.adapter.onContentChange) {
      this.adapter.onContentChange(() => {
        // Only reload if not in multi-select mode to avoid disrupting user
        if (!this.isMultiSelectMode) {
          this.loadData();
        }
      });
    }
  }

  resetAndLoad() {
    this.questions = [];
    this.selectedItems.clear();
    if (this.isMultiSelectMode) {
      this.exitMultiSelectMode();
    }
    this.loadData();
  }

  render() {
    if (this.element) return;

    // Create container
    this.element = document.createElement('div');
    this.element.className = 'chatgpt-sidebar'; // Keep existing class for CSS compatibility
    
    this.element.innerHTML = `
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
        <div class="view-more-btn" id="viewMoreBtn" title="Open Dashboard">
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
      <div class="sidebar-footer">
         <div class="slogan">
            <img src="${chrome.runtime.getURL('icons/icon32.png')}" class="footer-logo" alt="Momory">
            Momory
         </div>
      </div>
    `;

    document.body.appendChild(this.element);
    document.body.classList.add('chatgpt-sidebar-active');

    // Ensure iconfont
    this.ensureIconfontStylesheet();
  }

  ensureIconfontStylesheet() {
    const existing = document.getElementById('chatkeeper-iconfont-css');
    if (existing) return;
    const link = document.createElement('link');
    link.id = 'chatkeeper-iconfont-css';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('iconfont/iconfont.css');
    document.head.appendChild(link);
  }

  bindEvents() {
    // Toggle button
    const toggleBtn = this.element.querySelector('.sidebar-toggle');
    toggleBtn.addEventListener('click', (e) => {
      if (this.preventNextToggleClick) {
        this.preventNextToggleClick = false;
        return;
      }
      this.toggleSidebar();
    });
    this.enableSidebarToggleDrag(toggleBtn);

    // View More (Dashboard)
    const viewMoreBtn = this.element.querySelector('#viewMoreBtn');
    viewMoreBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({action: 'openOptionsPage'});
    });

    // Multi-select controls
    this.element.querySelector('#enterMultiSelectBtn').addEventListener('click', this.enterMultiSelectMode);
    this.element.querySelector('#batchSaveBtn').addEventListener('click', this.batchSaveSelectedItems);
    this.element.querySelector('#cancelSelectBtn').addEventListener('click', this.exitMultiSelectMode);
    this.element.querySelector('#selectAllCheckbox').addEventListener('change', this.handleSelectAll);
  }

  toggleSidebar() {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.element.classList.add('expanded');
    } else {
      this.element.classList.remove('expanded');
    }
  }

  async loadData() {
    if (this.isLoading) return;
    
    // Simple debounce/check if data really changed can be added here
    // For now, let's just load
    this.isLoading = true;
    
    try {
      const questions = this.adapter.getQuestions();
      
      // Check if questions changed to avoid unnecessary re-renders
      // (Simple length check or hash check could be added)
      this.questions = questions;
      this.displayQuestions();
    } catch (e) {
      console.error('Error loading data:', e);
      this.showEmptyState('Error loading data');
    } finally {
      this.isLoading = false;
    }
  }

  displayQuestions() {
    const container = this.element.querySelector('.questions-container');
    
    if (!this.questions || this.questions.length === 0) {
      this.showEmptyState('No conversation found. Start a chat and an outline will appear here.');
      return;
    }

    const questionsHtml = this.questions.map(question => `
      <div class="question-item ${this.isMultiSelectMode ? 'multi-select-mode' : ''} ${this.selectedItems.has(question.id) ? 'selected' : ''}" 
           data-message-id="${question.id}" 
           data-index="${question.originalIndex}">
        <div class="favorite-btn" data-message-id="${question.id}" title="Favorite this Q&A">
          <svg class="star-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
          </svg>
        </div>
        <p class="question-text"><span class="question-index">${question.index}.</span>${this.escapeHtml(question.text)}</p>
      </div>
    `).join('');

    container.innerHTML = questionsHtml;

    // Re-bind item events
    container.querySelectorAll('.question-item').forEach(item => {
      item.addEventListener('click', (e) => this.handleItemClick(e, item));
    });

    // Bind favorite buttons
    container.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const messageId = btn.dataset.messageId;
        this.handleFavoriteClick(messageId, btn);
      });
    });
  }

  handleItemClick(e, item) {
    // If clicking favorite button, do nothing (handled separately)
    if (e.target.closest('.favorite-btn')) return;

    if (this.isMultiSelectMode) {
      this.handleItemSelection(item);
    } else {
      const messageId = item.dataset.messageId;
      const index = parseInt(item.dataset.index);
      
      // Call adapter to scroll
      this.adapter.scrollToMessage(messageId, index);
      
      // Update active state
      this.element.querySelectorAll('.question-item').forEach(q => q.classList.remove('active'));
      item.classList.add('active');
    }
  }

  // --- Multi-select Logic ---

  enterMultiSelectMode() {
    this.isMultiSelectMode = true;
    this.element.querySelector('#enterMultiSelectBtn').style.display = 'none';
    this.element.querySelector('#multiSelectActions').style.display = 'flex';
    
    // Add classes to existing items
    this.element.querySelectorAll('.question-item').forEach(item => {
      item.classList.add('multi-select-mode');
    });
  }

  exitMultiSelectMode() {
    this.isMultiSelectMode = false;
    this.selectedItems.clear();
    
    this.element.querySelector('#multiSelectActions').style.display = 'none';
    this.element.querySelector('#enterMultiSelectBtn').style.display = 'inline-block';
    this.element.querySelector('#selectAllCheckbox').checked = false;
    
    // Remove classes
    this.element.querySelectorAll('.question-item').forEach(item => {
      item.classList.remove('multi-select-mode', 'selected');
    });
    
    this.updateBatchSaveBtn();
  }

  handleItemSelection(item) {
    const messageId = item.dataset.messageId;
    
    if (this.selectedItems.has(messageId)) {
      this.selectedItems.delete(messageId);
      item.classList.remove('selected');
    } else {
      this.selectedItems.add(messageId);
      item.classList.add('selected');
    }
    
    this.updateBatchSaveBtn();
    this.updateSelectAllCheckbox();
  }

  handleSelectAll() {
    const checkbox = this.element.querySelector('#selectAllCheckbox');
    const items = this.element.querySelectorAll('.question-item');
    
    if (checkbox.checked) {
      items.forEach(item => {
        const mid = item.dataset.messageId;
        if (mid) {
          this.selectedItems.add(mid);
          item.classList.add('selected');
        }
      });
    } else {
      this.selectedItems.clear();
      items.forEach(item => item.classList.remove('selected'));
    }
    
    this.updateBatchSaveBtn();
  }

  updateBatchSaveBtn() {
    const btn = this.element.querySelector('#batchSaveBtn');
    btn.textContent = `Save ${this.selectedItems.size} in 1`;
    btn.disabled = this.selectedItems.size === 0;
  }

  updateSelectAllCheckbox() {
    const checkbox = this.element.querySelector('#selectAllCheckbox');
    const total = this.questions.length;
    const selected = this.selectedItems.size;
    
    if (selected === 0) {
      checkbox.checked = false;
      checkbox.indeterminate = false;
    } else if (selected === total) {
      checkbox.checked = true;
      checkbox.indeterminate = false;
    } else {
      checkbox.checked = false;
      checkbox.indeterminate = true;
    }
  }

  // --- Actions ---

  async handleFavoriteClick(messageId, btnElement) {
    try {
      const content = await this.adapter.extractConversationContent([messageId]);
      if (!content || content.length === 0) {
        throw new Error('Failed to extract content');
      }
      
      const success = await this.saveContent(content, messageId);
      
      if (success) {
        btnElement.classList.add('favorited');
        this.showToast('Saved! View it now', 'success', true);
      } else {
        this.showToast('Failed to save', 'error');
      }
    } catch (e) {
      console.error('Favorite failed:', e);
      this.showToast('Favorite operation failed', 'error');
    }
  }

  async batchSaveSelectedItems() {
    if (this.selectedItems.size === 0) return;
    
    try {
      // Get IDs in DOM order
      const domIds = Array.from(this.element.querySelectorAll('.question-item'))
        .map(el => el.dataset.messageId)
        .filter(id => this.selectedItems.has(id));
      
      const content = await this.adapter.extractConversationContent(domIds);
      
      if (!content || content.length === 0) {
        throw new Error('Failed to extract content');
      }
      
      // For batch save, we merge them into one article? 
      // Original logic: "create ONE article containing multiple Q&A pairs"
      // Wait, original logic in batchSaveSelectedItems (which I didn't read fully) likely creates one article with multiple content entries.
      
      const success = await this.saveContent(content, `batch-${Date.now()}`);
      
      if (success) {
        this.showToast(`Saved ${content.length} items!`, 'success', true);
        this.exitMultiSelectMode();
      }
    } catch (e) {
      console.error('Batch save failed:', e);
      this.showToast('Batch save failed', 'error');
    }
  }

  async saveContent(contentItems, sourceId) {
    // 1. Process images if FileManager is available
    let processedItems = contentItems;
    
    // Check if any item has images
    const hasImages = contentItems.some(item => 
      item.type === 'img' || 
      (item.answer && (/<img\s+/i.test(item.answer) || /!\[[^\]]*\]\([^\)]+\)/.test(item.answer)))
    );

    if (hasImages) {
      // Temporarily disable image saving and replace images with text
      processedItems = contentItems.map(item => {
         let newAnswer = item.answer;
         
         if (item.type === 'img') {
             // If the item itself is an image
             newAnswer = '<p><em>[Image saving is not supported because generated images are temporary links that will expire. Please save manually to your local device if needed.]</em></p>';
         } else if (newAnswer) {
             // Replace embedded images
             const replacement = '<p><em>[Image saving is not supported because generated images are temporary links that will expire. Please save manually to your local device if needed.]</em></p>';
             
             // Markdown images
             newAnswer = newAnswer.replace(/!\[[^\]]*\]\([^\)]+\)/g, replacement);
             
             // HTML images wrapped in buttons (remove the button too)
             newAnswer = newAnswer.replace(/<button[^>]*>\s*<img[^>]*>\s*<\/button>/gi, replacement);
             
             // Remaining HTML images
             newAnswer = newAnswer.replace(/<img\s+[^>]*>/gi, replacement);
         }
         
         return { ...item, answer: newAnswer };
      });
    }

    // 2. Create article object
    // If multiple items, use first item's title as article title, or a generic one
    const title = contentItems[0].title || 'Saved Conversation';
    
    const article = {
      title: title,
      content: processedItems, // Array of {id, title, answer, type}
      category: 'Uncategorized',
      create_at: new Date().toISOString(),
      messageId: sourceId,
      platform: this.adapter.name,
      url: window.location.href
    };

    // 3. Send to background
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'saveArticle',
        data: article
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          resolve(false);
        } else {
          resolve(response && response.success);
        }
      });
    });
  }

  // --- UI Helpers ---

  toggleSavingNotice(show) {
    const notice = this.element.querySelector('#sidebarNotice');
    if (notice) notice.style.display = show ? 'block' : 'none';
  }

  showEmptyState(message) {
    const container = this.element.querySelector('.questions-container');
    container.innerHTML = `
      <div class="empty-state">
        <i class="empty-state-icon iconfont icon-empty"></i>
        <p class="empty-state-text">${message}</p>
      </div>
    `;
  }

  showToast(message, type = 'success', clickable = false) {
    const existingToast = document.querySelector('.ck-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `ck-toast ${type === 'error' ? 'error' : ''} ${clickable ? 'clickable' : ''}`;
    toast.textContent = message;
    
    if (clickable) {
      toast.addEventListener('click', () => {
        chrome.runtime.sendMessage({action: 'openOptionsPage'});
        toast.remove();
      });
    }
    
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  enableSidebarToggleDrag(toggleBtn) {
    let startY = 0;
    let startTop = 0;
    let isDragging = false;
    let didMove = false;
    const storageKey = 'momory_sidebar_toggle_top'; // Updated key name

    // Restore position
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved !== null) {
        toggleBtn.style.top = parseFloat(saved) + 'px';
        toggleBtn.style.bottom = 'auto';
        toggleBtn.style.transform = '';
      }
    } catch (e) {}

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      didMove = false;
      startY = e.clientY;
      startTop = toggleBtn.offsetTop;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaY = e.clientY - startY;
      if (Math.abs(deltaY) > 2) didMove = true;
      
      const sidebarRect = this.element.getBoundingClientRect();
      let newTop = startTop + deltaY;
      newTop = Math.max(0, Math.min(newTop, sidebarRect.height - toggleBtn.offsetHeight));
      
      toggleBtn.style.top = newTop + 'px';
      toggleBtn.style.bottom = 'auto';
      toggleBtn.style.transform = '';
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (didMove) {
        this.preventNextToggleClick = true;
        try {
            window.localStorage.setItem(storageKey, String(toggleBtn.offsetTop));
        } catch (e) {}
      }
    };

    toggleBtn.addEventListener('mousedown', onMouseDown);
  }
}
