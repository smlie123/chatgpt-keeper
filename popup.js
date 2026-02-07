// popup.js - 处理popup页面的交互逻辑

document.addEventListener('DOMContentLoaded', function() {
  initializePopup();
  bindEventListeners();
});

function initializePopup() {
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  if (loadingEl) loadingEl.style.display = 'none';
  if (contentEl) {
    contentEl.style.display = 'block';
    contentEl.innerHTML = `
      <div class="popup-body">
            <div class="popup-title">Momory</div>
            <div class="popup-subtitle" style="font-size: 12px; color: #666; margin-bottom: 12px;">AI conversation manager for ChatGPT, Claude, and Gemini</div>
            <div class="popup-description">
          <div class="popup-label">How to use</div>
          <ul class="popup-steps">
            <li>This extension only works on ChatGPT pages and shows an icon on the side.</li>
            <li>Use the Momory icon on the left side of the page to open the outline.</li>
            <li>Drag the icon up or down to place it where you like.</li>
          </ul>
        </div>
      </div>
    `;
  }
}


function bindEventListeners() {
  // View More按钮点击事件
  const popupViewMoreBtn = document.getElementById('popupViewMoreBtn');
  if (popupViewMoreBtn) {
    popupViewMoreBtn.addEventListener('click', function() {
      chrome.runtime.sendMessage({action: 'openOptionsPage'}, () => {
        // Ignored response, just ensure message is sent
        window.close();
      });
    });
  }
  // 右侧对齐的 link btn 仅按钮可点，无需整块可点
  
  // 设置按钮点击事件
  const settingsBtn = document.getElementById('openSettings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function() {
      // 打开设置页面或显示设置选项
      showNotification('Settings feature under development...');
    });
  }
  
  // 反馈按钮点击事件
  const feedbackBtn = document.getElementById('feedback');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', function() {
      // 打开反馈页面
      chrome.tabs.create({
        url: 'mailto:support@example.com?subject=ChatGPT Conversation Directory Plugin Feedback'
      });
    });
  }
}

function showNotification(message) {
  // 创建临时通知
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: white;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 13px;
    z-index: 1000;
    animation: fadeInOut 2s ease-in-out;
  `;
  notification.textContent = message;
  
  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      20%, 80% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(notification);
  
  // 2秒后移除通知
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    }
  }, 2000);
}
