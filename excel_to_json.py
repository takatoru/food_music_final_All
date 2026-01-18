import pandas as pd
import json

# ====== 設定 ======
INPUT_EXCEL = "卒論_実装用対応表_All.xlsx"
OUTPUT_JSON = "data.json"

SHEET_FOOD = "食品ー味覚"
SHEET_MUSIC = "味覚ー気分ー音楽"
SHEET_API = "API"

MOOD_MAP = {
    "リラックス": "relaxation", "relax": "relaxation",
    "元気": "excitement", "genki": "excitement",
    "集中": "focus", "shuchu": "focus",
    "落ち着き": "calm", "ochitsuki": "calm"
}

def db_to_vol(db_val):
    try:
        vol = ((float(db_val) + 60) / 60) * 100
        return int(max(0, min(100, vol)))
    except:
        return 100

def main():
    print(f"📂 {INPUT_EXCEL} を読み込んでいます...")

    try:
        xls = pd.ExcelFile(INPUT_EXCEL)
        df_food = pd.read_excel(xls, sheet_name=SHEET_FOOD)
        df_music = pd.read_excel(xls, sheet_name=SHEET_MUSIC)
        
        # APIシートの読み込み（あれば）
        if SHEET_API in xls.sheet_names:
            df_api = pd.read_excel(xls, sheet_name=SHEET_API)
        else:
            df_api = pd.DataFrame()

    except Exception as e:
        print(f"❌ 読み込みエラー: {e}")
        return

    # --- 1. 音量設定の辞書化 ---
    volume_ranges = {}
    if not df_api.empty:
        df_api.columns = df_api.columns.str.strip()
        for _, row in df_api.iterrows():
            t = str(row.get('Taste', '')).strip().lower()
            m = str(row.get('Mood', '')).strip().lower()
            v_min = db_to_vol(row.get('LoudMin', -60))
            v_max = db_to_vol(row.get('LoudMax', 0))
            if t and m:
                volume_ranges[(t, m)] = {"min": v_min, "max": v_max}

    # --- 2. 音楽データの整理 ---
    music_db = {}
    df_music.columns = df_music.columns.str.strip()
    
    for _, row in df_music.iterrows():
        taste = str(row.get('taste', row.get('default_taste', ''))).strip()
        mood_raw = str(row.get('mood', row.get('気分', ''))).strip()
        mood = MOOD_MAP.get(mood_raw, mood_raw.lower())

        if not taste or not mood: continue
        if taste not in music_db: music_db[taste] = {}
        if mood not in music_db[taste]: music_db[taste][mood] = []
            
        vol_setting = volume_ranges.get((taste.lower(), mood.lower()), {"min": 0, "max": 100})
        
        # InitialVolの取得
        init_vol_raw = row.get('InitialVol', None)
        v_init = int(init_vol_raw) if pd.notna(init_vol_raw) else None

        track = {
            "title": str(row.get('song_title', row.get('song', row.get('曲名', '')))).strip(),
            "uri": str(row.get('uri', row.get('link', row.get('リンク', '')))).strip(),
            "artist": str(row.get('artist', row.get('アーティスト', ''))).strip(),
            "vol_min": vol_setting["min"],
            "vol_max": vol_setting["max"],
            "vol_init": v_init
        }
        
        if track["uri"] and track["uri"].lower() != "nan":
            music_db[taste][mood].append(track)

    # --- 3. 食品データの構築（ここが重要） ---
    data = {}
    df_food.columns = df_food.columns.str.strip()
    
    # 食品名でグループ化する準備
    grouped_food = {}

    for _, row in df_food.iterrows():
        food_name = str(row.get('food_name', '')).strip()
        if not food_name: continue

        if food_name not in grouped_food:
            # 新規食品
            default_taste = str(row.get('default_taste', '')).strip()
            
            # 固定気分の取得（'mood'列があれば）
            mood_in_excel = str(row.get('mood', '')).strip()
            fixed_mood = MOOD_MAP.get(mood_in_excel, "") if mood_in_excel else ""

            grouped_food[food_name] = {
                "id": str(row.get('food_id', '')).strip(),
                "taste": default_taste,
                "fixed_mood": fixed_mood,
                "options": set(), # 選択肢を格納するセット（重複排除）
                "music": {} 
            }
        
        # allow_choice が TRUE なら option_taste を追加
        if row.get('allow_choice') == True:
            opt = str(row.get('option_taste', '')).strip()
            if opt and opt.lower() != 'nan':
                grouped_food[food_name]["options"].add(opt)

    # JSON用データへの変換
    for fname, info in grouped_food.items():
        # オプションリストを作成（デフォルト味も含めるか、Excelの記述通りにする）
        # script.js側でリスト表示に使います
        options_list = sorted(list(info["options"]))
        
        # 必要な味覚（デフォルト味 + オプション味）の音楽データを全て格納
        # 構造: music = { "salty": { mood: [...] }, "sweet": { mood: [...] } }
        tastes_to_include = set([info["taste"]] + options_list)
        
        for t in tastes_to_include:
            if t in music_db:
                info["music"][t] = music_db[t]
        
        info["options"] = options_list
        data[fname] = info

    # --- 4. JSON出力 ---
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f"✅ {OUTPUT_JSON} を更新しました！")
    print(f"   登録食品数: {len(data)}")

if __name__ == "__main__":
    main()