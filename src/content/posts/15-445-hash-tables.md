---
title: 数据库中的哈希表：从线性探测到布谷鸟哈希
published: 2025-04-10
description: 介绍数据库执行引擎中的哈希表实现，涵盖静态哈希表的局限性与三种假设缺陷、线性探测的工作原理，以及布谷鸟哈希、可扩展哈希和线性哈希的设计思路。
tags: [CMU 15-445, 数据库, 哈希表, 线性探测, 布谷鸟哈希, 访问方法]
category: Database
draft: false
---

> 本文是 **CMU 15-445 Database Systems 第 7 节课**的学习笔记，主题为哈希表与访问方法。
让我们回顾一下本学期到目前为止的内容。我们从底层开始讲起：
1.  **磁盘管理 (Disk Management)**：我们首先讨论了如何管理磁盘。
2.  **缓冲管理器 (Buffer Manager)**：上一节课我们讲了缓冲管理器，即如何跟踪从磁盘调入内存的页面（pages）。

执行引擎 (Execution Engine)**：现在，是时候开始处理这些页面了。我们知道它们如何组织，知道如何将数据放入其中。接下来的几周，我们将专注于构建**执行引擎**，用于解释这些页面存储的内容、运行查询以及执行数据库系统所需的所有操作。

在接下来的几节课中，我们将重点讨论**访问方法 (Access Methods)**。这是系统的内部组件，允许我们访问存储在磁盘上的页面，并从中提取意义。
*   **今天 (Today)**：我们将讨论**哈希表 (Hash Tables)**。这是一种无序（unordered）数据结构，将在整个系统中用于各种目的。
*   **下周一 (Next Monday)**：我们将讨论**树 (Trees)**，特别是 **B+ 树 (B+ Tree)**。这些是能够保持值或键顺序的数据结构。我之所以需要这种有序性，是因为我们需要知道数据的位置、如何进行排名（ranking）等操作。


<details>
关于哈希表的知识点补充
哈希表,其高层思想是实现一个**关联无序数组 (associative unordered array)**，将键映射到值。
*   **应用场景**：键和值会根据上下文变化。它可以用于内部元数据，也可以用于实际表的索引（此时键与表中的元组相关）。
*   **工作原理**：哈希表依赖**哈希函数 (Hash Function)** 计算给定键的偏移量或位置。该位置要么精确指向键，要么至少接近它，让我们可以搜索并找到目标键。
*   **无序性**：由于哈希函数将任意字节数组转换为看似随机的数字（至少在第一步），这使得数据分布完全随机。这与有序结构（如树）不同，在树中我们可以按顺序扫描。这种随机性有助于处理数据倾斜（skew），使数据均匀分布。
</details>

哈希表
**复杂度分析**：
*   **空间复杂度 (Space Complexity)**：$O(n)$，其中 $n$ 是需存储的键的数量。
*   **时间复杂度 (Time Complexity)**：平均情况为 $O(1)$。最坏情况下为 $O(n)$（需要检查每个键）。
    *   *注*：虽然算法理论家喜欢 $O(1)$，但在现实中，常数因子（constant factor）很重要。如果哈希函数计算极慢（如耗时 100ms），即使复杂度是 $O(1)$，实际性能也很差。因此，我们会看到 B+ 树（$O(\log n)$）在特定场景下可能更优，因为“常数等于金钱（constants equal money）”。

### 7. 静态哈希表的局限性 (Limitations of Static Hashing)

让我们假设有一个巨大的数组，我们知道键的数量 $n$，并为每个可能的键预留指针。
*   **问题 1：稀疏性 (Sparsity)**。如果只有两个键，但可能值有十亿个，我们仍需存储十亿个条目，浪费空间。
*   **问题 2：碰撞 (Collisions)**。如果两个不同键的哈希值相同怎么办？（虽然静态方案假设无冲突，但这不现实）。
*   **问题 3：缓存不友好 (Cache Unfriendly)**。CPU 缓存（cache）对随机内存访问不友好。查找键后跟随指针跳转到非局部内存会导致性能下降。
**三个不现实的假设**：
1.  我们知道键的数量（通常不知道）。
2.  没有碰撞（现实中会发生）。
3.  存在完美的哈希函数（Perfect Hash Function），能将任意唯一键映射到唯一位置。虽然理论上存在，但实践中很难实现，且需要额外元数据。

这里教授也推荐直接用别人写好的函数,自己写的话确实太辛苦了

静态哈希:
我们将讨论两种变体，统称为**开放寻址哈希表 (Open Addressing Hash Tables)**：
1.  **线性探测 (Linear Probing)**：最常见。
2.  **布谷鸟哈希 (Cuckoo Hashing)**：线性探测的扩展。

