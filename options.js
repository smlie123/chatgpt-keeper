// Options页面的JavaScript逻辑

(function() {
  'use strict';
  
  let currentSort = 'default';
  let searchQuery = '';
  let articles = [];
  let categories = [];
  
  // 通用存储访问函数 - 使用IndexedDB
  const storage = {
    async get(keys) {
      if (typeof storageAPI === 'undefined') {
        throw new Error('storageAPI未定义，请确保storage-api.js已加载');
      }
      return await storageAPI.get(keys);
    },
    async set(data) {
      if (typeof storageAPI === 'undefined') {
        throw new Error('storageAPI未定义，请确保storage-api.js已加载');
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
        console.log('已创建默认分类:', defaultCategories.map(c => c.name).join(', '));
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
        throw new Error('分类不存在');
      }
      
      // 将该分类下的所有文章改为"未分类"
      const updatedArticles = articles.map(article => {
        if (article.category === categoryToDelete.name) {
          return { ...article, category: '未分类' };
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
    console.log('Options页面已加载');
    
    try {
      // 初始化数据库
      await categoryDB.init();
      
      // 执行数据迁移（从chrome.storage.local到IndexedDB）
      const migrationResult = await storageAPI.migrateFromChromeStorage();
      if (migrationResult.migrated) {
        console.log('数据迁移成功:', migrationResult.message);
      } else if (migrationResult.reason) {
        console.log('跳过数据迁移:', migrationResult.reason);
      } else {
        console.warn('数据迁移失败:', migrationResult.error);
      }
      
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
    
    // 添加"未分类"选项
    const uncategorizedItem = createCategorySelectItem('未分类', currentCategory === '未分类');
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
  
  // 处理删除卡片
  function handleDeleteCard(cardId, type, originalId, btnElement) {
    showDeletePopover(cardId, type, originalId, btnElement);
  }
  
  // 显示删除确认popover
  function showDeletePopover(cardId, type, originalId, btnElement) {
    const confirmText = type === 'article' ? '确定要删除这篇文章吗？' : '确定要删除这个对话吗？';
    
    // 创建popover元素
    const popover = document.createElement('div');
    popover.className = 'popover delete-popover';
    popover.innerHTML = `
      <div class="popover-content">
        <p>${confirmText}</p>
        <div class="popover-actions">
          <button class="popover-btn cancel-btn">取消</button>
          <button class="popover-btn confirm-btn">删除</button>
        </div>
      </div>
    `;
    
    // 定位popover
    const rect = btnElement.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = `${rect.top - 80}px`;
    popover.style.zIndex = '10000';
    
    // 先添加到DOM中以获取popover的尺寸
    document.body.appendChild(popover);
    const popoverRect = popover.getBoundingClientRect();
    
    // 让popover的右侧与删除按钮对齐
    const leftPosition = rect.right - popoverRect.width;
    popover.style.left = `${leftPosition}px`;
    
    // 显示动画
    setTimeout(() => {
      popover.classList.add('show');
    }, 10);
    
    // 取消按钮事件
    const cancelBtn = popover.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
      popover.classList.remove('show');
      setTimeout(() => {
        if (popover.parentNode) {
          popover.remove();
        }
      }, 200);
    });
    
    // 确认删除按钮事件
    const confirmBtn = popover.querySelector('.confirm-btn');
    confirmBtn.addEventListener('click', async () => {
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
        
        // 重新渲染卡片和导航
        renderCards();
        await renderNavCategories();
      } catch (error) {
        console.error('删除失败:', error);
        alert('删除失败，请重试');
      }
      
      // 隐藏popover
      popover.classList.remove('show');
      setTimeout(() => {
        if (popover.parentNode) {
          popover.remove();
        }
      }, 200);
    });
    
    // 点击外部关闭popover
    const closePopover = (e) => {
      if (!popover.contains(e.target) && !btnElement.contains(e.target)) {
        popover.classList.remove('show');
        setTimeout(() => {
          if (popover.parentNode) {
            popover.remove();
          }
        }, 200);
        document.removeEventListener('click', closePopover);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closePopover);
    }, 100);
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
        
        // 添加自定义插件：处理 mytag 注释标记
        md.core.ruler.before('normalize', 'mytag_block', function(state) {
          let src = state.src;
          const regex = /<!--\s*mytag:start\s*-->([\s\S]*?)<!--\s*mytag:end\s*-->/g;
          
          src = src.replace(regex, function(match, innerContent) {
             const trimmedContent = innerContent.trim();
             return `<div class="my-question"><p>${trimmedContent}</p></div>`;
           });
          
          state.src = src;
        });
        
        const htmlContent = md.render(content);
        drawerContent.innerHTML = htmlContent;
        
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
        tocLink.textContent = questionText;
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
      content: article.content, // 添加完整的content字段用于计算对话数量
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
    
    // 计算对话数量（基于mytag:start标签）
    const dialogCount = (item.content || '').split('<!-- mytag:start -->').length - 1;
    const dialogCountDisplay = dialogCount > 0 ? `<span class="dialog-count" title="包含 ${dialogCount} 条对话">${dialogCount}</span>` : '';
    
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
          ${dialogCountDisplay}
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
      handleDeleteCard(item.id, item.type, item.originalId, deleteBtn);
    });
    
    // 添加分类点击事件
    const cardCategory = card.querySelector('.card-category');
    cardCategory.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      openCategorySelectModal(item.id, item.category, item.type, item.originalId);
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
      } else if (categoryName === '未分类') {
        return articles.filter(article => !article.category || article.category === '未分类').length;
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
      <span class="nav-text">全部</span>
      <span class="nav-count">${allCount}</span>
    `;
    allNavItem.addEventListener('click', (e) => handleNavClick(e));
    navList.appendChild(allNavItem);
    
    // 添加"未分类"项
    const uncategorizedCount = await getCategoryArticleCount('未分类');
    const uncategorizedItem = document.createElement('li');
    uncategorizedItem.className = 'nav-item';
    uncategorizedItem.innerHTML = `
      <span class="nav-text">未分类</span>
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
      
      // 显示loading动画
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
      }
      
      // 获取drawer-main元素
      const drawerMain = document.querySelector('.drawer-main');
      if (!drawerMain) {
        alert('未找到要导出的内容');
        // 隐藏loading动画
        if (loadingOverlay) {
          loadingOverlay.style.display = 'none';
        }
        return;
      }
      
      // 显示加载提示
      const exportBtn = document.getElementById('exportPdfBtn');
      const originalText = exportBtn.innerHTML;
      exportBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>导出中...';
      exportBtn.disabled = true;
      
      // 保存原始样式
      const originalHeight = drawerMain.style.height;
      const originalOverflow = drawerMain.style.overflowY;
      
      // 临时修改样式以显示全部内容
      drawerMain.style.height = 'auto';
      drawerMain.style.overflowY = 'visible';
      
      // 使用html2canvas截取drawer-main的全部内容，调整参数减小文件体积
      html2canvas(drawerMain, {
        scale: 2, // 降低清晰度以减小文件大小
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false, // 关闭日志
        removeContainer: true, // 移除容器
        height: drawerMain.scrollHeight, // 使用滚动高度
        width: drawerMain.scrollWidth // 使用滚动宽度
      }).then(canvas => {
        // 创建PDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });
        
        // 设置页面边距
        const margin = 15; // 15mm边距
        const pageWidth = 210; // A4宽度
        const pageHeight = 295; // A4高度
        const contentWidth = pageWidth - (margin * 2); // 内容区域宽度
        const contentHeight = pageHeight - (margin * 2); // 内容区域高度
        
        // 转换为JPEG格式以减小文件大小
        const imgData = canvas.toDataURL('image/jpeg', 0.8); // 0.8质量压缩
        
        // 固定缩放比例，确保文字大小始终一致
        const scale = contentWidth / canvas.width; // 固定缩放比例
        const imgWidth = contentWidth;
        const imgHeight = canvas.height * scale;
        
        // 计算每页可以显示的canvas高度（像素）- 基于固定的页面内容高度
        const canvasHeightPerPage = contentHeight / scale;
        
        // 智能分页：寻找合适的分页点
        const pageBreaks = [0]; // 第一页从0开始
        let currentY = 0;
        
        while (currentY < canvas.height) {
          let nextPageY = currentY + canvasHeightPerPage;
          
          // 如果已经到达末尾，直接添加
          if (nextPageY >= canvas.height) {
            if (currentY < canvas.height) {
              pageBreaks.push(canvas.height);
            }
            break;
          }
          
          // 在预期分页点前后寻找合适的断点（避免文字被切断）
          const searchRange = canvasHeightPerPage * 0.1; // 搜索范围为页面高度的10%
          const searchStart = Math.max(currentY + canvasHeightPerPage * 0.8, nextPageY - searchRange);
          const searchEnd = Math.min(nextPageY + searchRange, canvas.height);
          
          // 获取搜索区域的图像数据来寻找空白行
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          tempCanvas.width = canvas.width;
          tempCanvas.height = searchEnd - searchStart;
          tempCtx.drawImage(canvas, 0, searchStart, canvas.width, searchEnd - searchStart, 0, 0, canvas.width, searchEnd - searchStart);
          
          const imageData = tempCtx.getImageData(0, 0, canvas.width, searchEnd - searchStart);
          const data = imageData.data;
          
          // 寻找空白行（亮度较高的行）
          let bestBreakPoint = nextPageY;
          let maxWhiteness = 0;
          
          for (let y = 0; y < searchEnd - searchStart; y += 2) { // 每2像素检查一次以提高性能
            let rowWhiteness = 0;
            let pixelCount = 0;
            
            // 检查这一行的亮度
            for (let x = 0; x < canvas.width; x += 10) { // 每10像素采样一次
              const index = (y * canvas.width + x) * 4;
              if (index < data.length) {
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const brightness = (r + g + b) / 3;
                rowWhiteness += brightness;
                pixelCount++;
              }
            }
            
            if (pixelCount > 0) {
              const avgWhiteness = rowWhiteness / pixelCount;
              if (avgWhiteness > maxWhiteness) {
                maxWhiteness = avgWhiteness;
                bestBreakPoint = searchStart + y;
              }
            }
          }
          
          // 如果找到了较好的断点（亮度足够高），使用它；否则使用原始分页点
          if (maxWhiteness > 200) { // 亮度阈值
            pageBreaks.push(bestBreakPoint);
            currentY = bestBreakPoint;
          } else {
            pageBreaks.push(nextPageY);
            currentY = nextPageY;
          }
        }
        
        // 根据智能分页点生成PDF页面
        for (let i = 0; i < pageBreaks.length - 1; i++) {
          if (i > 0) {
            pdf.addPage();
          }
          
          const sourceY = pageBreaks[i];
          const sourceHeight = pageBreaks[i + 1] - pageBreaks[i];
          
          // 使用固定缩放比例计算PDF中的实际高度
          const destHeight = sourceHeight * scale;
          
          // 创建临时canvas来裁剪图片
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          tempCanvas.width = canvas.width;
          tempCanvas.height = sourceHeight;
          
          // 将对应部分绘制到临时canvas
          tempCtx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
          
          // 将裁剪后的图片添加到PDF
          const pageImgData = tempCanvas.toDataURL('image/jpeg', 0.8);
          pdf.addImage(pageImgData, 'JPEG', margin, margin, imgWidth, destHeight);
        }
        
        // 下载PDF - 使用新的文件名格式
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `ChatGPT-conversations-${timestamp}.pdf`;
        pdf.save(fileName);
        
        // 恢复原始样式
        drawerMain.style.height = originalHeight;
        drawerMain.style.overflowY = originalOverflow;
        
        // 恢复按钮状态
        exportBtn.innerHTML = originalText;
        exportBtn.disabled = false;
        
        // 隐藏loading动画
        if (loadingOverlay) {
          loadingOverlay.style.display = 'none';
        }
        
      }).catch(error => {
        console.error('导出PDF失败:', error);
        alert('导出PDF失败，请重试');
        
        // 确保在出错时也恢复样式
        drawerMain.style.height = originalHeight;
        drawerMain.style.overflowY = originalOverflow;
        
        // 恢复按钮状态
        exportBtn.innerHTML = originalText;
        exportBtn.disabled = false;
        
        // 隐藏loading动画
        if (loadingOverlay) {
          loadingOverlay.style.display = 'none';
        }
      });
      
    } catch (error) {
      console.error('导出PDF失败:', error);
      alert('导出PDF失败，请重试');
      
      // 隐藏loading动画
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
    }
  }
  
  // 导出为Markdown
  function exportToMarkdown(article) {
    try {
      // 显示loading动画
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
      }
      
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
      
      // 使用新的文件名格式
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `ChatGPT-conversations-${timestamp}.md`;
      
      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 清理URL对象
      URL.revokeObjectURL(url);
      
      // 隐藏loading动画
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
    } catch (error) {
      console.error('导出Markdown失败:', error);
      alert('导出Markdown失败，请重试');
      
      // 隐藏loading动画
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
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
          console.error('刷新数据失败:', error);
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
      
      console.log('数据已刷新');
    } catch (error) {
      console.error('刷新数据失败:', error);
      throw error;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();