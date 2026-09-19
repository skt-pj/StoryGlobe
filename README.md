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

Cesiumの描画を30fpsで録画し、入力した解像度のMP4として保存します。

ブラウザがCanvasのMP4 MediaRecorderに対応していない場合は、開始前に非対応メッセージを表示します。

## URLパラメータ

外部処理から直接値を渡せます。

```text
?name=Story&lat=35.681236&lon=139.767125&height=350000&duration=5&width=1920&heightPx=1080&video=https%3A%2F%2Fexample.com%2Fmovie.mp4&autoplay=1
```

対応項目:

- `name`: 地点名
- `lat`: 緯度
- `lon`: 経度
- `height`: 到着高度(m)
- `duration`: フライト時間(秒)
- `width`: MP4出力幅(px)
- `heightPx`: MP4出力高さ(px)
- `video`: フライト後に表示する動画URL
- `autoplay=1`: 読み込み後に自動開始

## GitHub Pages

静的ファイルだけで動作します。GitHub Pagesでは `main / (root)` を公開元に指定します。
