# 当前工作区快照

T10-A 提供捕获和持久化 SDK。比较报告与 verify CLI 分别属于 T10-B/T10-C，本页不把它们标为已实现。

```js
import { openStore } from 'threadport/storage';
import { SnapshotService } from 'threadport/workspace';
const store = await openStore({ dataDir: '/explicit/private/app-data' });
try {
  // 首次显式登记；canonicalRoot 必须指向所选本地 worktree 的根。
  store.createProject('project', 'Project');
  store.createWorkspace('workspace', 'project', '/explicit/local/project');
  const snapshot = await new SnapshotService(store).capture('workspace');
  // incompleteReasons 非空时 digest 为 null，不能用于宣称范围完整匹配。
  const saved = store.getSnapshot(snapshot.id);
} finally {
  store.close();
}
```

`captureWorkspace({id,projectId,canonicalRoot}, {limits?,signal?})` 只捕获，不写数据库。SnapshotService 从 Store 读取绑定，捕获后在短事务中复核绑定未变再保存；绑定变化返回 REVISION_CONFLICT。源工作区只读，数据目录应位于源码/日志目录之外。不存在的已登记目录可保存 SOURCE_MISSING 快照；不存在的 workspace ID 返回 NOT_FOUND。

## 范围与预算

每份快照包含应用生成 id、workspaceId、当前捕获开始时间 capturedAt、HEAD、digest、bindingDigest、algorithm、scope、incompleteReasons。算法 `threadport.workspace.raw.v1`，scope 为 `head-tracked-diff-untracked`；与旧 Capsule dirty_diff_hash 不能混用。bindingDigest 对绑定的 project/workspace ID、canonical root、Git dir/common dir 与目录设备/inode 做摘要，供后续比较区分身份；不输出原始私有路径。

实现读取 HEAD commit、完整 index 清单（含 mode/object ID/stage）、tracked 工作树文件原始内容/可执行位、未忽略 untracked 路径/内容与删除状态。通过这些信息覆盖 HEAD、暂存区和工作树差异；不依赖 Git patch 展示参数。为防止文件过滤器执行，不调用 git diff/status，不做内容规范化。Git 原生清单配合文件元数据提供状态复查。因此 CRLF 等原始字节改变也改变摘要，不能把它当作 Git clean-filter 规范化摘要。

默认最多 10000 路径、合计 64 MiB 工作树内容（tracked + untracked）。limits.maxFiles/maxBytes 只能调低，不能绕过上限。Git 命令每次输出最多 1 MiB、最多 5 秒；单次捕获包括重试共享 30 秒期限。内容以 64 KiB 缓冲区读取，不保存源码、patch 或文件内容副本。忽略文件、Git 内部对象内容、目录权限/ACL、业务正确性不在比较范围；submodule、symlink 和非常规文件不能完整捕获，返回 READ_FAILED，不下钻其内容。

## 完整性和失败

捕获前后复查 HEAD、index、untracked 清单和目录身份；每个文件检查打开前/后与最终审计的 device/inode/mode/size/mtime/ctime。发现变化最多重试一次，第二次仍变化为 RACED。预先或读取中取消会拒绝 Promise，SnapshotService 不保存取消的结果；期限或容量超限为 LIMIT_EXCEEDED。

原因包括 WORKSPACE_UNBOUND、SOURCE_MISSING、READ_FAILED、LIMIT_EXCEEDED、RACED、NO_GIT、NO_COMMIT。不完整结果 digest 为 null，未完成的 head/bindingDigest 保守为 null；原因不附带原始文件错误或机器路径。这里只返回捕获结果，不产生 matched/drifted 验证结论。

Git 使用固定只读子命令，移除继承的 GIT_* 重定向，关闭 fsmonitor、可选锁、提示与 lazy fetch；不执行 hooks、diff/textconv/clean/process 过滤器。工作树路径检查禁止已检测到的符号链接及祖先越界，打开时使用平台可用的 O_NOFOLLOW，并复核身份。这是尽力一致性读取，不是文件系统原子快照或抵御任意恶意路径竞态的操作系统隔离；不能声称捕获后文件不会继续变化。已知未完整范围从不生成可用摘要。

## 持久化、兼容与回滚

`getWorkspace(id)` 返回绑定或 null；`saveSnapshot(snapshot, expectedWorkspace?)` 校验 JSON、工作区外键与可选绑定，已存在相同记录可重复保存，不同内容禁止覆盖同一 ID；`getSnapshot(id)` 返回校验后的快照或 null。

沿用已有 snapshots 表，数据库仍为 schema 4，无迁移。当前快照不会补写历史 CommandRun.snapshotId，不会把旧测试认证为当前有效。旧 readGitState、Capsule v1 和 CLI 行为保持原状。

本包的文件、实际测试及回滚关系见 [T10-A 验收](../verification/t10-a-snapshot.md)。消费者未合并时可单独 revert 本包，快照数据保留；消费者出现后先处理依赖，不降级数据库。比较及 CLI 的后续工作见 [T10 包计划](../superpowers/plans/2026-09-14-t10-work-packages.md)。

