# The Book of the Runtime - 日本語版

.NET ランタイムの内部構造を日本語で解説するサイトです。

[The Book of the Runtime (BOTR)](https://jurakovic.github.io/runtime/) の内容を日本語化し、さらにプログラミング初級〜中級者にもわかりやすいような注釈などをつけて解説しています。

## サイト

https://openjny.github.io/the-book-of-the-runtime-ja/

## PDF ダウンロード

全チャプターを1つにまとめた PDF 版をダウンロードできます。

[📥 PDF をダウンロード](https://github.com/openjny/the-book-of-the-runtime-ja/raw/main/the-book-of-the-runtime-ja.pdf)

## 開発

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run docs:dev

# ビルド
npm run docs:build

# ビルド結果のプレビュー
npm run docs:preview

# PDF エクスポート（ビルド後に実行）
npm run docs:build && npm run docs:pdf
# → dist-pdf/ に個別 PDF と結合 PDF が出力されます
```

## 参考

- [dotnet/runtime](https://github.com/dotnet/runtime)
- [The Book of the Runtime (英語)](https://jurakovic.github.io/runtime/)