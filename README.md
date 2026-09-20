# StoryGlobe

ブラウザ上で衛星写真の3D地球を表示し、指定地点までカメラ移動して、そのフライトをMP4として出力する静的Webアプリです。

## 起動

ビルドは不要です。HTTPサーバー経由で `index.html` を開いてください。

```bash
python -m http.server 8000
```

その後 `http://localhost:8000` を開きます。

## 使い方

1. 地点名、緯度、経度、到着高度、移動時間を入力します。
2. 出力するMP4の幅・高さをピクセル単位で入力します。
3. 「開始してMP4出力」を押します。
4. 開始後は操作UIが非表示になります。
5. 地球全景から指定地点まで移動し、終了後にMP4を保存します。

動画URLを指定している場合は、MP4出力後に従来どおり動画表示へ遷移します。

## 衛星写真

地球表示には Esri World Imagery を使用します。Cesium ionトークンは不要です。

## MP4出力

WebCodecsでH.264を30fps固定タイムスタンプでエンコードし、mp4-muxerで通常MP4として生成します。

- 30fps固定
- 1秒ごとにキーフレーム
- `fastStart` でMP4メタデータを先頭配置
- MediaRecorderのfragmented MP4は使用しません

H.264 WebCodecsに対応していないブラウザでは開始前に非対応メッセージを表示します。

## 起動時の設定優先順位

1. URLパラメータがない場合は、前回ブラウザで使用した設定をCookieから復元します。
2. URLパラメータがある場合は、Cookieを復元したあと指定された項目だけURL値で上書きします。自動開始はしません。
3. `auto=1` を付けた場合は、URL/Cookieから設定を確定したあと自動で生成し、MP4ダウンロードまで進みます。

初回アクセスでCookieがない場合はネッシー / ネス湖の既定値を使用します。画面で変更した値とURLで指定した値は、次回アクセス用Cookieへ保存されます。

## URLパラメータ

通常起動で値だけ指定する例:

```text
?name=ネッシー&lat=57.2741223&lon=-4.4849684&w=1920&h=1080&duration=5
```

自動生成・自動ダウンロード:

```text
?name=ネッシー&lat=57.2741223&lon=-4.4849684&w=1920&h=1080&duration=5&auto=1&filename=nessie
```

対応項目:

- `name`: 地点名
- `lat` / `latitude`: 緯度
- `lon` / `lng` / `longitude`: 経度
- `height`: 到着高度(m)
- `duration`: フライト時間(秒)
- `width` / `w`: MP4出力幅(px)
- `heightPx` / `h`: MP4出力高さ(px)
- `video` / `next`: フライト後に表示する動画URL
- `filename`: ダウンロードするMP4名
- `auto=1`: 自動生成してダウンロード
- 互換用として `autoplay=1` / `download=1` / `run=1` も自動開始として扱います

## Pythonから自動生成・DL

GitHub Pagesは静的サイトなので、HTTPリクエストだけではCesium/WebGL/WebCodecsの動画生成は実行できません。付属のPythonクライアントがヘッドレスChromeを操作し、Python側の呼び出しだけで生成から保存まで完結させます。

準備:

```bash
pip install playwright
playwright install chrome
```

CLI:

```bash
python scripts/download_storyglobe.py output/nessie.mp4 \
  --name ネッシー \
  --lat 57.2741223 \
  --lon -4.4849684 \
  --height 350000 \
  --duration 5 \
  --width 1920 \
  --output-height 1080
```

Pythonコードから直接:

```python
from scripts.download_storyglobe import download_storyglobe

path = download_storyglobe(
    "output/nessie.mp4",
    name="ネッシー",
    lat=57.2741223,
    lon=-4.4849684,
    height=350000,
    duration=5,
    width=1920,
    output_height=1080,
)
print(path)
```

この関数はURLへ `auto=1` を付け、ダウンロードイベントを待って指定パスへMP4を保存します。

## GitHub Pages

静的ファイルだけで動作します。GitHub Pagesでは `main / (root)` を公開元に指定します。
