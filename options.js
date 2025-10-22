// Options页面的JavaScript逻辑

(function() {
  'use strict';
  
  let currentSort = 'default';
  let searchQuery = '';
  let articles = [];
  let categories = [];
  
  // 通用存储访问函数
  const storage = {
    async get(keys) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return await chrome.storage.local.get(keys);
      } else {
        const result = {};
        keys.forEach(key => {
          const value = localStorage.getItem(key);
          result[key] = value ? JSON.parse(value) : undefined;
        });
        return result;
      }
    },
    async set(data) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return await chrome.storage.local.set(data);
      } else {
        Object.keys(data).forEach(key => {
          localStorage.setItem(key, JSON.stringify(data[key]));
        });
      }
    }
  };

  // Chrome Storage 数据库管理
  class CategoryDB {
    constructor() {
      // 使用通用存储接口
    }
    
    async init() {
      // 确保数据结构存在
      const result = await storage.get(['categories', 'articles', 'favorites']);
      
      if (!result.categories) {
        await storage.set({ categories: [] });
      }
      if (!result.articles) {
        await storage.set({ articles: [] });
      }
      if (!result.favorites) {
        await storage.set({ favorites: [] });
      }
      
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
      const result = await storage.get(['categories']);
      const categories = result.categories || [];
      
      const filteredCategories = categories.filter(cat => cat.id !== id);
      
      await storage.set({ categories: filteredCategories });
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
    console.log('Options页面已加载');
    
    try {
      // 初始化数据库
      await categoryDB.init();
      
      // 加载分类数据
      await loadCategories();
      
      // 加载文章数据
      await loadArticles();
      
      // 绑定事件监听器
      bindEventListeners();
      
      // 渲染卡片
      renderCards();
    } catch (error) {
      console.error('初始化失败:', error);
    }
  }
  
  // 绑定事件监听器
  function bindEventListeners() {
    // 搜索框事件
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', handleSearch);
    }
    
    // 视图切换按钮事件
    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
      btn.addEventListener('click', (e) => handleViewChange(e));
    });
    
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
      userProfile.addEventListener('click', toggleUserMenu);
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
    
    // ESC键关闭抽屉
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const drawer = document.getElementById('articleDrawer');
        if (drawer && drawer.classList.contains('active')) {
          closeArticleDrawer();
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
  
  // 打开编辑分类弹窗
  function openEditCategoryModal(articleId, currentCategory, type, originalId) {
    // 只处理文章类型
    if (type !== 'article') {
      console.log('当前版本只支持编辑文章分类');
      return;
    }
    
    // 创建简单的提示框让用户选择新分类
    const newCategory = prompt(`当前分类：${currentCategory}\n\n请输入新的分类名称：`, currentCategory);
    
    if (newCategory && newCategory.trim() !== '' && newCategory !== currentCategory) {
      // 更新文章的分类
      const article = articles.find(art => art.id === originalId);
      if (article) {
        article.category = newCategory.trim();
        // 这里应该同时更新数据库
        categoryDB.updateArticle(originalId, { category: newCategory.trim() })
          .then(() => {
            console.log(`已将文章"${article.title}"的分类更改为"${newCategory}"`);
            // 重新渲染卡片
            renderCards();
          })
          .catch(error => {
            console.error('更新分类失败:', error);
            alert('更新分类失败，请重试');
          });
      }
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
  function handleViewChange(e) {
    const viewType = e.currentTarget.dataset.view;
    if (!viewType) return;
    
    // 更新按钮状态
    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => btn.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    // 切换容器类名
    const cardsContainer = document.querySelector('.masonry-container');
    if (cardsContainer) {
      if (viewType === 'list') {
        cardsContainer.classList.add('list-view');
      } else {
        cardsContainer.classList.remove('list-view');
      }
    }
  }
  
  // 处理删除卡片
  async function handleDeleteCard(cardId, type, originalId) {
    const confirmText = type === 'article' ? '确定要删除这篇文章吗？' : '确定要删除这个对话吗？';
    
    if (confirm(confirmText)) {
      try {
        if (type === 'article') {
          // 删除文章
          await categoryDB.deleteArticle(originalId);
          // 从本地数据中移除
          const index = articles.findIndex(article => article.id === originalId);
          if (index !== -1) {
            articles.splice(index, 1);
          }
          console.log('已删除文章:', originalId);
        } else {
          // 当前版本只支持删除文章
          console.log('当前版本只支持删除文章');
        }
        
        // 重新渲染卡片
        renderCards();
      } catch (error) {
        console.error('删除失败:', error);
        alert('删除失败，请重试');
      }
    }
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
    drawerTitle.textContent = '详细内容';
    
    // 设置文章标题作为meta信息
    let title = article.title || '无标题';
    if (drawerTitleText) {
      drawerTitleText.textContent = title;
    }
    
    // 处理内容：去掉重复的标题，转换markdown为HTML
    let content = article.content || '';
    
    // 去掉内容开头的重复标题
    if (title && title !== '无标题') {
      // 移除内容开头的标题行
      const lines = content.split('\n');
      if (lines.length > 0 && lines[0].trim() === title.trim()) {
        lines.shift(); // 移除第一行
        // 如果第二行是空行，也移除
        if (lines.length > 0 && lines[0].trim() === '') {
          lines.shift();
        }
        content = lines.join('\n');
      }
    }
    
    // 使用markdown-it库将markdown转换为HTML
    if (typeof markdownit !== 'undefined') {
      try {
        // 初始化markdown-it并添加所有插件
        const md = markdownit({
          html: true,
          linkify: true,
          typographer: true
        });
        
        // 添加任务列表插件
        if (typeof markdownitTaskLists !== 'undefined') {
          md.use(markdownitTaskLists, { enabled: true });
        }
        
        // 添加KaTeX插件
        if (typeof markdownitKatex !== 'undefined') {
          md.use(markdownitKatex, {
            throwOnError: false,
            errorColor: '#cc0000'
          });
        }
        
        // 添加emoji插件
        if (typeof markdownitEmoji !== 'undefined') {
          md.use(markdownitEmoji);
        }
        
        const htmlContent = md.render(content);
        drawerContent.innerHTML = htmlContent;
        
        // 添加GitHub Markdown样式类
        drawerContent.classList.add('markdown-body');
        

      } catch (error) {
        console.error('Markdown解析错误:', error);
        drawerContent.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
        drawerContent.classList.add('markdown-body');
      }
    } else {
      // 如果markdown-it库未加载，使用简单的文本显示
      drawerContent.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
      drawerContent.classList.add('markdown-body');
    }
    
    // 设置meta信息栏的时间
    const metaTime = document.getElementById('metaTime');
    if (metaTime) {
      metaTime.textContent = `收藏时间：${new Date(article.create_at).toLocaleString('zh-CN')}`;
    }
    
    // 绑定导出按钮事件
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const exportMdBtn = document.getElementById('exportMdBtn');
    
    if (exportPdfBtn) {
      exportPdfBtn.onclick = () => exportToPDF(article);
    }
    
    if (exportMdBtn) {
      exportMdBtn.onclick = () => exportToMarkdown(article);
    }
    
    // 显示抽屉
    drawer.classList.add('active');
  }
  
  // 关闭文章详情抽屉
  function closeArticleDrawer() {
    const drawer = document.getElementById('articleDrawer');
    drawer.classList.remove('active');
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
    if (!container) return;
    
    // 筛选和排序数据
    let filteredConversations = filterConversations();
    filteredConversations = sortConversations(filteredConversations);
    
    // 清空容器
    container.innerHTML = '';
    
    if (filteredConversations.length === 0) {
      showEmptyState(container);
      return;
    }
    
    // 生成卡片HTML
    filteredConversations.forEach(conversation => {
      const card = createCard(conversation);
      container.appendChild(card);
    });
  }
  
  // 加载文章数据
  async function loadArticles() {
    try {
      articles = await categoryDB.getArticles();
      console.log('已加载文章数据:', articles.length);
    } catch (error) {
      console.error('加载文章失败:', error);
      articles = [];
    }
  }
  
  // 筛选文章数据
  function filterConversations() {
    // 只使用真实的文章数据
    const allItems = articles.map(article => ({
      id: `article_${article.id}`,
      title: article.title,
      description: article.content && typeof article.content === 'string' ? article.content.substring(0, 100) + '...' : '暂无描述',
      category: article.category || '未分类',
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
      if (categoryText !== '全部') {
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
        return sorted.sort((a, b) => new Date(b.create_at) - new Date(a.create_at));
      case 'length':
        return sorted.sort((a, b) => b.messageCount - a.messageCount);
      default:
        // 默认按创建时间倒序排列，最新收藏的排在最前面
        return sorted.sort((a, b) => new Date(b.create_at) - new Date(a.create_at));
    }
  }
  
  // 创建卡片元素
  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    
    // 根据类型显示不同的内容
    const isArticle = item.type === 'article';
    const messageCountText = isArticle ? '收藏文章' : `${item.messageCount}条消息`;
    const deleteTitle = isArticle ? '删除文章' : '删除对话';
    
    card.innerHTML = `
      <div class="card-content">
        <div class="card-main">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <p class="card-description">${escapeHtml(item.description)}</p>
        </div>
        <div class="card-meta">
          <span class="card-category">
            <span class="category-name">${item.category}</span>
            <svg class="edit-category-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="修改分类">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </span>
          <span class="card-date">${item.date}</span>
          <span class="card-message-count">${messageCountText}</span>
          <button class="delete-btn" title="${deleteTitle}">
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
    
    // 添加删除按钮事件
    const deleteBtn = card.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      handleDeleteCard(item.id, item.type, item.originalId);
    });
    
    // 添加编辑分类图标事件
    const editCategoryIcon = card.querySelector('.edit-category-icon');
    editCategoryIcon.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      openEditCategoryModal(item.id, item.category, item.type, item.originalId);
    });
    
    // 添加卡片点击事件
    card.addEventListener('click', () => {
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
  
  // 显示空状态
  function showEmptyState(container) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <h3 class="empty-title">未找到相关对话</h3>
        <p class="empty-description">尝试调整搜索条件或选择其他分类</p>
      </div>
    `;
  }
  
  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // 分类管理相关函数
  async function loadCategories() {
    try {
      categories = await categoryDB.getCategories();
      renderNavCategories();
    } catch (error) {
      console.error('加载分类失败:', error);
    }
  }
  
  function renderNavCategories() {
    const navList = document.querySelector('.nav-list');
    if (!navList) return;
    
    // 保留"全部"项
    const allItem = navList.querySelector('.nav-item.active');
    navList.innerHTML = '';
    if (allItem) {
      navList.appendChild(allItem);
    }
    
    // 添加"未分类"项
    const uncategorizedItem = document.createElement('li');
    uncategorizedItem.className = 'nav-item';
    uncategorizedItem.innerHTML = `
      <span class="nav-text">未分类</span>
      <span class="nav-count">15</span>
    `;
    uncategorizedItem.addEventListener('click', (e) => handleNavClick(e));
    navList.appendChild(uncategorizedItem);
    
    // 添加自定义分类
    categories.forEach(category => {
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.innerHTML = `
        <span class="nav-text">${escapeHtml(category.name)}</span>
        <span class="nav-count">0</span>
      `;
      li.addEventListener('click', (e) => handleNavClick(e));
      navList.appendChild(li);
    });
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
      alert('请输入分类名称');
      return;
    }
    
    try {
      await categoryDB.addCategory(name);
      input.value = '';
      await loadCategories();
      renderCategoryList();
    } catch (error) {
      console.error('添加分类失败:', error);
      alert('添加分类失败');
    }
  }
  
  async function editCategory(id, currentName) {
    const newName = prompt('请输入新的分类名称:', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      try {
        await categoryDB.updateCategory(id, newName.trim());
        await loadCategories();
        renderCategoryList();
      } catch (error) {
        console.error('编辑分类失败:', error);
        alert('编辑分类失败');
      }
    }
  }
  
  async function deleteCategory(id, name) {
    if (confirm(`确定要删除分类"${name}"吗？`)) {
      try {
        await categoryDB.deleteCategory(id);
        await loadCategories();
        renderCategoryList();
      } catch (error) {
        console.error('删除分类失败:', error);
        alert('删除分类失败');
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
        // 同步更新页面nav-list的排序，保持全部和未分类在顶部
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
      console.log('分类排序已保存到数据库');
    } catch (error) {
      console.error('保存分类排序失败:', error);
      alert('保存分类排序失败，请重试');
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="delete-btn" title="删除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
            </svg>
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
      deleteBtn.addEventListener('click', () => deleteCategory(category.id, category.name));
      
      categoryList.appendChild(div);
    });
  }
  
  // 页面加载完成后初始化
  // 导出为PDF
  function exportToPDF(article) {
    try {
      const title = article.title || '无标题';
      const content = article.content || '';
      const category = article.category || '未分类';
      const date = new Date(article.create_at).toLocaleString('zh-CN');
      
      // 创建一个新窗口用于打印
      const printWindow = window.open('', '_blank');
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${title}</title>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 40px; }
            h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
            .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
            .content { white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">
            <p>分类：${category}</p>
            <p>收藏时间：${date}</p>
          </div>
          <div class="content">${content.replace(/\n/g, '<br>')}</div>
        </body>
        </html>
      `;
      
      printWindow.document.write(printContent);
      printWindow.document.close();
      
      // 等待内容加载完成后打印
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    } catch (error) {
      console.error('导出PDF失败:', error);
      alert('导出PDF失败，请重试');
    }
  }
  
  // 导出为Markdown
  function exportToMarkdown(article) {
    try {
      const title = article.title || '无标题';
      const content = article.content || '';
      const category = article.category || '未分类';
      const date = new Date(article.create_at).toLocaleString('zh-CN');
      
      const markdownContent = `# ${title}\n\n**分类：** ${category}\n**收藏时间：** ${date}\n\n---\n\n${content}`;
      
      // 创建下载链接
      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[^\w\s-]/g, '')}.md`;
      
      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 清理URL对象
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出Markdown失败:', error);
      alert('导出Markdown失败，请重试');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();