*(注：其他变体如 Robin Hood hashing, Hopscotch hashing, Swiss tables 将在高级课程中讨论)*

#### 线性探测 (Linear Probing)
*   **原理**：一个固定长度的槽位（slot）数组。
    *   计算 `hash(key) % n` 得到起始位置。
    *   **插入**：如果位置被占用，则顺序扫描（scan linearly）直到找到空闲槽位。
    *   **查找**：同样顺序扫描，直到找到键或遇到空槽位（表示键不存在）。
*   **循环缓冲区**：如果到达数组末尾仍未找到空位，则回绕到开头（需记录起始位置以防死循环）。
*   **负载因子 (Load Factor)**：必须监控已占用槽位的百分比。通常设定阈值（如 70%-80%）。超过阈值时，需**扩容 (Resize)**：创建新表（通常是双倍大小），重新哈希所有键并迁移。
    *   *PostgreSQL 优化*：在 Hash Join 中尝试估算元组数量以正确 sizing 哈希表，避免频繁扩容。

**示例演示**：
插入 A, B, C... 当 C 与 A 冲突时，C 移动到下一个空闲位置。
*   **查找复杂性**：如果查找 E，而 C 占据了 A 的位置，我们需要比较键值（key comparison）直到找到 E 或空位。
*   **删除问题 (Deletion Problem)**：
    *   如果直接清空槽位，后续查找 D（原本在 C 之后）会提前终止，因为遇到了空位。
    *   **方案 A：移动元素 (Movement)**。将下方所有元素重新哈希并上移。**缺点**：代价极高（需重新哈希一切），不可取。
    *   **方案 B：墓碑标记 (Tombstones)**。删除时不真正清空，而是标记为“逻辑删除”。查找时跳过墓碑继续扫描。插入时可利用墓碑位置。这是最常用的方法。
        *   *负载因子计算*：墓碑通常计入占用空间，因为必须扫描过去。

**非唯一键处理 (Non-Unique Keys)**：
*   **方案 A：链表 (Linked Lists)**。槽位存储指向值列表的指针。查找时遍历列表（顺序或二分搜索）。需要额外维护页面。
*   **方案 B：忽略重复 (Ignore Duplicates)**。将冗余键视为唯一键处理，插入时继续扫描直到找到空位。查询所有值时需扫描直到遇到空位。**缺点**：浪费空间（存储多个相同键），但无需额外结构。

#### 优化与实现细节
*   **类型特化 (Type Specialization)**：ClickHouse 拥有 20 种不同版本的哈希表以适应不同类型，这是非常出色的优化。
*   **元数据分离**：使用单独的数组或哈希表存储元数据。
*   **版本控制 (Versioning)**：ClickHouse 使用版本号机制。如果槽位版本号不匹配当前查询的版本号，视为空。这允许快速清零哈希表以供下次查询重用。

#### 布谷鸟哈希 (Cuckoo Hashing)
*   **原理**：使用多个哈希函数（通常为 2 个或 3 个）。每个键通过不同函数映射到不同位置。
*   **查找**：只需检查两个位置，无需扫描。保证 $O(1)$ 查找。
*   **插入**：如果两个位置都被占用，必须“踢出”其中一个元素（clobber），将其重新插入。被踢出的元素再次哈希，可能再次踢出其他元素，形成链式反应。
    *   *死锁风险*：如果循环发生，需检测并扩容。
*   **权衡**：插入操作可能非常昂贵（bouncing back and forth），但查找极快。
*   **实现**：IBM DB2 Blue 曾使用此技术。开源最佳实现来自 CMU 的 Dave Anderson（由本科生编写）。


可扩展哈希:
可扩展哈希（Extendible Hashing）是一种动态哈希方法，能在数据量增长时通过**目录扩展**和**桶分裂**来避免大量数据重哈希。它的核心思想是用一个**目录数组**来间接引用存储数据的**桶**，并通过两个全局/局部深度参数来控制扩展。

下面我用一个简化的例子，逐步说明它的实现过程。

## 核心数据结构

- **目录（Directory）**：一个数组，每个条目指向一个桶。目录有一个**全局深度（Global Depth）** `G`，目录大小为 `2^G`。
- **桶（Bucket）**：每个桶最多能存 `B` 个键值对（例如 `B=2`）。每个桶有自己的**局部深度（Local Depth）** `L`（`L ≤ G`）。
- **哈希函数**：输出一个固定长度的二进制串（如32位），我们取它的**后 `G` 位**（或前 `G` 位）作为目录索引。

## 基本操作原理

