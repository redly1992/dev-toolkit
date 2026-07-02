import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readConfig, writeConfig } from '../utils/config.mjs';
import { WORKSPACE_ROOT } from '../utils/runner.mjs';
import { runNgWithExtensions } from '../utils/angular-workspace.mjs';

const MAX_RECENT = 5;
const TOOLKIT_DIR = resolve( dirname( fileURLToPath( import.meta.url ) ), '../../' );
const TSCONFIG_FOCUS_PATH = resolve( TOOLKIT_DIR, 'assets/tsconfig.focus-spec.json' );

/**
 * Generate a minimal tsconfig that only includes the target spec file.
 * Lives in dev-toolkit/assets/ — paths are relative to that location.
 * This stops TypeScript from type-checking ALL spec files in the project.
 */
function writeFocusTsConfig( specFilePath ) {
    const tsconfig = {
        extends: '../../tsconfig.json',
        compilerOptions: {
            outDir: '../../out-tsc/spec',
            types: [ 'jasmine', 'node' ],
        },
        files: [
            '../../src/test.ts',
            '../../src/polyfills.ts',
            `../../${specFilePath}`,
        ],
    };
    writeFileSync( TSCONFIG_FOCUS_PATH, JSON.stringify( tsconfig, null, 2 ) + '\n', 'utf8' );
}

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

        if ( !config.focusTest ) config.focusTest = { recent: [], browserMode: 'headless' };
        if ( !config.focusTest.browserMode ) config.focusTest.browserMode = 'headless';

        const recent = config.focusTest.recent ?? [];

        // ── 1. File path input (with browser mode config at bottom) ───────────
        let filePath;
        const ENTER_NEW = '__new__';
        const BROWSER_CONFIG = '__browser_config__';

        while ( !filePath ) {
            if ( recent.length > 0 ) {
                const modeLabel = config.focusTest.browserMode === 'chrome'
                    ? 'Chrome (visible window)'
                    : 'Headless Chrome (fast)';
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
                        { name: chalk.dim( `⚙ Browser mode: ${modeLabel}` ), value: BROWSER_CONFIG, short: 'Browser mode' },
                    ],
                    loop: false,
                } );

                if ( choice === BROWSER_CONFIG ) {
                    const pickedMode = await select( {
                        message: 'Browser mode',
                        choices: [
                            { name: 'Headless Chrome (fast)', value: 'headless' },
                            { name: 'Chrome (visible window)', value: 'chrome' },
                        ],
                        default: config.focusTest.browserMode,
                        loop: false,
                    } );
                    config.focusTest.browserMode = pickedMode;
                    writeConfig( config );
                    continue;
                }

                if ( choice === ENTER_NEW ) {
                    filePath = await promptPath();
                } else {
                    filePath = choice;
                }
            } else {
                filePath = await promptPath();
            }
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

        // ── 4. Generate focused tsconfig (type-checks only this file) ─────────
        console.log( chalk.dim( '  Generating tsconfig.focus-spec.json…' ) );
        writeFocusTsConfig( filePath );

        // ── 5. Run test ───────────────────────────────────────────────────────
        // --configuration focus → lean karma + focused tsconfig
        // --include → esbuild emits only this file's dependency tree
        const browser = config.focusTest.browserMode === 'chrome' ? 'Chrome' : 'CustomHeadlessChrome';
        const testArgs = [ 'test', '--configuration', 'focus', '--include', filePath, '--browsers', browser ];

        console.log( chalk.dim( `  Running: ng ${testArgs.join( ' ' )}\n` ) );

        try {
            await runNgWithExtensions( testArgs, WORKSPACE_ROOT );
        } catch {
            // ng test exits non-zero on failures — output already shown
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
