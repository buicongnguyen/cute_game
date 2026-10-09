export interface MobileGameOptions { menus?: string[]; controls?: string[]; existingButtons?: string[]; fullscreen?: boolean; fullViewport?: boolean; classifyCanvasTaps?: boolean; translate?: (english: string) => string; }
export declare function installMobileGameSupport(options?: MobileGameOptions): void;
