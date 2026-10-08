export interface MobileGameOptions { menus?: string[]; controls?: string[]; existingButtons?: string[]; fullscreen?: boolean; fullViewport?: boolean; classifyCanvasTaps?: boolean; }
export declare function installMobileGameSupport(options?: MobileGameOptions): void;
