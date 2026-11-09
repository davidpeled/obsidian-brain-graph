import type { ContextMenuGateway, MenuAction } from "../../domain/interfaces/context-menu.gateway";
import { UNICODE_ICONS } from "./dom-ui-host";

/** Plain-DOM context menu, for hosts without a native one (the browser demo). */
export class DomContextMenu implements ContextMenuGateway {
  show(actions: MenuAction[], at: { clientX: number; clientY: number }): void {
    document.querySelector(".brain-graph-menu")?.remove();
    const menu = document.body.createDiv({ cls: "brain-graph-menu" });
    menu.style.left = `${at.clientX}px`;
    menu.style.top = `${at.clientY}px`;
    for (const a of actions) {
      const row = menu.createDiv({ cls: "brain-graph-menu-item", text: `${UNICODE_ICONS[a.icon] ?? ""}  ${a.title}` });
      row.addEventListener("click", () => {
        menu.remove();
        a.run();
      });
    }
    const close = (e: PointerEvent) => {
      if (menu.contains(e.target as Node)) return;
      menu.remove();
      document.removeEventListener("pointerdown", close);
    };
    window.setTimeout(() => document.addEventListener("pointerdown", close));
  }
}
