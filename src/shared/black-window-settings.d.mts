/** Type boundary for the pinned Studio settings producer; runtime bytes stay unchanged. */
export interface BlackWindowSettingsMountOptions {
  mount: HTMLElement | string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  contextualSettings?: ReadonlyArray<Record<string, unknown>>;
}

export function mountBlackWindowSettings(options: BlackWindowSettingsMountOptions): unknown;
