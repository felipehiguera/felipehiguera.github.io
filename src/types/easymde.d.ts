/**
 * Tipos mínimos para EasyMDE (no trae tipos ni existe @types/easymde).
 * Solo lo que usa el panel: constructor, value(), refresh y las acciones
 * de la barra en español.
 */
declare module "easymde" {
  export interface EasyMDEToolbarButton {
    name: string;
    action: string | ((editor: EasyMDE) => void);
    className?: string;
    title?: string;
  }

  export interface EasyMDEOptions {
    element?: HTMLElement;
    toolbar?: Array<string | EasyMDEToolbarButton>;
    spellChecker?: boolean;
    status?: boolean;
    placeholder?: string;
    maxHeight?: string;
    autofocus?: boolean;
  }

  export default class EasyMDE {
    constructor(options?: EasyMDEOptions);
    value(val?: string): string;
    codemirror: {
      refresh(): void;
      focus(): void;
    };
    static toggleBold(editor: EasyMDE): void;
    static toggleItalic(editor: EasyMDE): void;
    static toggleHeadingSmaller(editor: EasyMDE): void;
    static toggleBlockquote(editor: EasyMDE): void;
    static toggleUnorderedList(editor: EasyMDE): void;
    static toggleOrderedList(editor: EasyMDE): void;
    static drawLink(editor: EasyMDE): void;
    static drawImage(editor: EasyMDE): void;
    static drawTable(editor: EasyMDE): void;
    static togglePreview(editor: EasyMDE): void;
    static toggleSideBySide(editor: EasyMDE): void;
    static toggleFullScreen(editor: EasyMDE): void;
  }
}
