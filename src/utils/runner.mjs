import { execa } from 'execa';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/** Absolute path to the Angular workspace root (parent of dev-toolkit/) */
export const WORKSPACE_ROOT = resolve( dirname( fileURLToPath( import.meta.url ) ), '../../../' );

/**
 * Run a command in the Angular workspace root with stdio inherited (so the
 * user sees live output and can interact with the process).
 *
 * @param {string}   cmd
 * @param {string[]} args
 * @param {Record<string,string>} [env]
 */
export async function runInWorkspace( cmd, args, env = {} ) {
    await execa( cmd, args, {
        cwd: WORKSPACE_ROOT,
        stdio: 'inherit',
        env: { ...process.env, ...env },
    } );
}
