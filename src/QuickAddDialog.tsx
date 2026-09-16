import { useEffect, useMemo, useState } from 'react';
import { CircleHelp, File, Folder, HardDrive, Plus, X } from 'lucide-react';
import type { Category, ManagedMovePlan, ResolvedPath, TargetType } from './types';

const classify = (item: ResolvedPath, categories: Category[]) => {
  const pick = (...values: string[]) => categories.find((category) => values.some((value) => category.name.toLocaleLowerCase().includes(value.toLocaleLowerCase())))?.id;
  const source = (item.name + ' ' + item.target).toLocaleLowerCase();
  if (item.targetType === 'folder') return pick('项目源码', '项目') ?? categories[0]?.id ?? '';
  if (item.targetType === 'file') return pick('SDK 与说明', '资料', '文件') ?? categories[0]?.id ?? '';
  if (/(deepseek|harness|codex|cc switch|ai 编程)/.test(source)) return pick('vibe coding') ?? categories[0]?.id ?? '';
  if (/(visual studio code|vscode|codeapp|editor|android studio|浏览器|前端|web)/.test(source)) return pick('web 编程', '开发工具', '开发') ?? categories[0]?.id ?? '';
  if (/(python|node|docker|msys|terminal|platformio|运行时|依赖)/.test(source)) return pick('开发环境') ?? categories[0]?.id ?? '';
  if (/(eda|pulse|imhex|xgpro|wireshark|ghidra|烧录|逆向|硬件|调试|logic)/.test(source)) return pick('专业工具', '硬件') ?? categories[0]?.id ?? '';
  return pick('日常') ?? categories[0]?.id ?? '';
};

export function QuickAddDialog({ categories, onClose, onAdd, onManagedAdd }: { categories: Category[]; onClose(): void; onAdd(item: ResolvedPath, categoryId: string): void; onManagedAdd(item: ResolvedPath, categoryId: string): void }) {
  const [pathValue, setPathValue] = useState('');
  const [resolved, setResolved] = useState<ResolvedPath | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [plan, setPlan] = useState<ManagedMovePlan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const resolvedCategory = useMemo(() => resolved ? (categoryId || classify(resolved, categories)) : '', [resolved, categoryId, categories]);
  const categoryName = categories.find((category) => category.id === resolvedCategory)?.name ?? '';
  const resolve = async (value: string) => {
    setLoading(true); setError(''); setPlan(null);
    try { const item = await window.organizer?.resolvePath(value); if (!item) throw new Error('当前环境无法读取路径'); setResolved(item); setCategoryId(classify(item, categories)); }
    catch (reason) { setResolved(null); setError(reason instanceof Error ? reason.message : '无法读取路径'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!resolved || !resolvedCategory || !window.organizer) { setPlan(null); return; }
    let active = true; setPlan(null);
    window.organizer.previewManagedMove(resolved, categoryName).then((value) => { if (active) setPlan(value); }).catch((reason) => { if (active) setPlan({ eligible: false, reason: reason instanceof Error ? reason.message : '无法预检', source: resolved.target, sourceRoot: resolved.target, destinationRoot: '', destination: '', resultingTarget: resolved.target, resultingType: resolved.targetType, workingDirectory: resolved.workingDirectory, bucket: '', crossVolume: false, runningProcesses: [] }); });
    return () => { active = false; };
  }, [resolved, resolvedCategory, categoryName]);
  const browse = async (type: Exclude<TargetType, 'url'>) => { const value = await window.organizer?.pickTarget(type); if (value) { setPathValue(value); void resolve(value); } };
  const canMove = Boolean(plan?.eligible && !plan.runningProcesses.length);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal quick-add-modal">
      <header><div><h2>添加路径</h2><p>可仅添加入口，也可把支持的便携软件或文件夹移动到统一收纳目录。</p></div><button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></header>
      <div className="quick-add-body">
        <label><span>路径</span><div className="path-input"><input aria-label="要收纳的路径" autoFocus value={pathValue} placeholder="粘贴文件、文件夹或程序路径" onChange={(event) => setPathValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && pathValue.trim() && void resolve(pathValue)} /><button title="识别路径" disabled={!pathValue.trim() || loading} onClick={() => void resolve(pathValue)}>{loading ? '读取中' : '识别'}</button></div></label>
        <div className="browse-actions"><button className="secondary-button" onClick={() => void browse('executable')}><HardDrive size={16} />选择程序</button><button className="secondary-button" onClick={() => void browse('folder')}><Folder size={16} />选择文件夹</button><button className="secondary-button" onClick={() => void browse('file')}><File size={16} />选择文件</button></div>
        {error && <div className="quick-add-error"><CircleHelp size={18} />{error}</div>}
        {resolved && <div className="resolved-card"><div><strong>{resolved.name}</strong><small>{resolved.target}</small></div><label><span>自动归类到</span><select value={resolvedCategory} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><p>将显示原始 Windows 图标，之后可直接点击打开。</p></div>}
        {resolved && <div className={'move-preview ' + (plan?.eligible ? 'eligible' : 'blocked')}><strong>{plan ? (plan.eligible ? '可以统一收纳' : '仅添加入口') : '正在检查是否可移动'}</strong><p>{plan?.reason ?? '正在检查安装位置、目录结构和冲突。'}</p>{plan?.crossVolume && <p>跨盘操作会保留一个命名为“启动台迁移旧副本”的原位置副本，供你验证后处理。</p>}{plan?.eligible && <><small>原位置：{plan.sourceRoot}</small><small>新位置：{plan.destination}</small></>}{Boolean(plan?.runningProcesses.length) && <p>请先正常关闭：{plan!.runningProcesses.join('、')}</p>}</div>}
      </div>
      <footer><span /><div><button className="secondary-button" onClick={onClose}>取消</button><button className="secondary-button" disabled={!resolved || !resolvedCategory} onClick={() => resolved && onAdd(resolved, resolvedCategory)}>仅添加入口</button><button className="primary-button" disabled={!resolved || !resolvedCategory || !canMove} onClick={() => resolved && onManagedAdd(resolved, resolvedCategory)}><Plus size={17} />收纳并移动</button></div></footer>
    </section>
  </div>;
}
