# 项目约定

## ACE MCP 优先

- 优先使用 ACE MCP 工具，省 token 且更精准。
- 查找代码：优先用 `codebase_retrieval` 语义检索（比 grep/explore 更省 token），描述行为或问题即可；仅在已知确切符号名、需要精确字面匹配时才用 grep 兜底。
- 写 prompt / 改 prompt：优先用 `enhance_prompt`。
- 网上搜资料：优先用 `web_search`。
- 任务中遇到分歧或需要纠偏：优先用 `advisor`。
