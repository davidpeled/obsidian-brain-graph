import { Menu } from "obsidian";
import type { ContextMenuGateway, MenuAction } from "../../domain/interfaces/context-menu.gateway";

export class ObsidianContextMenu implements ContextMenuGateway {
  show(actions: MenuAction[], at: { clientX: number; clientY: number }): void {
    const menu = new Menu();
    for (const a of actions) menu.addItem((item) => item.setTitle(a.title).setIcon(a.icon).onClick(a.run));
    menu.showAtPosition({ x: at.clientX, y: at.clientY });
  }
}
