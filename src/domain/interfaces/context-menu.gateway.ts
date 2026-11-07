export interface MenuAction {
  title: string;
  icon: string;
  run: () => void;
}

/** Outbound port: show a context menu at a viewport position. */
export interface ContextMenuGateway {
  show(actions: MenuAction[], at: { clientX: number; clientY: number }): void;
}
