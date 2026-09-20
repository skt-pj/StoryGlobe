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

## URLパラメータ

GitHub PagesのURLに直接パラメータを付けて、画面操作なしでMP4生成・ダウンロードを開始できます。

```text
?height=350000&duration=5&width=1920&heightPx=1080&download=1&filename=nessie
```

短縮形:

```text
?w=1920&h=1080&duration=5&download=1&filename=nessie
```

次動画も指定する場合:

```text
?w=1920&h=1080&duration=5&next=https%3A%2F%2Fexample.com%2Fmovie.mp4&download=1&filename=nessie
```

対応項目:

- `height`: 到着高度(m)
- `duration`: フライト時間(秒)
- `width` / `w`: MP4出力幅(px)
- `heightPx` / `h`: MP4出力高さ(px)
- `video` / `next`: フライト後に表示する動画URL
- `filename`: ダウンロードするMP4名（拡張子省略可）
- `download=1`: 読み込み後に自動生成・自動ダウンロード
- `autoplay=1` / `run=1`: `download=1` と同様に自動開始

現在の遷移先はネッシー（ネス湖）に固定されています。

## GitHub Pages

静的ファイルだけで動作します。GitHub Pagesでは `main / (root)` を公開元に指定します。
