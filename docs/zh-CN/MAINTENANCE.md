# 英文与中文文档同步

`master` 是代码和英文原文的开发分支。`codex/zh-docs` 包含相同应用代码，根 README 和 CONTRIBUTING 默认显示中文，英文副本分别为 `README.en.md` 和 `CONTRIBUTING.en.md`。其他英文原文仍在 `docs/wiki/`，中文译文在 `docs/zh-CN/wiki/`。

## 同步一次英文更新

1. 在干净的中文分支检出目录中获取最新 `origin/master`。合并代码前保留中文 README 和 CONTRIBUTING；合并后确保这两个文件仍为中文，并从 `origin/master` 更新对应 `.en.md` 英文副本。其他英文文档沿用合并后的 `docs/wiki/`。
2. 运行 `node tools/check-zh-docs.cjs --source-ref origin/master`，列出修改过的英文文档。
3. 用 Luna 子代理翻译这些英文改动，并检查命令、参数、代码块、链接和实际功能是否一致。不要覆盖无关的中文人工改动。
4. 对已经完成翻译的文件逐一记录源版本，例如 `node tools/check-zh-docs.cjs --record README.en.md docs/wiki/3.10-Journal-and-Calendar.md`。命令要求明确指定文件；英文变了而译文没有变时会拒绝登记。
5. 再次运行版本检查和 `node tools/check-doc-links.js docs`。将英文副本、中文译文和版本清单一起提交到中文分支。

哈希只证明译文对应的英文版本，没有能力判断翻译质量。更新版本清单前必须实际完成翻译与审阅。

## 后续维护

中文分支的 GitHub Actions 工作流配置为在推送或 PR 时检查英文原文和中文译文的对应版本，也会读取最新 `origin/master`，因此英文在另一个分支变更也会报错。仓库需要启用 GitHub Actions 才能运行该工作流；本地命令无需 Actions。定时工作流仅在中文分支成为 GitHub 默认分支后才会由 GitHub 调度；保留 `master` 为默认分支时不依赖该定时任务。

在本对话后续修改功能与英文说明时，应一并调用 Luna 更新对应中文译文，运行上述检查，然后同步提交到中文分支。

每日自动翻译并推送是另一个可选维护方式，目前尚未启用。它需要用户明确授权持续的自动写入；启用后可检查 `master` 的实际更新、调用 Luna 更新译文，再将相应代码和文档同步到中文分支。没有内容变化时保持安静，只有同步完成或需要处理的问题才通知。该方式依赖本机 Codex 的调度与已有 GitHub 认证。

中文分支的根 README 与英文分支不同，因此不要将该文档展示分支直接合回 `master`。代码修改继续在 `master` 开发，并同时维护与功能相关的英文说明；中文分支随后同步代码和译文。
