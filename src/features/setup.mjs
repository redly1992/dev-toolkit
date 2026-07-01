import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { WORKSPACE_ROOT } from '../utils/runner.mjs';

const GITIGNORE_PATH = resolve( WORKSPACE_ROOT, '.gitignore' );

const GITIGNORE_BLOCK = `
# Dev Toolkit
dev-toolkit/node_modules/
`;

export function isSetupDone() {
    const gitignore = existsSync( GITIGNORE_PATH )
        ? readFileSync( GITIGNORE_PATH, 'utf8' )
        : '';

    return gitignore.includes( 'dev-toolkit/node_modules/' );
}

function patchGitignore() {
    const current = existsSync( GITIGNORE_PATH )
        ? readFileSync( GITIGNORE_PATH, 'utf8' )
        : '';

    if ( current.includes( 'dev-toolkit/node_modules/' ) ) return;

    writeFileSync( GITIGNORE_PATH, current + GITIGNORE_BLOCK, 'utf8' );
}

/** @type {import('../index.mjs').Feature} */
export default {
    name: 'Setup',
    description: 'Patch .gitignore in the workspace (run once)',

    async run() {
        if ( isSetupDone() ) {
            console.log( chalk.yellow( '\n  ⚠  Setup already applied to this workspace.\n' ) );
            const redo = await confirm( { message: 'Re-apply anyway?', default: false } );
            if ( !redo ) return;
        }

        console.log( chalk.cyan( '\n  This will modify .gitignore in the workspace:\n' ) );
        console.log( chalk.dim( `    • .gitignore — add dev-toolkit/node_modules/\n` ) );

        const ok = await confirm( { message: 'Proceed?', default: true } );
        if ( !ok ) return;

        patchGitignore();
        console.log( chalk.green( '  ✔ .gitignore patched' ) );
        console.log( chalk.bold.green( '\n  Setup complete! No angular.json changes needed — configs are applied at runtime.\n' ) );
    },
};
