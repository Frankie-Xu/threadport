# T06 · Claude 来源发现与有界读取

## 本地 Issue 与验收

T06 / P1 / F01,F02 / Q07,Q08,Q09。基线 6393bcfa9c9f26068e35ecbd609b405ce2112ed0；依赖 T05 PR #31 已合并。分支 codex/t06-claude-source。此前没有原生来源端口/读取器，已有 extract 是整份手动输入接口；本任务保持该接口不变。

- [x] 只发现显式允许根的常规 .jsonl 文件；假 HOME 诱饵不被发现，文件/目录 symlink 越界被拒绝或跳过。
- [x] 稳定 Session/Event ID、重复扫描、增量追加、记录内分页、跨页命令关联；半行不提交，补齐后只导入一次。
- [x] 截断/替换/前缀改写报告 SOURCE_RESET，保留会话身份；变化的内容使用不同证据 ID。
- [x] 坏 JSON、未知类型、超长行隔离；多个 vendor session ID 不混合目标；missing/error/unsupported/partial 明确区分。
- [x] 取消覆盖开始前和读取中；只复制可见字段，脱敏先于 4 KiB UTF-8 截断；没有伪造时间或完成状态。
- [x] 源目录无权限在 POSIX 非 root 环境用 chmod 注入；Windows 保留真实 symlink 与全部其他回归。
- [x] 50 MiB 文件、1 MiB 行、256 blocks、128 pending calls、100000 session events，以及发现 entry/depth/input 预算有边界；诊断始终可读取。
- [x] 原生注册入口 threadport/sources 接通，并通过独立安装包发现测试；旧 extract/CLI 回归保留。

## 验证记录

2026-09-14 / macOS arm64 / Node 24.18.1 / npm 11.16.0。

基线上一任务为 202 项测试。新增读取器测试首次因模块缺失失败；实现后 4 项通过。首轮来源测试发现 macOS /var 与 /private/var 别名差异，统一 canonical path 后稳定身份用例通过。之后加入证据替换、源 cursor 归属、半行、容量和取消回归。

最终 npm run check：29 文件 / 220 测试通过，typecheck/build 通过；文档链接另行最终检查。npm run check:pack：72 个包文件，独立安装 CLI、SQLite 与 sources 注册/发现入口通过。新增 18 项行为测试，无真实用户 HOME/历史会话读取。fixture 全为合成结构，未做真实 vendor 版本认证。

## 审查与兼容

AI self-review，按范围→正确性→数据边界→设计→可维护性→证据审查，无已知未解决 P0/P1；不等同外部审计。无依赖升级，无数据库/schema v1/旧 extract 修改，无网络/命令执行/源文件写入。

新增 claude-events 模块分离白名单投影与文件系统读取。游标添加有界私有解析状态，见 [契约](../v0.2/03-contracts.md)；跨页 tool invocation/result 使用同一 run ID，各自保留观察事件，结果未知不填 exit 0。待关联调用超过预算时保留诊断而不错误配对。文件工具只标记调用，不声称操作成功。

[兼容边界](../../compatibility/claude-source.md) 明确：单次 read 处理一个物理 JSONL 记录；调用方必须按 hasMore 继续，包括 events 为空的页。前缀/游标边界摘要不是全文件锁定快照，不声称发现任意中间区域改写。SOURCE_RESET 的持久重建与人工关联保留、全局索引预算、并发调度由 T07 实现；本任务不冒充完整后台索引。

## 交接

本任务 L2（合成来源集成）。远端三平台 CI 与合并状态以 PR 为准。T05 已合并 #31 / 6393bcf，三平台 Node24 CI 全通过。下一项 T07：Codex 来源与幂等增量索引。现有 .gitignore、research 和两个 HTML 实验文件继续保留，不纳入提交。

提交后复核新增了工具 ID 三次复用的回归，旧投影错误关联 exit 0，先失败后修复：一旦发现重复 ID，清空当前关联并停止该游标的后续自动配对，结果保守保持 unknown。
