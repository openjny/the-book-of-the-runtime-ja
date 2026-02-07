# System.Private.CoreLib とランタイムへの呼び出し

::: info 原文
この章の原文は [System.Private.CoreLib and calling into the runtime](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/corelib.md) です。
:::

## はじめに

`System.Private.CoreLib.dll` は、型システム (type system) のコア部分と、.NET Framework の基本クラスライブラリ (Base Class Library) の大部分を定義するためのアセンブリ (assembly) です。もともと .NET Core では `mscorlib` という名前でしたが、コードやドキュメントの多くの場所では依然として `mscorlib` と呼ばれています。この文書では `System.Private.CoreLib` または CoreLib を使用するよう努めます。基本データ型 (base data type) はこのアセンブリに存在し、CLR と密結合 (tight coupling) しています。ここでは、CoreLib がなぜ特別なのか、そして QCall メソッドと FCall メソッドを使ってマネージドコード (managed code) から CLR を呼び出す方法の基本について学びます。また、CLR 内部からマネージドコードを呼び出す方法についても説明します。

::: tip 💡 初心者向け補足
`System.Private.CoreLib.dll` は、.NET ランタイムで最も基本的なアセンブリです。Java で例えると `rt.jar`（Java Runtime Library）に相当し、`Object`、`String`、`Int32` といったすべてのプログラムが依存する基本的な型がここに定義されています。このアセンブリはランタイム（CLR）と非常に密接に連携しており、通常のライブラリとは異なる特別な扱いを受けます。
:::

## 依存関係

CoreLib は `Object`、`Int32`、`String` といった基本データ型を定義しているため、他のマネージドアセンブリ (managed assembly) に依存することができません。しかし、CoreLib と CLR の間には強い依存関係があります。CoreLib の多くの型はネイティブコード (native code) からアクセスする必要があるため、多くのマネージド型のレイアウト (layout) はマネージドコードと CLR 内部のネイティブコードの両方で定義されています。また、一部のフィールドは Debug ビルド、Checked ビルド、または Release ビルドでのみ定義される場合があるため、通常 CoreLib はビルドの種類ごとに個別にコンパイルする必要があります。

`System.Private.CoreLib.dll` は 64 ビットと 32 ビットで別々にビルドされ、公開するいくつかのパブリック定数はビット数によって異なります。`IntPtr.Size` などのこれらの定数を使用することで、CoreLib より上位のほとんどのライブラリは 32 ビットと 64 ビットで別々にビルドする必要がなくなります。

## `System.Private.CoreLib` が特別である理由

CoreLib には多くのユニークな特性があり、その多くは CLR との密結合に起因しています。

- CoreLib は、基本データ型（`Object`、`Int32`、`String` など）のような、CLR の仮想オブジェクトシステム (Virtual Object System) を実装するために必要なコア型を定義します。
- CLR は起動時に特定のシステム型をロードするために CoreLib をロードしなければなりません。
- レイアウトの問題により、プロセス内で一度にロードできる CoreLib は 1 つだけです。複数の CoreLib をロードするには、CLR と CoreLib の間の動作契約 (contract of behavior)、FCall メソッド、データ型レイアウトを形式化し、その契約をバージョン間で比較的安定に保つ必要があります。
- CoreLib の型はネイティブ相互運用 (native interop) で頻繁に使用され、マネージド例外 (managed exception) はネイティブのエラーコードやフォーマットに正しくマッピングされる必要があります。
- CLR の複数の JIT コンパイラ (JIT compiler) は、パフォーマンス上の理由から CoreLib 内の特定のメソッドの小さなグループを特別扱いすることがあります。メソッドの最適化による除去（`Math.Cos(double)` など）や、特殊な呼び出し方法（`Array.Length` や、現在のスレッドを取得するための `StringBuilder` の一部の実装詳細など）の両方が含まれます。
- CoreLib は、主に基盤となるオペレーティングシステムや、時にはプラットフォーム適応レイヤー (platform adaptation layer) に対して、必要に応じて P/Invoke を通じてネイティブコードを呼び出す必要があります。
- CoreLib は、ガベージコレクション (garbage collection) のトリガー、クラスのロード、型システムとの複雑なやり取りなど、CLR 固有の機能を公開するために CLR を呼び出す必要があります。これには、マネージドコードと CLR 内の「手動管理された」ネイティブコードとの間のブリッジ (bridge) が必要です。
- CLR は、マネージドメソッドを呼び出したり、マネージドコードでのみ実装されている特定の機能にアクセスするために、マネージドコードを呼び出す必要があります。

