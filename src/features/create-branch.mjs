import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { execa } from 'execa';
import { readConfig, writeConfig } from '../utils/config.mjs';
import { WORKSPACE_ROOT } from '../utils/runner.mjs';

function toKebab( str ) {
    return str
        .trim()
        .toLowerCase()
        .replace( /\s+/g, '-' )       // spaces → dashes
        .replace( /[^a-z0-9\-]/g, '' ) // strip non-alphanumeric (except dashes)
        .replace( /-{2,}/g, '-' );     // collapse multiple dashes
}

function buildBranchName( baseBranch, number, description ) {
    const suffix  = baseBranch.split( '/' ).pop(); // e.g. "09.07"
    const kebab   = toKebab( description );

    return `feature/EP-${number}-${kebab}-${suffix}`;
}

function git( args ) {
    return execa( 'git', args, { cwd: WORKSPACE_ROOT } );
}

/** @type {import('../index.mjs').Feature} */
export default {
    name: 'Create Branch',
    description: 'Fetch, create and checkout a new feature branch',

    async run() {
        const config = readConfig();

        if ( !config.createBranch ) config.createBranch = { baseBranch: '' };

        const savedBase = config.createBranch.baseBranch || '';

        // ── 1. Base branch ──────────────────────────────────────────────────
        const baseBranch = await input( {
            message: 'Base branch',
            default: savedBase || undefined,
            placeholder: 'e.g. origin/integration/09.07',
            validate( v ) {
                return v.trim().length > 0 ? true : 'Base branch is required.';
            },
        } );

        // Persist base branch
        config.createBranch.baseBranch = baseBranch.trim();
        writeConfig( config );

        // ── 2. Fetch ─────────────────────────────────────────────────────────
        console.log( chalk.dim( '\n  Fetching…' ) );
        try {
            await execa( 'git', [ 'fetch' ], { cwd: WORKSPACE_ROOT, stdio: 'inherit' } );
        } catch {
            console.error( chalk.red( '  ✖ git fetch failed. Check your network / remote.' ) );

            return;
        }

        // ── 3. Branch inputs ─────────────────────────────────────────────────
        const branchNumber = await input( {
            message: 'Branch number',
            placeholder: 'e.g. 125027',
            validate( v ) {
                return /^\d+$/.test( v.trim() ) ? true : 'Numbers only.';
            },
        } );

        const description = await input( {
            message: 'Description',
            placeholder: 'e.g. do some thing',
            validate( v ) {
                return v.trim().length > 0 ? true : 'Description is required.';
            },
        } );

        // ── 4. Preview & confirm ──────────────────────────────────────────────
        const branchName = buildBranchName( baseBranch.trim(), branchNumber.trim(), description.trim() );

        console.log( '' );
        console.log( `  Branch : ${chalk.bold.green( branchName )}` );
        console.log( `  From   : ${chalk.dim( baseBranch.trim() )}` );
        console.log( '' );

        const ok = await confirm( { message: 'Create and checkout?', default: true } );
        if ( !ok ) return;

        // ── 5. Create + checkout ──────────────────────────────────────────────
        try {
            await git( [ 'checkout', '-b', branchName, baseBranch.trim() ] );
            console.log( chalk.bold.green( `\n  ✔ Checked out: ${branchName}\n` ) );
        } catch ( err ) {
            console.error( chalk.red( `\n  ✖ ${err.stderr || err.message}\n` ) );
        }
    },
};
