/**
 * YouTube App 主要脚本
 * 实现YouTube视频搜索、播放和投屏功能
 */

// 全局变量
let currentVideoData = null;
let isPlayerVisible = false;
let searchCache = new Map(); // 搜索缓存

// 分页和滚动相关
let currentSearchQuery = "";
let currentPage = 1;
let isLoading = false;
let hasMoreResults = true;
let allSearchResults = []; // 存储所有搜索结果
let displayedVideoIds = new Set(); // 已显示的视频ID，用于去重

// 搜索建议和历史相关
let searchHistory = JSON.parse(localStorage.getItem("youtube_search_history") || "[]");
let watchHistory = JSON.parse(localStorage.getItem("youtube_watch_history") || "[]");
let isShowingSuggestions = false;

// 搜索状态管理
// let currentSearchId = 0;

// 搜索配置
const SEARCH_CONFIG = {
  timeout: 15000, // 总搜索超时时间
  cacheLimit: 50, // 缓存条目限制
  maxResults: 20, // 最大搜索结果数
  homepageSize: 20, // 主页视频数量
};

// 趋势关键词池
const TRENDING_KEYWORDS = [
  // 音乐类
  "music 2024",
  "trending songs",
  "viral music",
  "new music",
  "pop music",
  "hip hop",
  "rock music",
  "electronic music",
  "piano music",
  "guitar covers",
  "live performance",

  // 娱乐类
  "funny videos",
  "comedy",
  "memes",
  "viral videos",
  "entertainment",
  "trending now",
  "popular videos",
  "reaction videos",
  "pranks",
  "challenges",

  // 科技类
  "tech review",
  "gadgets",
  "AI technology",
  "gaming",
  "smartphone",
  "tech news",
  "innovation",
  "unboxing",
  "programming",
  "coding tutorial",
  "software",

  // 生活类
  "lifestyle",
  "travel",
  "food",
  "cooking",
  "fitness",
  "health",
  "tutorial",
  "how to",
  "diy projects",
  "home improvement",
  "fashion",

  // 时事类
  "news",
  "current events",
  "trending topics",
  "viral",
  "breaking news",
  "latest",
  "documentary",
];

// 随机发现关键词
const RANDOM_DISCOVERY = [
  "amazing",
  "incredible",
  "best of",
  "top 10",
  "compilation",
  "highlights",
  "epic",
  "awesome",
  "satisfying",
  "relaxing",
  "beautiful",
  "inspiring",
  "mind blowing",
  "unbelievable",
  "spectacular",
  "stunning",
];

// 热门搜索建议
const POPULAR_SEARCHES = [
  "music",
  "funny videos",
  "gaming",
  "tech review",
  "cooking",
  "travel",
  "tutorial",
  "news",
  "sports",
  "movies",
  "anime",
  "dance",
  "science",
  "art",
  "fitness",
  "fashion",
  "comedy",
  "documentary",
  "live stream",
  "reaction",
];

/**
 * 页面加载完成后初始化应用
 */
document.addEventListener("DOMContentLoaded", initializeApp);

/**
 * 初始化应用程序
 */
function initializeApp() {
  const searchButton = document.getElementById("searchButton");
  const searchInput = document.getElementById("searchInput");
  const closePlayer = document.getElementById("closePlayer");
  const castToTV = document.getElementById("castToTV");
  const videoList = document.getElementById("videoList");

  // 搜索按钮点击事件
  searchButton.addEventListener("click", handleSearch);

  // 搜索输入框事件
  searchInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      handleSearch();
    }
  });

  // 搜索建议事件
  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("focus", showSearchSuggestions);
  searchInput.addEventListener("blur", hideSearchSuggestions);

  // 关闭播放器事件
  closePlayer.addEventListener("click", closeVideoPlayer);

  // 投屏到电视事件
  castToTV.addEventListener("click", castVideoToTV);

  // 视频项点击事件（事件委托）
  videoList.addEventListener("click", function (e) {
    const videoItem = e.target.closest(".video-item");
    if (videoItem) {
      const videoId = videoItem.getAttribute("data-video-id");
      const videoTitle = videoItem.querySelector(".video-title").textContent;
      const videoChannel = videoItem.querySelector(".video-channel").textContent;

      playVideo(videoId, videoTitle, videoChannel);
    }
  });

  // 添加无限滚动监听器
  setupInfiniteScroll();

  // 生成动态主页内容
  generateHomepageContent();

  console.log("YouTube App 初始化完成");
}

/**
 * 生成动态主页内容
 * @description 混合真实搜索结果和精选内容生成主页
 */
async function generateHomepageContent() {
  const videoList = document.getElementById("videoList");

  // 显示加载状态
  showLoading(true, "正在加载推荐内容...");

  try {
    const homepageVideos = [];

    // 1. 立即显示3个精选视频（快速响应）
    const featuredVideos = getFeaturedVideos(3);
    homepageVideos.push(...featuredVideos);
    displaySearchResults(homepageVideos);

    // 2. 并行搜索趋势内容
    const trendingPromises = [
      searchTrendingContent("trending music"),
      searchTrendingContent("viral videos"),
      searchTrendingContent("tech review"),
      searchTrendingContent("funny moments"),
    ];

    // 3. 随机发现内容
    const discoveryPromises = [searchRandomContent(), searchRandomContent()];

    // 4. 等待所有搜索完成（设置较短超时）
    const allPromises = [...trendingPromises, ...discoveryPromises];
    const results = await Promise.allSettled(
      allPromises.map((promise) =>
        Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("搜索超时")), 8000))])
      )
    );

    // 5. 收集成功的搜索结果
    const searchResults = [];
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value && result.value.length > 0) {
        searchResults.push(...result.value.slice(0, 2)); // 每个搜索最多取2个结果
      }
    });

    // 6. 合并和去重
    const finalResults = mergeAndDeduplicateResults(homepageVideos, searchResults);

    // 7. 如果结果不够，用数据库内容补充
    if (finalResults.length < SEARCH_CONFIG.homepageSize) {
      const additionalVideos = getFeaturedVideos(SEARCH_CONFIG.homepageSize - finalResults.length, finalResults);
      finalResults.push(...additionalVideos);
    }

    // 8. 随机打乱并限制数量
    const shuffledResults = finalResults.sort(() => 0.5 - Math.random()).slice(0, SEARCH_CONFIG.homepageSize);

    // 9. 显示最终结果
    displaySearchResults(shuffledResults);

    console.log(`主页加载完成，共 ${shuffledResults.length} 个视频`);
  } catch (error) {
    console.error("主页内容生成失败:", error);

    // 降级到纯数据库内容
    const fallbackVideos = getFeaturedVideos(SEARCH_CONFIG.homepageSize);
    displaySearchResults(fallbackVideos);
  } finally {
    showLoading(false);
  }
}