::: tip 💡 初心者向け補足
「密結合 (tight coupling)」とは、2 つのコンポーネントが互いに強く依存している状態を指します。通常のライブラリは実行時に動的にロードされ、ランタイムとは独立していますが、CoreLib はランタイム自体の一部のように機能します。たとえば、`Object` クラスの内部レイアウト（フィールドの並び順やサイズ）は CLR の C++ コード側でも定義されていて、両者が完全に一致していなければなりません。これは Java の `rt.jar` と JVM の関係に似ています。
:::

## マネージドコードと CLR コードの間のインターフェース

改めて述べると、CoreLib のマネージドコードには以下のニーズがあります：

- マネージドコードと CLR 内の「手動管理された」コードの両方で、一部のマネージドデータ構造のフィールドにアクセスする機能。
- マネージドコードから CLR を呼び出せること。
- CLR からマネージドコードを呼び出せること。

これらを実装するには、CLR がネイティブコード内でマネージドオブジェクトのレイアウトを指定し、オプションで検証する方法、ネイティブコードを呼び出すためのマネージド側の仕組み、そしてマネージドコードを呼び出すためのネイティブ側の仕組みが必要です。

ネイティブコードを呼び出すためのマネージド側の仕組みは、`String` のコンストラクタが使用する特殊なマネージド呼び出し規約 (calling convention) もサポートする必要があります。この規約では、コンストラクタがオブジェクトに使用するメモリを自分でアロケートします（GC がメモリをアロケートした後にコンストラクタが呼ばれるという一般的な規約とは異なります）。

