import { useEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, Boxes, ChevronDown, ChevronUp, CircleHelp, Code2, ExternalLink, File, Folder, FolderOpen, Globe2, HardDrive, Import, LayoutGrid, Pencil, Plus, Search, Settings, Star, Trash2, Upload, Wrench, X } from 'lucide-react';
import { demoConfig } from './demo';
import type { AppConfig, AppEntry, Category, TargetType } from './types';

const uid = () => crypto.randomUUID();
const typeLabel: Record<TargetType, string> = { executable: '程序', file: '文件', folder: '文件夹', url: '网页' };
const palette = ['#2f6fed', '#147d64', '#9b5c13', '#b53c4e', '#6d55b3', '#227a9b'];
const categoryIcon = (name: string) => name.includes('开发') ? Code2 : name.includes('项目') ? FolderOpen : name.includes('工具') ? Wrench : Star;
const iconCacheKey = (entry: AppEntry) => [entry.id, entry.targetType, entry.target, entry.iconPath, entry.iconLookupAllowed].join('\u001f');

function browserFallback() {
  const saved = localStorage.getItem('organizer-demo-config');
  return saved ? JSON.parse(saved) as AppConfig : demoConfig;
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(demoConfig);
  const [selected, setSelected] = useState('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'app' | 'category' | 'settings' | null>(null);
  const [editingApp, setEditingApp] = useState<AppEntry | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const pendingIconKeys = useRef(new Set<string>());
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);

  const persist = async (next: AppConfig) => {
    const normalized = { ...next, categories: next.categories.map((x, i) => ({ ...x, order: i })) };
    const saved = window.organizer ? await window.organizer.saveConfig(normalized) : normalized;
    if (!window.organizer) localStorage.setItem('organizer-demo-config', JSON.stringify(saved));
    setConfig(saved);
  };

  const loadConfig = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await (window.organizer?.getConfig() ?? Promise.resolve(browserFallback()));
      setConfig(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '读取本地配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadConfig(); }, []);
  useEffect(() => {
    if (!window.organizer || loading || loadError) return;
    let active = true;
    const iconEntries = config.apps.filter((entry) => entry.iconLookupAllowed === true);
    const validKeys = new Set(iconEntries.map(iconCacheKey));
    setIcons((old) => Object.fromEntries(Object.entries(old).filter(([key]) => validKeys.has(key))));
    iconEntries.forEach((entry) => {
      const key = iconCacheKey(entry);
      if (icons[key] || pendingIconKeys.current.has(key)) return;
      pendingIconKeys.current.add(key);
      window.organizer!.getIcon(entry.id).then((icon) => {
        if (active && icon) setIcons((old) => ({ ...old, [key]: icon }));
      }).catch(() => undefined).finally(() => pendingIconKeys.current.delete(key));
    });
    return () => { active = false; };
  }, [config.apps, loading, loadError]);

  const categories = [...config.categories].sort((a, b) => a.order - b.order);
  const shownApps = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return [...config.apps].filter((entry) => (selected === 'all' || entry.categoryId === selected) && (!term || [entry.name, entry.description, entry.target.split(/[\/]/).pop() ?? ''].some((value) => value.toLocaleLowerCase().includes(term)))).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
  }, [config.apps, selected, query]);
  const selectedName = selected === 'all' ? '全部应用' : categories.find((item) => item.id === selected)?.name ?? '全部应用';

  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2600); };
  const runAction = async (action: () => Promise<void>, fallback: string) => {
    try { await action(); }
    catch (error) { flash(error instanceof Error ? error.message : fallback); }
  };
  const launch = async (entry: AppEntry) => {
    try {
      if (!window.organizer) return flash('浏览器预览模式不会启动本地程序');
      const usage = await window.organizer.launch(entry.id);
      setConfig((old) => ({ ...old, apps: old.apps.map((item) => item.id === entry.id ? { ...item, ...usage } : item) }));
    } catch (error) { flash(error instanceof Error ? error.message : '启动失败'); }
  };
  const removeApp = async (entry: AppEntry) => { if (confirm('从整理工具中移除“' + entry.name + '”？本机程序不会被删除。')) await runAction(() => persist({ ...config, apps: config.apps.filter((item) => item.id !== entry.id) }), '移除失败'); };
  const removeCategory = async (category: Category) => {
    const count = config.apps.filter((item) => item.categoryId === category.id).length;
    if (count && !confirm('这个分类中有 ' + count + ' 个项目。确认同时从列表移除它们？本机文件不会被删除。')) return;
    await runAction(async () => { await persist({ ...config, categories: config.categories.filter((item) => item.id !== category.id), apps: config.apps.filter((item) => item.categoryId !== category.id) }); setSelected('all'); setDialog(null); }, '删除分类失败');
  };
  const moveCategory = async (index: number, offset: number) => { const list = [...categories]; const other = index + offset; if (other < 0 || other >= list.length) return; [list[index], list[other]] = [list[other], list[index]]; await runAction(() => persist({ ...config, categories: list }), '分类排序失败'); };
  const reorderApp = async (targetId: string) => {
    if (!draggedAppId || draggedAppId === targetId) return setDraggedAppId(null);
    const source = config.apps.find((item) => item.id === draggedAppId);
    const target = config.apps.find((item) => item.id === targetId);
    if (!source || !target || source.categoryId !== target.categoryId) return setDraggedAppId(null);
    const categoryApps = config.apps.filter((item) => item.categoryId === source.categoryId).sort((a, b) => a.order - b.order);
    const from = categoryApps.findIndex((item) => item.id === source.id);
    const to = categoryApps.findIndex((item) => item.id === target.id);
    categoryApps.splice(to, 0, categoryApps.splice(from, 1)[0]);
    const orders = new Map(categoryApps.map((item, index) => [item.id, index]));
    await runAction(async () => { await persist({ ...config, apps: config.apps.map((item) => orders.has(item.id) ? { ...item, order: orders.get(item.id)! } : item) }); setDraggedAppId(null); }, '项目排序失败');
  };

  return <div className="app-shell">
    <header className="titlebar">
      <div className="brand-mark"><Boxes size={21} /></div>
      <div><strong>Windows软件整理工具</strong><span>本地应用与项目启动中心</span></div>
      <div className="title-actions">
        <button className="icon-button" title="导入配置" onClick={async () => { try { const value = await window.organizer?.importConfig(); if (value) { setConfig(value); setSelected('all'); setQuery(''); setDialog(null); setIcons({}); flash('配置已导入'); } } catch (e) { flash(e instanceof Error ? e.message : '导入失败'); } }}><Import size={18} /></button>
        <button className="icon-button" title="导出配置" onClick={() => void runAction(async () => { if (await window.organizer?.exportConfig()) flash('配置已导出'); }, '导出失败')}><Upload size={18} /></button>
        <button className="icon-button" title="设置" onClick={() => setDialog('settings')}><Settings size={18} /></button>
      </div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <button className={'nav-item ' + (selected === 'all' ? 'active' : '')} onClick={() => setSelected('all')}><LayoutGrid size={18} /><span>全部应用</span><b>{config.apps.length}</b></button>
        <div className="nav-heading"><span>分类</span><button className="mini-button" title="添加分类" onClick={() => { setEditingCategory(null); setDialog('category'); }}><Plus size={16} /></button></div>
        <div className="category-list">
          {categories.map((category, index) => { const Icon = categoryIcon(category.name); return <div className="category-row" key={category.id}>
            <button className={'nav-item ' + (selected === category.id ? 'active' : '')} onClick={() => setSelected(category.id)}><Icon size={18} /><span>{category.name}</span><b>{config.apps.filter((x) => x.categoryId === category.id).length}</b></button>
            <div className="category-tools"><button title="上移" disabled={index === 0} onClick={() => moveCategory(index, -1)}><ChevronUp size={13} /></button><button title="下移" disabled={index === categories.length - 1} onClick={() => moveCategory(index, 1)}><ChevronDown size={13} /></button><button title="编辑" onClick={() => { setEditingCategory(category); setDialog('category'); }}><Pencil size={13} /></button></div>
          </div>; })}
        </div>
        <div className="privacy-note"><HardDrive size={16} /><span>配置仅保存在本机，不上传软件清单。</span></div>
      </aside>
      <main className="content">
        <div className="toolbar">
          <div><h1>{selectedName}</h1><p>{shownApps.length} 个项目</p></div>
          <div className="toolbar-controls"><label className="search"><Search size={18} /><input aria-label="搜索应用" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索应用或项目" />{query && <button title="清除搜索" onClick={() => setQuery('')}><X size={15} /></button>}</label><button className="primary-button" onClick={() => { setEditingApp(null); setDialog('app'); }}><Plus size={18} />添加项目</button></div>
        </div>
        {loading ? <div className="empty-state"><span className="loader" />正在读取本地配置</div> : loadError ? <div className="empty-state"><CircleHelp size={42} /><h2>无法读取配置</h2><p>{loadError}</p><button className="primary-button" onClick={() => void loadConfig()}>重试</button></div> : shownApps.length ? <div className="app-grid">{shownApps.map((entry, index) => <AppCard key={entry.id} entry={entry} icon={icons[iconCacheKey(entry)]} color={palette[index % palette.length]} dragging={draggedAppId === entry.id} onDragStart={() => setDraggedAppId(entry.id)} onDrop={() => reorderApp(entry.id)} onDragEnd={() => setDraggedAppId(null)} onLaunch={() => launch(entry)} onEdit={() => { setEditingApp(entry); setDialog('app'); }} onDelete={() => removeApp(entry)} />)}</div> : <div className="empty-state"><AppWindow size={42} /><h2>{query ? '没有匹配结果' : '这个分类还是空的'}</h2><p>{query ? '换一个关键词试试。' : '添加程序、文件夹、文件或网页入口。'}</p>{!query && <button className="primary-button" onClick={() => setDialog('app')}><Plus size={18} />添加第一个项目</button>}</div>}
      </main>
    </div>
    {dialog === 'app' && <AppDialog categories={categories} entry={editingApp} onClose={() => setDialog(null)} onSave={(entry) => void runAction(async () => { const exists = config.apps.some((x) => x.id === entry.id); const savedEntry = exists ? entry : { ...entry, order: config.apps.filter((item) => item.categoryId === entry.categoryId).length }; await persist({ ...config, apps: exists ? config.apps.map((x) => x.id === entry.id ? savedEntry : x) : [...config.apps, savedEntry] }); setDialog(null); flash(exists ? '项目已更新' : '项目已添加'); }, '保存项目失败')} />}
    {dialog === 'category' && <CategoryDialog category={editingCategory} onClose={() => setDialog(null)} onDelete={editingCategory ? () => void removeCategory(editingCategory) : undefined} onSave={(category) => void runAction(async () => { const exists = config.categories.some((x) => x.id === category.id); await persist({ ...config, categories: exists ? config.categories.map((x) => x.id === category.id ? category : x) : [...config.categories, category] }); setDialog(null); }, '保存分类失败')} />}
    {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} onReveal={() => void runAction(async () => { await window.organizer?.revealConfig(); }, '打开配置目录失败')} onReset={() => void runAction(async () => { if (confirm('清空当前列表并恢复默认分类？')) { await persist({ ...demoConfig, apps: [] }); setDialog(null); } }, '重置失败')} />}
    {notice && <div className="toast">{notice}</div>}
  </div>;
}