/**
 * 获取精选视频
 * @param {number} count - 需要的视频数量
 * @param {Array} excludeVideos - 要排除的视频列表
 * @returns {Array} 精选视频数组
 */
function getFeaturedVideos(count, excludeVideos = []) {
  // 从enhancedSimulateSearch中提取数据库
  const videoDatabase = [
    {
      id: "dQw4w9WgXcQ",
      title: "Rick Astley - Never Gonna Give You Up (Official Video)",
      channel: "Rick Astley",
      views: "1.4B views",
      publishedAt: "14 years ago",
      category: "music",
    },
    {
      id: "kJQP7kiw5Fk",
      title: "Luis Fonsi - Despacito ft. Daddy Yankee",
      channel: "Luis Fonsi",
      views: "8.2B views",
      publishedAt: "6 years ago",
      category: "music",
    },
    {
      id: "JGwWNGJdvx8",
      title: "Ed Sheeran - Shape of You (Official Video)",
      channel: "Ed Sheeran",
      views: "5.7B views",
      publishedAt: "7 years ago",
      category: "music",
    },
    {
      id: "YQHsXMglC9A",
      title: "Adele - Hello (Official Music Video)",
      channel: "Adele",
      views: "3.2B views",
      publishedAt: "8 years ago",
      category: "music",
    },
    {
      id: "fJ9rUzIMcZQ",
      title: "Queen - Bohemian Rhapsody (Official Video)",
      channel: "Queen Official",
      views: "1.8B views",
      publishedAt: "13 years ago",
      category: "music",
    },
    {
      id: "hFZFjoX2cGg",
      title: "Charlie Bit My Finger - Again!",
      channel: "HDCYT",
      views: "885M views",
      publishedAt: "16 years ago",
      category: "entertainment",
    },
    {
      id: "jNQXAC9IVRw",
      title: "Me at the zoo",
      channel: "jawed",
      views: "300M views",
      publishedAt: "18 years ago",
      category: "entertainment",
    },
    {
      id: "FlsCjmMhFmw",
      title: "iPhone 15 Pro Review: Titanium is Tough!",
      channel: "Marques Brownlee",
      views: "12M views",
      publishedAt: "3 months ago",
      category: "tech",
    },
    {
      id: "dWqzz3625ps",
      title: "The Future of AI: What You Need to Know",
      channel: "TechExplained",
      views: "8.5M views",
      publishedAt: "2 months ago",
      category: "tech",
    },
    {
      id: "BxV14h0kFs0",
      title: "Minecraft: The Ultimate Building Guide",
      channel: "GameMaster",
      views: "25M views",
      publishedAt: "1 year ago",
      category: "gaming",
    },
    {
      id: "WO23WBji_Z0",
      title: "How the Internet Works in 5 Minutes",
      channel: "TechEducation",
      views: "15M views",
      publishedAt: "6 months ago",
      category: "education",
    },
  ];

  const excludeIds = excludeVideos.map((v) => v.id);
  const availableVideos = videoDatabase.filter((v) => !excludeIds.includes(v.id));

  return availableVideos
    .sort(() => 0.5 - Math.random())
    .slice(0, count)
    .map((video) => ({
      id: video.id,
      title: video.title,
      channel: video.channel,
      thumbnail: `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
      views: video.views,
      publishedAt: video.publishedAt,
    }));
}

/**
 * 搜索趋势内容
 * @param {string} keyword - 趋势关键词
 * @returns {Promise<Array>} 搜索结果
 */
async function searchTrendingContent(keyword) {
  try {
    console.log(`搜索趋势内容: ${keyword}`);

    // 使用现有的CORS代理搜索
    const results = await searchWithCorsProxy(keyword);

    if (results && results.length > 0) {
      console.log(`趋势搜索 "${keyword}" 成功，获得 ${results.length} 个结果`);
      return results;
    }

    throw new Error("搜索结果为空");
  } catch (error) {
    console.warn(`趋势搜索 "${keyword}" 失败:`, error);
    return [];
  }
}

/**
 * 搜索随机发现内容
 * @returns {Promise<Array>} 搜索结果
 */
async function searchRandomContent() {
  try {
    // 随机选择关键词组合
    const randomKeyword = RANDOM_DISCOVERY[Math.floor(Math.random() * RANDOM_DISCOVERY.length)];
    const trendingKeyword = TRENDING_KEYWORDS[Math.floor(Math.random() * TRENDING_KEYWORDS.length)];
    const combinedKeyword = `${randomKeyword} ${trendingKeyword}`;

    console.log(`随机发现搜索: ${combinedKeyword}`);

    const results = await searchWithCorsProxy(combinedKeyword);

    if (results && results.length > 0) {
      console.log(`随机发现搜索成功，获得 ${results.length} 个结果`);
      return results;
    }

    throw new Error("搜索结果为空");
  } catch (error) {
    console.warn("随机发现搜索失败:", error);
    return [];
  }
}

/**
 * 合并和去重搜索结果
 * @param {Array} existingResults - 已有结果
 * @param {Array} newResults - 新搜索结果
 * @returns {Array} 合并后的去重结果
 */
function mergeAndDeduplicateResults(existingResults, newResults) {
  const allResults = [...existingResults];
  const existingIds = new Set(existingResults.map((v) => v.id));

  // 添加新结果，跳过重复的
  newResults.forEach((video) => {
    if (!existingIds.has(video.id)) {
      allResults.push(video);
      existingIds.add(video.id);
    }
  });

  return allResults;
}

/**
 * 设置无限滚动
 */
function setupInfiniteScroll() {
  const videoList = document.getElementById("videoList");

  videoList.addEventListener(
    "scroll",
    throttle(() => {
      // 检查是否滚动到底部
      const scrollTop = videoList.scrollTop;
      const scrollHeight = videoList.scrollHeight;
      const clientHeight = videoList.clientHeight;

      // 当滚动到距离底部100px时开始加载
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadMoreResults();
      }
    }, 200)
  );
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} delay - 延迟时间
 */
function throttle(func, delay) {
  let timeoutId;
  let lastExecTime = 0;

  return function (...args) {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
}

/**
 * 加载更多搜索结果
 */
async function loadMoreResults() {
  // 如果正在加载或没有更多结果，或者没有搜索查询，则返回
  if (isLoading || !hasMoreResults || !currentSearchQuery) {
    return;
  }

  isLoading = true;
  currentPage++;

  try {
    console.log(`加载第 ${currentPage} 页结果，关键词: ${currentSearchQuery}`);

    // 显示加载提示
    showLoadMoreIndicator(true);

    // 生成新的搜索变体以获取更多结果
    const searchVariants = generateSearchVariants(currentSearchQuery, currentPage);

    // 并行搜索多个变体
    const searchPromises = searchVariants.map((variant) =>
      searchWithCorsProxy(variant).catch((error) => {
        console.warn(`搜索变体 "${variant}" 失败:`, error);
        return [];
      })
    );

    const results = await Promise.allSettled(searchPromises);

    // 收集所有成功的结果
    let newResults = [];
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value && result.value.length > 0) {
        newResults.push(...result.value);
      }
    });

    // 去重处理
    const uniqueNewResults = newResults.filter((video) => !displayedVideoIds.has(video.id));

    if (uniqueNewResults.length > 0) {
      // 添加到已显示列表
      uniqueNewResults.forEach((video) => displayedVideoIds.add(video.id));

      // 添加到结果列表
      allSearchResults.push(...uniqueNewResults);

      // 渲染新结果
      appendSearchResults(uniqueNewResults);

      console.log(`第 ${currentPage} 页加载完成，新增 ${uniqueNewResults.length} 个视频`);
    } else {
      // 没有新结果，标记为没有更多
      hasMoreResults = false;
      showNoMoreResultsMessage();
      console.log("没有更多搜索结果");
    }
  } catch (error) {
    console.error("加载更多结果失败:", error);
    currentPage--; // 回退页码
  } finally {
    isLoading = false;
    showLoadMoreIndicator(false);
  }
}

/**
 * 生成搜索变体
 * @param {string} originalQuery - 原始搜索词
 * @param {number} page - 页码
 * @returns {Array} 搜索变体数组
 */
function generateSearchVariants(originalQuery, page) {
  const variants = [];

  // 基础变体：原始查询
  variants.push(originalQuery);

  // 添加修饰词变体
  const modifiers = [
    "best",
    "top",
    "latest",
    "new",
    "popular",
    "trending",
    "amazing",
    "epic",
    "awesome",
    "incredible",
    "viral",
  ];

  // 随机选择修饰词
  const randomModifier = modifiers[Math.floor(Math.random() * modifiers.length)];
  variants.push(`${randomModifier} ${originalQuery}`);

  // 添加年份变体
  const currentYear = new Date().getFullYear();
  variants.push(`${originalQuery} ${currentYear}`);

  // 添加相关词变体
  const relatedTerms = {
    music: ["song", "audio", "sound", "melody"],
    video: ["clip", "footage", "movie", "film"],
    game: ["gaming", "gameplay", "play", "games"],
    tech: ["technology", "gadget", "device", "review"],
    funny: ["comedy", "humor", "laugh", "hilarious"],
  };

  // 检查是否包含相关词
  Object.keys(relatedTerms).forEach((key) => {
    if (originalQuery.toLowerCase().includes(key)) {
      const related = relatedTerms[key];
      const randomRelated = related[Math.floor(Math.random() * related.length)];
      variants.push(originalQuery.replace(new RegExp(key, "gi"), randomRelated));
    }
  });

  // 根据页码添加更多变体
  if (page > 2) {
    variants.push(`${originalQuery} compilation`);
    variants.push(`${originalQuery} highlights`);
  }

  // 去重并限制数量
  return [...new Set(variants)].slice(0, 3);
}

/**
 * 追加搜索结果到列表
 * @param {Array} results - 新的搜索结果
 */
function appendSearchResults(results) {
  const videoList = document.getElementById("videoList");

  results.forEach((video, index) => {
    const videoItem = createVideoItemElement(video, allSearchResults.length + index);

    // 添加淡入动画
    videoItem.style.opacity = "0";
    videoItem.style.transform = "translateY(20px)";

    videoList.appendChild(videoItem);

    // 触发动画
    setTimeout(() => {
      videoItem.style.transition = "all 0.3s ease-out";
      videoItem.style.opacity = "1";
      videoItem.style.transform = "translateY(0)";
    }, index * 50); // 错开动画时间
  });
}

/**
 * 显示/隐藏加载更多指示器
 * @param {boolean} show - 是否显示
 */
function showLoadMoreIndicator(show) {
  let indicator = document.getElementById("loadMoreIndicator");

  if (show && !indicator) {
    // 创建加载指示器
    indicator = document.createElement("div");
    indicator.id = "loadMoreIndicator";
    indicator.className = "load-more-indicator";
    indicator.innerHTML = `
      <div class="spinner"></div>
      <p>正在加载更多视频...</p>
    `;

    // 添加样式
    indicator.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #aaa;
      font-size: 14px;
    `;

    const videoList = document.getElementById("videoList");
    videoList.appendChild(indicator);
  } else if (!show && indicator) {
    indicator.remove();
  }
}

/**
 * 显示没有更多结果的消息
 */
function showNoMoreResultsMessage() {
  const videoList = document.getElementById("videoList");

  const message = document.createElement("div");
  message.className = "no-more-results";
  message.innerHTML = `
    <p>🎬 已显示所有相关视频</p>
    <p>尝试搜索其他关键词发现更多内容</p>
  `;

  message.style.cssText = `
    text-align: center;
    padding: 30px 20px;
    color: #888;
    font-size: 14px;
    border-top: 1px solid #333;
    margin-top: 20px;
  `;

  videoList.appendChild(message);
}

/**
 * 重置搜索状态
 * @param {string} query - 新的搜索查询
 */
function resetSearchState(query) {
  currentSearchQuery = query;
  currentPage = 1;
  isLoading = false;
  hasMoreResults = true;
  allSearchResults = [];
  displayedVideoIds.clear();

  // 清理之前的加载指示器和消息
  const indicators = document.querySelectorAll("#loadMoreIndicator, .no-more-results");
  indicators.forEach((indicator) => indicator.remove());
}

/**
 * 初始化搜索结果
 * @param {Array} results - 搜索结果
 */
function initializeSearchResults(results) {
  // 设置初始状态
  allSearchResults = [...results];
  results.forEach((video) => displayedVideoIds.add(video.id));

  // 显示结果
  displaySearchResults(results);

  console.log(`搜索初始化完成，显示 ${results.length} 个结果，支持无限滚动`);
}

/**
 * 处理搜索输入
 */
function handleSearchInput(e) {
  const query = e.target.value.trim();

  if (query.length > 0) {
    updateSearchSuggestions(query);
  } else {
    showDefaultSuggestions();
  }
}

/**
 * 显示搜索建议
 */
function showSearchSuggestions() {
  if (isShowingSuggestions) return;

  const searchInput = document.getElementById("searchInput");
  const query = searchInput.value.trim();

  if (query.length > 0) {
    updateSearchSuggestions(query);
  } else {
    showDefaultSuggestions();
  }

  isShowingSuggestions = true;
}

/**
 * 隐藏搜索建议
 */
function hideSearchSuggestions() {
  // 延迟隐藏，允许点击建议项
  setTimeout(() => {
    const suggestionsContainer = document.getElementById("searchSuggestions");
    if (suggestionsContainer) {
      suggestionsContainer.remove();
    }
    isShowingSuggestions = false;
  }, 200);
}

/**
 * 更新搜索建议
 * @param {string} query - 搜索查询
 */
function updateSearchSuggestions(query) {
  const suggestions = generateSearchSuggestions(query);
  displaySearchSuggestions(suggestions, "搜索建议");
}

/**
 * 显示默认建议
 */
function showDefaultSuggestions() {
  const suggestions = [];

  // 添加搜索历史（最近5个）
  if (searchHistory.length > 0) {
    suggestions.push({
      type: "section",
      title: "🕒 搜索历史",
    });

    searchHistory.slice(0, 5).forEach((item) => {
      suggestions.push({
        type: "history",
        text: item.query,
        icon: "🕒",
        time: item.time,
      });
    });
  }

  // 添加热门搜索
  suggestions.push({
    type: "section",
    title: "🔥 热门搜索",
  });

  // 随机选择6个热门搜索
  const randomPopular = [...POPULAR_SEARCHES].sort(() => 0.5 - Math.random()).slice(0, 6);

  randomPopular.forEach((search) => {
    suggestions.push({
      type: "popular",
      text: search,
      icon: "🔥",
    });
  });

  displaySearchSuggestions(suggestions);
}

/**
 * 生成搜索建议
 * @param {string} query - 搜索查询
 * @returns {Array} 建议列表
 */
function generateSearchSuggestions(query) {
  const suggestions = [];
  const lowerQuery = query.toLowerCase();

  // 1. 搜索历史匹配
  const historyMatches = searchHistory.filter((item) => item.query.toLowerCase().includes(lowerQuery)).slice(0, 3);

  if (historyMatches.length > 0) {
    suggestions.push({
      type: "section",
      title: "🕒 搜索历史",
    });

    historyMatches.forEach((item) => {
      suggestions.push({
        type: "history",
        text: item.query,
        icon: "🕒",
        time: item.time,
      });
    });
  }

  // 2. 智能补全建议
  const completions = generateSmartCompletions(query);
  if (completions.length > 0) {
    suggestions.push({
      type: "section",
      title: "💡 建议搜索",
    });

    completions.forEach((completion) => {
      suggestions.push({
        type: "completion",
        text: completion,
        icon: "🔍",
        highlight: query,
      });
    });
  }

  // 3. 热门相关搜索
  const relatedPopular = POPULAR_SEARCHES.filter(
    (search) => search.toLowerCase().includes(lowerQuery) || lowerQuery.includes(search.toLowerCase())
  ).slice(0, 3);

  if (relatedPopular.length > 0) {
    suggestions.push({
      type: "section",
      title: "🔥 相关热门",
    });

    relatedPopular.forEach((search) => {
      suggestions.push({
        type: "popular",
        text: search,
        icon: "🔥",
      });
    });
  }

  return suggestions;
}

/**
 * 生成智能补全
 * @param {string} query - 搜索查询
 * @returns {Array} 补全建议
 */
function generateSmartCompletions(query) {
  const completions = [];

  // 基于关键词的智能补全
  const completionMap = {
    music: ["music 2024", "music video", "music playlist", "music live"],
    game: ["gaming", "gameplay", "game review", "game trailer"],
    tech: ["tech review", "tech news", "technology", "tech unboxing"],
    cook: ["cooking", "cooking tutorial", "cooking recipe", "cooking tips"],
    fun: ["funny videos", "funny moments", "funny compilation", "funny animals"],
    trav: ["travel", "travel vlog", "travel guide", "travel tips"],
    tuto: ["tutorial", "how to", "guide", "tips"],
    news: ["news today", "breaking news", "news update", "latest news"],
  };

  const lowerQuery = query.toLowerCase();

  // 查找匹配的补全
  Object.keys(completionMap).forEach((key) => {
    if (lowerQuery.includes(key) || key.includes(lowerQuery)) {
      completions.push(...completionMap[key]);
    }
  });

  // 添加通用补全
  if (query.length >= 2) {
    completions.push(`${query} 2024`, `${query} tutorial`, `${query} review`, `best ${query}`, `${query} compilation`);
  }

  // 去重并限制数量
  return [...new Set(completions)].slice(0, 5);
}

/**
 * 显示搜索建议
 * @param {Array} suggestions - 建议列表
 * @param {string} title - 标题
 */
function displaySearchSuggestions(suggestions, title = "") {
  // 移除现有建议
  const existingSuggestions = document.getElementById("searchSuggestions");
  if (existingSuggestions) {
    existingSuggestions.remove();
  }

  if (suggestions.length === 0) return;

  // 创建建议容器
  const suggestionsContainer = document.createElement("div");
  suggestionsContainer.id = "searchSuggestions";
  suggestionsContainer.className = "search-suggestions";

  // 添加样式
  suggestionsContainer.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 0 0 12px 12px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

  // 渲染建议项
  suggestions.forEach((suggestion) => {
    if (suggestion.type === "section") {
      // 分组标题
      const sectionTitle = document.createElement("div");
      sectionTitle.className = "suggestion-section";
      sectionTitle.textContent = suggestion.title;
      sectionTitle.style.cssText = `
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        color: #888;
        background: #222;
        border-bottom: 1px solid #333;
      `;
      suggestionsContainer.appendChild(sectionTitle);
    } else {
      // 建议项
      const suggestionItem = document.createElement("div");
      suggestionItem.className = "suggestion-item";
      suggestionItem.style.cssText = `
        padding: 12px 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        color: #fff;
        font-size: 14px;
        border-bottom: 1px solid #2a2a2a;
        transition: background-color 0.2s ease;
      `;

      // 图标
      const icon = document.createElement("span");
      icon.textContent = suggestion.icon;
      icon.style.fontSize = "16px";
      suggestionItem.appendChild(icon);

      // 文本
      const text = document.createElement("span");
      text.style.flex = "1";

      if (suggestion.highlight) {
        // 高亮匹配文本
        const highlightedText = suggestion.text.replace(
          new RegExp(`(${suggestion.highlight})`, "gi"),
          '<mark style="background: #ff0000; color: white; padding: 1px 2px; border-radius: 2px;">$1</mark>'
        );
        text.innerHTML = highlightedText;
      } else {
        text.textContent = suggestion.text;
      }

      suggestionItem.appendChild(text);

      // 时间标签（历史记录）
      if (suggestion.time) {
        const timeLabel = document.createElement("span");
        timeLabel.textContent = formatTimeAgo(suggestion.time);
        timeLabel.style.cssText = `
          font-size: 11px;
          color: #666;
        `;
        suggestionItem.appendChild(timeLabel);
      }

      // 点击事件
      suggestionItem.addEventListener("click", () => {
        const searchInput = document.getElementById("searchInput");
        searchInput.value = suggestion.text;
        hideSearchSuggestions();
        handleSearch();
      });

      // 悬停效果
      suggestionItem.addEventListener("mouseenter", () => {
        suggestionItem.style.backgroundColor = "#333";
      });

      suggestionItem.addEventListener("mouseleave", () => {
        suggestionItem.style.backgroundColor = "transparent";
      });

      suggestionsContainer.appendChild(suggestionItem);
    }
  });

  // 添加到搜索栏容器
  const searchBar = document.querySelector(".search-bar");
  searchBar.style.position = "relative";
  searchBar.appendChild(suggestionsContainer);
}

/**
 * 添加到搜索历史
 * @param {string} query - 搜索查询
 */
function addToSearchHistory(query) {
  if (!query || query.length < 2) return;

  // 移除重复项
  searchHistory = searchHistory.filter((item) => item.query !== query);

  // 添加到开头
  searchHistory.unshift({
    query: query,
    time: Date.now(),
  });

  // 限制历史记录数量
  if (searchHistory.length > 20) {
    searchHistory = searchHistory.slice(0, 20);
  }

  // 保存到本地存储
  localStorage.setItem("youtube_search_history", JSON.stringify(searchHistory));
}

/**
 * 添加到观看历史
 * @param {Object} videoData - 视频数据
 */
function addToWatchHistory(videoData) {
  if (!videoData || !videoData.id) return;

  // 移除重复项
  watchHistory = watchHistory.filter((item) => item.id !== videoData.id);

  // 添加到开头
  watchHistory.unshift({
    id: videoData.id,
    title: videoData.title,
    channel: videoData.channel,
    thumbnail: `https://img.youtube.com/vi/${videoData.id}/mqdefault.jpg`,
    time: Date.now(),
  });

  // 限制观看历史数量
  if (watchHistory.length > 50) {
    watchHistory = watchHistory.slice(0, 50);
  }

  // 保存到本地存储
  localStorage.setItem("youtube_watch_history", JSON.stringify(watchHistory));
}

/**
 * 格式化时间差
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化的时间
 */
function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return "刚刚";
}

/**
 * 清理搜索历史
 */
function clearSearchHistory() {
  searchHistory = [];
  localStorage.removeItem("youtube_search_history");
  showNotification("搜索历史已清除");
}

/**
 * 清理观看历史
 */
function clearWatchHistory() {
  watchHistory = [];
  localStorage.removeItem("youtube_watch_history");
  showNotification("观看历史已清除");
}

/**
 * 处理搜索请求
 */
async function handleSearch() {
  const searchInput = document.getElementById("searchInput");
  const query = searchInput.value.trim();

  if (!query) {
    showNotification("请输入搜索关键词");
    return;
  }

  // 重置搜索状态
  resetSearchState(query);

  // 添加到搜索历史
  addToSearchHistory(query);

  // 检查缓存
  const cacheKey = query.toLowerCase();
  if (searchCache.has(cacheKey)) {
    const cachedResults = searchCache.get(cacheKey);
    // 检查是否包含外语内容
    const hasNonEnglish = cachedResults.some(
      (result) => result.views?.includes("vue") || result.views?.includes("il y a") || result.publishedAt?.includes("jour")
    );

    if (!hasNonEnglish) {
      console.log("使用缓存的搜索结果");
      initializeSearchResults(cachedResults);
      showNotification(`找到 ${cachedResults.length} 个缓存结果`);
      return;
    } else {
      // 删除包含外语的旧缓存
      searchCache.delete(cacheKey);
      console.log("清理外语缓存，重新搜索");
    }
  }

  showLoading(true);

  // 添加超时控制
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("搜索超时")), SEARCH_CONFIG.timeout);
  });

  try {
    console.log("开始搜索YouTube视频:", query);

    // 尝试多个搜索方案（优先使用CORS代理）
    let searchResults = null;

    // 设置搜索完成标志
    let searchCompleted = false;

    // 方案1: 首选CORS代理方案 (最可行的方案)
    try {
      showLoading(true, "正在通过代理搜索YouTube...");

      // 使用Promise.race但增加结果验证
      const corsResult = await Promise.race([searchWithCorsProxy(query), timeoutPromise]);

      // 验证结果有效性
      if (corsResult && corsResult.length > 0) {
        searchResults = corsResult;
        searchCompleted = true;
        console.log("CORS代理搜索成功，获得", corsResult.length, "个结果");
      } else {
        console.warn("CORS代理返回空结果");
        throw new Error("CORS代理返回空结果");
      }
    } catch (error) {
      console.warn("CORS代理搜索失败:", error);
      searchCompleted = false;
    }

    // 方案2: 如果CORS代理失败，使用智能搜索
    if (!searchCompleted) {
      showLoading(true, "正在生成智能搜索结果...");
      console.log("使用增强模拟搜索");
      searchResults = await enhancedSimulateSearch(query);
      searchCompleted = true;
    }

    if (searchResults && searchResults.length > 0) {
      // 缓存搜索结果
      searchCache.set(cacheKey, searchResults);

      // 限制缓存大小
      if (searchCache.size > SEARCH_CONFIG.cacheLimit) {
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
      }

      // 初始化搜索结果状态
      initializeSearchResults(searchResults);
      showNotification(`找到 ${searchResults.length} 个相关视频`);
    } else {
      showNotification("未找到相关视频，请尝试其他关键词");
    }
  } catch (error) {
    console.error("搜索失败:", error);
    showNotification("搜索失败，请稍后重试");

    // 降级到模拟搜索
    try {
      const fallbackResults = await enhancedSimulateSearch(query);
      initializeSearchResults(fallbackResults);
      showNotification("使用离线搜索结果");
    } catch (fallbackError) {
      console.error("降级搜索也失败:", fallbackError);
    }
  } finally {
    showLoading(false);
  }
}