### 1. 查找
- 对键 `key` 计算哈希值 `h(key)`。
- 取 `h(key)` 的**最后 `G` 位**作为目录下标。
- 跟随目录指针找到桶，在桶内顺序查找。

### 2. 插入
假设 `B=2`（每个桶最多存2个键），初始状态：
- `G=1`，目录大小 `2^1=2`，两个条目都指向同一个空桶（这个桶局部深度 `L=1`）。  
  实际上，初始时可以让 `G=0` 目录大小为1，但为了演示，我们从 `G=1` 开始。

**插入步骤**：

1. 通过哈希值找到对应桶。
2. 如果桶未满，直接插入，结束。
3. 如果桶已满：
   - **创建新桶**，新桶的局部深度 = 原桶局部深度 + 1。
   - **重新分配原桶中的记录**：根据哈希值在**新局部深度**位下的值，决定放入原桶还是新桶。
   - **更新目录**：
     - 如果 `L < G`（局部深度小于全局深度）：不需要扩展目录，只需将目录中原来指向原桶的某些指针改为指向新桶。
     - 如果 `L == G`（桶的局部深度等于全局深度）：**目录需要翻倍**（`G` 加1，目录大小翻倍），然后将原目录内容复制一份到新目录，再进行指针调整。

## 具体例子（B=2）

假设我们用4位哈希值，实际只取低 `G` 位用于寻址。

### 初始状态
`G=1`，目录大小=2，两个指针都指向桶A（`L=1`）。  
桶A空。

### 插入 `key1` (哈希低1位 = 0)
- 目录[0] → 桶A，插入成功。桶A: [key1]

### 插入 `key2` (哈希低1位 = 1)
- 目录[1] → 桶A，桶A插入（现在桶A: [key1, key2]）

### 插入 `key3` (低1位 = 0)
- 目录[0] → 桶A，已满（B=2），需要分裂：
  - 原桶A的`L=1`，且 `L == G` (都是1)，所以需要**目录翻倍**：
    - `G` 变为2，目录大小变为4。
    - 新目录[0..3]，每个位置复制原目录对应位：  
      原目录[0] → 新目录[0]和[2]? 注意：此时低2位的匹配规则：  
      原 `h & 0b01` 决定目录位置，现在 `h & 0b11` 决定新位置。  
      通常做法：扩展后，新目录的 `(h & (2^G -1))` 与旧目录 `(h & (2^(G-1)-1))` 一致。  
      简单点：复制旧目录两遍：[A, A, A, A]？等一下，要仔细。
  - 实际上：假设旧目录大小2，索引由第1位决定（二进制位0）。扩展后第2位（位1）与第1位（位0）组合决定新索引。  
    为了兼容，我们将旧目录[0]放到新目录[00]和[10]（即索引0和2），旧目录[1]放到新目录[01]和[11]（即1和3）。所以新目录指向：桶A、桶A、桶A、桶A。
  - 但现在我们有两个新桶：新桶B（`L=2`），桶A（`L=1`）需要变为？原桶A需要分裂成两个桶：一个局部深度2，另一个局部深度2？不对，看规则：  
    原桶A的局部深度1，现在需要分裂，因为 `L==G` 所以全局深度加1，目录翻倍。然后对原桶A中的记录（key1, key2, key3? 等一下，key3还没插入，正在插入key3时触发的分裂）——我们必须在分裂前先插入key3？实际上是插入key3时发现桶满，先分裂，再插入key3。
  - 重新整理更标准的过程：
    - 当前桶A: [key1(00), key2(01)]，插入key3(00) → 桶满。
    - 创建新桶C(`L=2`)，原桶A的`L`从1升为2？不，原桶A变为旧桶，需要将原桶A中的记录按新`L=2`（即低2位）重新散列：  
      key1(h=00) → 桶A? 其实两个新桶的编号：根据低2位的**最后一位**已经不唯一，要看第二位。实际上更通用的机制：
        - 二进制哈希值假设为 ...b2 b1 b0，取低G位。当桶分裂时，原来用低L位区分，现在需要用低L+1位区分。
        - 假设旧桶的低L位掩码为 mask1 = 2^L -1，旧桶内所有记录的低L位相同（因为之前是通过这L位分到这个桶的）。
        - 新桶根据低L+1位的**第L位**（从0计）是0还是1，将原桶中的记录分到两个桶中：一个保持原来的低L位，另一个第L位为1。
    - 对于我们的例子：旧桶A的低1位=0（即所有键的低位都是0，因为目录按低位索引）。  
      现在看低2位：key1(00) → 低2位=00 → 留在原索引对应的桶？key2(01) → 实际上key2的低1位是1，它本来应该由目录[1]指向，为什么之前会进入桶A？因为初始时目录[1]也指向桶A。这说明初始时我们允许不同低位值的记录混在同一个桶里，只要它们最终通过目录索引到同一个桶。
    - 为了避免这种混乱，现实的实现中，一开始全局深度=0，只有一个桶。插入时分裂再增加深度。
  
