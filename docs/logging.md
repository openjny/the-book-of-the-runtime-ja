# ランタイム開発者のためのロギング

::: info 原文
この章の原文は [Runtime logging for developers](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/logging.md) です。
:::

日付: 2024年2月

.NET ランタイムのコードベースは非常に巨大で、複数の言語にまたがる数千ものファイルに広がっています。そのコードベース全体には数千ものログメッセージが散在しており、そのほとんどはデフォルトで無効になっています。では、あらゆる不可解なテスト失敗に悩まされるランタイム開発者であるあなたは、どうすればそれらのメッセージをランタイムから取り出してコンソールやログファイルに出力できるのでしょうか？そして、新たに書いているコードに適切にログメッセージを追加するにはどうすればよいのでしょうか？

_注意: この文書では多くの環境変数を繰り返し参照します。ランタイムがサポートする環境変数の詳細なリストとその役割については、[`clrconfigvalues.h`](https://github.com/dotnet/runtime/blob/main/src/coreclr/inc/clrconfigvalues.h)、[`gcconfig.h`](https://github.com/dotnet/runtime/blob/main/src/coreclr/gc/gcconfig.h)、および [`jitconfigvalues.h`](https://github.com/dotnet/runtime/blob/main/src/coreclr/jit/jitconfigvalues.h) を参照してください。_

# ロギングの種類

## EventPipe

EventPipe は、.NET ランタイムで広く使用されている、ETW に類似したクロスプラットフォームのトレーシング (tracing) システムです。EventPipe の詳細な概要については、[.NET Learn の EventPipe ドキュメントページ](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/eventpipe)を参照してください。EventPipe は優れたパフォーマンスと高い柔軟性を備えているため、アクティブなランタイムから情報を取得する主要な方法の一つとして推奨されています。デバッグビルドでサポートされているほとんどのイベントは、リリースビルドでも公開されています。

::: tip 💡 初心者向け補足
EventPipe は、.NET アプリケーションの実行中に内部で何が起きているかを観察するための仕組みです。Java でいえば JFR (Java Flight Recorder) に近い概念です。アプリケーションのパフォーマンス問題やバグの原因を調査する際に、ランタイムが発行するイベント（ガベージコレクションの発生、JIT コンパイルの実行など）をキャプチャして分析できます。ETW (Event Tracing for Windows) は Windows 固有の仕組みですが、EventPipe はクロスプラットフォームで同様の機能を提供します。
:::

基本的なシナリオでは、[`dotnet-counters`](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters) ツールを使用して、ランタイムが EventPipe を通じて報告するイベントやパフォーマンスカウンター (performance counters) を監視できます。たとえば、プロジェクトの実行中にデフォルトのカウンターを収集するには、`dotnet-counters collect -- dotnet exec myapp.dll` を使用します。`--` の後の部分はトレース対象のコマンドを指定します。

[`dotnet-trace`](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-trace) ツールを使用して、実行中のランタイムから EventPipe イベントをリアルタイムでキャプチャすることもできます。このツールには、重大度レベルやキーワードに基づいてイベントをフィルタリングするコマンドラインオプションが用意されています。たとえば、プロジェクトの実行中に情報レベルの GC イベントをキャプチャするには、`dotnet-trace collect --clreventlevel informational --clrevents gc -- dotnet exec myapp.dll` を使用します。`--` の後の部分はトレース対象のコマンドを指定します。`collect` コマンドは、`--profile` スイッチを介してアクセスできる便利なデフォルトプロファイル (profile) のセットもサポートしています。例: `--profile gc-collect`:

```
cpu-sampling     - CPU 使用率と一般的な .NET ランタイム情報の追跡に役立ちます。プロファイルやプロバイダーが指定されていない場合のデフォルトオプションです。
gc-verbose       - GC コレクションを追跡し、オブジェクトアロケーションをサンプリングします。
gc-collect       - 非常に低いオーバーヘッドで GC コレクションのみを追跡します。
database         - ADO.NET と Entity Framework のデータベースコマンドをキャプチャします。
```

`dotnet-trace collect` コマンドは `.nettrace` ファイルを生成します。これは `dotnet-trace report topN`（CPU サンプリング情報の場合）や `dotnet-trace convert` で分析できます。また、この `.nettrace` ファイルを Visual Studio で直接開いて調査することもできます。たとえば、ソリューションエクスプローラーでダブルクリックするか、Visual Studio のウィンドウにドラッグします。

アプリケーションが `dotnet-counters` または `dotnet-trace` の監視下で実行できない場合は、`--show-child-io` ツール引数を渡して子プロセスの出力を可視化し、エラーメッセージを確認してみてください。正しい作業ディレクトリから、必要な環境変数を設定した状態で実行していることを確認してください。

上記の各ツールの使い方の詳細については、リンク先のドキュメントページを参照してください。これらのツールには、時間制限、既存のプロセスへのアタッチ、設定可能な出力フォーマットなど、豊富なオプションと便利な機能があります。

ランタイムの C++ 部分から独自の EventPipe イベントを発行するには、`FireEtwXXX` API、またはその便利なラッパーである `ETW::` C++ 名前空間内のものを使用できます。既存のイベントを使用するのではなく、新しい種類のイベントを作成することが多いでしょう。イベントは [`genEventing.py`](https://github.com/dotnet/runtime/blob/main/src/coreclr/scripts/genEventing.py) スクリプトによって、[`ClrEtwAll.man`](https://github.com/dotnet/runtime/blob/main/src/coreclr/vm/ClrEtwAll.man) の定義に基づいて生成されます。

C# から EventPipe イベントを発行するには、[`System.Diagnostics.Tracing.EventSource`](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/eventsource-getting-started) クラスを使用できます。このクラスから派生した独自のイベント型を定義します。サンプルと詳細についてはそのドキュメントを参照してください。

## 代替イベントコンシューマー

高度なシナリオでは、EventSource と C++ イベントラッパーの両方が、それぞれのプラットフォーム上の標準的なイベントトレーシングシステム（Windows では ETW、Linux では LTTNG）をサポートしています。EventPipe 自体はこれらのシステムと統合されませんが、EventPipe の上に構築されたランタイムのレイヤーは、それらが有効になっている場合にそれらも使用します。

::: tip 💡 初心者向け補足
ETW (Event Tracing for Windows) は Windows に組み込まれた高性能なトレーシング機構で、LTTNG (Linux Trace Toolkit Next Generation) は Linux 向けの同等のツールです。EventPipe はこれらとは独立したクロスプラットフォームの仕組みですが、ランタイムはこれらのネイティブなトレーシングシステムとも連携できるように設計されています。たとえば、Windows で ETW を使い慣れているチームは、既存のワークフローをそのまま .NET の診断にも活用できます。
:::

Windows では、標準的な [ETW](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/event-tracing-for-windows) ツール、たとえば [WPR](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/windows-performance-recorder) の「.NET Activity」シナリオを使用できます。Windows で ETW トレースを収集・分析するための便利な汎用ツールとして [PerfView](https://github.com/microsoft/perfview) があります。PerfView を使用するには、その[詳細なドキュメント](http://htmlpreview.github.io/?https://github.com/Microsoft/perfview/blob/main/src/PerfView/SupportFiles/UsersGuide.htm)を参照するかチュートリアルを実施するのがよいでしょう。基本的な出発点としては、*Collect*→*Run* メニューオプションからアプリケーションを起動し、生成された記録を左側のエクスプローラーペインでダブルクリックして開きます。

Linux では [LTTNG](https://lttng.org/) を使用でき、[perfcollect スクリプト](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/trace-perfcollect-lttng)は ETW に近い操作感を提供する便利なツールです。

## StressLog

StressLog は、ランタイムプロセス内部の循環バッファー (circular buffer) であり、通常はプロセス外部に出力されません。ほとんどの StressLog メッセージはリテールビルド (retail build) でも利用可能であるため、本番環境での GC やその他のサブシステムに関する問題のトラブルシューティングに役立ちます。StressLog を有効にするには、環境変数 `DOTNET_StressLog` を `1` に設定し、以下に示すように環境変数を使用して設定できます:

::: tip 💡 初心者向け補足
StressLog は、ランタイム内部のデバッグに特化した軽量なログ機構です。通常のログとは異なり、メモリ上の循環バッファーに書き込まれるため、ファイル I/O のオーバーヘッドがなく、パフォーマンスへの影響が最小限に抑えられます。「循環バッファー」とは、古いメッセージが新しいメッセージで上書きされる固定サイズのバッファーのことです。本番環境でも使用できるため、デバッガーをアタッチできない状況やダンプファイルを取得できない場合に特に有用です。
:::

```bash
echo StressLog を有効にする
set DOTNET_StressLog=1

echo JIT のログメッセージを表示する
set DOTNET_LogFacility=0x00000008

echo 警告またはエラーのみ表示する
set DOTNET_LogLevel=3

echo バッファーが急速に埋まる場合、大きなバッファーサイズを設定すると効果的です。
echo ただし、スレッド数が多い場合は、メモリ枯渇を避けるために低い制限を設定するとよいでしょう。
echo StressLog のスレッドごとのサイズ制限を 20MB に設定する。設定値はデフォルトで16進数です。
set DOTNET_StressLogSize=1400000

echo すべての StressLog（合計）のプロセス全体のサイズ制限を 400MB に設定する。設定値はデフォルトで16進数です。
set DOTNET_TotalStressLogSize=18000000

echo デバッガーをアタッチできない場合やダンプファイルを取得できない場合のために、StressLog をメモリではなくファイルに書き込む。
set DOTNET_StressLogFilename=mystresslog.log
```

C++ から StressLog に独自のメッセージを書き込むには、`STRESS_LOGN(facility, level, msg, ...)` マクロを使用できます。例: `STRESS_LOG1(LF_GC, LL_ERROR, "A significant but non-fatal error occurred in the garbage collector! Here's my favorite number: %d\n", 42)`。最初の引数は 1 つ以上のロギングファシリティ (logging facility)（`|` を使って組み合わせ可能、例: `LF_GC | LF_GCROOTS`）、2 番目の引数は重大度レベル (severity level)、3 番目の引数はログメッセージのフォーマット文字列です。詳細については、後述の[ログファシリティとレベル](#ログファシリティとレベル)を参照してください。

C# から StressLog に独自のメッセージを書き込むことはできません。テスト中にどうしても必要な場合は、カスタム QCall を通じて公開することが考えられます。

## 従来の .NET ランタイムロギング

「従来の」ログメッセージは、ランタイムのデバッグビルド (debug build) またはチェック済みビルド (checked build) でのみ利用可能です。これを有効にするには、環境変数 `DOTNET_LogEnable` を `1` に設定し、環境変数を使用して設定します。従来のロギングにはさまざまな設定変数があり、以下に示します:

```bash
echo 従来のロギングを有効にする
set DOTNET_LogEnable=1

echo JIT のログメッセージを表示する
set DOTNET_LogFacility=0x00000008

echo 警告またはエラーのみ表示する
set DOTNET_LogLevel=3

echo デバッガーにログメッセージを出力する
set DOTNET_LogToDebugger=0

echo コンソールにログメッセージを出力する
set DOTNET_LogToConsole=1

echo 特定のファイルにログメッセージを出力する
set DOTNET_LogToFile=0
set DOTNET_LogFile=mylog.log

echo 起動時にファイルを消去する代わりに、ログメッセージをファイルに追記する
set DOTNET_LogFileAppend=1

echo クラッシュ後にメッセージが失われないように、書き込みごとにログファイルをフラッシュする
set DOTNET_LogFlushFile=1

echo マルチプロセスシナリオのために、すべてのログメッセージにプロセス ID を付加する
set DOTNET_LogWithPid=1
```

この古典的なロギングシステムはあまり頻繁に使用されていないため、遭遇する個々のログメッセージは部分的または完全に機能しない場合があります（たとえば、古いログ文における 64 ビット専用の問題など）。ただし、基本的な機能は常に動作するはずです。

C++ から独自の従来のログメッセージを送信するには、`LOG((facility, level, msg, ...))` マクロを使用できます。例: `LOG((LF_GC, LL_INFO10000, "An insignificant thing happened in the garbage collector.\n"))`。引数は上記の StressLog で説明したものとほぼ同等です。ファシリティとレベルの詳細については、後述の[ログファシリティとレベル](#ログファシリティとレベル)を参照してください。

`LOG` マクロと `STRESS_LOG` マクロは非常に似ていることに注意してください。そのため、デバッグ目的で一時的に `LOG((...))` 文を `STRESS_LOG(...)` 文に変換して、StressLog の機能を活用して問題を診断することができます。

C# から従来のログにメッセージを送信する必要がある場合は、StressLog と同様に、一時的にカスタム QCall を通じて公開することが考えられます。

## ログファシリティとレベル

StressLog と従来のロギングはいずれも、環境変数 `DOTNET_LogFacility`、`DOTNET_LogFacility2`、および `DOTNET_LogLevel` に依存して、冗長度の制御とログに記録される情報のフィルタリングを行います。

`DOTNET_LogLevel` は、カテゴリに関係なく、重要度の低いログメッセージをフィルタリングできます。この変数は名前付き定数ではなく、整数で指定します。この文書の執筆時点でのレベルは以下のとおりで、[`log.h`](https://github.com/dotnet/runtime/blob/main/src/coreclr/inc/log.h) から取得されています:

```c
LL_EVERYTHING  10
LL_INFO1000000  9 // 小規模だが自明でない実行で 1,000,000 件のログが生成される見込み
LL_INFO100000   8 // 小規模だが自明でない実行で 100,000 件のログが生成される見込み
LL_INFO10000    7 // 小規模だが自明でない実行で 10,000 件のログが生成される見込み
LL_INFO1000     6 // 小規模だが自明でない実行で 1,000 件のログが生成される見込み
LL_INFO100      5 // 小規模だが自明でない実行で 100 件のログが生成される見込み
LL_INFO10       4 // 小規模だが自明でない実行で 10 件のログが生成される見込み
LL_WARNING      3
LL_ERROR        2
LL_FATALERROR   1
LL_ALWAYS       0 // オフにすることは不可能（ログレベルは負にならない）
```

::: tip 💡 初心者向け補足
ログレベル (log level) とログファシリティ (log facility) は、ログ出力を制御するための 2 つの軸です。ログレベルはメッセージの重要度（エラー、警告、情報など）によるフィルタリングで、Java の `java.util.logging.Level` や SLF4J のログレベルに相当します。ログファシリティはメッセージのカテゴリ（GC、JIT、ローダーなど）によるフィルタリングで、ランタイムのどのサブシステムからのメッセージを見たいかを選択できます。両方を組み合わせることで、必要な情報だけを効率的に絞り込めます。
:::

`DOTNET_LogFacility` と `DOTNET_LogFacility2` は、特定のカテゴリにメッセージをフィルタリングできます。これらの変数は名前付き定数ではなく、整数で指定します。たとえば、`LF_GC` ファシリティの値は `0x00000001`、つまり `1` です。この文書の執筆時点での `DOTNET_LogFacility` に利用可能なオプションは以下のとおりで、[`loglf.h`](https://github.com/dotnet/runtime/blob/main/src/coreclr/inc/loglf.h) から取得されています:

```c
LF_GC                0x00000001
LF_GCINFO            0x00000002
LF_STUBS             0x00000004
LF_JIT               0x00000008
LF_LOADER            0x00000010
LF_METADATA          0x00000020
LF_SYNC              0x00000040
LF_EEMEM             0x00000080
LF_GCALLOC           0x00000100
LF_CORDB             0x00000200
LF_CLASSLOADER       0x00000400
LF_CORPROF           0x00000800
LF_DIAGNOSTICS_PORT  0x00001000
LF_DBGALLOC          0x00002000
LF_EH                0x00004000
LF_ENC               0x00008000
LF_ASSERT            0x00010000
LF_VERIFIER          0x00020000
LF_THREADPOOL        0x00040000
LF_GCROOTS           0x00080000
LF_INTEROP           0x00100000
LF_MARSHALER         0x00200000
LF_TIEREDCOMPILATION 0x00400000 // 以前は IJW でしたが、現在は階層型コンパイル (tiered compilation) 用に転用されています
LF_ZAP               0x00800000
LF_STARTUP           0x01000000 // 起動とシャットダウンの失敗をログに記録
LF_APPDOMAIN         0x02000000
LF_CODESHARING       0x04000000
LF_STORE             0x08000000
LF_SECURITY          0x10000000
LF_LOCKS             0x20000000
LF_BCL               0x40000000
```

`DOTNET_LogFacility2` はより新しく、現時点では `LF2_MULTICOREJIT`（値は `0x00000001`）というファシリティが 1 つだけ利用可能です。

ログ内の特定のメッセージをキャプチャしようとしているのに表示されない場合は、そのログレベル/ファシリティを確認し、環境変数を適切に設定しているか確認してください！

## Mono ロギング

Mono ランタイムを使用した .NET のビルドには、ランタイムが出力する診断情報を制御する Mono 固有のログ設定環境変数があります。

`MONO_LOG_LEVEL` を使用して、`"error"`、`"critical"`、`"warning"`、`"message"`、`"info"`、`"debug"` のいずれかに設定することで、全体的な冗長度を設定できます。`MONO_LOG_MASK` を使用して、`gc` や `aot` などの特定のカテゴリにログメッセージをフィルタリングできます。マスクオプションの完全なリストについては、[`mono-logger.c`](https://github.com/dotnet/runtime/blob/main/src/mono/mono/utils/mono-logger.c) の `mono_trace_set_mask_string` 関数を参照してください。

Mono のインタプリター (interpreter) を扱う場合、環境変数 `MONO_VERBOSE_METHOD` は特定の名前を持つメソッドの詳細ログを有効にします。これは、メソッドが正しくコンパイルまたは最適化されていない状況を調査している場合や、どのバージョンのメソッドが実行されているか確信が持てない場合に非常に役立ちます。

## WebAssembly ロギング

WebAssembly ビルドのランタイムで Mono ロギングを設定するには、csproj 内の設定項目に JSON ブロブの形式で環境変数を指定する必要があります。以下のようにします:

```xml
<ItemGroup>
  <WasmExtraConfig Include="environmentVariables" Value='
{
  "MONO_LOG_LEVEL": "warning",
  "MONO_LOG_MASK": "all"
}' />
</ItemGroup>
```

ビルド時やウェブブラウザーの起動時に外部で設定された環境変数は、自動的に WASM ランタイムに引き継がれません。

WebAssembly ビルドのランタイムには、TypeScript で書かれた追加のインターオプレイヤー (interop layer) があり、独自のロギング機能を持っています。これは [`logging.ts`](https://github.com/dotnet/runtime/blob/main/src/mono/browser/runtime/logging.ts) で定義されています。

TypeScript レイヤーからのデバッグレベルのログメッセージは、`diagnosticTracing` フラグが設定されていない限り、デフォルトで抑制されます。設定するには、起動時に `dotnet` オブジェクトで `.withDiagnosticTracing(true)` を呼び出すか、csproj に以下のような追加の設定項目を記述します:

```xml
<ItemGroup>
  <WasmExtraConfig Include="diagnosticTracing" Value="true" />
</ItemGroup>
```

その他のすべてのログ重大度はデフォルトで有効であり、ウェブブラウザーで実行している場合は開発者ツールコンソールに書き込まれます。コマンドラインから自動テストを実行している場合や、node.js や v8 シェルなどの環境でアプリケーションを実行している場合は、標準出力および/または標準エラーに書き込まれます。

TypeScript 内からメッセージを送信するには、適切な API を使用してください。重大なエラーには `mono_log_error`、重要な情報には `mono_log_info`、一般ユーザーが見る必要のないものには `mono_log_debug` を使用します。

何らかの理由でこのロギング機能に C/C++ から直接アクセスする必要がある場合は、`mono_wasm_trace_logger` 関数を使用できます。この関数を通じて送信された致命的エラーは、書き込み後に即座にプロセスの終了をトリガーすることに注意してください。

デフォルトでは jiterpreter はエラーメッセージのみをコンソールに出力しますが、`MONO_VERBOSE_METHOD` が使用されている場合は、verbose メソッド内のトレースに関する詳細情報もログに記録します。jiterpreter でのより高度なロギングには、[`jiterpreter.ts`](https://github.com/dotnet/runtime/blob/main/src/mono/browser/runtime/jiterpreter.ts) の設定変数を編集し、ランタイムをソースからコンパイルする必要があります。