/**
 * 使用CORS代理搜索YouTube
 * @param {string} query - 搜索关键词
 * @returns {Array} 搜索结果
 */
async function searchWithCorsProxy(query) {
  // CORS代理服务列表（按可靠性排序）
  const corsProxies = [
    {
      url: "https://corsproxy.io/?", // 现代、专门的代理服务
      type: "corsproxy.io",
      timeout: 10000,
    },
    {
      url: "https://api.codetabs.com/v1/proxy?quest=", // 备用选项
      type: "codetabs",
      timeout: 6000,
    },
    /*
    {
      url: "https://cors.sh/", // 另一个强大的专业代理，有免费套餐
      type: "cors.sh",
      timeout: 10000,
    },
    {
      url: "https://api.allorigins.win/get?url=", // 经典选择，但有时不稳定
      type: "allorigins",
      timeout: 8000,
    },

    // ---- 以下为更多备用代理，可靠性可能更低 ----
    {
      url: "https://thingproxy.freeboard.io/fetch/",
      type: "thingproxy",
      timeout: 5000,
    },
    {
      url: "https://crossorigin.me/",
      type: "crossorigin.me",
      timeout: 5000,
    },
    */
  ];

  // 构造YouTube搜索URL（强制英语版本）
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=US&persist_hl=1`;

  // 并行请求所有代理
  const parallelPromises = corsProxies.map((proxy) => tryProxyWithTimeout(proxy, youtubeSearchUrl, query));

  try {
    // 使用Promise.race获取最快的结果
    console.log("开始并行请求代理...");
    const result = await Promise.race(parallelPromises);

    // 验证结果
    if (result && Array.isArray(result) && result.length > 0) {
      console.log("并行请求成功获取结果，数量:", result.length);
      return result;
    } else {
      console.warn("并行请求返回空结果或无效结果");
      throw new Error("并行请求返回空结果");
    }
  } catch (error) {
    console.warn("并行请求失败:", error);
    // 继续尝试其他方法而不是直接抛出错误
  }

  throw new Error("所有CORS代理都失败了");
}

/**
 * 尝试单个代理并设置超时
 * @param {Object} proxy - 代理配置
 * @param {string} youtubeSearchUrl - YouTube搜索URL
 * @param {string} query - 搜索关键词
 * @returns {Promise<Array>} 搜索结果
 */
async function tryProxyWithTimeout(proxy, youtubeSearchUrl, query) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), proxy.timeout);

  try {
    console.log(`尝试CORS代理: ${proxy.url} (超时: ${proxy.timeout}ms)`);

    let response;
    let html;

    if (proxy.type === "allorigins") {
      // AllOrigins 返回JSON格式
      response = await fetch(proxy.url + encodeURIComponent(youtubeSearchUrl), {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      html = data.contents;
    } else {
      // 其他代理直接返回HTML
      response = await fetch(proxy.url + encodeURIComponent(youtubeSearchUrl), {
        signal: controller.signal,
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      html = await response.text();
    }

    clearTimeout(timeoutId);

    if (!html) {
      throw new Error("获取到空的HTML内容");
    }

    console.log(`${proxy.type} 成功获取HTML内容，长度: ${html.length}`);

    // 解析HTML中的视频数据
    const results = parseYouTubeHTML(html, query);

    if (results && Array.isArray(results) && results.length > 0) {
      console.log(`${proxy.type} 解析到 ${results.length} 个视频结果`);
      return results;
    } else {
      console.warn(`${proxy.type} 未能从HTML中解析到视频数据`);
      throw new Error("未能从HTML中解析到视频数据");
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`${proxy.type} 请求超时`);
    }
    throw error;
  }
}

/**
 * 增强的模拟搜索（基于关键词智能匹配）
 * @param {string} query - 搜索关键词
 * @returns {Array} 搜索结果
 */
async function enhancedSimulateSearch(query) {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 800));

  // 扩展的精选视频数据库
  const videoDatabase = [
    // 经典音乐
    {
      id: "dQw4w9WgXcQ",
      title: "Rick Astley - Never Gonna Give You Up (Official Video)",
      channel: "Rick Astley",
      views: "1.4B views",
      publishedAt: "14 years ago",
      keywords: ["rick", "astley", "never", "gonna", "give", "up", "music", "classic"],
      category: "music",
    },
    {
      id: "kJQP7kiw5Fk",
      title: "Luis Fonsi - Despacito ft. Daddy Yankee",
      channel: "Luis Fonsi",
      views: "8.2B views",
      publishedAt: "6 years ago",
      keywords: ["luis", "fonsi", "despacito", "spanish", "latin", "music"],
      category: "music",
    },
    {
      id: "JGwWNGJdvx8",
      title: "Ed Sheeran - Shape of You (Official Video)",
      channel: "Ed Sheeran",
      views: "5.7B views",
      publishedAt: "7 years ago",
      keywords: ["ed", "sheeran", "shape", "of", "you", "pop", "music"],
      category: "music",
    },
    {
      id: "YQHsXMglC9A",
      title: "Adele - Hello (Official Music Video)",
      channel: "Adele",
      views: "3.2B views",
      publishedAt: "8 years ago",
      keywords: ["adele", "hello", "music", "ballad", "emotional"],
      category: "music",
    },
    {
      id: "fJ9rUzIMcZQ",
      title: "Queen - Bohemian Rhapsody (Official Video)",
      channel: "Queen Official",
      views: "1.8B views",
      publishedAt: "13 years ago",
      keywords: ["queen", "bohemian", "rhapsody", "rock", "classic"],
      category: "music",
    },

    // 娱乐内容
    {
      id: "hFZFjoX2cGg",
      title: "Charlie Bit My Finger - Again!",
      channel: "HDCYT",
      views: "885M views",
      publishedAt: "16 years ago",
      keywords: ["charlie", "bit", "finger", "viral", "funny", "kids"],
      category: "entertainment",
    },
    {
      id: "jNQXAC9IVRw",
      title: "Me at the zoo",
      channel: "jawed",
      views: "300M views",
      publishedAt: "18 years ago",
      keywords: ["first", "youtube", "video", "zoo", "history"],
      category: "entertainment",
    },

    // 科技内容
    {
      id: "FlsCjmMhFmw",
      title: "iPhone 15 Pro Review: Titanium is Tough!",
      channel: "Marques Brownlee",
      views: "12M views",
      publishedAt: "3 months ago",
      keywords: ["iphone", "15", "pro", "review", "tech", "titanium"],
      category: "tech",
    },
    {
      id: "dWqzz3625ps",
      title: "The Future of AI: What You Need to Know",
      channel: "TechExplained",
      views: "8.5M views",
      publishedAt: "2 months ago",
      keywords: ["ai", "artificial", "intelligence", "future", "technology"],
      category: "tech",
    },

    // 游戏内容
    {
      id: "BxV14h0kFs0",
      title: "Minecraft: The Ultimate Building Guide",
      channel: "GameMaster",
      views: "25M views",
      publishedAt: "1 year ago",
      keywords: ["minecraft", "building", "tutorial", "gaming", "guide"],
      category: "gaming",
    },

    // 教育内容
    {
      id: "WO23WBji_Z0",
      title: "How the Internet Works in 5 Minutes",
      channel: "TechEducation",
      views: "15M views",
      publishedAt: "6 months ago",
      keywords: ["internet", "how", "works", "education", "technology"],
      category: "education",
    },
  ];

  // 智能匹配算法
  const queryWords = query.toLowerCase().split(/\s+/);
  const matchedVideos = videoDatabase
    .map((video) => {
      const matchScore = queryWords.reduce((score, word) => {
        const titleMatch = video.title.toLowerCase().includes(word) ? 3 : 0;
        const channelMatch = video.channel.toLowerCase().includes(word) ? 2 : 0;
        const keywordMatch = video.keywords.some((keyword) => keyword.includes(word) || word.includes(keyword)) ? 1 : 0;

        return score + titleMatch + channelMatch + keywordMatch;
      }, 0);

      return {...video, matchScore};
    })
    .filter((video) => video.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, SEARCH_CONFIG.maxResults);

  // 如果没有匹配的，返回随机的热门视频
  if (matchedVideos.length === 0) {
    const shuffled = [...videoDatabase].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 5).map((video) => ({
      id: video.id,
      title: `${query} 相关 - ${video.title}`,
      channel: video.channel,
      thumbnail: `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
      views: video.views,
      publishedAt: video.publishedAt,
    }));
  }

  return matchedVideos.map((video) => ({
    id: video.id,
    title: video.title,
    channel: video.channel,
    thumbnail: `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
    views: video.views,
    publishedAt: video.publishedAt,
  }));
}

/**
 * 解析YouTube HTML页面
 * @param {string} html - HTML内容
 * @param {string} query - 搜索关键词
 * @returns {Array} 解析出的视频数据
 */
function parseYouTubeHTML(html, query) {
  try {
    const results = [];

    // 方法1: 尝试解析JSON数据 (YouTube在HTML中嵌入的数据)
    const jsonDataRegex = /var ytInitialData = ({.*?});/;
    const jsonMatch = html.match(jsonDataRegex);

    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        console.log("找到YouTube初始数据");

        // 尝试从JSON数据中提取视频信息
        const videoResults = extractVideosFromYouTubeData(data);
        if (videoResults.length > 0) {
          console.log(`从JSON数据中提取到 ${videoResults.length} 个视频`);
          return videoResults;
        }
      } catch (e) {
        console.warn("解析YouTube JSON数据失败:", e);
      }
    }

    // 方法2: 使用正则表达式提取视频ID和基本信息
    const videoIdRegex = /watch\?v=([a-zA-Z0-9_-]{11})/g;
    const videoIds = new Set();
    let match;

    while ((match = videoIdRegex.exec(html)) !== null) {
      videoIds.add(match[1]);
    }

    console.log(`通过正则表达式找到 ${videoIds.size} 个唯一视频ID`);

    // 尝试提取更多信息
    const videoArray = Array.from(videoIds).slice(0, 20);

    for (let i = 0; i < videoArray.length; i++) {
      const videoId = videoArray[i];

      // 尝试从HTML中提取视频标题
      const titleRegex = new RegExp(`"title":"([^"]*)"[^}]*"videoId":"${videoId}"`, "i");
      const titleMatch = html.match(titleRegex);

      // 尝试提取频道名称
      const channelRegex = new RegExp(`"videoId":"${videoId}"[^}]*"ownerText"[^}]*"text":"([^"]*)"`, "i");
      const channelMatch = html.match(channelRegex);

      // 尝试提取观看次数
      const viewsRegex = new RegExp(`"videoId":"${videoId}"[^}]*"viewCountText"[^}]*"simpleText":"([^"]*)"`, "i");
      const viewsMatch = html.match(viewsRegex);

      results.push({
        id: videoId,
        title: titleMatch ? decodeHTMLEntities(titleMatch[1]) : `搜索结果: ${query} #${i + 1}`,
        channel: channelMatch ? decodeHTMLEntities(channelMatch[1]) : "未知频道",
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        views: viewsMatch ? localizeText(viewsMatch[1]) : "未知观看次数",
        publishedAt: "未知时间",
      });
    }

    console.log(`最终解析到 ${results.length} 个视频结果`);
    return results;
  } catch (error) {
    console.error("解析YouTube HTML失败:", error);

    // 降级方案：只提取视频ID
    const videoIds = [];
    const videoIdRegex = /watch\?v=([a-zA-Z0-9_-]{11})/g;
    let match;

    while ((match = videoIdRegex.exec(html)) !== null) {
      if (!videoIds.includes(match[1])) {
        videoIds.push(match[1]);
      }
    }

    return videoIds.slice(0, 5).map((id, index) => ({
      id: id,
      title: `${query} 搜索结果 ${index + 1}`,
      channel: "未知频道",
      thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
      views: "未知观看次数",
      publishedAt: "未知时间",
    }));
  }
}

