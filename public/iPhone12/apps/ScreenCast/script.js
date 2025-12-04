/**
 * 屏幕投屏 App 主要脚本
 * 专门用于屏幕分享和投屏功能
 */

// 全局变量
let currentStream = null;
let isStreaming = false;
let castHistory = [];

/**
 * 页面加载完成后初始化应用
 */
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

/**
 * 初始化应用程序
 * @description 设置事件监听器和初始状态
 */
function initializeApp() {
    // 绑定投屏按钮事件
    const screenCastBtn = document.querySelector('#screenCast .cast-btn');
    const tabCastBtn = document.querySelector('#tabCast .cast-btn');
    const cameraCastBtn = document.querySelector('#cameraCast .cast-btn');
    const stopCastBtn = document.getElementById('stopCast');

    screenCastBtn.addEventListener('click', () => startScreenCast('screen'));
    tabCastBtn.addEventListener('click', () => startScreenCast('tab'));
    cameraCastBtn.addEventListener('click', () => startScreenCast('camera'));
    stopCastBtn.addEventListener('click', stopCast);

    // 检测浏览器支持
    checkBrowserSupport();
    
    console.log('屏幕投屏 App 初始化完成');
}

/**
 * 检测浏览器支持情况
 */
function checkBrowserSupport() {
    const support = {
        screenCapture: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
        camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        webRTC: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection)
    };

    console.log('浏览器支持情况:', support);

    // 根据支持情况禁用相应功能
    if (!support.screenCapture) {
        disableCastOption('screenCast', '浏览器不支持屏幕捕获');
        disableCastOption('tabCast', '浏览器不支持屏幕捕获');
    }

    if (!support.camera) {
        disableCastOption('cameraCast', '浏览器不支持摄像头访问');
    }
}

/**
 * 禁用投屏选项
 * @param {string} optionId - 选项ID
 * @param {string} reason - 禁用原因
 */
function disableCastOption(optionId, reason) {
    const option = document.getElementById(optionId);
    const btn = option.querySelector('.cast-btn');
    
    btn.disabled = true;
    btn.textContent = '不支持';
    btn.style.background = '#ccc';
    btn.style.cursor = 'not-allowed';
    
    const desc = option.querySelector('p');
    desc.textContent = reason;
    desc.style.color = '#999';
}

/**
 * 开始投屏
 * @param {string} type - 投屏类型 ('screen', 'tab', 'camera')
 */
async function startScreenCast(type) {
    if (isStreaming) {
        showNotification('已有投屏正在进行中');
        return;
    }

    try {
        showNotification('正在启动投屏...');
        
        let stream;
        let castName;

        switch (type) {
            case 'screen':
                stream = await getScreenStream();
                castName = '屏幕投屏';
                break;
            case 'tab':
                stream = await getTabStream();
                castName = '标签页投屏';
                break;
            case 'camera':
                stream = await getCameraStream();
                castName = '摄像头投屏';
                break;
            default:
                throw new Error('未知的投屏类型');
        }

        if (stream) {
            await setupCasting(stream, castName, type);
            showNotification(`${castName}已开始`);
        }

    } catch (error) {
        console.error('投屏启动失败:', error);
        handleCastError(error);
    }
}

/**
 * 获取屏幕流
 */
async function getScreenStream() {
    const settings = getStreamSettings();
    
    return await navigator.mediaDevices.getDisplayMedia({
        video: {
            width: { ideal: settings.width },
            height: { ideal: settings.height },
            frameRate: { ideal: settings.frameRate }
        },
        audio: settings.includeAudio
    });
}

/**
 * 获取标签页流
 */
async function getTabStream() {
    const settings = getStreamSettings();
    
    return await navigator.mediaDevices.getDisplayMedia({
        video: {
            mediaSource: 'browser',
            width: { ideal: settings.width },
            height: { ideal: settings.height },
            frameRate: { ideal: settings.frameRate }
        },
        audio: settings.includeAudio
    });
}

/**
 * 获取摄像头流
 */
async function getCameraStream() {
    const settings = getStreamSettings();
    
    return await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: settings.width },
            height: { ideal: settings.height },
            frameRate: { ideal: settings.frameRate }
        },
        audio: settings.includeAudio
    });
}

/**
 * 获取流设置
 */
function getStreamSettings() {
    const quality = document.getElementById('videoQuality').value;
    const frameRate = parseInt(document.getElementById('frameRate').value);
    const includeAudio = document.getElementById('includeAudio').checked;

    let width, height;
    switch (quality) {
        case '1080p':
            width = 1920;
            height = 1080;
            break;
        case '720p':
            width = 1280;
            height = 720;
            break;
        case '480p':
            width = 854;
            height = 480;
            break;
        default:
            width = 1280;
            height = 720;
    }

    return { width, height, frameRate, includeAudio };
}

/**
 * 设置投屏
 * @param {MediaStream} stream - 媒体流
 * @param {string} castName - 投屏名称
 * @param {string} type - 投屏类型
 */
