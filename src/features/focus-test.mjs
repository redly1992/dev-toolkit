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

function isSpecFilePath( targetPath ) {
    return targetPath.includes( '.spec.ts' );
}

function normaliseFolderPath( targetPath ) {
    return targetPath.replace( /\/+$/, '' );
}

/**
 * Generate minimal tsconfig that includes only target file/folder specs.
 * Lives in dev-toolkit/assets/ — paths are relative to that location.
 */
function writeFocusTsConfig( targetPath ) {
    const tsconfig = {
        extends: '../../tsconfig.json',
        compilerOptions: {
            outDir: '../../out-tsc/spec',
            types: [ 'jasmine', 'node' ],
        },
        files: [
            '../../src/test.ts',
            '../../src/polyfills.ts',
            '../../src/tests/custom-matchers.ts',
            '../../src/custom-matchers.d.ts',
        ],
    };

    if ( isSpecFilePath( targetPath ) ) {
        tsconfig.files.push( `../../${targetPath}` );
    } else {
        const folderPath = normaliseFolderPath( targetPath );
        tsconfig.include = [ `../../${folderPath}/**/*.spec.ts` ];
    }

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
    description: 'Run ng test for one spec file or a folder of specs',

    async run() {
        const config = readConfig();

        if ( !config.focusTest ) config.focusTest = { recent: [], browserMode: 'headless' };
        if ( !config.focusTest.browserMode ) config.focusTest.browserMode = 'headless';

        const recent = config.focusTest.recent ?? [];

        // ── 1. Target path input (with browser mode config at bottom) ─────────
        let targetPath;
        const ENTER_NEW = '__new__';
        const BROWSER_CONFIG = '__browser_config__';

        while ( !targetPath ) {
            if ( recent.length > 0 ) {
                const modeLabel = config.focusTest.browserMode === 'chrome'
                    ? 'Chrome (visible window)'
                    : 'Headless Chrome (fast)';
                const choice = await select( {
                    message: 'Spec file/folder',
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
                    targetPath = await promptPath();
                } else {
                    targetPath = choice;
                }
            } else {
                targetPath = await promptPath();
            }
        }

        targetPath = normalisePath( targetPath, WORKSPACE_ROOT );

        // ── 2. Detect module ──────────────────────────────────────────────────
        const mod = detectModule( targetPath );

        console.log( '' );
        if ( mod ) {
            console.log( `  Module : ${chalk.cyan( mod )}` );
        }
        console.log( `  Path   : ${chalk.dim( targetPath )}` );
        console.log( '' );

        // ── 3. Save to recent ─────────────────────────────────────────────────
        const updated = [ targetPath, ...recent.filter( r => r !== targetPath ) ].slice( 0, MAX_RECENT );
        config.focusTest.recent = updated;
        writeConfig( config );

        // ── 4. Generate focused tsconfig (type-checks only selected target) ───
        console.log( chalk.dim( '  Generating tsconfig.focus-spec.json…' ) );
        writeFocusTsConfig( targetPath );

        // ── 5. Run test ───────────────────────────────────────────────────────
        // --configuration focus → lean karma + focused tsconfig
        // --include → esbuild emits only selected spec file(s)
        const browser = config.focusTest.browserMode === 'chrome' ? 'Chrome' : 'CustomHeadlessChrome';
        const includePath = isSpecFilePath( targetPath ) ? targetPath : `${normaliseFolderPath( targetPath )}/**/*.spec.ts`;
        const testArgs = [ 'test', '--configuration', 'focus', '--include', includePath, '--browsers', browser ];

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
        message: 'Spec file or folder path',
        placeholder: 'src/app/modules/payments/foo/bar.component.spec.ts OR src/app/modules/payments/foo',
        validate( v ) {
            if ( !v.trim() ) return 'Path is required.';
            const p = v.trim();
            const isFolder = !p.includes( '.spec.ts' );
            if ( !p.startsWith( 'src/' ) && !p.startsWith( './src/' ) && !p.startsWith( '/' ) ) {
                return 'Use workspace path (e.g. src/...).';
            }
            if ( isFolder && p.includes( '*' ) ) return 'Folder path must not contain glob.';

            return true;
        },
    } );
}
