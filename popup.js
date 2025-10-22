// popup.js - 处理popup页面的交互逻辑

document.addEventListener('DOMContentLoaded', function() {
  // 初始化popup页面
  initializePopup();
  
  // 绑定事件监听器
  bindEventListeners();
});

function initializePopup() {
  // 更新订阅信息显示
  updateSubscriptionInfo();
  
  // 检查插件状态
  checkExtensionStatus();
}

function updateSubscriptionInfo() {
  // 模拟订阅数据
  const mockSubscriptionData = {
    planName: 'Pro会员',
    status: 'active',
    expiryDate: '2024-12-31',
    remainingDays: 365,
    usageCount: 1234,
    usageLimit: '无限制'
  };
  
  // 更新界面显示
  const planNameEl = document.querySelector('.plan-name');
  const planStatusEl = document.querySelector('.plan-status');
  const expiryDateEl = document.querySelector('.detail-item:nth-child(1) .value');
  const remainingDaysEl = document.querySelector('.detail-item:nth-child(2) .value');
  const usageCountEl = document.querySelector('.detail-item:nth-child(3) .value');
  
  if (planNameEl) planNameEl.textContent = mockSubscriptionData.planName;
  if (planStatusEl) {
    planStatusEl.textContent = mockSubscriptionData.status === 'active' ? '已激活' : '未激活';
    planStatusEl.className = `plan-status ${mockSubscriptionData.status}`;
  }
  if (expiryDateEl) expiryDateEl.textContent = mockSubscriptionData.expiryDate;
  if (remainingDaysEl) remainingDaysEl.textContent = `${mockSubscriptionData.remainingDays}天`;
  if (usageCountEl) usageCountEl.textContent = `${mockSubscriptionData.usageCount.toLocaleString()} / ${mockSubscriptionData.usageLimit}`;
}

function checkExtensionStatus() {
  // 检查content script是否正常运行
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    if (currentTab && (currentTab.url.includes('chatgpt.com') || currentTab.url.includes('chat.openai.com'))) {
      // 发送消息到content script检查状态
      chrome.tabs.sendMessage(currentTab.id, {action: 'checkStatus'}, function(response) {
        if (chrome.runtime.lastError) {
          console.log('Content script not loaded yet');
        } else {
          console.log('Extension is working properly');
        }
      });
    }
  });
}

function bindEventListeners() {
  // View More按钮点击事件
  const popupViewMoreBtn = document.getElementById('popupViewMoreBtn');
  if (popupViewMoreBtn) {
    popupViewMoreBtn.addEventListener('click', function() {
      chrome.runtime.sendMessage({action: 'openOptionsPage'});
      window.close(); // 关闭popup窗口
    });
  }
  
  // 设置按钮点击事件
  const settingsBtn = document.getElementById('openSettings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function() {
      // 打开设置页面或显示设置选项
      showNotification('设置功能开发中...');
    });
  }
  
  // 反馈按钮点击事件
  const feedbackBtn = document.getElementById('feedback');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', function() {
      // 打开反馈页面
      chrome.tabs.create({
        url: 'mailto:support@example.com?subject=ChatGPT对话目录插件反馈'
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

// 监听来自content script的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'updatePopup') {
    // 更新popup界面数据
    updateSubscriptionInfo();
  }
});