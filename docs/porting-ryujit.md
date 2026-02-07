# RyuJIT を異なるプラットフォームへ移植する

::: info 原文
この章の原文は [Porting RyuJIT to other platforms](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/jit/porting-ryujit.md) です。
:::

まず、[RyuJIT の概要](./ryujit-overview) を読んで、JIT アーキテクチャを理解してください。

## プラットフォーム (Platform) とは何か

- ターゲット命令セット (target instruction set)
- ターゲットポインタサイズ (target pointer size)
- ターゲットオペレーティングシステム (target operating system)
- ターゲット呼び出し規約 (calling convention) と ABI（アプリケーションバイナリインターフェース; Application Binary Interface）
- ランタイムデータ構造 (runtime data structures)（ここではあまり触れません）
- GC エンコーディング (GC encoding)
  - Windows x86 が JIT32_GCENCODER を使用する点を除き、すべてのターゲットは同じ GC エンコーディング方式と API を使用します。
- デバッグ情報 (debug information)（ほとんどのターゲットで共通）
- 例外処理 (EH; exception handling) の情報（ここではあまり触れません）

CLR の利点の一つは、VM が（ABI 以外の）OS の違いを（ほぼ）隠蔽してくれることです。

::: tip 💡 初心者向け補足
**ABI（Application Binary Interface）** とは、コンパイル済みのバイナリ同士がどうやりとりするかを定めた低レベルの規約です。関数呼び出し時に引数をどのレジスタに置くか、戻り値をどう返すか、スタックフレームのレイアウトなどが含まれます。Java で言えば JNI のようなネイティブインターフェースの裏側で意識される部分です。
:::

## 概観（The Very High Level View）

新しいプラットフォームに対応するために、以下のコンポーネントを更新するか、ターゲット固有のバージョンを作成する必要があります。

- 基本部分
  - target.h