/**
 * 从YouTube数据中提取视频信息
 * @param {Object} data - YouTube初始数据
 * @returns {Array} 视频信息数组
 */
function extractVideosFromYouTubeData(data) {
  try {
    const results = [];

    // YouTube的数据结构可能会变化，这里尝试常见的路径
    const searchResults = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;

    if (searchResults) {
      for (const section of searchResults) {
        const items = section?.itemSectionRenderer?.contents;
        if (items) {
          for (const item of items) {
            const videoRenderer = item?.videoRenderer;
            if (videoRenderer) {
              results.push({
                id: videoRenderer.videoId,
                title: videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText || "未知标题",
                channel: videoRenderer.ownerText?.runs?.[0]?.text || "未知频道",
                thumbnail: `https://img.youtube.com/vi/${videoRenderer.videoId}/mqdefault.jpg`,
                views: localizeText(videoRenderer.viewCountText?.simpleText) || "未知观看次数",
                publishedAt: localizeText(videoRenderer.publishedTimeText?.simpleText) || "未知时间",
              });
            }
          }
        }
      }
    }

    return results.slice(0, 20);
  } catch (error) {
    console.warn("从YouTube数据中提取视频失败:", error);
    return [];
  }
}

/**
 * 解码HTML实体
 * @param {string} text - 包含HTML实体的文本
 * @returns {string} 解码后的文本
 */
