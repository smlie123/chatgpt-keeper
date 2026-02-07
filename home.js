// Options页面的JavaScript逻辑

(function() {
  'use strict';
  
  let currentSort = 'default';
  let searchQuery = '';
  let articles = [];
  let categories = [];
  // 分页与滚动加载状态
  let pageSize = 20;
  let loadedCount = 0;
  let currentList = [];
  let isLoadingMore = false;
  let hasMore = false;
  
  // 通用存储访问函数 - 使用IndexedDB
  const storage = {
    async get(keys) {
      if (typeof storageAPI === 'undefined') {
        throw new Error('storageAPI is undefined, please ensure storage-api.js is loaded');
      }
      return await storageAPI.get(keys);
    },
    async set(data) {
      if (typeof storageAPI === 'undefined') {
        throw new Error('storageAPI is undefined, please ensure storage-api.js is loaded');
      }
      return await storageAPI.set(data);
    }
  };

  // Chrome Storage 数据库管理
  class CategoryDB {
    constructor() {
      // 使用通用存储接口
    }
    
    async init() {
      // 确保数据结构存在
      const result = await storage.get(['categories', 'articles']);
      
      // 初始化分类数据，如果为空则创建默认分类
      if (!result.categories || result.categories.length === 0) {
        const defaultCategories = [
          
        ];
        await storage.set({ categories: defaultCategories });
        console.log('Default categories created:', defaultCategories.map(c => c.name).join(', '));
      }
      
      if (!result.articles) {
        await storage.set({ articles: [] });
      }
      // favorites表已移除，不再需要初始化
      
      return true;
    }
    
    async addCategory(name) {
      // 获取当前分类列表
      const result = await storage.get(['categories']);
      const categories = result.categories || [];
      
      // 获取当前最大的order值
      const maxOrder = categories.length > 0 
        ? Math.max(...categories.map(cat => cat.order || 0))
        : 0;
      
      // 生成新的ID
      const maxId = categories.length > 0 ? Math.max(...categories.map(cat => cat.id || 0)) : 0;
      
      const category = {
        id: maxId + 1,
        name: name,
        order: maxOrder + 1,
        createAt: new Date().toISOString()
      };
      
      // 添加到列表
      categories.push(category);
      
      // 保存回storage
      await storage.set({ categories });
      
      return category.id;
    }
    
    async getCategories() {
      const result = await storage.get(['categories']);
      const categories = result.categories || [];
      
      // 按order排序
      return categories.sort((a, b) => a.order - b.order);
    }
    
    async updateCategory(id, name) {
      const result = await storage.get(['categories']);
      const categories = result.categories || [];
      
      const categoryIndex = categories.findIndex(cat => cat.id === id);
      if (categoryIndex === -1) {
        throw new Error('Category not found');
      }
      
      categories[categoryIndex].name = name;
      
      await storage.set({ categories });
      
      return id;
    }
    
    async updateCategoryOrder(categoryOrders) {
      const result = await storage.get(['categories']);
      const categories = result.categories || [];
      
      // 更新每个分类的order
      categoryOrders.forEach(({ id, order }) => {
        const categoryIndex = categories.findIndex(cat => cat.id === id);
        if (categoryIndex !== -1) {
          categories[categoryIndex].order = order;
        }
      });
      
      await storage.set({ categories });
    }
    
    async deleteCategory(id) {
      const result = await storage.get(['categories', 'articles']);
      const categories = result.categories || [];
      const articles = result.articles || [];
      
      // 找到要删除的分类名称
      const categoryToDelete = categories.find(cat => cat.id === id);
      if (!categoryToDelete) {
        throw new Error('Category does not exist');
      }
      
      // 将该分类下的所有文章改为"Uncategorized"
      const updatedArticles = articles.map(article => {
        if (article.category === categoryToDelete.name) {
          return { ...article, category: 'Uncategorized' };
        }
        return article;
      });
      
      // 删除分类
      const filteredCategories = categories.filter(cat => cat.id !== id);
      
      // 同时更新分类和文章数据
      await storage.set({ 
        categories: filteredCategories,
        articles: updatedArticles
      });
    }
    
    // 文章相关方法
    async getArticles() {
      const result = await storage.get(['articles']);
      return result.articles || [];
    }
    
    async addArticle(article) {
      const result = await storage.get(['articles']);
      const articles = result.articles || [];
      
      // 生成新的ID
      const maxId = articles.length > 0 ? Math.max(...articles.map(a => a.id || 0)) : 0;
      article.id = maxId + 1;
      
      articles.push(article);
      
      await storage.set({ articles });
      
      return article.id;
    }
    
    async updateArticle(id, updates) {
      const result = await storage.get(['articles']);
      const articles = result.articles || [];
      
      const articleIndex = articles.findIndex(article => article.id === id);
      if (articleIndex === -1) {
        throw new Error('Article not found');
      }
      
      // 更新文章字段
      Object.assign(articles[articleIndex], updates);
      
      await storage.set({ articles });
      
      return id;
    }
    
    async deleteArticle(id) {
      const result = await storage.get(['articles']);
      const articles = result.articles || [];
      
      const filteredArticles = articles.filter(article => article.id !== id);
      
      await storage.set({ articles: filteredArticles });
    }
  }
  
  const categoryDB = new CategoryDB();
  
  // 初始化页面
  async function init() {
    console.log('Options page loaded');
    
    try {
      // 初始化数据库
      await categoryDB.init();
      
      // 执行数据迁移（从chrome.storage.local到IndexedDB）
      const migrationResult = await storageAPI.migrateFromChromeStorage();
      if (migrationResult.migrated) {
        console.log('Data migration successful:', migrationResult.message);
      } else if (migrationResult.reason) {
        console.log('Data migration skipped:', migrationResult.reason);
      } else {
        console.warn('Data migration failed:', migrationResult.error);
      }
      
      // 加载分类数据
      await loadCategories();
      
      // 加载文章数据
      await loadArticles();
      
      // 绑定事件监听器
      bindEventListeners();
      
      initLocalDataWarning();
      
      // 初始化空状态显示
      const emptyState = document.querySelector('#emptyState');
      if (emptyState) {
        emptyState.style.display = 'none';
      }
      
      // 渲染卡片
      setupInfiniteScroll();
      renderCards();
    } catch (error) {
      console.error('Initialization failed:', error);
    }
  }

  function renderUserProfile() {
    const nameEl = document.querySelector('.user-name');
    if (nameEl) {
      nameEl.textContent = 'Local Mode';
      nameEl.style.display = 'block';
    }
  }

  function initLocalDataWarning() {
    try {
      if (typeof localStorage === 'undefined') return;
      const key = 'localDataWarningDismissed';
      if (localStorage.getItem(key) === '1') return;
      const banner = document.getElementById('localDataWarning');
      if (!banner) return;
      banner.style.display = 'flex';
      const closeBtn = banner.querySelector('.local-data-warning-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          banner.style.display = 'none';
          try {
            localStorage.setItem(key, '1');
          } catch (_) {}
        });
      }
    } catch (_) {}
  }

  
  // 绑定事件监听器
  function bindEventListeners() {
    // 搜索框事件
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', handleSearch);
    }
    
    // 视图切换按钮事件已移除，只保留卡片视图
    
    // 排序按钮事件
    const sortBtn = document.querySelector('#sortBtn');
    const sortMenu = document.querySelector('#sortMenu');
    
    if (sortBtn && sortMenu) {
      sortBtn.addEventListener('click', toggleSortMenu);
      
      // 排序选项事件
      const sortOptions = sortMenu.querySelectorAll('.sort-option');
      sortOptions.forEach(option => {
        option.addEventListener('click', (e) => handleSortChange(e));
      });
    }

    // 布局切换按钮事件：瀑布流 <-> 等高卡片
    const layoutToggleBtn = document.getElementById('layoutToggleBtn');
    if (layoutToggleBtn) {
      const mc = document.getElementById('masonryContainer');
      const iconEl = layoutToggleBtn.querySelector('.iconfont');

      // 初始化：读取本地持久化布局模式
      const savedLayout = (typeof localStorage !== 'undefined') ? localStorage.getItem('layoutMode') : null;
      const isEqualInit = savedLayout === 'equal';
      if (mc && isEqualInit) {
        mc.classList.add('equal-height');
      }
      if (iconEl) {
        iconEl.classList.remove('icon-View_waterfall', 'icon-grid');
        iconEl.classList.add(isEqualInit ? 'icon-grid' : 'icon-View_waterfall');
      }

      // 点击切换并保存到本地
      layoutToggleBtn.addEventListener('click', () => {
        if (!mc) return;
        const isEqual = mc.classList.toggle('equal-height');
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('layoutMode', isEqual ? 'equal' : 'waterfall');
        }
        if (iconEl) {
          iconEl.classList.remove('icon-View_waterfall', 'icon-grid');
          iconEl.classList.add(isEqual ? 'icon-grid' : 'icon-View_waterfall');
        }
      });
    }
    
    // 导航项事件
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => handleNavClick(e));
    });
    
    // 分类管理弹窗事件
    const categorySettingsBtn = document.getElementById('categorySettingsBtn');
    const categoryModal = document.getElementById('categoryModal');
    const modalClose = document.getElementById('modalClose');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    const categoryNameInput = document.getElementById('categoryNameInput');
    
    if (categorySettingsBtn) {
      categorySettingsBtn.addEventListener('click', openCategoryModal);
    }
    
    if (modalClose) {
      modalClose.addEventListener('click', closeCategoryModal);
    }
    
    if (categoryModal) {
      categoryModal.addEventListener('click', (e) => {
        if (e.target === categoryModal) {
          closeCategoryModal();
        }
      });
    }
    
    if (addCategoryBtn) {
      addCategoryBtn.addEventListener('click', addCategory);
    }
    
    if (categoryNameInput) {
      categoryNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addCategory();
        }
      });
    }
    
    // 用户菜单事件
    const userProfile = document.getElementById('userProfile');
    const userMenu = document.getElementById('userMenu');
    
    if (userProfile && userMenu) {
      userProfile.addEventListener('click', (e) => {
        toggleUserMenu(e);
      });
      
      // 为整个 userProfile 添加 hover 事件，这样未登录时也能触发
      userProfile.addEventListener('mouseenter', () => {
        userProfile.classList.add('active');
        userMenu.classList.add('show');
      });
      
      const userInfo = userProfile.querySelector('.user-info');
      if (userInfo) {
        userInfo.addEventListener('mouseenter', () => {
          const loginBtnNow = document.getElementById('userInfoLoginBtn');
          if (loginBtnNow && loginBtnNow.style.display !== 'none') return;
          userProfile.classList.add('active');
          userMenu.classList.add('show');
        });
      }
      userMenu.addEventListener('mouseleave', () => {
        userProfile.classList.remove('active');
        userMenu.classList.remove('show');
      });
    }

    // 设置菜单项与弹窗交互
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const chooseDirBtn = document.getElementById('chooseDirBtn');
    const settingsModalClose = document.getElementById('settingsModalClose');
    const settingsStatus = document.getElementById('settingsStatus');

    async function refreshSettingsStatus() {
      try {
        if (!window.FileManager) {
          settingsStatus.textContent = 'Current status: FileManager not loaded';
          return;
        }
        const auth = await window.FileManager.getAuthorizationStatus();
        const handle = await window.FileManager.getSavedDirectoryHandle();
        const name = handle && handle.name ? handle.name : 'None';
        const grantedText = auth.granted ? 'Authorized' : 'Not authorized';
        settingsStatus.textContent = `Current folder: ${name} | Permission: ${grantedText}`;
      } catch (e) {
        settingsStatus.textContent = 'Current status: Error reading status';
        console.warn('refreshSettingsStatus error:', e);
      }
    }

    function openSettingsModal() {
      if (settingsModal) {
        settingsModal.style.display = 'block';
        refreshSettingsStatus();
      }
    }

    function closeSettingsModal() {
      if (settingsModal) {
        settingsModal.style.display = 'none';
      }
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', openSettingsModal);
    }
    if (settingsModalClose) {
      settingsModalClose.addEventListener('click', closeSettingsModal);
    }
    if (settingsModal) {
      // 点击遮罩关闭弹窗
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
          closeSettingsModal();
        }
      });
    }
    if (chooseDirBtn) {
      chooseDirBtn.addEventListener('click', async () => {
        try {
          if (!window.FileManager) {
            alert('FileManager not loaded');
            return;
          }
          const dir = await window.FileManager.selectDirectory();
          if (dir) {
            alert('Folder selected: ' + (dir.name || '')); 
            // 广播到所有页面，使内容脚本更新目录句柄
            chrome.runtime.sendMessage({ action: 'broadcastDirectoryHandle', handle: dir }, (res) => {
              console.log('Broadcast result:', res);
            });
          }
        } catch (e) {
          console.warn('chooseDir error:', e);
        } finally {
          refreshSettingsStatus();
        }
      });
    }
    
    // 抽屉弹窗事件
    const drawerClose = document.getElementById('drawerClose');
    const drawerOverlay = document.getElementById('drawerOverlay');
    
    if (drawerClose) {
      drawerClose.addEventListener('click', closeArticleDrawer);
    }
    
    if (drawerOverlay) {
      drawerOverlay.addEventListener('click', closeArticleDrawer);
    }
    
    // 点击外部关闭菜单
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sort-dropdown')) {
        closeSortMenu();
      }
      if (!e.target.closest('.sidebar-footer')) {
        closeUserMenu();
      }
    });
    
    // 分类选择弹窗事件
    const categorySelectModal = document.getElementById('categorySelectModal');
    const categorySelectClose = document.getElementById('categorySelectClose');
    const categorySelectCancel = document.getElementById('categorySelectCancel');
    const categorySelectConfirm = document.getElementById('categorySelectConfirm');
    
    if (categorySelectClose) {
      categorySelectClose.addEventListener('click', closeCategorySelectModal);
    }
    
    if (categorySelectCancel) {
      categorySelectCancel.addEventListener('click', closeCategorySelectModal);
    }
    
    if (categorySelectConfirm) {
      categorySelectConfirm.addEventListener('click', confirmCategorySelect);
    }
    
    if (categorySelectModal) {
      categorySelectModal.addEventListener('click', (e) => {
        if (e.target === categorySelectModal) {
          closeCategorySelectModal();
        }
      });
    }
    
    // 关于我们弹窗事件
    const aboutUsBtn = document.getElementById('aboutUsBtn');
    const aboutUsModal = document.getElementById('aboutUsModal');
    const aboutUsClose = document.getElementById('aboutUsClose');
    
    if (aboutUsBtn) {
      aboutUsBtn.addEventListener('click', () => {
        aboutUsModal.style.display = 'flex';
      });
    }
    
    if (aboutUsClose) {
      aboutUsClose.addEventListener('click', () => {
        aboutUsModal.style.display = 'none';
      });
    }
    
    if (aboutUsModal) {
      aboutUsModal.addEventListener('click', (e) => {
        if (e.target === aboutUsModal) {
          aboutUsModal.style.display = 'none';
        }
      });
    }
    
    // 联系我们弹窗事件
    const contactUsBtn = document.getElementById('contactUsBtn');
    const contactUsModal = document.getElementById('contactUsModal');
    const contactUsClose = document.getElementById('contactUsClose');
    
    if (contactUsBtn) {
      contactUsBtn.addEventListener('click', () => {
        contactUsModal.style.display = 'flex';
      });
    }
    
    if (contactUsClose) {
      contactUsClose.addEventListener('click', () => {
        contactUsModal.style.display = 'none';
      });
    }
    
    if (contactUsModal) {
      contactUsModal.addEventListener('click', (e) => {
        if (e.target === contactUsModal) {
          contactUsModal.style.display = 'none';
        }
      });
    }
    
    // 数据导出和恢复事件
    const exportDataBtn = document.getElementById('exportDataBtn');
    const importDataBtn = document.getElementById('importDataBtn');
    const exportHistoryBtn = document.getElementById('exportHistoryBtn');
    
    if (exportDataBtn) {
      exportDataBtn.addEventListener('click', () => openExportConfirmModal(() => exportData()));
    }
    
    if (importDataBtn) {
      importDataBtn.addEventListener('click', () => openImportConfirmModal(() => importData()));
    }
    
    if (exportHistoryBtn) {
      exportHistoryBtn.addEventListener('click', openExportHistoryModal);
    }
    
    // ESC键关闭抽屉和弹窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const drawer = document.getElementById('articleDrawer');
        if (drawer && drawer.classList.contains('active')) {
          closeArticleDrawer();
        }
        
        const categoryModal = document.getElementById('categorySelectModal');
        if (categoryModal && categoryModal.style.display === 'block') {
          closeCategorySelectModal();
        }
      }
    });
  }
  
  // 处理搜索
  function handleSearch(e) {
    searchQuery = e.target.value.toLowerCase().trim();
    renderCards();
  }
  
  // 切换排序菜单
  function toggleSortMenu() {
    const sortMenu = document.querySelector('#sortMenu');
    sortMenu.classList.toggle('show');
  }
  
  // 关闭排序菜单
  function closeSortMenu() {
    const sortMenu = document.querySelector('#sortMenu');
    sortMenu.classList.remove('show');
  }
  
  // 切换用户菜单
  function toggleUserMenu() {
    const userProfile = document.getElementById('userProfile');
    const userMenu = document.getElementById('userMenu');
    
    if (userProfile && userMenu) {
      const isActive = userProfile.classList.contains('active');
      
      if (isActive) {
        userProfile.classList.remove('active');
        userMenu.classList.remove('show');
      } else {
        userProfile.classList.add('active');
        userMenu.classList.add('show');
      }
    }
  }
  
  // 关闭用户菜单
  function closeUserMenu() {
    const userProfile = document.getElementById('userProfile');
    const userMenu = document.getElementById('userMenu');
    
    if (userProfile && userMenu) {
      userProfile.classList.remove('active');
      userMenu.classList.remove('show');
    }
  }
  
  // 分类选择弹窗相关变量
  let currentEditingArticle = null;
  
  // 打开分类选择弹窗
  function openCategorySelectModal(articleId, currentCategory, type, originalId) {
    // 只处理文章类型
    if (type !== 'article') {
      console.log('当前版本只支持编辑文章分类');
      return;
    }
    
    // 保存当前编辑的文章信息
    currentEditingArticle = {
      articleId,
      currentCategory,
      type,
      originalId
    };
    
    // 显示弹窗
    const modal = document.getElementById('categorySelectModal');
    modal.style.display = 'block';
    
    // 渲染分类列表
    renderCategorySelectList(currentCategory);
  }
  
  // 渲染分类选择列表
  function renderCategorySelectList(currentCategory) {
    const listContainer = document.getElementById('categorySelectList');
    listContainer.innerHTML = '';
    
    // 添加"Uncategorized"选项
    const uncategorizedItem = createCategorySelectItem('Uncategorized', currentCategory === 'Uncategorized');
    listContainer.appendChild(uncategorizedItem);
    
    // 添加其他分类选项
    categories.forEach(category => {
      const item = createCategorySelectItem(category.name, currentCategory === category.name);
      listContainer.appendChild(item);
    });
  }
  
  // 创建分类选择项
  function createCategorySelectItem(categoryName, isSelected) {
    const item = document.createElement('div');
    item.className = `category-select-item ${isSelected ? 'selected' : ''}`;
    
    item.innerHTML = `
      <input type="radio" name="categorySelect" value="${escapeHtml(categoryName)}" ${isSelected ? 'checked' : ''}>
      <label>${escapeHtml(categoryName)}</label>
    `;
    
    // 添加点击事件
    item.addEventListener('click', () => {
      // 取消其他选项的选中状态
      document.querySelectorAll('.category-select-item').forEach(i => i.classList.remove('selected'));
      // 选中当前项
      item.classList.add('selected');
      const radio = item.querySelector('input[type="radio"]');
      radio.checked = true;
    });
    
    return item;
  }
  
  // 关闭分类选择弹窗
  function closeCategorySelectModal() {
    const modal = document.getElementById('categorySelectModal');
    modal.style.display = 'none';
    currentEditingArticle = null;
  }
  
  // 确认分类选择
  function confirmCategorySelect() {
    if (!currentEditingArticle) return;
    
    const selectedRadio = document.querySelector('input[name="categorySelect"]:checked');
    if (!selectedRadio) {
      alert('请选择一个分类');
      return;
    }
    
    const newCategory = selectedRadio.value;
    const { originalId, currentCategory } = currentEditingArticle;
    
    if (newCategory !== currentCategory) {
      // 更新文章的分类
      const article = articles.find(art => art.id === originalId);
      if (article) {
        article.category = newCategory;
        // 更新数据库
        categoryDB.updateArticle(originalId, { category: newCategory })
          .then(async () => {
            console.log(`已将文章"${article.title}"的分类更改为"${newCategory}"`);
            // 重新渲染卡片和导航
            renderCards();
            await renderNavCategories();
            // 关闭弹窗
            closeCategorySelectModal();
          })
          .catch(error => {
            console.error('更新分类失败:', error);
            alert('更新分类失败，请重试');
          });
      }
    } else {
      // 分类没有变化，直接关闭弹窗
      closeCategorySelectModal();
    }
  }
  
  // 处理排序变化
  function handleSortChange(e) {
    const sortType = e.target.dataset.sort;
    if (!sortType) return;
    
    // 更新当前排序
    currentSort = sortType;
    
    // 更新UI
    const sortOptions = document.querySelectorAll('.sort-option');
    sortOptions.forEach(option => option.classList.remove('active'));
    e.target.classList.add('active');
    
    // 更新按钮文本
    const sortText = document.querySelector('.sort-text');
    sortText.textContent = e.target.textContent;
    
    // 关闭菜单
    closeSortMenu();
    
    // 重新渲染卡片
    renderCards();
  }
  
  // 处理视图切换
  // handleViewChange函数已移除，只保留卡片视图
  
  // 处理删除卡片（锚定到分类按钮显示 Popconfirm）
  function handleDeleteCard(cardId, type, originalId, anchorElement) {
    showDeletePopover(cardId, type, originalId, anchorElement);
  }
  
  // 显示删除确认popover
  function showDeletePopover(cardId, type, originalId, anchorElement) {
    const confirmText = type === 'article' ? 'Are you sure you want to delete this article?' : 'Are you sure you want to delete this conversation?';

    // 文章删除：在卡片中心展示简洁 Popconfirm
    if (type === 'article') {
      const cardEl = anchorElement.closest('.card');
      if (!cardEl) return;

      const popover = document.createElement('div');
      popover.className = 'card-delete-popover';
      popover.innerHTML = `
        <div class="popover-content">
          <p>${confirmText}</p>
          <div class="popover-actions">
            <button class="popover-btn cancel-btn">Cancel</button>
            <button class="popover-btn confirm-btn">ok</button>
          </div>
        </div>
      `;

      cardEl.appendChild(popover);
      setTimeout(() => popover.classList.add('show'), 10);

      const cancelBtn = popover.querySelector('.cancel-btn');
      cancelBtn.addEventListener('click', () => {
        popover.classList.remove('show');
        setTimeout(() => popover.remove(), 200);
      });

      const confirmBtn = popover.querySelector('.confirm-btn');
      confirmBtn.addEventListener('click', async () => {
        try {
          await categoryDB.deleteArticle(originalId);
          const index = articles.findIndex(article => article.id === originalId);
          if (index !== -1) articles.splice(index, 1);
          renderCards();
          await renderNavCategories();
        } catch (error) {
          console.error('删除失败:', error);
          alert('Failed to delete, please try again');
        }
        popover.classList.remove('show');
        setTimeout(() => popover.remove(), 200);
      });

      const closePopover = (e) => {
        if (!popover.contains(e.target)) {
          popover.classList.remove('show');
          setTimeout(() => popover.remove(), 200);
          document.removeEventListener('click', closePopover);
        }
      };
      setTimeout(() => document.addEventListener('click', closePopover), 100);
      return;
    }

    // 其他类型保留原外部 Popconfirm（如果未来扩展）
    const popover = document.createElement('div');
    popover.className = 'popover delete-popover';
    popover.innerHTML = `
      <div class="popover-content">
        <div class="popover-title">
          <span class="popover-icon">!</span>
          <span class="popover-text">${confirmText}</span>
        </div>
        <div class="popover-actions">
          <button class="popover-btn cancel-btn">Cancel</button>
          <button class="popover-btn confirm-btn">Delete</button>
        </div>
      </div>
    `;

    const rect = anchorElement.getBoundingClientRect();
    popover.style.position = 'fixed';
    document.body.appendChild(popover);
    const popoverRect = popover.getBoundingClientRect();
    const topPosition = rect.top - popoverRect.height - 8;
    const leftPosition = rect.left + rect.width / 2 - popoverRect.width / 2;
    popover.style.top = `${Math.max(8, topPosition)}px`;
    popover.style.left = `${Math.max(8, leftPosition)}px`;
    popover.style.zIndex = '10000';

    setTimeout(() => popover.classList.add('show'), 10);
    
    // 取消按钮事件
    const cancelBtn = popover.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
      popover.classList.remove('show');
      setTimeout(() => {
        if (popover.parentNode) popover.remove();
      }, 200);
    });
    
    // 确认删除按钮事件
    const confirmBtn = popover.querySelector('.confirm-btn');
    confirmBtn.addEventListener('click', async () => {
      try {
        console.log('Current version only supports deleting articles');
      } catch (error) {
        console.error('删除失败:', error);
        alert('Failed to delete, please try again');
      }
      popover.classList.remove('show');
      setTimeout(() => {
        if (popover.parentNode) popover.remove();
      }, 200);
    });
    
    // 点击外部关闭popover
    const closePopover = (e) => {
      if (!popover.contains(e.target) && !anchorElement.contains(e.target)) {
        popover.classList.remove('show');
        setTimeout(() => {
          if (popover.parentNode) popover.remove();
        }, 200);
        document.removeEventListener('click', closePopover);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closePopover);
    }, 100);
  }

  // 分类删除：在分类项中居中显示简洁 Popconfirm（与文章删除一致）
  function showCategoryDeletePopover(id, name, anchorElement) {
    const confirmText = `Are you sure you want to delete category "${name}"? The items under this category will be moved to 'Uncategorized'.`;
    const itemEl = anchorElement.closest('.category-item');
    if (!itemEl) return;

    const popover = document.createElement('div');
    popover.className = 'card-delete-popover';
    popover.innerHTML = `
      <div class="popover-content">
        <p>${confirmText}</p>
        <div class="popover-actions">
          <button class="popover-btn cancel-btn">Cancel</button>
          <button class="popover-btn confirm-btn">ok</button>
        </div>
      </div>
    `;

    itemEl.appendChild(popover);
    setTimeout(() => popover.classList.add('show'), 10);

    const cancelBtn = popover.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
      popover.classList.remove('show');
      setTimeout(() => popover.remove(), 200);
    });

    const confirmBtn = popover.querySelector('.confirm-btn');
    confirmBtn.addEventListener('click', async () => {
      try {
        await categoryDB.deleteCategory(id);
        renderCategoryList();
      } catch (error) {
        console.error('Failed to delete category:', error);
        alert('Failed to delete category');
      }
      popover.classList.remove('show');
      setTimeout(() => popover.remove(), 200);
    });

    const closePopover = (e) => {
      if (!popover.contains(e.target)) {
        popover.classList.remove('show');
        setTimeout(() => popover.remove(), 200);
        document.removeEventListener('click', closePopover);
      }
    };
    setTimeout(() => document.addEventListener('click', closePopover), 100);
  }
  
  // 显示文章详情
  function showArticleDetail(articleId) {
    const article = articles.find(a => a.id === articleId);
    if (article) {
      openArticleDrawer(article);
    }
  }
  
  // 打开文章详情抽屉
  function openArticleDrawer(article) {
    const drawer = document.getElementById('articleDrawer');
    const drawerTitle = document.getElementById('drawerTitle');
    const drawerTitleText = document.getElementById('drawerTitleText');
    const drawerContent = document.getElementById('drawerContent');
    
    // 设置标题为固定的'详细内容'
    drawerTitle.textContent = 'Details';
    
    // 设置文章标题作为meta信息
    let title = article.title || 'Untitled';
    if (drawerTitleText) {
      // 将title中的<img>标签以字符串形式呈现，其它逻辑不变
      drawerTitleText.innerHTML = renderTitleWithImgAsString(title);
    }
    
    // 处理内容：支持数组结构；否则按旧字符串渲染
    let content = article.content;
    
    // 去掉内容开头的重复标题
    if (!Array.isArray(content)) {
      content = content || '';
      if (title && title !== 'Untitled') {
        const lines = content.split('\n');
        if (lines.length > 0 && lines[0].trim() === title.trim()) {
          lines.shift();
          if (lines.length > 0 && lines[0].trim() === '') {
            lines.shift();
          }
          content = lines.join('\n');
        }
      }
    }
    
    // 使用markdown-it库将markdown转换为HTML
    if (typeof markdownit !== 'undefined') {
      try {
        // 初始化markdown-it并添加所有插件（两套实例）
        const mdHtml = markdownit({
          html: true,
          linkify: true,
          typographer: true
        });
        const mdNoImg = markdownit({
          html: false, // 禁用内联HTML，确保 <img> 不被渲染
          linkify: true,
          typographer: true
        });
        
        // 添加任务列表、KaTeX、emoji 插件到两套实例
        if (typeof markdownitTaskLists !== 'undefined') {
          mdHtml.use(markdownitTaskLists, { enabled: true });
          mdNoImg.use(markdownitTaskLists, { enabled: true });
        }
        if (typeof markdownitKatex !== 'undefined') {
          mdHtml.use(markdownitKatex, { throwOnError: false, errorColor: '#cc0000' });
          mdNoImg.use(markdownitKatex, { throwOnError: false, errorColor: '#cc0000' });
        }
        if (typeof markdownitEmoji !== 'undefined') {
          mdHtml.use(markdownitEmoji);
          mdNoImg.use(markdownitEmoji);
        }
        
        // 禁用 markdown 图片渲染（如 ![alt](url)），输出占位文本
        mdNoImg.renderer.rules.image = function () {
          return '<span class="md-image-disabled">[image]</span>';
        };
        
        if (Array.isArray(article.content)) {
          // 渲染数组结构：每条记录一个问题块 + 回答内容（按 type 分流）
          const sanitizeLocalImages = (html) => {
            try {
              return html
                // 将 <img src="ck-local://..."> 改为 data-src="ck-local://..." 避免未知协议请求
                .replace(/(<img\b[^>]*?)src="ck-local:\/\/([^"]+)"([^>]*>)/gi, (m, pre, fname, post) => {
                  const withoutSrc = pre.replace(/\s*src="[^"]*"/i, '');
                  const hasDataSrc = /data-src=/i.test(withoutSrc + post);
                  const injected = hasDataSrc ? (withoutSrc + post) : (withoutSrc + ` data-src="ck-local://${fname}"` + post);
                  return injected;
                })
                .replace(/(<img\b[^>]*?)src="ck-local:\/\/([^"]+)"/gi, (m, pre, fname) => {
                  const withoutSrc = pre.replace(/\s*src="[^"]*"/i, '');
                  const hasDataSrc = /data-src=/i.test(pre);
                  return hasDataSrc ? withoutSrc : `${withoutSrc} data-src="ck-local://${fname}"`;
                });
            } catch(e){
              return html;
            }
          };
          const blocks = article.content.map(entry => {
            const qHtml = `<div class="my-question"><p>${escapeHtml(entry.title || '')}</p></div>`;
            const rawHtml = (entry.type === 'img')
              ? mdHtml.render(entry.answer || '')
              : mdNoImg.render(entry.answer || '');
            const aHtml = sanitizeLocalImages(rawHtml);
            return `${qHtml}\n${aHtml}`;
          }).join('\n');
          drawerContent.innerHTML = blocks;
        } else {
          // 兼容旧字符串格式，保留 mytag 渲染
          mdHtml.core.ruler.before('normalize', 'mytag_block', function(state) {
            let src = state.src;
            const regex = /<!--\s*mytag:start\s*-->([\s\S]*?)<!--\s*mytag:end\s*-->/g;
            src = src.replace(regex, function(match, innerContent) {
              const trimmedContent = innerContent.trim();
              return `<div class="my-question"><p>${trimmedContent}</p></div>`;
            });
            state.src = src;
          });
          const htmlContent = mdHtml.render(content);
          drawerContent.innerHTML = htmlContent;
        }
        
        // 添加GitHub Markdown样式类
        drawerContent.classList.add('markdown-body');
        
        // 检测是否有.my-question元素，如果有则隐藏article-title
        const myQuestions = drawerContent.querySelectorAll('.my-question');
        const articleTitle = drawer.querySelector('.article-title');
        if (myQuestions.length > 0 && articleTitle) {
          articleTitle.style.display = 'none';
        } else if (articleTitle) {
          articleTitle.style.display = 'block';
        }
        
        // 生成目录 - 基于my-question元素
        generateTableOfContents(myQuestions);

        // 尝试将本地图片占位符转换为可显示的 blob URL
        hydrateLocalImages(drawerContent, article).catch(err => console.warn('hydrateLocalImages error:', err));
        

      } catch (error) {
        console.error('Markdown解析错误:', error);
        drawerContent.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
        drawerContent.classList.add('markdown-body');
        
        // 即使解析错误也要检测.my-question元素
        const myQuestions = drawerContent.querySelectorAll('.my-question');
        const articleTitle = drawer.querySelector('.article-title');
        if (myQuestions.length > 0 && articleTitle) {
          articleTitle.style.display = 'none';
        } else if (articleTitle) {
          articleTitle.style.display = 'block';
        }
        
        // 生成目录 - 基于my-question元素
        generateTableOfContents(myQuestions);
      }
    } else {
      // 如果markdown-it库未加载，使用简单的文本显示
      drawerContent.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
      drawerContent.classList.add('markdown-body');
      
      // 检测my-question元素，如果存在则隐藏article-title
       const myQuestions = drawerContent.querySelectorAll('.my-question');
       const articleTitle = drawer.querySelector('.article-title');
       if (myQuestions.length > 0 && articleTitle) {
         articleTitle.style.display = 'none';
       } else if (articleTitle) {
         articleTitle.style.display = 'block';
       }
       
       // 生成目录 - 基于my-question元素
       generateTableOfContents(myQuestions);

       // 尝试将本地图片占位符转换为可显示的 blob URL
       hydrateLocalImages(drawerContent, article).catch(err => console.warn('hydrateLocalImages error:', err));
    }
    
    // 设置meta信息栏的时间
    const metaTime = document.getElementById('metaTime');
    if (metaTime) {
      metaTime.textContent = `saved at：${new Date(article.create_at).toLocaleString('zh-CN')}`;
    }
    
    // 绑定导出按钮事件
    const exportNativePdfBtn = document.getElementById('exportNativePdfBtn');
    const exportMdBtn = document.getElementById('exportMdBtn');
    
    if (exportNativePdfBtn) {
      exportNativePdfBtn.onclick = () => exportToNativePDF(article);
    }
    
    if (exportMdBtn) {
      exportMdBtn.onclick = () => openMarkdownPreview(article);
    }
    
    // 显示抽屉
    drawer.classList.add('active');
  }

  // 记录本次详情页创建的 blob URL，关闭时统一释放
  const createdBlobUrls = new Set();

  async function hydrateLocalImages(container, article) {
    try {
      if (!container) return;
      if (!window.FileManager) return;
      // 若本页面未保存目录句柄或权限未授权，提示用户链接文件夹
      const status = await window.FileManager.getAuthorizationStatus();
      if (!status || !status.hasHandle || !status.granted) {
        ensureDirectoryForImages(container);
      }
      const imgs = Array.from(container.querySelectorAll('img'));
      if (!imgs.length) return;
      const meta = Array.isArray(article.imagesMeta) ? article.imagesMeta : [];

      for (const img of imgs) {
        let src = img.getAttribute('src') || '';
        let dataSrc = img.getAttribute('data-src') || '';
        let filename = null;
        if (/^ck-local:\/\//.test(src)) {
          filename = src.replace(/^ck-local:\/\//, '');
        } else if (/^ck-local:\/\//.test(dataSrc)) {
          filename = dataSrc.replace(/^ck-local:\/\//, '');
        } else if (img.getAttribute('data-local-filename')) {
          filename = img.getAttribute('data-local-filename');
        } else if (meta && meta.length) {
          const m = meta.find(x => x.originalSrc === src);
          if (m) filename = m.filename;
        }
        if (!filename) continue;
        const blobUrl = await window.FileManager.getBlobUrlForFilename(filename);
        if (blobUrl) {
          img.setAttribute('src', blobUrl);
          img.dataset.blobUrl = blobUrl;
          createdBlobUrls.add(blobUrl);
        }
      }
    } catch (e) {
      console.warn('hydrateLocalImages exception:', e);
    }
  }

  // 在详情抽屉顶部插入授权提示，允许用户手动链接保存目录
  function ensureDirectoryForImages(container) {
    try {
      const existing = container.querySelector('#localImageAuthNotice');
      if (existing) return;
      const notice = document.createElement('div');
      notice.id = 'localImageAuthNotice';
      notice.style.padding = '8px 12px';
      notice.style.margin = '8px 0';
      notice.style.background = '#f3f4ff';
      notice.style.color = '#111827';
      notice.style.border = '1px solid #e5e7ff';
      notice.style.borderRadius = '8px';
      notice.style.fontSize = '13px';
      notice.innerHTML = '' +
        '<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">' +
          '<div style="flex:1; font-size:12px; line-height:1.5;">' +
            'To save ChatGPT-generated images, authorize a local folder. Images are stored there and loaded here in your notes. ' +
            'If you do not need image saving now, you can ignore this. You can also change this later in Menu &rarr; Setting.' +
          '</div>' +
          '<div style="display:flex; flex-direction:column; gap:6px; margin-left:8px; white-space:nowrap;">' +
            '<button id="linkLocalImageDirBtn" style="padding:4px 10px; border-radius:999px; border:1px solid #111827; background:#111827; color:#ffffff; font-size:11px; cursor:pointer;">Select Folder</button>' +
            '<button id="closeLocalImageAuthNotice" style="padding:2px 6px; border-radius:999px; border:none; background:transparent; color:#6b7280; font-size:11px; cursor:pointer;"><i class="iconfont icon-close-circle"></i></button>' +
          '</div>' +
        '</div>';
      const header = container.querySelector('.article-header') || container.firstElementChild;
      (header ? header.parentNode : container).insertBefore(notice, header ? header.nextSibling : container.firstChild);
      const btn = notice.querySelector('#linkLocalImageDirBtn');
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const dir = await window.FileManager.selectDirectory();
          if (dir) {
            // 重新水合图片
            await hydrateLocalImages(container, window.currentArticle || {});
            notice.remove();
          }
        } catch (err) {
          console.warn('selectDirectory failed', err);
        }
      }, { once: true });
      const closeBtn = notice.querySelector('#closeLocalImageAuthNotice');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          notice.remove();
        });
      }
    } catch (e) {
      console.warn('ensureDirectoryForImages error:', e);
    }
  }
  
  // 生成目录函数
  function generateTableOfContents(myQuestions) {
    const tocContainer = document.getElementById('tableOfContents');
    const tocList = document.getElementById('tocList');
    
    if (!tocContainer || !tocList) return;
    
    // 清空现有目录
    tocList.innerHTML = '';
    
    // 如果问题数量大于1，显示目录
    if (myQuestions.length > 1) {
      tocContainer.style.display = 'block';
      
      myQuestions.forEach((question, index) => {
        // 为问题元素添加id，用于锚点跳转
        const id = `question-${index}`;
        question.id = id;
        
        // 获取问题文本内容
        const questionText = question.querySelector('p') ? question.querySelector('p').textContent : question.textContent;
        
        // 创建目录项
        const tocItem = document.createElement('div');
        tocItem.className = 'toc-item';
        
        const tocLink = document.createElement('a');
        tocLink.className = 'toc-link';
        tocLink.textContent = `${index + 1}. ${questionText}`;
        tocLink.href = `#${id}`;
        
        // 点击目录项滚动到对应位置
        tocLink.addEventListener('click', (e) => {
          e.preventDefault();
          question.scrollIntoView({ behavior: 'smooth', block: 'start' });
          
          // 更新活跃状态
          document.querySelectorAll('.toc-link').forEach(link => {
            link.classList.remove('active');
          });
          tocLink.classList.add('active');
        });
        
        tocItem.appendChild(tocLink);
        tocList.appendChild(tocItem);
      });
    } else {
      // 如果问题数量不大于1，隐藏目录
      tocContainer.style.display = 'none';
    }
  }
  
  // 关闭文章详情抽屉
  function closeArticleDrawer() {
    const drawer = document.getElementById('articleDrawer');
    drawer.classList.remove('active');

    // 释放本次详情页创建的 blob URL，避免内存泄漏
    try {
      createdBlobUrls.forEach(url => URL.revokeObjectURL(url));
      createdBlobUrls.clear();
    } catch (_) {}
  }
  
  // 处理导航点击
  function handleNavClick(e) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    // 这里可以添加分类筛选逻辑
    renderCards();
  }
  

  
  // 渲染卡片
  function renderCards() {
    const container = document.querySelector('#masonryContainer');
    const emptyState = document.querySelector('#emptyState');
    const endMsg = document.getElementById('listEndMessage');
    if (!container || !emptyState) return;
    
    // 筛选和排序数据
    let filteredConversations = filterConversations();
    filteredConversations = sortConversations(filteredConversations);
    currentList = filteredConversations;
    loadedCount = 0;
    hasMore = currentList.length > 0;
    isLoadingMore = false;
    
    // 清空容器
    container.innerHTML = '';
    if (endMsg) endMsg.style.display = 'none';
    
    if (filteredConversations.length === 0) {
      // 隐藏卡片容器，显示空状态
      container.style.display = 'none';
      showEmptyState();
      return;
    }
    
    // 显示卡片容器，隐藏空状态
    container.style.display = 'block';
    emptyState.style.display = 'none';
    
    // 首次加载一页
    appendNextPage();
  }

  // 追加下一页数据到容器
  function appendNextPage() {
    const container = document.querySelector('#masonryContainer');
    const endMsg = document.getElementById('listEndMessage');
    const emptyState = document.querySelector('#emptyState');
    if (!container) return;

    if (!hasMore) {
      if (endMsg) endMsg.style.display = 'block';
      return;
    }
    if (isLoadingMore) return;
    isLoadingMore = true;

    const start = loadedCount;
    const end = Math.min(start + pageSize, currentList.length);
    if (start >= end) {
      hasMore = false;
      isLoadingMore = false;
      if (endMsg) endMsg.style.display = 'block';
      return;
    }

    const colCount = getMasonryColumnCount(container);
    const fragments = Array.from({ length: colCount }, () => document.createDocumentFragment());
    for (let i = start; i < end; i++) {
      const conversation = currentList[i];
      const card = createCard(conversation);
      fragments[(i - start) % colCount].appendChild(card);
    }
    fragments.forEach(f => container.appendChild(f));

    loadedCount = end;
    isLoadingMore = false;
    if (emptyState) emptyState.style.display = 'none';
    if (loadedCount >= currentList.length) {
      hasMore = false;
      if (endMsg) endMsg.style.display = 'block';
    }
  }

  // 监听滚动到底部，加载下一页
  function setupInfiniteScroll() {
    // Options 页面主体滚动发生在 .content-area 上，而不是 window
    const scrollContainer = document.querySelector('.content-area');

    const computeNearBottom = () => {
      if (scrollContainer) {
        const total = scrollContainer.scrollHeight;
        const viewportBottom = scrollContainer.scrollTop + scrollContainer.clientHeight;
        return viewportBottom >= total - 100;
      }
      // 兜底：若未找到容器，则使用 window 计算
      const scrollElement = document.documentElement;
      const total = Math.max(
        scrollElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      const viewportBottom = window.innerHeight + window.scrollY;
      return viewportBottom >= total - 100;
    };

    const onScroll = () => {
      const nearBottom = computeNearBottom();
      if (nearBottom && hasMore && !isLoadingMore) {
        appendNextPage();
      }
    };

    const target = scrollContainer || window;
    target.addEventListener('scroll', onScroll, { passive: true });
    // 初始触发一次，避免内容过少时需要额外滚动才加载
    setTimeout(onScroll, 0);
  }

  // 获取当前瀑布流列数，用于分配卡片以实现顶部分布
  function getMasonryColumnCount(container) {
    try {
      const cs = window.getComputedStyle(container);
      const count = parseInt(cs.columnCount, 10);
      if (!isNaN(count) && count > 0) return count;
    } catch (e) {}
    const w = window.innerWidth;
    if (w <= 600) return 1;
    if (w <= 1000) return 2;
    if (w <= 1400) return 3;
    return 4;
  }
  
  // 加载文章数据
  async function loadArticles() {
    try {
      articles = await categoryDB.getArticles();
      console.log('Article data loaded:', articles.length);
    } catch (error) {
      console.error('Failed to load articles:', error);
      articles = [];
    }
  }
  
  // 筛选文章数据
  function filterConversations() {
    // 只使用真实的文章数据
    const allItems = articles.map(article => ({
      id: `article_${article.id}`,
      title: article.title,
      description: (() => {
        if (Array.isArray(article.content)) {
          const firstAnswer = (article.content[0] && article.content[0].answer) ? article.content[0].answer : '';
          return firstAnswer ? (firstAnswer.substring(0, 100) + '...') : 'No description available';
        }
        if (article.content && typeof article.content === 'string') {
          return article.content.substring(0, 100) + '...';
        }
        return 'No description available';
      })(),
      content: article.content, // 添加完整的content字段用于计算对话数量
      category: article.category || 'Uncategorized',
      date: new Date(article.create_at).toLocaleDateString('zh-CN'),
      create_at: article.create_at, // 保留原始时间戳用于排序
      messageCount: 0,
      type: 'article',
      originalId: article.id
    }));
    
    let filtered = [...allItems];
    
    // 搜索筛选
    if (searchQuery) {
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(searchQuery) ||
        item.description.toLowerCase().includes(searchQuery)
      );
    }
    
    // 分类筛选（基于当前激活的导航项）
    const activeNav = document.querySelector('.nav-item.active');
    if (activeNav) {
      const categoryText = activeNav.querySelector('.nav-text').textContent;
      if (categoryText !== 'All') {
        filtered = filtered.filter(item => item.category === categoryText);
      }
    }
    
    return filtered;
  }
  
  // 排序对话
  function sortConversations(conversations) {
    const sorted = [...conversations];
    
    switch (currentSort) {
      case 'random':
        return sorted.sort(() => Math.random() - 0.5);
      case 'date':
      default:
        // 按创建时间倒序排列，最新收藏的排在最前面
        return sorted.sort((a, b) => new Date(b.create_at) - new Date(a.create_at));
    }
  }
  
  // 创建卡片元素
  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    
    // 根据类型显示不同的内容
    const isArticle = item.type === 'article';
    
    // 计算对话数量：新结构用数组长度；旧结构基于 mytag:start 标签
    let dialogCount = 0;
    if (Array.isArray(item.content)) {
      dialogCount = item.content.length;
    } else {
      dialogCount = (item.content || '').split('<!-- mytag:start -->').length - 1;
    }
    const dialogCountDisplay = dialogCount > 0 ? `<span class="dialog-count" title="Contains ${dialogCount} conversations">${dialogCount}</span>` : '';
    const timeText = formatRelativeOrAbsolute(item.create_at);
    
    card.innerHTML = `
      <div class="card-content">
        <div class="card-main">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <p class="card-description">${escapeHtml(item.description)}</p>
        </div>
        <div class="card-meta">
          <span class="card-category">
            <span class="category-name">${item.category}</span>
            
            <svg class="edit-category-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Edit Category">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </span>
          
          ${dialogCountDisplay}
          <button class="delete-btn" title="delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
    
    // 为文章类型添加特殊样式
    if (isArticle) {
      card.classList.add('article-card');
    }
    
    // 添加分类点击事件（同时作为删除 Popconfirm 的锚点）
    const cardCategory = card.querySelector('.card-category');
    cardCategory.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      openCategorySelectModal(item.id, item.category, item.type, item.originalId);
    });
    
    // 添加删除按钮事件（Popconfirm 锚定到删除按钮）
    const deleteBtn = card.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      handleDeleteCard(item.id, item.type, item.originalId, deleteBtn);
    });

    // 添加编辑分类图标事件（保持兼容性）
    const editCategoryIcon = card.querySelector('.edit-category-icon');
    editCategoryIcon.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      openCategorySelectModal(item.id, item.category, item.type, item.originalId);
    });
    
    // 添加卡片主体点击事件
    const cardMain = card.querySelector('.card-main');
    cardMain.addEventListener('click', () => {
      console.log('点击了卡片:', item.title, '类型:', item.type);
      if (isArticle) {
        // 显示文章详情
        showArticleDetail(item.originalId);
      } else {
        // 这里可以添加打开对话详情的逻辑
      }
    });
    
    return card;
  }

  // 小于24小时显示相对时间，否则显示绝对时间
  function formatRelativeOrAbsolute(dateInput) {
    try {
      const d = new Date(dateInput);
      const now = new Date();
      const diffMs = now - d;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);

      if (diffHour < 24) {
        if (diffHour >= 1) return `${diffHour}小时前`;
        if (diffMin >= 1) return `${diffMin}分钟前`;
        return '刚刚';
      }

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${h}:${mi}`;
    } catch (e) {
      return new Date(dateInput).toLocaleString('zh-CN');
    }
  }
  
  // 显示空状态
  function showEmptyState() {
    const emptyState = document.querySelector('#emptyState');
    const emptyTitle = document.querySelector('#emptyTitle');
    const emptyDescription = document.querySelector('#emptyDescription');
    
    if (!emptyState || !emptyTitle || !emptyDescription) return;
    
    // 判断是否有搜索条件
    const hasSearchQuery = searchQuery && searchQuery.trim() !== '';
    
    if (hasSearchQuery) {
      // 搜索结果为空
      emptyTitle.textContent = 'No results found.';
      emptyDescription.textContent = 'Try different keywords.';
    } else {
      // 没有任何卡片
      emptyTitle.textContent = 'Nothing here yet.';
      emptyDescription.textContent = 'Add your first conversation.';
    }
    
    emptyState.style.display = 'flex';
  }
  
  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 仅在标题中将<img>标签渲染成字符串，其它保持默认
  function renderTitleWithImgAsString(text) {
    if (!text) return '';
    // 为安全与明确需求，整个标题进行HTML转义，确保<img>以字符串形式展示
    // 如未来需要保留除<img>外的HTML渲染，可改为仅替换<img>标签：
    // return text.replace(/<img\b[^>]*>/gi, m => escapeHtml(m));
    return escapeHtml(text);
  }
  
  // 分类管理相关函数
  async function loadCategories() {
    try {
      categories = await categoryDB.getCategories();
      await renderNavCategories();
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  }
  
  // 计算分类文章数量
  async function getCategoryArticleCount(categoryName) {
    try {
      const result = await storage.get(['articles']);
      const articles = result.articles || [];
      
      if (categoryName === '全部') {
        return articles.length;
      } else if (categoryName === 'Uncategorized') {
        return articles.filter(article => !article.category || article.category === 'Uncategorized').length;
      } else {
        return articles.filter(article => article.category === categoryName).length;
      }
    } catch (error) {
      console.error('计算分类文章数量失败:', error);
      return 0;
    }
  }
  
  async function renderNavCategories() {
    const navList = document.querySelector('.nav-list');
    if (!navList) return;
    
    // 保留"全部"项并更新其数量
    const allItem = navList.querySelector('.nav-item.active');
    const isAllActive = allItem && allItem.querySelector('.nav-text').textContent === '全部';
    navList.innerHTML = '';
    
    // 重新创建"全部"项
    const allCount = await getCategoryArticleCount('全部');
    const allNavItem = document.createElement('li');
    allNavItem.className = isAllActive ? 'nav-item active' : 'nav-item';
    allNavItem.innerHTML = `
      <span class="nav-text">All</span>
      <span class="nav-count">${allCount}</span>
    `;
    allNavItem.addEventListener('click', (e) => handleNavClick(e));
    navList.appendChild(allNavItem);
    
    // 添加"Uncategorized"项
    const uncategorizedCount = await getCategoryArticleCount('Uncategorized');
    const uncategorizedItem = document.createElement('li');
    uncategorizedItem.className = 'nav-item';
    uncategorizedItem.innerHTML = `
      <span class="nav-text">Uncategorized</span>
      <span class="nav-count">${uncategorizedCount}</span>
    `;
    uncategorizedItem.addEventListener('click', (e) => handleNavClick(e));
    navList.appendChild(uncategorizedItem);
    
    // 添加自定义分类
    for (const category of categories) {
      const categoryCount = await getCategoryArticleCount(category.name);
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.innerHTML = `
        <span class="nav-text">${escapeHtml(category.name)}</span>
        <span class="nav-count">${categoryCount}</span>
      `;
      li.addEventListener('click', (e) => handleNavClick(e));
      navList.appendChild(li);
    }
  }
  
  function openCategoryModal() {
    const modal = document.getElementById('categoryModal');
    if (modal) {
      modal.style.display = 'block';
      renderCategoryList();
    }
  }
  
  function closeCategoryModal() {
    const modal = document.getElementById('categoryModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
  
  async function addCategory() {
    const input = document.getElementById('categoryNameInput');
    const name = input.value.trim();
    
    if (!name) {
      alert('Please enter category name');
      return;
    }
    
    try {
      await categoryDB.addCategory(name);
      input.value = '';
      await loadCategories();
      renderCategoryList();
    } catch (error) {
      console.error('Failed to add category:', error);
      alert('Failed to add category');
    }
  }
  
  async function editCategory(id, currentName) {
    const newName = prompt('Please enter new category name:', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      try {
        await categoryDB.updateCategory(id, newName.trim());
        await loadCategories();
        renderCategoryList();
      } catch (error) {
        console.error('Failed to edit category:', error);
        alert('Failed to edit category');
      }
    }
  }
  
  async function deleteCategory(id, name) {
    if (confirm(`Are you sure you want to delete category "${name}"?`)) {
      try {
        await categoryDB.deleteCategory(id);
        await loadCategories();
        renderCategoryList();
      } catch (error) {
        console.error('Failed to delete category:', error);
        alert('Failed to delete category');
      }
    }
  }
  
  // 拖拽排序相关变量
  let draggedElement = null;
  
  // 拖拽开始
  function handleDragStart(e) {
    draggedElement = e.target;
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
  }
  
  // 拖拽经过
  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
  }
  
  // 放置
  function handleDrop(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    
    if (draggedElement !== e.target && e.target.classList.contains('category-item') && !e.target.classList.contains('default-category')) {
      const draggedId = parseInt(draggedElement.getAttribute('data-id'));
      const targetId = parseInt(e.target.getAttribute('data-id'));
      
      // 重新排序categories数组
      const draggedIndex = categories.findIndex(cat => cat.id === draggedId);
      const targetIndex = categories.findIndex(cat => cat.id === targetId);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const draggedCategory = categories.splice(draggedIndex, 1)[0];
        categories.splice(targetIndex, 0, draggedCategory);
        
        // 更新order字段并保存到数据库
        saveCategoryOrder();
        
        // 重新渲染弹窗中的分类列表
        renderCategoryList();
        // 同步更新页面nav-list的排序，保持全部和Uncategorized在顶部
        renderNavCategories();
      }
    }
    
    return false;
  }
  
  // 保存分类排序到数据库
  async function saveCategoryOrder() {
    try {
      // 为每个分类分配新的order值
      const categoryOrders = categories.map((category, index) => ({
        id: category.id,
        order: index + 1
      }));
      
      // 更新本地数据的order字段
      categories.forEach((category, index) => {
        category.order = index + 1;
      });
      
      // 保存到数据库
      await categoryDB.updateCategoryOrder(categoryOrders);
      console.log('Category order saved to database');
    } catch (error) {
      console.error('Failed to save category order:', error);
      alert('Failed to save category order, please try again');
    }
  }
  
  // 拖拽结束
  function handleDragEnd(e) {
    e.target.style.opacity = '';
    draggedElement = null;
  }
  
  function renderCategoryList() {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) return;
    
    // 保留默认分类项
    const defaultItem = categoryList.querySelector('.default-category');
    categoryList.innerHTML = '';
    if (defaultItem) {
      categoryList.appendChild(defaultItem);
    }
    
    // 渲染自定义分类
    categories.forEach(category => {
      const div = document.createElement('div');
      div.className = 'category-item';
      div.setAttribute('data-id', category.id);
      div.innerHTML = `
        <span class="category-name">${escapeHtml(category.name)}</span>
        <div class="category-actions">
          <button class="edit-btn" title="编辑">
            <i class="iconfont icon-edit-square" style="font-size: 16px;"></i>
          </button>
          <button class="delete-btn" title="删除">
            <i class="iconfont icon-delete" style="font-size: 16px;"></i>
          </button>
        </div>
      `;
      
      // 添加拖拽属性
      div.draggable = true;
      
      // 绑定拖拽事件
      div.addEventListener('dragstart', handleDragStart);
      div.addEventListener('dragover', handleDragOver);
      div.addEventListener('drop', handleDrop);
      div.addEventListener('dragend', handleDragEnd);
      
      // 绑定编辑和删除事件
      const editBtn = div.querySelector('.edit-btn');
      const deleteBtn = div.querySelector('.delete-btn');
      
      editBtn.addEventListener('click', () => editCategory(category.id, category.name));
      deleteBtn.addEventListener('click', () => {
        showCategoryDeletePopover(category.id, category.name, deleteBtn);
      });
      
      categoryList.appendChild(div);
    });
  }
  
  // 页面加载完成后初始化
  
  // 导出原生PDF
  function exportToNativePDF(article) {
    try {
      // 获取文章信息
      const title = article.title || 'Untitled';
      const content = article.content;
      const date = new Date(article.create_at).toLocaleString('zh-CN');
      
      // 构建预览页面URL参数
      const params = new URLSearchParams();
      params.set('title', title);
      params.set('date', date);
      if (Array.isArray(content)) {
        // 以 JSON 形式传递数组内容，供 pdf-preview 按详情抽屉逻辑渲染
        params.set('content', encodeURIComponent(JSON.stringify(content)));
      } else {
        params.set('content', encodeURIComponent(content || ''));
      }
      
      // 计算居中位置
      const width = 800;
      const height = 800;
      const left = (screen.width - width) / 2;
      const top = (screen.height - height) / 2;
      
      // 打开新的预览页面
      const previewUrl = `pdf-preview.html?${params.toString()}`;
      window.open(previewUrl, '_blank', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
      
    } catch (error) {
      console.error('Failed to export native PDF:', error);
      alert('Failed to export native PDF, please try again');
    }
  }

  // 导出Markdown
  function exportToMarkdown(article) {
    try {
      const markdownContent = buildMarkdownContent(article);
      if (!markdownContent) {
        alert('构建 Markdown 失败，请重试');
        return;
      }

      // 创建下载链接
      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      // 生成文件名
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const second = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}${month}${day}${hour}${minute}${second}`;

      const filename = `chatgpt-${timestamp}.md`;

      // 创建下载链接并触发下载
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 清理URL对象
      URL.revokeObjectURL(url);

      console.log('Markdown导出成功');

    } catch (error) {
      console.error('Failed to export Markdown:', error);
      alert('Failed to export Markdown, please try again');
    }
  }

  // 构建 Markdown 文本（供预览 & 导出共用）
  function buildMarkdownContent(article) {
    try {
      const title = article.title || 'Untitled';
      const content = article.content || '';

      let markdownContent = '';
      const buildTitleLine = (t) => `# ${t}\n\n`;
      const buildSectionTitle = (t) => {
        const trimmed = (t || '').trim();
        const withBreaks = trimmed.replace(/\r?\n/g, ' <br> ');
        return `## ${withBreaks}`;
      };
      const renderImgHtmlToMarkdown = (html) => {
        const container = document.createElement('div');
        container.innerHTML = html || '';
        const imgs = container.querySelectorAll('img');
        if (imgs.length === 0) {
          return html || '';
        }
        let md = '';
        imgs.forEach(img => {
          const url = img.getAttribute('data-src') || img.getAttribute('src') || '';
          const alt = img.getAttribute('alt') || '';
          if (url) md += `![${alt}](${url})\n`;
        });
        return md.trim();
      };

      if (Array.isArray(content)) {
        const items = content;
        const hasMultipleConversations = items.length > 1;
        if (!hasMultipleConversations) markdownContent += buildTitleLine(title);
        items.forEach(entry => {
          markdownContent += buildSectionTitle(entry.title || '') + '\n\n';
          if (entry.type === 'img') {
            markdownContent += renderImgHtmlToMarkdown(entry.answer || '') + '\n\n';
          } else {
            markdownContent += (entry.answer || '') + '\n\n';
          }
        });
      } else {
        const textContent = String(content || '');
        const mytagMatches = textContent.match(/<!--\s*mytag:start\s*-->([\s\S]*?)<!--\s*mytag:end\s*-->/g);
        const hasMultipleConversations = Array.isArray(mytagMatches) && mytagMatches.length > 1;

        markdownContent = hasMultipleConversations ? '' : buildTitleLine(title);
        const processedContent = textContent.replace(/<!--\s*mytag:start\s*-->([\s\S]*?)<!--\s*mytag:end\s*-->/g, function(match, innerContent) {
          const trimmedContent = innerContent.trim();
          const withBreaks = trimmedContent.replace(/\r?\n/g, ' <br> ');
          return `## ${withBreaks}`;
        });
        markdownContent += processedContent;
      }

      return markdownContent;
    } catch (error) {
      console.error('构建 Markdown 文本失败:', error);
      return '';
    }
  }

  // 打开 Markdown 预览弹窗，确认后再导出
  function openMarkdownPreview(article) {
    try {
      const overlay = document.getElementById('mdPreviewOverlay');
      const modal = document.getElementById('mdPreviewModal');
      const textarea = document.getElementById('mdPreviewTextarea');
      const closeBtn = document.getElementById('mdPreviewCloseBtn');
      const cancelBtn = document.getElementById('mdPreviewCancelBtn');
      const confirmBtn = document.getElementById('mdPreviewConfirmBtn');

      if (!overlay || !modal || !textarea) return;

      textarea.value = buildMarkdownContent(article);
      // 强制只读（双保险）
      textarea.setAttribute('readonly', 'true');

      overlay.style.display = 'block';
      modal.style.display = 'flex';

      // 拦截复制、选择、上下文菜单与快捷键
      const preventCopy = (e) => { e.preventDefault(); };
      const preventContextMenu = (e) => { e.preventDefault(); };
      const preventKeyCopy = (e) => {
        const k = (e.key || '').toLowerCase();
        if ((e.metaKey || e.ctrlKey) && (k === 'c' || k === 'x' || k === 'a')) {
          e.preventDefault();
        }
      };
      modal.addEventListener('copy', preventCopy);
      modal.addEventListener('contextmenu', preventContextMenu);
      modal.addEventListener('keydown', preventKeyCopy);
      textarea.addEventListener('copy', preventCopy);

      const closeModal = () => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
        // 解绑事件，避免重复绑定导致内存泄漏
        try {
          modal.removeEventListener('copy', preventCopy);
          modal.removeEventListener('contextmenu', preventContextMenu);
          modal.removeEventListener('keydown', preventKeyCopy);
          textarea.removeEventListener('copy', preventCopy);
        } catch (_) {}
      };

      if (closeBtn) closeBtn.onclick = closeModal;
      if (overlay) overlay.onclick = closeModal;
      if (cancelBtn) cancelBtn.onclick = closeModal;
      if (confirmBtn) confirmBtn.onclick = () => {
        closeModal();
        exportToMarkdown(article);
      };
    } catch (e) {
      console.error('打开 Markdown 预览失败:', e);
      exportToMarkdown(article);
    }
  }

  // 监听来自background的消息（仅在扩展环境中）
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'refreshData') {
        // 刷新数据
        refreshData().then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('Failed to refresh data:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true; // 异步响应
      }
    });
  }

  // 刷新数据函数
  async function refreshData() {
    try {
      // 重新加载分类数据
      await loadCategories();
      
      // 重新加载文章数据
      await loadArticles();
      
      // 重新渲染卡片
      renderCards();
      
      console.log('Data refreshed');
    } catch (error) {
      console.error('Failed to refresh data:', error);
      throw error;
    }
  }
  
  function getExportHistory() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem('exportHistory');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function addExportHistoryEntry(entry) {
    try {
      if (typeof localStorage === 'undefined') return;
      const list = getExportHistory();
      list.unshift(entry);
      while (list.length > 50) {
        list.pop();
      }
      localStorage.setItem('exportHistory', JSON.stringify(list));
    } catch (_) {}
  }

  function openExportHistoryModal() {
    const modal = document.getElementById('exportHistoryModal');
    if (!modal) return;
    const listEl = document.getElementById('exportHistoryList');
    const emptyEl = document.getElementById('exportHistoryEmpty');
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = '';
    const history = getExportHistory();

    if (!history.length) {
      emptyEl.style.display = 'block';
      listEl.style.display = 'none';
    } else {
      emptyEl.style.display = 'none';
      listEl.style.display = 'block';
      history.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'export-history-item';

        const ts = item && item.timestamp ? new Date(item.timestamp) : null;
        const label = ts && !isNaN(ts.getTime())
          ? ts.toLocaleString()
          : 'Unknown time';

        const meta = document.createElement('div');
        meta.className = 'export-history-meta';
        meta.textContent = label;

        const counts = document.createElement('div');
        counts.className = 'export-history-counts';
        const articlesCount = item && typeof item.articleCount === 'number' ? item.articleCount : 0;
        const categoriesCount = item && typeof item.categoryCount === 'number' ? item.categoryCount : 0;
        counts.textContent = `Items: ${articlesCount} • Categories: ${categoriesCount}`;

        row.appendChild(meta);
        row.appendChild(counts);
        listEl.appendChild(row);
      });
    }

    const closeBtn = document.getElementById('exportHistoryClose');
    const hide = () => {
      modal.style.display = 'none';
    };

    if (closeBtn) {
      closeBtn.onclick = hide;
    }
    modal.onclick = (e) => {
      if (e.target === modal) hide();
    };

    modal.style.display = 'block';
  }

  async function exportData() {
    try {
      console.log('Starting data export...');
      const result = await storage.get(['articles', 'categories']);
      const articlesData = result.articles || [];
      const categoriesData = result.categories || [];

      const payload = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        data: {
          articles: articlesData,
          categories: categoriesData
        }
      };

      const dataStr = JSON.stringify(payload, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);

      const link = document.createElement('a');
      const datePart = new Date().toISOString().split('T')[0];
      const fileName = `chatkeeper-backup-${datePart}.json`;
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);

      addExportHistoryEntry({
        timestamp: new Date().toISOString(),
        articleCount: articlesData.length || 0,
        categoryCount: categoriesData.length || 0,
        fileName: fileName
      });

      console.log('Data export successful');
      alert('Data export successful!');
    } catch (error) {
      console.error('Data export failed:', error);
      alert('Data export failed: ' + error.message);
    }
  }
  
  // 通用操作确认弹窗（两步确认 + 权限检查）
  function openExportConfirmModal(onFinalConfirm) {
    const modal = document.getElementById('exportConfirmModal');
    if (!modal) return;
    const step2 = document.getElementById('exportStep2');
    const msg = document.getElementById('exportPermissionMsg');
    const upBtn = document.getElementById('exportUpgradeBtn');
    const cancelBtn = document.getElementById('exportConfirmCancel');
    const nextBtn = document.getElementById('exportConfirmNext');
    const finalBtn = document.getElementById('exportConfirmFinal');
    const closeBtn = document.getElementById('exportConfirmClose');

    // 初始状态
    if (step2) step2.style.display = 'none';
    if (finalBtn) { finalBtn.style.display = 'none'; finalBtn.disabled = true; }
    if (msg) msg.style.display = 'none';
    if (upBtn) upBtn.style.display = 'none';

    const hide = () => { modal.style.display = 'none'; };
    const show = () => { modal.style.display = 'block'; };

    if (cancelBtn) cancelBtn.onclick = hide;
    if (closeBtn) closeBtn.onclick = hide;
    modal.onclick = (e) => { if (e.target === modal) hide(); };

    if (nextBtn) nextBtn.onclick = () => {
      if (nextBtn) nextBtn.style.display = 'none';
      if (step2) step2.style.display = 'block';
      if (finalBtn) { finalBtn.style.display = 'inline-block'; finalBtn.disabled = false; }
      if (msg) msg.style.display = 'none';
      if (upBtn) upBtn.style.display = 'none';
    };

    if (finalBtn) finalBtn.onclick = () => { hide(); try { onFinalConfirm && onFinalConfirm(); } catch (_) {} };

    show();
  }

  function openImportConfirmModal(onFinalConfirm) {
    const modal = document.getElementById('importConfirmModal');
    if (!modal) return;
    const step2 = document.getElementById('importStep2');
    const msg = document.getElementById('importPermissionMsg');
    const upBtn = document.getElementById('importUpgradeBtn');
    const cancelBtn = document.getElementById('importConfirmCancel');
    const nextBtn = document.getElementById('importConfirmNext');
    const finalBtn = document.getElementById('importConfirmFinal');
    const closeBtn = document.getElementById('importConfirmClose');

    // 初始状态
    if (step2) step2.style.display = 'none';
    if (finalBtn) { finalBtn.style.display = 'none'; finalBtn.disabled = true; }
    if (msg) msg.style.display = 'none';
    if (upBtn) upBtn.style.display = 'none';

    const hide = () => { modal.style.display = 'none'; };
    const show = () => { modal.style.display = 'block'; };

    if (cancelBtn) cancelBtn.onclick = hide;
    if (closeBtn) closeBtn.onclick = hide;
    modal.onclick = (e) => { if (e.target === modal) hide(); };

    if (nextBtn) nextBtn.onclick = () => {
      if (nextBtn) nextBtn.style.display = 'none';
      if (step2) step2.style.display = 'block';
      if (finalBtn) { finalBtn.style.display = 'inline-block'; finalBtn.disabled = false; }
      if (msg) msg.style.display = 'none';
      if (upBtn) upBtn.style.display = 'none';
    };

    if (finalBtn) finalBtn.onclick = () => { hide(); try { onFinalConfirm && onFinalConfirm(); } catch (_) {} };

    show();
  }

  // 数据恢复功能
  async function importData() {
    try {
      // 创建文件输入元素
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      
      fileInput.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
          console.log('Starting data recovery...');
          
          // 读取文件内容
          const fileContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('File reading failed'));
            reader.readAsText(file);
          });
          
          // 解析JSON数据
          const importData = JSON.parse(fileContent);
          
          // 验证数据格式
          if (!importData.data || !importData.data.articles || !importData.data.categories) {
            throw new Error('Incorrect data format');
          }
          
          // 确认是否覆盖现有数据
          const confirmed = confirm('Data recovery will overwrite all existing data. Do you want to continue?');
          if (!confirmed) return;
          
          // 清空现有数据
          await storage.clear('articles');
          await storage.clear('categories');
          
          // 导入文章数据
          const articles = importData.data.articles;
          for (const article of articles) {
            await storage.set('articles', article);
          }
          
          // 导入分类数据
          const categories = importData.data.categories;
          for (const category of categories) {
            await storage.set('categories', category);
          }
          
          console.log('Data recovery successful');
          alert('Data recovery successful! The page will refresh to display new data.');
          
          // 刷新页面数据
          await refreshData();
          
        } catch (error) {
          console.error('Data recovery failed:', error);
          alert('Data recovery failed: ' + error.message);
        }
      };
      
      // 触发文件选择
      fileInput.click();
      
    } catch (error) {
      console.error('Data recovery failed:', error);
      alert('Data recovery failed: ' + error.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
