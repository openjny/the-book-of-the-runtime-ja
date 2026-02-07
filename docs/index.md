---
layout: home
hero:
  name: The Book of the Runtime
  text: 日本語版
  tagline: .NET ランタイムの内部構造をわかりやすく日本語で解説
  actions:
    - theme: brand
      text: 読みはじめる
      link: /botr-faq
    - theme: alt
      text: 原文を見る (英語)
      link: https://jurakovic.github.io/runtime/
features:
  - title: 🇯🇵 日本語で読める
    details: .NET ランタイムの内部ドキュメントを日本語に翻訳して提供します。
  - title: 📝 初心者にもわかりやすい注釈
    details: 原文に加えて、プログラミング初級〜中級者向けのわかりやすい注釈を追加しています。
  - title: 📖 オープンソース
    details: 誰でも翻訳や注釈の改善に貢献できます。GitHub で PR をお待ちしています。
---

## The Book of the Runtime (BOTR) とは

The Book of the Runtime (BOTR) は、.NET ランタイムの内部構造について解説したドキュメント集です。ランタイムのコードを変更する開発者や、ランタイムの深い理解を求める方を対象としています。

このサイトでは、BOTR の内容を日本語に翻訳し、さらにプログラミング初級〜中級者にもわかりやすいような注釈をつけて解説しています。

### 目次

- [BOTR FAQ](./botr-faq) - よくある質問
- [CLR 入門](./intro-to-clr) - 共通言語ランタイム (CLR) の概要
- [ガベージコレクション](./garbage-collection) - GC の設計と仕組み
- [スレッディング](./threading) - スレッド管理の仕組み
- [RyuJIT 概要](./ryujit-overview) - JIT コンパイラの概要
- [型システム](./type-system) - 型システムの設計
- [型ローダー](./type-loader) - 型の読み込み処理
- [例外処理](./exceptions) - ランタイムの例外処理
- [プロファイリング](./profiling) - プロファイリングの仕組み
- [ReadyToRun 概要](./readytorun-overview) - AOT コンパイルの概要

::: tip 翻訳への貢献
翻訳の改善や新しい章の翻訳は、[GitHub リポジトリ](https://github.com/openjny/the-book-of-the-runtime-ja) で受け付けています。
:::
