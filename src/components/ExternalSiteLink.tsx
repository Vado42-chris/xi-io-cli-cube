import React, {useState} from 'react';
import {nativeInstallerAvailable} from '../lib/nativeInstaller.mjs';

// Human-selected website navigation is separate from local installer authority.
// The current native carrier has no approved external-browser adapter; never
// navigate privileged product content to a remote site or pretend it opened.
export default function ExternalSiteLink({href, children, className}: {href: string; children: React.ReactNode; className?: string}) {
  const [notice, setNotice] = useState<string | null>(null);
  return <>
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={event => {
      if (nativeInstallerAvailable()) {
        event.preventDefault();
        setNotice('External browser handoff is not connected in this native build. Copy this address into your browser:');
      } else {
        setNotice('Opens in a new browser tab. If your preview blocks it, copy this address into your browser:');
      }
    }}>{children}</a>
    {notice && <span role="status" className="block text-xs text-workspace-muted">
      {notice} <input aria-label="Website address" className="block w-full bg-workspace-surface text-workspace-text border border-workspace-border p-2" value={href} readOnly onFocus={event => event.currentTarget.select()} />
    </span>}
  </>;
}