我们改用更清晰的教科书初始状态：

**真正的初始**：`G=0`，目录大小1，指向一个空桶（`L=0`）。  
B=2。

1. 插入key1 (hash=...00) → 桶未满，插入。
2. 插入key2 (hash=...01) → 桶未满（B=2），插入，现在桶内有[key1,key2]。
3. 插入key3 (hash=...10)：
   - 找到桶，已满，`L=0` == `G=0`，需要目录翻倍：`G=1`，目录大小2。
   - 新目录[0]指向原桶，新目录[1]也指向原桶（因为原只有一个桶）。
   - 原桶局部深度 `L=1`（因为分裂时 `L` 加1，但更准确：原桶现在要分裂成两个桶，每个桶 `L=1`，但我们的原桶作为旧桶会被替换）。
   - 重新分配原桶中的三个记录？不对，现在原桶中只有两个记录（key1,key2），但我们要插入key3，所以先分裂再插入。
   - 具体：创建桶0（`L=1`），桶1（`L=1`）。  
     根据哈希值的低1位分配： key1(...00)低1位=0→桶0；key2(...01)低1位=1→桶1。
     然后插入key3(...10)低1位=0→桶0，桶0未满，插入成功。  
     目录[0]指向桶0，目录[1]指向桶1。

这样清晰了。继续插入 key4 (hash=...11)：
- 目录[1]→桶1，桶1只有一个key2，未满，插入。

插入 key5 (hash=...00)：
- 目录[0]→桶0，桶0已有key1和key3，满。  
  桶0的`L=1`，`G=1`，`L==G`，需要目录翻倍：`G=2`，目录大小4。  
  新目录：原有目录[0]的内容复制到新目录[0]和[2]，原目录[1]复制到[1]和[3]。  
  桶0局部深度变为2，分裂成两个新桶：桶00（L=2），桶10（L=2）。  
  根据低2位分配：key1(00)→桶00；key3(10)→桶10；key5(00)→桶00。  
  桶00现在有key1和key5（满），桶10有key3。  
  目录[0]指向桶00，目录[2]指向桶10，目录[1]仍指向原桶1（L=1），目录[3]仍指向原桶1。

最终结构就是一个动态扩展的目录和桶。

## 优点与缺点

- **优点**：扩展时只分裂单个桶，不需要对整个表重哈希；查找通常只需一次磁盘访问（目录在内存，桶可能在磁盘）；非常适合动态增长的数据集。
- **缺点**：目录可能变得很大（指数增长）；如果哈希值分布不均匀，可能导致很多空指针或桶利用率低；并发控制比较复杂。

<details>

