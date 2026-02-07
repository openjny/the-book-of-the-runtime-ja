# ReadyToRun ファイルフォーマット

::: info 原文
この章の原文は [ReadyToRun File Format](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/readytorun-format.md) です。
:::

改訂履歴:

- 1.1 - [Jan Kotas](https://github.com/jkotas) - 2015
- 3.1 - [Tomas Rylek](https://github.com/trylek) - 2019
- 4.1 - [Tomas Rylek](https://github.com/trylek) - 2020
- 5.3 - [Tomas Rylek](https://github.com/trylek) - 2021
- 5.4 - [David Wrighton](https://github.com/davidwrighton) - 2021
- 6.3 - [David Wrighton](https://github.com/davidwrighton) - 2022

# はじめに

本ドキュメントでは、2019年6月時点で CoreCLR に実装されている ReadyToRun フォーマット (R2R) 3.1、およびコンポジット (Composite) R2R ファイルフォーマットのサポートのためにまだ実装されていない拡張提案 4.1 について説明します。
**コンポジット R2R ファイルフォーマット**は、以前のリビジョンで定義された従来の R2R ファイルフォーマットと基本的に同じ構造を持ちますが、出力ファイルがより多くの入力 MSIL アセンブリを論理的な単位としてまとめてコンパイルしたものを表す点が異なります。

::: tip 💡 初心者向け補足
ReadyToRun (R2R) は、.NET の事前コンパイル (AOT: Ahead-Of-Time) 技術の一つです。通常 .NET アプリケーションは実行時に JIT (Just-In-Time) コンパイラによって中間言語 (IL) からネイティブコードに変換されますが、R2R ではビルド時にあらかじめネイティブコードを生成しておくことで、起動時間を短縮できます。Java でいう AOT コンパイル (GraalVM の Native Image など) に似た概念です。
:::

# PE ヘッダーと CLI ヘッダー

**単一ファイル ReadyToRun イメージ**は、ECMA-335 に記述された CLI ファイルフォーマットに準拠しますが、以下のカスタマイズが加えられています:

- PE ファイルは常にプラットフォーム固有です
- CLI ヘッダーの Flags フィールドに `COMIMAGE_FLAGS_IL_LIBRARY` (0x00000004) ビットが設定されています
- CLI ヘッダーの `ManagedNativeHeader` が READYTORUN_HEADER を指します

COFF ヘッダーの COM ディスクリプタ (descriptor) データディレクトリ項目が指す COR ヘッダーと ECMA 335 メタデータは、生成元の入力 IL および MSIL メタデータの完全なコピーを表します。

**コンポジット R2R ファイル**は現在、ネイティブエンベロープ (envelope) として Windows PE 実行可能ファイルフォーマットに準拠しています。今後は、ネイティブエンベロープとして[プラットフォームネイティブの実行可能フォーマットのサポートを段階的に追加する予定](./readytorun-platform-native-envelope)です (Linux では ELF、macOS では MachO)。ファイル内にグローバルな CLI / COR ヘッダーが存在しますが、それは PDB 生成を容易にするためだけのものであり、CoreCLR ランタイムによる使用には関与しません。ReadyToRun ヘッダー構造体は、よく知られたエクスポートシンボル `RTR_HEADER` によって指され、`READYTORUN_FLAG_COMPOSITE` フラグが設定されています。

入力 MSIL メタデータと IL ストリームは、コンポジット R2R ファイルに埋め込むことも、ディスク上の個別ファイルとして残すこともできます。MSIL が埋め込まれている場合、個々のコンポーネントアセンブリの「実際の」メタデータは、R2R セクション `ComponentAssemblies` を通じてアクセスされます。

**スタンドアロン MSIL ファイル**は、MSIL 埋め込みなしのコンポジット R2R 実行可能ファイルの IL とメタデータのソースとして使用されます。これらはコンポジット R2R 実行可能ファイルの隣の出力フォルダにコピーされ、コンパイラによって書き換えられ、所有者であるコンポジット R2R 実行可能ファイルへの転送情報 (セクション `OwnerCompositeExecutable`) を含む正式な ReadyToRun ヘッダーが付加されます。

::: tip 💡 初心者向け補足
PE (Portable Executable) は Windows で使われる実行可能ファイルのフォーマットで、.exe や .dll ファイルの構造を定義します。CLI (Common Language Infrastructure) は .NET の実行基盤であり、ECMA-335 規格で定義されています。R2R イメージはこの PE/CLI フォーマットの上に、事前コンパイルされたネイティブコードの情報を追加する形で構成されています。
:::

# デバッグディレクトリへの追加

現在出荷されている PE エンベロープ（単一ファイルおよびコンポジットの両方）には、デバッグディレクトリに追加のデバッグ情報のレコードを含めることができます。R2R イメージに固有のエントリの一つとして、R2R PerfMap 用のものがあります。
補助ファイルのフォーマットは [R2R perfmap フォーマット](./r2r-perfmap-format)に記述されており、対応するデバッグディレクトリエントリは [PE COFF](https://github.com/dotnet/runtime/blob/main/design/specs/PE-COFF.md#r2r-perfmap-debug-directory-entry-type-21) に記述されています。

## 将来の改善点

現在のフォーマットには以下の制限があります:

- **IL メタデータからの型ロード**: 現在、すべての型は実行時に IL メタデータから構築されます。
  これはサイズを肥大化させ（イメージからの完全なメタデータの除去を妨げ）、脆弱性があります（固定のフィールドレイアウトアルゴリズムを前提としています）。ランタイムの型ロードに最適化されたコンパクトな型レイアウト記述を持つ新しいセクションが必要です（CTL と類似の概念）。

- **デバッグ情報のサイズ**: デバッグ情報がイメージを不必要に肥大化させています。このソリューションは、現在のデスクトップ/CoreCLR デバッグパイプラインとの互換性のために選択されました。理想的には、デバッグ情報は別ファイルに保存されるべきです。

# 構造体

構造体および付随する定数は、[readytorun.h](https://github.com/dotnet/runtime/blob/main/src/coreclr/inc/readytorun.h) ヘッダーファイルで定義されています。
基本的に、R2R 実行可能イメージ全体は、ネイティブ実行可能エンベロープのエクスポートセクションにあるよく知られたエクスポート RTR_HEADER が指す READYTORUN_HEADER シングルトン (singleton) を通じてアドレスされます。

単一ファイル R2R 実行可能ファイルの場合、すべてのイメージセクションを表す 1 つのヘッダーのみが存在します。
コンポジットおよびシングル exe の場合、グローバルな `READYTORUN_HEADER` には、コンポジット R2R イメージを構成するコンポーネントアセンブリを表す `ComponentAssemblies` 型のセクションが含まれます。このテーブルは `READYTORUN_MANIFEST_METADATA` テーブルと並列（同じインデックスを使用）です。各 `READYTORUN_SECTION_ASSEMBLIES_ENTRY` レコードは、特定のアセンブリに固有のセクションを表す `READYTORUN_CORE_HEADER` 可変長構造体を指します。

## READYTORUN_HEADER

```C++
struct READYTORUN_HEADER
{
    DWORD                   Signature;      // READYTORUN_SIGNATURE
    USHORT                  MajorVersion;   // READYTORUN_VERSION_XXX
    USHORT                  MinorVersion;

    READYTORUN_CORE_HEADER  CoreHeader;
}
```

### READYTORUN_HEADER::Signature

常に 0x00525452 に設定されます（RTR の ASCII エンコーディング）。このシグネチャは、ReadyToRun イメージを ManagedNativeHeader を持つ他の CLI イメージ（例: NGen イメージ）と区別するために使用できます。

### READYTORUN_HEADER::MajorVersion/MinorVersion

現在のフォーマットバージョンは 3.1 です。MajorVersion の増加はファイルフォーマットの破壊的変更を意味します。MinorVersion の増加は互換性のあるファイルフォーマット変更を意味します。

**例**: ランタイムがサポートする最高バージョンが 2.3 であると仮定します。ランタイムはバージョン 2.9 のイメージからネイティブコードを正常に実行できるべきです。ランタイムはバージョン 3.0 のイメージからネイティブコードを実行することを拒否すべきです。

::: tip 💡 初心者向け補足
バージョン管理の考え方は一般的なセマンティックバージョニング (Semantic Versioning) に似ています。メジャーバージョンが同じであれば後方互換性が保たれ、マイナーバージョンが高いイメージでも実行できます。しかし、メジャーバージョンが異なると互換性がなくなります。
:::

## READYTORUN_CORE_HEADER

```C++
struct READYTORUN_CORE_HEADER
{
    DWORD                   Flags;          // READYTORUN_FLAG_XXX

    DWORD                   NumberOfSections;

    // Array of sections follows. The array entries are sorted by Type
    // READYTORUN_SECTION   Sections[];
};
```

### READYTORUN_CORE_HEADER::Flags

| フラグ                                     |         値 | 説明                                                                                                                                                                                   |
| :----------------------------------------- | ---------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| READYTORUN_FLAG_PLATFORM_NEUTRAL_SOURCE    | 0x00000001 | 元の IL イメージがプラットフォーム中立であった場合に設定されます。プラットフォーム中立性はアセンブリ名の一部です。このフラグは、元の完全なアセンブリ名を再構築するために使用できます。 |
| READYTORUN_FLAG_COMPOSITE                  | 0x00000002 | イメージが、多数の入力 MSIL アセンブリの結合コンパイルの結果であるコンポジット R2R ファイルを表します。                                                                                |
| READYTORUN_FLAG_PARTIAL                    | 0x00000004 |
| READYTORUN_FLAG_NONSHARED_PINVOKE_STUBS    | 0x00000008 | イメージにコンパイルされた PInvoke スタブは共有不可です（シークレットパラメータなし）。                                                                                                |
| READYTORUN_FLAG_EMBEDDED_MSIL              | 0x00000010 | 入力 MSIL が R2R イメージに埋め込まれています。                                                                                                                                        |
| READYTORUN_FLAG_COMPONENT                  | 0x00000020 | これはコンポジット R2R イメージのコンポーネントアセンブリです。                                                                                                                        |
| READYTORUN_FLAG_MULTIMODULE_VERSION_BUBBLE | 0x00000040 | この R2R モジュールには、バージョンバブル (version bubble) 内に複数のモジュールがあります（バージョン 6.3 より前では、すべてのモジュールがこの特性を持つ可能性があると仮定されます）。 |
| READYTORUN_FLAG_UNRELATED_R2R_CODE         | 0x00000080 | この R2R モジュールには、このモジュールに自然にエンコードされないコードが含まれています。                                                                                              |
| READYTORUN_FLAG_PLATFORM_NATIVE_IMAGE      | 0x00000100 | 所有するコンポジット実行可能ファイルがプラットフォームネイティブフォーマットです。                                                                                                     |

## READYTORUN_SECTION

```C++
struct READYTORUN_SECTION
{
    DWORD                   Type;           // READYTORUN_SECTION_XXX
    IMAGE_DATA_DIRECTORY    Section;
};
```

`READYTORUN_CORE_HEADER` 構造体の直後に `READYTORUN_SECTION` レコードの配列が続き、個々の R2R セクションを表します。配列の要素数は `READYTORUN_HEADER::NumberOfSections` です。各レコードはセクションタイプとバイナリ内のその位置を含みます。配列はバイナリサーチ (binary search) を可能にするためにセクションタイプでソートされています。

このセットアップにより、ファイルフォーマットの破壊的変更なしに、新しいまたはオプションのセクションタイプを追加したり、既存のセクションタイプを廃止したりできます。ランタイムは、ReadyToRun ファイルをロードして実行するために、すべてのセクションタイプを理解する必要はありません。

以下のセクションタイプが定義されており、本ドキュメントの後半で説明されます:

| ReadyToRunSectionType     |  値 | スコープ (コンポーネントアセンブリ / イメージ全体) |
| :------------------------ | --: | :------------------------------------------------- |
| CompilerIdentifier        | 100 | イメージ                                           |
| ImportSections            | 101 | イメージ                                           |
| RuntimeFunctions          | 102 | イメージ                                           |
| MethodDefEntryPoints      | 103 | アセンブリ                                         |
| ExceptionInfo             | 104 | アセンブリ                                         |
| DebugInfo                 | 105 | アセンブリ                                         |
| DelayLoadMethodCallThunks | 106 | アセンブリ                                         |
| ~~AvailableTypes~~        | 107 | (廃止 - 古いフォーマットで使用)                    |
| AvailableTypes            | 108 | アセンブリ                                         |
| InstanceMethodEntryPoints | 109 | イメージ                                           |
| InliningInfo              | 110 | アセンブリ (V2.1 で追加)                           |
| ProfileDataInfo           | 111 | イメージ (V2.2 で追加)                             |
| ManifestMetadata          | 112 | イメージ (V2.3 で追加)                             |
| AttributePresence         | 113 | アセンブリ (V3.1 で追加)                           |
| InliningInfo2             | 114 | イメージ (V4.1 で追加)                             |
| ComponentAssemblies       | 115 | イメージ (V4.1 で追加)                             |
| OwnerCompositeExecutable  | 116 | イメージ (V4.1 で追加)                             |
| PgoInstrumentationData    | 117 | イメージ (V5.2 で追加)                             |
| ManifestAssemblyMvids     | 118 | イメージ (V5.3 で追加)                             |
| CrossModuleInlineInfo     | 119 | イメージ (V6.3 で追加)                             |
| HotColdMap                | 120 | イメージ (V8.0 で追加)                             |
| MethodIsGenericMap        | 121 | アセンブリ (V9.0 で追加)                           |
| EnclosingTypeMap          | 122 | アセンブリ (V9.0 で追加)                           |
| TypeGenericInfoMap        | 123 | アセンブリ (V9.0 で追加)                           |

## ReadyToRunSectionType.CompilerIdentifier

このセクションには、イメージの生成に使用されたコンパイラを識別するゼロ終端 ASCII 文字列が含まれます。

**例**: `CoreCLR 4.6.22727.0 PROJECTK`

## ReadyToRunSectionType.ImportSections

このセクションには READYTORUN_IMPORT_SECTION 構造体の配列が含まれます。各エントリは、モジュール外部からの値で埋める必要があったスロットの範囲を記述します（通常は遅延処理）。各範囲のスロットの初期値は、ゼロまたは遅延初期化ヘルパーへのポインタです。

```C++
struct READYTORUN_IMPORT_SECTION
{
    IMAGE_DATA_DIRECTORY    Section;            // Section containing values to be fixed up
    USHORT                  Flags;              // One or more of ReadyToRunImportSectionFlags
    BYTE                    Type;               // One of ReadyToRunImportSectionType
    BYTE                    EntrySize;
    DWORD                   Signatures;         // RVA of optional signature descriptors
    DWORD                   AuxiliaryData;      // RVA of optional auxiliary data (typically GC info)
};
```

### READYTORUN_IMPORT_SECTIONS::Flags

| ReadyToRunImportSectionFlags        |     値 | 説明                                                                                                                                                                                                                                                                                     |
| :---------------------------------- | -----: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ReadyToRunImportSectionFlags::None  | 0x0000 | なし                                                                                                                                                                                                                                                                                     |
| ReadyToRunImportSectionFlags::Eager | 0x0001 | セクション内のスロットがイメージロード時に初期化される必要がある場合に設定されます。遅延初期化ができない場合、または望ましくない信頼性やパフォーマンスへの影響（予期しない障害や GC トリガーポイント、遅延初期化のオーバーヘッド）がある場合に、遅延初期化を回避するために使用されます。 |
| ReadyToRunImportSectionFlags::PCode | 0x0004 | セクションにコードへのポインタが含まれます                                                                                                                                                                                                                                               |

### READYTORUN_IMPORT_SECTIONS::Type

| ReadyToRunImportSectionType               |  値 | 説明                                                               |
| :---------------------------------------- | --: | :----------------------------------------------------------------- |
| ReadyToRunImportSectionType::Unknown      |   0 | このセクション内のスロットのタイプは未指定です。                   |
| ReadyToRunImportSectionType::StubDispatch |   2 | このセクション内のスロットはディスパッチにスタブを利用します。     |
| ReadyToRunImportSectionType::StringHandle |   3 | このセクション内のスロットは文字列を保持します。                   |
| ReadyToRunImportSectionType::ILBodyFixups |   7 | このセクション内のスロットはクロスモジュール IL ボディを表します。 |

_将来_: セクションタイプは、同じタイプのスロットをグループ化するために使用できます。たとえば、すべての仮想スタブディスパッチ (virtual stub dispatch) スロットをグループ化して、仮想スタブディスパッチセルを初期状態にリセットすることを簡素化できます。

### READYTORUN_IMPORT_SECTIONS::Signatures

このフィールドは、スロットの配列と並列な RVA の配列を指します。各 RVA は、対応するスロットを埋めるために必要な情報を含むフィックスアップシグネチャ (fixup signature) を指します。シグネチャのエンコーディングは、ECMA-335 のシグネチャに使用されるエンコーディングに基づいています。シグネチャの最初の要素はフィックスアップの種類を記述し、シグネチャの残りはフィックスアップの種類に基づいて異なります。

::: tip 💡 初心者向け補足
フィックスアップ (fixup) とは、コンパイル時に確定できないアドレスや参照を、実行時（ロード時）に解決して埋め込む処理のことです。たとえば、あるメソッドの実際のメモリアドレスはロード時まで分からないため、R2R イメージにはフィックスアップ情報が埋め込まれ、ランタイムがそれを解決します。これは、C/C++ のリンカにおけるリロケーション (relocation) に似た概念です。
:::

| ReadyToRunFixupKind                             |   値 | 説明                                                                                                                                                                                                                                                                                                                                                                   |
| :---------------------------------------------- | ---: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| READYTORUN_FIXUP_ThisObjDictionaryLookup        | 0x07 | `this` を使用したジェネリックルックアップ。型シグネチャとメソッドシグネチャが続きます。                                                                                                                                                                                                                                                                                |
| READYTORUN_FIXUP_TypeDictionaryLookup           | 0x08 | インスタンス化された型のメソッドに対する型ベースのジェネリックルックアップ。typespec シグネチャが続きます。                                                                                                                                                                                                                                                            |
| READYTORUN_FIXUP_MethodDictionaryLookup         | 0x09 | ジェネリックメソッドルックアップ。method spec シグネチャが続きます。                                                                                                                                                                                                                                                                                                   |
| READYTORUN_FIXUP_TypeHandle                     | 0x10 | ランタイムに対して型を一意に識別するポインタ。typespec シグネチャが続きます（ECMA-335 参照）。                                                                                                                                                                                                                                                                         |
| READYTORUN_FIXUP_MethodHandle                   | 0x11 | ランタイムに対してメソッドを一意に識別するポインタ。メソッドシグネチャが続きます（以下参照）。                                                                                                                                                                                                                                                                         |
| READYTORUN_FIXUP_FieldHandle                    | 0x12 | ランタイムに対してフィールドを一意に識別するポインタ。フィールドシグネチャが続きます（以下参照）。                                                                                                                                                                                                                                                                     |
| READYTORUN_FIXUP_MethodEntry                    | 0x13 | メソッドエントリポイントまたは呼び出し。メソッドシグネチャが続きます。                                                                                                                                                                                                                                                                                                 |
| READYTORUN_FIXUP_MethodEntry_DefToken           | 0x14 | メソッドエントリポイントまたは呼び出し。methoddef トークンが続きます（ショートカット）。                                                                                                                                                                                                                                                                               |
| READYTORUN_FIXUP_MethodEntry_RefToken           | 0x15 | メソッドエントリポイントまたは呼び出し。methodref トークンが続きます（ショートカット）。                                                                                                                                                                                                                                                                               |
| READYTORUN_FIXUP_VirtualEntry                   | 0x16 | 仮想メソッドエントリポイントまたは呼び出し。メソッドシグネチャが続きます。                                                                                                                                                                                                                                                                                             |
| READYTORUN_FIXUP_VirtualEntry_DefToken          | 0x17 | 仮想メソッドエントリポイントまたは呼び出し。methoddef トークンが続きます（ショートカット）。                                                                                                                                                                                                                                                                           |
| READYTORUN_FIXUP_VirtualEntry_RefToken          | 0x18 | 仮想メソッドエントリポイントまたは呼び出し。methodref トークンが続きます（ショートカット）。                                                                                                                                                                                                                                                                           |
| READYTORUN_FIXUP_VirtualEntry_Slot              | 0x19 | 仮想メソッドエントリポイントまたは呼び出し。typespec シグネチャとスロットが続きます。                                                                                                                                                                                                                                                                                  |
| READYTORUN_FIXUP_Helper                         | 0x1A | ヘルパー呼び出し。ヘルパー呼び出し ID が続きます（第4章「ヘルパー呼び出し」参照）。                                                                                                                                                                                                                                                                                    |
| READYTORUN_FIXUP_StringHandle                   | 0x1B | 文字列ハンドル。メタデータ文字列トークンが続きます。                                                                                                                                                                                                                                                                                                                   |
| READYTORUN_FIXUP_NewObject                      | 0x1C | 新規オブジェクトヘルパー。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                                              |
| READYTORUN_FIXUP_NewArray                       | 0x1D | 新規配列ヘルパー。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                                                      |
| READYTORUN_FIXUP_IsInstanceOf                   | 0x1E | isinst ヘルパー。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                                                       |
| READYTORUN_FIXUP_ChkCast                        | 0x1F | chkcast ヘルパー。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                                                      |
| READYTORUN_FIXUP_FieldAddress                   | 0x20 | フィールドアドレス。フィールドシグネチャが続きます。                                                                                                                                                                                                                                                                                                                   |
| READYTORUN_FIXUP_CctorTrigger                   | 0x21 | 静的コンストラクタトリガー。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                                            |
| READYTORUN_FIXUP_StaticBaseNonGC                | 0x22 | 非 GC 静的ベース。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                                                      |
| READYTORUN_FIXUP_StaticBaseGC                   | 0x23 | GC 静的ベース。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                                                         |
| READYTORUN_FIXUP_ThreadStaticBaseNonGC          | 0x24 | 非 GC スレッドローカル静的ベース。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                                      |
| READYTORUN_FIXUP_ThreadStaticBaseGC             | 0x25 | GC スレッドローカル静的ベース。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                                         |
| READYTORUN_FIXUP_FieldBaseOffset                | 0x26 | 指定された型のフィールドの開始オフセット。typespec シグネチャが続きます。基底クラスの脆弱性 (fragility) に対処するために使用されます。                                                                                                                                                                                                                                 |
| READYTORUN_FIXUP_FieldOffset                    | 0x27 | フィールドオフセット。フィールドシグネチャが続きます。                                                                                                                                                                                                                                                                                                                 |
| READYTORUN_FIXUP_TypeDictionary                 | 0x28 | ジェネリックコード用の隠しディクショナリ引数。typespec シグネチャが続きます。                                                                                                                                                                                                                                                                                          |
| READYTORUN_FIXUP_MethodDictionary               | 0x29 | ジェネリックコード用の隠しディクショナリ引数。メソッドシグネチャが続きます。                                                                                                                                                                                                                                                                                           |
| READYTORUN_FIXUP_Check_TypeLayout               | 0x2A | 型レイアウトの検証。typespec と期待される型レイアウトディスクリプタ (descriptor) が続きます。                                                                                                                                                                                                                                                                          |
| READYTORUN_FIXUP_Check_FieldOffset              | 0x2B | フィールドオフセットの検証。フィールドシグネチャと期待されるフィールドレイアウトディスクリプタが続きます。                                                                                                                                                                                                                                                             |
| READYTORUN_FIXUP_DelegateCtor                   | 0x2C | デリゲートコンストラクタ。メソッドシグネチャが続きます。                                                                                                                                                                                                                                                                                                               |
| READYTORUN_FIXUP_DeclaringTypeHandle            | 0x2D | メソッド宣言型のディクショナリルックアップ。型シグネチャが続きます。                                                                                                                                                                                                                                                                                                   |
| READYTORUN_FIXUP_IndirectPInvokeTarget          | 0x2E | インラインされた PInvoke のターゲット（間接）。メソッドシグネチャが続きます。                                                                                                                                                                                                                                                                                          |
| READYTORUN_FIXUP_PInvokeTarget                  | 0x2F | インラインされた PInvoke のターゲット。メソッドシグネチャが続きます。                                                                                                                                                                                                                                                                                                  |
| READYTORUN_FIXUP_Check_InstructionSetSupport    | 0x30 | フィックスアップに関連付けられた R2R コードを使用するためにサポートされている必要がある/サポートされていない必要がある命令セットを指定します。                                                                                                                                                                                                                         |
| READYTORUN_FIXUP_Verify_FieldOffset             | 0x31 | コンパイル時と実行時のフィールドオフセットが一致することを確認するランタイムチェックを生成します。CheckFieldOffset とは異なり、失敗時にメソッドを静かにドロップするのではなく、ランタイム例外を生成します。                                                                                                                                                            |
| READYTORUN_FIXUP_Verify_TypeLayout              | 0x32 | コンパイル時と実行時のフィールドオフセットが一致することを確認するランタイムチェックを生成します。CheckFieldOffset とは異なり、失敗時にメソッドを静かにドロップするのではなく、ランタイム例外を生成します。                                                                                                                                                            |
| READYTORUN_FIXUP_Check_VirtualFunctionOverride  | 0x33 | 仮想関数解決がコンパイル時と実行時で同等の動作をすることを確認するランタイムチェックを生成します。同等でない場合、コードは使用されません。使用されるシグネチャの詳細については[仮想オーバーライドシグネチャ](#仮想オーバーライドシグネチャ)を参照してください。                                                                                                        |
| READYTORUN_FIXUP_Verify_VirtualFunctionOverride | 0x34 | 仮想関数解決がコンパイル時と実行時で同等の動作をすることを確認するランタイムチェックを生成します。同等でない場合、ランタイム障害を生成します。使用されるシグネチャの詳細については[仮想オーバーライドシグネチャ](#仮想オーバーライドシグネチャ)を参照してください。                                                                                                    |
| READYTORUN_FIXUP_Check_IL_Body                  | 0x35 | IL メソッドが実行時にコンパイル時と同じように定義されているかを確認します。一致しない場合、コードは使用されません。詳細については [IL Body シグネチャ](#il-body-シグネチャ)を参照してください。                                                                                                                                                                        |
| READYTORUN_FIXUP_Verify_IL_Body                 | 0x36 | IL ボディがコンパイル時と実行時で同じように定義されていることを検証します。一致しない場合、ハードなランタイム障害を引き起こします。詳細については [IL Body シグネチャ](#il-body-シグネチャ)を参照してください。                                                                                                                                                        |
| READYTORUN_FIXUP_ModuleOverride                 | 0x80 | フィックスアップ ID と OR されると、シグネチャ内のフィックスアップバイトの後に、シグネチャのマスターコンテキストモジュールの MSIL メタデータ内、またはマニフェストメタデータ R2R ヘッダーテーブル内の assemblyref インデックスを持つエンコードされた uint が続きます（インライン化によって入力 MSIL に見られないアセンブリへの参照が持ち込まれる場合に使用されます）。 |

#### メソッドシグネチャ

ECMA-335 で定義されている MethodSpec シグネチャは、ネイティブコードが参照するメソッドフレーバー (flavor) を記述するのに十分な豊富さがありません。メソッドシグネチャの最初の要素はフラグです。その後にメソッドトークンと、フラグによって決定される追加データが続きます。

| ReadyToRunMethodSigFlags                  |   値 | 説明                                                                                                                                                                                                                |
| :---------------------------------------- | ---: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| READYTORUN_METHOD_SIG_UnboxingStub        | 0x01 | メソッドのアンボクシング (unboxing) エントリポイント。                                                                                                                                                              |
| READYTORUN_METHOD_SIG_InstantiatingStub   | 0x02 | メソッドのインスタンス化エントリポイントで、隠しディクショナリジェネリック引数を取りません。                                                                                                                        |
| READYTORUN_METHOD_SIG_MethodInstantiation | 0x04 | メソッドインスタンス化。インスタンス化引数の数と、それぞれの typespec が追加データとして付加されます。                                                                                                              |
| READYTORUN_METHOD_SIG_SlotInsteadOfToken  | 0x08 | 設定されている場合、トークンはスロット番号です。メタデータトークンを持たない多次元配列メソッド、および安定したインターフェースメソッドの最適化として使用されます。`MemberRefToken` と組み合わせることはできません。 |
| READYTORUN_METHOD_SIG_MemberRefToken      | 0x10 | 設定されている場合、トークンは memberref トークンです。設定されていない場合、トークンは methoddef トークンです。                                                                                                    |
| READYTORUN_METHOD_SIG_Constrained         | 0x20 | メソッド解決のための制約型。typespec が追加データとして付加されます。                                                                                                                                               |
| READYTORUN_METHOD_SIG_OwnerType           | 0x40 | メソッド型。typespec が追加データとして付加されます。                                                                                                                                                               |
| READYTORUN_METHOD_SIG_UpdateContext       | 0x80 | 設定されている場合、トークン処理を実行する前にトークンの解析に使用されるモジュールを更新します。フラグの直後にモジュールテーブルへの uint インデックスが続きます。                                                  |

#### フィールドシグネチャ

ECMA-335 は、ネイティブコードが参照するメソッドフレーバーを記述するのに十分な豊富さを持つフィールドシグネチャを定義していません。フィールドシグネチャの最初の要素はフラグです。その後にフィールドトークンと、フラグによって決定される追加データが続きます。

| ReadyToRunFieldSigFlags                  |   値 | 説明                                                                                                            |
| :--------------------------------------- | ---: | :-------------------------------------------------------------------------------------------------------------- |
| READYTORUN_FIELD_SIG_IndexInsteadOfToken | 0x08 | 安定したフィールドの最適化として使用されます。`MemberRefToken` と組み合わせることはできません。                 |
| READYTORUN_FIELD_SIG_MemberRefToken      | 0x10 | 設定されている場合、トークンは memberref トークンです。設定されていない場合、トークンは fielddef トークンです。 |
| READYTORUN_FIELD_SIG_OwnerType           | 0x40 | フィールド型。typespec が追加データとして付加されます。                                                         |

#### 仮想オーバーライドシグネチャ

ECMA 335 には、オーバーライドされたメソッドを記述するための自然なエンコーディングがありません。これらのシグネチャは、ReadyToRunVirtualFunctionOverrideFlags バイトとしてエンコードされ、その後に宣言メソッドを表すメソッドシグネチャ、脱仮想化 (devirtualize) される型を表す型シグネチャ、および（オプションとして）実装メソッドを示すメソッドシグネチャが続きます。

| ReadyToRunVirtualFunctionOverrideFlags                |   値 | 説明                                                                                                     |
| :---------------------------------------------------- | ---: | :------------------------------------------------------------------------------------------------------- |
| READYTORUN_VIRTUAL_OVERRIDE_None                      | 0x00 | フラグは設定されていません。                                                                             |
| READYTORUN_VIRTUAL_OVERRIDE_VirtualFunctionOverridden | 0x01 | 設定されている場合、仮想関数には実装があり、オプションのメソッド実装シグネチャにエンコードされています。 |

#### IL Body シグネチャ

ECMA 335 は、メソッドの正確な実装をそれ自体で表現できるフォーマットを定義していません。このシグネチャは、メソッドのすべての IL、EH テーブル、ローカル変数テーブルを保持し、それらのテーブル内の各トークン（型参照を除く）は、ローカルシグネチャストリームへのインデックスに置き換えられます。これらのシグネチャは、MemberRef、TypeSpec、MethodSpec、StandaloneSignature、および文字列を記述するために必要なメタデータのそのままのコピーです。これらすべてが大きなバイト配列にバンドルされます。さらに、型参照を解決するための一連の TypeSignature と、インスタンス化されていないメソッドへのメソッド参照が続きます。これらすべてが実行時に存在するデータと一致する場合、フィックスアップは満たされたと見なされます。フォーマットの正確な詳細については ReadyToRunStandaloneMetadata.cs を参照してください。

### READYTORUN_IMPORT_SECTIONS::AuxiliaryData

`READYTORUN_HELPER_DelayLoad_MethodCall` ヘルパーを通じて遅延解決されるスロットの場合、補助データ (auxiliary data) は、ヘルパーの実行中に正確な GC スタックスキャンを可能にする圧縮された引数マップです。CoreCLR ランタイムクラス [`GCRefMapDecoder`](https://github.com/dotnet/runtime/blob/69e114c1abf91241a0eeecf1ecceab4711b8aa62/src/coreclr/inc/gcrefmap.h#L158) がこの情報の解析に使用されます。このデータは、保守的なスタックスキャンを許可するランタイムでは必要ありません。

補助データテーブルには、インポートセクション内のメソッドエントリと正確に同じ数の GC 参照マップレコードが含まれます。GC 参照マップの検索を高速化するために、補助データセクションはランタイム関数テーブル内の 1024 番目ごとのメソッドの線形化された GC 参照マップ内のオフセットを保持するルックアップテーブルで始まります。

|      補助データ内のオフセット | サイズ | 内容                                                                                                         |
| ----------------------------: | -----: | :----------------------------------------------------------------------------------------------------------- |
|                             0 |      4 | メソッド #0 の GC 参照マップ情報へのこのバイトからの相対オフセット（すなわち 4 \* (MethodCount / 1024 + 1)） |
|                             4 |      4 | メソッド #1024 の GC 参照マップ情報へのオフセット                                                            |
|                             8 |      4 | メソッド #2048 の GC 参照マップ情報へのオフセット                                                            |
|                           ... |        |
| 4 \* (MethodCount / 1024 + 1) |    ... | シリアライズされた GC 参照マップ情報                                                                         |

GC 参照マップは、呼び出しサイトの引数の GC 型をエンコードするために使用されます。論理的には、`<pos, token>` のシーケンスであり、`pos` はスタックフレーム内の参照の位置、`token` は GC 参照の型（[`GCREFMAP_XXX`](https://github.com/dotnet/runtime/blob/69e114c1abf91241a0eeecf1ecceab4711b8aa62/src/coreclr/inc/corcompile.h#L633) 値のいずれか）です:

| CORCOMPILE_GCREFMAP_TOKENS |  値 | スタックフレームエントリの解釈                         |
| :------------------------- | --: | :----------------------------------------------------- |
| GCREFMAP_SKIP              |   0 | GC に関連しないエントリ                                |
| GCREFMAP_REF               |   1 | GC 参照                                                |
| GCREFMAP_INTERIOR          |   2 | GC 参照へのポインタ                                    |
| GCREFMAP_METHOD_PARAM      |   3 | ジェネリックメソッドへの隠しメソッドインスタンス化引数 |
| GCREFMAP_TYPE_PARAM        |   4 | ジェネリックメソッドへの隠し型インスタンス化引数       |
| GCREFMAP_VASIG_COOKIE      |   5 | VARARG シグネチャクッキー                              |

位置の値は、`size_t`（`IntPtr`）単位（32 ビットアーキテクチャでは 4 バイト、64 ビットアーキテクチャでは 8 バイト）で、GC 参照を含む可能性のあるトランジションフレームの最初の位置から計算されます。**arm64** を除くすべてのアーキテクチャでは、これはスピルされた引数レジスタの配列の先頭です。arm64 では、呼び出されたメソッドによって戻り値を格納する場所を渡すために使用される `X8` レジスタのオフセットです。

- エンコーディングは常にバイト境界から開始します。各バイトの最上位ビットは、エンコーディングストリームの終了を示すために使用されます。最後のバイトの最上位ビットはゼロです。つまり、各バイトには 7 つの有効ビットがあります。

- "pos" は常に前の pos からのデルタとしてエンコードされます。

- 基本エンコーディング単位は 2 ビットです。値 0、1、2 は一般的な構成（単一スロットのスキップ、GC 参照、内部ポインタ）です。値 3 は拡張エンコーディングが続くことを意味します。

- 拡張情報は、1 つ以上の 4 ビットブロックで整数エンコードされます。4 ビットブロックの最上位ビットは終了を示すために使用されます。

- x86 の場合、エンコーディングは呼び出し先がポップするスタックのサイズから始まります。サイズは上記と同じメカニズム（2 ビットの基本エンコーディングと、大きな値のための拡張エンコーディング）を使用してエンコードされます。

## ReadyToRunSectionType.RuntimeFunctions

このセクションには、イメージ内のすべてのコードブロックをアンワインド情報 (unwind info) へのポインタとともに記述する `RUNTIME_FUNCTION` エントリのソート済み配列が含まれます。
名前にもかかわらず、これらのコードブロックはメソッドボディを表す場合もあれば、独自のアンワインドデータを必要とするその一部（例: ファンクレット (funclet)）のみを表す場合もあります。
標準の Windows xdata/pdata フォーマットが使用されます。
x86 アンワインド情報の標準がないことを補うために、x86 では ARM フォーマットが使用されます。
アンワインド情報ブロブ (blob) の直後に GC 情報ブロブが続きます。amd64 ではエンコーディングがわずかに異なり、アンワインド情報ブロブの終了 RVA を表す追加の 4 バイトがエンコードされます。

### RUNTIME_FUNCTION (x86, arm, arm64, サイズ = 8 バイト)

| オフセット | サイズ | 値                       |
| ---------: | -----: | :----------------------- |
|          0 |      4 | アンワインド情報開始 RVA |
|          4 |      4 | GC 情報開始 RVA          |

### RUNTIME_FUNCTION (amd64, サイズ = 12 バイト)

| オフセット | サイズ | 値                                                 |
| ---------: | -----: | :------------------------------------------------- |
|          0 |      4 | アンワインド情報開始 RVA                           |
|          4 |      4 | アンワインド情報終了 RVA（最後のバイトの RVA + 1） |
|          8 |      4 | GC 情報開始 RVA                                    |

## ReadyToRunSectionType.MethodDefEntryPoints

このセクションには、methoddef 行をメソッドエントリポイントにマッピングするネイティブフォーマットスパース配列 (sparse array)（第4章「ネイティブフォーマット」参照）が含まれます。methoddef が配列のインデックスとして使用されます。配列の要素は `RuntimeFunctions` 内のメソッドのインデックスであり、メソッドが実行を開始する前に埋める必要があるスロットのリストが続きます。

メソッドのインデックスは左に 1 ビットシフトされ、下位ビットがフィックスアップすべきスロットのリストが続くかどうかを示します。スロットのリストは以下のようにエンコードされます（NGen で使用されるのと同じエンコーディング）:

```
READYTORUN_IMPORT_SECTIONS absolute index
    absolute slot index
    slot index delta
    _
    slot index delta
    0
READYTORUN_IMPORT_SECTIONS index delta
    absolute slot index
    slot index delta
    _
    slot delta
    0
READYTORUN_IMPORT_SECTIONS index delta
    absolute slot index
    slot index delta
    _
    slot delta
    0
0
```

フィックスアップリストは、ニブル (nibble)（1 ニブル = 4 ビット）としてエンコードされた整数のストリームです。ニブルの 3 ビットは値の 3 ビットを格納するために使用され、最上位ビットは次のニブルに値の残りが含まれるかどうかを示します。ニブルの最上位ビットが設定されている場合、値は次のニブルに続きます。

セクションインデックスとスロットインデックスは、初期の絶対インデックスからのデルタエンコーディングされたオフセットです。デルタエンコーディングとは、i 番目の値が値 [1..i] の合計であることを意味します。

リストは 0 で終端されます（0 は有効なデルタとしては意味がありません）。

**注:** これはアセンブリごとのセクションです。単一ファイル R2R ファイルでは、メインの R2R ヘッダーから直接指されます。コンポジット R2R ファイルでは、各コンポーネントモジュールが `READYTORUN_SECTION_ASSEMBLIES_ENTRY` コアヘッダー構造体によって指される独自のエントリポイントセクションを持ちます。

## ReadyToRunSectionType.ExceptionInfo

例外処理情報。このセクションには、`MethodStart` RVA でソートされた `READYTORUN_EXCEPTION_LOOKUP_TABLE_ENTRY` の配列が含まれます。`ExceptionInfo` は、指定されたメソッドの例外処理情報を記述する `READYTORUN_EXCEPTION_CLAUSE` 配列の RVA です。

```C++
struct READYTORUN_EXCEPTION_LOOKUP_TABLE_ENTRY
{
    DWORD MethodStart;
    DWORD ExceptionInfo;
};

struct READYTORUN_EXCEPTION_CLAUSE
{
    CorExceptionFlag    Flags;
    DWORD               TryStartPC;
    DWORD               TryEndPC;
    DWORD               HandlerStartPC;
    DWORD               HandlerEndPC;
    union {
        mdToken         ClassToken;
        DWORD           FilterOffset;
    };
};
```

NGen と同じエンコーディングが使用されます。

## ReadyToRunSectionType.DebugInfo

このセクションには、デバッグをサポートするための情報（ネイティブオフセットとローカル変数のマップ）が含まれます。

**TODO**: デバッグ情報のエンコーディングをドキュメント化する。NGen で使用されるのと同じエンコーディングです。デバッガが別途保存されたデバッグ情報を処理できるようになった場合には不要です。

## ReadyToRunSectionType.DelayLoadMethodCallThunks

このセクションは、`READYTORUN_HELPER_DelayLoad_MethodCall` ヘルパーのサンク (thunk) を含む領域をマークします。これは、遅延解決される呼び出しへのステップインのためにデバッガが使用します。デバッガが別途保存されたデバッグ情報を処理できるようになった場合には不要です。

## ReadyToRunSectionType.AvailableTypes

このセクションには、コンパイルモジュール内のすべての定義型およびエクスポート型のネイティブハッシュテーブル (hashtable) が含まれます。キーは完全な型名で、値はエクスポート型または定義型のトークン行 ID を左に 1 ビットシフトし、ビット 0 でトークンタイプを定義する値と OR したものです:

| ビット値 | トークンタイプ |
| -------: | :------------- |
|        0 | 定義型         |
|        1 | エクスポート型 |

型名のハッシュに使用されるバージョン耐性ハッシュアルゴリズム (version-resilient hashing algorithm) は、[vm/versionresilienthashcode.cpp](https://github.com/dotnet/runtime/blob/69e114c1abf91241a0eeecf1ecceab4711b8aa62/src/coreclr/vm/versionresilienthashcode.cpp#L74) に実装されています。

**注:** これはアセンブリごとのセクションです。単一ファイル R2R ファイルでは、メインの R2R ヘッダーから直接指されます。コンポジット R2R ファイルでは、各コンポーネントモジュールが `READYTORUN_SECTION_ASSEMBLIES_ENTRY` コアヘッダー構造体によって指される独自の利用可能型セクションを持ちます。

## ReadyToRunSectionType.InstanceMethodEntryPoints

このセクションには、R2R 実行可能ファイルにコンパイルされたすべてのジェネリックメソッドインスタンス化のネイティブハッシュテーブルが含まれます。キーはメソッドインスタンスシグネチャです。適切なバージョン耐性ハッシュコードの計算は [vm/versionresilienthashcode.cpp](https://github.com/dotnet/runtime/blob/69e114c1abf91241a0eeecf1ecceab4711b8aa62/src/coreclr/vm/versionresilienthashcode.cpp#L126) に実装されています。値は `EntryPointWithBlobVertex` クラスによって表され、ランタイム関数テーブル内のメソッドインデックス、フィックスアップブロブ、およびメソッドシグネチャをエンコードするブロブを格納します。

**注:** 非ジェネリックメソッドのエントリポイントとは対照的に、このセクションはコンポジット R2R イメージの場合にイメージ全体にわたります。コンポジット実行可能ファイル内のすべてのアセンブリが必要とするすべてのジェネリクスを表します。本ドキュメントの他の箇所で述べたように、CoreCLR ランタイムは、コンポジット R2R ケースでこのセクションに格納されたメソッドを適切に検索するための変更が必要です。

**注:** ジェネリックメソッドおよびジェネリック型の非ジェネリックメソッドはこのテーブルにエンコードされ、ランタイムは潜在的に複数のモジュールでこのテーブルを検索することが期待されます。まず、ランタイムはメソッドを定義するモジュールのこのテーブルを検索し、次に「代替」ジェネリクスの場所を使用することが期待されます。この代替の場所は、メソッドのジェネリック引数の一つの定義モジュールである、定義モジュールではないモジュールとして定義されます。この代替ルックアップは現在、深くネストされたアルゴリズムではありません。そのルックアップが失敗した場合、`READYTORUN_FLAG_UNRELATED_R2R_CODE` をフラグとして指定したすべてのモジュールに対してルックアップが行われます。

## ReadyToRunSectionType.InliningInfo (v2.1+)

**TODO**: インライン情報のエンコーディングをドキュメント化する

## ReadyToRunSectionType.ProfileDataInfo (v2.2+)

**TODO**: プロファイルデータのエンコーディングをドキュメント化する

## ReadyToRunSectionType.ManifestMetadata (v2.3+、v6.3+ で変更あり)

マニフェストメタデータ (manifest metadata) は、入力 MSIL に格納されたアセンブリ参照に加えて、インライン化によってバージョンバブル (version bubble) 内に導入された追加の参照アセンブリを含む [ECMA-335] メタデータブロブです。
R2R バージョン 3.1 時点では、メタデータは AssemblyRef テーブルにのみ使用されます。これは、シグネチャ内のモジュールオーバーライドインデックスを実際の参照モジュールに変換するために使用されます（シグネチャフィックスアップバイトの `READYTORUN_FIXUP_ModuleOverride` ビットフラグまたは `ELEMENT_TYPE_MODULE_ZAPSIG` COR 要素型のいずれかを使用）。

::: tip 💡 初心者向け補足
バージョンバブル (version bubble) とは、一緒にコンパイルされ、互いのコード/データ構造を直接参照できるアセンブリのグループのことです。バブル内のアセンブリは互いに「信頼」し合い、内部の詳細に依存できますが、バブル外のアセンブリに対しては安定した公開 API のみを使用する必要があります。
:::

**注:** バージョンバブル外部のアセンブリへの参照を `READYTORUN_FIXUP_ModuleOverride` または `ELEMENT_TYPE_MODULE_ZAPSIG` の概念を通じてマニフェストメタデータで使用することは意味がありません。メタデータトークン値が一定であるという保証がないため、それらに対してシグネチャを相対的にエンコードすることはできません。
ただし、R2R バージョン 6.3 以降、ネイティブマニフェストメタデータには、実際の実装アセンブリにさらに解決されるトークンが含まれる場合があります。

モジュールオーバーライドインデックスの変換アルゴリズムは以下の通りです（**ILAR** = _入力 MSIL の `AssemblyRef` 行数_）:

R2R バージョン 6.2 以下の場合

| モジュールオーバーライドインデックス (_i_) | 参照アセンブリ                                                                                 |
| :----------------------------------------- | :--------------------------------------------------------------------------------------------- |
| _i_ = 0                                    | グローバルコンテキスト - シグネチャを含むアセンブリ                                            |
| 1 <= _i_ <= **ILAR**                       | _i_ は MSIL `AssemblyRef` テーブルへのインデックス                                             |
| _i_ > **ILAR**                             | _i_ - **ILAR** - 1 はマニフェストメタデータの `AssemblyRef` テーブルへのゼロベースインデックス |

**注:** これは、_i_ = **ILAR** + 1 に対応するエントリが実際には未定義であることを意味します。マニフェストメタデータ AssemblyRef テーブルの `NULL` エントリ（ROWID #0）に対応するためです。マニフェストメタデータへの最初の意味のあるインデックスは _i_ = **ILAR** + 2 で、ROWID #1 に対応し、歴史的に Crossgen によって入力アセンブリ情報で埋められていますが、これに依存すべきではありません。実際、入力アセンブリはマニフェストメタデータでは不要であり、特別なインデックス 0 を使用してモジュールオーバーライドをエンコードできます。

R2R バージョン 6.3 以上の場合

| モジュールオーバーライドインデックス (_i_) | 参照アセンブリ                                                                                 |
| :----------------------------------------- | :--------------------------------------------------------------------------------------------- |
| _i_ = 0                                    | グローバルコンテキスト - シグネチャを含むアセンブリ                                            |
| 1 <= _i_ <= **ILAR**                       | _i_ は MSIL `AssemblyRef` テーブルへのインデックス                                             |
| _i_ = **ILAR** + 1                         | _i_ はマニフェストメタデータ自体を参照するインデックス                                         |
| _i_ > **ILAR** + 1                         | _i_ - **ILAR** - 2 はマニフェストメタデータの `AssemblyRef` テーブルへのゼロベースインデックス |

さらに、`System.Private.CoreLib` を参照するモジュール内の ModuleRef は、マニフェストメタデータ内の _TypeRef_ の _ResolutionContext_ として機能できます。これは常に `System.Object` 型を含むモジュールを参照します。

## ReadyToRunSectionType.AttributePresence (v3.1+)

**TODO**: 属性プレゼンスのエンコーディングをドキュメント化する

**注:** これはアセンブリごとのセクションです。単一ファイル R2R ファイルでは、メインの R2R ヘッダーから直接指されます。コンポジット R2R ファイルでは、各コンポーネントモジュールが `READYTORUN_SECTION_ASSEMBLIES_ENTRY` コアヘッダー構造体によって指される独自の属性プレゼンスセクションを持ちます。

## ReadyToRunSectionType.InliningInfo2 (v4.1+)

インライン化情報セクションは、どのメソッドが他のメソッドにインライン化されたかを記録します。単一の _ネイティブフォーマットハッシュテーブル_（後述）で構成されます。

ハッシュテーブル内のエントリは、各インライニー (inlinee) に対するインライナー (inliner) のリストです。ハッシュテーブル内の 1 エントリは 1 つのインライニーに対応します。ハッシュテーブルは、モジュール名のハッシュコードとインライニーの RID を XOR した値でハッシュされます。

ハッシュテーブルのエントリは、圧縮された符号なし整数のカウント付きシーケンスです:

- インライニーの RID を左に 1 ビットシフトしたもの。最下位ビットが設定されている場合、これは外部モジュールからのインライニーです。その場合、_モジュールオーバーライドインデックス_（上記で定義）が別の圧縮された符号なし整数として続きます。
- インライナーの RID が続きます。インライニーのエンコード方法と同様にエンコードされます（左シフトし、最下位ビットが外部 RID を示します）。RID を直接エンコードする代わりに、RID デルタ（前の RID と現在の RID の差）がエンコードされます。これにより、より良い整数圧縮が可能になります。

外部 RID は、コンパイル時に脆弱なインライン化が許可された場合にのみ存在します。

**TODO:** `DelayLoadMethodCallThunks` や `InliningInfo` もコンポジット R2R ファイルフォーマットに固有の変更が必要かどうかはまだ検討中です。

## ReadyToRunSectionType.ComponentAssemblies (v4.1+)

このイメージ全体のセクションは、コンポジット R2R ファイルのメイン R2R ヘッダーにのみ存在します。これは、マニフェストメタデータの AssemblyRef テーブルのインデックスと並列な `READYTORUN_SECTION_ASSEMBLIES_ENTRY` エントリの配列です。行インデックスが同等の AssemblyRef インデックスに対応する線形テーブルです。ECMA 335 の AssemblyRef テーブルと同様に、インデックスは 1 ベースです（テーブルの最初のエントリはインデックス 1 に対応します）。

```C++
struct READYTORUN_SECTION_ASSEMBLIES_ENTRY
{
    IMAGE_DATA_DIRECTORY CorHeader;        // Input MSIL metadata COR header (for composite R2R images with embedded MSIL metadata)
    IMAGE_DATA_DIRECTORY ReadyToRunHeader; // READYTORUN_CORE_HEADER of the assembly in question
};
```

## ReadyToRunSectionType.OwnerCompositeExecutable (v4.1+)

スタンドアロン MSIL を持つコンポジット R2R 実行可能ファイルの場合、MSIL ファイルはコンパイル中に書き換えられ、適切なシグネチャとメジャー/マイナーバージョンペアを持つ正式な ReadyToRun ヘッダーが付与されます。`Flags` には `READYTORUN_FLAG_COMPONENT` ビットが設定され、そのセクションリストには、この MSIL が属するコンポジット R2R 実行可能ファイルのファイル名を拡張子付き（パスなし）で UTF-8 文字列としてエンコードする `OwnerCompositeExecutable` セクションのみが含まれます。ランタイムは、MSIL をロードする際にコンパイル済みネイティブコードを含むコンポジット R2R 実行可能ファイルを特定するためにこの情報を使用します。

## ReadyToRunSectionType.PgoInstrumentationData (v5.2+)

**TODO**: PGO インストルメンテーションデータをドキュメント化する

## ReadyToRunSectionType.ManifestAssemblyMvids (v5.3+)

このセクションは、マニフェストメタデータ内の各アセンブリに対する 16 バイト MVID レコードのバイナリ配列です。マニフェストメタデータに格納されたアセンブリ数は、配列内の MVID レコード数と等しくなります。MVID レコードは実行時に、ロードされたアセンブリがバージョニングバブルを表すマニフェストメタデータによって参照されたものと一致することを検証するために使用されます。

## ReadyToRunSectionType.CrossModuleInlineInfo (v6.3+)

インライン化情報セクションは、どのメソッドが他のメソッドにインライン化されたかを記録します。単一の _ネイティブフォーマットハッシュテーブル_（後述）で構成されます。

ハッシュテーブル内のエントリは、各インライニーに対するインライナーのリストです。ハッシュテーブル内の 1 エントリは 1 つのインライニーに対応します。ハッシュテーブルは、インスタンス化されていない methoddef インライニーのバージョン耐性ハッシュコードでハッシュされます。

ハッシュテーブルのエントリは、InlineeIndex で始まる圧縮された符号なし整数のカウント付きシーケンスです。InlineeIndex は 30 ビットのインデックスと 2 ビットのフラグを組み合わせたもので、インライナーのシーケンスの解析方法と、インライニーを見つけるためにインデックスされるテーブルを定義します。

- InlineeIndex
  - インライニーを定義するための最下位 2 ビットのフラグフィールドを持つインデックス
    - (flags & 1) == 0 の場合、インデックスは MethodDef RID であり、モジュールがコンポジットイメージの場合、メソッドのモジュールインデックスが続きます
    - (flags & 1) == 1 の場合、インデックスは ILBody インポートセクションへのインデックスです
    - (flags & 2) == 0 の場合、インライナーリストは:
      - インライナー RID デルタ - 下記の定義を参照
    - (flags & 2) == 2 の場合、続くのは:
      - ILBody インポートセクションへのデルタエンコードされたインデックスのカウント
      - READYTORUN_IMPORT_SECTION_TYPE_ILBODYFIXUPS タイプを持つ最初のインポートセクションへのデルタエンコードされたインデックスのシーケンス
      - インライナー RID デルタ - 下記の定義を参照

- インライナー RID デルタ（READYTORUN_FLAG_MULTIMODULE_VERSION_BUBBLE フラグが設定されたモジュールで指定されるマルチモジュールバージョンバブルイメージの場合）
  - 最下位ビットにフラグを持つインライナー RID デルタのシーケンス
  - フラグが設定されている場合、インライナー RID の後にモジュール ID が続きます
  - そうでない場合、モジュールはインライニーメソッドと同じモジュールです
- インライナー RID デルタ（シングルモジュールバージョンバブルイメージの場合）
  - インライナー RID デルタのシーケンス

このセクションは InliningInfo2 セクションに加えて含まれる場合があります。

## ReadyToRunSectionType.HotColdMap (v8.0+)

ReadyToRun 8.0+ では、メソッドをホットパート (hot part) とコールドパート (cold part) に分割して、それらが隣接しないようにするフォーマットがサポートされています。このホットコールドマップセクションは、メソッドがどのように分割されたかの情報を記録し、ランタイムがさまざまなサービスのためにそれらを特定できるようにします。

::: tip 💡 初心者向け補足
ホット/コールド分割とは、頻繁に実行されるコード（ホット）とほとんど実行されないコード（コールド、例外処理パスなど）を物理的に分離する最適化手法です。ホットなコードをメモリ上で近くにまとめることで、CPU のキャッシュ効率を向上させ、パフォーマンスを改善します。
:::

分割されたすべてのメソッドに対して、セクション内に 1 つのエントリがあります。各エントリには 2 つの符号なし 32 ビット整数があります。最初の整数はコールドパートのランタイム関数インデックスで、2 番目の整数はホットパートのランタイム関数インデックスです。

このテーブル内のメソッドは、ホットパートのランタイム関数インデックスでソートされています。コールドパートは常にホットパートと同じ順序で出力されるため、コールドパートのランタイム関数インデックスでもソートされています。あるいはランタイム関数テーブル自体が RVA でソートされているため、RVA でソートされているとも言えます。

`--hot-cold-splitting` フラグがコンパイル時に指定されていない場合、またはコンパイラがメソッドを分割すべきではないと判断した場合、メソッドは分割されず、このセクションは存在しない場合があります。

## ReadyToRunSectionType.MethodIsGenericMap (v9.0+)

このオプションセクションは、アセンブリ内の MethodDef がジェネリックパラメータを持つかどうかを示すビットベクトル (bit vector) を保持します。これにより、GenericParameter テーブルやメソッドのシグネチャを調べる代わりに、ビットベクトルへの問い合わせ（高速かつ効率的）によってメソッドがジェネリックかどうかを判定できます。

セクションは、ビットベクトル内のビット数を示す 32 ビット整数 1 つで始まります。その整数の後に、すべてのデータの実際のビットベクトルが続きます。データは 8 ビットバイトにグループ化され、バイトの最下位ビットが最も低い MethodDef を表すビットです。

たとえば、ビットベクトルの最初のバイトは MethodDef 06000001 から 06000008 を表し、その最初のバイトの最下位ビットは MethodDef 06000001 の IsGeneric ビットを表すビットです。

## ReadyToRunSectionType.EnclosingTypeMap (v9.0+)

このオプションセクションは、囲まれた型から囲む型への効率的な O(1) ルックアップを可能にします。ECMA 335 で定義された NestedClass テーブル（同じ情報をエンコードする）を使用する場合に必要なバイナリサーチが不要になります。このセクションは、アセンブリ内に 0xFFFE 未満の型が定義されている場合にのみ含めることができます。

このセクションの構造は:
マップ内のエントリ数を示す 16 ビット符号なし整数 1 つ。
このカウントの後に、アセンブリ内で定義された各 TypeDef に対する 16 ビット符号なし整数が続きます。この typedef は囲む型の RID であり、typedef が他の型に囲まれていない場合は 0 です。

## ReadyToRunSectionType.TypeGenericInfoMap (v9.0+)

このオプションセクションは、型に関するジェネリックの詳細の凝縮されたビューを表します。これにより、型のロードをより効率的にできます。

このセクションの構造は:
マップ内のエントリ数を表す 32 ビット整数 1 つの後に、型ごとに 1 つの 4 ビットエントリのシリーズが続きます。これらの 4 ビットエントリはバイトにグループ化され、各バイトは 2 エントリを保持し、バイトの最上位 4 ビットのエントリがより低い TypeDef RID を表すエントリです。

TypeGenericInfoMap エントリは、3 つの異なる情報セットを表す 4 ビットを持ちます。

1. ジェネリックパラメータの数はいくつか (0, 1, 2, MoreThanTwo)（TypeGenericInfoMap エントリの最下位 2 ビットで表されます）
2. ジェネリックパラメータに制約はあるか?（エントリの 3 番目のビット）
3. ジェネリックパラメータのいずれかに共変性 (covariance) または反変性 (contravariance) があるか?（エントリの 4 番目のビット）

# ネイティブフォーマット

ネイティブフォーマット (Native Format) は、型システムデータを、実行時アクセスに効率的なバイナリフォーマットで永続化するためのエンコーディングパターンのセットです。ワーキングセットと CPU サイクルの両方で効率的です。（元々は .NET Native 向けに設計され、広く使用されています。）

::: tip 💡 初心者向け補足
ネイティブフォーマットは、メタデータやルックアップテーブルなどのデータを、ランタイムが高速にアクセスできるよう特別にエンコードしたバイナリ形式です。整数の可変長エンコーディング、スパース配列、ハッシュテーブルなど、コンパクトさとアクセス速度の両方を追求したデータ構造が使われています。
:::

## 整数エンコーディング

ネイティブフォーマットは、符号付きおよび符号なし数値に可変長エンコーディング方式を使用します。エンコーディングの最初のバイトの下位ビットが、後続バイト数を以下のように指定します:

- `xxxxxxx0`（すなわち最下位ビットが 0）: 後続バイトなし。バイトを右に 1 ビットシフトし、符号付きおよび符号なし数値に対してそれぞれ符号拡張またはゼロ拡張します。
- `xxxxxx01`: 後続 1 バイト。読み取った 2 バイトからリトルエンディアン (little-endian) 順で 16 ビット数を構築し、右に 2 ビットシフトした後、符号拡張またはゼロ拡張します。
- `xxxxx011`: 後続 2 バイト。読み取った 3 バイトからリトルエンディアン順で 24 ビット数を構築し、右に 3 ビットシフトした後、符号拡張またはゼロ拡張します。
- `xxxx0111`: 後続 3 バイト。読み取った 4 バイトから 32 ビット数を構築した後、符号拡張またはゼロ拡張します。
- `xxxx1111`: 後続 4 バイト。最初のバイトを破棄し、続く 4 バイトから符号付きまたは符号なし数値を構築します（同様にリトルエンディアン順）。

**例**:

- 符号なし数値 12（`0x0000000c`）は、単一バイト `0x18` として表現されます。
- 符号なし数値 1000（`0x000003e8`）は、2 バイト `0xa1, 0x0f` として表現されます。

## スパース配列

NativeArray は、ヌル要素圧縮（空ブロックの共有ストレージ）と可変サイズオフセットエンコーディング（データサイズに適応）を通じてコンパクトなストレージを維持しつつ、O(1) のインデックスアクセスを提供します。

配列は、ヘッダー、ブロックインデックス、ブロックの 3 つの部分で構成されます。

ヘッダーは可変エンコードされた値で:

- ビット 0-1: エントリインデックスサイズ
  - 0 = uint8 オフセット
  - 1 = uint16 オフセット
  - 2 = uint32 オフセット
- ビット 2-31: 配列内の要素数

ブロックインデックスはメモリ上でヘッダーの直後に続き、ブロックごとに 1 つのオフセットエントリ（ヘッダーにエンコードされた動的サイズ）で構成されます。各エントリは、ブロックインデックスセクションの先頭からの相対位置でデータブロックの位置を指します。配列は最大ブロックサイズ 16 要素を使用し、ブロックインデックスは実質的に 16 個ずつの連続した配列インデックスの各グループを対応するデータブロックにマッピングします。

ブロックインデックスの後に実際のデータブロックが続きます。これらはツリーノード (tree node) とデータノード (data node) の 2 種類のノードで構成されます。

ツリーノードは可変長エンコードされた uint で構成されます:

- ビット 0: 設定されている場合、ノードにはより低いインデックスの子があります
- ビット 1: 設定されている場合、ノードにはより高いインデックスの子があります
- ビット 2-31: より高いインデックスの子のシフトされた相対オフセット

データノードはユーザー定義データを含みます。

各ブロックは最大 16 要素を持つため、深さは `4` です。

### ルックアップアルゴリズムの手順

**ステップ 1: ヘッダーの読み取り**

- 配列から可変長エンコードされたヘッダー値をデコードします
- ビット 0-1 からエントリインデックスサイズを抽出します（0=uint8, 1=uint16, 2=uint32 オフセット）
- ヘッダー値を右に 2 ビットシフトして、ビット 2-31 から要素の総数を抽出します
- この情報を使用して、ブロックインデックスエントリの解釈方法を決定し、配列境界を検証します

**ステップ 2: ブロックオフセットの計算**

- ターゲット要素を含むブロックインデックス `blockIndex` を、インデックスをブロックサイズ（16）で割ることによって決定します。
- ブロックオフセットを含むメモリ位置 `pBlockOffset = baseOffset + entrySize * blockIndex` を計算します。ここで `baseOffset` はヘッダー直後のアドレスであり、`entrySize` はヘッダーの下位ビットによって決定されます。
- 計算された `pBlockOffset` とヘッダーによって決定されたエントリサイズを使用して、ブロックインデックステーブルからブロックオフセット `blockOffset` を読み取ります。
- 相対 `blockOffset` を絶対位置に変換するために `baseOffset` を加算します。

**ステップ 3: ツリーナビゲーションの初期化**

- 上記で計算された `blockOffset` を使用して、ブロックのバイナリツリー構造のルートから探索を開始します

**ステップ 4: バイナリツリーのナビゲーション**
ツリーの各レベルに対して（ビット位置 8, 4, 2, 1 を反復）:

**ステップ 4a: ノードディスクリプタの読み取り**

- 現在のノードの制御値をデコードします。ナビゲーションフラグと子オフセット情報が含まれます
- 左右の子ノードの存在を示すフラグを抽出します
- 右の子ノードへの相対オフセットを抽出します（存在する場合）

**ステップ 4b: ナビゲーション方向の決定**

- 現在のビット位置をターゲットインデックスに対してテストします
- ターゲットインデックスでビットが設定されている場合、右の子にナビゲートを試みます
- ターゲットインデックスでビットがクリアされている場合、左の子にナビゲートを試みます

**ステップ 4c: ナビゲーションパスの追跡**

- 目的の子が存在する場合（適切なフラグで示される）、現在の位置を更新します
- 右の子ナビゲーションの場合、エンコードされたオフセットを現在の位置に加算します
- 左の子ナビゲーションの場合、現在のノードの直後の位置に移動します
- ナビゲーションが成功した場合、次のビットレベルに進みます

**ステップ 5: 要素位置の返却**

- 探索が成功した場合、格納されたデータを指す最終オフセット位置を返します。
- 探索が成功しない場合（子ノードが存在しない）、要素は配列内に見つからず、失敗ステータスを返します。

## ハッシュテーブル

概念的に、ネイティブハッシュテーブルは、テーブルの次元を記述するヘッダー、キーのハッシュ値をバケット (bucket) にマッピングするテーブル、および値を格納するバケットのリストで構成されます。これら 3 つのものはフォーマット内で連続して格納されます。

ルックアップを高速にするために、バケット数は常に 2 のべき乗です。テーブルは単純に `(1 + バケット数)` セルのシーケンスです。最初の `(バケット数)` セルについては、ネイティブハッシュテーブル全体の先頭からのバケットリストのオフセットを格納します。最後のセルはバケットの終端へのオフセットを格納します。エントリは、`2^x = (バケット数)` として、最下位バイトにないハッシュの `x` 個の最下位ビットを使用してバケットにマッピングされます。たとえば、`x=2` の場合、32 ビットハッシュの以下の `X` でマークされたビットが使用されます: `b00000000_00000000_000000XX_00000000`。

物理的には、ヘッダーは単一バイトです。最上位 6 ビットは、バケット数の 2 を底とする対数を格納するために使用されます。残りの 2 ビットは、以下で説明するエントリサイズの格納に使用されます:

バケットリストへのオフセットは多くの場合小さい数値であるため、テーブルセルのサイズは可変です。1 バイト、2 バイト、または 4 バイトのいずれかです。3 つのケースは 2 ビットで記述されます。`00` は 1 バイト、`01` は 2 バイト、`10` は 4 バイトを意味します。

残りのデータはエントリです。エントリには、ハッシュコードの最下位バイトのみと、ハッシュテーブルに格納された実際のオブジェクトへのオフセットが含まれます。エントリはハッシュコードでソートされています。

ルックアップを実行するには、まずヘッダーを読み、ハッシュコードを計算し、バケット数を使用してハッシュコードからマスクするビット数を決定し、適切なポインタサイズを使用してテーブル内で検索し、バケットリストを見つけ、次のバケットリスト（またはテーブルの終端）を見つけて停止位置を知り、そのリスト内のエントリを検索します。ヒットした場合はオブジェクトが見つかり、そうでなければミスです。

すべての値を列挙するには、最初のエントリからハッシュテーブルの終端まで単純にウォークします。

これを実際に確認するために、以下のオブジェクトをネイティブハッシュテーブルに配置した例を見てみましょう。

| オブジェクト | ハッシュコード |
| :----------- | :------------: |
| P            |     0x1231     |
| Q            |     0x1232     |
| R            |     0x1234     |
| S            |     0x1338     |

バケット数を 2 に決定した場合、9 番目のビットのみがテーブルのインデックスに使用され、ハッシュテーブル全体は以下のようになります:

| パート    | オフセット | 内容 | 意味                                                                                                                                       |
| :-------- | :--------- | :--: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ヘッダー  | 0          | 0x04 | これはヘッダーで、最下位ビットが `00` のため、テーブルセルは 1 バイトです。最上位 6 ビットは 1 を表し、バケット数は 2^1 = 2 を意味します。 |
| テーブル  | 1          | 0x04 | これは符号なし整数 4 の表現で、ハッシュコード `0` に対応するバケットのオフセットに対応します。                                             |
| テーブル  | 2          | 0x0A | これは符号なし整数 10 の表現で、ハッシュコード `1` に対応するバケットのオフセットに対応します。                                            |
| テーブル  | 3          | 0x0C | これは符号なし整数 12 の表現で、ハッシュテーブル全体の終端のオフセットに対応します。                                                       |
| バケット1 | 4          | 0x31 | これは P のハッシュコードの最下位バイトです                                                                                                |
| バケット1 | 5          |  P   | これはオブジェクト P へのオフセットです                                                                                                    |
| バケット1 | 6          | 0x32 | これは Q のハッシュコードの最下位バイトです                                                                                                |
| バケット1 | 7          |  Q   | これはオブジェクト Q へのオフセットです                                                                                                    |
| バケット1 | 8          | 0x34 | これは R のハッシュコードの最下位バイトです                                                                                                |
| バケット1 | 9          |  R   | これはオブジェクト R へのオフセットです                                                                                                    |
| バケット2 | 10         | 0x38 | これは S のハッシュコードの最下位バイトです                                                                                                |
| バケット2 | 11         |  S   | これはオブジェクト S へのオフセットです                                                                                                    |

# ヘルパー呼び出し

READYTORUN_FIXUP_Helper がサポートするヘルパー呼び出しの一覧:

```C++
enum ReadyToRunHelper
{
    READYTORUN_HELPER_Invalid                   = 0x00,

    // Not a real helper - handle to current module passed to delay load helpers.
    READYTORUN_HELPER_Module                    = 0x01,
    READYTORUN_HELPER_GSCookie                  = 0x02,

    //
    // Delay load helpers
    //

    // All delay load helpers use custom calling convention:
    // - scratch register - address of indirection cell. 0 = address is inferred from callsite.
    // - stack - section index, module handle
    READYTORUN_HELPER_DelayLoad_MethodCall      = 0x08,

    READYTORUN_HELPER_DelayLoad_Helper          = 0x10,
    READYTORUN_HELPER_DelayLoad_Helper_Obj      = 0x11,
    READYTORUN_HELPER_DelayLoad_Helper_ObjObj   = 0x12,

    // JIT helpers

    // Exception handling helpers
    READYTORUN_HELPER_Throw                     = 0x20,
    READYTORUN_HELPER_Rethrow                   = 0x21,
    READYTORUN_HELPER_Overflow                  = 0x22,
    READYTORUN_HELPER_RngChkFail                = 0x23,
    READYTORUN_HELPER_FailFast                  = 0x24,
    READYTORUN_HELPER_ThrowNullRef              = 0x25,
    READYTORUN_HELPER_ThrowDivZero              = 0x26,
    READYTORUN_HELPER_ThrowExact                = 0x27,

    // Write barriers
    READYTORUN_HELPER_WriteBarrier              = 0x30,
    READYTORUN_HELPER_CheckedWriteBarrier       = 0x31,
    READYTORUN_HELPER_ByRefWriteBarrier         = 0x32,

    // Array helpers
    READYTORUN_HELPER_Stelem_Ref                = 0x38,
    READYTORUN_HELPER_Ldelema_Ref               = 0x39,

    READYTORUN_HELPER_MemSet                    = 0x40,
    READYTORUN_HELPER_MemCpy                    = 0x41,

    // Get string handle lazily
    READYTORUN_HELPER_GetString                 = 0x50, // Unused since READYTORUN_MAJOR_VERSION 17.0

    // Used by /Tuning for Profile optimizations
    READYTORUN_HELPER_LogMethodEnter            = 0x51, // Unused since READYTORUN_MAJOR_VERSION 10.0

    // Reflection helpers
    READYTORUN_HELPER_GetRuntimeTypeHandle      = 0x54,
    READYTORUN_HELPER_GetRuntimeMethodHandle    = 0x55,
    READYTORUN_HELPER_GetRuntimeFieldHandle     = 0x56,

    READYTORUN_HELPER_Box                       = 0x58,
    READYTORUN_HELPER_Box_Nullable              = 0x59,
    READYTORUN_HELPER_Unbox                     = 0x5A,
    READYTORUN_HELPER_Unbox_Nullable            = 0x5B,
    READYTORUN_HELPER_NewMultiDimArr            = 0x5C,

    // Helpers used with generic handle lookup cases
    READYTORUN_HELPER_NewObject                 = 0x60,
    READYTORUN_HELPER_NewArray                  = 0x61,
    READYTORUN_HELPER_CheckCastAny              = 0x62,
    READYTORUN_HELPER_CheckInstanceAny          = 0x63,
    READYTORUN_HELPER_GenericGcStaticBase       = 0x64,
    READYTORUN_HELPER_GenericNonGcStaticBase    = 0x65,
    READYTORUN_HELPER_GenericGcTlsBase          = 0x66,
    READYTORUN_HELPER_GenericNonGcTlsBase       = 0x67,
    READYTORUN_HELPER_VirtualFuncPtr            = 0x68,
    READYTORUN_HELPER_IsInstanceOfException     = 0x69,
    READYTORUN_HELPER_NewMaybeFrozenArray       = 0x6A,
    READYTORUN_HELPER_NewMaybeFrozenObject      = 0x6B,

    // Long mul/div/shift ops
    READYTORUN_HELPER_LMul                      = 0xC0,
    READYTORUN_HELPER_LMulOfv                   = 0xC1,
    READYTORUN_HELPER_ULMulOvf                  = 0xC2,
    READYTORUN_HELPER_LDiv                      = 0xC3,
    READYTORUN_HELPER_LMod                      = 0xC4,
    READYTORUN_HELPER_ULDiv                     = 0xC5,
    READYTORUN_HELPER_ULMod                     = 0xC6,
    READYTORUN_HELPER_LLsh                      = 0xC7,
    READYTORUN_HELPER_LRsh                      = 0xC8,
    READYTORUN_HELPER_LRsz                      = 0xC9,
    READYTORUN_HELPER_Lng2Dbl                   = 0xCA,
    READYTORUN_HELPER_ULng2Dbl                  = 0xCB,

    // 32-bit division helpers
    READYTORUN_HELPER_Div                       = 0xCC,
    READYTORUN_HELPER_Mod                       = 0xCD,
    READYTORUN_HELPER_UDiv                      = 0xCE,
    READYTORUN_HELPER_UMod                      = 0xCF,

    // Floating point conversions
    READYTORUN_HELPER_Dbl2Int                   = 0xD0, // Unused since READYTORUN_MAJOR_VERSION 15.0
    READYTORUN_HELPER_Dbl2IntOvf                = 0xD1,
    READYTORUN_HELPER_Dbl2Lng                   = 0xD2,
    READYTORUN_HELPER_Dbl2LngOvf                = 0xD3,
    READYTORUN_HELPER_Dbl2UInt                  = 0xD4, // Unused since READYTORUN_MAJOR_VERSION 15.0
    READYTORUN_HELPER_Dbl2UIntOvf               = 0xD5,
    READYTORUN_HELPER_Dbl2ULng                  = 0xD6,
    READYTORUN_HELPER_Dbl2ULngOvf               = 0xD7,
    READYTORUN_HELPER_Lng2Flt                   = 0xD8,
    READYTORUN_HELPER_ULng2Flt                  = 0xD9,

    // Floating point ops
    READYTORUN_HELPER_DblRem                    = 0xE0,
    READYTORUN_HELPER_FltRem                    = 0xE1,
    READYTORUN_HELPER_DblRound                  = 0xE2, // Unused since READYTORUN_MAJOR_VERSION 10.0
    READYTORUN_HELPER_FltRound                  = 0xE3, // Unused since READYTORUN_MAJOR_VERSION 10.0

#ifndef _TARGET_X86_
    // Personality routines
    READYTORUN_HELPER_PersonalityRoutine        = 0xF0,
    READYTORUN_HELPER_PersonalityRoutineFilterFunclet = 0xF1,
#endif

    //
    // Deprecated/legacy
    //

    // JIT32 x86-specific write barriers
    READYTORUN_HELPER_WriteBarrier_EAX          = 0x100,
    READYTORUN_HELPER_WriteBarrier_EBX          = 0x101,
    READYTORUN_HELPER_WriteBarrier_ECX          = 0x102,
    READYTORUN_HELPER_WriteBarrier_ESI          = 0x103,
    READYTORUN_HELPER_WriteBarrier_EDI          = 0x104,
    READYTORUN_HELPER_WriteBarrier_EBP          = 0x105,
    READYTORUN_HELPER_CheckedWriteBarrier_EAX   = 0x106,
    READYTORUN_HELPER_CheckedWriteBarrier_EBX   = 0x107,
    READYTORUN_HELPER_CheckedWriteBarrier_ECX   = 0x108,
    READYTORUN_HELPER_CheckedWriteBarrier_ESI   = 0x109,
    READYTORUN_HELPER_CheckedWriteBarrier_EDI   = 0x10A,
    READYTORUN_HELPER_CheckedWriteBarrier_EBP   = 0x10B,

    // JIT32 x86-specific exception handling
    READYTORUN_HELPER_EndCatch                  = 0x110,
};
```

# 参考文献

[ECMA-335](https://www.ecma-international.org/publications-and-standards/standards/ecma-335)