async function setupCasting(stream, castName, type) {
    currentStream = stream;
    isStreaming = true;

    // 设置到主窗口供Television组件使用
    if (window.parent && window.parent.parent) {
        window.parent.parent.currentCaptureStream = stream;
        console.log('投屏流已设置到主窗口');
    }

    // 显示投屏状态
    showCastStatus(castName, type);

    // 设置预览
    setupPreview(stream);

    // 发送投屏消息到3D场景
    sendCastMessage(castName, type);

    // 添加到历史记录
    addToHistory(castName, type);

    // 监听流结束事件
    stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
            console.log('投屏流已结束');
            stopCast();
        });
    });
}

/**
 * 显示投屏状态
 * @param {string} castName - 投屏名称
 * @param {string} type - 投屏类型
 */
function showCastStatus(castName, type) {
    const statusDiv = document.getElementById('castStatus');
    const statusText = document.getElementById('statusText');
    
    statusText.textContent = `正在进行 ${castName}`;
    statusDiv.style.display = 'block';

    // 隐藏投屏选项
    document.querySelector('.cast-options').style.display = 'none';
}

/**
 * 设置预览
 * @param {MediaStream} stream - 媒体流
 */
function setupPreview(stream) {
    const previewVideo = document.getElementById('previewVideo');
    previewVideo.srcObject = stream;
}

/**
 * 发送投屏消息到3D场景
 * @param {string} castName - 投屏名称
 * @param {string} type - 投屏类型
 */
function sendCastMessage(castName, type) {
    const message = {
        type: 'VIDEO_CONTROL',
        action: 'PLAY_CAPTURE',
        videoFileName: castName,
        videoSource: `screencast_${type}`,
        videoId: `cast_${Date.now()}`,
        hasStream: true
    };

    // 发送到父窗口
    if (window.parent && window.parent.parent) {
        window.parent.parent.postMessage(message, '*');
        console.log('投屏消息已发送:', message);
    }
}

/**
 * 添加到历史记录
 * @param {string} castName - 投屏名称
 * @param {string} type - 投屏类型
 */
function addToHistory(castName, type) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    const historyItem = {
        time: timeStr,
        name: castName,
        type: type,
        timestamp: now.getTime()
    };

    castHistory.unshift(historyItem);
    
    // 只保留最近10条记录
    if (castHistory.length > 10) {
        castHistory = castHistory.slice(0, 10);
    }

    updateHistoryDisplay();
}

/**
 * 更新历史记录显示
 */
function updateHistoryDisplay() {
    const historyList = document.getElementById('historyList');
    
    if (castHistory.length === 0) {
        historyList.innerHTML = `
            <div class="history-item">
                <span class="history-time">--</span>
                <span class="history-desc">暂无投屏记录</span>
            </div>
        `;
        return;
    }

    historyList.innerHTML = castHistory.map(item => `
        <div class="history-item">
            <span class="history-time">${item.time}</span>
            <span class="history-desc">${item.name}</span>
        </div>
    `).join('');
}

/**
 * 停止投屏
 */
function stopCast() {
    if (!isStreaming) return;

    try {
        // 停止所有轨道
        if (currentStream) {
            currentStream.getTracks().forEach(track => {
                track.stop();
            });
            currentStream = null;
        }

        // 清理主窗口的流
        if (window.parent && window.parent.parent) {
            window.parent.parent.currentCaptureStream = null;
            window.parent.parent.currentCaptureVideo = null;
        }

        // 重置状态
        isStreaming = false;

        // 隐藏投屏状态
        document.getElementById('castStatus').style.display = 'none';
        
        // 显示投屏选项
        document.querySelector('.cast-options').style.display = 'flex';

        // 清空预览
        const previewVideo = document.getElementById('previewVideo');
        previewVideo.srcObject = null;

        showNotification('投屏已停止');
        console.log('投屏已停止');

    } catch (error) {
        console.error('停止投屏时出错:', error);
        showNotification('停止投屏时出错');
    }
}

/**
 * 处理投屏错误
 * @param {Error} error - 错误对象
 */
function handleCastError(error) {
    let message = '投屏失败';

    if (error.name === 'NotAllowedError') {
        message = '用户拒绝了权限请求';
    } else if (error.name === 'NotFoundError') {
        message = '未找到可用的媒体设备';
    } else if (error.name === 'NotSupportedError') {
        message = '浏览器不支持此功能';
    } else if (error.name === 'NotReadableError') {
        message = '设备正在被其他应用使用';
    } else if (error.message) {
        message = error.message;
    }

    showNotification(message);
}

/**
 * 显示通知消息
 * @param {string} message - 通知消息
 */
function showNotification(message) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    // 设置样式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 24px;
        font-size: 14px;
        z-index: 9999;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        animation: slideInDown 0.3s ease-out;
    `;
    
    // 添加动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInDown {
            from {
                opacity: 0;
                transform: translateX(-50%) translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        }
    `;
    document.head.appendChild(style);
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 3秒后移除
    setTimeout(() => {
        notification.style.animation = 'slideInDown 0.3s ease-out reverse';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 300);
    }, 3000);
}

/**
 * 处理页面卸载
 */
window.addEventListener('beforeunload', () => {
    if (isStreaming) {
        stopCast();
    }
});

console.log('屏幕投屏 App 脚本加载完成');