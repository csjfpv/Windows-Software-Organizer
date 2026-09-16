import { useEffect, useMemo, useState } from 'react';
import { CircleHelp, File, Folder, HardDrive, Plus, X } from 'lucide-react';
import type { Category, ResolvedPath, TargetType } from './types';

const classify = (item: ResolvedPath, categories: Category[]) => {
  const pick = (text: string) => categories.find((category) => category.name.includes(text))?.id;
  const source = (item.name + ' ' + item.target).toLocaleLowerCase();
  if (item.targetType === 'folder') return pick('项目') ?? categories[0]?.id ?? '';
  if (item.targetType === 'file') return categories.find((category) => category.name.includes('文件'))?.id ?? categories[0]?.id ?? '';
  if (/(code|git|python|node|docker|msys|terminal|studio|开发|编程)/.test(source)) return pick('开发') ?? categories[0]?.id ?? '';
  if (/(eda|pulse|imhex|xgpro|硬件|调试|logic)/.test(source)) return categories.find((category) => category.name.includes('硬件'))?.id ?? categories[0]?.id ?? '';
  return categories.find((category) => category.name.includes('日常'))?.id ?? categories[0]?.id ?? '';
};

export function QuickAddDialog({ categories, onClose, onAdd }: { categories: Category[]; onClose(): void; onAdd(item: ResolvedPath, categoryId: string): void }) {
  const [pathValue, setPathValue] = useState('');
  const [resolved, setResolved] = useState<ResolvedPath | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const resolvedCategory = useMemo(() => resolved ? (categoryId || classify(resolved, categories)) : '', [resolved, categoryId, categories]);
  const resolve = async (value: string) => {
    setLoading(true); setError('');
    try { const item = await window.organizer?.resolvePath(value); if (!item) throw new Error('当前环境无法读取路径'); setResolved(item); setCategoryId(classify(item, categories)); }
    catch (reason) { setResolved(null); setError(reason instanceof Error ? reason.message : '无法读取路径'); }
    finally { setLoading(false); }
  };
  const browse = async (type: Exclude<TargetType, 'url'>) => { const value = await window.organizer?.pickTarget(type); if (value) { setPathValue(value); void resolve(value); } };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal quick-add-modal">
      <header><div><h2>添加路径</h2><p>粘贴或选择一个程序、文件夹或文件。启动台只创建入口，不会移动原始内容。</p></div><button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></header>
      <div className="quick-add-body">
        <label><span>路径</span><div className="path-input"><input aria-label="要收纳的路径" autoFocus value={pathValue} placeholder="粘贴文件、文件夹或程序路径" onChange={(event) => setPathValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && pathValue.trim() && void resolve(pathValue)} /><button title="识别路径" disabled={!pathValue.trim() || loading} onClick={() => void resolve(pathValue)}>{loading ? '读取中' : '识别'}</button></div></label>
        <div className="browse-actions"><button className="secondary-button" onClick={() => void browse('executable')}><HardDrive size={16} />选择程序</button><button className="secondary-button" onClick={() => void browse('folder')}><Folder size={16} />选择文件夹</button><button className="secondary-button" onClick={() => void browse('file')}><File size={16} />选择文件</button></div>
        {error && <div className="quick-add-error"><CircleHelp size={18} />{error}</div>}
        {resolved && <div className="resolved-card"><div><strong>{resolved.name}</strong><small>{resolved.target}</small></div><label><span>自动归类到</span><select value={resolvedCategory} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><p>将显示原始 Windows 图标，之后可直接点击打开。</p></div>}
      </div>
      <footer><span /><div><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!resolved || !resolvedCategory} onClick={() => resolved && onAdd(resolved, resolvedCategory)}><Plus size={17} />收纳并添加</button></div></footer>
    </section>
  </div>;
}
