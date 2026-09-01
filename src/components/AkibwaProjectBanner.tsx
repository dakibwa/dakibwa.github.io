export const AKIBWA_PROJECT_VIEW_BOOTSTRAP = `(function(){try{var key="akibwa-project-view";var entered=new URLSearchParams(location.search).get("from")==="akibwa";var sameSite=false;try{sameSite=!!document.referrer&&new URL(document.referrer).origin===location.origin}catch(e){}if(entered)sessionStorage.setItem(key,"1");else if(!sameSite)sessionStorage.removeItem(key);if(entered||sessionStorage.getItem(key)==="1")document.documentElement.setAttribute("data-akibwa-project","true");addEventListener("click",function(event){var target=event.target;if(target&&target.closest&&target.closest("[data-akibwa-project-back]"))sessionStorage.removeItem(key)},true)}catch(e){}})();`;

export function AkibwaProjectBanner() {
  return (
    <header className="akibwa-project-banner" aria-label="Akibwa portfolio">
      <div className="akibwa-project-banner__inner">
        <p className="akibwa-project-banner__identity">
          I’m <strong>Daniel</strong>
        </p>
        <div className="akibwa-project-banner__copy">
          <p className="akibwa-project-banner__lede">Building in the age of AI.</p>
          <a
            className="akibwa-project-banner__back"
            data-akibwa-project-back
            href="https://akibwa.com/#projects"
          >
            Back to projects
          </a>
        </div>
      </div>
    </header>
  );
}
