let foodData = {};
let ytPlayer;

// 状態管理
let currentPlaylist = [];
let currentIndex = 0;
let lastFood = "";
let lastMood = "";
let lastTaste = ""; // ★追加：前回の味覚を記憶

let checkInterval = null;
let hasTriggeredSignal = false;

// ログ設定
const LOG_API_URL = "https://script.google.com/macros/s/AKfycbwLsj258W_NHasVNwWUEZQAQqZbrRwkKEfNlYOUubjPdTwPKpxrK5DP7RDXivTNH-vBzQ/exec";
const USER_ID = "user_" + Math.floor(1000 + Math.random() * 9000);

function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function sendLog(action, value = "") {
  if (!LOG_API_URL || LOG_API_URL.includes("xxxxx")) return;
  const data = { userId: USER_ID, action: action, value: value };
  fetch(LOG_API_URL, {
    method: "POST", mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).catch(err => console.error(err));
}

function getCurrentVolume() {
  const slider = document.getElementById("volumeSlider");
  return slider ? slider.value : "unknown";
}

async function loadData() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    foodData = await res.json();
    populateFoodList();
    sendLog("page_view", "Access");
  } catch (err) {
    console.error("❌ JSON読込エラー:", err);
    alert("データの読み込みに失敗しました。");
  }
}

function populateFoodList() {
  const foodSelect = document.getElementById("food");
  if (!foodSelect) return;
  
  foodSelect.innerHTML = '<option value="">-- 選択してください --</option>';
  Object.keys(foodData).forEach(foodName => {
    const opt = document.createElement("option");
    opt.value = foodName;
    opt.textContent = foodName;
    foodSelect.appendChild(opt);
  });
  foodSelect.addEventListener("change", handleFoodChange);
}

function handleFoodChange() {
  const selectedFood = document.getElementById("food").value;
  const tasteSection = document.getElementById("taste-section");
  const tasteSelect = document.getElementById("taste");
  const moodSelect = document.getElementById("mood");

  tasteSelect.innerHTML = '<option value="">-- 選択してください --</option>';
  tasteSection.style.display = "none";

  if (!selectedFood || !foodData[selectedFood]) {
    moodSelect.innerHTML = '<option value="">（料理を選択してください）</option>';
    moodSelect.disabled = true;
    return;
  }

  // ★変更点：味覚の選択肢（option_taste）がある場合のみ表示
  const options = foodData[selectedFood].options || [];
  if (options.length > 0) {
    tasteSection.style.display = "block";
    options.forEach(taste => {
      const opt = document.createElement("option");
      opt.value = taste;
      opt.textContent = translateTaste(taste);
      tasteSelect.appendChild(opt);
    });
  }

  // 気分選択（制限解除版）
  moodSelect.disabled = false;
  moodSelect.innerHTML = '<option value="">-- 選択してください --</option>';
  const moods = ["relaxation", "excitement", "focus", "calm"];
  moods.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = displayMood(m);
    moodSelect.appendChild(opt);
  });
}

function translateTaste(taste) {
  const map = { sweet: "甘味", sour: "酸味", bitter: "苦味", salty: "塩味", spicy: "辛味", umami: "旨味" };
  return map[taste] || taste;
}

function displayMood(mood) {
  const map = { relaxation: "リラックス", excitement: "元気", focus: "集中", calm: "落ち着き" };
  return map[mood] || mood;
}

// ===== 🔽 変更点：味覚(taste)を使って曲を取得する 🔽 =====
function getTracksFor(food, mood, selectedTaste) {
  const foodInfo = foodData[food];
  if (!foodInfo) return [];

  // 選択された味覚、なければデフォルトの味覚を使う
  const targetTaste = selectedTaste || foodInfo.taste;

  // その味覚の音楽データがあるか確認
  if (!foodInfo.music || !foodInfo.music[targetTaste]) {
    console.warn(`Music not found for taste: ${targetTaste}`);
    return [];
  }

  const tracks = foodInfo.music[targetTaste][mood] || [];
  return tracks.filter(t => t && t.uri && String(t.uri).trim() !== "");
}

// --- YouTube API ---
function onYouTubeIframeAPIReady() { console.log("YouTube API Ready."); }
function onPlayerReady(event) { event.target.playVideo(); }
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) startCheckingTime();
  else stopCheckingTime();
}
function extractYouTubeVideoId(url) {
  if (!url) return null;
  const regex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  const match = url.match(regex);
  return (match && match[1]) ? match[1] : null;
}

// --- 1分タイマー ---
function startCheckingTime() {
  stopCheckingTime();
  checkInterval = setInterval(() => {
    if (ytPlayer && ytPlayer.getCurrentTime) checkTime(ytPlayer.getCurrentTime());
  }, 1000);
}
function stopCheckingTime() {
  if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
}
function checkTime(currentTime) {
  if (!hasTriggeredSignal && currentTime >= 60) {
    triggerSignalAction();
    hasTriggeredSignal = true;
  }
}
function triggerSignalAction() {
  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.innerHTML = "🍽️ 1分経過しました。<br>次の曲へ進みますか？";
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
  sendLog("signal_60s", `Shown at Vol:${getCurrentVolume()}`);
}