CLR は内部的に [`mscorlib` バインダー (binder)](https://github.com/dotnet/runtime/blob/main/src/coreclr/vm/binder.cpp) を提供しており、アンマネージド型 (unmanaged type) とフィールドからマネージド型とフィールドへのマッピングを提供します。バインダーはクラスの検索とロードを行い、マネージドメソッドの呼び出しを可能にします。また、マネージドコードとネイティブコードの両方で指定されたレイアウト情報の正当性を確認するための簡単な検証も行います。バインダーは、ロードしようとしているマネージドクラスが mscorlib に存在すること、ロードされていること、フィールドオフセットが正しいことを確認します。異なるシグネチャを持つメソッドのオーバーロード (overload) を区別する機能も必要です。

## マネージドコードからネイティブコードへの呼び出し

マネージドコードから CLR を呼び出すための技術は 2 つあります。FCall は CLR のコードを直接呼び出すことができ、オブジェクトの操作に関して多くの柔軟性を提供しますが、オブジェクト参照を正しく追跡しないと GC ホール (GC hole) を引き起こしやすくなります。QCall も P/Invoke を通じて CLR を呼び出すことができますが、誤った使い方をしてしまう可能性はずっと低くなります。FCall はマネージドコード内で [`MethodImplOptions.InternalCall`](https://learn.microsoft.com/dotnet/api/system.runtime.compilerservices.methodimploptions) ビットが設定された extern メソッドとして識別されます。QCall は通常の P/Invoke と同様に `static extern` メソッドとしてマークされますが、`"QCall"` というライブラリに向けられます。

::: tip 💡 初心者向け補足
FCall と QCall は、.NET ランタイムの「内部 API」を呼び出すための仕組みです。通常のプログラマが直接使うことはありませんが、`String.Length` や `Math.Cos()` といった基本的なメソッドの裏側ではこれらが使われています。Java で例えると、JNI (Java Native Interface) に似た概念ですが、ランタイム内部に特化した仕組みです。P/Invoke は外部の DLL（Windows API など）を呼び出すための公開された仕組みで、JNA に相当します。
:::

### FCall、QCall、P/Invoke、マネージドコードでの実装の選択

まず、できる限りマネージドコードで書くべきだということを忘れないでください。潜在的な GC ホールの問題を回避でき、より良いデバッグ体験が得られ、コードもしばしばシンプルになります。

過去に FCall を書く理由は、一般的に 3 つの陣営に分かれていました：言語機能の不足、より良いパフォーマンス、またはランタイムとの独自のインタラクションの実装です。C# は今では unsafe コードやスタックアロケートバッファ (stack-allocated buffer) を含め、C++ から得られるほぼすべての有用な言語機能を持っており、これにより FCall の最初の 2 つの理由はなくなりました。過去に FCall に大きく依存していた CLR の一部（リフレクション (Reflection)、一部のエンコーディング (Encoding)、String 操作など）をマネージドコードに移植しており、この流れを続ける予定です。

FCall メソッドを定義する唯一の理由がネイティブメソッドを呼び出すことであるなら、P/Invoke を使用してメソッドを直接呼び出すべきです。[P/Invoke](https://learn.microsoft.com/dotnet/api/system.runtime.interopservices.dllimportattribute) はパブリックなネイティブメソッドインターフェースであり、正しい方法で必要なすべてのことを行えるはずです。

それでもランタイム内部に機能を実装する必要がある場合は、ネイティブコードへの遷移の頻度を減らす方法がないか検討してください。一般的なケースをマネージドで書き、まれなコーナーケースでのみネイティブに呼び出すことはできませんか？通常、できるだけ多くをマネージドコードに留めておくのが最善です。

QCall は今後の推奨される仕組みです。FCall を使用するのは「仕方がない」場合のみにすべきです。これは、最適化が重要な一般的な「短いパス (short path)」がある場合に発生します。この短いパスは数百命令以下であり、GC メモリのアロケーション、ロックの取得、例外のスローができません（`GC_NOTRIGGER`、`NOTHROWS`）。その他のすべての状況では、QCall を使用すべきです。

FCall は、最適化が必要な短いコードパスのために特別に設計されました。フレーム (frame) を構築するタイミングを明示的に制御できました。しかし、エラーが発生しやすく、多くの API にとってはその複雑さに見合いません。QCall は本質的に CLR への P/Invoke です。FCall のパフォーマンスが必要な場合は、QCall を作成して [`SuppressGCTransitionAttribute`](https://learn.microsoft.com/dotnet/api/system.runtime.interopservices.suppressgctransitionattribute) でマークすることを検討してください。

その結果、QCall は `SafeHandle` に対して有利なマーシャリング (marshaling) を自動的に提供します。ネイティブメソッドは単に `HANDLE` 型を受け取るだけで、そのメソッド本体の実行中に誰かがハンドルを解放するかどうかを心配せずに使用できます。同等の FCall メソッドでは `SafeHandleHolder` を使用する必要があり、`SafeHandle` を保護する必要があるかもしれません。P/Invoke マーシャラー (marshaler) を活用することで、この追加のプラミングコード (plumbing code) を回避できます。

## QCall の機能的動作

QCall は CoreLib から CLR への通常の P/Invoke と非常に似ています。FCall とは異なり、QCall は通常の P/Invoke と同様にすべての引数をアンマネージド型としてマーシャリングします。QCall は通常の P/Invoke と同様にプリエンプティブ GC モード (preemptive GC mode) に切り替えます。これら 2 つの特徴により、QCall は FCall と比較してより信頼性の高いコードを書きやすくなっています。QCall は、FCall でよく見られる GC ホールや GC スタベーション (starvation) バグの影響を受けにくくなっています。

QCall の引数に推奨される型は、P/Invoke マーシャラーによって効率的に処理されるプリミティブ型（`INT32`、`LPCWSTR`、`BOOL`）です。`BOOL` が QCall の引数に適した真偽値型であることに注意してください。一方、`CLR_BOOL` は FCall の引数に適した真偽値型です。

一般的なアンマネージド EE 構造体へのポインターは、ハンドル型 (handle type) でラップする必要があります。これは、マネージド実装を型安全にし、unsafe C# をいたるところで使うことを避けるためです。例として、[vm\qcall.h][qcall] の AssemblyHandle を参照してください。

[qcall]: https://github.com/dotnet/runtime/blob/main/src/coreclr/vm/qcall.h

QCall でオブジェクト参照を受け渡しするには、ローカル変数へのポインターをハンドルでラップします。これは意図的に煩雑であり、合理的に可能であれば避けるべきです。以下の例の `StringHandleOnStack` を参照してください。QCall からオブジェクト、特に文字列を返すことは、生のオブジェクトを渡すことが広く許容される唯一の一般的なパターンです。（この制限セットが QCall を GC ホールに対してより安全にする理由については、下記の [「GC ホール、FCall、QCall」](#gcholes) セクションをお読みください。）

QCall は C スタイルのメソッドシグネチャで実装する必要があります。これにより、将来の AOT ツーリングがマネージド側の QCall をネイティブ側の実装に接続しやすくなります。

### QCall の例 - マネージド側

コメントを実際の QCall 実装にそのまま複製しないでください。これは説明目的です。

```CSharp
class Foo
{
    // すべての QCall は以下の DllImport 属性を持つべきです
    [DllImport(RuntimeHelpers.QCall, EntryPoint = "Foo_BarInternal", CharSet = CharSet.Unicode)]

    // QCall は常に static extern であるべきです。
    private static extern bool BarInternal(int flags, string inString, StringHandleOnStack retString);

    // 多くの QCall は、遷移前にできるだけ多くの作業を行うための
    // 薄いマネージドラッパーを持っています。例として、
    // ネイティブコードよりもマネージドコードの方が簡単な引数バリデーションがあります。
    public string Bar(int flags)
    {
        if (flags != 0)
            throw new ArgumentException("Invalid flags");

        string retString = null;
        // 文字列は、StringHandleOnStack を使用して
        // ローカル変数のアドレスを取得することで QCall から返されます
        if (!BarInternal(flags, this.Id, new StringHandleOnStack(ref retString)))
            FatalError();

        return retString;
    }
}
```

### QCall の例 - アンマネージド側

コメントを実際の QCall 実装にそのまま複製しないでください。

QCall のエントリポイント (entry point) は、`DllImportEntry` マクロを使用して [vm\qcallentrypoints.cpp][qcall-entrypoints] のテーブルに登録する必要があります。下記の [「QCall または FCall メソッドの登録」](#register) を参照してください。

[qcall-entrypoints]: https://github.com/dotnet/runtime/blob/main/src/coreclr/vm/qcallentrypoints.cpp

```C++
// すべての QCall はフリー関数であり、QCALLTYPE と extern "C" でタグ付けされるべきです
extern "C" BOOL QCALLTYPE Foo_BarInternal(int flags, LPCWSTR wszString, QCall::StringHandleOnStack retString)
{
    // すべての QCall は QCALL_CONTRACT を持つべきです。
    // これは THROWS; GC_TRIGGERS; MODE_PREEMPTIVE のエイリアスです。
    QCALL_CONTRACT;

    // オプションとして、前提条件を指定したい場合は
    // QCALL_CHECK と契約の展開形式を使用します：
    // CONTRACTL {
    //     QCALL_CHECK;
    //     PRECONDITION(wszString != NULL);
    // } CONTRACTL_END;

    // QCALL_CONTRACT と BEGIN_QCALL の間には、
    // 戻り値の宣言（ある場合）のみが置かれるべきです。
    BOOL retVal = FALSE;

    // 本体は BEGIN_QCALL/END_QCALL マクロで囲む必要があります。
    // これは例外処理に必要です。
    BEGIN_QCALL;

    // 引数のバリデーションは理想的にはマネージド側で行うべきですが、
    // 場合によってはネイティブ側で行う必要があります。引数のバリデーションが
    // マネージド側で行われている場合、ネイティブ側でのアサートは妥当です。
    _ASSERTE(flags != 0);

    // QCall に渡された文字列の GC による移動を心配する必要はありません。
    // マーシャリングが文字列をピン留めしてくれます。
    printf("%S\n", wszString);

    // これは文字列をマネージドコードに返す最も効率的な方法です。
    // StringBuilder を使用する必要はありません。
    retString.Set(L"Hello");

    // BEGIN_QCALL/END_QCALL の内部から return することはできません。
    // 戻り値はヘルパー変数を通じて渡す必要があります。
    retVal = TRUE;

    END_QCALL;

    return retVal;
}
```

## FCall の機能的動作

FCall はオブジェクト参照の受け渡しに関してより柔軟性がありますが、コードの複雑さが増し、ミスの機会も多くなります。さらに、無視できない長さの FCall に対しては、ガベージコレクションを実行する必要があるかどうかを明示的にポーリングしてください。これを怠ると、マネージドコードがタイトループ (tight loop) で FCall メソッドを繰り返し呼び出す場合にスタベーション (starvation) の問題につながります。なぜなら、FCall はスレッドが GC の実行を協調方式 (cooperative manner) でのみ許可している間に実行されるからです。

FCall には大量のボイラープレートコード (boilerplate code) が必要であり、ここで説明するには多すぎます。詳細は [fcall.h][fcall] を参照してください。

[fcall]: https://github.com/dotnet/runtime/blob/main/src/coreclr/vm/fcall.h

### <a name="gcholes"></a> GC ホール、FCall、QCall

GC ホールに関するより完全な議論は [CLR Code Guide](https://github.com/dotnet/runtime/blob/main/coding-guidelines/clr-code-guide.md) にあります。[「Is your code GC-safe?」](https://github.com/dotnet/runtime/blob/main/coding-guidelines/clr-code-guide.md#2.1) を探してください。このカスタマイズされた議論は、FCall と QCall が奇妙な規約を持つ理由のいくつかを動機付けています。

FCall メソッドにパラメーターとして渡されたオブジェクト参照は GC 保護されません。つまり、GC が発生した場合、それらの参照はオブジェクトの新しい場所ではなくメモリ内の古い場所を指すことになります。このため、FCall は通常、パラメーター型として `StringObject*` のようなものを受け取り、GC をトリガーする可能性のある操作を行う前に明示的にそれを `STRINGREF` に変換するという規律に従います。オブジェクト参照を後で使用することが予想される場合は、GC をトリガーする前にオブジェクト参照を GC 保護する必要があります。

`OBJECTREF` を適切に報告しなかったり、内部ポインター (interior pointer) を更新しなかったりすることは、一般的に「GC ホール」と呼ばれます。`OBJECTREF` クラスは Debug ビルドと Checked ビルドで逆参照 (dereference) するたびに、有効なオブジェクトを指しているかどうかの検証を行うからです。無効なオブジェクトを指している `OBJECTREF` が逆参照されると、「Detected an invalid object reference. Possible GC hole?」のようなメッセージでアサート (assert) がトリガーされます。このアサートは「手動管理された」コードを書く際に残念ながら容易にヒットします。

QCall のプログラミングモデルは、スタック上のオブジェクト参照のアドレスを渡すことを強制しているため、GC ホールを回避するように制限的になっています。これにより、オブジェクト参照が JIT のレポートロジックによって GC 保護されること、そして実際のオブジェクト参照は GC ヒープにアロケートされていないため移動しないことが保証されます。QCall は、GC ホールを書きにくくするために、まさに推奨されるアプローチです。

::: tip 💡 初心者向け補足
「GC ホール」とは、ガベージコレクション (GC) が発生したときにオブジェクトへの参照が無効になってしまうバグのことです。GC はメモリ上のオブジェクトを移動（コンパクション）することがありますが、その際にすべての参照が新しいアドレスに更新される必要があります。FCall ではネイティブコード内で生のポインターを扱うため、GC が参照を自動的に更新できず、古いアドレスを指したままになってしまう危険があります。これが「穴 (hole)」と呼ばれる由来です。QCall はこの問題を構造的に回避するよう設計されているため、より安全です。
:::

### x86 用の FCall エピローグウォーカー (epilog walker)

マネージドスタックウォーカー (stack walker) は FCall からの復帰方法を見つけられる必要があります。ABI の一部としてスタック巻き戻し (stack unwinding) の規約を定義している新しいプラットフォームでは比較的簡単です。x86 では ABI によるスタック巻き戻しの規約が定義されていません。ランタイムはエピローグウォーカーを実装することでこれを回避しています。エピローグウォーカーは FCall の実行をシミュレートすることで、FCall のリターンアドレスとカリーセーブレジスタ (callee save register) を計算します。これにより、FCall 実装で許可されるコンストラクト (construct) に制限が課されます。

デストラクタを持つスタックアロケートされたオブジェクトや、FCall 実装内の例外処理のような複雑なコンストラクトは、エピローグウォーカーを混乱させる可能性があります。これにより、GC ホールやスタックウォーキング (stack walking) 中のクラッシュが発生する可能性があります。このクラスのバグを防ぐために避けるべきコンストラクトの包括的なリストはありません。ある日問題なく動作する FCall 実装が、次の C++ コンパイラの更新で壊れる可能性があります。この領域のバグを見つけるために、ストレステスト (stress run) とコードカバレッジ (code coverage) に依存しています。

### FCall の例 – マネージド側

`String` クラスからの実際の例を示します：

```CSharp
public partial sealed class String
{
    [MethodImpl(MethodImplOptions.InternalCall)]
    private extern string? IsInterned();

    public static string? IsInterned(string str)
    {
        if (str == null)
        {
            throw new ArgumentNullException(nameof(str));
        }

        return str.IsInterned();
    }
}
```

### FCall の例 – アンマネージド側

FCall のエントリポイントは、`FCFuncEntry` マクロを使用して [vm\ecalllist.h][ecalllist] のテーブルに登録する必要があります。[「QCall または FCall メソッドの登録」](#register) を参照してください。

[ecalllist]: https://github.com/dotnet/runtime/blob/main/src/coreclr/vm/ecalllist.h

この例は、マネージドオブジェクト（`Object*`）を生のポインターとして受け取る FCall メソッドを示しています。これらの生の入力は「unsafe」と見なされ、GC の影響を受ける文脈で使用する場合はバリデーションまたは変換する必要があります。

```C++
FCIMPL1(FC_BOOL_RET, ExceptionNative::IsImmutableAgileException, Object* pExceptionUNSAFE)
{
    FCALL_CONTRACT;

    ASSERT(pExceptionUNSAFE != NULL);

    OBJECTREF pException = (OBJECTREF) pExceptionUNSAFE;

    FC_RETURN_BOOL(CLRException::IsPreallocatedExceptionObject(pException));
}
FCIMPLEND
```

## <a name="register"></a> QCall または FCall メソッドの登録

CLR は、マネージドクラスとメソッド名の観点から、またどのネイティブメソッドを呼び出すかという観点から、QCall と FCall メソッドの名前を知っている必要があります。FCall の場合、登録は [ecalllist.h][ecalllist] で、2 つの配列を使って行われます。最初の配列は名前空間 (namespace) とクラス名を関数要素の配列にマッピングします。その関数要素の配列は、個々のメソッド名とシグネチャを関数ポインターにマッピングします。

上記の例で `String.IsInterned()` の FCall メソッドを定義したとします。まず、String クラスの関数要素の配列があることを確認する必要があります。

```C++
// これらは name:namespace ペアでソートされたままである必要があることに注意：
    ...
    FCClassElement("String", "System", gStringFuncs)
    ...
```

次に、`gStringFuncs` に `IsInterned` の適切なエントリが含まれていることを確認する必要があります。メソッド名に複数のオーバーロードがある場合は、シグネチャを指定できることに注意してください：

```C++
FCFuncStart(gStringFuncs)
    ...
    FCFuncElement("IsInterned", AppDomainNative::IsStringInterned)
    ...
FCFuncEnd()
```

QCall は [qcallentrypoints.cpp][qcall-entrypoints] の `s_QCall` 配列に、`DllImportEntry` マクロを使用して以下のように登録されます：

```C++
static const Entry s_QCall[] =
{
    ...
    DllImportEntry(MyQCall),
    ...
};
```

## 命名規約

FCall と QCall はパブリックに公開すべきではありません。代わりに、実際の FCall または QCall をラップし、API 承認された名前を提供してください。

内部の FCall または QCall は、FCall/QCall の名前をパブリックエントリポイントと区別するために「Internal」サフィックスを使用する必要があります（例：パブリックエントリポイントがエラーチェックを行い、まったく同じシグネチャの共有ワーカー関数を呼び出す場合）。これは、BCL の純粋なマネージドコードでこのような状況に対処する方法と何ら変わりません。

## マネージド/アンマネージドの二重性を持つ型

特定のマネージド型は、マネージドコードとネイティブコードの両方で表現が利用可能でなければなりません。型の正規の定義がマネージドコードにあるのか CLR 内のネイティブコードにあるのかと問うことはできますが、答えは重要ではありません。重要なのは、両方が同一でなければならないということです。これにより、CLR のネイティブコードはマネージドオブジェクト内のフィールドに高速かつ効率的にアクセスできるようになります。`MethodTable` や `FieldDesc` に対して本質的に CLR のリフレクション相当のものを使用してフィールド値を取得する、より複雑な方法もありますが、これは望ましいパフォーマンスが得られず、使い勝手も良くありません。よく使用される型については、ネイティブコードでデータ構造を宣言し、両者を同期させておくことが理にかなっています。

CLR はこの目的のためにバインダー (binder) を提供しています。マネージドクラスとネイティブクラスを定義した後、フィールドオフセットが同じままであることを確認し、誰かが誤って一方の型定義にのみフィールドを追加した場合にすばやく検出できるよう、バインダーにいくつかの手がかりを提供する必要があります。

[corelib.h][corelib.h] では、「\_U」で終わるマクロを使用して、型、マネージドコードのフィールド名、および対応するネイティブデータ構造のフィールド名を記述します。さらに、メソッドのリストを指定し、後で呼び出しを試みるときに名前で参照することができます。

[corelib.h]: https://github.com/dotnet/runtime/blob/main/src/coreclr/vm/corelib.h

```C++
DEFINE_CLASS_U(SAFE_HANDLE,         Interop,                SafeHandle,         SafeHandle)
DEFINE_FIELD(SAFE_HANDLE,           HANDLE,                 handle)
DEFINE_FIELD_U(SAFE_HANDLE,         STATE,                  _state,                     SafeHandle,            m_state)
DEFINE_FIELD_U(SAFE_HANDLE,         OWNS_HANDLE,            _ownsHandle,                SafeHandle,            m_ownsHandle)
DEFINE_FIELD_U(SAFE_HANDLE,         INITIALIZED,            _fullyInitialized,          SafeHandle,            m_fullyInitialized)
DEFINE_METHOD(SAFE_HANDLE,          GET_IS_INVALID,         get_IsInvalid,              IM_RetBool)
DEFINE_METHOD(SAFE_HANDLE,          RELEASE_HANDLE,         ReleaseHandle,              IM_RetBool)
DEFINE_METHOD(SAFE_HANDLE,          DISPOSE,                Dispose,                    IM_RetVoid)
DEFINE_METHOD(SAFE_HANDLE,          DISPOSE_BOOL,           Dispose,                    IM_Bool_RetVoid)
```

これで、`REF<T>` テンプレート (template) を使用して `SAFEHANDLEREF` のような型名を作成できます。`OBJECTREF` のすべてのエラーチェックは `REF<T>` テンプレートに組み込まれており、この `SAFEHANDLEREF` を自由に逆参照してネイティブコードでそのフィールドを使用できます。ただし、これらの参照は引き続き GC 保護する必要があります。

## アンマネージドコードからマネージドコードへの呼び出し

CLR がネイティブからマネージドコードを呼び出す必要がある場所は明らかに存在します。この目的のために、多くのプラミングを処理してくれる `MethodDescCallSite` クラスが追加されています。概念的には、呼び出したいメソッドの `MethodDesc*` を見つけ、「this」ポインターのマネージドオブジェクト（インスタンスメソッドを呼び出す場合）を見つけ、引数の配列を渡し、戻り値を処理するだけです。内部的には、GC がプリエンプティブモード (preemptive mode) で実行できるようにスレッドの状態を切り替える必要があるかもしれません。

以下は簡略化された例です。このインスタンスが、前のセクションで説明したバインダーを使用して `SafeHandle` の仮想 `ReleaseHandle` メソッドを呼び出していることに注目してください。

```C++
void SafeHandle::RunReleaseMethod(SafeHandle* psh)
{
    CONTRACTL {
        THROWS;
        GC_TRIGGERS;
        MODE_COOPERATIVE;
    } CONTRACTL_END;

    SAFEHANDLEREF sh(psh);

    GCPROTECT_BEGIN(sh);

    MethodDescCallSite releaseHandle(s_pReleaseHandleMethod, METHOD__SAFE_HANDLE__RELEASE_HANDLE, (OBJECTREF*)&sh, TypeHandle(), TRUE);

    ARG_SLOT releaseArgs[] = { ObjToArgSlot(sh) };
    if (!(BOOL)releaseHandle.Call_RetBool(releaseArgs)) {
        MDA_TRIGGER_ASSISTANT(ReleaseHandleFailed, ReportViolation)(sh->GetTypeHandle(), sh->m_handle);
    }

    GCPROTECT_END();
}
```

::: tip 💡 初心者向け補足
上記のコードでは、ネイティブ（C++）側からマネージド（C#）側のメソッドを呼び出しています。`GCPROTECT_BEGIN` / `GCPROTECT_END` マクロは、呼び出し中に GC が発生してもオブジェクト参照が正しく追跡されるようにするための仕組みです。`CONTRACTL` ブロックはメソッドの「契約」を定義しており、このメソッドが例外をスローする可能性があること（`THROWS`）、GC をトリガーする可能性があること（`GC_TRIGGERS`）、協調モード（`MODE_COOPERATIVE`）で実行されることを宣言しています。
:::

## 他のサブシステムとの相互作用

## デバッガー

現在の FCall の制限の 1 つは、マネージドコードと FCall の両方を Visual Studio のインターオプ（またはミックスモード）デバッグで簡単にデバッグできないことです。現在、FCall にブレークポイントを設定してインターオプデバッグでデバッグすることは、うまく機能しません。これはおそらく修正されないでしょう。

## 物理アーキテクチャ

CLR が起動するとき、CoreLib は `SystemDomain::LoadBaseSystemClasses()` というメソッドによってロードされます。ここで、基本データ型や類似のクラス（`Exception` など）がロードされ、CoreLib の型を参照するための適切なグローバルポインターが設定されます。

FCall については、インフラストラクチャは [fcall.h][fcall] を参照し、FCall メソッドをランタイムに適切に通知するには [ecalllist.h][ecalllist] を参照してください。

QCall については、関連するインフラストラクチャは [qcall.h][qcall] を参照し、QCall メソッドをランタイムに適切に通知するには [qcallentrypoints.cpp][qcall-entrypoints] を参照してください。

より一般的なインフラストラクチャとネイティブ型定義は [object.h][object.h] にあります。バインダーはマネージドクラスとネイティブクラスを関連付けるために `mscorlib.h` を使用します。

[object.h]: https://github.com/dotnet/runtime/blob/main/src/coreclr/vm/object.h
