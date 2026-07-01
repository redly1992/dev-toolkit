/**
 * Patch-run-restore utility for angular.json.
 *
 * Merges dev-toolkit/assets/angular-extensions.json into the workspace
 * angular.json before running the callback, then restores the original.
 *
 * The callback receives a `restore` function — call it as soon as Angular
 * has finished the initial build (ng serve / ng test only read angular.json
 * at startup, so restoring early is safe).
 *
 * Usage:
 *   await withAngularExtensions( restore => {
 *     const proc = execa('npx', ['ng', 'serve', ...]);
 *     proc.stdout.on('data', chunk => {
 *       if (chunk.includes('bundle generation complete')) restore();
 *       process.stdout.write(chunk);
 *     });
 *     return proc;
 *   });
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WORKSPACE_ROOT } from './runner.mjs';

const TOOLKIT_DIR  = resolve( dirname( fileURLToPath( import.meta.url ) ), '../../' );
const ANGULAR_JSON = resolve( WORKSPACE_ROOT, 'angular.json' );
const EXTENSIONS   = resolve( TOOLKIT_DIR, 'assets/angular-extensions.json' );

const BUILD_DONE_RE = /bundle generation complete/i;

function mergeConfigurations( target, additions ) {
    if ( !additions ) return;
    if ( !target.configurations ) target.configurations = {};
    Object.assign( target.configurations, additions );
}

export async function withAngularExtensions( fn ) {
    const original = readFileSync( ANGULAR_JSON, 'utf8' );
    let restored   = false;

    const restore = () => {
        if ( restored ) return;
        restored = true;
        writeFileSync( ANGULAR_JSON, original, 'utf8' );
    };

    // Trap Ctrl+C: restore before the process exits
    const onSigint = () => { restore(); process.exit( 0 ); };
    process.once( 'SIGINT', onSigint );

    try {
        const json = JSON.parse( original );
        const arch = json.projects.topicus.architect;
        const ext  = JSON.parse( readFileSync( EXTENSIONS, 'utf8' ) );

        mergeConfigurations( arch.build,        ext.build );
        mergeConfigurations( arch.serve,        ext.serve );
        mergeConfigurations( arch.test,         ext.test );
        if ( arch[ 'test-dev' ] ) mergeConfigurations( arch[ 'test-dev' ], ext[ 'test-dev' ] );

        writeFileSync( ANGULAR_JSON, JSON.stringify( json, null, 2 ) + '\n', 'utf8' );

        await fn( restore );
    } finally {
        process.off( 'SIGINT', onSigint );
        restore();
    }
}

/**
 * Spawn an ng command that pipes stdout, auto-restores angular.json once
 * "bundle generation complete" appears, then forwards all output to the
 * terminal for the lifetime of the process.
 */
export async function runNgWithExtensions( args, cwd ) {
    await withAngularExtensions( async ( restore ) => {
        const { execa } = await import( 'execa' );
        const proc = execa( 'npx', [ 'ng', ...args ], {
            cwd,
            stdio:    [ 'inherit', 'pipe', 'inherit' ],
            detached: false,
        } );

        const killChild = () => {
            try { process.kill( -proc.pid, 'SIGTERM' ); } catch { /* already dead */ }
            try { proc.kill( 'SIGTERM' ); } catch { /* already dead */ }
        };

        const onSigint = () => {
            killChild();
            // withAngularExtensions also has a SIGINT handler that restores + exits
        };
        process.once( 'SIGINT', onSigint );

        proc.stdout.on( 'data', ( chunk ) => {
            const text = chunk.toString();
            process.stdout.write( text );
            if ( BUILD_DONE_RE.test( text ) ) restore();
        } );

        try {
            await proc;
        } catch {
            // killed or test failures — output already shown
        } finally {
            process.off( 'SIGINT', onSigint );
        }
    } );
}
