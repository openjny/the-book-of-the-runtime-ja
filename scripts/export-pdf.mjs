#!/usr/bin/env node

/**
 * VitePress でビルドしたサイトを Playwright で各ページを PDF に出力し、
 * pdf-lib で1つの PDF に結合するスクリプト。
 *
 * Usage:
 *   npm run docs:build
 *   npm run docs:pdf
 */

import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { createServer } from "http";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST_DIR = resolve(ROOT, "docs", ".vitepress", "dist");
const OUTPUT_DIR = resolve(ROOT, "dist-pdf");
const BASE = "/the-book-of-the-runtime-ja/";

// サイドバーの順序に合わせたページリスト
const PAGES = [
  { path: "/", title: "はじめに" },
  { path: "/botr-faq", title: "BOTR FAQ" },
  { path: "/intro-to-clr", title: "CLR 入門" },
  { path: "/garbage-collection", title: "ガベージコレクション" },
  { path: "/threading", title: "スレッディング" },
  { path: "/ryujit-overview", title: "RyuJIT 概要" },
  { path: "/porting-ryujit", title: "RyuJIT の他プラットフォームへの移植" },
  { path: "/type-system", title: "Type System" },
  { path: "/type-loader", title: "型ローダー" },
  { path: "/method-descriptor", title: "メソッドディスクリプタ" },
  { path: "/virtual-stub-dispatch", title: "仮想スタブディスパッチ" },
  { path: "/stackwalking", title: "スタックウォーキング" },
  { path: "/corelib", title: "System.Private.CoreLib" },
  { path: "/dac-notes", title: "DAC ノート" },
  { path: "/profiling", title: "プロファイリング" },
  { path: "/profilability", title: "プロファイラビリティの実装" },
  { path: "/exceptions", title: "例外処理" },
  { path: "/readytorun-overview", title: "ReadyToRun 概要" },
  { path: "/clr-abi", title: "CLR ABI" },
  {
    path: "/xplat-minidump-generation",
    title: "クロスプラットフォームミニダンプ",
  },
  { path: "/mixed-mode", title: "混合モードアセンブリ" },
  { path: "/guide-for-porting", title: "移植ガイド" },
  { path: "/vectors-and-intrinsics", title: "ベクトルと組み込み関数" },
  { path: "/ilc-architecture", title: "ILC コンパイラアーキテクチャ" },
  { path: "/managed-type-system", title: "マネージド型システムの概要" },
  { path: "/r2r-perfmap-format", title: "ReadyToRun PerfMap フォーマット" },
  { path: "/readytorun-format", title: "ReadyToRun ファイルフォーマット" },
  {
    path: "/readytorun-platform-native-envelope",
    title: "ReadyToRun ネイティブエンベロープ",
  },
  { path: "/shared-generics", title: "共有ジェネリクスの設計" },
  { path: "/logging", title: "開発者向けランタイムロギング" },
];

// --- Simple static file server ---

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function startStaticServer(distDir, base) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let url = req.url.split("?")[0];

      // Strip base path
      if (url.startsWith(base)) {
        url = url.slice(base.length - 1); // keep leading /
      }

      let filePath = join(distDir, url);

      // Try directory index
      if (url.endsWith("/")) {
        filePath = join(filePath, "index.html");
      }

      // Try .html extension
      if (!existsSync(filePath) && !extname(filePath)) {
        filePath += ".html";
      }

      try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

// --- PDF export ---

async function exportPdf() {
  // Ensure dist exists
  if (!existsSync(DIST_DIR)) {
    console.error(
      "❌ ビルド出力が見つかりません。先に npm run docs:build を実行してください。",
    );
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("🚀 静的サーバーを起動中...");
  const { server, port } = await startStaticServer(DIST_DIR, BASE);
  const origin = `http://127.0.0.1:${port}`;
  console.log(`   サーバー起動: ${origin}`);

  const browser = await chromium.launch();
  const context = await browser.newContext();

  const chapterPdfs = [];

  for (const page of PAGES) {
    const url = `${origin}${BASE}${page.path === "/" ? "" : page.path.slice(1) + ".html"}`;
    const browserPage = await context.newPage();

    console.log(`📄 ${page.title} (${url})`);

    await browserPage.goto(url, { waitUntil: "networkidle" });

    // VitePress の UI 要素を非表示にし、フォント・画像サイズを縮小して印刷向けに調整
    await browserPage.addStyleTag({
      content: `
        .VPNav, .VPSidebar, .VPDocFooter, .VPFooter,
        .prev-next, aside.VPDocAside, .VPLocalNav,
        .edit-link, .VPHero .actions { display: none !important; }
        .VPDoc { padding: 0 !important; margin: 0 !important; }
        .VPContent { padding: 0 !important; max-width: 100% !important; }
        .VPDoc .container { max-width: 100% !important; }
        .vp-doc { max-width: 100% !important; }
        main { max-width: 100% !important; }

        /* フォントサイズ縮小 */
        html { font-size: 12px !important; }
        .vp-doc h1 { font-size: 1.8rem !important; }
        .vp-doc h2 { font-size: 1.4rem !important; }
        .vp-doc h3 { font-size: 1.15rem !important; }
        .vp-doc p, .vp-doc li, .vp-doc td, .vp-doc th,
        .vp-doc blockquote, .vp-doc .custom-block {
          font-size: 0.95rem !important;
          line-height: 1.6 !important;
        }
        .vp-doc code { font-size: 0.85rem !important; }
        .vp-doc pre code { font-size: 0.8rem !important; }

        /* 画像サイズ縮小 */
        .vp-doc img {
          max-width: 85% !important;
          height: auto !important;
        }
      `,
    });

    // 画像の読み込みを待機
    await browserPage.waitForTimeout(500);

    const pdfBuffer = await browserPage.pdf({
      format: "A4",
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
      printBackground: true,
    });

    // 個別 PDF を保存
    const filename =
      page.path === "/" ? "index.pdf" : `${page.path.slice(1)}.pdf`;
    writeFileSync(join(OUTPUT_DIR, filename), pdfBuffer);
    chapterPdfs.push(pdfBuffer);

    await browserPage.close();
  }

  await browser.close();
  server.close();

  // 全チャプターを1つの PDF に結合
  console.log("\n📚 全チャプターを結合中...");
  const mergedPdf = await PDFDocument.create();

  for (const pdfBytes of chapterPdfs) {
    const doc = await PDFDocument.load(pdfBytes);
    const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
    for (const p of pages) {
      mergedPdf.addPage(p);
    }
  }

  mergedPdf.setTitle("The Book of the Runtime (日本語版)");
  mergedPdf.setAuthor(".NET Runtime Team / 日本語訳");
  mergedPdf.setSubject(".NET ランタイムの内部構造");

  const mergedBytes = await mergedPdf.save();
  const mergedPath = join(OUTPUT_DIR, "the-book-of-the-runtime-ja.pdf");
  writeFileSync(mergedPath, mergedBytes);

  // プロジェクトルートにもコピー
  const rootCopy = join(ROOT, "the-book-of-the-runtime-ja.pdf");
  copyFileSync(mergedPath, rootCopy);

  console.log(`\n✅ 完了!`);
  console.log(`   個別 PDF: ${OUTPUT_DIR}/`);
  console.log(`   結合 PDF: ${rootCopy}`);
}

exportPdf().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
