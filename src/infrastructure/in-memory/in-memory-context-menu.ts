import type { ContextMenuGateway, MenuAction } from "../../domain/interfaces/context-menu.gateway";

/** Records the last menu instead of showing it (for tests). */
export class InMemoryContextMenu implements ContextMenuGateway {
  last: MenuAction[] | null = null;

  show(actions: MenuAction[]): void {
    this.last = actions;
  }
}