// 再生処理
function playTrack(track) {
  const audioPlayer = document.getElementById("audioPlayer");
  const youtubePlayerDiv = document.getElementById("youtubePlayer");
  const volumeSlider = document.getElementById("volumeSlider");
  const volValueDisplay = document.getElementById("volValue");
  
  const uri = String(track.uri);
  const title = track.title || "Unknown Title";

  const minVol = (track.vol_min !== undefined) ? Number(track.vol_min) : 0;
  const maxVol = (track.vol_max !== undefined) ? Number(track.vol_max) : 100;
  
  let initVol;
  if (track.vol_init !== undefined && track.vol_init !== null) {
    initVol = Number(track.vol_init);
  } else {
    initVol = Math.floor((minVol + maxVol) / 2);
  }

  if (volumeSlider && volValueDisplay) {
    volumeSlider.min = 0;
    volumeSlider.max = 100;
    volumeSlider.value = initVol;
    volValueDisplay.textContent = initVol + "%";

    const colorGray = "#d3d3d3";
    const colorGreen = "#999999"; 

    volumeSlider.style.background = `linear-gradient(to right, 
        ${colorGray} 0%, 
        ${colorGray} ${minVol}%, 
        ${colorGreen} ${minVol}%, 
        ${colorGreen} ${maxVol}%, 
        ${colorGray} ${maxVol}%, 
        ${colorGray} 100%)`;
  }

  console.log(`Playing [${currentIndex + 1}/${currentPlaylist.length}]: ${title} (Init:${initVol}%)`);
  sendLog("play_start", `${title} (InitVol:${initVol})`);

  hasTriggeredSignal = false;
  stopCheckingTime();
  const existingToast = document.querySelector(".toast-message");
  if (existingToast) existingToast.remove();

  const videoId = extractYouTubeVideoId(uri);
  
  if (videoId) {
    audioPlayer.pause();
    audioPlayer.style.display = "none";
    youtubePlayerDiv.style.display = "block";
    audioPlayer.ontimeupdate = null;

    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
      ytPlayer.loadVideoById(videoId);
      ytPlayer.setVolume(initVol);
    } else {
      if (ytPlayer && typeof ytPlayer.destroy === 'function') ytPlayer.destroy();
      ytPlayer = new YT.Player("youtubePlayer", {
        videoId: videoId,
        host: 'https://www.youtube.com',
        playerVars: {
          'playsinline': 1, 'autoplay': 1, 'controls': 1, 'rel': 0,
          'enablejsapi': 1, 'origin': window.location.origin
        },
        events: {
          'onReady': (event) => {
             event.target.setVolume(initVol);
             onPlayerReady(event);
          },
          'onStateChange': onPlayerStateChange
        }
      });
    }
  } else {
    if (ytPlayer && typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
    youtubePlayerDiv.style.display = "none";
    audioPlayer.style.display = "block";
    stopCheckingTime();

    audioPlayer.ontimeupdate = function() { checkTime(audioPlayer.currentTime); };
    audioPlayer.onended = function() { console.log("Audio ended."); };

    try {
        audioPlayer.src = uri;
        audioPlayer.volume = initVol / 100;
        audioPlayer.play().catch(e => console.warn(e));
    } catch(e) { console.error(e); }
  }
}

// ===== 🔽 クリック時の処理（味覚も考慮） 🔽 =====
function handlePlayButtonClick() {
  sendLog("button_click", "clicked");
  
  const currentVol = getCurrentVolume();
  if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function' && typeof ytPlayer.getPlayerState === 'function') {
    const s = ytPlayer.getPlayerState();
    if (s===1 || s===2) sendLog("skip_time", `${Math.floor(ytPlayer.getCurrentTime())}s (EndVol:${currentVol})`);
  } else {
     const ap = document.getElementById("audioPlayer");
     if (!ap.paused && ap.currentTime > 0) sendLog("skip_time", `${Math.floor(ap.currentTime)}s (EndVol:${currentVol})`);
  }

  const food = document.getElementById("food").value;
  const mood = document.getElementById("mood").value;
  const tasteUIShown = document.getElementById("taste-section").style.display !== "none";
  const taste = document.getElementById("taste").value;

  if (!food || !mood) { alert("料理と気分を選択してください。"); return; }
  
  // 味覚選択が必要なのに空欄の場合
  if (tasteUIShown && !taste) { alert("味覚も選択してください。"); return; }

  // 条件が変わったか判定（味覚も含む）
  const isSameCondition = (food === lastFood && mood === lastMood && taste === lastTaste);

  if (isSameCondition && currentPlaylist.length > 0) {
    // 条件が同じならループ再生
    currentIndex++;
    if (currentIndex >= currentPlaylist.length) {
      currentIndex = 0;
      console.log("Looping playlist.");
    }
    playTrack(currentPlaylist[currentIndex]);

  } else {
    // 条件が変わったら新規リスト取得
    // ★ここで味覚(taste)も渡して曲を取得します
    const tracks = getTracksFor(food, mood, taste);
    
    if (tracks.length === 0) { 
      alert("この組み合わせの曲が未登録です。"); 
      return; 
    }
    
    lastFood = food;
    lastMood = mood;
    lastTaste = taste; // 味覚も記憶
    
    currentPlaylist = shuffleArray(tracks);
    currentIndex = 0;
    
    console.log("New playlist shuffled:", currentPlaylist.map(t => t.title));
    playTrack(currentPlaylist[currentIndex]);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  const playBtn = document.getElementById("playBtn");
  if (playBtn) playBtn.addEventListener("click", handlePlayButtonClick);

  const volumeSlider = document.getElementById("volumeSlider");
  const volValueDisplay = document.getElementById("volValue");

  if (volumeSlider && volValueDisplay) {
    volumeSlider.addEventListener("input", () => {
      const val = volumeSlider.value;
      volValueDisplay.textContent = val + "%";
      if (ytPlayer && typeof ytPlayer.setVolume === 'function') ytPlayer.setVolume(val);
      const audioPlayer = document.getElementById("audioPlayer");
      if (audioPlayer) audioPlayer.volume = val / 100;
    });
    volumeSlider.addEventListener("change", () => {
      const val = volumeSlider.value;
      console.log("Volume changed by user to:", val);
      sendLog("volume_change", `User set to ${val}%`);
    });
  }
});