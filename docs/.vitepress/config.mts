import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'The Book of the Runtime (日本語版)',
  description: '.NET ランタイムの内部構造を日本語で解説するサイト',
  lang: 'ja',
  base: '/the-book-of-the-runtime-ja/',
  themeConfig: {
    nav: [
      { text: 'ホーム', link: '/' },
      { text: '原文 (英語)', link: 'https://jurakovic.github.io/runtime/' }
    ],
    sidebar: [
      {
        text: '目次',
        items: [
          { text: 'はじめに', link: '/' },
          { text: 'BOTR FAQ', link: '/botr-faq' },
          { text: 'CLR 入門', link: '/intro-to-clr' },
          { text: 'ガベージコレクション', link: '/garbage-collection' },
          { text: 'スレッディング', link: '/threading' },
          { text: 'RyuJIT 概要', link: '/ryujit-overview' },
          { text: 'RyuJIT の他プラットフォームへの移植', link: '/porting-ryujit' },
          { text: '型システム', link: '/type-system' },
          { text: '型ローダー', link: '/type-loader' },
          { text: 'メソッドディスクリプタ', link: '/method-descriptor' },
          { text: '仮想スタブディスパッチ', link: '/virtual-stub-dispatch' },
          { text: 'スタックウォーキング', link: '/stackwalking' },
          { text: 'System.Private.CoreLib', link: '/corelib' },
          { text: 'DAC ノート', link: '/dac-notes' },
          { text: 'プロファイリング', link: '/profiling' },
          { text: 'プロファイラビリティの実装', link: '/profilability' },
          { text: '例外処理', link: '/exceptions' },
          { text: 'ReadyToRun 概要', link: '/readytorun-overview' },
          { text: 'CLR ABI', link: '/clr-abi' },
          { text: 'クロスプラットフォームミニダンプ', link: '/xplat-minidump-generation' },
          { text: '混合モードアセンブリ', link: '/mixed-mode' },
          { text: '移植ガイド', link: '/guide-for-porting' },
          { text: 'ベクトルと組み込み関数', link: '/vectors-and-intrinsics' },
          { text: 'ILC コンパイラアーキテクチャ', link: '/ilc-architecture' },
          { text: 'マネージド型システムの概要', link: '/managed-type-system' },
          { text: 'ReadyToRun PerfMap フォーマット', link: '/r2r-perfmap-format' },
          { text: 'ReadyToRun ファイルフォーマット', link: '/readytorun-format' },
          { text: 'ReadyToRun ネイティブエンベロープ', link: '/readytorun-platform-native-envelope' },
          { text: '共有ジェネリクスの設計', link: '/shared-generics' },
          { text: '開発者向けランタイムロギング', link: '/logging' },
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/openjny/the-book-of-the-runtime-ja' }
    ],
    outline: {
      label: '目次'
    },
    search: {
      provider: 'local'
    }
  }
})
