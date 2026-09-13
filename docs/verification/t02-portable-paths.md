# T02 · Portable 路径与证据身份

## 本地 Issue / 验收

Task：T02 / P0；Feature：F05；Regression：Q01/Q02。依赖 T01 已通过 PR #27 合并。

输入 HEAD：`02c20e7ec15baafbe6d395f020124cad9443886d`；分支：`codex/t02-portable-paths`。已核对 #25/#26：嵌套目录保留和绝对外部路径脱敏已有实现，本次复用这些修复。

剩余问题：旧路径函数未接受显式源平台，使用 resolve 补全不明确路径；`C:private.ts`、Windows 根相对路径、未知 sourceRoot 可被误判为内部文件。不同源 root 的相同外部相对路径共享 hash。相对 sessionPath 的读取位置与导出解释位置不一致。正文中的盘符相对路径、单反斜线和正斜线 UNC 未完整映射。

- [x] 按 sourceRoot/sourcePlatform 解释路径，不依赖宿主 cwd 或 drive cwd。
- [x] 保留 src/a/index.ts 与 src/b/index.ts，以及中文/空格路径。
- [x] 跨盘、仓库外、越界、未知 root 和 Windows 不明确路径使用 opaque locator。
- [x] Claude/Codex 的 files、file evidence title/locator 指向相同身份，导出不包含测试私有根目录。
- [x] 旧 adapter API、Capsule v1 和本地相对 project root 调用保持兼容。

范围：纯路径模块、现有 privacy 边界与 adapter 组装、相关回归及契约/README。不新增数据库、工作区绑定或源日志扫描，不声称 symlink/真实工作区验证完成。

## 实现与接口

`src/workspace/paths.ts` 提供 `portablePath(value, sourceRoot, sourcePlatform)` 和共享的词法包含判断。源平台为 posix/win32；绝对源 root 必须由调用方提供。Windows device、drive-relative/root-relative 等缺失上下文的输入保守输出 opaque ID。

privacy 保留旧两参数包装，并将平台传递到文件、证据和正文映射。相对外部 ID 使用平台/root/value 命名空间；绝对外部 ID 延续旧算法。映射仅在内存中使用，不导出原始位置。Adapter 的本地 IO 边界解析项目 root，不用宿主路径规则解释异平台源路径。

## 验证证据

日期：2026-09-14；环境 Node 24.18.1 / npm 11.16.0 / macOS arm64。

| 检查 | 结果 |
| --- | --- |
| 开始时 npm run check | 19 文件 / 95 测试通过，typecheck/build/docs 通过 |
| 将新路径测试临时接到旧函数 | 28 个案例中 10 个失败，确认包含误判、未知 root 和相对外部 ID 冲突；临时转发实现已删除 |
| 相对 sessionPath 与绝对 sessionPath 的证据一致性 | 旧实现失败：同一个日志被输出为项目内相对路径；按实际读取 cwd 解析后通过 |
| 正文映射新增回归 | 4 个用例在旧 tokenizer 上失败，修复后通过 |
| 目标测试（workspace + Claude + Codex + privacy） | 4 文件 / 59 测试通过，包括相对 project root 调用 |
| 完整 npm run check | 20 文件 / 129 测试通过；typecheck/build/docs 通过 |
| npm run check:pack | 45 个包文件；隔离安装 CLI 与公共导出通过 |

最终 PR CI 运行 Ubuntu/macOS/Windows × Node20/24 及汇总 check；远端结果见 PR Checks。合成跨平台路径用例不是实际 Agent 接续或网络共享认证。

## 自审与交接

已按范围、正确性、数据边界、设计、可维护性、证据顺序完成 AI self-review。无已知未解决 P0/P1；不等同外部独立审计。脚本/参数均未执行日志命令；无源文件写入、网络上传或依赖变更。

外部相对 locator 可能与旧导出不同，这是修复跨来源身份冲突的预期变化，已更新用户说明。正文路径识别仍为 heuristic；不保证任意自然语言的路径提取。设备命名空间采用保守 opaque 降级。

工作区原有 `.gitignore` 修改、research 和 HTML 实验保留，不属于本任务提交。T02 状态 review，待 PR 合并后 done；下一项 T03 需先核对现有 1→0→1 修复，再补 session/cwd 关联与历史模型。
