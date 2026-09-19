# StoryGlobe

ブラウザ上で、テクスチャ付きの地球全景から指定地点へカメラ移動し、その地点に紐づく動画へクロスフェードする静的Webアプリです。

## 起動

ビルドは不要です。HTTPサーバー経由で `index.html` を開いてください。

例:

```bash
python -m http.server 8000
```

その後 `http://localhost:8000` を開きます。

## 使い方

1. 地点名、緯度、経度、到着高度、移動時間を入力します。
2. MP4などブラウザで再生できる動画URLを入力します。
3. 「地点へ移動して動画へ」を押します。
4. 地球から指定地点へ移動し、到着後に動画表示へ切り替わります。

動画URLを空にすると、地点へのフライトだけ確認できます。

## URLパラメータ

StoryMovieなど外部処理から直接起動できます。

```text
?name=Story&lat=35.681236&lon=139.767125&height=350000&duration=5&video=https%3A%2F%2Fexample.com%2Fmovie.mp4&autoplay=1
```

対応項目:

- `name`: 地点名
- `lat`: 緯度
- `lon`: 経度
- `height`: 到着高度(m)
- `duration`: フライト時間(秒)
- `video`: 動画URL
- `autoplay=1`: 読み込み後に自動でフライト開始

## 地球テクスチャ

NASA Visible Earth / Blue Marble の全球画像を使用します。Cesium ionトークンは不要です。Blue Marbleの読み込みに失敗した場合のみOpenStreetMapへフォールバックします。

## GitHub Pages

このリポジトリは静的ファイルだけで動作します。GitHubの `Settings > Pages` で `Deploy from a branch`、`main / (root)` を指定すれば公開できます。