- 命令セットアーキテクチャ (Instruction Set Architecture):
  - registerXXX.h - アーキテクチャで使用するすべてのレジスタとそのエイリアスを定義
  - emitXXX.h - 公開用の命令エミッション (instruction emission) メソッドのシグネチャ（例: 「整数の引数を1つ取る命令をエミットする」）およびプライベートなアーキテクチャ固有のヘルパーを定義
  - emitXXX.cpp - emitXXX.h の実装
  - emitfmtXXX.h - 命令のフォーマット方法に関する妥当性ルールをオプションで定義（例: RISC-V ではルールが定義されていません）
  - instrsXXX.h - アーキテクチャごとのアセンブリ命令を定義
  - targetXXX.h - その他の箇所で使用されるアーキテクチャ上の制約を定義。例えば「呼び出し先保存 (callee-saved) の整数レジスタのビットマスク」や「浮動小数点レジスタのバイトサイズ」など
  - targetXXX.cpp - このアーキテクチャの ABI クラシファイア (ABI classifier) を実装
  - lowerXXX.cpp - このアーキテクチャの[ローワリング (Lowering)](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/jit/ryujit-overview.md#lowering) を実装
  - lsraXXX.cpp - [GenTree ノード](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/jit/ryujit-overview.md#gentree-nodes) に基づくレジスタ要求の設定を実装
  - codegenXXX.cpp - このアーキテクチャのメインのコード生成 (codegen) を実装（つまり、[GenTree ノード](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/jit/ryujit-overview.md#gentree-nodes) に基づいてアーキテクチャ固有の命令を生成する）
  - hwintrinsic\*XXX.\* および simdashwintrinsic\*XXX.h - ハードウェア組み込み関数 (hardware intrinsic) の機能を定義・実装（例: ベクター命令）
  - unwindXXX.cpp - 公開用のアンワインド (unwinding) API およびデバッグ用のアンワインド情報ダンプを実装
- 呼び出し規約と ABI: コードベース全体に散在しています
- 32 ビット vs. 64 ビット
  - これもコードベース全体に散在しています。ポインタサイズ固有のデータの一部は target.h に集約されていますが、おそらく 100% ではありません。

::: tip 💡 初心者向け補足
**XXX** の部分には、ターゲットアーキテクチャの名前が入ります。例えば ARM64 向けの場合、`registerArm64.h`、`emitArm64.h`、`codegenArm64.cpp` のようなファイル名になります。RyuJIT は各アーキテクチャごとに専用のファイルセットを持ち、共通コードとアーキテクチャ固有のコードを分離しています。
:::

## 移植の段階とステップ

JIT を移植するには、いくつかのステップを踏む必要があります（一部は並行して進められます）。以下に説明します。

### 初期立ち上げ (Initial bring-up)

- 新しいプラットフォーム固有のファイルを作成する
- プラットフォーム固有のビルド命令を作成する（CMakeLists.txt 内）。これにはおそらく、ソースツリーのルートレベルと JIT レベルの両方で、新しいプラットフォーム固有のビルド命令が必要になります。
- MinOpts に集中する。最適化フェーズを無効にするか、常に `DOTNET_JITMinOpts=1` でテストしてください。
- オプション機能を無効にする。例えば:
  - `FEATURE_EH` -- 0 にすると、すべての例外処理ブロックが削除されます。もちろん、例外のスローとキャッチに依存する例外処理テストは正しく動作しません。
  - `FEATURE_STRUCTPROMOTE`
  - `FEATURE_FASTTAILCALL`
  - `FEATURE_TAILCALL_OPT`
  - `FEATURE_SIMD`
- 新しい JIT を altjit としてビルドする。このモードでは、「ベース」JIT が呼び出されてすべての関数をコンパイルしますが、`DOTNET_AltJit` 変数で指定された関数だけは例外です。例えば、`DOTNET_AltJit=Add` を設定してテストを実行すると、「ベース」JIT（例: Windows x64 ターゲットの JIT）がすべての関数をコンパイルしますが、`Add` _だけ_ は新しい altjit で最初にコンパイルされ、失敗した場合は「ベース」JIT にフォールバックします。こうすることで、ごく限られた JIT 機能だけが動作すればよく、「ベース」JIT がほとんどの関数を処理します。
- 基本的な命令エンコーディングを実装する。`CodeGen::genArm64EmitterUnitTests()` のようなメソッドを使用してテストしてください。
- 加算のような非常に単純な操作に対して、コンパイラがビルドしてコードを生成できる最低限の実装を行う。
- CodeGenBringUpTests (src\tests\JIT\CodeGenBringUpTests) に集中する。簡単なものから始めてください。
  - これらは、テスト `XXX.cs` に対して、コンパイル対象となる `XXX` という名前の単一の関数があるように設計されています（つまり、ソースファイルの名前と対象関数の名前が同じです。これはテストを実行するスクリプトを非常にシンプルにするためです）。`DOTNET_AltJit=XXX` を設定して、新しい JIT がその1つの関数だけをコンパイルするようにしてください。
  - マージされたテストグループは、各テストのエントリポイントを削除し、すべてのテストを単一のプロセスで呼び出す単一のラッパーを作成することで、これらのテストのシンプルさを損ないます。元の動作に戻すには、環境変数 `BuildAsStandalone` を `true` に設定してテストをビルドしてください。
- `DOTNET_JitDisasm` を使用して、コードが実行されなくても、関数に対して生成されたコードを確認できます。

::: tip 💡 初心者向け補足
**altjit** とは「代替 JIT (alternative JIT)」の略で、新しいプラットフォーム向けの JIT を開発する際に非常に便利な仕組みです。既存の安定した JIT（ベース JIT）がほとんどの関数のコンパイルを担当し、開発中の新しい JIT は指定された関数だけをコンパイルします。これにより、一度にすべての機能を実装しなくても、一つずつ関数をテストしながら段階的に開発を進められます。Java の世界で例えると、C1 コンパイラをフォールバックとして使いながら新しいコンパイラの開発を進めるようなイメージです。
:::

### テストカバレッジの拡大 (Expand test coverage)

- ますます多くのテストが正常に実行されるようにしてください:
  - `JIT` ディレクトリのテストをさらに実行
  - すべての Pri-0「innerloop」テストを実行
  - すべての Pri-1「outerloop」テストを実行
- テストベース全体で JIT が生成するアサート (assert) のデータを収集し、頻度順にアサートを修正していくと効率的です。つまり、最も頻繁に発生するアサートを最初に修正してください。
- アサートの数、およびアサートの有無ごとのテスト数を追跡して、進捗状況を判断してください。

### 最適化フェーズの有効化 (Bring the optimizer phases on-line)

- `DOTNET_JITMinOpts=1` あり・なしの両方でテストを実行してください。
- かなり後の段階まで `DOTNET_TieredCompilation=0` を設定する（またはそのプラットフォームで完全に無効にする）のが合理的です。

### 品質の向上 (Improve quality)

- 基本モードでテストが通るようになったら、`JitStress` と `JitStressRegs` のストレスモードで実行を開始してください。
- `GCStress` を有効にしてください。これには VM 側の作業も必要です。
- `DOTNET_GCStress=4` の品質を向上させてください。crossgen/ngen が有効になったら、`DOTNET_GCStress=8` および `DOTNET_GCStress=C` でもテストしてください。

### パフォーマンスの改善 (Work on performance)

- スループット（コンパイル時間）と生成コード品質 (CQ; Code Quality) の両方について、パフォーマンスを測定・改善するための戦略を策定してください。

### プラットフォーム間の機能均一化 (Work on platform parity)

- 意図的に無効にした機能や、実装を延期していた機能を実装してください。
- SIMD（`Vector<T>`）およびハードウェア組み込み関数 (hardware intrinsics) のサポートを実装してください。

## フロントエンドの変更 (Front-end changes)

- 呼び出し規約 (Calling Convention)
  - 構造体 (struct) の引数と戻り値が、最も複雑な差異となります
    - インポーター (Importer) とモーフ (Morph) はこれらを強く意識しています
      - 例: `fgMorphArgs()`、`fgFixupStructReturn()`、`fgMorphCall()`、`fgPromoteStructs()`、およびさまざまな構造体代入のモーフメソッド
  - ARM の HFA（Homogeneous Floating-point Aggregate; 同種浮動小数点集約体）
- テールコール (tail call) はターゲット依存ですが、おそらくもっと少なくすべきです
- 組み込み関数 (intrinsics): 各プラットフォームは異なるメソッドを組み込み関数として認識します（例: `Sin` は x86 のみ、`Round` は amd64 を*除く*すべて）
- mul、mod、div に対するターゲット固有のモーフ変換

## バックエンドの変更 (Backend Changes)

- ローワリング (Lowering): 制御フロー (control flow) とレジスタ要求を完全に公開する
- コード生成 (Code Generation): レイアウト順にブロックを走査し、ノード上のレジスタ割り当てに基づいてコード（InstrDesc）を生成する
  - その後、プロローグ (prolog) とエピローグ (epilog)、GC テーブル、例外処理 (EH) テーブル、スコープテーブルを生成する
- ABI の変更:
  - 呼び出し規約のレジスタ要求
    - 呼び出し (call) と戻り (return) のローワリング
    - プロローグとエピローグのコードシーケンス
  - フレーム (frame) の割り当てとレイアウト

## ターゲット ISA の「構成」(Target ISA "Configuration")

- 条件付きコンパイル (conditional compilation)（jit.h で設定、受け取った define に基づく。例: `#ifdef X86`）

```C++
_TARGET_64_BIT_ (32 ビットターゲットは単に ! _TARGET_64BIT_)
_TARGET_XARCH_, _TARGET_ARMARCH_
_TARGET_AMD64_, _TARGET_X86_, _TARGET_ARM64_, _TARGET_ARM_
```

- Target.h
- InstrsXXX.h

::: tip 💡 初心者向け補足
**ISA (Instruction Set Architecture)** とは命令セットアーキテクチャのことで、CPU がどのような命令をサポートするかを定義したものです。例えば x86/x64（Intel/AMD）と ARM では全く異なる命令セットを持ちます。RyuJIT では `_TARGET_XARCH_`（x86/x64 系）と `_TARGET_ARMARCH_`（ARM 系）で大きく分岐しており、さらに `_TARGET_AMD64_` や `_TARGET_ARM64_` で細かい差異を扱います。C/C++ のプリプロセッサ (`#ifdef`) を使ってコンパイル時にターゲットを切り替えています。
:::

## 命令エンコーディング (Instruction Encoding)

- `insGroup` と `instrDesc` のデータ構造がエンコーディングに使用されます
  - `instrDesc` はオペコード (opcode) ビットで初期化され、即値 (immediate) とレジスタ番号のフィールドを持ちます。
  - `instrDesc` は `insGroup` グループにまとめられます
  - ラベル (label) はグループの先頭にのみ存在できます
- エミッター (emitter) は以下のために呼び出されます:
  - コード生成 (CodeGen) の間に新しい命令 (`instrDesc`) を作成する
  - コード生成の完了後に `instrDesc` のビットをエミットする
  - GC 情報（生存中の GC 変数とセーフポイント）を更新する

## エンコーディングの追加 (Adding Encodings)

- 命令エンコーディングは instrsXXX.h に記述されます。各命令のオペコードビットを表しています
- 各命令セットのエンコーディングの構造はターゲット依存です
- 「命令 (instruction)」は単にオペコードの表現です
- `instrDesc` のインスタンスが、エミットされる命令を表します
- 各「タイプ」の命令に対して、エミットメソッドを実装する必要があります。これらはパターンに従いますが、ターゲットによっては固有のものがある場合があります。例:

```C++
emitter::emitInsMov(instruction ins, emitAttr attr, GenTree* node)
emitter::emitIns_R_I(instruction ins, emitAttr attr, regNumber reg, ssize_t val)
emitter::emitInsTernary(instruction ins, emitAttr attr, GenTree* dst, GenTree* src1, GenTree* src2)
(現在 Arm64 のみ)
```

## ローワリング (Lowering)

- ローワリングは、レジスタアロケータ (register allocator) に対してすべてのレジスタ要求を公開します
  - 使用カウント (use count)、定義カウント (def count)、「内部」レジスタカウント (internal reg count)、および特殊なレジスタ要求
  - すべての計算が明示的になるため、コード生成の半分の作業を担います
    - ただし、ローワリングされたツリーノードとターゲット命令が必ずしも 1:1 で対応するわけではありません
  - 最初のパスでツリーウォークを行い、命令を変換します。一部はターゲット非依存です。主な例外:
    - 呼び出し (call) と引数 (argument)
    - switch のローワリング
    - LEA 変換
  - 2番目のパスでは実行順にノードをウォークします
    - レジスタ要求を設定
      - すでに走査済みの子ノードのレジスタ要求を変更することもあります
    - LSRA のためにブロック順序とノードの位置を設定
      - `LinearScan::startBlockSequence()` と `LinearScan::moveToNextBlock()`

::: tip 💡 初心者向け補足
**ローワリング (Lowering)** とは、JIT コンパイラの中間表現 (IR) を、ターゲットのハードウェアにより近い形に変換するフェーズです。例えば、高レベルの「加算」演算を、特定の CPU レジスタを使った具体的な命令に近づけます。**LSRA (Linear Scan Register Allocation)** は線形走査レジスタ割り当てと呼ばれるアルゴリズムで、プログラム中の変数を CPU レジスタに効率よく割り当てます。ローワリングが「どのレジスタが必要か」を明示し、LSRA が「実際にどのレジスタを使うか」を決定するという分業になっています。
:::

## レジスタ割り当て (Register Allocation)

- レジスタ割り当ては大部分がターゲット非依存です
  - ローワリングの第2フェーズが、ほぼすべてのターゲット依存の作業を行います
- レジスタ候補はフロントエンドで決定されます
  - ローカル変数やテンポラリ (temp)、またはローカル変数やテンポラリのフィールド
  - アドレス取得 (address-taken) されていないこと、およびいくつかの追加制約
  - `lvaSortByRefCount()` でソートされ、`lvIsRegCandidate()` で決定されます

## アドレッシングモード (Addressing Modes)

- アドレッシングモードを見つけてキャプチャするコードは、特に抽象化が不十分です
- CodeGenCommon.cpp 内の `genCreateAddrMode()` がツリーを走査してアドレッシングモードを探し、その構成要素（ベース (base)、インデックス (index)、スケール (scale)、オフセット (offset)）を「出力パラメータ (out parameters)」としてキャプチャします
  - コードを生成することはなく、`gtSetEvalOrder` およびローワリングでのみ使用されます

## コード生成 (Code Generation)

- ほとんどの場合、コード生成のメソッド構造はすべてのアーキテクチャで同じです
  - ほとんどのコード生成メソッドは「gen」で始まります
- 理論的には、CodeGenCommon.cpp はすべてのターゲットに「ほぼ」共通のコードを含みます（この分離は不完全ですが）
  - メソッドのプロローグ、エピローグなど
- `genCodeForBBList()`
  - 実行順にツリーをウォークし、`genCodeForTreeNode()` を呼び出します。`genCodeForTreeNode()` は「含有 (contained)」されていないすべてのノードを処理する必要があります
  - ブロックの制御フローコード（分岐、例外処理）を生成します