function decodeHTMLEntities(text) {
  const textArea = document.createElement("textarea");
  textArea.innerHTML = text;
  return textArea.value;
}

/**
 * 本地化文本处理（将外语转换为英语）
 * @param {string} text - 原始文本
 * @returns {string} 处理后的文本
 */
function localizeText(text) {
  if (!text) return text;

  // 常见的外语词汇映射
  const translations = {
    // 法语
    "il y a": "",
    jour: "day",
    jours: "days",
    semaine: "week",
    semaines: "weeks",
    mois: "month",
    année: "year",
    années: "years",
    vues: "views",
    vue: "view",

    // 西班牙语
    hace: "",
    día: "day",
    días: "days",
    semana: "week",
    semanas: "weeks",
    mes: "month",
    meses: "months",
    año: "year",
    años: "years",
    visualizaciones: "views",
    visualización: "view",

    // 德语
    vor: "",
    Tag: "day",
    Tage: "days",
    Woche: "week",
    Wochen: "weeks",
    Monat: "month",
    Monate: "months",
    Jahr: "year",
    Jahre: "years",
    Aufrufe: "views",
    Aufruf: "view",

    // 意大利语
    fa: "",
    giorno: "day",
    giorni: "days",
    settimana: "week",
    settimane: "weeks",
    mese: "month",
    mesi: "months",
    anno: "year",
    anni: "years",
    visualizzazioni: "views",
    visualizzazione: "view",
  };

  let result = text;

  // 替换外语词汇
  for (const [foreign, english] of Object.entries(translations)) {
    const regex = new RegExp(`\\b${foreign}\\b`, "gi");
    result = result.replace(regex, english);
  }

  // 清理多余的空格
  result = result.replace(/\s+/g, " ").trim();

  // 如果结果为空或只有数字，添加默认后缀
  if (!result || /^\d+\s*$/.test(result)) {
    if (text.includes("vue") || text.includes("visualiz") || text.includes("Aufruf")) {
      result = result + " views";
    } else if (text.includes("il y a") || text.includes("hace") || text.includes("vor") || text.includes("fa")) {
      result = result + " ago";
    }
  }

  return result;
}

