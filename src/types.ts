export type TargetType = 'executable' | 'file' | 'folder' | 'url';
export interface Category { id: string; name: string; order: number; }
export interface AppEntry { id: string; categoryId: string; name: string; description: string; target: string; targetType: TargetType; args: string[]; workingDirectory: string; iconPath: string; iconLookupAllowed?: boolean; order: number; launchCount: number; lastLaunchedAt: string | null; }
export interface AppConfig { version: 1; categories: Category[]; apps: AppEntry[]; }
export interface DiscoveredApp { name: string; target: string; workingDirectory: string; }
export interface ResolvedPath { name: string; target: string; targetType: Exclude<TargetType, 'url'>; workingDirectory: string; }
export interface ManagedMovePlan { eligible: boolean; reason: string; source: string; sourceRoot: string; destinationRoot: string; destination: string; resultingTarget: string; resultingType: Exclude<TargetType, 'url'>; workingDirectory: string; bucket: string; crossVolume: boolean; runningProcesses: string[]; }
export interface OrganizerApi {
  getConfig(): Promise<AppConfig>; saveConfig(config: AppConfig): Promise<AppConfig>; getConfigPath(): Promise<string>;
  discoverStartMenuApps(): Promise<DiscoveredApp[]>; resolvePath(value: string): Promise<ResolvedPath>;
  getManagedRoot(): Promise<string>; chooseManagedRoot(): Promise<string | null>; previewManagedMove(item: ResolvedPath, categoryName: string): Promise<ManagedMovePlan>; managedAdd(entry: AppEntry, categoryName: string): Promise<AppConfig>; previewExistingMoves(): Promise<{ entryId: string; entryName: string; plan: ManagedMovePlan }[]>; moveExistingEntry(entryId: string): Promise<AppConfig>;
  importConfig(): Promise<AppConfig | null>; exportConfig(): Promise<boolean>;
  pickTarget(type: Exclude<TargetType, 'url'>): Promise<string | null>; pickIcon(): Promise<string | null>;
  getIcon(entryId: string): Promise<string | null>;
  launch(entryId: string): Promise<{ launchCount: number; lastLaunchedAt: string }>;
  revealConfig(): Promise<string>;
}
declare global { interface Window { organizer?: OrganizerApi; } }
