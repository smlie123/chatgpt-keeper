// 存储API - 提供统一的存储接口
// 使用IndexedDB作为唯一存储方案

class StorageAPI {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  // 初始化存储系统
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // 使用IndexedDB作为唯一存储方案
        if (typeof chatKeeperDB !== 'undefined' && chatKeeperDB.isSupported) {
          this.db = chatKeeperDB;
          await this.db.init();
          console.log('StorageAPI 使用IndexedDB初始化成功');
          return true;
        }
        
        throw new Error('IndexedDB不可用');
      } catch (error) {
        console.error('StorageAPI 初始化失败:', error.message || error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  // 获取数据接口
  async get(keys) {
    await this.init();
    
    const result = {};
    const keyArray = Array.isArray(keys) ? keys : [keys];
    
    for (const key of keyArray) {
      try {
        let data;
        
        switch (key) {
          case 'articles':
            data = await this.db.getAll('articles');
            break;
          // favorites表已移除
          case 'categories':
            data = await this.db.getAll('categories');
            break;
          default:
            data = null;
        }
        
        result[key] = data || (key === 'articles' || key === 'categories' ? [] : null);
      } catch (error) {
        console.error(`获取${key}数据失败:`, error.message || error);
        result[key] = key === 'articles' || key === 'categories' ? [] : null;
      }
    }
    
    return result;
  }

  // 设置数据接口
  async set(data) {
    await this.init();
    
    const promises = [];
    
    for (const [key, value] of Object.entries(data)) {
      try {
        switch (key) {
          case 'articles':
            // 清空现有数据并重新添加
            promises.push(this.setArticles(value));
            break;
          // favorites表已移除，跳过处理
          case 'categories':
            // 清空现有数据并重新添加
            promises.push(this.setCategories(value));
            break;
          default:
            console.warn(`未知的存储键: ${key}`);
        }
      } catch (error) {
        console.error(`设置${key}数据失败:`, error);
        throw error;
      }
    }
    
    await Promise.all(promises);
    console.log('数据保存成功');
  }

  // 设置文章数据
  async setArticles(articles) {
    console.log('开始设置文章数据，数量:', articles?.length || 0);
    
    try {
      await this.db.clear('articles');
      console.log('已清空articles存储');
      
      if (articles && articles.length > 0) {
        for (let i = 0; i < articles.length; i++) {
          const article = articles[i];
          try {
            const messageId =
              article.messageId ||
              (article.id != null ? String(article.id) : String(Date.now()) + '_' + i);
            const toSave = {
              ...article,
              messageId,
              timestamp: article.timestamp || Date.now()
            };
            await this.db.put('articles', toSave);
            console.log(`成功添加文章${i+1}/${articles.length}`);
          } catch (articleError) {
            console.error(`添加文章${i}失败:`, articleError.message || articleError);
            // 继续处理其他文章，不中断整个过程
          }
        }
      }
      console.log('文章数据设置完成');
    } catch (error) {
      console.error('设置文章数据失败:', error.message || error);
      throw error;
    }
  }



  // 设置分类数据
  async setCategories(categories) {
    console.log('开始设置分类数据，数量:', categories?.length || 0);
    
    try {
      await this.db.clear('categories');
      console.log('已清空categories存储');
      
      if (categories && categories.length > 0) {
        for (let i = 0; i < categories.length; i++) {
          const category = categories[i];
          try {
            // 确保分类有必要的字段
            if (!category.name) {
              console.warn(`分类${i}缺少name字段，跳过`);
              continue;
            }
            
            // 使用put而不是add，避免主键冲突
            await this.db.put('categories', {
              ...category,
              id: category.id || (i + 1) // 确保有ID
            });
            console.log(`成功添加分类${i+1}/${categories.length}: ${category.name}`);
          } catch (categoryError) {
            console.error(`添加分类${i}失败:`, categoryError.message || categoryError);
            // 继续处理其他分类，不中断整个过程
          }
        }
      }
      console.log('分类数据设置完成');
    } catch (error) {
      console.error('设置分类数据失败:', error.message || error);
      throw error;
    }
  }

  // 专门的文章操作函数
  async saveArticle(article) {
    await this.init();
    
    // 确保文章有必要的字段
    let normalizedContent = null;
    if (Array.isArray(article.content)) {
      normalizedContent = article.content.map(entry => ({
        id: entry.id || article.messageId || (article.id || Date.now().toString()),
        title: entry.title || article.title || '',
        answer: entry.answer || '',
        type: entry.type || (/<img\s/i.test(entry.answer || '') ? 'img' : 'markdown')
      }));
    } else {
      // 兼容旧格式：将字符串内容包装为一个条目
      normalizedContent = [{
        id: article.messageId || (article.id || Date.now().toString()),
        title: article.title || '',
        answer: article.content || '',
        type: 'markdown'
      }];
    }

    const articleToSave = {
      id: article.id || Date.now().toString(),
      title: article.title || '',
      content: normalizedContent,
      url: article.url || '',
      timestamp: article.timestamp || Date.now(),
      create_at: article.create_at || new Date().toISOString(),
      category: article.category || 'default',
      messageId: article.messageId || '',
      imagesMeta: Array.isArray(article.imagesMeta) ? article.imagesMeta : []
    };
    
    try {
      // 使用IndexedDB
      if (!article.id) {
        const result = await this.db.add('articles', articleToSave);
        console.log('文章保存成功:', articleToSave.title);
        return result;
      } else {
        const result = await this.db.put('articles', articleToSave);
        console.log('文章保存成功:', articleToSave.title);
        return result;
      }
    } catch (error) {
      console.error('保存文章失败:', error.message || error);
      throw error;
    }
  }







  // 根据messageId获取文章
  async getArticlesByMessageId(messageId) {
    await this.init();
    
    // 使用IndexedDB
    return await this.db.getByIndex('articles', 'messageId', messageId);
  }

  // 数据迁移函数 - 从chrome.storage.local迁移到IndexedDB
  async migrateFromChromeStorage() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.log('chrome.storage.local不可用，跳过迁移');
      return { migrated: false, reason: 'chrome.storage.local不可用' };
    }

    try {
      console.log('开始从chrome.storage.local迁移数据...');
      
      // 确保IndexedDB已初始化
      await this.init();
      
      // 获取现有数据
      const result = await new Promise((resolve, reject) => {
        chrome.storage.local.get(['articles', 'favorites', 'categories'], (data) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(data);
          }
        });
      });
      
      let migratedCount = { articles: 0, categories: 0 };
      
      // 迁移文章数据
      if (result.articles && result.articles.length > 0) {
        await this.setArticles(result.articles);
        migratedCount.articles = result.articles.length;
        console.log(`迁移了 ${result.articles.length} 篇文章`);
      }
      
      // favorites表已移除，跳过迁移
      
      // 迁移分类数据
      if (result.categories && result.categories.length > 0) {
        await this.setCategories(result.categories);
        migratedCount.categories = result.categories.length;
        console.log(`迁移了 ${result.categories.length} 个分类`);
      }
      
      // 迁移完成后清空chrome.storage.local中的数据
      await new Promise((resolve, reject) => {
        chrome.storage.local.clear(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
      
      console.log('数据迁移完成，已清空chrome.storage.local');
      
      return { 
        migrated: true, 
        count: migratedCount,
        message: `成功迁移 ${migratedCount.articles} 篇文章和 ${migratedCount.categories} 个分类`
      };
      
    } catch (error) {
      console.error('数据迁移失败:', error);
      return { migrated: false, error: error.message };
    }
  }
}

// 创建全局存储API实例
const storageAPI = new StorageAPI();

// 导出API实例
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageAPI, storageAPI };
}

// 全局可用
if (typeof window !== 'undefined') {
  window.StorageAPI = StorageAPI;
  window.storageAPI = storageAPI;
}