function AppCard({ entry, icon, color, dragging, onDragStart, onDrop, onDragEnd, onLaunch, onEdit, onDelete }: { entry: AppEntry; icon?: string; color: string; dragging: boolean; onDragStart(): void; onDrop(): void; onDragEnd(): void; onLaunch(): void; onEdit(): void; onDelete(): void }) {
  const Icon = entry.targetType === 'folder' ? Folder : entry.targetType === 'url' ? Globe2 : entry.targetType === 'file' ? File : AppWindow;
  return <article className={'app-card ' + (dragging ? 'dragging' : '')} draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onDragEnd={onDragEnd}><button className="card-main" onClick={onLaunch}>
    <span className="app-icon" style={{ backgroundColor: color }}>{icon ? <img src={icon} alt="" /> : <Icon size={27} />}</span>
    <span className="app-copy"><strong>{entry.name}</strong><small>{entry.description || typeLabel[entry.targetType]}</small><em>{entry.launchCount ? '已启动 ' + entry.launchCount + ' 次' : '尚未启动'}</em></span><ExternalLink className="launch-indicator" size={17} />
  </button><div className="card-actions"><span>{typeLabel[entry.targetType]}</span><button title="编辑" onClick={onEdit}><Pencil size={15} /></button><button title="移除" onClick={onDelete}><Trash2 size={15} /></button></div></article>;
}

