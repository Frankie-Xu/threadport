# T17 本地数据与导出

T17-A 实现诊断白名单、显式预览摘要与不覆盖的原子文件发布；T17-B 清理/寿命另包。

导出先在目标目录写独占临时文件，写完并 sync 后 hard-link 发布。目标已存在/并发竞争都拒绝覆盖；错误清理临时文件。Task Markdown 使用动态长度 code fence，保留人工 provenance、历史 unknown 与来源建议，最多 20 个命令分组并明确省略。服务器再次生成导出并比较用户预览摘要，改变时拒绝写出。

诊断仅包含版本、OS/arch、时间、计数/容量、固定 parser 版本和有限错误码，不序列化设置、来源元数据、环境或正文。存储路径只出现在受认证的 settings 接口。doctor --json 不夹说明文字；index 显式读取已配置来源，不扫描 HOME。

回滚：独立 squash，无迁移；用户已导出的文件不随代码回滚删除。清理和删除全部数据尚未实现，不宣称 T17 完成。自审，未获得独立人工评审。

## 使用与接口

- Settings → Preview diagnostics：仅本地预览，复制由用户主动操作，不自动发送。
- Task → Export task；接续包 → Save export to directory：审阅完整文本，选择已存在的绝对目录，勾选确认后发布文件。Task 为 Markdown；接续包支持 JSON/Markdown。
- `threadport doctor --json --data-dir <directory>`：输出诊断 JSON；`threadport index --source <configured-source-id> --data-dir <directory>`：显式扫描一个已配置来源。部分读取返回非零，保留成功批次。
- 认证 API：`GET /api/v1/diagnostics`、`GET /api/v1/settings`、`POST /api/v1/exports/preview`、`POST /api/v1/exports`。写出必须提交预览的 SHA-256 `expectedDigest`，不接受客户端提供的任意文件名。
- 文件系统必须支持同目录 hard link；不支持时安全失败，不降级为可能覆盖的写法。临时文件以 0600 创建；Windows 权限遵从当前账户 ACL。
- 诊断错误最多 20 条安全错误码与时间，不含完整日志。该报告仅描述当前存储，不证明真实 Agent 或平台已经认证。
