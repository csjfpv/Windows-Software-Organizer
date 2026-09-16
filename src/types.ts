export type TargetType = 'executable' | 'file' | 'folder' | 'url';
export interface Category { id: string; name: string; order: number; }
export interface AppEntry { id: string; categoryId: string; name: string; description: string; target: string; targetType: TargetType; args: string[]; workingDirectory: string; iconPath: string; iconLookupAllowed?: boolean; order: number; launchCount: number; lastLaunchedAt: string | null; }
export interface AppConfig { version: 1; categories: Category[]; apps: AppEntry[]; }
export interface DiscoveredApp { name: string; target: string; workingDirectory: string; }
export interface OrganizerApi {
  getConfig(): Promise<AppConfig>; saveConfig(config: AppConfig): Promise<AppConfig>;
  discoverStartMenuApps(): Promise<DiscoveredApp[]>;
  importConfig(): Promise<AppConfig | null>; exportConfig(): Promise<boolean>;
  pickTarget(type: Exclude<TargetType, 'url'>): Promise<string | null>; pickIcon(): Promise<string | null>;
  getIcon(entryId: string): Promise<string | null>;
  launch(entryId: string): Promise<{ launchCount: number; lastLaunchedAt: string }>;
  revealConfig(): Promise<string>;
}
declare global { interface Window { organizer?: OrganizerApi; } }
