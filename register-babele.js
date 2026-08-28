/*
 * Register this module's compendium translations with Babele.
 *
 * This MUST happen on Babele's own `babele.init` hook, not on Foundry's
 * `init`. Babele creates `game.babele` inside its own `init` handler, and
 * module load order is not guaranteed: if this module's `init` handler runs
 * first, `game.babele` does not exist yet and `Babele.get()` silently
 * constructs a throwaway instance that Babele then overwrites -- the
 * registration is lost and nothing is translated, with no error logged.
 */
Hooks.once('babele.init', (babele) => {

	babele.register({
		module: 'pf2eja',
		lang: 'ja',
		dir: 'compendium'
	});

	console.log('pf2eja | registered compendium translations with Babele');
});