/**
 * 显示搜索结果
 * @param {Array} results - 搜索结果数组
 */
function displaySearchResults(results) {
  const videoList = document.getElementById("videoList");

  // 清空现有内容
  videoList.innerHTML = "";

  // 渲染搜索结果
  results.forEach((video, index) => {
    const videoItem = createVideoItemElement(video, index);
    videoList.appendChild(videoItem);
  });
}

/**
 * 创建视频项元素
 * @param {Object} video - 视频数据对象
 * @param {number} index - 视频索引（用于动画延迟）
 * @returns {HTMLElement} 视频项DOM元素
 */
function createVideoItemElement(video, index) {
  const videoItem = document.createElement("div");
  videoItem.className = "video-item";
  videoItem.setAttribute("data-video-id", video.id);
  videoItem.style.animationDelay = `${(index + 1) * 0.1}s`;

  videoItem.innerHTML = `
        <div class="video-thumbnail">
            <img src="${video.thumbnail}" alt="视频缩略图" />
            <div class="play-overlay">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            </div>
        </div>
        <div class="video-info">
            <h3 class="video-title">${video.title}</h3>
            <p class="video-channel">${video.channel}</p>
            <p class="video-stats">${video.views} • ${video.publishedAt}</p>
        </div>
    `;

  return videoItem;
}

