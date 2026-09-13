---
title: 闭包：把行为和环境打包成一个值
published: 2026-09-14
description: 从“闭包就是一个函数”到“闭包是编译器生成的匿名结构体”：逐层拆解捕获机制、Fn/FnMut/FnOnce 的实现、Rust 2021 精确捕获，以及闭包的 Send/Sync 推导。
tags: [Rust, 闭包, Fn, 所有权, 并发]
category: Rust
draft: false
---

# 闭包：把行为和环境打包成一个值

## 一、闭包是什么

### 1.1 第一层：闭包就是一个函数

闭包，第一层理解：**它就是一个函数**——一个没有名字的函数。

```rust
fn add_one(x: i32) -> i32 { x + 1 }        // 普通函数
let add_one = |x: i32| x + 1;              // 闭包写法（最简）
let add_one = |x: i32| -> i32 { x + 1 };   // 完整写法：|参数| -> 返回类型 { 函数体 }
```

- `|参数列表| 表达式` 是闭包的字面量语法；没有参数就写 `||`：

```rust
let no_arg = || 1;             // 无参数、单表达式
let no_arg = || -> i32 { 1 };  // 无参数、完整写法
```

- 返回类型通常可以省略（能推断出来时）；函数体只有一条表达式时，`{}` 也可以省；
- 调用方式和函数完全一样：`add_one(3)`；
- 区别只在"身份"：闭包是**表达式**、**匿名**，可以赋值给变量、作为参数传递、随用随写；
- 还有一个区别：**闭包不能声明生命周期参数**。函数可以写 `fn f<'a>(x: &'a str) -> &'a str`，闭包没有 `<'a>` 这个语法——捕获的引用能活多久，交给编译器推断。

（顺带一提：`||` 不是逻辑或，是"零个参数"；两根竖线之间可以写参数列表。）

### 1.2 第二层：它比函数多记住了环境

```rust
let n = 5;
let add_n = |x: i32| x + n;    // 用到了外面的 n
println!("{}", add_n(3));      // 8

let mut count = 0;
let mut inc = || count += 1;   // 也能修改外面的 count
inc();
println!("{}", count);         // 1
```

`n`、`count` 不是参数，也不是全局量——它们是闭包**定义处**作用域里的变量。闭包能把它们移动到闭包函数内部使用，这叫**捕获（capture）**，也是"闭包（closure）"这个名字的由来：它把定义处的环境"包围"了起来。

普通函数和函数指针做不到这一点。`fn(i32) -> i32` 只有 8 个字节，装着一个代码地址——"加 1"和"乘 2"可以随便换，但"加 n"（n 运行时才知道）没地方放：

```rust
fn add_one(x: i32) -> i32 { x + 1 }
fn double(x: i32) -> i32 { x * 2 }

fn main() {
    let n = 5;
    let mut f: fn(i32) -> i32 = add_one;
    f = double;                    // 能换函数……
    // 但没有任何办法让 f 捕获一个 n
}
```

捕获方式有：**取得所有权、借用、可变借用**，编译器按闭包体里的用法自动推断；但是想强制按值拿取（比如要搬进线程），需要加上 `move`关键字。这也是闭包在并发里的应用——`thread::spawn(move || ...)` 正是靠 `move` 把数据搬进新线程（见第六节）。

**闭包 = 函数 + 环境。** 环境存在哪？这是第三层。

### 1.3 第三层：捕获的变量放进了匿名结构体

直觉上，闭包 = 函数 + 它捕获的环境。

```rust
let n = 5;
let add = |x: i32| x + n;
println!("{}", add(3)); // 8
```

编译器看到 `|x| x + n` 之后，大致会生成这样一段代码（概念示意）：

```rust
struct AddClosure<'a> {
    n: &'a i32,          // 捕获的变量，变成结构体的字段
}

impl<'a> AddClosure<'a> {
    fn call(&self, x: i32) -> i32 {
        x + *self.n      // 闭包体，变成方法体
    }
}

fn main() {
    let n = 5;
    let add = AddClosure { n: &n }; // 闭包表达式 → 结构体字面量
    println!("{}", add.call(3));    // 调用闭包 → 调用方法
}
```

所以"捕获变量"一点也不神秘：

- **捕获的变量，就是匿名结构体的字段；**
- **调用闭包，就是调用这个结构体的方法。**

（真实实现用的是 `Fn`/`FnMut`/`FnOnce` trait 加 `extern "rust-call"` 调用约定，trait 源码放在第七节；上面只是等价示意。）

<details>
<summary>附：从源码看"闭包 = 结构体"（rustc 1.100.0 摘录）</summary>

**一、闭包类型里，"捕获物"是一个元组** —— `compiler/rustc_type_ir/src/ty_kind/closure.rs`：

```rust
pub struct ClosureArgs<I: Interner> {
    /// Lifetime and type parameters from the enclosing function,
    /// concatenated with a tuple containing the types of the upvars.
    ///
    /// These are separated out because codegen wants to pass them around
    /// when monomorphizing.
    pub args: I::GenericArgs,
}
```

拆开看，闭包的泛型参数一共四部分（`ClosureArgsParts`）：

