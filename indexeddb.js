// IndexedDB 数据库管理
// 替代 chrome.storage.local 的数据存储方案

class ChatKeeperDB {
  constructor() {
    // 使用扩展特定的数据库名称，确保在扩展环境下正确访问
    this.dbName = this.getExtensionDBName();
    this.version = 5;
    this.db = null;
    this.isSupported = this.checkIndexedDBSupport();
  }

  // 获取扩展特定的数据库名称
  getExtensionDBName() {
    // 在Chrome扩展环境中使用扩展ID作为数据库名称的一部分
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      return `ChatKeeperDB_${chrome.runtime.id}`;
    }
    // 在普通网页环境中使用域名
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin.replace(/[^a-zA-Z0-9]/g, '_');
      return `ChatKeeperDB_${origin}`;
    }
    // 默认名称
    return 'ChatKeeperDB_default';
  }

  // 检查IndexedDB支持
  checkIndexedDBSupport() {
    try {
      // 检查基本可用性
      if (typeof indexedDB === 'undefined' || indexedDB === null) {
        console.warn('IndexedDB对象不存在');
        return false;
      }
      
      // 检查是否在安全上下文中
      if (typeof window !== 'undefined' && window.location && window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
        console.warn('IndexedDB在非HTTPS环境下可能不可用');
      }
      
      // 检测运行环境
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        console.log(`检测到Chrome扩展环境，扩展ID: ${chrome.runtime.id}`);
        console.log(`数据库名称: ${this.dbName}`);
      } else {
        console.log(`检测到普通网页环境，数据库名称: ${this.dbName}`);
      }
      
      return true;
    } catch (e) {
      console.warn('IndexedDB支持检查失败:', e.message || e);
      return false;
    }
  }

  // 初始化数据库
  async init() {
    console.log('开始初始化IndexedDB...');
    
    if (!this.isSupported) {
      const error = new Error('IndexedDB不受支持或不可用');
      console.error('IndexedDB初始化失败:', error.message);
      throw error;
    }

    if (this.db) {
      console.log('IndexedDB已经初始化，直接返回');
      return this.db;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`尝试打开IndexedDB数据库: ${this.dbName}, 版本: ${this.version}`);
        const request = indexedDB.open(this.dbName, this.version);
        
        request.onerror = (event) => {
          const error = request.error || event.target?.error || new Error('IndexedDB打开失败');
          console.error('IndexedDB打开失败详情:', {
            error: error,
            errorName: error.name,
            errorMessage: error.message,
            errorCode: error.code,
            event: event
          });
          reject(error);
        };
        
        request.onsuccess = (event) => {
          console.log('IndexedDB打开成功');
          this.db = request.result;
          
          // 添加数据库错误处理
          this.db.onerror = (dbEvent) => {
            console.error('IndexedDB运行时错误:', dbEvent.target?.error);
          };
          
          // 添加数据库关闭处理
          this.db.onclose = () => {
            console.warn('IndexedDB连接已关闭，将在下次使用时重新连接');
            this.db = null;
          };
          
          // 添加版本变更处理
          this.db.onversionchange = () => {
            console.warn('IndexedDB版本发生变更，关闭当前连接');
            this.db.close();
            this.db = null;
          };
          
          console.log('IndexedDB初始化成功，数据库版本:', this.db.version);
          resolve(this.db);
        };
        
        request.onupgradeneeded = (event) => {
          console.log('IndexedDB需要升级，当前版本:', event.oldVersion, '目标版本:', event.newVersion);
          
          try {
            const db = event.target.result;
            
            // 创建 articles 对象存储
            if (!db.objectStoreNames.contains('articles')) {
              console.log('创建articles对象存储');
              const articlesStore = db.createObjectStore('articles', { keyPath: 'id', autoIncrement: true });
              articlesStore.createIndex('messageId', 'messageId', { unique: false });
              articlesStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
            
            // favorites表已移除，不再需要创建
            
            // 创建 categories 对象存储
            if (!db.objectStoreNames.contains('categories')) {
              console.log('创建categories对象存储');
              const categoriesStore = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
              categoriesStore.createIndex('name', 'name', { unique: true });
            }
            
            console.log('IndexedDB数据库结构创建完成');
          } catch (upgradeError) {
            console.error('IndexedDB升级失败详情:', {
              error: upgradeError,
              errorName: upgradeError.name,
              errorMessage: upgradeError.message,
              stack: upgradeError.stack
            });
            reject(upgradeError);
          }
        };
        
        request.onblocked = (event) => {
          console.warn('IndexedDB打开被阻塞，可能有其他标签页正在使用数据库');
        };
        
      } catch (initError) {
        console.error('IndexedDB初始化异常详情:', {
          error: initError,
          errorName: initError.name,
          errorMessage: initError.message,
          stack: initError.stack
        });
        reject(initError);
      }
    });
  }

  // 确保数据库已初始化
  async ensureDB() {
    if (!this.db) {
      await this.init();
    }
    return this.db;
  }

  // 通用的事务执行函数
  async executeTransaction(storeName, mode, operation) {
    await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      try {
        console.log(`开始执行事务: 存储=${storeName}, 模式=${mode}`);
        
        // 检查存储是否存在
        if (!this.db.objectStoreNames.contains(storeName)) {
          const error = new Error(`对象存储 '${storeName}' 不存在`);
          console.error('事务失败:', error.message);
          reject(error);
          return;
        }
        
        const transaction = this.db.transaction([storeName], mode);
        const store = transaction.objectStore(storeName);
        
        transaction.onerror = (event) => {
          const error = transaction.error || event.target?.error || new Error('事务执行失败');
          console.error('事务执行失败详情:', {
            storeName,
            mode,
            error: error,
            errorName: error.name,
            errorMessage: error.message
          });
          reject(error);
        };
        
        transaction.onabort = (event) => {
          const error = transaction.error || new Error('事务被中止');
          console.error('事务被中止:', {
            storeName,
            mode,
            error: error
          });
          reject(error);
        };
        
        transaction.oncomplete = () => {
          console.log(`事务完成: 存储=${storeName}, 模式=${mode}`);
        };
        
        const request = operation(store);
        if (request) {
          request.onsuccess = () => {
            console.log(`操作成功: 存储=${storeName}, 模式=${mode}`);
            resolve(request.result);
          };
          request.onerror = (event) => {
            const error = request.error || event.target?.error || new Error('请求执行失败');
            console.error('请求执行失败详情:', {
              storeName,
              mode,
              error: error,
              errorName: error.name,
              errorMessage: error.message
            });
            reject(error);
          };
        } else {
          // 如果没有返回请求对象，直接resolve
          resolve();
        }
      } catch (error) {
        console.error('事务创建失败详情:', {
          storeName,
          mode,
          error: error,
          errorName: error.name,
          errorMessage: error.message,
          stack: error.stack
        });
        reject(error);
      }
    });
  }

  // 获取所有数据
  async getAll(storeName) {
    return this.executeTransaction(storeName, 'readonly', (store) => {
      return store.getAll();
    });
  }

  // 根据键获取数据
  async get(storeName, key) {
    return this.executeTransaction(storeName, 'readonly', (store) => {
      return store.get(key);
    });
  }

  // 添加数据
  async add(storeName, data) {
    return this.executeTransaction(storeName, 'readwrite', (store) => {
      return store.add(data);
    });
  }

  // 更新数据
  async put(storeName, data) {
    return this.executeTransaction(storeName, 'readwrite', (store) => {
      return store.put(data);
    });
  }

  // 删除数据
  async delete(storeName, key) {
    return this.executeTransaction(storeName, 'readwrite', (store) => {
      return store.delete(key);
    });
  }

  // 清空存储
  async clear(storeName) {
    return this.executeTransaction(storeName, 'readwrite', (store) => {
      return store.clear();
    });
  }

  // 根据索引查询
  async getByIndex(storeName, indexName, value) {
    return this.executeTransaction(storeName, 'readonly', (store) => {
      const index = store.index(indexName);
      return index.get(value);
    });
  }

  // 根据索引获取所有匹配的数据
  async getAllByIndex(storeName, indexName, value) {
    return this.executeTransaction(storeName, 'readonly', (store) => {
      const index = store.index(indexName);
      return index.getAll(value);
    });
  }

  // 关闭数据库连接
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('IndexedDB 连接已关闭');
    }
  }
}

// 创建全局数据库实例
const chatKeeperDB = new ChatKeeperDB();

// 导出数据库实例（用于模块化环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChatKeeperDB, chatKeeperDB };
}

// 全局可用（用于浏览器环境）
if (typeof window !== 'undefined') {
  window.ChatKeeperDB = ChatKeeperDB;
  window.chatKeeperDB = chatKeeperDB;
}