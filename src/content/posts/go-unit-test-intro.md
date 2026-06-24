---
title: GO 语言单元测试入门
published: 2025-05-01
description: Go 的测试工具链高度集成、零依赖。testing 是标准库，go test 是官方命令，开箱即用。涵盖基本规范、表驱动测试、Benchmark、Mock 等完整知识。
tags: [Go, Testing, UnitTest]
category: Go
draft: false
---
> Go 的测试工具链高度集成、零依赖。
> `testing` 是标准库，`go test` 是官方命令 —— 开箱即用。

---

## 一、基本规范

| 规范 | 说明 |
|------|------|
| 测试文件 | `_test.go` 结尾，通常与被测代码同包 |
| 测试函数 | `func TestXxx(t *testing.T)` |
| 运行 | `go test` / `go test -v` |

```go
// calc.go
func Add(a, b int) int { return a + b }

// calc_test.go
func TestAdd(t *testing.T) {
    result := Add(2, 3)
    if result != 5 {
        t.Errorf("got %d, want 5", result)
    }
}
```

---

## 二、错误报告

| 方法 | 行为 | 适用 |
|------|------|------|
| `t.Error/t.Errorf` | 记录错误，继续执行 | 多个断言需全部检查 |
| `t.Fatal/t.Fatalf` | 记录错误 + 立即终止 | 前置条件失败 |

```go
func TestParse(t *testing.T) {
    u, err := url.Parse("http://example.com")
    if err != nil {
        t.Fatalf("setup failed: %v", err) // 不可恢复
    }
    if u.Scheme != "http" {
        t.Errorf("scheme = %q, want http", u.Scheme) // 继续检查
    }
}
```

---

## 三、表驱动测试（Table-Driven）

Go 推荐的测试模式：

```go
func TestAdd(t *testing.T) {
    tests := []struct {
        name string
        a, b, want int
    }{
        {"positive", 2, 3, 5},
        {"negative", -1, -1, -2},
        {"zero", 0, 0, 0},
    }

    for _, tt := range tests {
        tt := tt  // 捕获循环变量
        t.Run(tt.name, func(t *testing.T) {
            if got := Add(tt.a, tt.b); got != tt.want {
                t.Errorf("Add(%d,%d) = %d; want %d", tt.a, tt.b, got, tt.want)
            }
        })
    }
}
```

> 每个子测试可独立运行：`go test -run TestAdd/positive`

---

## 四、t.Cleanup（Go 1.14+）

替代 defer 的特性：**无论测试成功/失败/panic，均保证执行。**

```go
func TestWithDB(t *testing.T) {
    db := setupDB(t)
    t.Cleanup(func() { db.Close() })  // 总是执行
    // ...
}
```

---

## 五、Benchmark 测试

```go
func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ {  // b.N 由框架自动调整
        Add(2, 3)
    }
}
```

```bash
go test -bench=. -benchmem
```

---

## 六、Mock：接口抽象 + 依赖注入

Go 不依赖 heavy mock 框架，通过**接口抽象**实现解耦：

```go
type HTTPClient interface {
    Get(url string) (*http.Response, error)
}

// 测试时传入 mock
type mockClient struct{ resp *http.Response; err error }
func (m *mockClient) Get(_ string) (*http.Response, error) { return m.resp, m.err }
```

> 原则：**Mock 接口，而非结构体；测试行为，而非实现。**

---

## 七、测试辅助函数

标记 `t.Helper()` 让错误定位指向调用处：

```go
func assertEq(t *testing.T, got, want int) {
    t.Helper()  // ← 关键
    if got != want {
        t.Fatalf("got %d, want %d", got, want)
    }
}
```

---

## 八、常用命令

| 命令 | 说明 |
|------|------|
| `go test` | 运行当前包测试 |
| `go test -v` | 详细输出 |
| `go test -run=TestFoo` | 精确匹配 |
| `go test -bench=. -benchmem` | Benchmark |
| `go test -cover` | 覆盖率 |
| `go test -race` | 竞态检测 |
| `go test -short` | 跳过慢测试 |

---

## 九、最佳实践

- 测试命名清晰：`TestParseDate_InvalidFormat_ReturnsError`
- 使用表驱动测试
- 只测公共行为，不依赖内部实现
- 保持测试快速、独立、可重复
- 避免 `time.Sleep`，改用 channel/context