```rust
pub struct ClosureArgsParts<I: Interner> {
    /// This is the args of the typeck root.
    pub parent_args: I::GenericArgsSlice,
    /// Represents the maximum calling capability of the closure.
    pub closure_kind_ty: I::Ty,
    /// Captures the closure's signature. This closure signature is "tupled", and
    /// thus has a peculiar signature of `extern "rust-call" fn((Args, ...)) -> Ty`.
    pub closure_sig_as_fn_ptr_ty: I::Ty,
    /// The upvars captured by the closure. Remains an inference variable
    /// until the upvar analysis, which happens late in HIR typeck.
    pub tupled_upvars_ty: I::Ty,
}
```

- `parent_args`：外层函数的环境（生命周期、泛型参数）；
- `closure_kind_ty`：这个闭包"最高能当什么用"（`Fn` / `FnMut` / `FnOnce`，由捕获分析决定）；
- `closure_sig_as_fn_ptr_ty`：调用签名，注意它是"元组化"的：`extern "rust-call" fn((Args, ...)) -> Ty`；
- `tupled_upvars_ty`：**捕获物的类型元组**——"匿名结构体的字段清单"就藏在这里。

`upvar_tys()` 把这个元组摊开成字段类型列表：

```rust
/// Returns an iterator over the list of types of captured paths by the closure.
/// In case there was a type error in figuring out the types of the captured path, an
/// empty iterator is returned.
#[inline]
pub fn upvar_tys(self) -> I::Tys {
    match self.tupled_upvars_ty().kind() {
        ty::Error(_) => Default::default(),
        ty::Tuple(tys) => tys,
        ty::Infer(_) => panic!("upvar_tys called before capture types are inferred"),
        ty => panic!("Unexpected representation of upvar types tuple {:?}", ty),
    }
}
```

对应上面的例子：`|x| x + n` 捕获了 `n`，`tupled_upvars_ty` 就是 `(&'a i32,)`，`upvar_tys()` 给出 `[&'a i32]`——正好是 `AddClosure<'a> { n: &'a i32 }` 的字段类型。

**二、布局：闭包直接按"结构体"来算** —— `compiler/rustc_ty_utils/src/layout.rs` 里 `layout_of` 的分发：

```rust
ty::Closure(_, args) => univariant(args.as_closure().upvar_tys(), StructKind::AlwaysSized)?,
```

`univariant` 就是"计算无枚举变体的结构体布局"的函数。也就是说，编译器把 `upvar_tys()` 当字段列表，按结构体规则排布闭包：字段顺序、对齐、填充、`Drop` 检查、`Send`/`Sync` 推导……全都按结构体来。于是：

- 不捕获 → 0 个字段 → ZST（对应 2.1 的 `no_capture = 0 bytes`）；
- 捕获 `&i32` → 一个指针字段 → 8 字节；
- 捕获 `String` → 一个 24 字节字段，并让闭包"需要析构"。

**三、调用是编译器内建的实现** —— `compiler/rustc_ty_utils/src/instance.rs` 在解析 `Fn` 系列方法时，对闭包单独处理：

```rust
match *rcvr_args.type_at(0).kind() {
    ty::Closure(closure_def_id, args) => {
        Some(Instance::resolve_closure(tcx, closure_def_id, args, target_kind))
    }
    ...
}
```

`resolve_closure`（`compiler/rustc_middle/src/ty/instance.rs`）负责"实例化"对应层级的调用方法——闭包没有手写的 `impl Fn`，这套实现是编译器内建的：

```rust
pub fn resolve_closure(
    tcx: TyCtxt<'tcx>,
    def_id: DefId,
    args: ty::GenericArgsRef<'tcx>,
    requested_kind: ty::ClosureKind,
) -> Instance<'tcx> {
    let actual_kind = args.as_closure().kind();

    match needs_fn_once_adapter_shim(actual_kind, requested_kind) {
        Ok(true) => Instance::fn_once_adapter_instance(tcx, def_id, args),
        _ => Instance::new_raw(def_id, args),
    }
}
```

当调用方要求的层级比闭包实际能力更弱时（比如把 `FnMut` 闭包当 `FnOnce` 用），会走适配器 shim，把 `&mut self` 的调用改写成按值调用。

</details>

### 1.4 对号入座：其他语言里的闭包

如果有其他语言背景，可以先建立个印象——大家都有"函数 + 环境"这个东西，区别在**捕获规则**：

| 语言 | 对应概念 | 捕获方式 | 关键差异 |
|------|----------|----------|----------|
| Python | lambda / 嵌套函数 | 按引用捕获变量 | 变量与闭包同生共死（late binding），没有所有权检查 |
| JavaScript | 闭包（函数 + 作用域链）| 按引用捕获 | 同样 late binding；`let` 的块级作用域会影响捕获结果 |
| Go | 函数字面量 | 按引用捕获变量 | 循环变量捕获曾是经典坑（Go 1.22 起每次迭代新建变量）|
| Java | lambda / 匿名内部类 | 只能捕获 effectively final 的变量（按值）| 想改外部变量得借助数组、`Atomic*` 之类的容器 |
| C++ | lambda | 手写捕获列表 `[&]` / `[=]` | 语法最像 Rust，但对象生命周期完全自己负责 |
| Rust | 闭包 | **编译器按用法自动推导**（借用 / 可变借用 / 按值）| 捕获方式还决定实现 `Fn`/`FnMut`/`FnOnce`；全程借用检查 |

