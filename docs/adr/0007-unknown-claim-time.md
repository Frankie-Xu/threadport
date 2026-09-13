# ADR 0007：保留未知 Claim 时间

状态：T04 实施采用。日期：2026-09-14。

NormalizedEvent.occurredAt 允许 null；deriveTask(events) 必须是纯函数。原内部契约要求 Claim.updatedAt 必填，会迫使无时间日志伪造当前时间或 epoch。

将 Claim.updatedAt 改为 ISODate | null。派生 Claim 只使用其证据事件的时间；无时间则保持 null，并返回 EVIDENCE_TIME_UNKNOWN。事件顺序使用 sessionId 与 ordinal，不使用时间戳猜测重排。人工保存 Task 的 createdAt/updatedAt 仍必填，后续 mutation 服务应记录真实修改时间。

这是未发布 v0.2 内部模型的修订；不改变 Capsule v1、CLI 或存储格式。没有数据库迁移。旧适配器只规范化明确、有效的消息时间；命令时间仍未知。T06 的持久事件身份与 T08 的保存操作分别负责后续接入。
