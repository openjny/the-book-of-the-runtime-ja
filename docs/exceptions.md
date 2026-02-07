# 例外処理

::: info 原文
この章の原文は [What Every Dev needs to Know About Exceptions in the Runtime](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/exceptions.md) です。
:::

## はじめに

CLR における「例外」について話す際、重要な区別を念頭に置く必要があります。マネージド例外は、C# の try/catch/finally などのメカニズムを通じてアプリケーションに公開されるものです。一方、CLR 内部例外は、ランタイム自体のエラー処理に使用されるものです。

ほとんどのランタイム開発者は、マネージド例外モデルの構築と公開方法について考える必要はほとんどありませんが、すべてのランタイム開発者は、ランタイムの実装における例外の使用方法を理解する必要があります。

::: tip 💡 初心者向け補足
C# で `try { ... } catch (Exception e) { ... }` と書くとき、これは「マネージド例外」を扱っています。一方、CLR ランタイムの内部でも独自の例外処理の仕組みがあり、これが「CLR 内部例外」です。この章では主に後者について説明しています。
:::

## 例外が重要な理由

例外はほぼすべての場所で重要です。例外をスローまたはキャッチする関数では特に重要です。関数自体が例外をスローしなくても、呼び出す関数がスローする可能性があるため、例外がスローされた場合に正しく動作するように記述する必要があります。**ホルダー** を適切に使用することで、このようなコードの正確な記述が大幅に容易になります。

## CLR 内部例外が異なる理由

CLR の内部例外は C++ 例外に似ていますが、完全に同じではありません。CoreCLR は Mac OSX、Linux、BSD、Windows 向けにビルドできます。OS とコンパイラの違いにより、標準的な C++ の try/catch をそのまま使用することはできません。さらに、CLR 内部例外はマネージドの "finally" や "fault" に似た機能を提供します。

## 例外のキャッチ

### EX_TRY / EX_CATCH / EX_END_CATCH

基本的なマクロは EX_TRY / EX_CATCH / EX_END_CATCH です：

```cpp
EX_TRY
  // 関数を呼び出す。例外がスローされるかもしれない。
  Bar();
EX_CATCH
  // ここに来たら、何かが失敗した。
  m_finalDisposition = terminallyHopeless;
  RethrowTransientExceptions();
EX_END_CATCH
```

::: tip 💡 初心者向け補足
CLR のランタイムは C++ で書かれていますが、標準的な C++ 例外をそのまま使えません。代わりに `EX_TRY` / `EX_CATCH` というマクロを使います。これは C# の `try` / `catch` に相当しますが、**すべての例外をキャッチする**という点が大きく異なります。特定の例外だけを処理したい場合は、キャッチ後に例外を調べて、関係ないものは再スローする必要があります。
:::

### C++ 例外との大きな違い

CLR 開発者は何をキャッチするかを指定できません。EX_CATCH マクロはアクセス違反やマネージド例外を含む**すべて**をキャッチします。特定の例外だけをキャッチしたい場合は、キャッチ後に例外を調べて、関連のないものを再スローする必要があります。

### GET_EXCEPTION() と GET_THROWABLE()

キャッチされた例外を調べる方法：

- **HRESULT の取得**: `HRESULT hr = GET_EXCEPTION()->GetHR();`
- **マネージド例外オブジェクトの取得**: `throwable = GET_THROWABLE();`
- **C++ 例外型の判定**: 軽量 RTTI 的な関数を使用

### 例外の処理方針マクロ

- **RethrowTerminalExceptions** - ThreadAbort を再スロー
- **RethrowTransientExceptions** - 一時的な例外（OOM、StackOverflow、ThreadAbort など）を再スロー。迷った場合はこちらを使用
- **EX_CATCH_HRESULT** - HRESULT のみが必要な場合の簡略形

## 例外をキャッチしない場合

### EX_TRY_FOR_FINALLY

例外をキャッチせずにクリーンアップを行いたい場合：

```cpp
EX_TRY_FOR_FINALLY
  // コード
EX_FINALLY
  // 終了/バックアウトコード
EX_END_FINALLY
```

### EX_HOOK

例外がスローされた場合にのみ補償コードを実行したい場合：

```cpp
EX_TRY
  // コード
EX_HOOK
  // 例外発生時のみ実行されるコード
EX_END_HOOK
```

## 例外のスロー

CLR で例外をスローするには、通常 `COMPlusThrow(<args>)` を呼び出します。主な便利メソッド：

| メソッド | 説明 |
| --- | --- |
| `COMPlusThrowOOM()` | メモリ不足例外。事前割り当てされた例外を使用 |
| `COMPlusThrowHR(hr)` | HRESULT に対応する例外 |
| `COMPlusThrowWin32()` | Win32 エラーに対応する例外 |
| `COMPlusThrowSO()` | スタックオーバーフロー例外 |
| `COMPlusThrowArgumentNull()` | 引数 null 例外 |
| `COMPlusThrowArgumentOutOfRange()` | 引数範囲外例外 |
| `COMPlusThrowInvalidCastException()` | 無効なキャスト例外 |

::: tip 💡 初心者向け補足
C# では `throw new OutOfMemoryException()` と書きますが、CLR の内部では `COMPlusThrowOOM()` のような専用関数を使います。特に OOM（メモリ不足）や StackOverflow（スタック溢れ）は特別な扱いが必要で、事前に割り当てられた例外オブジェクトを使用します（メモリ不足時に新しい例外オブジェクトを割り当てることはできないため）。
:::

## 例外と GC モード

`COMPlusThrowXXX()` で例外をスローしても GC モードには影響せず、どのモードでも安全に使用できます。例外がアンワインドされて EX_CATCH に戻る際、スタック上のホルダーがアンワインドされ、リソースが解放され状態がリセットされます。

## 遷移

### マネージドコードからランタイムへ

fcall や JIT ヘルパーなどの遷移です。CLR 内部例外がマネージドコードに漏れないよう、`INSTALL_UNWIND_AND_CONTINUE_HANDLER` / `UNINSTALL_UNWIND_AND_CONTINUE_HANDLER` でラップする必要があります。

### ランタイムコードからマネージドコードへ

高度にプラットフォーム依存な要件があります。32ビット Windows では、マネージドコードに入る直前に `COMPlusFrameHandler` をインストールする必要があります。

### ランタイムコードから外部ネイティブコードへ

外部コードが例外を発生させる可能性がある場合、「コールアウトフィルター」で呼び出しをラップする必要があります。フィルターは外部例外をキャッチし、`SEHException` に変換します。
