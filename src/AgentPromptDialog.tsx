import { Check, ClipboardCopy, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Category } from './types';

function buildPrompt(categories: Category[]) {
  const categoryList = categories.map((category) => '- ' + category.name).join('\n');
  return [
    '你正在协助我安装并整理软件。请严格遵守下面的软件启动台规则。',
    '',
    '目标',
    '1. 只处理我本次明确要求安装或收纳的软件、项目、文件夹或资料。',
    '2. 安装完成后，为它创建软件启动台入口，让我能在启动台里直接打开。',
    '',
    '安装与安全',
    '1. 只从软件官方网站、官方商店或我明确指定的可信来源下载。',
    '2. 不要静默安装捆绑软件、浏览器扩展、更新器或无关工具。',
    '3. 不要移动、复制、删除、重命名我的原软件、项目、文件夹或文件。软件启动台只保存入口。',
    '4. 不要扫描整个磁盘、桌面、下载、聊天记录或个人文档。只检查完成此任务必需的明确路径。',
    '5. 不要把固件镜像、设备读回、校准数据、配置数据、日志、密钥、.env、聊天记录或临时/构建目录作为普通启动台入口。',
    '',
    '添加启动台入口',
    '1. 找到安装后的实际 EXE，或我指定的项目/资料文件夹。先确认目标路径存在。',
    '2. 在软件启动台中使用“添加路径”创建入口；程序使用其 EXE，项目和资料使用其文件夹。',
    '3. 保持原软件图标，程序工作目录使用 EXE 所在目录；不要自行添加启动参数，除非我明确给出。',
    '4. 不要添加卸载器、安装器、更新器、助手程序、临时文件或重复入口。',
    '',
    '现有分类',
    categoryList || '- 按用途创建清晰的分类',
    '',
    '分类原则',
    '- Web 编辑器、浏览器调试和前端工作区：Web 编程',
    '- Node、Python、终端、PlatformIO 等运行时和命令环境：开发环境',
    '- 烧录器、逻辑分析、EDA、调试和硬件工具：硬件与调试',
    '- SDK、驱动、接口手册、技术说明和资料根目录：SDK 与说明',
    '- 可独立工作的源代码或项目根目录：项目入口',
    '- 微信、QQ、飞书等沟通软件：社交协作',
    '- 音乐、视频、游戏等：娱乐媒体',
    '- Git、Docker、代码仓库等：开发工具',
    '',
    '完成前检查',
    '1. 逐个确认新增入口的路径存在且分类合理。',
    '2. 确认没有改动原始文件，也没有重复项。',
    '3. 用简短中文告诉我：安装了什么、入口放在哪个分类、实际路径是什么、是否有需要我决定的事项。'
  ].join('\n');
}

export function AgentPromptDialog({ categories, onClose }: { categories: Category[]; onClose(): void }) {
  const prompt = useMemo(() => buildPrompt(categories), [categories]);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return <div className="modal-backdrop"><section className="modal agent-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="agent-prompt-title"><header><div><h2 id="agent-prompt-title">交给 AI 安装</h2><p>复制后发给 Codex、DeepSeek、Harness 或其他 Agent。</p></div><button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></header><div className="agent-prompt-body"><textarea aria-label="AI 安装整理提示词" readOnly value={prompt} rows={23} /><p>提示词会带上当前分类，并要求 Agent 只创建入口，不移动你的原始内容。</p></div><footer><span>{copied ? '已复制到剪贴板' : '复制后直接粘贴给 Agent'}</span><div><button className="secondary-button" onClick={onClose}>关闭</button><button className="primary-button" onClick={() => void copy()}>{copied ? <Check size={18} /> : <ClipboardCopy size={18} />}{copied ? '已复制' : '复制提示词'}</button></div></footer></section></div>;
}
