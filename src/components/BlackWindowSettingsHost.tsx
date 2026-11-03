import React, {useEffect, useRef, useState} from 'react';
import {mountBlackWindowSettings} from '../shared/black-window-settings.mjs';

export const BLACK_WINDOW_SETTINGS_PRODUCER = Object.freeze({
  repository: 'Vado42-chris/xi-io-studio',
  pr: 246,
  commit: '86105cd69e9787770aca7d2ffe5f7c372ca2b583',
  blob: '97ab9f81610228f04939844ad199ca15dd140247',
  schema: 'xiio.studio.black-window-settings/v1',
});

export default function BlackWindowSettingsHost() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;
    const projection = mountBlackWindowSettings({
      mount: mountRef.current,
      storage: globalThis.localStorage,
      contextualSettings: [],
    });
    setMounted(Boolean(projection));
  }, []);

  return <section
    className="p-5 space-y-4"
    aria-label="XI-IO universal settings"
    data-black-window-settings-host={mounted ? 'mounted' : 'mounting'}
    data-black-window-settings-schema={BLACK_WINDOW_SETTINGS_PRODUCER.schema}
    data-black-window-settings-source={BLACK_WINDOW_SETTINGS_PRODUCER.commit}
  >
    <div ref={mountRef} />
  </section>;
}
