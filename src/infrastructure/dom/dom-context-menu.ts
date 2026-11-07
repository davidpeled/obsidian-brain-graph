import type { ContextMenuGateway, MenuAction } from "../../domain/interfaces/context-menu.gateway";
import { UNICODE_ICONS } from "./dom-ui-host";

/** Plain-DOM context menu, for hosts without a native one (the browser demo). */
export class DomContextMenu implements ContextMenuGateway {
  show(actions: MenuAction[], at: { clientX: number; clientY: number }): void {
    document.querySelector(".brain-graph-menu")?.remove();
    const menu = document.createElement("div");
    menu.className = "brain-graph-menu";
    menu.style.left = `${at.clientX}px`;
    menu.style.top = `${at.clientY}px`;
    for (const a of actions) {
      const row = document.createElement("div");
      row.className = "brain-graph-menu-item";
      row.textContent = `${UNICODE_ICONS[a.icon] ?? ""}  ${a.title}`;
      row.addEventListener("click", () => {
        menu.remove();
        a.run();
      });
      menu.appendChild(row);
    }
    document.body.appendChild(menu);
    const close = (e: PointerEvent) => {
      if (menu.contains(e.target as Node)) return;
      menu.remove();
      document.removeEventListener("pointerdown", close);
    };
    setTimeout(() => document.addEventListener("pointerdown", close));
  }
}
