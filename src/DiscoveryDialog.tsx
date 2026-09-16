import { useEffect, useState } from 'react';
import { AppWindow, CircleHelp, X } from 'lucide-react';
import type { Category, DiscoveredApp } from './types';

export function DiscoveryDialog({ categories, existingTargets, onClose, onAdd }: { categories: Category[]; existingTargets: Set<string>; onClose(): void; onAdd(items: DiscoveredApp[], categoryId: string): void }) {
  const [items, setItems] = useState<DiscoveredApp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    window.organizer?.discoverStartMenuApps().then((found) => {
      const available = found.filter((item) => !existingTargets.has(item.target.toLocaleLowerCase()));
      setItems(available);
      setSelected(new Set(available.map((item) => item.target)));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '读取开始菜单失败')).finally(() => setLoading(false));
  }, []);

  const toggle = (target: string) => setSelected((old) => {
    const next = new Set(old);
    next.has(target) ? next.delete(target) : next.add(target);
    return next;
  });
  const chosen = items.filter((item) => selected.has(item.target));

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal discovery-modal">
      <header><div><h2>从开始菜单添加</h2><p>只读取开始菜单快捷方式。不会扫描个人文件夹，也不会自动添加任何软件。</p></div><button className="icon-button" title="关闭" onClick={onClose}><X size={19} /></button></header>
      <div className="discovery-body">
        <label><span>添加到分类</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        {loading ? <div className="discovery-status"><span className="loader" />正在读取开始菜单</div> : error ? <div className="discovery-status"><CircleHelp size={28} />{error}</div> : items.length ? <div className="discovery-list">{items.map((item) => <label className="discovery-row" key={item.target}><input type="checkbox" checked={selected.has(item.target)} onChange={() => toggle(item.target)} /><span><strong>{item.name}</strong><small>{item.target}</small></span></label>)}</div> : <div className="discovery-status"><AppWindow size={28} />没有发现新的开始菜单软件</div>}
      </div>
      <footer><span className="discovery-count">已选择 {chosen.length} 个</span><div><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!chosen.length || !categoryId} onClick={() => onAdd(chosen, categoryId)}>添加所选项</button></div></footer>
    </section>
  </div>;
}