一句话：**其他语言的闭包大多"按引用捕获 + 运行时管理"，Rust 的闭包在编译期就把捕获方式和所有权算清楚了。**

小结：**闭包的三层理解：函数 → 函数 + 环境 → 匿名结构体 + 调用 trait。**

---

## 二、验证：闭包真的是结构体

### 2.1 验证：闭包的大小 = 捕获物的大小

如果闭包真的是结构体，那它的大小应该正好等于"捕获的东西"的大小：

```rust
use std::mem::size_of_val;

fn main() {
    let no_capture = || 1;

    let x = 10;
    let by_ref = || x + 1;

    let mut y = 10;
    let by_mut = || { y += 1; y };

    let s = String::from("hello");
    let by_move = move || s.len();

    println!("no_capture = {} bytes", size_of_val(&no_capture));
    println!("by_ref     = {} bytes", size_of_val(&by_ref));
    println!("by_mut     = {} bytes", size_of_val(&by_mut));
    println!("by_move    = {} bytes", size_of_val(&by_move));
}
```

x64 平台实测输出：

```text
no_capture = 0 bytes
by_ref     = 8 bytes
by_mut     = 8 bytes
by_move    = 24 bytes
```

对号入座：

| 闭包 | 捕获了什么 | 结构体字段 | 大小 |
|------|-----------|-----------|------|
| `no_capture` | 什么也没捕获 | 空 | 0（ZST）|
| `by_ref` | `x` 的不可变引用 | `&i32` | 8 |
| `by_mut` | `y` 的可变引用 | `&mut i32` | 8 |
| `by_move` | `s` 本身 | `String` | 24 |

注意 `no_capture`：一个不捕获任何东西的闭包是**零大小类型**（ZST）。它没有堆分配、没有装箱，就是一个"零字节的结构体 + 一个方法"。这也是 Rust 敢说闭包是零开销抽象的原因。

### 2.2 验证：闭包类型匿名，而且个个不同

```rust
use std::any::type_name_of_val;

let f = || 1;
println!("{}", type_name_of_val(&f));
// 输出类似：closure::main::{{closure}}（crate 名不同会不一样）
```

类型名里的 `{{closure}}` 就是"编译器随手起的名字"。而且**每个闭包表达式都有自己独立的类型**——哪怕两段代码一模一样：

```rust
fn main() {
    let f = || 1;
    let mut g = || 1;
    g = f;
}
```

```text
error[E0308]: mismatched types
 --> src/main.rs:4:9
  |
2 |     let f = || 1;
  |             -- the found closure
3 |     let mut g = || 1;
  |                 -- the expected closure
4 |     g = f;
  |         ^ expected closure, found a different closure
  |
  = note: no two closures, even if identical, have the same type
  = help: consider boxing your closure and/or using it as a trait object
```

请记住最后那句 help——**"考虑装箱，或者当 trait 对象用"**。这就是从闭包通往 Trait 对象的桥，下一篇会用上它。

### 2.3 捕获方式决定实现哪个 trait

闭包对捕获变量的"用法"，决定了它以什么方式捕获，也决定了它自动实现 `Fn` 系列里的哪几个 trait：

| 闭包体里对捕获变量的用法 | 捕获方式 | 结构体字段 | 自动实现 |
|--------------------------|----------|-----------|----------|
| 只读 | 不可变借用 | `&T` | `Fn`（同时也有 `FnMut`、`FnOnce`）|
| 修改 | 可变借用 | `&mut T` | `FnMut`（同时也有 `FnOnce`）|
| 消费（drop、移动出去）| 拿走所有权 | `T` | `FnOnce` |

三个 trait 是层层包含的关系：

```text
Fn: FnMut: FnOnce
```

它们的区别只在"调用时怎么拿 self"：

- `FnOnce::call_once(self)`：拿走闭包本身，**只能调一次**；
- `FnMut::call_mut(&mut self)`：借可变，**能调多次、能改捕获的变量**；
- `Fn::call(&self)`：借不可变，**能调多次、不能改捕获的变量**。

能实现 `Fn` 的闭包最强（可调用的场景最多），`FnOnce` 最弱（只保证能调一次）。

如果闭包把捕获的变量"消费"掉了，它就只能是 `FnOnce`，第二次调用直接报错：

```rust
fn main() {
    let s = String::from("owned");
    let consume = move || drop(s);
    consume();
    consume(); // 第二次调用
}
```

```text
error[E0382]: use of moved value: `consume`
 --> src/main.rs:5:5
  |
4 |     consume();
  |     --------- `consume` moved due to this call
5 |     consume();
  |     ^^^^^^^ value used here after move
  |
note: closure cannot be invoked more than once because it moves the variable `s` out of its environment
note: this value implements `FnOnce`, which causes it to be moved when called
```

另外要区分两个概念：**`move` 关键字只决定"怎么捕获"（把变量按值搬进结构体），不决定"实现哪个 trait"。** 一个 `move` 闭包如果只是读捕获的变量，它照样实现 `Fn`，可以反复调用。

顺带一提：捕获引用时，闭包不能比被借的数据活得久——这就是《[关于生命周期](关于生命周期.md)》里那条规则的又一个应用场景。

