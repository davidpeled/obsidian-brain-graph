import type { Unsubscribe, VaultSnapshot } from "../contracts/vault";

/** Outbound port: where notes, folders and links come from. */
export interface VaultRepository {
  snapshot(): VaultSnapshot;
  /** Fires (possibly many times in a burst) when notes, folders or links change. */
  onChange(cb: () => void): Unsubscribe;
}