## T10-B：显式比较 SDK

`import { verifyWorkspace } from 'threadport/workspace'`；调用 `await verifyWorkspace(snapshot, binding, options?)`。binding 是人工登记的 WorkspaceBinding（或 null），options 沿用捕获的预算与取消信号。读取当前状态不保存新快照，也不修改传入快照。

- 完整历史快照与当前捕获的 workspaceId、物理绑定身份一致，且 HEAD、指纹相同才返回 `matched`。
- 完整且绑定一致时，HEAD 不同返回 `drifted / HEAD_CHANGED`；同 HEAD 指纹不同返回 `drifted / CONTENT_CHANGED`。raw.v1 指纹包含 HEAD，因此 HEAD 变化时不能单凭它断言文件也变了。
- 任一捕获不完整、未绑定、ID/项目/物理根或 worktree 身份不符返回 `unverifiable`。缺失、失读、超限、持续并发变化分别保留安全原因；不完整性优先于差异判断。

报告包含原 snapshotId、workspaceId、verifiedAt、scope 和去重原因。当前聚合指纹无法定位单个变化文件，因此不编造 path 或输出本地绝对路径、底层异常。`matched` 只证明已声明范围的本次比较，不证明业务正确或历史测试仍有效；沿用 A 的 best-effort 读取限制。

portable Capsule 的 `.` 是展示路径，SDK 不根据进程 cwd 猜测项目；消费者必须提供实际登记的绝对 canonicalRoot。快照中没有根路径，绑定变化也不能靠替换路径绕过身份校验。结构损坏或不支持的算法/范围抛 INVALID_INPUT，显式取消向调用者传播。旧 Capsule 到报告的兼容转换及 CLI 留给 T10-C。

仅回滚 B 时移除比较 API，保留 A 的捕获、存储和现有 snapshots/人工绑定。先确认 C/T11/T12/T14 没有依赖；已有消费者先处理它们。无需 schema 降级。

## T10-C：verify CLI

```bash
threadport verify ./capsule.json --project /absolute/project --data-dir /private/threadport-data --json
threadport verify ./capsule.json --project /absolute/project --data-dir /private/threadport-data
```

`--project` 必填；相对路径按调用 cwd 解析。`--data-dir` 可选，默认沿用平台应用数据目录。stdout 是单份 JSON 或文本报告；诊断仅写 stderr。退出码：matched=0、drifted=4、unverifiable=6、输入错误=2、输入文件或数据库失败=5。未知/重复选项与多余位置参数返回 2。旧 `validate` 仍仅检查 schema，保持原来的 0/1 退出行为。

Capsule v1 字段冻结。为了显式选择 A 已保存的快照，CLI 识别一个现有 `evidence` 条目：

```json
{"kind":"other","title":"Explicit workspace snapshot","locator":"threadport:workspace-snapshot:<snapshot-id>"}
```

这是一条本地引用协议，不增加 Capsule schema 字段。生产者在人工选择工作区并通过 SnapshotService 保存快照后，才把该 ID 明确写入 evidence；不得为旧日志自动生成引用或选“最新快照”。ID 限 1–512 位 ASCII 字母、数字、点、下划线、连字符且首位为字母/数字；重复或非法引用是输入错误。其他 evidence 保持原义。引用不认证 Capsule 文本、命令结果或历史测试；matched 比较的是该引用的快照与当前工作区。

示例（已显式创建项目/工作区绑定并打开 store；输出 Capsule 位于工作区之外）：

```ts
const snapshot = await new SnapshotService(store).capture(workspaceId);
capsule.evidence.push({
  kind: 'other', title: 'Explicit workspace snapshot',
  locator: `threadport:workspace-snapshot:${snapshot.id}`,
});
await writeFile(outputOutsideWorkspace, serializeCapsule(capsule));
```

读取本地保存的绑定后，CLI 核对 `--project` 的真实路径，再调用 B；不会使用 Capsule 中的 `.` 或旧机器路径猜测绑定。CLI 以 SQLite readonly/fileMustExist 打开已有 schema 4，不建库、不迁移、不保存新快照；数据库损坏或版本不兼容返回 5，请用兼容版本处理。SQLite 可能维护自身 WAL 共享内存文件，因此应用数据目录应独立于被验证仓库。

没有引用、数据库不存在或引用记录不存在时返回 unverifiable；报告 snapshotId 可为 null，workspaceId/scope 为 null，表示没有可声明的范围。不能用虚构 ID 或完整范围填空。已有快照时报告遵循 B；未绑定、根目录不符、移动/失读等不会返回 matched；捕获结束再检查绑定是否变更。

回滚 C：确认后续消费者后，通过 PR revert C 的 squash 提交；保留 A/B SDK、schema 4、快照、绑定和既有 Capsule evidence 数据。旧版本会把该 evidence 当普通证据，不会自动执行它。撤销公开 verify 命令是回滚的用户可见变化。
