/**
 * Inline script to avoid FOUC: apply stored/system theme before paint.
 * Must be rendered in <head> of root layout.
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');else r.classList.remove('dark');}catch(e){}})();`;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: code }}
      // next/script not needed for blocking head snippet
    />
  );
}
