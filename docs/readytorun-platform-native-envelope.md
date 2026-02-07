# ReadyToRun プラットフォームネイティブエンベロープ

::: info 原文
この章の原文は [ReadyToRun Platform Native Envelope](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/readytorun-platform-native-envelope.md) です。
:::

.NET 10 まで、ReadyToRun (R2R) はすべてのプラットフォームでネイティブエンベロープ (envelope) として Windows PE 形式を使用しています。そのため、非 Windows プラットフォームでは、.NET ローダーが必要なフィックスアップ (fixup) とコードの有効化を行いながら PE ファイルを読み込みます。

::: tip 💡 初心者向け補足
PE（Portable Executable）形式は Windows 独自の実行可能ファイル形式です。.NET ではこれまで、macOS や Linux 上でも PE 形式のファイルをラップして R2R イメージを配布していました。「エンベロープ (envelope)」とは、ネイティブコードを包む外側のファイル形式のことを指します。この章では、macOS 向けに Mach-O 形式という macOS ネイティブの形式をサポートする計画について説明します。
:::

.NET 11 では、PE 形式を超えたサポートの追加を開始する予定です。対象とするサポートは以下のとおりです：

- コンポジット (composite) R2R のみ
- `crossgen2` が出力する Mach-O オブジェクトファイル
- ランタイムが Mach-O 共有ライブラリであるコンポジット R2R イメージを使用すること
  - オブジェクトファイルを共有ライブラリにリンクする処理は SDK が担当することを想定しており、このドキュメントでは扱いません。

以下に暫定的なハイレベル設計の概要を示します。このサポートの実装に伴い、このドキュメントはより詳細に更新されるべきであり、[ReadyToRun 概要](./readytorun-overview)および [ReadyToRun フォーマット](./readytorun-format)も変更を反映して更新されるべきです。

## crossgen2: Mach-O オブジェクトファイルの生成

Mach-O サポートは、ターゲット OS が macOS の場合に限り、コンポジット ReadyToRun でのみサポートされます。新しい `crossgen2` フラグによりオプトインで有効化します：

- `--obj-format macho`

`crossgen2` は以下を行います：

- `READYTORUN_HEADER` の `RTR_HEADER` エクスポートを含むコンポジット R2R イメージとして Mach-O オブジェクトファイルを生成する。
- 各入力 IL アセンブリをコンポーネント R2R アセンブリとしてマークする：`READYTORUN_FLAG_COMPONENT`。
- 各入力 IL アセンブリに、関連するコンポジットイメージがプラットフォームネイティブ形式であることを示す新しいフラグを設定する：`READYTORUN_FLAG_PLATFORM_NATIVE_IMAGE`

`crossgen2` は最終的な共有ライブラリを生成しません。別途 SDK / ビルドのリンクステップで、最終的な `dylib` に `RTR_HEADER` エクスポートを保持する必要があります。

::: tip 💡 初心者向け補足
コンポジット R2R とは、複数の .NET アセンブリのネイティブコードを1つの R2R イメージにまとめたものです。`crossgen2` は .NET の AOT（事前コンパイル）ツールで、IL コードからネイティブコードを含む R2R イメージを生成します。ここでは `crossgen2` がまず Mach-O オブジェクトファイル（`.o`）を出力し、それを Apple のリンカ（`ld` など）で共有ライブラリ（`.dylib`）にリンクするという2段階の流れになります。
:::

### Mach-O エミッタの設計判断

R2R フォーマットには Mach-O フォーマットではネイティブに表現できないケースがいくつかあり、エミュレーションが必要です。このセクションでは、Mach-O R2R フォーマットに関する設計判断について説明します。

#### セクション

`__TEXT,__text` から移動されるデータ：

- プリコンパイル済みマネージドコードは `__TEXT,__managedcode` に移動されます。`__TEXT,__text` はリンカから特別な扱いを受けるため、`__TEXT,__managedcode` を使用します。これは NativeAOT と一致します。
- ジャンプテーブル、CLR メタデータ、Win32 リソース、マネージドアンワインド情報 (unwind info)、GC 情報、R2R ヘッダーなどの読み取り専用データは `__TEXT,__const` に移動されます。

PE エンベロープと対応する場所に留まるデータ：

- フィックスアップテーブルなどの読み書き可能データ：`__DATA,__data`
- インポートサンク (import thunk)：`__TEXT,__text`

#### リロケーション

