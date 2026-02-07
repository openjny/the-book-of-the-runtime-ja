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
      text: PDF をダウンロード
      link: https://github.com/openjny/the-book-of-the-runtime-ja/raw/main/the-book-of-the-runtime-ja.pdf
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
- [RyuJIT の他プラットフォームへの移植](./porting-ryujit) - RyuJIT の移植
- [型システム](./type-system) - 型システムの設計
- [型ローダー](./type-loader) - 型の読み込み処理
- [メソッドディスクリプタ](./method-descriptor) - メソッドの記述子
- [仮想スタブディスパッチ](./virtual-stub-dispatch) - 仮想メソッドのディスパッチ
- [スタックウォーキング](./stackwalking) - スタックの走査
- [System.Private.CoreLib](./corelib) - CoreLib とランタイムの呼び出し
- [DAC ノート](./dac-notes) - データアクセスコンポーネント
- [プロファイリング](./profiling) - プロファイリングの仕組み
- [プロファイラビリティの実装](./profilability) - プロファイラビリティの実装
- [例外処理](./exceptions) - ランタイムの例外処理
- [ReadyToRun 概要](./readytorun-overview) - AOT コンパイルの概要
- [CLR ABI](./clr-abi) - CLR の ABI 仕様
- [クロスプラットフォームミニダンプ](./xplat-minidump-generation) - ミニダンプ生成
- [混合モードアセンブリ](./mixed-mode) - 混合モードアセンブリ
- [移植ガイド](./guide-for-porting) - ランタイムの移植ガイド
- [ベクトルと組み込み関数](./vectors-and-intrinsics) - SIMD サポート
- [ILC コンパイラアーキテクチャ](./ilc-architecture) - ILC コンパイラの設計
- [マネージド型システムの概要](./managed-type-system) - マネージド型システム
- [ReadyToRun PerfMap フォーマット](./r2r-perfmap-format) - PerfMap フォーマット
- [ReadyToRun ファイルフォーマット](./readytorun-format) - R2R ファイル形式
- [ReadyToRun ネイティブエンベロープ](./readytorun-platform-native-envelope) - ネイティブエンベロープ
- [共有ジェネリクスの設計](./shared-generics) - 共有ジェネリクス
- [開発者向けランタイムロギング](./logging) - ランタイムのロギング

::: tip 翻訳への貢献
翻訳の改善や新しい章の翻訳は、[GitHub リポジトリ](https://github.com/openjny/the-book-of-the-runtime-ja) で受け付けています。
:::
