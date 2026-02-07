/**
 * fileManager.js
 *
 * 封装 Chrome 扩展中使用 File System Access API 的目录授权与图片保存逻辑。
 * 功能点：
 * - 让用户选择本地文件夹并保存到 IndexedDB（可持久化句柄）。
 * - 检测授权状态：若之前已授权并拥有读写权限，则不再弹窗。
 * - 提供 saveImage(blob, filename) 将图片写入授权文件夹，并在 IndexedDB 中保存文件句柄。
 * - 若授权失效或未授权，提示用户重新选择文件夹。
 * - 支持从 HTML 字符串解析 <img> 标签，将图片保存到授权文件夹并记录句柄。
 *
 * 注意：showDirectoryPicker 必须在用户手势触发的上下文中调用（点击、按键）。
 */

// =========================
// IndexedDB 简易封装
// =========================

const DB_NAME = 'fileManagerDB';
const DB_VERSION = 1;
const STORE_SETTINGS = 'settings'; // 存放目录句柄等设置项
const STORE_IMAGES = 'images';     // 存放已保存图片的文件句柄与元信息

/**
 * 打开数据库，初始化对象仓库
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'filename' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(storeName, key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }));
}

function idbPut(storeName, value) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  }));
}

function idbDelete(storeName, key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  }));
}

// =========================
// 文件名生成（时间戳格式，避免重复）
// =========================

function pad2(n) { return String(n).padStart(2, '0'); }
function pad3(n) { return String(n).padStart(3, '0'); }

function generateTimestampFilename(ext) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${pad3(d.getMilliseconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  const safeExt = (ext && /^(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(ext)) ? ext.toLowerCase() : 'png';
  return `chatkeeper-${stamp}-${rand}.${safeExt}`;
}

// =========================
// File System Access 权限封装
// =========================

/**
 * 检查并请求读写权限。
 * @param {FileSystemHandle} handle 目录或文件句柄
 * @param {'read'|'readwrite'} mode 权限模式
 * @returns {Promise<boolean>} 是否拥有授权
 */
async function verifyPermission(handle, mode = 'readwrite') {
  try {
    if (!handle || typeof handle.queryPermission !== 'function') return false;
    const q = await handle.queryPermission({ mode });
    if (q === 'granted') return true;
    if (typeof handle.requestPermission === 'function') {
      const r = await handle.requestPermission({ mode });
      return r === 'granted';
    }
    return false;
  } catch (e) {
    console.warn('verifyPermission error:', e);
    return false;
  }
}

/**
 * 获取保存在 IndexedDB 的目录句柄（若存在）。
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function getSavedDirectoryHandle() {
  const rec = await idbGet(STORE_SETTINGS, 'dirHandle');
  return rec && rec.handle ? rec.handle : null;
}

/**
 * 保存目录句柄到 IndexedDB。
 * @param {FileSystemDirectoryHandle} dirHandle
 */
async function saveDirectoryHandle(dirHandle) {
  await idbPut(STORE_SETTINGS, { key: 'dirHandle', handle: dirHandle, savedAt: Date.now() });
}

/**
 * 让用户选择目录（需用户手势触发），并保存到 IndexedDB。
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function selectDirectory() {
  if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
    alert('当前环境不支持文件系统访问：缺少 showDirectoryPicker。');
    return null;
  }
  try {
    const dir = await window.showDirectoryPicker();
    const ok = await verifyPermission(dir, 'readwrite');
    if (!ok) {
      alert('未授予读写权限，请重试。');
      return null;
    }
    await saveDirectoryHandle(dir);
    return dir;
  } catch (e) {
    console.warn('selectDirectory canceled or failed:', e);
    return null;
  }
}

/**
 * 获取已授权的目录句柄；若无或权限丢失可选择交互授权。
 * @param {{interactive?: boolean}} opts interactive=true 时在权限不足时尝试弹窗授权
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function ensureAuthorizedDirectory(opts = { interactive: false }) {
  const { interactive = false } = opts || {};
  let dir = await getSavedDirectoryHandle();
  if (dir) {
    const ok = await verifyPermission(dir, 'readwrite');
    if (ok) return dir;
  }
  if (!interactive) return null;
  // 权限不足或不存在时，交互式选择目录
  return await selectDirectory();
}

/**
 * 查询授权状态。
 * @returns {Promise<{hasHandle:boolean, granted:boolean}>}
 */
async function getAuthorizationStatus() {
  const dir = await getSavedDirectoryHandle();
  if (!dir) return { hasHandle: false, granted: false };
  const ok = await verifyPermission(dir, 'readwrite');
  return { hasHandle: true, granted: !!ok };
}

// =========================
// 图片保存与 HTML 解析
// =========================

/**
 * 将图片写入授权目录，并将文件句柄保存到 IndexedDB。
 * @param {Blob} blob 图片数据
 * @param {string} filename 目标文件名，如 "chatkeeper-20251109-001.png"
 * @param {{interactive?: boolean}} opts 权限不足时是否交互授权
 * @returns {Promise<{success:boolean, filename?:string, error?:any}>}
 */