/**
 * 播放视频
 * @param {string} videoId - YouTube视频ID
 * @param {string} title - 视频标题
 * @param {string} channel - 频道名称
 */
function playVideo(videoId, title, channel) {
  const videoPlayer = document.getElementById("videoPlayer");
  const youtubeFrame = document.getElementById("youtubeFrame");
  const currentVideoTitle = document.getElementById("currentVideoTitle");
  const currentVideoChannel = document.getElementById("currentVideoChannel");

  // 设置当前视频数据
  currentVideoData = {
    id: videoId,
    title: title,
    channel: channel,
    url: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`,
  };

  // 添加到观看历史
  addToWatchHistory(currentVideoData);

  // 暴露到window对象供高级脚本使用
  window.currentVideoData = currentVideoData;

  // 更新播放器信息
  youtubeFrame.src = currentVideoData.url;
  currentVideoTitle.textContent = title;
  currentVideoChannel.textContent = channel;

  // 显示播放器
  videoPlayer.style.display = "flex";
  isPlayerVisible = true;

  console.log("开始播放视频:", videoId, title);
}

/**
 * 关闭视频播放器
 */
function closeVideoPlayer() {
  const videoPlayer = document.getElementById("videoPlayer");
  const youtubeFrame = document.getElementById("youtubeFrame");

  // 停止播放
  youtubeFrame.src = "";

  // 隐藏播放器
  videoPlayer.style.display = "none";
  isPlayerVisible = false;
  currentVideoData = null;
  window.currentVideoData = null;

  console.log("关闭视频播放器");
}

/**
 * 投屏视频到电视
 */
function castVideoToTV() {
  if (!currentVideoData) {
    showNotification("没有正在播放的视频");
    return;
  }

  try {
    // 构造投屏消息
    const castMessage = {
      type: "VIDEO_CONTROL",
      action: "PLAY",
      videoURL: currentVideoData.url,
      videoFileName: currentVideoData.title,
      videoSource: "youtube",
      videoId: currentVideoData.id,
      subtitles: [],
    };

    // 发送投屏消息到3D场景
    broadcastMessage(castMessage);

    // 显示投屏成功提示
    showNotification(`正在投屏: ${currentVideoData.title}`);

    console.log("投屏消息已发送:", castMessage);
  } catch (error) {
    console.error("投屏失败:", error);
    showNotification("投屏失败，请稍后重试");
  }
}

/**
 * 广播消息到父窗口（3D场景）
 * @param {Object} message - 要发送的消息对象
 */
function broadcastMessage(message) {
  if (window.parent && window.parent.parent) {
    window.parent.parent.postMessage(message, "*");
    console.log("消息已发送到父窗口:", message);
  } else {
    console.warn("无法找到父窗口进行消息传递");
  }
}

/**
 * 显示/隐藏加载状态
 * @param {boolean} show - 是否显示加载状态
 * @param {string} message - 加载消息
 */
function showLoading(show, message = "正在搜索视频...") {
  const loading = document.getElementById("loading");
  if (show) {
    loading.style.display = "flex";
    const loadingText = loading.querySelector("p");
    if (loadingText) {
      loadingText.textContent = message;
    }
  } else {
    loading.style.display = "none";
  }
}

/**
 * 显示通知消息
 * @param {string} message - 通知消息内容
 * @description 显示临时通知消息给用户
 */
function showNotification(message) {
  // 创建通知元素
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.textContent = message;

  // 设置通知样式
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 24px;
        font-size: 14px;
        z-index: 3000;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        animation: slideInDown 0.3s ease-out;
    `;

  // 添加动画样式
  const style = document.createElement("style");
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

  // 3秒后自动移除
  setTimeout(() => {
    notification.style.animation = "slideInDown 0.3s ease-out reverse";
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
 * 处理键盘快捷键
 */
document.addEventListener("keydown", function (e) {
  // ESC键关闭播放器
  if (e.key === "Escape" && isPlayerVisible) {
    closeVideoPlayer();
  }

  // Ctrl+K 聚焦搜索框
  if (e.ctrlKey && e.key === "k") {
    e.preventDefault();
    document.getElementById("searchInput").focus();
  }
});

// 暴露必要函数到window对象
window.showNotification = showNotification;

console.log("YouTube App 脚本加载完成");