（这张"用法 → 捕获方式"的表在编译器里是怎么算出来的？见 [7.2](#72-捕获分析借用种类怎么升级)。）

### 2.4 Rust 2021 的"精确捕获"

捕获变量还有一处细节：Rust 2021 起，闭包只捕获**真正用到的字段**，而不是整个变量。同一个程序，用两个 edition 编译，闭包大小不同：

```rust
use std::mem::size_of_val;

fn main() {
    let p = (String::from("aaaa"), String::from("bbbb"));
    let f = move || p.0.len();
    println!("{}", size_of_val(&f));
}
```

```text
--edition 2018：48   // 整个元组 (String, String) 都搬进闭包
--edition 2021：24   // 只搬用到的那一个 String
```

一个 48 字节，一个 24 字节——这就是"精确捕获"省下来的。

精确捕获也有边界：比如捕获的字段来自实现了 `Drop` 的类型时，会退化成"整个变量一起捕获"。这些边界和对应的源码放在 [7.3](#73-精确捕获的边界drop数组裸指针)。

小结：**闭包 = 匿名结构体（捕获变量是字段）+ `Fn` 系列 trait 的实现；捕获方式决定字段，也决定实现哪个 trait；Rust 2021 起默认精确到字段。**

---

## 三、作为变量、作为返回值：fn 指针 vs 闭包

这一节专门回答"两者到底差在哪"。

**先看重新赋值。**

函数指针可以随便换，因为所有签名相同的函数项都强转成同一个 `fn` 类型：

```rust
let mut f: fn(i32) -> i32 = add_one;
f = double; // 可以：类型相同，只是地址换了
```

闭包不行，因为每个闭包表达式都是**不同的类型**：

```rust
fn main() {
    let mut g = |x: i32| x + 1;
    g = |x: i32| x * 2;
}
```

```text
error[E0308]: mismatched types
 --> src/main.rs:3:9
  |
2 |     let mut g = |x: i32| x + 1;
  |                 -------- the expected closure
3 |     g = |x: i32| x * 2;
  |         ^^^^^^^^^^^^^^ expected closure, found a different closure
  |
  = note: no two closures, even if identical, have the same type
  = help: consider boxing your closure and/or using it as a trait object
```

**再看作为返回值。**

`fn` 指针类型能写出来，所以可以直接返回：

```rust
fn make() -> fn(i32) -> i32 {
    |x| x + 1        // 不捕获环境，自动强转成 fn 指针
}
```

一旦闭包捕获了变量，返回类型就"写不出来"了——捕获后的类型是匿名的：

```rust
fn make(n: i32) -> fn(i32) -> i32 {
    |x| x + n
}
```

```text
error[E0308]: mismatched types
 --> src/main.rs:2:5
  |
1 | fn make(n: i32) -> fn(i32) -> i32 {
  |                    -------------- expected `fn(i32) -> i32` because of return type
2 |     |x| x + n
  |     ^^^^^^^^^ expected fn pointer, found closure
  |
  = note: closures can only be coerced to `fn` types if they do not capture any variables
```

小结一下：

| | `fn` 指针 | 捕获了变量的闭包 |
|---|---|---|
| 能装状态 | 不能 | 能 |
| 类型可命名 | 能（`fn(i32) -> i32`）| 不能（匿名类型）|
| 能否互相赋值 | 能（同一类型）| 不能（每个都是独立类型）|
| 能否直接作为返回值 | 能 | 不能（写不出类型）|

所以闭包虽然"带上了数据"，但它的类型仍然是编译期确定的——**闭包只是"有状态的可调用值"的打包方式，还不是动态化本身。** 想把不同来源、不同类型的行为塞进同一个位置，还需要另一件武器：把类型擦掉。

---

## 四、闭包类型写不出来，那怎么传出去？

闭包类型是匿名的，你没法写出 `fn make() -> AddClosure`。想返回或存储闭包，有三条路：

**路线一：泛型参数（静态分发）**

```rust
fn apply<F: Fn(i32) -> i32>(f: F, x: i32) -> i32 {
    f(x)
}
```

调用时，编译器为每个具体的 `F` 生成一份 `apply` 代码（单态化）。

**路线二：`impl Trait`（返回位置，静态分发）**

```rust
fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    move |x| x + n
}
```

注意这里必须写 `move`，否则闭包只借了 `n`，而 `n` 是函数的局部变量，函数一返回就没了：

```text
error[E0373]: closure may outlive the current function, but it borrows `n`, which is owned by the current function
 --> src/main.rs:2:5
  |
2 |     |x| x + n
  |     ^^^     - `n` is borrowed here
  |     |
  |     may outlive borrowed value `n`
  |
help: to force the closure to take ownership of `n` (and any other referenced variables), use the `move` keyword
  |
2 |     move |x| x + n
  |     ++++
```

**路线三：Trait 对象（动态分发）**

```rust
fn make_adder(n: i32) -> Box<dyn Fn(i32) -> i32> {
    Box::new(move |x| x + n)
}
```

前两条路仍然是静态分发：类型虽然匿名，但编译器在编译期就确定了它，调用依然是直接调用。**只有第三条路——`dyn`——才是真正的动态化。** 下一篇就拆开它。

小结：**类型匿名 → 三条出路：泛型、`impl Trait`（静态分发）、`dyn`（动态分发）；只有 `dyn` 是真正的动态化。**

---

## 五、应用场景

**闭包的主场（把行为打包成值）：**

- 迭代器适配器：`map`、`filter`、`fold`、`sort_by_key`——把"做什么"作为参数传进去；
- 回调/事件：GUI、网络库里的 `on_click(|e| ...)`；
- 线程：`thread::spawn(move || ...)`——`move` 把数据搬进新线程；
- 工厂与惰性求值：先存一个"以后再做"的动作。

> 需要把**捕获环境各不相同**的闭包放进同一个容器（回调注册表、任务队列）时，就得看下一篇了。

---

## 六、闭包与并发：Send / Sync 从哪来

闭包是"匿名结构体"这件事，在并发里会立刻兑现：**一个闭包能不能跨线程，完全由它捕获的字段决定。**

`Send`/`Sync` 是**自动 trait（auto trait）**：编译器看到结构体的每个字段都实现了它，就自动给整个结构体实现。闭包也一样——捕获 `Rc` 的闭包不是 `Send`，捕获 `i32`、`String`、`Arc<T>` 的闭包是 `Send`，不需要为闭包手写任何东西。

<details>
<summary>附：什么样才算 Send / Sync？</summary>

**两条定义：**

- `Send`：值可以安全地**移动**到另一个线程（所有权交出去）；
- `Sync`：值可以安全地**共享引用**给多个线程——等价说法：`&T: Send`。

**推导规则（auto trait 的结构推导）：**

- 结构体 / 枚举 / 元组 / **闭包**：所有字段 `Send` → 整体 `Send`；所有字段 `Sync` → 整体 `Sync`；
- 引用：`&T: Send ⇔ T: Sync`；`&mut T: Send ⇔ T: Send`；`&T`、`&mut T` 的 `Sync` 都 ⇔ `T: Sync`。

**常见对照：**

| 类型 | `Send` | `Sync` | 说明 |
|------|:---:|:---:|------|
| `i32`、`String`、`bool` … | ✓ | ✓ | 纯数据 |
| `Vec<T>` / `Box<T>` | 看 `T` | 看 `T` | 跟着内部类型 |
| `&T` | `T: Sync` 时 ✓ | `T: Sync` 时 ✓ | 共享引用 |
| `&mut T` | `T: Send` 时 ✓ | `T: Sync` 时 ✓ | 独占引用 |
| `*const T` / `*mut T` | ✗ | ✗ | 裸指针不做保证 |
| `Rc<T>` | ✗ | ✗ | 引用计数非原子 |
| `Arc<T>` | `T: Send + Sync` 时 ✓ | `T: Send + Sync` 时 ✓ | 原子引用计数 |
| `Cell<T>` / `RefCell<T>` | `T: Send` 时 ✓ | ✗ | 内部可变性，不能共享 |
| `Mutex<T>` | `T: Send` 时 ✓ | `T: Send` 时 ✓ | 加锁后独占访问 |
| `MutexGuard<'_, T>` | ✗ | `T: Sync` 时 ✓ | 守卫不能换线程解锁 |

**用代码验证**（`assert_send` / `assert_sync` 只在编译期检查）：

```rust
use std::sync::{Arc, Mutex};

fn assert_send<T: Send>() {}
fn assert_sync<T: Sync>() {}

fn main() {
    assert_send::<i32>();
    assert_send::<String>();
    assert_send::<Arc<Mutex<i32>>>();
    assert_sync::<Arc<Mutex<i32>>>();
    assert_send::<&mut i32>();   // &mut T: Send 要求 T: Send
    assert_send::<&i32>();       // &T: Send 要求 T: Sync

    // assert_send::<Rc<i32>>();       // 编译错误：Rc 不是 Send
    // assert_send::<*const i32>();    // 编译错误：裸指针不是 Send
    // assert_sync::<Cell<i32>>();     // 编译错误：Cell 不是 Sync
}
```

**对应到闭包**：闭包按结构体推导，捕获物里只要有一个"不达标"的字段，整个闭包就不达标——例 2 里 `Rc` 闭包的报错，根源就是 `Rc<i32>: !Send`。

源码里的"否定实现"（`library/core/src/marker.rs` 等）：

```rust
// Send / Sync 本身是 auto trait
pub unsafe auto trait Send { /* empty */ }
pub unsafe auto trait Sync { /* empty */ }

// 裸指针：明确否定
impl<T: PointeeSized> !Send for *const T {}
impl<T: PointeeSized> !Send for *mut T {}
impl<T: PointeeSized> !Sync for *const T {}
impl<T: PointeeSized> !Sync for *mut T {}

// &T 的 Send 要求 T: Sync（而不是 T: Send）
unsafe impl<T: Sync + PointeeSized> Send for &T {}
```

```rust
// alloc/src/rc.rs：Rc 两个都否定
impl<T: ?Sized, A: Allocator> !Send for Rc<T, A> {}
impl<T: ?Sized, A: Allocator> !Sync for Rc<T, A> {}

// alloc/src/sync.rs：Arc 要求 T: Send + Sync
unsafe impl<T: ?Sized + Sync + Send, A: Allocator + Send + Sync> Send for Arc<T, A> {}
unsafe impl<T: ?Sized + Sync + Send, A: Allocator + Send + Sync> Sync for Arc<T, A> {}

// core/src/cell.rs：Cell 可 Send（T: Send），但不可 Sync
unsafe impl<T: ?Sized> Send for Cell<T> where T: Send {}
impl<T: ?Sized> !Sync for Cell<T> {}

// std/src/sync/poison/mutex.rs：Mutex 跟着 T: Send；守卫不可 Send
unsafe impl<T: ?Sized + Send> Send for Mutex<T> {}
unsafe impl<T: ?Sized + Send> Sync for Mutex<T> {}
impl<T: ?Sized> !Send for MutexGuard<'_, T> {}
unsafe impl<T: ?Sized + Sync> Sync for MutexGuard<'_, T> {}
```

**四、显式实现可以覆盖推导**

上面的"字段推导"只在**没有显式实现**时生效。Rust Reference 的原话是：

> If no explicit implementation or negative implementation is written out for an auto trait for a given type, then the compiler implements it automatically according to the following rules…

所以想"手动担保"可以写 `unsafe impl`——编译器不再看字段，直接采纳：

```rust
struct MyBox(*mut u8);

// 我保证它跨线程安全
unsafe impl Send for MyBox {}
unsafe impl Sync for MyBox {}
```

rustc 内部的优先级也印证了这一点（`compiler/rustc_trait_selection/src/traits/auto_trait.rs`）：

```rust
pub enum AutoTraitResult<A> {
    NoImpl,
    ExplicitImpl,
    PositiveImpl(A),
    NegativeImpl,
}
```

```rust
// If an explicit impl exists, it always takes priority over an auto impl
return AutoTraitResult::ExplicitImpl;
```

注意 `unsafe impl` 的含义是"我担保"：**编译器不验证**——担保错了（比如字段里有别人看不到的共享状态），就是未定义行为，编译器不会帮你查。

想"反向否定"呢？标准库内部用负向实现 `impl !Send for ...`，但**稳定版不开放**（需要 nightly 的 `negative_impls`）：

```text
error[E0658]: negative impls are experimental
help: use marker types for now
```

稳定版的替代是**标记类型**：塞一个不达标的 `PhantomData` 字段，让字段推导自己得出 `!Send`：

```rust
use std::marker::PhantomData;
use std::rc::Rc;

struct NotSend {
    _marker: PhantomData<Rc<()>>,   // 跟着 Rc 一起 !Send / !Sync
}
```

**闭包呢？** 闭包类型匿名，没法给它写 impl；常见做法是包一层 newtype：

```rust
struct Sendable<F>(F);
unsafe impl<F> Send for Sendable<F> {}   // 担保：里面的 F 跨线程没问题
```

（比如 `Box<dyn Fn()>` 默认不是 `Send`：要么写 `Box<dyn Fn() + Send>`，要么用 newtype 手动担保。）

所以判断规则不是呆板的，而是**默认保守（按字段推导）的，显式可覆盖（`unsafe impl` 担保）；想拒绝则用否定实现/标记类型。**

</details>

标准库的 `thread::spawn` 把这个约束写在了签名里：

```rust
pub fn spawn<F, T>(f: F) -> JoinHandle<T>
where
    F: FnOnce() -> T,
    F: Send + 'static,
    T: Send + 'static,
```

三条约束各有原因：

- `FnOnce() -> T`：线程体只执行一次；
- `Send`：闭包连同捕获的数据要**搬进**新线程，必须能安全地跨线程移动；
- `'static`：新线程可能比创建它的函数活得久，所以不能借用栈上的局部变量。

**例 1：`move` 把数据搬进线程。**

```rust
use std::thread;

fn main() {
    let s = String::from("hello");
    let handle = thread::spawn(move || s.len()); // s 的所有权进入闭包，再进入新线程
    println!("{}", handle.join().unwrap());      // 5
}
```

去掉 `move` 的话，闭包只借了 `s`，编译器立刻拦下：

```rust
use std::thread;

fn main() {
    let s = String::from("hi");
    thread::spawn(|| s.len());
}
```

```text
error[E0373]: closure may outlive the current function, but it borrows `s`, which is owned by the current function
 --> src/main.rs:5:19
  |
5 |     thread::spawn(|| s.len());
  |                   ^^ - `s` is borrowed here
  |                   |
  |                   may outlive borrowed value `s`
  |
note: function requires argument type to outlive `'static`
help: to force the closure to take ownership of `s` (and any other referenced variables), use the `move` keyword
  |
5 |     thread::spawn(move || s.len());
  |                   ++++
```

**例 2：不是 `Send` 的数据，编译期就拒绝。**

```rust
use std::rc::Rc;
use std::thread;

fn main() {
    let x = Rc::new(1);
    thread::spawn(move || {
        println!("{}", x);
    });
}
```

```text
error[E0277]: `Rc<i32>` cannot be sent between threads safely
 --> src/main.rs:6:19
  |
6 |     thread::spawn(move || {
  |     ------------- ^------ within this `{closure@src/main.rs:6:19: 6:26}`
  |
  = help: within `{closure@src/main.rs:6:19: 6:26}`, the trait `Send` is not implemented for `Rc<i32>`
note: required because it's used within this closure
note: required by a bound in `spawn`
   |
128 |     F: Send + 'static,
    |        ^^^^ required by this bound in `spawn`
```

注意错误里的 "within this closure" 和 "used within this closure"：编译器就是把闭包当结构体，逐个检查字段（捕获物）是否 `Send`——这正是"闭包 = 结构体"的直接体现。

**例 3：借用栈上数据：`thread::scope`。**

`'static` 拦住了"借局部变量"，但很多时候只想开几个线程把一块数据并行处理完。`thread::scope`（Rust 1.63 起稳定）保证作用域结束时所有线程都已 join，因此**允许闭包借用栈上的数据**：

```rust
use std::thread;

fn main() {
    let data = vec![1, 2, 3];
    let sum = thread::scope(|sc| {
        let h = sc.spawn(|| data.iter().sum::<i32>());
        h.join().unwrap()
    });
    println!("{sum}"); // 6
}
```

`Scope::spawn` 的约束因此只剩 `Send` 和生命周期 `'scope`，不再要求 `'static`。

**例 4：共享可变状态：`Arc<Mutex<T>>`。**

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0));
    let mut handles = vec![];

    for _ in 0..4 {
        let counter = Arc::clone(&counter);   // 每个线程一份 Arc
        handles.push(thread::spawn(move || {  // move 把这份 Arc 搬进闭包
            *counter.lock().unwrap() += 1;
        }));
    }

    for h in handles {
        h.join().unwrap();
    }
    println!("{}", *counter.lock().unwrap()); // 4
}
```

`Arc<T>` 的引用计数用原子操作（所以是 `Send + Sync`），`Mutex<T>` 提供互斥——捕获 `Arc<Mutex<i32>>` 的闭包自然是 `Send` 的。

**例 5：线程间传消息：通道。**

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        tx.send(42).unwrap();
    });
    println!("{}", rx.recv().unwrap()); // 42
}
```

发送端 `tx` 被 `move` 进线程，接收端 `rx` 留在主线程阻塞等待。

小结：

| 需求 | 约束 | 手段 |
|------|------|------|
| 把数据带进新线程 | `F: Send + 'static` | `move` 闭包 + `thread::spawn` |
| 借用栈上数据 | 作用域内 join | `thread::scope` |
| 共享只读数据 | `T: Sync` | `Arc<T>` |
| 共享可变数据 | `T: Send` | `Arc<Mutex<T>>` / `Arc<RwLock<T>>` |
| 线程间传消息 | `T: Send` | `mpsc::channel` + move 发送端 |

> 顺带一提：`async move {}` 块也是一种"捕获环境 + 惰性执行"的值（Future），多线程执行器同样要求它 `Send`——判断方法完全一样：看捕获了什么。

<details>
<summary>附：线程 API 与 Send 的源码（rustc 1.100.0 摘录）</summary>

`library/std/src/thread/functions.rs`：

```rust
pub fn spawn<F, T>(f: F) -> JoinHandle<T>
where
    F: FnOnce() -> T,
    F: Send + 'static,
    T: Send + 'static,
{
    Builder::new().spawn(f).expect("failed to spawn thread")
}
```

`library/std/src/thread/scoped.rs`：

```rust
pub fn scope<'env, F, T>(f: F) -> T
where
    F: for<'scope> FnOnce(&'scope Scope<'scope, 'env>) -> T,
{
    // ...（创建 Scope、运行 f、等待所有线程结束）
}
```

```rust
// Scope::spawn
pub fn spawn<F, T>(&'scope self, f: F) -> ScopedJoinHandle<'scope, T>
where
    F: FnOnce() -> T + Send + 'scope,
    T: Send + 'scope,
{
    Builder::new().spawn_scoped(self, f).expect("failed to spawn thread")
}
```

`library/core/src/marker.rs`：

```rust
#[diagnostic::on_unimplemented(
    message = "`{Self}` cannot be sent between threads safely",
    label = "`{Self}` cannot be sent between threads safely"
)]
pub unsafe auto trait Send {
    // empty.
}
```

</details>

---

## 七、深入（选读）：编译器眼里的闭包

前面都是"外部视角"：大小、类型、trait。这一节换到编译器内部，回答三个问题：`Fn` 系列 trait 到底长什么样？捕获方式是怎么算出来的？精确捕获的边界在哪？只关心用法的读者可以直接跳到第八节。

### 7.1 真实的 Fn 系列 trait

`library/core/src/ops/function.rs`（rustc 1.100.0；这里略去尚未稳定的 const trait 标记，只保留核心）：

```rust
pub trait Fn<Args>: FnMut<Args> {
    extern "rust-call" fn call(&self, args: Args) -> Self::Output;
}

pub trait FnMut<Args>: FnOnce<Args> {
    extern "rust-call" fn call_mut(&mut self, args: Args) -> Self::Output;
}

pub trait FnOnce<Args> {
    type Output;
    extern "rust-call" fn call_once(self, args: Args) -> Self::Output;
}
```

- 三个 trait 层层继承（`Fn: FnMut`、`FnMut: FnOnce`），所以实现了 `Fn` 的闭包自动也是 `FnMut`、`FnOnce`；
- 参数 `Args` 是参数元组：`Fn(i32) -> i32` 其实是 `Fn<(i32,), Output = i32>` 的语法糖；
- `extern "rust-call"` 是它们专用的调用约定。trait 本身和 `f()` 调用语法都是稳定的，未稳定的只是"手写实现它们"；
- 闭包类型不用手写：编译器为每个闭包生成一个匿名类型，并自动实现对应层级的 trait。

### 7.2 捕获分析：借用种类怎么升级

2.6 那张"用法 → 捕获方式"表，编译器是怎么算出来的？过程其实很直接——**从最弱的不可变借用开始，按用法逐级升级**：

- 每个被闭包用到的外部变量，先按"不可变借用"记账；
- 一旦出现更"重"的用法（赋值、`&mut`、调用 `&mut self` 方法……），就把捕获方式沿格子往上升级；
- 如果用法是"把变量移走"（消费、drop、move 出去），或者闭包写了 `move`，直接按值捕获。

```text
借用种类升级：ImmBorrow（不可变）→ UniqueImmBorrow → MutBorrow（可变）
独立的终态：ByValue（按值，来自 move 或消费用法）
```

`UniqueImmBorrow` 是解引用 `&mut` 时的中间状态，日常可以忽略。闭包实现哪个 trait，也是顺着这套分析推出来的：只用到不可变借用 → `Fn`；需要可变借用 → `FnMut`；需要按值消费 → `FnOnce`。

`compiler/rustc_hir_typeck/src/upvar.rs` 开头的算法说明：

```text
//! Whenever there is a closure expression, we need to determine how each
//! upvar is used. We do this by initially assigning each upvar an
//! immutable "borrow kind" (see `ty::BorrowKind` for details) and then
//! "escalating" the kind as needed. The borrow kind proceeds according to
//! the following lattice:
//! ```ignore (not-rust)
//! ty::ImmBorrow -> ty::UniqueImmBorrow -> ty::MutBorrow
//! ```
```

`compiler/rustc_middle/src/ty/closure.rs` 里"捕获方式"的最终表示：

```rust
pub enum UpvarCapture {
    /// Upvar is captured by value. This is always true when the
    /// closure is labeled `move`, but can also be true in other cases
    /// depending on inference.
    ByValue,

    /// Upvar is captured by use. This is true when the closure is labeled `use`.
    ByUse,

    /// Upvar is captured by reference.
    ByRef(BorrowKind),
}
```

### 7.3 精确捕获的边界：Drop、数组、裸指针

2.7 说了 Rust 2021 起会精确捕获字段，但也不是"无脑拆到字段"，有几条边界：

- **类型实现了 `Drop`**：Rust 不允许从 `Drop` 类型里把字段单独移出来，按值捕获会退化成"整个变量一起捕获"；
- **数组**：整体捕获，不会精确到某个下标（`arr[0]` 会捕获整个 `arr`）；
- **裸指针、union**：整体捕获（精确到字段需要 `unsafe`）。

第一条边界可以实测：

```rust
use std::mem::size_of_val;

struct NoDrop { a: String, b: String }
struct WithDrop { a: String, b: String }
impl Drop for WithDrop {
    fn drop(&mut self) {}
}

fn main() {
    let n = NoDrop { a: String::from("a"), b: String::from("b") };
    let f = move || n.a.len();
    println!("no drop   = {}", size_of_val(&f)); // 24：只搬了 a

    let d = WithDrop { a: String::from("a"), b: String::from("b") };
    let g = move || d.a.len();
    println!("with drop = {}", size_of_val(&g)); // 48：整个 WithDrop 都搬了
}
```

```text
no drop   = 24
with drop = 48
```

`compiler/rustc_hir_typeck/src/upvar.rs` —— 按值捕获遇到 `Drop` 类型时，把捕获位置截断到该类型：

```rust
/// Rust doesn't permit moving fields out of a type that implements drop
fn restrict_precision_for_drop_types<'a, 'tcx>(
    fcx: &'a FnCtxt<'a, 'tcx>,
    mut place: Place<'tcx>,
    mut curr_mode: ty::UpvarCapture,
) -> (Place<'tcx>, ty::UpvarCapture) {
    let is_copy_type = fcx.infcx.type_is_copy_modulo_regions(fcx.param_env, place.ty());

    if let (false, UpvarCapture::ByValue) = (is_copy_type, curr_mode) {
        for i in 0..place.projections.len() {
            match place.ty_before_projection(i).kind() {
                ty::Adt(def, _) if def.destructor(fcx.tcx).is_some() => {
                    truncate_place_to_len_and_update_capture_kind(&mut place, &mut curr_mode, i);
                    break;
                }
                _ => {}
            }
        }
    }

    (place, curr_mode)
}
```

同文件——数组与 `unsafe` 相关的截断规则（函数文档）：

```text
/// Truncate projections so that the following rules are obeyed by the captured `place`:
/// - No Index projections are captured, since arrays are captured completely.
/// - No unsafe block is required to capture `place`.
///
/// Returns the truncated place and updated capture mode.
```

```text
/// Truncate `place` so that an `unsafe` block isn't required to capture it.
/// - No projections are applied to raw pointers, since these require unsafe blocks. We capture
///   them completely.
/// - No projections are applied on top of Union ADTs, since these require unsafe blocks.
```

小结：**捕获分析从不可变借用逐级升级；精确捕获会被 `Drop`、数组、裸指针截断。**

---

## 八、总结

> **闭包把"行为 + 环境"打包成一个值：捕获变量是匿名结构体的字段，调用闭包就是调用它的方法。**
>
> 它让行为第一次可以像数据一样被传递；但它本身还是静态的。而动态化则从 `dyn` 开始。
>
> 并发里这条"结构体"规则同样成立：闭包能不能跨线程，取决于字段（捕获物）是不是 `Send`。
