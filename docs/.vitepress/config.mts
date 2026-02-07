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
          { text: '型システム', link: '/type-system' },
          { text: '型ローダー', link: '/type-loader' },
          { text: '例外処理', link: '/exceptions' },
          { text: 'プロファイリング', link: '/profiling' },
          { text: 'ReadyToRun 概要', link: '/readytorun-overview' },
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