补充:
go语言代码实现示例:
```go
package main

import (
	"fmt"
)

// Bucket 表示一个存储键的桶
type Bucket struct {
	localDepth int          // 局部深度
	keys       []int        // 存储键的切片（假设没有重复键）
	capacity   int          // 桶的容量
}

// NewBucket 创建一个新桶，指定局部深度和容量
func NewBucket(localDepth, capacity int) *Bucket {
	return &Bucket{
		localDepth: localDepth,
		keys:       make([]int, 0, capacity),
		capacity:   capacity,
	}
}

// isFull 判断桶是否已满
func (b *Bucket) isFull() bool {
	return len(b.keys) >= b.capacity
}

// contains 检查桶中是否存在某个键（线性搜索，桶大小很小）
func (b *Bucket) contains(key int) bool {
	for _, k := range b.keys {
		if k == key {
			return true
		}
	}
	return false
}

// add 向桶中添加一个键，假设调用前已检查未满且键不存在
func (b *Bucket) add(key int) {
	b.keys = append(b.keys, key)
}

// remove 从桶中移除一个键（本示例未使用，但可用于删除功能）
func (b *Bucket) remove(key int) {
	for i, k := range b.keys {
		if k == key {
			b.keys = append(b.keys[:i], b.keys[i+1:]...)
			return
		}
	}
}

// ExtendibleHash 可扩展哈希结构
type ExtendibleHash struct {
	directory   []*Bucket // 目录，每一项指向一个桶
	globalDepth int       // 全局深度
	bucketSize  int       // 每个桶的最大容量
}

// NewExtendibleHash 创建一个新的可扩展哈希，初始全局深度为 1，目录大小为 2
func NewExtendibleHash(bucketSize int) *ExtendibleHash {
	eh := &ExtendibleHash{
		globalDepth: 1,
		bucketSize:  bucketSize,
	}
	// 初始化目录，大小为 2^1 = 2
	eh.directory = make([]*Bucket, 2)
	// 创建一个空桶，局部深度 = 全局深度 = 1
	bucket := NewBucket(1, bucketSize)
	// 两个目录项都指向同一个桶（初始所有键都进入这个桶）
	eh.directory[0] = bucket
	eh.directory[1] = bucket
	return eh
}

// hash 计算键的哈希值（这里直接使用键本身作为哈希，实际应用应使用更均匀的哈希函数）
// 为了演示可扩展哈希的行为，我们使用键本身，但这样容易导致分布不均。
// 更真实的场景可以将键转换为字节后使用 hash/fnv。
func (eh *ExtendibleHash) hash(key int) uint64 {
	// 简单返回 uint64(key)，低 depth 位用于寻址
	return uint64(key)
}

// getIndex 根据哈希值和深度计算目录索引（取低 depth 位）
func (eh *ExtendibleHash) getIndex(hash uint64, depth int) int {
	// 掩码：低 depth 位全部置 1
	mask := (1 << depth) - 1
	return int(hash & uint64(mask))
}

// split 对指定目录索引位置的桶进行分裂
// 注意：分裂后可能引起目录翻倍，且分裂后需要重新将原桶中的键分配到两个新桶
func (eh *ExtendibleHash) split(index int) {
	bucket := eh.directory[index]
	if bucket == nil {
		return
	}

	// 当前桶的局部深度
	oldLocalDepth := bucket.localDepth
	// 新局部深度 = 原深度 + 1
	newLocalDepth := oldLocalDepth + 1

	// 如果局部深度达到了全局深度，需要先让目录翻倍
	if newLocalDepth > eh.globalDepth {
		eh.doubleDirectory()
		// 目录翻倍后，原 index 对应的新索引需要重新计算？
		// 注意：doubleDirectory 后，目录大小翻倍，但原本 index 指向的桶仍然是原来的桶，
		// 且由于全局深度增加，原来同一个索引对应的多个目录项现在可能指向同一个桶，
		// 这正好是我们需要的：分裂时只改变部分目录项的指向。
		// 但为了正确获取当前要分裂的桶的目录索引集合，我们需要重新计算。
		// 最简单的做法：在 doubleDirectory 后，原来的 index 代表的“位模式”会对应多个新索引，
		// 我们只修改那些原本指向这个桶的目录项。分裂后，一部分指向新桶，一部分指向旧桶（变为新桶）。
		// 为了代码清晰，我们在 doubleDirectory 后，重新更新所有目录项指向。但更好的方式是：
		// 在 split 开始时，先获取所有指向原桶的目录索引，然后对这些索引进行分裂操作。
		// 我们采用更直接的方式：先获得所有需要改变指向的索引列表。
	}

	// 重新获取当前桶（有可能在 doubleDirectory 后 bucket 还是同一个）
	currentBucket := eh.directory[index]
	// 创建两个新桶，局部深度都是 newLocalDepth
	newBucket0 := NewBucket(newLocalDepth, eh.bucketSize)
	newBucket1 := NewBucket(newLocalDepth, eh.bucketSize)

	// 将原桶中的每个键重新分配到新桶中
	// 根据哈希值的低 (newLocalDepth) 位的最后一位（即第 oldLocalDepth 位）决定去哪个桶
	for _, key := range currentBucket.keys {
		h := eh.hash(key)
		// 取低 newLocalDepth 位
		mask := (1 << newLocalDepth) - 1
		hashLow := int(h & uint64(mask))
		// 检查第 oldLocalDepth 位（0-indexed）是 0 还是 1
		// 方法： (hashLow >> oldLocalDepth) & 1
		bit := (hashLow >> oldLocalDepth) & 1
		if bit == 0 {
			newBucket0.add(key)
		} else {
			newBucket1.add(key)
		}
	}

	// 更新目录：所有指向原桶的目录项，根据其索引的第 oldLocalDepth 位决定指向 newBucket0 还是 newBucket1
	// 注意：目录大小现在是 2^globalDepth
	dirSize := 1 << eh.globalDepth
	// 遍历所有目录项，只要该项指向 currentBucket，就重新指向
	for i := 0; i < dirSize; i++ {
		if eh.directory[i] == currentBucket {
			// 获取索引 i 的低 (oldLocalDepth+1) 位，检查第 oldLocalDepth 位
			mask := (1 << (oldLocalDepth + 1)) - 1
			hashLow := i & mask
			bit := (hashLow >> oldLocalDepth) & 1
			if bit == 0 {
				eh.directory[i] = newBucket0
			} else {
				eh.directory[i] = newBucket1
			}
		}
	}
	// 注意：原桶 currentBucket 不再被任何目录项引用，将被垃圾回收
}

// doubleDirectory 将目录大小翻倍，全局深度加 1
func (eh *ExtendibleHash) doubleDirectory() {
	oldDir := eh.directory
	newSize := 1 << (eh.globalDepth + 1)
	newDir := make([]*Bucket, newSize)
	// 复制旧目录到新目录：每个旧索引 i 映射到新索引 i 和 i+旧大小
	for i := 0; i < len(oldDir); i++ {
		newDir[i] = oldDir[i]
		newDir[i+len(oldDir)] = oldDir[i]
	}
	eh.directory = newDir
	eh.globalDepth++
}

// Insert 插入一个键，如果键已存在则覆盖（这里简单忽略重复）
func (eh *ExtendibleHash) Insert(key int) {
	h := eh.hash(key)
	// 获取当前全局深度下应该访问的目录索引
	idx := eh.getIndex(h, eh.globalDepth)
	bucket := eh.directory[idx]

	// 如果键已经存在，则不重复添加（可选：更新值）
	if bucket.contains(key) {
		return
	}

	// 如果桶未满，直接添加
	if !bucket.isFull() {
		bucket.add(key)
		return
	}

	// 桶已满，需要分裂
	// 注意：分裂后，当前键需要重新插入。由于分裂可能递归，我们用一个循环来处理多次分裂
	for {
		// 分裂当前桶
		eh.split(idx)
		// 分裂后，重新计算索引并获取新桶
		newIdx := eh.getIndex(h, eh.globalDepth)
		newBucket := eh.directory[newIdx]
		// 如果新桶中已经有该键，直接返回
		if newBucket.contains(key) {
			return
		}
		// 如果新桶未满，插入并退出循环
		if !newBucket.isFull() {
			newBucket.add(key)
			return
		}
		// 否则，新桶仍然满（可能是因为哈希碰撞导致多个相同低位的键），继续分裂
		idx = newIdx
		// 防止无限循环（理论上一轮分裂后新桶不可能再满，除非容量为1或hash极端；这里安全处理）
	}
}

// Search 查找键是否存在
func (eh *ExtendibleHash) Search(key int) bool {
	h := eh.hash(key)
	idx := eh.getIndex(h, eh.globalDepth)
	bucket := eh.directory[idx]
	return bucket.contains(key)
}

// Print 打印哈希表的结构，用于调试和观察
func (eh *ExtendibleHash) Print() {
	fmt.Printf("Global Depth: %d, Directory Size: %d\n", eh.globalDepth, len(eh.directory))
	for i, bucket := range eh.directory {
		if bucket == nil {
			fmt.Printf("  Dir[%d] -> nil\n", i)
			continue
		}
		fmt.Printf("  Dir[%d] -> Bucket(localDepth=%d, keys=%v)\n", i, bucket.localDepth, bucket.keys)
	}
	fmt.Println()
}

func main() {
	// 创建一个桶容量为 2 的可扩展哈希
	eh := NewExtendibleHash(2)

	// 插入一些键，观察分裂和目录扩展
	keysToInsert := []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}

	fmt.Println("=== 初始状态 ===")
	eh.Print()

	for _, key := range keysToInsert {
		fmt.Printf("插入键 %d:\n", key)
		eh.Insert(key)
		eh.Print()
	}

	// 测试查找
	fmt.Println("=== 查找测试 ===")
	testKeys := []int{1, 3, 5, 7, 9, 11}
	for _, k := range testKeys {
		found := eh.Search(k)
		fmt.Printf("键 %d 存在? %v\n", k, found)
	}
}
```