function AppDialog({ categories, entry, onClose, onSave }: { categories: Category[]; entry: AppEntry | null; onClose(): void; onSave(entry: AppEntry): void }) {
  const [form, setForm] = useState<AppEntry>(entry ?? { id: uid(), categoryId: categories[0]?.id ?? '', name: '', description: '', target: '', targetType: 'executable', args: [], workingDirectory: '', iconPath: '', iconLookupAllowed: false, order: 0, launchCount: 0, lastLaunchedAt: null });
  const [argsText, setArgsText] = useState(form.args.join('\n'));
  const update = (patch: Partial<AppEntry>) => setForm((old) => ({ ...old, ...patch }));
  const save = () => { if (!form.name.trim() || !form.target.trim() || !form.categoryId) return; onSave({ ...form, name: form.name.trim(), target: form.target.trim(), args: argsText.split('\n').map((x) => x.trim()).filter(Boolean) }); };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal"><header><div><h2>{entry ? '编辑项目' : '添加项目'}</h2><p>只保存入口，不会复制或移动目标文件。</p></div><button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></header><div className="form-grid">
    <label><span>名称</span><input autoFocus value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="例如：代码编辑器" /></label>
    <label><span>分类</span><select value={form.categoryId} onChange={(e) => update({ categoryId: e.target.value })}>{categories.map((x) => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
    <label className="full"><span>说明</span><input value={form.description} onChange={(e) => update({ description: e.target.value })} placeholder="简短描述这个入口的用途" maxLength={160} /></label>
    <label><span>类型</span><select value={form.targetType} onChange={(e) => update({ targetType: e.target.value as TargetType, target: '' })}><option value="executable">程序</option><option value="folder">文件夹</option><option value="file">文件</option><option value="url">网页</option></select></label>
    <label className="full"><span>目标</span><div className="input-action"><input value={form.target} onChange={(e) => update({ target: e.target.value })} placeholder={form.targetType === 'url' ? 'https://example.com' : '选择或输入本地路径'} />{form.targetType !== 'url' && <button title="浏览" onClick={async () => { const value = await window.organizer?.pickTarget(form.targetType as Exclude<TargetType, 'url'>); if (value) update({ target: value, name: form.name || value.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || '' }); }}><FolderOpen size={17} /></button>}</div></label>
    {form.targetType === 'executable' && <><label className="full"><span>启动参数 <small>每行一个参数</small></span><textarea value={argsText} onChange={(e) => setArgsText(e.target.value)} rows={3} placeholder={"--profile\nwork"} /></label><label className="full"><span>工作目录</span><input value={form.workingDirectory} onChange={(e) => update({ workingDirectory: e.target.value })} placeholder="留空时使用程序所在目录" /></label></>}
    <label className="full"><span>自定义图标</span><div className="input-action"><input value={form.iconPath} onChange={(e) => update({ iconPath: e.target.value })} placeholder="可选，默认使用类型图标" /><button title="选择图标" onClick={async () => { const value = await window.organizer?.pickIcon(); if (value) update({ iconPath: value }); }}><FolderOpen size={17} /></button></div></label>
    <label className="full checkbox-row"><input type="checkbox" checked={form.iconLookupAllowed === true} onChange={(e) => update({ iconLookupAllowed: e.target.checked })} /><span>启用本地图标预览 <small>Windows 将访问该条目的目标或图标路径</small></span></label>
  </div><footer><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!form.name.trim() || !form.target.trim() || !form.categoryId} onClick={save}>保存</button></footer></section></div>;
}

function CategoryDialog({ category, onClose, onSave, onDelete }: { category: Category | null; onClose(): void; onSave(value: Category): void; onDelete?: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  return <div className="modal-backdrop"><section className="modal compact"><header><div><h2>{category ? '编辑分类' : '添加分类'}</h2><p>分类显示在左侧导航栏。</p></div><button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></header><label><span>分类名称</span><input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(category ? { ...category, name: name.trim() } : { id: uid(), name: name.trim(), order: 999 })} /></label><footer>{onDelete ? <button className="danger-button" onClick={onDelete}><Trash2 size={16} />删除分类</button> : <span />}<div><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!name.trim()} onClick={() => onSave(category ? { ...category, name: name.trim() } : { id: uid(), name: name.trim(), order: 999 })}>保存</button></div></footer></section></div>;
}
function SettingsDialog({ onClose, onReveal, onReset }: { onClose(): void; onReveal(): void; onReset(): void }) { return <div className="modal-backdrop"><section className="modal compact"><header><div><h2>设置与数据</h2><p>软件清单仅保存在这台电脑。</p></div><button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></header><div className="settings-list"><button onClick={onReveal}><FolderOpen size={19} /><span><strong>打开配置目录</strong><small>查看本机配置和上一版备份</small></span></button><button onClick={onReset}><Trash2 size={19} /><span><strong>清空应用列表</strong><small>不会删除电脑上的软件和文件</small></span></button><div><CircleHelp size={19} /><span><strong>隐私说明</strong><small>无账号、无遥测、无联网同步</small></span></div></div><footer><span /><button className="primary-button" onClick={onClose}>完成</button></footer></section></div>; }
