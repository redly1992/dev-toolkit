import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { execa } from 'execa';
import { readConfig, writeConfig } from '../utils/config.mjs';
import { WORKSPACE_ROOT } from '../utils/runner.mjs';

const MAX_RECENT = 5;

/** Extract module name from a spec file path, e.g.:
 *  src/app/modules/account-management/foo/bar.spec.ts → account-management
 */
function detectModule( filePath ) {
    const match = filePath.match( /modules\/([^\/]+)\// );

    return match ? match[ 1 ] : null;
}

/** Normalise path: strip leading ./ or absolute workspace prefix */
function normalisePath( filePath, workspaceRoot ) {
    let p = filePath.trim();

    if ( p.startsWith( workspaceRoot ) ) p = p.slice( workspaceRoot.length );
    if ( p.startsWith( '/' ) ) p = p.slice( 1 );
    if ( p.startsWith( './' ) ) p = p.slice( 2 );

    return p;
}

/** @type {import('../index.mjs').Feature} */
export default {
    name: 'Focus Test',
    description: 'Run ng test for a single spec file (fast — compiles only what it needs)',

    async run() {
        const config = readConfig();

        if ( !config.focusTest ) config.focusTest = { recent: [] };

        const recent = config.focusTest.recent ?? [];

        // ── 1. File path input ────────────────────────────────────────────────
        let filePath;

        if ( recent.length > 0 ) {
            const ENTER_NEW = '__new__';
            const choice = await select( {
                message: 'Spec file',
                choices: [
                    ...recent.map( p => {
                        const mod = detectModule( p );

                        return {
                            name:  `${p}  ${mod ? chalk.dim( `[${mod}]` ) : ''}`,
                            value: p,
                            short: p,
                        };
                    } ),
                    { name: chalk.dim( '↳ Enter a different path…' ), value: ENTER_NEW, short: 'New path' },
                ],
                loop: false,
            } );

            if ( choice === ENTER_NEW ) {
                filePath = await promptPath();
            } else {
                filePath = choice;
            }
        } else {
            filePath = await promptPath();
        }

        filePath = normalisePath( filePath, WORKSPACE_ROOT );

        // ── 2. Detect module ──────────────────────────────────────────────────
        const mod = detectModule( filePath );

        console.log( '' );
        if ( mod ) {
            console.log( `  Module : ${chalk.cyan( mod )}` );
        }
        console.log( `  File   : ${chalk.dim( filePath )}` );
        console.log( '' );

        // ── 3. Save to recent ─────────────────────────────────────────────────
        const updated = [ filePath, ...recent.filter( r => r !== filePath ) ].slice( 0, MAX_RECENT );
        config.focusTest.recent = updated;
        writeConfig( config );

        // ── 4. Run test ───────────────────────────────────────────────────────
        const args = [ 'test', '--no-watch', '--include', filePath ];

        if ( mod ) args.push( '--configuration', mod );

        console.log( chalk.dim( `  Running: ng ${args.join( ' ' )}\n` ) );

        try {
            await execa( 'npx', [ 'ng', ...args ], { cwd: WORKSPACE_ROOT, stdio: 'inherit' } );
        } catch {
            // ng test exits non-zero on test failures — output already shown via inherit
        }
    },
};

async function promptPath() {
    return input( {
        message: 'Spec file path',
        placeholder: 'src/app/modules/payments/foo/bar.component.spec.ts',
        validate( v ) {
            if ( !v.trim() ) return 'Path is required.';
            if ( !v.includes( '.spec.ts' ) ) return 'Must be a .spec.ts file.';

            return true;
        },
    } );
}
