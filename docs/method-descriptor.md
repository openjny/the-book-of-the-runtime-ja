# メソッドディスクリプタ (Method Descriptor)

::: info 原文
この章の原文は [Method Descriptor](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/method-descriptor.md) です。
:::

著者: Jan Kotas ([@jkotas](https://github.com/jkotas)) - 2006

## はじめに

MethodDesc（メソッドディスクリプタ）は、マネージドメソッドのランタイム内部表現です。以下のような複数の目的を果たします：

- ランタイム全体で使用可能な一意のメソッドハンドルを提供します。通常のメソッドにおいて、MethodDesc は &lt;モジュール, メタデータトークン, インスタンス化&gt; の三つ組に対する一意のハンドルです。
- メタデータから計算するとコストが高い、頻繁に使用される情報をキャッシュします（例：メソッドが静的かどうか）。
- メソッドのランタイム状態を保持します（例：メソッドのコードが既に生成されたかどうか）。
- メソッドのエントリポイントを所有します。

::: tip 💡 初心者向け補足
MethodDesc は、C# で定義したメソッド（例えば `public void MyMethod()`）に対して、.NET ランタイムが内部的に作成するデータ構造です。Java の JVM における「メソッドエリア」に相当する概念で、メソッドに関するあらゆる情報（名前、引数の型、JIT コンパイル済みのネイティブコードへのポインタなど）を一箇所にまとめて管理します。プログラム中のすべてのメソッドに対して 1 つずつ存在します。
:::

## 設計目標と非目標

### 目標

**パフォーマンス:** MethodDesc の設計は、すべてのメソッドに 1 つずつ存在するため、サイズの最適化が重点的に行われています。たとえば、通常の非ジェネリックメソッドの MethodDesc は、現在の設計では 8 バイトです。

### 非目標

**情報の豊富さ:** MethodDesc はメソッドに関するすべての情報をキャッシュするわけではありません。使用頻度の低い情報（例：メソッドシグネチャ）については、基礎となるメタデータにアクセスする必要があることが前提とされています。

## MethodDesc の設計

## MethodDesc の種類

MethodDesc には複数の種類があります：

**IL**

通常の IL メソッドに使用されます。

**Instantiated（インスタンス化）**

ジェネリックインスタンス化を持つ IL メソッドや、メソッドテーブルに事前割り当てされたスロットを持たない IL メソッドに使用されます。

**FCall**

アンマネージドコードで実装された内部メソッドです。これは [MethodImplAttribute(MethodImplOptions.InternalCall) 属性が付与されたメソッド](./corelib)、デリゲートコンストラクタ、および tlbimp コンストラクタです。

**PInvoke**

P/Invoke メソッドです。DllImport 属性が付与されたメソッドがこれに該当します。

**EEImpl**

ランタイムによって実装が提供されるデリゲートメソッド（Invoke、BeginInvoke、EndInvoke）です。[ECMA 335 Partition II - Delegates](https://github.com/dotnet/runtime/blob/main/project/dotnet-standards.md) を参照してください。

**Array（配列）**

ランタイムによって実装が提供される配列メソッド（Get、Set、Address）です。[ECMA Partition II – Arrays](https://github.com/dotnet/runtime/blob/main/project/dotnet-standards.md) を参照してください。

**ComInterop**

COM インターフェースメソッドです。非ジェネリックインターフェースはデフォルトで COM 相互運用に使用できるため、この種類は通常すべてのインターフェースメソッドに使用されます。

**Dynamic（動的）**

基礎となるメタデータを持たない、動的に作成されたメソッドです。Stub-as-IL や LKG（軽量コード生成、Light-weight Code Generation）によって生成されます。

::: tip 💡 初心者向け補足
これらの種類は、メソッドがどのように定義・実装されているかによって分類されます。最も一般的なのは **IL** で、C# などで書いた通常のメソッドはすべてこれに該当します。**PInvoke** は Windows API のようなネイティブ DLL の関数を呼び出す際に使われ、**FCall** は `string.Length` のようなランタイム自体がネイティブコードで実装している高速な内部メソッドに使われます。Java でいえば、**FCall** は JNI ネイティブメソッドに近い概念です。
:::

## 代替実装

C++ では、仮想メソッドと継承を使って様々な種類の MethodDesc を実装するのが自然な方法です。しかし、仮想メソッドは各 MethodDesc に vtable ポインタを追加してしまい、貴重な領域を大量に浪費します。vtable ポインタは x86 では 4 バイトを占有します。代わりに、仮想化は MethodDesc の種類に基づくスイッチ分岐で実装されており、種類は 3 ビットに収まります。たとえば：

```c++
DWORD MethodDesc::GetAttrs()
{
    if (IsArray())
        return ((ArrayMethodDesc*)this)->GetAttrs();

    if (IsDynamic())
        return ((DynamicMethodDesc*)this)->GetAttrs();

    return GetMDImport()->GetMethodDefProps(GetMemberDef());
}
```

::: tip 💡 初心者向け補足
通常の C++ 設計では、`MethodDesc` を基底クラスとし、`ArrayMethodDesc` や `DynamicMethodDesc` などを派生クラスとして仮想関数（`virtual`）で多態性を実現します。しかし、仮想関数を使うと各オブジェクトに vtable ポインタ（x86 で 4 バイト、x64 で 8 バイト）が追加されます。MethodDesc はすべてのメソッドに 1 つずつ存在するため、この数バイトの追加が全体で大きなメモリ消費になります。そこで、種類を 3 ビットのフラグとして持ち、`if` 文で分岐する方式を採用してメモリを節約しています。
:::

## メソッドスロット (Method Slots)

各 MethodDesc はスロットを持ち、メソッドの現在のエントリポイントが格納されています。スロットは、抽象メソッドのように一度も実行されないメソッドも含め、すべてのメソッドに存在しなければなりません。ランタイム内の複数の箇所が、エントリポイントと MethodDesc の間のマッピングに依存しています。

各 MethodDesc は論理的にはエントリポイントを持ちますが、MethodDesc の作成時にこれらを積極的に割り当てることはしません。不変条件として、メソッドが実行すべきメソッドとして識別されるか、仮想オーバーライドで使用される場合にのみ、エントリポイントを割り当てます。

スロットは MethodTable 内または MethodDesc 自体のいずれかに格納されます。スロットの格納場所は、MethodDesc の `mdcHasNonVtableSlot` ビットによって決定されます。

仮想メソッドやジェネリック型のメソッドなど、スロットインデックスによる効率的な検索が必要なメソッドの場合、スロットは MethodTable に格納されます。この場合、MethodDesc にはスロットインデックスが含まれており、エントリポイントの高速な検索が可能です。

それ以外の場合、スロットは MethodDesc 自体の一部として格納されます。この方式はデータの局所性を向上させ、ワーキングセットを節約します。また、Edit & Continue で追加されたメソッド、ジェネリックメソッドのインスタンス化、[動的メソッド](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Private.CoreLib/src/System/Reflection/Emit/DynamicMethod.cs)など、動的に作成される MethodDesc に対しては、MethodTable にスロットを事前に割り当てることがそもそも不可能な場合もあります。

## MethodDesc チャンク (MethodDesc Chunks)

MethodDesc は領域を節約するためにチャンク単位で割り当てられます。複数の MethodDesc は同一の MethodTable とメタデータトークンの上位ビットを共有する傾向があります。MethodDescChunk は、共通情報を先頭にまとめ、その後ろに複数の MethodDesc の配列を配置することで構成されます。各 MethodDesc は配列内での自身のインデックスのみを保持します。

![図 1](./images/methoddesc-fig1.png)

図 1 MethodDescChunk と MethodTable

::: tip 💡 初心者向け補足
チャンク（まとまり）による割り当ては、メモリ効率を高めるための最適化手法です。たとえば、あるクラスに 10 個のメソッドがある場合、10 個の MethodDesc がそれぞれ独立してクラス情報を持つのではなく、クラス情報を 1 箇所（MethodDescChunk の先頭）にまとめ、各 MethodDesc はそのチャンク内でのインデックス番号だけを持ちます。これは、同じマンション内の各部屋がそれぞれ住所を完全に保持する代わりに、部屋番号だけを持つようなものです。
:::

## デバッグ

以下の SOS コマンドが MethodDesc のデバッグに役立ちます：

- **DumpMD** – MethodDesc の内容をダンプします：

      !DumpMD 00912fd8
      Method Name: My.Main()
      Class: 009111ec
      MethodTable: 00912fe8md
      Token: 06000001
      Module: 00912c14
      IsJitted: yes
      CodeAddr: 00ca0070

- **IP2MD** – 指定されたコードアドレスから MethodDesc を検索します：

      !ip2md 00ca007c
      MethodDesc: 00912fd8
      Method Name: My.Main()
      Class: 009111ec
      MethodTable: 00912fe8md
      Token: 06000001
      Module: 00912c14
      IsJitted: yes
      CodeAddr: 00ca0070

- **Name2EE** – 指定されたメソッド名から MethodDesc を検索します：

      !name2ee hello.exe My.Main
      Module: 00912c14 (hello.exe)
      Token: 0x06000001
      MethodDesc: 00912fd8
      Name: My.Main()
      JITTED Code Address: 00ca0070

- **Token2EE** – 指定されたトークンから MethodDesc を検索します（特殊な名前のメソッドの MethodDesc を見つけるのに便利です）：

      !token2ee hello.exe 0x06000001
      Module: 00912c14 (hello.exe)
      Token: 0x06000001
      MethodDesc: 00912fd8
      Name: My.Main()
      JITTED Code Address: 00ca0070

- **DumpMT -MD** – 指定された MethodTable 内のすべての MethodDesc をダンプします：

      !DumpMT -MD 0x00912fe8
      ...
      MethodDesc Table
         Entry MethodDesc      JIT Name
      79354bec   7913bd48   PreJIT System.Object.ToString()
      793539c0   7913bd50   PreJIT System.Object.Equals(System.Object)
      793539b0   7913bd68   PreJIT System.Object.GetHashCode()
      7934a4c0   7913bd70   PreJIT System.Object.Finalize()
      00ca0070   00912fd8      JIT My.Main()
      0091303c   00912fe0     NONE My..ctor()

デバッグビルドでは、MethodDesc にメソッドの名前とシグネチャのフィールドが含まれます。これは、ランタイムの状態がひどく破損して SOS 拡張が機能しない場合のデバッグに役立ちます。

## プリコード (Precode)

プリコード (Precode) は、一時的なエントリポイントの実装と、スタブの効率的なラッパーとして使用される小さなコード断片です。プリコードは、これら 2 つのケースにおいて可能な限り効率的なコードを生成するニッチなコードジェネレータです。理想的な世界では、ランタイムが動的に生成するすべてのネイティブコードは JIT によって生成されるべきです。しかし、これら 2 つのシナリオの特殊な要件を考えると、それは実現可能ではありません。x86 における基本的なプリコードは以下のようになります：

    mov eax,pMethodDesc // MethodDesc をスクラッチレジスタにロード
    jmp target          // ターゲットにジャンプ

**効率的なスタブラッパー:** 特定のメソッド（例：P/Invoke、デリゲート呼び出し、多次元配列のセッターやゲッター）の実装はランタイムによって提供され、通常は手書きのアセンブリスタブとして実装されます。プリコードは、スタブを複数の呼び出し元で多重化するための、領域効率の良いラッパーを提供します。

スタブのワーカーコードは、MethodDesc にマッピング可能で、スタブのワーカーコードにジャンプするプリコード断片によってラップされます。これにより、スタブのワーカーコードを複数のメソッド間で共有できます。これは P/Invoke マーシャリングスタブの実装に使用される重要な最適化です。また、MethodDesc とエントリポイントの間に 1 対 1 のマッピングを作成し、シンプルで効率的な低レベルシステムを確立します。

**一時的なエントリポイント (Temporary Entry Points):** メソッドは JIT コンパイルされる前にエントリポイントを提供する必要があります。これにより、JIT コンパイル済みのコードがそれらを呼び出すためのアドレスを持てます。これらの一時的なエントリポイントはプリコードによって提供されます。これはスタブラッパーの一形態です。

この手法は JIT コンパイルへの遅延的なアプローチであり、空間と時間の両方においてパフォーマンスの最適化を提供します。そうでなければ、メソッドの推移的閉包（あるメソッドが呼び出すすべてのメソッド、さらにそれらが呼び出すメソッドの全体）を、実行前に JIT コンパイルする必要があるでしょう。これは無駄です。なぜなら、JIT コンパイルが必要なのは、実際に実行されるコード分岐（例：if 文）の依存先だけだからです。

各一時的エントリポイントは、典型的なメソッド本体よりもはるかに小さくなっています。数が多いため、パフォーマンスを犠牲にしてでも小さくする必要があります。一時的エントリポイントは、メソッドの実際のコードが生成される前に一度だけ実行されます。

一時的エントリポイントのターゲットは PreStub であり、これはメソッドの JIT コンパイルをトリガーする特殊な種類のスタブです。PreStub は一時的エントリポイントを安定エントリポイント (stable entry point) にアトミックに置き換えます。安定エントリポイントはメソッドの存続期間を通じて一定でなければなりません。この不変条件は、メソッドスロットが常にロックなしでアクセスされるため、スレッドセーフティを保証するために必要です。

**安定エントリポイント (stable entry point)** は、ネイティブコードまたはプリコードのいずれかです。**ネイティブコード (native code)** は、JIT コンパイルされたコードまたは NGen イメージに保存されたコードです。実際にはネイティブコードを意味しているのに、JIT コンパイルされたコードと言及することがよくあります。

![図 2](./images/methoddesc-fig2.png)

図 2 エントリポイントの状態遷移図

メソッドは、実際のメソッド本体の実行前に作業を行う必要がある場合、ネイティブコードとプリコードの両方を持つことがあります。この状況は通常、NGen イメージのフィックスアップで発生します。この場合、ネイティブコードはオプションの MethodDesc スロットになります。これは、メソッドのネイティブコードを安価で統一的な方法で検索するために必要です。

![図 3](./images/methoddesc-fig3.png)

図 3 プリコード、スタブ、ネイティブコードの最も複雑なケース

::: tip 💡 初心者向け補足
プリコードの仕組みを日常的な例えで説明すると、「電話の転送」に似ています。最初、メソッドを呼び出すと一時的エントリポイント（転送先）に接続され、そこから PreStub（受付係）に繋がります。PreStub は JIT コンパイラにメソッドのネイティブコードを生成させ、以降の呼び出しはそのネイティブコードに直接繋がるようになります。これにより、実際に呼び出されるメソッドだけが JIT コンパイルされる「遅延コンパイル」が実現され、起動時間とメモリ使用量の両方が最適化されます。
:::

## シングルコーラブル vs マルチコーラブルエントリポイント

メソッドを呼び出すためにはエントリポイントが必要です。MethodDesc は、与えられた状況に応じて最も効率的なエントリポイントを取得するロジックをカプセル化したメソッドを公開しています。重要な違いは、エントリポイントがメソッドの呼び出しに 1 回だけ使用されるか、複数回使用されるかです。

たとえば、一時的エントリポイントを使ってメソッドを複数回呼び出すのは良くない考えです。毎回 PreStub を経由してしまうからです。一方、一時的エントリポイントを使ってメソッドを 1 回だけ呼び出す場合は問題ありません。

MethodDesc から呼び出し可能なエントリポイントを取得するメソッドは以下の通りです：

- `MethodDesc::GetSingleCallableAddrOfCode`
- `MethodDesc::GetMultiCallableAddrOfCode`
- `MethodDesc::TryGetMultiCallableAddrOfCode`
- `MethodDesc::GetSingleCallableAddrOfVirtualizedCode`
- `MethodDesc::GetMultiCallableAddrOfVirtualizedCode`

## プリコードの種類

プリコードには複数の特殊な種類があります。

プリコードの種類は命令シーケンスから安価に計算できる必要があります。x86 および x64 では、プリコードの種類は一定のオフセット位置にあるバイトを読み取ることで判別されます。当然ながら、これは様々なプリコードの種類を実装するために使用される命令シーケンスに制約を課します。

**StubPrecode**

StubPrecode は基本的なプリコードの種類です。MethodDesc をスクラッチレジスタ<sup>2</sup>にロードし、ジャンプします。プリコードが機能するためには、これを実装する必要があります。他の特殊なプリコードの種類が利用できない場合のフォールバックとして使用されます。

他のすべてのプリコードの種類は、プラットフォーム固有のファイルが HAS_XXX_PRECODE 定義によって有効にするオプションの最適化です。

StubPrecode は x86 では以下のようになります：

    mov eax,pMethodDesc
    mov ebp,ebp // プリコードの種類を示すダミー命令
    jmp target

"target" は最初は PreStub を指しています。最終ターゲットを指すようにパッチされます。最終ターゲット（スタブまたはネイティブコード）は、eax 内の MethodDesc を使用する場合としない場合があります。スタブはよくそれを使用しますが、ネイティブコードは使用しません。

**FixupPrecode**

FixupPrecode は、最終ターゲットがスクラッチレジスタ<sup>2</sup>内の MethodDesc を必要としない場合に使用されます。FixupPrecode は MethodDesc のスクラッチレジスタへのロードを省略することで、数サイクルを節約します。

使用されるスタブのほとんどはより効率的な形式であり、現在、特殊な形式の Precode が不要な場合は相互運用メソッド以外のすべてにこの形式を使用できます。

FixupPrecode の初期状態（x86）：

    call PrecodeFixupThunk // この呼び出しは戻りません。リターンアドレスをポップし、
                           // それを使って下の pMethodDesc を取得し、
                           // JIT コンパイルが必要なメソッドを見つけます
    pop esi // プリコードの種類を示すダミー命令
    dword pMethodDesc

最終ターゲットにパッチされた後：

    jmp target
    pop edi
    dword pMethodDesc

<sup>2</sup> MethodDesc をスクラッチレジスタに渡すことは、**MethodDesc 呼び出し規約 (MethodDesc Calling Convention)** と呼ばれることがあります。

**ThisPtrRetBufPrecode**

ThisPtrRetBufPrecode は、値型を返すオープンインスタンスデリゲートにおいて、リターンバッファと this ポインタを入れ替えるために使用されます。MyValueType Bar(Foo x) の呼び出し規約を MyValueType Foo::Bar() の呼び出し規約に変換するために使用されます。

このプリコードは常に実際のメソッドエントリポイントのラッパーとしてオンデマンドで割り当てられ、テーブル (FuncPtrStubs) に格納されます。

ThisPtrRetBufPrecode は以下のようになります：

    mov eax,ecx
    mov ecx,edx
    mov edx,eax
    nop
    jmp entrypoint
    dw pMethodDesc

**PInvokeImportPrecode**

PInvokeImportPrecode は、アンマネージド P/Invoke ターゲットの遅延バインディング (lazy binding) に使用されます。このプリコードは利便性のため、およびプラットフォーム固有の配管コードを削減するために使用されます。

各 PInvokeMethodDesc は通常のプリコードに加えて PInvokeImportPrecode を持ちます。

PInvokeImportPrecode は x86 では以下のようになります：

    mov eax,pMethodDesc
    mov eax,eax // プリコードの種類を示すダミー命令
    jmp PInvokeImportThunk // pMethodDesc の P/Invoke ターゲットを遅延ロード