シンボル範囲 (symbol range) は、Mach-O では他のプラットフォームとは異なる方法で表現されます。Apple のリンカは、同じ場所に複数のシンボルが定義されている場合に問題が発生します。さらに、Mach フォーマットは2つのシンボル間の距離を表現する「サブトラクタ (subtractor)」リロケーションをネイティブにサポートしています。その結果、シンボル範囲の開始を範囲の開始シンボルとして表現できます。範囲のサイズは「終了シンボルの位置 - 開始シンボルの位置 + 終了シンボルのサイズ」として表現できます。

#### ベースシンボルと RVA

R2R フォーマットは PE フォーマットと同様に、イメージのベースシンボルに加算できる RVA（Relative Virtual Address、相対仮想アドレス）をイメージに出力することに大きく依存しています。COFF オブジェクトファイル形式はこの概念をネイティブにサポートしており、PE フォーマットも PE ヘッダーでこの概念を使用しています。しかし、他のフォーマットはこの概念をネイティブにサポートしていません。

::: tip 💡 初心者向け補足
RVA（相対仮想アドレス）とは、イメージがメモリに読み込まれたベースアドレスからの相対的なオフセットです。例えば、ベースアドレスが `0x10000` でメソッドが `0x10500` にある場合、RVA は `0x500` になります。PE 形式ではこの仕組みが組み込まれていますが、Mach-O 形式では同等の機能をエミュレーションする必要があります。
:::

Apple のリンカは Mach フォーマット用のベースシンボルを提供していますが、そのベースシンボルは出力タイプに依存し、一般的に `__mh_<output>_header` の形式になります。dylib の場合、シンボルは `__mh_dylib_header` です。このシンボルはベースアドレスとして `dlinfo` や `dladdr` が返すアドレスに位置しています。また、Mach ヘッダーを指しており、R2R データの読み取り範囲を制限するためにイメージのサイズを確認するのにも使用できます。

その結果、Mach フォーマットでこのサポートを容易にエミュレーションできます：

1. オブジェクトライター (object writer) で使用するベースシンボルは `__mh_dylib_header` とする。
2. ベースシンボルからの距離を出力するために、サブトラクタリロケーション (subtractor relocation) を使用して「シンボルの位置 - `__mh_dylib_header` の位置」を表現する。

## ランタイム: プラットフォームネイティブ R2R イメージの使用

ランタイムは、アセンブリの読み込み時にプラットフォームネイティブ R2R イメージを処理するように更新されます。

1. IL アセンブリを読み込み、R2R アセンブリかどうかを判定する。
2. コンポーネント R2R アセンブリでない場合、既存の R2R ロードロジックで処理を続ける。
   - このシナリオではプラットフォームネイティブサポートは提供されない。
3. 新しい `READYTORUN_FLAG_PLATFORM_NATIVE_IMAGE` フラグが設定されたコンポーネント R2R アセンブリの場合：
   a. `OwnerCompositeExecutable` の値を読み取る。
   b. コンポーネントアセンブリのパスとオーナーコンポジット名を使用してホストコールバックを呼び出す。
   c. 成功した場合、コンポジットの `READYTORUN_HEADER` へのポインタを取得し、ネイティブメソッドのルックアップ / フィックスアップに使用する。
   d. 失敗した場合、IL/JIT パスにフォールバックする。
4. プラットフォームネイティブフラグが設定されていない場合、既存の R2R ロードロジック（PE アセンブリの検索と読み込み）で処理を続ける。

### ホストコールバック

[`host_runtime_contract`](https://github.com/dotnet/runtime/blob/main/src/native/corehost/host_runtime_contract.h) に、ネイティブコード情報を取得するための新しいコールバックが追加されます。

```c
struct native_code_context
{
    size_t size;                       // この構造体のサイズ
    const char* assembly_path;         // コンポーネントアセンブリのパス
    const char* owner_composite_name;  // コンポーネント R2R ヘッダーからの名前
};

struct native_code_data
{
   size_t size;           // この構造体のサイズ
   void* r2r_header_ptr;  // ReadyToRun ヘッダー
   size_t image_size;     // イメージのサイズ
   void* image_base;      // イメージが読み込まれたベースアドレス
};

bool get_native_code_data(
   const struct native_code_context* context,
   /*out*/ struct native_code_data* data
);
```

プラットフォームネイティブイメージの実際の読み込み（たとえば共有ライブラリの `dlopen`、ホスト自体に静的リンクされたものの使用など）はホストに委ねられます。また、必要なキャッシュ処理もホストが担当します。
