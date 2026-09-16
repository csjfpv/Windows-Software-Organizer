import { Check, ClipboardCopy, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Category } from './types';

function buildPrompt(categories: Category[], configPath: string) {
  const categoryList = categories.map((category) => '- ' + category.name).join('\n');
  return [
    '你正在协助我安装、整理并管理软件启动台。请严格遵守下面的授权和规则。',
    '',
    '本次授权范围',
    '1. 你被授权完整管理软件启动台配置：读取当前分类和入口，新增、重命名、排序或删除分类；新增、编辑、重新分类、排序或删除启动台入口。',
    '2. 这个授权只适用于软件启动台配置，不是对整台电脑任意扫描、读取或修改的授权。',
    '3. 只处理我本次明确要求安装或收纳的软件、项目、文件夹或资料。',
    '',
    '启动台配置访问方式',
    '1. 配置文件：' + (configPath || '请在软件启动台点击设置中的“打开配置目录”获取实际路径。'),
    '2. 配置是 UTF-8 JSON，包含 version、categories 和 apps。修改前先读取，修改后必须保持 JSON 有效。',
    '3. 每个分类必须有唯一 id、name、order；每个入口必须有唯一 id、categoryId、name、description、target、targetType、args、workingDirectory、iconPath、iconLookupAllowed、order、launchCount、lastLaunchedAt。',
    '4. 添加路径时优先使用软件启动台。仅建快捷入口使用“仅添加入口”；需要统一整理便携软件或普通文件夹时，必须使用“收纳并移动”，不能绕过启动台直接操作文件。完成后重新打开启动台确认结果。',
    '',
    '安装与安全',
    '1. 只从软件官方网站、官方商店或我明确指定的可信来源下载。',
    '2. 不要静默安装捆绑软件、浏览器扩展、更新器或无关工具。',
    '3. 不要自行用文件命令移动、复制、删除或重命名原内容。只有我明确要求，并且软件启动台内置的“收纳并移动”预检通过后，才可由启动台执行受控移动。',
    '4. 不要扫描整个磁盘、桌面、下载、聊天记录或个人文档。只检查完成此任务必需的明确路径。',
    '5. 不要把固件镜像、设备读回、校准数据、配置数据、日志、密钥、.env、聊天记录或临时/构建目录作为普通启动台入口。',
    '',
    '管理启动台入口',
    '1. 找到安装后的实际 EXE，或我指定的项目/资料文件夹。先确认目标路径存在。',
    '2. 程序使用 EXE，项目和资料使用文件夹。保持原软件图标；程序工作目录使用 EXE 所在目录。不要自行添加启动参数，除非我明确给出。',
    '3. 不要添加卸载器、安装器、更新器、助手程序、临时文件或重复入口。',
    '4. 先优先使用已有分类。现有分类不合适时，你被授权创建名称清晰、用途单一的新分类，并把入口放入最合适的分类。',
    '5. 新分类不要按品牌随意命名；应按用途命名，例如“3D 建模”“视频剪辑”“数据库工具”“学习资料”。',
    '',
    '当前分类（每次打开提示词时自动更新）',
    categoryList || '- 当前没有分类；请按实际用途创建清晰分类。',
    '',
    '推荐分类模型',
    '- 社交平台：微信、QQ、飞书等即时沟通与协作软件。',
    '- 流媒体平台：哔哩哔哩、音乐、视频和直播客户端；不与社交平台混放。',
    '- Vibe Coding 工具：DeepSeek Harness、Codex、CC Switch、AI 编程客户端和代码协作入口。',
    '- Web 编程：编辑器、浏览器调试、Android Studio 和 Web 工作区；不把 AI Agent 或运行时放入这里。',
    '- 开发环境与依赖：Python、Node.js、Docker、终端、PlatformIO 等运行时、容器和命令环境。',
    '- 专业工具：烧录器、逻辑分析、EDA、逆向、协议/网络分析和硬件调试工具。',
    '- 远程与网络：SSH、远程桌面、组网、网盘和服务器管理工具。',
    '- 日常软件：压缩、通用助手和其他个人常用工具。',
    '- SDK 与说明：SDK、驱动、烧录器说明、接口手册、技术文档和资料根目录。',
    '- 项目源码：项目根目录和源码工作区。源码始终留在原项目文件夹，不能移动到产出目录。',
    '- 项目产出软件：一个专门的成品目录，只放项目交付的软件、可执行成品和发布包，不存放源码、build、dist、固件、日志、备份或临时内容。',
    '',
    '项目与产出规则',
    '1. 项目源码入口只指向项目根目录或源码工作区；不要为每个 src、build、dist、node_modules、临时目录或单个编译产物单独建入口。',
    '2. 项目交付的软件要统一放进“项目产出软件”指定目录，并在启动台仅保留该目录入口；除非我明确要求，不要移动既有文件或批量收集现有产物。',
    '3. 当前分类没有合适位置时，可以新增用途清晰的新分类，但不要创建品牌类、重复或近似重复分类。',
    '',
    '完成前检查',
    '1. 逐个确认新增入口的路径存在、分类合理且没有重复。',
    '2. 确认未绕过启动台改动原始文件；若执行过“收纳并移动”，确认新路径有效。跨盘迁移会保留“启动台迁移旧副本”，必须由我验证后再人工处理。',
    '3. 重新读取配置确认 JSON 有效、分类 id 和入口 id 不重复、每个入口都引用存在的分类。',
    '4. 用简短中文告诉我：安装了什么、创建或调整了哪些分类、入口放在哪个分类、实际路径是什么、是否有需要我决定的事项。'
  ].join('\n');
}

export function AgentPromptDialog({ categories, onClose }: { categories: Category[]; onClose(): void }) {
  const [configPath, setConfigPath] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { void window.organizer?.getConfigPath().then(setConfigPath).catch(() => undefined); }, []);
  const prompt = useMemo(() => buildPrompt(categories, configPath), [categories, configPath]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };
  return <div className="modal-backdrop"><section className="modal agent-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="agent-prompt-title"><header><div><h2 id="agent-prompt-title">交给 AI 管理</h2><p>复制后发给 Codex、DeepSeek、Harness 或其他 Agent。</p></div><button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></header><div className="agent-prompt-body"><textarea aria-label="AI 安装整理提示词" readOnly value={prompt} rows={25} /><p>提示词会带上当前分类与配置路径，授权 Agent 管理启动台分类和入口，不授权它任意访问原始文件。</p></div><footer><span>{copied ? '已复制到剪贴板' : '复制后直接粘贴给 Agent'}</span><div><button className="secondary-button" onClick={onClose}>关闭</button><button className="primary-button" onClick={() => void copy()}>{copied ? <Check size={18} /> : <ClipboardCopy size={18} />}{copied ? '已复制' : '复制提示词'}</button></div></footer></section></div>;
}
