// PDF预览页面的JavaScript代码

// 自定义mytag插件
function markdownitMytag(md) {
    const mytagRegex = /<!--\s*mytag:start\s*-->([\s\S]*?)<!--\s*mytag:end\s*-->/g;
    let questionIndex = 0;
    
    md.core.ruler.before('normalize', 'mytag', function(state) {
        state.src = state.src.replace(mytagRegex, function(match, content) {
            const trimmedContent = content.trim();
            const result = `<div class="my-question" id="question-${questionIndex}"><p>${trimmedContent}</p></div>`;
            questionIndex++;
            return result;
        });
    });
}

// 初始化 markdown-it：保留旧字符串渲染实例 + 新结构两套实例
const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true
})
.use(window.markdownitEmoji)
.use(window.markdownitTaskLists, { enabled: true })
.use(window.markdownitKatex, {
    throwOnError: false,
    errorColor: ' #cc0000'
})
.use(markdownitMytag);

const mdHtml = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true
})
.use(window.markdownitEmoji)
.use(window.markdownitTaskLists, { enabled: true })
.use(window.markdownitKatex, {
    throwOnError: false,
    errorColor: ' #cc0000'
});

const mdNoImg = window.markdownit({
    html: false, // 禁用内联HTML，防止 <img> 渲染
    linkify: true,
    typographer: true,
    breaks: true
})
.use(window.markdownitEmoji)
.use(window.markdownitTaskLists, { enabled: true })
.use(window.markdownitKatex, {
    throwOnError: false,
    errorColor: ' #cc0000'
});

// 禁用 markdown 图片渲染（如 ![alt](url)），输出占位文本
mdNoImg.renderer.rules.image = function () {
    return '<span class="md-image-disabled">[image]</span>';
};

// 从URL参数获取数据
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const rawContent = params.get('content') || '';
    let content = '';
    let contentArray = null;
    try {
        const decoded = decodeURIComponent(rawContent);
        // 尝试解析为数组结构
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed)) {
            contentArray = parsed;
        } else {
            content = decoded;
        }
    } catch (e) {
        // 非 JSON，按字符串处理
        content = decodeURIComponent(rawContent);
    }
    return {
        title: params.get('title') || 'Untitled Document',
        content,
        contentArray,
        date: params.get('date') || new Date().toLocaleString('zh-CN')
    };
}

// 提取目录 - 从my-question元素获取
function extractTOC(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const myQuestions = tempDiv.querySelectorAll('.my-question');
    
    if (myQuestions.length <= 1) {
        return null;
    }
    
    const toc = [];
    myQuestions.forEach((question, index) => {
        const id = `question-${index}`;
        question.id = id;
        const questionText = question.querySelector('p') ? question.querySelector('p').textContent : question.textContent;
        toc.push({
            id: id,
            text: questionText,
            level: 1 // 所有问题都是同一级别
        });
    });
    
    return {
        toc: toc,
        html: tempDiv.innerHTML
    };
}

// 生成目录HTML
function generateTOCHTML(toc) {
    // 将目录项中的所有 HTML 标签作为字符串展示（转义），防止被渲染
    const escape = (text) => {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    };
    let html = '';
    toc.forEach((item) => {
        html += `<li><a href="#${item.id}">${escape(item.text)}</a></li>`;
    });
    return html;
}

