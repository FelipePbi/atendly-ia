/**
 * Retrato só no celular instalado (D-211). O manifest não pede orientação:
 * `orientation` vale para todo aparelho onde a Avenly é instalada, e o
 * tablet deitado abria em retrato (relato de 2026-10-20). No lugar, este
 * script do `<head>` trava o retrato quando a tela é de celular (o menor
 * lado abaixo de 600 px) e a Avenly abre como app instalado — fora disso o
 * navegador recusa a trava. O tablet segue o aparelho desde a abertura. No
 * navegador comum, o aviso "Gire o celular" (OrientationGuard) continua
 * cobrindo o telefone deitado.
 */

/** Menor lado da tela, em px CSS, a partir do qual a tela é de tablet. */
export const TABLET_MIN_SIDE = 600;

const INSTALLED_QUERIES = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)",
];

export const ORIENTATION_BOOT_SCRIPT = `(function(){try{var s=window.screen,o=s&&s.orientation;if(!o||typeof o.lock!=="function")return;if(Math.min(s.width,s.height)>=${TABLET_MIN_SIDE})return;var q=${JSON.stringify(
  INSTALLED_QUERIES,
)},i=false;for(var k=0;k<q.length;k++){if(window.matchMedia&&window.matchMedia(q[k]).matches)i=true}if(!i)return;var p=o.lock("portrait");if(p&&typeof p.catch==="function")p.catch(function(){})}catch(e){}})()`;