async function saveImage(blob, filename, opts = { interactive: true, originalSrc: null }) {
  try {
    // 补全扩展名（若未提供）
    const type = blob && blob.type ? blob.type : '';
    const inferredExt = type.startsWith('image/') ? type.split('/')[1] : null;
    let targetName = filename || generateTimestampFilename(inferredExt);
    if (!/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(targetName)) {
      targetName = generateTimestampFilename(inferredExt);
    }

    // 确保目录授权
    const dir = await ensureAuthorizedDirectory({ interactive: !!opts.interactive });
    if (!dir) {
      alert('未授权或未选择保存目录，请先选择文件夹。');
      return { success: false, error: 'NO_AUTH_DIR' };
    }

    // 创建/获取文件句柄并写入
    const fileHandle = await dir.getFileHandle(targetName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    // 保存文件句柄到 IndexedDB（供后续快速访问）
    await idbPut(STORE_IMAGES, {
      filename: targetName,
      handle: fileHandle,
      mime: type || null,
      savedAt: Date.now(),
      originalSrc: opts && opts.originalSrc ? opts.originalSrc : null,
    });

    return { success: true, filename: targetName };
  } catch (e) {
    console.error('saveImage error:', e);
    return { success: false, error: e };
  }
}

/**
 * 从 HTML 字符串解析 <img> 标签，拉取图片并保存到授权目录。
 * - 支持 dataURL、http(s) URL；CORS 受限的 URL 可能失败。
 * - 文件名自动按前缀与序号生成：chatkeeper-YYYYMMDD-XXX.ext
 * @param {string} html HTML 字符串
 * @returns {Promise<Array<{src:string, result:{success:boolean, filename?:string, error?:any}}>>}
 */
async function saveImagesFromHtml(html) {
  console.log('=============html')
  console.log(html)
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img'));
  // 采用时间戳生成文件名，避免重复覆盖

  const results = [];
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (!src) {
      results.push({ src, result: { success: false, error: 'EMPTY_SRC' } });
      continue;
    }
    try {
      let blob;
      if (src.startsWith('data:')) {
        // dataURL 直接 fetch
        const resp = await fetch(src);
        blob = await resp.blob();
      } else {
        // 远端图片：可能受 CORS 限制
        const resp = await fetch(src, { mode: 'cors', credentials: 'include' }).catch(() => null);
        if (!resp || !resp.ok) throw new Error('FETCH_FAILED');
        blob = await resp.blob();
      }

      const extGuess = (blob.type && blob.type.startsWith('image/')) ? blob.type.split('/')[1] : 'png';
      const filename = generateTimestampFilename(extGuess);
      // 避免再次弹出选择目录窗口：由调用方在用户手势中先确保授权
      const result = await saveImage(blob, filename, { interactive: false, originalSrc: src });
      results.push({ src, result });
    } catch (e) {
      console.warn('saveImagesFromHtml failed for src:', src, e);
      results.push({ src, result: { success: false, error: e } });
    }
  }
  return results;
}

// =========================
// 初始化入口
// =========================

/**
 * 初始化：检查是否已有文件夹句柄与权限。
 * - 注意：不会主动弹授权弹窗（需用户手势），仅检测并返回状态。
 * @returns {Promise<{hasHandle:boolean, granted:boolean}>}
 */
async function init() {
  return await getAuthorizationStatus();
}

// =========================
// 暴露到全局（content script 环境）
// =========================

const FileManager = {
  init,
  selectDirectory,
  ensureAuthorizedDirectory,
  getAuthorizationStatus,
  getSavedDirectoryHandle,
  // 暴露保存目录句柄方法，便于跨页面更新到当前页面的 IndexedDB
  saveDirectoryHandle,
  saveImage,
  saveImagesFromHtml,
  // 暴露权限验证方法，便于在不同来源页面重新请求授权
  verifyPermission,
  /**
   * 根据文件名获取 Blob URL，用于页面展示。
   * @param {string} filename
   * @returns {Promise<string|null>} blob URL 或 null
   */
  async getBlobUrlForFilename(filename) {
    try {
      // 1) 优先使用已保存的文件句柄（同源 IndexedDB）
      const rec = await idbGet(STORE_IMAGES, filename);
      if (rec && rec.handle) {
        try {
          const file = await rec.handle.getFile();
          const url = URL.createObjectURL(file);
          return url;
        } catch (err) {
          console.warn('getBlobUrlForFilename: handle.getFile failed, will fallback to dirHandle', err);
        }
      }

      // 2) 回退：尝试使用目录句柄按文件名获取文件
      const dir = await getSavedDirectoryHandle();
      if (!dir) {
        // 在当前页面的 IndexedDB 下未保存目录句柄，返回 null；
        // 需要用户在此页面重新授权选择保存目录。
        return null;
      }
      const hasPerm = await verifyPermission(dir, 'read');
      if (!hasPerm) {
        const granted = await verifyPermission(dir, 'readwrite');
        if (!granted) return null;
      }
      try {
        const fileHandle = await dir.getFileHandle(filename, { create: false });
        const file = await fileHandle.getFile();
        const url = URL.createObjectURL(file);
        // 写回 images store，以便下次直接命中
        try {
          await idbPut(STORE_IMAGES, { filename, handle: fileHandle, mime: file.type || null, savedAt: Date.now() });
        } catch (idbErr) {
          // 某些环境下 FileSystemFileHandle 可能无法结构化克隆到 IndexedDB
          console.warn('getBlobUrlForFilename: idbPut handle failed, store metadata only', idbErr);
          try {
            await idbPut(STORE_IMAGES, { filename, mime: file.type || null, savedAt: Date.now() });
          } catch (idbErr2) {
            console.warn('getBlobUrlForFilename: idbPut metadata failed', idbErr2);
          }
        }
        return url;
      } catch (err2) {
        console.warn('getBlobUrlForFilename: dir.getFileHandle failed', err2);
        return null;
      }
    } catch (e) {
      console.warn('getBlobUrlForFilename error:', e);
      return null;
    }
  },
};

try {
  if (typeof window !== 'undefined') {
    window.FileManager = FileManager;
  }
} catch (e) {
  // noop
}