// 初始化页面
function initPage() {
    const params = getUrlParams();
    
    
    // 标题渲染逻辑：与详情抽屉一致，且截断到约20字符
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    function renderTitleWithImgAsString(text) {
        // 保持与详情抽屉一致：整体进行HTML转义，确保<img>等标签以字符串呈现
        return escapeHtml(text || '');
    }
    const displayTitle = renderTitleWithImgAsString(params.title || 'Untitled');
    const titleEl = document.getElementById('drawerTitleText');
    if (titleEl) {
        titleEl.innerHTML = displayTitle;
    }
    
    // 渲染内容：数组结构与详情抽屉一致；旧字符串走 mytag 插件解析
    let html = '';
    if (Array.isArray(params.contentArray)) {
        const sanitizeLocalImages = (html) => {
            try {
                return html
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
        html = params.contentArray.map(entry => {
            const qHtml = `<div class="my-question"><p>${renderTitleWithImgAsString(entry.title || '')}</p></div>`;
            const rawHtml = (entry.type === 'img' || entry.type === 'html')
                ? mdHtml.render(entry.answer || '')
                : mdNoImg.render(entry.answer || '');
            const aHtml = sanitizeLocalImages(rawHtml);
            return `${qHtml}\n${aHtml}`;
        }).join('\n');
    } else {
        html = md.render(params.content || '');
    }
    
    // 提取目录
    const tocResult = extractTOC(html);
    const tocContainer = document.getElementById('toc-container');
    const tocList = document.getElementById('toc-list');
    const contentEl = document.getElementById('markdown-content');
    const articleTitle = document.querySelector('.article-title');

    if (tocResult && tocResult.toc.length > 0) {
        // 多条对话：隐藏顶部标题，避免与第一条问题重复
        if (articleTitle) articleTitle.style.display = 'none';
        // 显示目录
        if (tocContainer) tocContainer.style.display = 'block';
        if (tocList) tocList.innerHTML = generateTOCHTML(tocResult.toc);
        if (contentEl) { contentEl.innerHTML = tocResult.html; hydrateLocalImages(contentEl); }
    } else {
        // 单条或无对话：若只有一个my-question则隐藏顶部标题以避免重复
        try {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const count = tmp.querySelectorAll('.my-question').length;
            if (count === 1) {
                if (articleTitle) articleTitle.style.display = 'none';
            } else {
                if (articleTitle) articleTitle.style.display = 'block';
            }
        } catch (_) {
            if (articleTitle) articleTitle.style.display = 'block';
        }
        // 没有目录：移除目录容器，避免打印出现空白目录页
        if (tocContainer && tocContainer.parentNode) {
            tocContainer.parentNode.removeChild(tocContainer);
        }
        if (contentEl) { contentEl.innerHTML = html; hydrateLocalImages(contentEl); }
        // 无目录场景：让首页也显示页码（覆盖默认隐藏规则）
        const style = document.createElement('style');
        style.textContent = `@page :first { @bottom-right { content: "Page " counter(page); font-size: 10px; color: #666; } }`;
        document.head.appendChild(style);
    }
}

// 水合本地图片：根据 data-src="ck-local://filename" 设置真实 blob URL 到 src
async function hydrateLocalImages(container) {
    try {
        if (!container) return;
        if (!window.FileManager) return;
        const imgs = Array.from(container.querySelectorAll('img'));
        if (!imgs.length) return;
        for (const img of imgs) {
            const dataSrc = img.getAttribute('data-src') || '';
            if (!/^ck-local:\/\//.test(dataSrc)) continue;
            const filename = dataSrc.replace(/^ck-local:\/\//, '');
            const blobUrl = await window.FileManager.getBlobUrlForFilename(filename);
            if (blobUrl) {
                img.setAttribute('src', blobUrl);
            }
        }
    } catch (e) {
        console.warn('hydrateLocalImages (pdf-preview) exception:', e);
    }
}

// 打印PDF函数
function printPDF() {
    // 生成时间戳格式：年月日时分秒
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}${month}${day}${hour}${minute}${second}`;
    
    // 设置文档标题为默认文件名
    const originalTitle = document.title;
    document.title = `chatgpt-${timestamp}`;
    
    // 监听打印完成事件
    const afterPrint = () => {
        // 恢复原标题
        document.title = originalTitle;
        // 移除事件监听器
        window.removeEventListener('afterprint', afterPrint);
        // 关闭预览窗口
        window.close();
    };
    
    // 添加打印完成事件监听器
    window.addEventListener('afterprint', afterPrint);
    
    // 开始打印
    window.print();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initPage();
    
    // 绑定打印按钮事件
    const printBtn = document.querySelector('.print-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            printPDF();
        });
    }
});