Rust实现示例:
```rust
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// 存储键值对的桶（为简化，只存储键，实际可存键值对）
struct Bucket<K> {
    local_depth: usize,   // 局部深度
    keys: Vec<K>,         // 存储键的向量
    capacity: usize,      // 桶的最大容量
}

impl<K> Bucket<K> {
    /// 创建一个新桶，指定局部深度和容量
    fn new(local_depth: usize, capacity: usize) -> Self {
        Bucket {
            local_depth,
            keys: Vec::with_capacity(capacity),
            capacity,
        }
    }

    /// 判断桶是否已满
    fn is_full(&self) -> bool {
        self.keys.len() >= self.capacity
    }

    /// 检查键是否已存在（线性搜索，桶容量小）
    fn contains(&self, key: &K) -> bool
    where
        K: PartialEq,
    {
        self.keys.iter().any(|k| k == key)
    }

    /// 向桶中添加键（调用前确保未满且键不存在）
    fn add(&mut self, key: K) {
        self.keys.push(key);
    }

    /// 移除键（未在插入流程中使用，仅供扩展）
    fn remove(&mut self, key: &K) -> bool
    where
        K: PartialEq,
    {
        if let Some(pos) = self.keys.iter().position(|k| k == key) {
            self.keys.remove(pos);
            true
        } else {
            false
        }
    }
}

/// 可扩展哈希表
pub struct ExtendibleHash<K> {
    directory: Vec<*mut Bucket<K>>, // 目录，存储裸指针（需手动管理内存），也可用 Rc/RefCell，但裸指针更贴近底层
    global_depth: usize,            // 全局深度
    bucket_capacity: usize,         // 每个桶的容量
}

// 手动实现 Send/Sync 因为裸指针需要在线程间安全（示例中不涉及并发，仅为演示）
unsafe impl<K> Send for ExtendibleHash<K> {}
unsafe impl<K> Sync for ExtendibleHash<K> {}

impl<K> ExtendibleHash<K>
where
    K: Hash + Eq + Clone, // 需要键可哈希、相等、克隆（便于重新分配时复制）
{
    /// 创建一个新的可扩展哈希表，初始全局深度为 1，目录大小为 2
    pub fn new(bucket_capacity: usize) -> Self {
        let global_depth = 1;
        let dir_size = 1 << global_depth;
        // 创建一个初始桶，局部深度 = 全局深度
        let initial_bucket = Box::into_raw(Box::new(Bucket::new(global_depth, bucket_capacity)));
        let mut directory = Vec::with_capacity(dir_size);
        for _ in 0..dir_size {
            directory.push(initial_bucket);
        }
        ExtendibleHash {
            directory,
            global_depth,
            bucket_capacity,
        }
    }

    /// 计算键的哈希值（使用标准库 DefaultHasher）
    fn hash(&self, key: &K) -> u64 {
        let mut hasher = DefaultHasher::new();
        key.hash(&mut hasher);
        hasher.finish()
    }

    /// 根据哈希值和深度计算目录索引（取低 depth 位）
    fn get_index(&self, hash: u64, depth: usize) -> usize {
        let mask = (1 << depth) - 1;
        (hash & mask) as usize
    }

    /// 目录翻倍：全局深度加 1，新目录长度翻倍，并将原目录的指针复制到新目录的对应位置
    fn double_directory(&mut self) {
        let old_dir = std::mem::take(&mut self.directory);
        let new_size = 1 << (self.global_depth + 1);
        let mut new_dir = Vec::with_capacity(new_size);
        // 每个旧索引 i 对应新索引 i 和 i + old_size
        for _ in 0..new_size {
            new_dir.push(std::ptr::null_mut());
        }
        for (i, &ptr) in old_dir.iter().enumerate() {
            new_dir[i] = ptr;
            new_dir[i + old_dir.len()] = ptr;
        }
        self.directory = new_dir;
        self.global_depth += 1;
    }

    /// 分裂指定索引处的桶
    /// 注意：分裂可能引起目录翻倍，且需要重新分配原桶内的键到两个新桶
    fn split(&mut self, index: usize) {
        let old_bucket_ptr = self.directory[index];
        if old_bucket_ptr.is_null() {
            return;
        }
        let old_bucket = unsafe { &*old_bucket_ptr };
        let old_local_depth = old_bucket.local_depth;
        let new_local_depth = old_local_depth + 1;

        // 如果新局部深度超过全局深度，先翻倍目录
        if new_local_depth > self.global_depth {
            self.double_directory();
        }

        // 重新获取原桶指针（double_directory 后目录可能已改变，但原桶指针仍有效）
        let old_bucket_ptr = self.directory[index];
        let old_bucket = unsafe { &*old_bucket_ptr };

        // 创建两个新桶
        let mut new_bucket0 = Box::new(Bucket::new(new_local_depth, self.bucket_capacity));
        let mut new_bucket1 = Box::new(Bucket::new(new_local_depth, self.bucket_capacity));

        // 将原桶中的所有键重新分配到新桶中
        // 根据哈希值的第 old_local_depth 位决定去向
        for key in old_bucket.keys.iter() {
            let hash = self.hash(key);
            let mask = (1 << new_local_depth) - 1;
            let low_bits = hash & mask;
            let bit = (low_bits >> old_local_depth) & 1;
            if bit == 0 {
                new_bucket0.add(key.clone());
            } else {
                new_bucket1.add(key.clone());
            }
        }

        // 将两个新桶转为裸指针
        let new_bucket0_ptr = Box::into_raw(new_bucket0);
        let new_bucket1_ptr = Box::into_raw(new_bucket1);

        // 遍历目录，将所有指向 old_bucket_ptr 的条目更新为新桶
        let dir_size = 1 << self.global_depth;
        for i in 0..dir_size {
            if self.directory[i] == old_bucket_ptr {
                // 根据索引 i 的第 old_local_depth 位决定指向哪个新桶
                let mask = (1 << (old_local_depth + 1)) - 1;
                let low_bits = i & mask;
                let bit = (low_bits >> old_local_depth) & 1;
                if bit == 0 {
                    self.directory[i] = new_bucket0_ptr;
                } else {
                    self.directory[i] = new_bucket1_ptr;
                }
            }
        }

        // 释放原桶内存
        let _ = unsafe { Box::from_raw(old_bucket_ptr) };
    }

    /// 插入一个键
    pub fn insert(&mut self, key: K) {
        let hash = self.hash(&key);
        let mut idx = self.get_index(hash, self.global_depth);

        // 循环处理可能多次分裂的情况
        loop {
            let bucket_ptr = self.directory[idx];
            // 安全：bucket_ptr 总是有效的
            let bucket = unsafe { &mut *bucket_ptr };

            if bucket.contains(&key) {
                // 键已存在，直接返回
                return;
            }

            if !bucket.is_full() {
                bucket.add(key);
                return;
            }

            // 桶已满，需要分裂
            self.split(idx);
            // 分裂后重新计算当前键应该去的索引（全局深度可能已变）
            idx = self.get_index(hash, self.global_depth);
        }
    }

    /// 查找键是否存在
    pub fn search(&self, key: &K) -> bool {
        let hash = self.hash(key);
        let idx = self.get_index(hash, self.global_depth);
        let bucket_ptr = self.directory[idx];
        if bucket_ptr.is_null() {
            return false;
        }
        let bucket = unsafe { &*bucket_ptr };
        bucket.contains(key)
    }

    /// 打印哈希表结构（用于调试）
    pub fn print(&self)
    where
        K: std::fmt::Debug,
    {
        println!("Global Depth: {}", self.global_depth);
        println!("Directory Size: {}", self.directory.len());
        for (i, &ptr) in self.directory.iter().enumerate() {
            if ptr.is_null() {
                println!("  Dir[{}] -> null", i);
                continue;
            }
            let bucket = unsafe { &*ptr };
            println!(
                "  Dir[{}] -> Bucket(local_depth={}, keys={:?})",
                i, bucket.local_depth, bucket.keys
            );
        }
        println!();
    }
}

// 为 Bucket 和 ExtendibleHash 实现 Drop，确保裸指针被正确释放
impl<K> Drop for ExtendibleHash<K> {
    fn drop(&mut self) {
        // 收集所有不同的桶指针，避免重复释放
        let mut seen = std::collections::HashSet::new();
        for &ptr in self.directory.iter() {
            if !ptr.is_null() && !seen.contains(&ptr) {
                seen.insert(ptr);
                let _ = unsafe { Box::from_raw(ptr) };
            }
        }
    }
}

fn main() {
    // 创建桶容量为 2 的可扩展哈希表
    let mut eh = ExtendibleHash::new(2);

    // 插入一些测试键（使用 u64 作为键类型）
    let keys_to_insert = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    println!("=== 初始状态 ===");
    eh.print();

    for key in keys_to_insert {
        println!("插入键 {}", key);
        eh.insert(key);
        eh.print();
    }

    // 查找测试
    println!("=== 查找测试 ===");
    let test_keys = vec![1, 3, 5, 7, 9, 11];
    for key in test_keys {
        let found = eh.search(&key);
        println!("键 {} 存在? {}", key, found);
    }
}
```

</details>




#### 线性哈希 (Linear Hashing)
*   **原理**：PostgreSQL 使用的动态哈希方案（称为 `dynahash`）。
    *   维护一个**分裂指针 (Split Pointer)**，指向下一个需要分裂的桶。
    *   当某个桶溢出时，不一定立即分裂该桶，而是移动分裂指针到下一个桶进行分裂。这是一种“随机”或渐进式的平衡策略。
    *   **查找逻辑**：
        *   如果键的哈希值在分裂指针之前（未分裂部分），使用旧哈希函数。
        *   如果在之后（已分裂部分），可能需要使用新的哈希函数（模 $2n$）。
    *   **删除**：如果桶为空且位于分裂指针之前，可真正清理；否则标记为逻辑删除并移动指针。


