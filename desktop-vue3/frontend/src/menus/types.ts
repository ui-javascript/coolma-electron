export type ContextMenuKind = 'noteList' | 'sideDrawer' | 'muya' | 'markMap';

export interface ContextMenuItem {
  id?: string;
  label: string;
  type?: 'separator';
  enabled?: boolean;
  danger?: boolean;
  children?: ContextMenuItem[];
}
