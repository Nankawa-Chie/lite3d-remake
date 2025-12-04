// =================================================================
// START OF FINAL script.js
// =================================================================

/**
 * ===================================================================
 *                    FINAL AND MOST ROBUST PARSER
 * ===================================================================
 * 解析 SRT 字幕文件，對各種格式錯誤具有高容錯性
 * @param {string} srtContent - SRT 文件的文本內容
 * @returns {Array<{start: number, end: number, text: string}>}
 */
function parseSRT(srtContent) {
  const subtitles = [];

  // 時間字符串轉換為秒
  const timeToSeconds = (timeStr) => {
    // 增加對 HH:MM:SS.ms 格式的兼容
    timeStr = timeStr.replace(".", ",");
    const parts = timeStr.split(":");
    if (parts.length !== 3) return 0;
    const secondsParts = parts[2].split(",");
    if (secondsParts.length !== 2) return 0;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = parseInt(secondsParts[1], 10);

    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
      return 0;
    }

    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  };

  // 1. 統一換行符
  const normalizedContent = srtContent.trim().replace(/\r\n/g, "\n");

  // 2. 核心修改：不再依賴空行，而是根據字幕塊的數字索引來分割
  // 正則表達式解釋：/\n(?=\d+\n)/ 查找一個換行符，其後緊跟著 (一個或多個數字 + 一個換行符)
  // 這能準確地在每個字幕塊的數字索引前進行分割
  const blocks = normalizedContent.split(/\n(?=\d+\n)/);

  blocks.forEach((block) => {
    // 清理每個塊的首尾空白
    const trimmedBlock = block.trim();
    if (!trimmedBlock) return; // 如果是空塊，跳過

    const lines = trimmedBlock.split("\n");

    // 尋找時間行 '-->'
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex === -1) return; // 沒找到時間行，不是有效的字幕塊

    const timeLine = lines[timeLineIndex];
    const textLines = lines
      .slice(timeLineIndex + 1)
      .map((line) => line.trim())
      .join(" ");

    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);

    if (timeMatch && textLines) {
      const start = timeToSeconds(timeMatch[1]);
      const end = timeToSeconds(timeMatch[2]);
      if (start < end) {
        // 確保時間是有效的
        subtitles.push({start, end, text: textLines});
      }
    }
  });

  return subtitles;
}

// 全局變量
let videoPlayer, videoElement;

document.addEventListener("DOMContentLoaded", function () {
  const videoItems = document.querySelectorAll(".video-item");
  videoPlayer = document.querySelector(".video-player");
  videoElement = videoPlayer.querySelector("video");

  // =====================================================================
  // START OF DIAGNOSTIC VERSION - 請用這段代碼替換您文件中的相應部分
  // =====================================================================
  videoItems.forEach(function (item) {
    item.addEventListener("click", async function () {
      console.log("================= NEW CLICK EVENT =================");
      const videoSrc = this.getAttribute("data-video-src");
      const srtSrc = videoSrc.replace(/\.[^/.]+$/, ".srt");
      console.log(`Attempting to load video: ${videoSrc} and subtitles: ${srtSrc}`);

      let subtitles = null;
      try {
        const response = await fetch(srtSrc);
        console.log(`Fetch response for ${srtSrc}:`, response);

        if (response.ok) {
          const srtContent = await response.text();

          // --- 核心日誌 1: 查看獲取到的原始文本 ---
          console.log("--- Fetched SRT Content Start ---");
          console.log(srtContent);
          console.log("--- Fetched SRT Content End ---");

          try {
            subtitles = parseSRT(srtContent);

            // --- 核心日誌 2: 查看解析後的結果 ---
            console.log("Parsed Subtitles Array:", subtitles);
            console.log("Number of subtitles found:", subtitles ? subtitles.length : "null");

            if (!subtitles || subtitles.length === 0) {
              console.error("WARNING: Parsing resulted in an empty subtitle array. Check SRT file format.");
            }
          } catch (parseError) {
            // --- 核心日誌 3: 捕捉解析函數本身是否出錯 ---
            console.error("FATAL: The parseSRT function crashed!", parseError);
            subtitles = []; // 確保即使解析失敗，也不會發送 null
          }
        } else {
          console.error(`SRT file not found or failed to load: ${srtSrc}. Status: ${response.status}`);
        }
      } catch (fetchError) {
        console.error(`Network error while fetching SRT file: ${fetchError}`);
      }

      // 即使字幕失敗，也繼續播放視頻
      videoElement.src = videoSrc;
      videoPlayer.style.display = "flex";
      videoElement.load();

      const videoFileName = videoSrc.substring(videoSrc.lastIndexOf("/") + 1);
      broadcastMessage({
        type: "VIDEO_CONTROL",
        action: "PLAY",
        videoURL: videoSrc,
        videoFileName: videoFileName,
        subtitles: subtitles || [], // 確保始終發送一個數組，而不是 null
      });
    });
  });
  // =====================================================================
  // END OF DIAGNOSTIC VERSION
  // =====================================================================

  const screenMirroringButton = document.getElementById("screenMirroring");
  screenMirroringButton.addEventListener("click", async function () {
    if (!videoElement || !videoElement.src) {
      console.warn("No video is currently loaded.");
      return;
    }
    const videoURL = videoElement.src;
    const videoFileName = videoURL.substring(videoURL.lastIndexOf("/") + 1);
    const srtSrc = videoURL.replace(/\.[^/.]+$/, ".srt");

    let currentSubtitles = null;
    try {
      const response = await fetch(srtSrc);
      if (response.ok) {
        const srtContent = await response.text();
        currentSubtitles = parseSRT(srtContent);
      }
    } catch (error) {
      console.error("Error fetching subtitles for mirroring:", error);
    }

    broadcastMessage({
      type: "VIDEO_CONTROL",
      action: "PLAY",
      videoURL: videoURL,
      videoFileName: videoFileName,
      subtitles: currentSubtitles,
    });
  });

  const closeButton = document.getElementById("closeVideoPlayer");
  closeButton.addEventListener("click", function () {
    if (videoElement) {
      videoElement.pause();
      videoElement.src = "";
    }
    if (videoPlayer) {
      videoPlayer.style.display = "none";
    }
  });
});

/**
 * NEW AND IMPROVED broadcastMessage FUNCTION
 */
function broadcastMessage(message) {
  // 使用 '*' 作为目标源，这允许向任何源的父窗口发送消息。
  // 在 iframe 向其直接父级通信的受控环境中，这是安全且标准做法。
  // 保持您的 window.parent.parent 结构，以防是双重 iframe。
  if (window.parent && window.parent.parent) {
    window.parent.parent.postMessage(message, "*");
  } else {
    console.warn("Cannot find window.parent.parent to post message to.");
  }
}
