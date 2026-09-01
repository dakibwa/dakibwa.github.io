export const AKIBWA_PROJECT_VIEW_BOOTSTRAP = `(function(){try{var key="akibwa-project-view";var entered=new URLSearchParams(location.search).get("from")==="akibwa";var sameSite=false;try{sameSite=!!document.referrer&&new URL(document.referrer).origin===location.origin}catch(e){}if(entered)sessionStorage.setItem(key,"1");else if(!sameSite)sessionStorage.removeItem(key);if(entered||sessionStorage.getItem(key)==="1")document.documentElement.setAttribute("data-akibwa-project","true");addEventListener("click",function(event){var target=event.target;if(target&&target.closest&&target.closest("[data-akibwa-project-back]"))sessionStorage.removeItem(key)},true)}catch(e){}})();`;

export function AkibwaProjectBanner() {
  return (
    <header className="akibwa-project-banner" aria-label="Akibwa portfolio">
      <div className="akibwa-project-banner__inner">
        <p className="akibwa-project-banner__identity" aria-label="I’m Daniel. I’m Akibwa.">
          <span aria-hidden="true">
            I’m{" "}
            <span className="akibwa-project-banner__name-stack">
              <strong className="akibwa-project-banner__name akibwa-project-banner__name--daniel">
                Daniel
              </strong>
              <strong className="akibwa-project-banner__name akibwa-project-banner__name--akibwa">
                Akibwa
              </strong>
            </span>
          </span>
        </p>
        <div className="akibwa-project-banner__copy">
          <p className="akibwa-project-banner__lede">Building in the age of AI.</p>
          <nav className="akibwa-project-banner__nav" aria-label="Akibwa">
            <a data-akibwa-project-back href="https://akibwa.com/">Home</a>
            <a data-akibwa-project-back href="https://akibwa.com/#projects">Projects</a>
            <a data-akibwa-project-back href="https://akibwa.com/#career">Career</a>
            <a data-akibwa-project-back href="https://akibwa.com/#taste">Taste Library</a>
          </nav>
        </div>
      </div>
    </header>
  );
}
