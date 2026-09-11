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

/**
 * Core execution logic shared by the interactive menu and the direct CLI
 * invocation (`toolkit focus-test <path>`).
 *
 * @param {string} targetPathArg raw path (spec file or folder), workspace-relative or absolute
 * @param {{ browserMode?: 'headless' | 'chrome', watch?: boolean }} [opts]
 */
export async function executeFocusTest( targetPathArg, opts = {} ) {
    const config = readConfig();

    if ( !config.focusTest ) config.focusTest = { recent: [], browserMode: 'headless', watch: true };
    if ( !config.focusTest.browserMode ) config.focusTest.browserMode = 'headless';
    if ( config.focusTest.watch === undefined ) config.focusTest.watch = true;

    // CLI flags (opts) override the persisted defaults for this run only —
    // they must NOT be written back to toolkit.config.json.
    const browserMode = opts.browserMode ?? config.focusTest.browserMode;
    const watch = opts.watch ?? config.focusTest.watch;

    const targetPath = normalisePath( targetPathArg, WORKSPACE_ROOT );

    // ── Detect module ──────────────────────────────────────────────────────
    const mod = detectModule( targetPath );

    console.log( '' );
    if ( mod ) {
        console.log( `  Module : ${chalk.cyan( mod )}` );
    }
    console.log( `  Path   : ${chalk.dim( targetPath )}` );
    console.log( '' );

    // ── Save to recent ──────────────────────────────────────────────────────
    const recent = config.focusTest.recent ?? [];
    config.focusTest.recent = [ targetPath, ...recent.filter( r => r !== targetPath ) ].slice( 0, MAX_RECENT );
    writeConfig( config );

    // ── Generate focused tsconfig (type-checks only selected target) ───────
    console.log( chalk.dim( '  Generating tsconfig.focus-spec.json…' ) );
    writeFocusTsConfig( targetPath );

    // ── Run test ─────────────────────────────────────────────────────────────
    // --configuration focus → lean karma + focused tsconfig
    // --include → esbuild emits only selected spec file(s)
    const browser = browserMode === 'chrome' ? 'Chrome' : 'CustomHeadlessChrome';
    const includePath = isSpecFilePath( targetPath ) ? targetPath : `${normaliseFolderPath( targetPath )}/**/*.spec.ts`;
    const watchFlag = watch ? '--watch' : '--no-watch';
    const testArgs = [ 'test', '--configuration', 'focus', '--include', includePath, '--browsers', browser, watchFlag ];

    console.log( chalk.dim( `  Running: ng ${testArgs.join( ' ' )}\n` ) );

    try {
        await runNgWithExtensions( testArgs, WORKSPACE_ROOT );
    } catch {
        // ng test exits non-zero on failures — output already shown
    }
}

/**
 * CLI entry point: `toolkit focus-test <path> [--chrome|--headless] [--watch|--no-watch]`.
 * Skips all prompts and runs immediately with the given path.
 *
 * @param {string[]} args remaining argv after the command name
 */
export async function runFocusTestCli( args ) {
    const browserFlagIdx = args.findIndex( a => a === '--chrome' || a === '--headless' );
    const browserMode = browserFlagIdx === -1 ? undefined : ( args[ browserFlagIdx ] === '--chrome' ? 'chrome' : 'headless' );

    const watchFlagIdx = args.findIndex( a => a === '--watch' || a === '--no-watch' );
    const watch = watchFlagIdx === -1 ? undefined : args[ watchFlagIdx ] === '--watch';

    const KNOWN_FLAGS = [ '--chrome', '--headless', '--watch', '--no-watch' ];
    const pathArgs = args.filter( a => !KNOWN_FLAGS.includes( a ) );
    const targetPathArg = pathArgs[ 0 ];

    if ( !targetPathArg ) {
        console.error( chalk.red( '  Usage: toolkit focus-test <spec-file-or-folder> [--chrome|--headless] [--watch|--no-watch]' ) );
        process.exitCode = 1;
        return;
    }

    await executeFocusTest( targetPathArg, { browserMode, watch } );
}

/** @type {import('../index.mjs').Feature} */
export default {
    name: 'Focus Test',
    description: 'Run ng test for one spec file or a folder of specs',
    // Aliases usable directly from the shell: `toolkit focus-test <path>` / `toolkit ft <path>`
    cliAliases: [ 'focus-test', 'ft' ],
    runCli: runFocusTestCli,

    async run() {
        const config = readConfig();

        if ( !config.focusTest ) config.focusTest = { recent: [], browserMode: 'headless', watch: true };
        if ( !config.focusTest.browserMode ) config.focusTest.browserMode = 'headless';
        if ( config.focusTest.watch === undefined ) config.focusTest.watch = true;

        const recent = config.focusTest.recent ?? [];

        // ── 1. Target path input (with browser mode config at bottom) ─────────
        let targetPath;
        const ENTER_NEW = '__new__';
        const BROWSER_CONFIG = '__browser_config__';
        const WATCH_CONFIG = '__watch_config__';

        while ( !targetPath ) {
            if ( recent.length > 0 ) {
                const modeLabel = config.focusTest.browserMode === 'chrome'
                    ? 'Chrome (visible window)'
                    : 'Headless Chrome (fast)';
                const watchLabel = config.focusTest.watch ? 'On (re-runs on file change)' : 'Off (single run)';
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
                        { name: chalk.dim( `⚙ Watch mode: ${watchLabel}` ), value: WATCH_CONFIG, short: 'Watch mode' },
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

                if ( choice === WATCH_CONFIG ) {
                    const pickedWatch = await select( {
                        message: 'Watch mode',
                        choices: [
                            { name: 'On (re-runs on file change)', value: true },
                            { name: 'Off (single run)', value: false },
                        ],
                        default: config.focusTest.watch,
                        loop: false,
                    } );
                    config.focusTest.watch = pickedWatch;
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

        await executeFocusTest( targetPath );
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
